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
    content: "This is a simulated inventory demonstration. I can explain the example data; live forecasts and validated savings are not connected.",
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
                🎭 Demo Mode — Add OpenAI or Gemini key for AI-generated explanations of demo data
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

function getDemoResponse(_message: string): string {
  return "Demo: the catalogue and dashboard are simulated. No live pipeline is connected, no measured savings are established, and MinT is unavailable. Add an API key for explanations of demo data.";
}
