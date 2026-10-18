import { NextResponse } from "next/server";
import { AI_SYSTEM_PROMPT } from "@/lib/mockData";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, history = [], apiKey, stream = true } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // ── 1. Explicit Demo Mode ──────────────────────────────────────────────
    if (apiKey === "demo") {
      if (stream) {
        return createTextStreamResponse(getDemoResponse(message));
      }
      return NextResponse.json({
        content: getDemoResponse(message),
        provider: "demo",
      });
    }

    // Determine API key from client override or server environment
    const rawKey =
      apiKey ||
      process.env.OPENAI_API_KEY ||
      process.env.NEXT_PUBLIC_OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      "";

    const key = rawKey.trim();

    // Fallback to Demo Mode if key is empty
    if (!key) {
      if (stream) {
        return createTextStreamResponse(getDemoResponse(message));
      }
      return NextResponse.json({
        content: getDemoResponse(message),
        provider: "demo",
      });
    }

    // ── 2. OpenAI Provider (sk-...) ─────────────────────────────────────────
    if (key.startsWith("sk-")) {
      const formattedHistory = history
        .filter((m: { id?: string }) => m.id !== "init-1")
        .map((m: { role: string; content: string }) => ({
          role: m.role === "ai" || m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));

      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: AI_SYSTEM_PROMPT },
            ...formattedHistory,
            { role: "user", content: message },
          ],
          max_tokens: 800,
          temperature: 0.3,
          stream: true,
        }),
      });

      if (!openAiRes.ok) {
        const errorJson = await openAiRes.json().catch(() => null);
        const errMsg = errorJson?.error?.message || `OpenAI error ${openAiRes.status}`;
        return NextResponse.json({ error: errMsg, provider: "openai" }, { status: openAiRes.status });
      }

      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          const reader = openAiRes.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }
          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  const dataStr = trimmed.slice(6);
                  if (dataStr === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(dataStr);
                    const token = parsed?.choices?.[0]?.delta?.content;
                    if (token) {
                      controller.enqueue(encoder.encode(token));
                    }
                  } catch {
                    // Ignore parse errors on chunk boundaries
                  }
                }
              }
            }
          } catch (err) {
            controller.error(err);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(customStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    // ── 3. Google Gemini Provider (AIza... / AQ... / default) ───────────────
    const historyForGemini = history
      .filter((m: { id?: string }) => m.id !== "init-1")
      .map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));

    const geminiBody = {
      system_instruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
      contents: [
        ...historyForGemini,
        { role: "user", parts: [{ text: message }] },
      ],
      generationConfig: {
        maxOutputTokens: 900,
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse&key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );

    if (!geminiRes.ok) {
      const errorJson = await geminiRes.json().catch(() => null);
      const errMsg =
        errorJson?.error?.message || `Google Gemini error ${geminiRes.status}`;
      return NextResponse.json({ error: errMsg, provider: "gemini" }, { status: geminiRes.status });
    }

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        const reader = geminiRes.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                const dataStr = trimmed.slice(6);
                if (dataStr === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(dataStr);
                  const token = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (token) {
                    controller.enqueue(encoder.encode(token));
                  }
                } catch {
                  // Ignore JSON parse errors for split chunk frames
                }
              }
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function createTextStreamResponse(text: string) {
  const encoder = new TextEncoder();
  const words = text.split(" ");
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < words.length; i++) {
        const word = (i === 0 ? "" : " ") + words[i];
        controller.enqueue(encoder.encode(word));
        await new Promise((r) => setTimeout(r, 15));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

function getDemoResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.includes("sku-004") || q.includes("egg") || q.includes("stockout")) {
    return "### 🚨 SKU-004 (Free-Range Eggs 12pk) — Critical Stockout Diagnosis\n\n• **Store:** Store #08 | **Category:** Dairy\n• **Current Stock:** **45 units** vs **Safety Stock of 150 units**\n• **Reorder Point (ROP):** **200 units**\n• **Weekly Demand:** **960 units** (~**137 units/day**)\n• **Stockout Probability:** **87% (HIGH)**\n• **Depletion Runway:** **~0.33 days (8 hours remaining)**\n\n**Action Plan:** Trigger an emergency expedited PO for **350 units** to recover baseline buffer and avoid total morning stockout.";
  }

  if (q.includes("wmape") || q.includes("mape") || q.includes("metric")) {
    return "### 📐 WMAPE vs MAPE in Retail Forecasting\n\n• **WMAPE (Weighted MAPE):** `Σ|Actual - Pred| / Σ|Actual| * 100`\n  - Weights errors by sales volume. A 10-unit error on eggs (high sales) is penalized more than on slow-moving gourmet items.\n  - **Our LightGBM score:** **7.1%** ✅\n\n• **MAPE (Mean Absolute Percentage Error):** `Mean(|Actual - Pred| / Actual) * 100`\n  - Equal weight per item. Low sales (e.g. 1 unit sold vs 2 predicted) skew the metric to 100% error.\n  - **Our LightGBM score:** **6.8%**\n\n**Verdict:** WMAPE is the industry gold standard for supply chains because inventory dollars correlate directly with volume.";
  }

  if (q.includes("lightgbm") || q.includes("prophet") || q.includes("compare") || q.includes("model")) {
    return "### ⚡ Model Benchmark Leaderboard\n\n1. **LightGBM Global:** **WMAPE 7.1%** | RMSE 482 | Train Time 4m 38s\n   - *Why it wins:* Single global model trained on all 1,115 stores; captures cross-series patterns; Tweedie deviance loss handles zero sales.\n2. **Prophet:** **WMAPE 11.4%** | RMSE 720 | Train Time 18m 02s\n   - *Limitation:* Per-series additive GAM; cannot capture cross-store interactions.\n3. **SARIMA(1,1,1)(1,1,1)[7]:** **WMAPE 13.8%** | RMSE 895\n   - *Limitation:* Univariate only, strictly linear.\n4. **Seasonal Naive:** **WMAPE 18.6%** (Baseline)\n\n**Business Value:** LightGBM achieves **38.2% cost reduction**, saving ~$18,400/month.";
  }

  if (q.includes("mint") || q.includes("reconcil") || q.includes("hierarch")) {
    return "### 🔗 Hierarchical Reconciliation: Bottom-Up vs MinT\n\n• **Bottom-Up (Current):** Forecasts generated at SKU level and simply summed up to Store and Region. Preserves granular accuracy but aggregates noise upward.\n• **MinT (Minimum Trace):** Optimal generalized least-squares reconciliation. Weights series inversely by historical forecast error covariance. Down-weights volatile SKUs.\n\n**Recommendation:** Switch to MinT if aggregate regional error exceeds 5% — it typically trims aggregate WMAPE by 15-25%.";
  }

  if (q.includes("feature") || q.includes("important")) {
    return "### ⚙️ Top LightGBM Features by SHAP Gain\n\n1. **sales_lag_7 (28.4%):** Prior week same-day sales. 7-day cyclical demand is dominant.\n2. **sales_roll_mean_28 (21.1%):** 28-day trailing average (shifted 1 day to prevent leakage).\n3. **day_of_week (16.8%):** Saturday demand surges +35%.\n4. **promo_flag (12.3%):** Promotions cause +30% to +40% volume spikes.\n5. **sales_lag_14 (9.2%):** Bi-weekly replenishment cycles.\n6. **days_to_holiday (7.6%):** Pre-holiday pantry stocking.";
  }

  return "I have full visibility into the DemandCast forecast pipeline, SKU inventory catalog, and model benchmarks! Ask me about specific SKU risks (e.g. SKU-004, SKU-007), store accuracy comparison, feature importances, or safety stock formulas.";
}
