"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AI_SYSTEM_PROMPT, AI_SUGGESTIONS } from "@/lib/mockData";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  time: string;
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "init-1",
    role: "ai",
    content:
      "👋 Hi! I'm **DemandAI**, your intelligent forecasting assistant. I can help you:\n\n• Understand model metrics & forecast accuracy\n• Diagnose stockout and overstock risks\n• Explain hierarchical reconciliation\n• Recommend inventory actions\n\nWhat would you like to explore today?",
    time: formatTime(new Date()),
  },
];

export default function AIChatPanel({ isOpen, onClose, apiKey }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        time: formatTime(new Date()),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsThinking(true);

      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history: messages,
            apiKey: apiKey?.trim() || undefined,
            stream: true,
          }),
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          throw new Error(data?.error || `API error (${resp.status})`);
        }

        const contentType = resp.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const data = await resp.json();
          const aiMsg: Message = {
            id: `ai-${Date.now()}`,
            role: "ai",
            content: data.content || "I couldn't generate a response. Please try again.",
            time: formatTime(new Date()),
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else {
          const reader = resp.body?.getReader();
          if (!reader) {
            throw new Error("Unable to open response stream.");
          }

          const decoder = new TextDecoder();
          const aiMsgId = `ai-${Date.now()}`;
          let accumulated = "";

          setMessages((prev) => [
            ...prev,
            { id: aiMsgId, role: "ai", content: "", time: formatTime(new Date()) },
          ]);
          setIsThinking(false);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            accumulated += chunk;
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: accumulated } : m))
            );
          }
        }
      } catch (err: unknown) {
        console.error(err);
        const errMsgText =
          err instanceof Error
            ? err.message
            : "Encountered an error reaching the AI service.";
        const errMsg: Message = {
          id: `err-${Date.now()}`,
          role: "ai",
          content: `⚠️ **AI Service Alert:** ${errMsgText}\n\nYou can click 🔑 in the top bar to check your API key, or switch back to **Demo Mode**.`,
          time: formatTime(new Date()),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsThinking(false);
      }
    },
    [apiKey, isThinking, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <aside className={`ai-panel ${isOpen ? "" : "hidden"}`} id="ai-chat-panel">
      {/* Header */}
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <div className="ai-avatar">🤖</div>
          <div>
            <div>DemandAI</div>
            <div className="ai-status">Online</div>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={onClose}
          title="Close AI panel"
          id="close-ai-panel"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="ai-messages" id="ai-messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-bubble">
              <FormattedMessage content={msg.content} />
            </div>
            <div className="message-time" suppressHydrationWarning>
              {msg.time}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="message ai">
            <div className="thinking-dots">
              <div className="thinking-dot" />
              <div className="thinking-dot" />
              <div className="thinking-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="ai-input-area">
        <div className="ai-suggestions">
          {AI_SUGGESTIONS.slice(0, 3).map((s) => (
            <button
              key={s}
              className="suggestion-chip"
              onClick={() => sendMessage(s)}
              id={`suggestion-${s.slice(0, 20).replace(/\s/g, "-")}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ai-input-row">
          <textarea
            ref={inputRef}
            className="ai-input"
            placeholder="Ask about forecasts, metrics, inventory..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            id="ai-chat-input"
          />
          <button
            className="ai-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isThinking}
            id="ai-send-button"
            title="Send message"
          >
            ➤
          </button>
        </div>
        {(() => {
          const cleanKey = apiKey?.trim();
          if (!cleanKey || cleanKey === "demo") {
            return (
              <p
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  marginTop: "6px",
                  textAlign: "center",
                }}
              >
                🎭 Demo Mode — Add OpenAI or Gemini key for live AI
              </p>
            );
          }
          if (cleanKey.startsWith("sk-")) {
            return (
              <p
                style={{
                  fontSize: "10px",
                  color: "var(--accent-teal)",
                  marginTop: "6px",
                  textAlign: "center",
                }}
              >
                ✓ Connected to OpenAI (GPT-4o mini)
              </p>
            );
          }
          if (cleanKey.startsWith("AIza") || cleanKey.startsWith("AQ.")) {
            return (
              <p
                style={{
                  fontSize: "10px",
                  color: "var(--accent-teal)",
                  marginTop: "6px",
                  textAlign: "center",
                }}
              >
                ✓ Connected to Gemini 3.8 Flash
              </p>
            );
          }
          return (
            <p
              style={{
                fontSize: "10px",
                color: "var(--accent-teal)",
                marginTop: "6px",
                textAlign: "center",
              }}
            >
              ✓ Connected to Gemini 3.8 Flash
            </p>
          );
        })()}
      </div>
    </aside>
  );
}

function cleanMathAndLatex(text: string): string {
  if (!text) return "";
  return text
    // Replace $$...$$ or $...$ blocks
    .replace(/\$\$(.*?)\$\$/g, "$1")
    .replace(/\$(.*?)\$/g, "$1")
    // Replace common LaTeX commands
    .replace(/\\text\{([^}]+)\}/g, "$1")
    .replace(/\\bar\{([^}]+)\}/g, "$1")
    .replace(/\\sigma_d/g, "Demand Volatility")
    .replace(/\\sigma/g, "StdDev")
    .replace(/\\times/g, "×")
    .replace(/\\approx/g, "≈")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\to/g, "→")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1 / $2)")
    // Strip stray backslashes
    .replace(/\\([a-zA-Z]+)/g, "$1");
}

function FormattedMessage({ content }: { content: string }) {
  const sanitized = cleanMathAndLatex(content);
  const rawLines = sanitized.split("\n");

  // Group table lines
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];

  const flushTable = (key: string) => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer
      .map((r) =>
        r
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      )
      .filter((r) => r.length > 0 && !r.every((c) => /^[-:]+$/.test(c)));

    if (rows.length > 0) {
      const headerRow = rows[0];
      const bodyRows = rows.slice(1);
      elements.push(
        <div key={`table-${key}`} className="ai-table-wrap">
          <table className="ai-table">
            <thead>
              <tr>
                {headerRow.map((h, hIdx) => (
                  <th key={hIdx}>{formatInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{formatInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    tableBuffer = [];
  };

  rawLines.forEach((line, i) => {
    const trimmed = line.trim();

    // Table line detector
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      tableBuffer.push(trimmed);
      return;
    } else if (tableBuffer.length > 0) {
      flushTable(`flush-${i}`);
    }

    // Dividers
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      elements.push(<div key={`div-${i}`} className="ai-divider" />);
      return;
    }

    // Headings (### or ## or #)
    if (trimmed.startsWith("### ")) {
      elements.push(
        <div key={`h3-${i}`} className="ai-heading">
          {formatInline(trimmed.slice(4))}
        </div>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <div key={`h2-${i}`} className="ai-heading" style={{ fontSize: "14px" }}>
          {formatInline(trimmed.slice(3))}
        </div>
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <div key={`h1-${i}`} className="ai-heading" style={{ fontSize: "15px" }}>
          {formatInline(trimmed.slice(2))}
        </div>
      );
      return;
    }

    // Bullet points (•, -, *, or numbered list)
    const bulletMatch = trimmed.match(/^([•\-\*]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      elements.push(
        <div key={`bullet-${i}`} className="ai-bullet">
          <span className="ai-bullet-dot">•</span>
          <div>{formatInline(bulletMatch[2])}</div>
        </div>
      );
      return;
    }

    // Empty space
    if (trimmed === "") {
      elements.push(<div key={`space-${i}`} style={{ height: "6px" }} />);
      return;
    }

    // Regular paragraph
    elements.push(
      <div key={`p-${i}`} style={{ marginBottom: "3px", lineHeight: "1.45" }}>
        {formatInline(trimmed)}
      </div>
    );
  });

  if (tableBuffer.length > 0) {
    flushTable("final");
  }

  return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
  if (!text) return null;

  // Split by bold (**...**) and inline code (`...`)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <span key={i} className="ai-code-pill">
          {part.slice(1, -1)}
        </span>
      );
    }
    return part;
  });
}

// ─── Demo mode responses ──────────────────────────────────────────────────────

function getDemoResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.includes("sku-004") || q.includes("egg") || q.includes("stockout")) {
    return "**SKU-004 (Free-Range Eggs)** is at **87% stockout probability** because:\n\n• Current stock: 45 units\n• Safety stock threshold: 150 units\n• Weekly forecast demand: 960 units\n• Reorder point (200 units) is 4.4× current stock\n\n**Recommended action:** Place an emergency reorder of at least 350 units immediately. Consider increasing safety stock to 200 units given high demand volatility (WMAPE ~14% for this SKU).";
  }

  if (q.includes("wmape") || q.includes("mape") || q.includes("metric")) {
    return "Great question! Here's the difference:\n\n**WMAPE** (Weighted Mean Absolute Percentage Error)\n• Weights errors by actual sales volume\n• More forgiving on low-volume SKUs\n• Formula: Σ|actual−pred| / Σ|actual|\n• Our LightGBM: **7.1%** ✅\n\n**MAPE** (Mean Absolute Percentage Error)\n• Simple average of percentage errors\n• Can be distorted by near-zero actuals\n• Our LightGBM: **6.8%**\n\nWMAPE is preferred for retail because high-volume SKUs matter more to the business.";
  }

  if (q.includes("lightgbm") || q.includes("prophet") || q.includes("compare") || q.includes("model")) {
    return "**Model Comparison Summary:**\n\n• **LightGBM** (7.1% WMAPE) — Best performer. Captures non-linear interactions between promotions, lags, and calendar features. Trains on all stores simultaneously as a global model.\n\n• **Prophet** (11.4% WMAPE) — Strong for trend + seasonality but struggles with promotional spikes. Per-series training is slow at scale.\n\n• **SARIMA** (13.8% WMAPE) — Good statistical baseline but can't leverage cross-series patterns or rich feature sets.\n\n**Verdict:** LightGBM wins by ~37% better WMAPE than the next best model.";
  }

  if (q.includes("mint") || q.includes("reconcil") || q.includes("hierarch")) {
    return "**Hierarchical Reconciliation** ensures SKU-level forecasts sum correctly to store and regional totals.\n\n**Bottom-Up (current):**\n• Forecast at SKU level → aggregate up\n• Simple, preserves base-level detail\n• No modification to bottom forecasts\n\n**MinT (Minimum Trace):**\n• Jointly adjusts ALL levels simultaneously\n• Minimizes total forecast error variance\n• Uses in-sample residual covariance as weights\n• More statistically optimal but computationally heavier\n\n**Recommendation:** Switch to MinT if your store-level aggregation errors exceed 5% — it typically reduces aggregate WMAPE by 15-25%.";
  }

  if (q.includes("feature") || q.includes("important")) {
    return "**Top LightGBM Feature Importances** (by SHAP gain):\n\n• **sales_lag_7** — 28.4% importance. Prior week same-day is the strongest signal.\n• **rolling_mean_28** — 21.1%. Monthly trend captures medium-term patterns.\n• **day_of_week** — 16.8%. Weekend uplift (Sat +35%) is massive.\n• **promo_flag** — 12.3%. Promotional events drive 30-40% demand spikes.\n• **sales_lag_14** — 9.2%. Two-week periodicity effect.\n• **days_to_holiday** — 7.6%. Pre-holiday buying behavior.\n\nThe model relies heavily on **lag features**, confirming strong autocorrelation in retail sales.";
  }

  if (q.includes("reorder") || q.includes("safety stock")) {
    return "**Reorder Point Calculation** for Eggs (SKU-004):\n\n```\nROP = (avg_daily_demand × lead_time) + safety_stock\nROP = (137 × 1.5 days) + 150 = 356 units\n```\n\n**Safety Stock Formula (service level 95%):**\n```\nSS = z × σ_demand × √lead_time\nSS = 1.645 × 42 × √1.5 ≈ 85 units\n```\n\n**Current safety stock (150) seems adequate**, but current inventory (45) is critically below ROP. Reorder immediately with a quantity of **315 units** to reach optimal position.";
  }

  if (q.includes("overstock") || q.includes("butter") || q.includes("yogurt")) {
    return "**Overstock Alert** — SKU-005 (Yogurt) & SKU-007 (Butter):\n\n• SKU-007 Butter: 890 units vs 780/week demand → **14 days excess**\n  - Estimated holding cost: ~$420/week\n  - Action: Pause orders for 2 weeks, consider markdown promotion\n\n• SKU-005 Yogurt: 520 units vs 580/week demand → **6 days excess**  \n  - Estimated holding cost: ~$95/week\n  - Action: Reduce next order by 40%\n\n**Combined overstock cost:** ~$515/week. A modest 10% markdown on butter would clear excess in 8 days.";
  }

  // Fallback
  return "I can help you analyze your demand forecasting pipeline! Some things I can assist with:\n\n• **Forecast accuracy** — interpreting WMAPE, RMSE, bias\n• **Stockout/overstock risk** — specific SKU recommendations\n• **Model comparison** — LightGBM vs Prophet vs SARIMA\n• **Pipeline stages** — troubleshooting training runs\n• **Inventory optimization** — reorder points, safety stock\n\nTry asking me about a specific SKU or metric!";
}
