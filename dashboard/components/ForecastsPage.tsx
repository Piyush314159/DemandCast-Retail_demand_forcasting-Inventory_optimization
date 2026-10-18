"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { generateForecastData, SKU_DATA } from "@/lib/mockData";

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

export default function ForecastsPage() {
  const [selectedSku, setSelectedSku] = useState("SKU-001");
  const [showCI, setShowCI] = useState(true);
  const [horizon, setHorizon] = useState("28");

  const skuSeed = parseInt(selectedSku.split("-")[1]) * 17;
  const data = generateForecastData(90, 3200 + skuSeed * 30, skuSeed);
  const chartData = data.slice(0, 70 + parseInt(horizon));
  const splitIdx = 69;

  const sku = SKU_DATA.find((s) => s.id === selectedSku) || SKU_DATA[0];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header animate-in">
        <div>
          <h1 className="page-title">Forecast Explorer</h1>
          <p className="page-subtitle">
            SKU-level demand forecasting with confidence intervals · Rossmann Dataset
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Horizon:</label>
          <select
            className="select-input"
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            id="forecast-horizon-select"
          >
            <option value="14">14 days</option>
            <option value="28">28 days</option>
            <option value="42">42 days</option>
          </select>
          <button
            className={`btn ${showCI ? "btn-primary" : "btn-secondary"} btn-sm`}
            onClick={() => setShowCI((v) => !v)}
            id="toggle-confidence-interval"
          >
            {showCI ? "✓" : "○"} Confidence Interval
          </button>
        </div>
      </div>

      {/* SKU Selector Cards */}
      <div className="animate-in animate-in-delay-1" style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
        {SKU_DATA.map((s) => (
          <button
            key={s.id}
            id={`sku-select-${s.id}`}
            onClick={() => setSelectedSku(s.id)}
            style={{
              flexShrink: 0,
              padding: "10px 14px",
              background:
                selectedSku === s.id ? "var(--accent-teal-dim)" : "var(--bg-card)",
              border: `1px solid ${
                selectedSku === s.id
                  ? "var(--border-accent)"
                  : "var(--border-subtle)"
              }`,
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all var(--transition-base)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color:
                  selectedSku === s.id
                    ? "var(--accent-teal)"
                    : "var(--text-muted)",
                fontWeight: 600,
                marginBottom: "2px",
              }}
            >
              {s.id}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-primary)",
                fontWeight: 600,
                whiteSpace: "nowrap",
                maxWidth: "140px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {s.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <span
                className={`badge badge-${
                  s.stockoutRisk === "high"
                    ? "coral"
                    : s.stockoutRisk === "medium"
                    ? "blue"
                    : "green"
                }`}
                style={{ fontSize: "9px" }}
              >
                {s.stockoutRisk} risk
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Main forecast chart */}
      <div className="card animate-in animate-in-delay-2">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">〜</div>
            {sku.name} — {sku.store}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span className="badge badge-purple">LightGBM</span>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Accuracy: <strong style={{ color: "var(--accent-green)" }}>{sku.accuracy}%</strong>
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d4b8" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#00d4b8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ciFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.12} />
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
            <Legend wrapperStyle={{ fontSize: "12px", color: "#8892a4" }} />
            <ReferenceLine
              x={chartData[splitIdx]?.date}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 4"
              label={{ value: "Forecast →", fill: "#8892a4", fontSize: 10, position: "top" }}
            />
            {showCI && (
              <>
                <Area
                  type="monotone"
                  dataKey="upper"
                  name="Upper CI"
                  fill="url(#ciFill)"
                  stroke="none"
                  legendType="none"
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  name="Lower CI"
                  fill="#060b18"
                  stroke="none"
                  legendType="none"
                />
              </>
            )}
            <Area
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="#00d4b8"
              strokeWidth={2}
              fill="url(#actualFill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name="Predicted"
              stroke="#6c5ce7"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* SKU Detail Cards */}
      <div className="grid-4 animate-in animate-in-delay-3">
        <div className="kpi-card teal">
          <div className="kpi-label">Weekly Demand</div>
          <div className="kpi-value teal">{sku.weeklyDemand.toLocaleString()}</div>
          <div className="kpi-change neutral">units/week</div>
          <div className="kpi-icon">📦</div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-label">Forecast Accuracy</div>
          <div className="kpi-value purple">{sku.accuracy}%</div>
          <div className="kpi-change up">▲ Above avg</div>
          <div className="kpi-icon">🎯</div>
        </div>
        <div className={`kpi-card ${sku.stockoutRisk === "high" ? "coral" : sku.stockoutRisk === "medium" ? "blue" : "green"}`}>
          <div className="kpi-label">Stockout Risk</div>
          <div className={`kpi-value ${sku.stockoutRisk === "high" ? "coral" : sku.stockoutRisk === "medium" ? "blue" : "green"}`}>
            {sku.stockoutRisk.charAt(0).toUpperCase() + sku.stockoutRisk.slice(1)}
          </div>
          <div className="kpi-change neutral">{sku.stockoutRisk === "high" ? "Immediate action" : sku.stockoutRisk === "medium" ? "Monitor closely" : "Within limits"}</div>
          <div className="kpi-icon">⚠️</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-label">Safety Stock</div>
          <div className="kpi-value blue">{sku.safetyStock}</div>
          <div className="kpi-change neutral">units threshold</div>
          <div className="kpi-icon">🛡️</div>
        </div>
      </div>
    </div>
  );
}
