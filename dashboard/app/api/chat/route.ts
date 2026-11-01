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

function getDemoResponse(message: string): string {
  const q = message.toLowerCase();
  if (q.includes("mint") || q.includes("reconcil")) {
    return "Demo: the Python pipeline supports bottom-up aggregation. MinT is not implemented. The reconciliation screen is an illustrative design; it does not establish MinT gains.";
  }
  if (["metric", "wmape", "benchmark", "model", "saving", "cost"].some((word) => q.includes(word))) {
    return "Demo: dashboard figures are illustrative. For recomputed saved-output metrics, run python -m src.evaluation.audit_saved_predictions and inspect reports/saved_prediction_audit.json. Different forecast origins prevent a controlled model ranking. Training times and inventory savings have not been substantiated.";
  }
  return "Demo: I can explain the simulated catalogue and inventory formulas. No live inventory or forecasting tools are connected. Add an API key for generated explanations of the same simulated data; a key does not connect the pipeline. Reorder quantities require validated demand, lead time, and inventory-policy inputs.";
}
