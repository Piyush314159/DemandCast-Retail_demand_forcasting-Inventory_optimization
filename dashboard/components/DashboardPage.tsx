"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { generateForecastData, MODEL_METRICS, STORE_PERFORMANCE, CATEGORY_SALES } from "@/lib/mockData";

const forecastData = generateForecastData(60, 4200, 42).slice(0, 60);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-date">{label}</div>
      {payload.map((p: any) => (
        <div className="tooltip-item" key={p.dataKey}>
          <div className="tooltip-dot" style={{ background: p.color }} />
          <span className="tooltip-label">{p.name}</span>
          <span className="tooltip-value">{p.value?.toLocaleString() ?? "—"}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const kpis = [
    {
      label: "Total Weekly Sales",
      value: "€ 168.4K",
      change: "+8.2%",
      dir: "up",
      color: "teal",
      icon: "💰",
    },
    {
      label: "Forecast Accuracy",
      value: "92.9%",
      change: "+1.4%",
      dir: "up",
      color: "green",
      icon: "🎯",
    },
    {
      label: "WMAPE (LightGBM)",
      value: "7.1%",
      change: "-2.3%",
      dir: "up",
      color: "purple",
      icon: "📈",
    },
    {
      label: "Stockout Alerts",
      value: "2",
      change: "High urgency",
      dir: "down",
      color: "coral",
      icon: "⚠️",
    },
  ];

  return (
    <div className="page-content">
      {/* Page header */}
      <div className="page-header animate-in">
        <div>
          <h1 className="page-title">Overview Dashboard</h1>
          <p className="page-subtitle">
            Rossmann dataset · LightGBM Global Model · Updated today at 09:15
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <select className="select-input" id="dashboard-dataset-select">
            <option>Rossmann</option>
            <option>M5 Forecasting</option>
          </select>
          <select className="select-input" id="dashboard-period-select">
            <option>Last 60 Days</option>
            <option>Last 90 Days</option>
            <option>Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-4 animate-in animate-in-delay-1">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`kpi-card ${kpi.color}`}>
            <div className="kpi-label">{kpi.label}</div>
            <div className={`kpi-value ${kpi.color}`}>{kpi.value}</div>
            <div className={`kpi-change ${kpi.dir === "up" && kpi.color !== "coral" ? "up" : kpi.color === "coral" ? "down" : "up"}`}>
              {kpi.dir === "up" && kpi.color !== "coral" ? "▲" : "▼"} {kpi.change}
            </div>
            <div className="kpi-icon">{kpi.icon}</div>
          </div>
        ))}
      </div>

      {/* Main Chart + Model Metrics */}
      <div className="grid-2-1 animate-in animate-in-delay-2">
        {/* Forecast Chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon">〜</div>
              Sales Forecast — Actual vs Predicted
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <span className="badge badge-teal">Live</span>
              <select className="select-input" id="chart-store-select">
                <option>All Stores</option>
                <option>Store #42</option>
                <option>Store #17</option>
              </select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={forecastData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4b8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00d4b8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.08} />
                  <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#8892a4", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={9}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                tick={{ fill: "#8892a4", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}K`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "12px", color: "#8892a4" }}
                formatter={(value) =>
                  value === "actual" ? "Actual" : value === "predicted" ? "Predicted" : value
                }
              />
              <Area
                type="monotone"
                dataKey="upper"
                fill="url(#ciGrad)"
                stroke="none"
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="lower"
                fill="#060b18"
                stroke="none"
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#00d4b8"
                strokeWidth={2}
                fill="url(#actualGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#00d4b8" }}
                name="actual"
              />
              <Area
                type="monotone"
                dataKey="predicted"
                stroke="#6c5ce7"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#predGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#6c5ce7" }}
                name="predicted"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Model comparison */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon">⬡</div>
              Model Leaderboard
            </div>
          </div>
          {MODEL_METRICS.map((m) => (
            <div key={m.model} className="metric-row">
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                  {m.model}
                  {m.status === "best" && (
                    <span className="badge badge-teal" style={{ marginLeft: "8px", fontSize: "10px" }}>
                      BEST
                    </span>
                  )}
                </div>
                <div className="metric-bar-wrap" style={{ width: "100%" }}>
                  <div className="progress-bar" style={{ marginTop: "4px" }}>
                    <div
                      className={`progress-fill ${m.status === "best" ? "teal" : m.status === "good" ? "purple" : "coral"}`}
                      style={{ width: `${100 - m.wmape * 3}%` }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  className="metric-value"
                  style={{
                    color: m.status === "best"
                      ? "var(--accent-teal)"
                      : m.status === "good"
                      ? "var(--accent-purple)"
                      : "var(--text-secondary)",
                  }}
                >
                  {m.wmape}%
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>WMAPE</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Store Performance + Category Chart */}
      <div className="grid-2 animate-in animate-in-delay-3">
        {/* Store table */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon">🏪</div>
              Store Performance
            </div>
            <span className="badge badge-teal">Top 5</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Weekly Sales</th>
                <th>WMAPE</th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {STORE_PERFORMANCE.map((s) => (
                <tr key={s.store}>
                  <td style={{ fontWeight: 600 }}>{s.store}</td>
                  <td style={{ color: "var(--accent-teal)", fontFamily: "JetBrains Mono, monospace" }}>
                    €{s.sales.toLocaleString()}
                  </td>
                  <td>
                    <span
                      style={{
                        color: s.wmape < 8 ? "var(--accent-green)" : s.wmape < 10 ? "var(--accent-yellow)" : "var(--accent-coral)",
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 700,
                      }}
                    >
                      {s.wmape}%
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="progress-bar" style={{ width: "60px" }}>
                        <div
                          className="progress-fill teal"
                          style={{ width: `${s.accuracy}%` }}
                        />
                      </div>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {s.accuracy}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Category sales bar */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon">📊</div>
              Sales by Category
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={CATEGORY_SALES} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#8892a4", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`}
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fill: "#8892a4", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="sales" name="Sales" radius={[0, 4, 4, 0]}>
                {CATEGORY_SALES.map((_, i) => {
                  const colors = ["#00d4b8", "#6c5ce7", "#ff7675", "#4dabf7", "#51cf66"];
                  return <Cell key={i} fill={colors[i % colors.length]} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
            {CATEGORY_SALES.map((c, i) => {
              const colors = ["var(--accent-teal)", "var(--accent-purple)", "var(--accent-coral)", "var(--accent-blue)", "var(--accent-green)"];
              return (
                <div key={c.category} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: colors[i] }} />
                  <span style={{ color: "var(--text-secondary)" }}>{c.category}</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{c.share}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
