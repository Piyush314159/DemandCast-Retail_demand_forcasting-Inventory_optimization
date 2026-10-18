"use client";

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { MODEL_METRICS, STORE_PERFORMANCE } from "@/lib/mockData";

const COST_DATA = [
  { week: "W14", savings: 4200, stockout: 1800, overstock: 920 },
  { week: "W15", savings: 5100, stockout: 1400, overstock: 840 },
  { week: "W16", savings: 4800, stockout: 1600, overstock: 780 },
  { week: "W17", savings: 6200, stockout: 1100, overstock: 650 },
  { week: "W18", savings: 7400, stockout: 900, overstock: 590 },
  { week: "W19", savings: 6800, stockout: 1200, overstock: 720 },
  { week: "W20", savings: 8100, stockout: 700, overstock: 480 },
];

const RADAR_DATA = [
  { metric: "Accuracy", lgbm: 92.9, prophet: 88.6, sarima: 86.2 },
  { metric: "Speed", lgbm: 85, prophet: 60, sarima: 45 },
  { metric: "Scalability", lgbm: 95, prophet: 55, sarima: 35 },
  { metric: "Interpretability", lgbm: 70, prophet: 80, sarima: 85 },
  { metric: "Promo Handling", lgbm: 90, prophet: 72, sarima: 40 },
  { metric: "Holiday Support", lgbm: 85, prophet: 92, sarima: 60 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-date">{label}</div>
      {payload.map((p: any) => (
        <div className="tooltip-item" key={p.dataKey}>
          <div className="tooltip-dot" style={{ background: p.stroke || p.fill }} />
          <span className="tooltip-label">{p.name}</span>
          <span className="tooltip-value">€{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function ReportsPage() {
  const totalSavings = COST_DATA.reduce((s, w) => s + w.savings, 0);
  const avgWmape = MODEL_METRICS[0].wmape;
  const improvement = (((18.2 - avgWmape) / 18.2) * 100).toFixed(1);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header animate-in">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">
            Comprehensive model evaluation, cost impact analysis, and performance benchmarks
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn btn-secondary btn-sm" id="export-report-btn">
            ⬇ Export PDF
          </button>
          <button className="btn btn-primary btn-sm" id="generate-report-btn">
            ⟳ Generate Report
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid-4 animate-in animate-in-delay-1">
        <div className="kpi-card teal">
          <div className="kpi-label">7-Week Cost Savings</div>
          <div className="kpi-value teal">€{totalSavings.toLocaleString()}</div>
          <div className="kpi-change up">▲ vs naive baseline</div>
          <div className="kpi-icon">💰</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-label">WMAPE Improvement</div>
          <div className="kpi-value purple">{improvement}%</div>
          <div className="kpi-change up">▲ vs seasonal naive</div>
          <div className="kpi-icon">📉</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Best Model WMAPE</div>
          <div className="kpi-value green">{avgWmape}%</div>
          <div className="kpi-change up">▲ LightGBM Global</div>
          <div className="kpi-icon">🏆</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-label">Training Samples</div>
          <div className="kpi-value blue">867K</div>
          <div className="kpi-change neutral">after feature engineering</div>
          <div className="kpi-icon">📊</div>
        </div>
      </div>

      {/* Cost impact chart + radar */}
      <div className="grid-2 animate-in animate-in-delay-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon">💰</div>
              Cost Impact Analysis
            </div>
            <span className="badge badge-teal">Weekly</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={COST_DATA} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="week" tick={{ fill: "#8892a4", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#8892a4", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(1)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#8892a4" }} />
              <Line type="monotone" dataKey="savings" name="Savings" stroke="#00d4b8" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="stockout" name="Stockout Cost" stroke="#ff7675" strokeWidth={2} strokeDasharray="4 2" dot={false} />
              <Line type="monotone" dataKey="overstock" name="Overstock Cost" stroke="#4dabf7" strokeWidth={2} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon">🕸️</div>
              Model Capability Radar
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={RADAR_DATA}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#8892a4", fontSize: 10 }} />
              <Radar name="LightGBM" dataKey="lgbm" stroke="#00d4b8" fill="#00d4b8" fillOpacity={0.15} strokeWidth={2} />
              <Radar name="Prophet" dataKey="prophet" stroke="#6c5ce7" fill="#6c5ce7" fillOpacity={0.1} strokeWidth={2} />
              <Radar name="SARIMA" dataKey="sarima" stroke="#ff7675" fill="#ff7675" fillOpacity={0.1} strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#8892a4" }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full metrics table */}
      <div className="card animate-in animate-in-delay-3">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">📋</div>
            Full Evaluation Metrics
          </div>
          <span className="badge badge-purple">Test Set · 2015-07-18 → 2015-08-14</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>WMAPE</th>
              <th>MAPE</th>
              <th>RMSE</th>
              <th>Bias</th>
              <th>Training Time</th>
              <th>Rank</th>
            </tr>
          </thead>
          <tbody>
            {[
              { ...MODEL_METRICS[0], trainTime: "12m 34s", rank: 1 },
              { ...MODEL_METRICS[1], trainTime: "41m 02s", rank: 2 },
              { ...MODEL_METRICS[2], trainTime: "1h 18m", rank: 3 },
              { ...MODEL_METRICS[3], trainTime: "0m 02s", rank: 4 },
            ].map((m) => (
              <tr key={m.model}>
                <td style={{ fontWeight: 600 }}>{m.model}</td>
                <td>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 700,
                      color: m.rank === 1 ? "var(--accent-teal)" : m.rank === 2 ? "var(--accent-purple)" : "var(--text-secondary)",
                    }}
                  >
                    {m.wmape}%
                  </span>
                </td>
                <td style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)" }}>{m.mape}%</td>
                <td style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text-secondary)" }}>{m.rmse}</td>
                <td
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    color: Math.abs(m.bias) < 1 ? "var(--accent-green)" : "var(--accent-yellow)",
                  }}
                >
                  {m.bias > 0 ? "+" : ""}{m.bias}%
                </td>
                <td style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>{m.trainTime}</td>
                <td>
                  <span
                    className={`badge ${m.rank === 1 ? "badge-teal" : m.rank === 2 ? "badge-purple" : "badge-coral"}`}
                    style={{ fontSize: "10px" }}
                  >
                    #{m.rank}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Store breakdown */}
      <div className="card animate-in animate-in-delay-4">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">🏪</div>
            Store-Level Performance Breakdown
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {STORE_PERFORMANCE.map((s) => (
            <div
              key={s.store}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "12px 16px",
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ width: "80px", fontWeight: 600, fontSize: "13px" }}>{s.store}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px", color: "var(--text-secondary)" }}>
                  <span>WMAPE</span>
                  <span style={{ color: s.wmape < 8 ? "var(--accent-green)" : s.wmape < 10 ? "var(--accent-yellow)" : "var(--accent-coral)", fontWeight: 700 }}>
                    {s.wmape}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${s.wmape < 8 ? "teal" : s.wmape < 10 ? "purple" : "coral"}`}
                    style={{ width: `${s.accuracy}%` }}
                  />
                </div>
              </div>
              <div style={{ width: "80px", textAlign: "right", fontSize: "13px", color: "var(--accent-teal)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                €{s.sales.toLocaleString()}
              </div>
              <div style={{ width: "60px", textAlign: "right", fontSize: "12px", color: "var(--text-secondary)" }}>
                {s.orders} orders
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
