"use client";

import { useState } from "react";
import { INVENTORY_DATA, InventoryItem } from "@/lib/mockData";

type FilterType = "all" | "reorder" | "ok" | "overstock";

export default function InventoryPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<"stockoutProb" | "overstockProb" | "sku">("stockoutProb");

  const filtered = INVENTORY_DATA.filter((item) =>
    filter === "all" ? true : item.action === filter
  ).sort((a, b) => {
    if (sortBy === "sku") return a.sku.localeCompare(b.sku);
    return b[sortBy] - a[sortBy];
  });

  const counts = {
    reorder: INVENTORY_DATA.filter((i) => i.action === "reorder").length,
    ok: INVENTORY_DATA.filter((i) => i.action === "ok").length,
    overstock: INVENTORY_DATA.filter((i) => i.action === "overstock").length,
  };

  const totalStockoutCost = INVENTORY_DATA.filter((i) => i.action === "reorder").length * 1240;
  const totalOverstockCost = INVENTORY_DATA.filter((i) => i.action === "overstock").reduce(
    (s) => s + 340,
    0
  );

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header animate-in">
        <div>
          <h1 className="page-title">Inventory Intelligence</h1>
          <p className="page-subtitle">
            AI-driven reorder alerts, safety stock optimization, and risk assessment
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <select
            className="select-input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            id="inventory-sort-select"
          >
            <option value="stockoutProb">Sort: Stockout Risk</option>
            <option value="overstockProb">Sort: Overstock Risk</option>
            <option value="sku">Sort: SKU ID</option>
          </select>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid-4 animate-in animate-in-delay-1">
        <div className="kpi-card coral">
          <div className="kpi-label">Stockout Alerts</div>
          <div className="kpi-value coral">{counts.reorder}</div>
          <div className="kpi-change down">▼ Immediate reorder needed</div>
          <div className="kpi-icon">🚨</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Healthy Stock</div>
          <div className="kpi-value green">{counts.ok}</div>
          <div className="kpi-change up">▲ Within target range</div>
          <div className="kpi-icon">✅</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-label">Overstock Alerts</div>
          <div className="kpi-value blue">{counts.overstock}</div>
          <div className="kpi-change neutral">↓ Pause or markdown</div>
          <div className="kpi-icon">📦</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-label">Est. Weekly Cost Risk</div>
          <div className="kpi-value purple">€{(totalStockoutCost + totalOverstockCost).toLocaleString()}</div>
          <div className="kpi-change down">▼ Opportunity to save</div>
          <div className="kpi-icon">💸</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="animate-in animate-in-delay-2" style={{ display: "flex", gap: "8px" }}>
        {(["all", "reorder", "ok", "overstock"] as const).map((f) => (
          <button
            key={f}
            className={`tab-item ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
            id={`inventory-filter-${f}`}
          >
            {f === "all" && "🔍 All SKUs"}
            {f === "reorder" && `🚨 Reorder (${counts.reorder})`}
            {f === "ok" && `✅ Healthy (${counts.ok})`}
            {f === "overstock" && `📦 Overstock (${counts.overstock})`}
          </button>
        ))}
      </div>

      {/* Inventory table */}
      <div className="card animate-in animate-in-delay-3">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">📦</div>
            Inventory Status — {filtered.length} SKUs
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Store</th>
                <th>Current Stock</th>
                <th>Safety Stock</th>
                <th>Forecast Demand</th>
                <th>Stockout Risk</th>
                <th>Overstock Risk</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.sku}>
                  <td>
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "12px",
                        color: "var(--accent-teal)",
                        fontWeight: 600,
                      }}
                    >
                      {item.sku}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500, maxWidth: "160px" }}>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{item.store}</td>
                  <td>
                    <span
                      style={{
                        color:
                          item.currentStock < item.safetyStock
                            ? "var(--accent-coral)"
                            : "var(--text-primary)",
                        fontWeight: 700,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {item.currentStock}
                    </span>
                  </td>
                  <td
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {item.safetyStock}
                  </td>
                  <td
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      color: "var(--accent-purple)",
                    }}
                  >
                    {item.forecastDemand}/wk
                  </td>
                  <td>
                    <RiskBar value={item.stockoutProb} type="stockout" />
                  </td>
                  <td>
                    <RiskBar value={item.overstockProb} type="overstock" />
                  </td>
                  <td>
                    <ActionBadge action={item.action} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Stock Calculator */}
      <div className="card animate-in animate-in-delay-4" style={{ padding: "24px" }}>
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">🛡️</div>
            Safety Stock Calculator
          </div>
          <span className="badge badge-purple">Formula Reference</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              SERVICE LEVEL 95% (Z=1.645)
            </div>
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-md)",
                padding: "12px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "12px",
                color: "var(--accent-teal)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              SS = Z × σ_demand × √lead_time
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              REORDER POINT
            </div>
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-md)",
                padding: "12px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "12px",
                color: "var(--accent-purple)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              ROP = avg_daily × lead_time + SS
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              ORDER QUANTITY
            </div>
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-md)",
                padding: "12px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "12px",
                color: "var(--accent-coral)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              EOQ = √(2 × D × S / H)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskBar({ value, type }: { value: number; type: "stockout" | "overstock" }) {
  const color =
    value > 70
      ? "var(--accent-coral)"
      : value > 40
      ? "var(--accent-yellow)"
      : "var(--accent-green)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          width: "60px",
          height: "6px",
          background: "var(--bg-surface)",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${value}%`,
            background: color,
            borderRadius: "3px",
            transition: "width 0.8s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: "12px",
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 700,
          color,
        }}
      >
        {value}%
      </span>
    </div>
  );
}

function ActionBadge({ action }: { action: InventoryItem["action"] }) {
  if (action === "reorder")
    return <span className="badge badge-coral">🚨 Reorder Now</span>;
  if (action === "overstock")
    return <span className="badge badge-blue">📦 Overstock</span>;
  return <span className="badge badge-green">✅ Healthy</span>;
}
