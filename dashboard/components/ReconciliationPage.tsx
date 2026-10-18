"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { REGIONAL_DATA } from "@/lib/mockData";

const HIERARCHY = [
  {
    level: "Region",
    icon: "🌍",
    color: "var(--accent-teal)",
    nodes: [
      { id: "north", name: "North Region", wmape: 6.2, sales: 198400 },
      { id: "south", name: "South Region", wmape: 7.8, sales: 161800 },
      { id: "east", name: "East Region", wmape: 7.1, sales: 184100 },
      { id: "west", name: "West Region", wmape: 8.4, sales: 148500 },
    ],
  },
  {
    level: "Store",
    icon: "🏪",
    color: "var(--accent-purple)",
    nodes: [
      { id: "s42", name: "Store #42 (North)", wmape: 6.8, sales: 48200 },
      { id: "s17", name: "Store #17 (East)", wmape: 7.4, sales: 39100 },
      { id: "s08", name: "Store #08 (South)", wmape: 8.1, sales: 31600 },
      { id: "s29", name: "Store #29 (West)", wmape: 9.2, sales: 27300 },
      { id: "s55", name: "Store #55 (West)", wmape: 10.5, sales: 21800 },
    ],
  },
  {
    level: "SKU",
    icon: "📦",
    color: "var(--accent-coral)",
    nodes: [
      { id: "sku1", name: "Organic Whole Milk 1L", wmape: 5.8, sales: 12400 },
      { id: "sku2", name: "Artisan Sourdough Loaf", wmape: 11.3, sales: 8200 },
      { id: "sku3", name: "Premium OJ 2L", wmape: 6.4, sales: 10900 },
      { id: "sku4", name: "Free-Range Eggs (12pk)", wmape: 13.8, sales: 9600 },
    ],
  },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-date">Week {label}</div>
      {payload.map((p: any) => (
        <div className="tooltip-item" key={p.dataKey}>
          <div className="tooltip-dot" style={{ background: p.fill }} />
          <span className="tooltip-label">{p.name}</span>
          <span className="tooltip-value">€{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function ReconciliationPage() {
  const [method, setMethod] = useState<"bottom_up" | "mint">("bottom_up");
  const [expandedLevel, setExpandedLevel] = useState<string | null>("Region");

  const methods = [
    {
      id: "bottom_up",
      name: "Bottom-Up",
      desc: "Aggregate SKU-level forecasts upward by summation. Simple and preserves base-level detail.",
      pros: ["Simple to implement", "No modification to base forecasts", "Computationally cheap"],
      cons: ["Doesn't use information from higher levels", "Aggregate errors can compound"],
      wmape_improvement: "—",
    },
    {
      id: "mint",
      name: "MinT (Diagonal WLS)",
      desc: "Jointly adjusts all levels. Weights series inversely to their in-sample residual variance.",
      pros: ["Statistically optimal", "Leverages all hierarchy levels", "Reduces aggregate error"],
      cons: ["Requires residual covariance estimate", "More computationally intensive"],
      wmape_improvement: "~18% better",
    },
  ];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header animate-in">
        <div>
          <h1 className="page-title">Hierarchical Reconciliation</h1>
          <p className="page-subtitle">
            Ensure SKU → Store → Region forecasts are consistent and additive
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {(["bottom_up", "mint"] as const).map((m) => (
            <button
              key={m}
              className={`btn btn-sm ${method === m ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMethod(m)}
              id={`recon-method-${m}`}
            >
              {m === "bottom_up" ? "⬆ Bottom-Up" : "⚖ MinT"}
            </button>
          ))}
        </div>
      </div>

      {/* Method description */}
      <div className="grid-2 animate-in animate-in-delay-1">
        {methods.map((m) => (
          <div
            key={m.id}
            className="card"
            style={{
              border: method === m.id ? "1px solid var(--border-accent)" : "1px solid var(--border-subtle)",
              background: method === m.id ? "var(--accent-teal-dim)" : "var(--bg-card)",
            }}
          >
            <div className="card-header">
              <div className="card-title">
                {method === m.id && <span style={{ color: "var(--accent-teal)" }}>✓ </span>}
                {m.name}
                {m.id === "mint" && <span className="badge badge-purple" style={{ marginLeft: "8px", fontSize: "9px" }}>Advanced</span>}
              </div>
              {m.id === "mint" && (
                <span className="badge badge-green" style={{ fontSize: "10px" }}>
                  {m.wmape_improvement}
                </span>
              )}
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>{m.desc}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent-green)", marginBottom: "4px" }}>PROS</div>
                {m.pros.map((p) => (
                  <div key={p} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>
                    ✓ {p}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent-coral)", marginBottom: "4px" }}>CONS</div>
                {m.cons.map((c) => (
                  <div key={c} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>
                    ✗ {c}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Hierarchy tree */}
      <div className="card animate-in animate-in-delay-2">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">⧉</div>
            Forecast Hierarchy
          </div>
          <span className="badge badge-teal">{method === "bottom_up" ? "Bottom-Up" : "MinT"} Active</span>
        </div>

        {HIERARCHY.map((level, li) => (
          <div key={level.level}>
            {li > 0 && <div className="hierarchy-connector" />}
            <button
              style={{
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                marginBottom: "8px",
              }}
              onClick={() =>
                setExpandedLevel(expandedLevel === level.level ? null : level.level)
              }
              id={`expand-level-${level.level}`}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 0",
                }}
              >
                <span style={{ fontSize: "16px" }}>{level.icon}</span>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: level.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                  }}
                >
                  {level.level} Level
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    marginLeft: "4px",
                  }}
                >
                  ({level.nodes.length} series)
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  {expandedLevel === level.level ? "▲" : "▼"}
                </span>
              </div>
            </button>

            {expandedLevel === level.level && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px", paddingLeft: "24px" }}>
                {level.nodes.map((node) => (
                  <div key={node.id} className="hierarchy-node">
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        background: `${level.color}20`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        flexShrink: 0,
                      }}
                    >
                      {level.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {node.name}
                      </div>
                      <div style={{ display: "flex", gap: "16px", marginTop: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        <span>
                          Sales:{" "}
                          <strong style={{ color: "var(--accent-teal)" }}>
                            €{node.sales.toLocaleString()}
                          </strong>
                        </span>
                        <span>
                          WMAPE:{" "}
                          <strong
                            style={{
                              color:
                                node.wmape < 7
                                  ? "var(--accent-green)"
                                  : node.wmape < 10
                                  ? "var(--accent-yellow)"
                                  : "var(--accent-coral)",
                            }}
                          >
                            {node.wmape}%
                          </strong>
                        </span>
                      </div>
                    </div>
                    <div className="progress-bar" style={{ width: "80px" }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${100 - node.wmape * 4}%`,
                          background: level.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Regional stacked bar */}
      <div className="card animate-in animate-in-delay-3">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">📊</div>
            Regional Sales — Weekly Reconciled Forecasts
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={REGIONAL_DATA} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: "#8892a4", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#8892a4", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px", color: "#8892a4" }} />
            <Bar dataKey="north" name="North" fill="#00d4b8" stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="east" name="East" fill="#6c5ce7" stackId="a" />
            <Bar dataKey="south" name="South" fill="#4dabf7" stackId="a" />
            <Bar dataKey="west" name="West" fill="#ff7675" stackId="a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
