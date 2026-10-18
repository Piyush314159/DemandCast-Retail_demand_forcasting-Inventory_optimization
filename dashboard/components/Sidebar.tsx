"use client";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAIToggle: () => void;
  aiOpen: boolean;
}

const NAV_ITEMS = [
  { id: "dashboard", icon: "⬡", label: "Dashboard" },
  { id: "forecasts", icon: "〜", label: "Forecasts" },
  { id: "training", icon: "⚡", label: "Model Training" },
  { id: "reconciliation", icon: "⧉", label: "Reconciliation" },
  { id: "inventory", icon: "📦", label: "Inventory" },
  { id: "reports", icon: "📋", label: "Reports" },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  onAIToggle,
  aiOpen,
}: SidebarProps) {
  return (
    <nav className="sidebar" id="main-sidebar">
      {/* Logo */}
      <div className="sidebar-logo" title="DemandCast">
        📊
      </div>

      {/* Nav items */}
      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? "active" : ""}`}
            onClick={() => onTabChange(item.id)}
            id={`nav-${item.id}`}
            title={item.label}
          >
            <span style={{ fontSize: "18px" }}>{item.icon}</span>
            <span className="nav-tooltip">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        <button
          className={`nav-item ${aiOpen ? "active" : ""}`}
          onClick={onAIToggle}
          id="nav-ai"
          title="AI Assistant"
        >
          🤖
          <span className="nav-tooltip">AI Assistant</span>
        </button>
        <button
          className="nav-item"
          id="nav-settings"
          title="Settings"
          onClick={() => {}}
        >
          ⚙
          <span className="nav-tooltip">Settings</span>
        </button>
      </div>
    </nav>
  );
}
