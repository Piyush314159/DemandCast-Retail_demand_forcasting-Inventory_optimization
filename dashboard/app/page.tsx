"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import AIChatPanel from "@/components/AIChatPanel";
import DashboardPage from "@/components/DashboardPage";
import ForecastsPage from "@/components/ForecastsPage";
import TrainingPage from "@/components/TrainingPage";
import ReconciliationPage from "@/components/ReconciliationPage";
import InventoryPage from "@/components/InventoryPage";
import ReportsPage from "@/components/ReportsPage";

type Tab = "dashboard" | "forecasts" | "training" | "reconciliation" | "inventory" | "reports";

const PAGE_TITLES: Record<Tab, string> = {
  dashboard: "Dashboard",
  forecasts: "Forecasts",
  training: "Model Training",
  reconciliation: "Reconciliation",
  inventory: "Inventory",
  reports: "Reports",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [aiOpen, setAiOpen] = useState(true);
  // Auto-load from .env.local (OpenAI or Gemini), fallback to demo mode
  const initialApiKey =
    process.env.NEXT_PUBLIC_OPENAI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_AI_API_KEY ||
    "demo";
  const [apiKey, setApiKey] = useState<string>(initialApiKey.trim());
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as Tab);
  };

  const contentStyle: React.CSSProperties = {
    marginRight: aiOpen ? "var(--ai-panel-width)" : "0",
    transition: "margin-right 400ms ease",
  };

  return (
    <>
      {/* API Key Modal */}
      {showApiModal && (
        <div className="modal-overlay" onClick={() => setShowApiModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} id="api-key-modal">
            <div className="modal-title">🔑 Configure AI Assistant</div>
            <p className="modal-desc">
              Enter your <strong>Google Gemini API key</strong> (<code>AQ...</code> or <code>AIza...</code>) or{" "}
              <strong>OpenAI API key</strong> (<code>sk-...</code>) to enable live AI responses.
              <br /><br />
              • Gemini (Free):{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-teal)" }}
              >
                aistudio.google.com
              </a>
              <br />
              • OpenAI:{" "}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-teal)" }}
              >
                platform.openai.com
              </a>
              <br /><br />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Keys stored in <code>.env.local</code> are kept strictly private on your machine and never committed to git.
              </span>
            </p>
            <input
              type="password"
              className="modal-input"
              placeholder="AQ... or AIza... or sk-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              id="api-key-input"
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setApiKey(apiKeyInput.trim() || "demo");
                  setShowApiModal(false);
                }}
                id="save-api-key-btn"
                style={{ flex: 1 }}
              >
                ✓ Save & Connect
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setApiKey("demo");
                  setShowApiModal(false);
                }}
                id="use-demo-mode-btn"
              >
                Use Demo
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="app-shell">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onAIToggle={() => setAiOpen((v) => !v)}
          aiOpen={aiOpen}
        />

        {/* Main content area */}
        <div className="main-area" style={contentStyle}>
          {/* Top header */}
          <header className="top-header">
            <div className="header-left">
              <div className="header-brand">
                <div className="brand-dot" />
                DemandCast
              </div>
              <div className="breadcrumb">
                <span>Platform</span>
                <span className="breadcrumb-sep">›</span>
                <span className="breadcrumb-current">{PAGE_TITLES[activeTab]}</span>
              </div>
            </div>

            <div className="header-right">
              <div className="header-badge">Rossmann · LightGBM</div>
              <button
                className="icon-btn"
                onClick={() => setShowApiModal(true)}
                id="configure-ai-btn"
                title="Configure AI key"
              >
                🔑
              </button>
              <button className="icon-btn" title="Notifications" id="notifications-btn">
                🔔
                <div className="notif-dot" />
              </button>
              <button
                className="ai-toggle-btn"
                onClick={() => setAiOpen((v) => !v)}
                id="toggle-ai-sidebar"
              >
                🤖 {aiOpen ? "Hide" : "Show"} AI
              </button>
            </div>
          </header>

          {/* Page content */}
          {activeTab === "dashboard" && <DashboardPage />}
          {activeTab === "forecasts" && <ForecastsPage />}
          {activeTab === "training" && <TrainingPage />}
          {activeTab === "reconciliation" && <ReconciliationPage />}
          {activeTab === "inventory" && <InventoryPage />}
          {activeTab === "reports" && <ReportsPage />}
        </div>

        {/* AI Chat Panel */}
        <AIChatPanel
          isOpen={aiOpen}
          onClose={() => setAiOpen(false)}
          apiKey={apiKey}
        />
      </div>
    </>
  );
}
