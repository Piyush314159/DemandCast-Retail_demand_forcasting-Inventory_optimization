"use client";

import { useState, useEffect } from "react";
import { PIPELINE_STAGES, MODEL_METRICS, PipelineStage } from "@/lib/mockData";

type StageStatus = "idle" | "running" | "completed" | "error";

const LOG_ENTRIES = [
  { type: "info", time: "09:12:04", text: "Loading Rossmann dataset from data/raw/" },
  { type: "success", time: "09:12:18", text: "Loaded 1,017,209 rows × 18 columns" },
  { type: "info", time: "09:14:02", text: "Building lag features: [7, 14, 28]" },
  { type: "info", time: "09:14:33", text: "Building rolling windows: [7, 14, 28, 90] — shift=1 to prevent leakage" },
  { type: "info", time: "09:15:11", text: "Encoding promo_interval with LabelEncoder" },
  { type: "success", time: "09:18:40", text: "Feature matrix: 867,432 rows × 47 features" },
  { type: "warn", time: "09:19:12", text: "3 stores missing state_holiday — filling with 'none'" },
  { type: "success", time: "09:19:45", text: "Baselines computed: Naive=18.2%, SARIMA=13.8%, Prophet=11.4%" },
];

export default function TrainingPage() {
  const [stages, setStages] = useState<PipelineStage[]>(PIPELINE_STAGES);
  const [logs, setLogs] = useState(LOG_ENTRIES);
  const [runningStage, setRunningStage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!runningStage) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [runningStage]);

  const runStage = (stageId: string) => {
    if (runningStage) return;
    setRunningStage(stageId);
    setElapsed(0);
    setStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, status: "running" as StageStatus } : s))
    );

    const stageName = stages.find((s) => s.id === stageId)?.name;

    setLogs((prev) => [
      ...prev,
      {
        type: "info",
        time: new Date().toLocaleTimeString("en-GB"),
        text: `Starting: ${stageName}`,
      },
    ]);

    // Simulate stage completion
    const duration = 3000 + Math.random() * 4000;
    setTimeout(() => {
      setStages((prev) =>
        prev.map((s) =>
          s.id === stageId
            ? { ...s, status: "completed" as StageStatus, duration: `${(duration / 1000).toFixed(0)}s`, lastRun: "Just now" }
            : s
        )
      );
      setLogs((prev) => [
        ...prev,
        {
          type: "success",
          time: new Date().toLocaleTimeString("en-GB"),
          text: `✓ ${stageName} completed successfully`,
        },
      ]);
      setRunningStage(null);
    }, duration);
  };

  const runAll = () => {
    const idleStages = stages.filter((s) => s.status === "idle");
    if (idleStages.length === 0 || runningStage) return;
    runStage(idleStages[0].id);
  };

  const resetAll = () => {
    if (runningStage) return;
    setStages(
      PIPELINE_STAGES.map((s) =>
        s.status === "completed" ? { ...s, status: "idle" as StageStatus } : s
      )
    );
    setLogs(LOG_ENTRIES);
  };

  const completedCount = stages.filter((s) => s.status === "completed").length;
  const totalProgress = (completedCount / stages.length) * 100;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header animate-in">
        <div>
          <h1 className="page-title">Pipeline Operator</h1>
          <p className="page-subtitle">
            Run, monitor, and control the demand forecasting training pipeline
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={resetAll}
            disabled={!!runningStage}
            id="reset-pipeline-btn"
          >
            ↺ Reset Idle
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={runAll}
            disabled={!!runningStage || stages.every((s) => s.status === "completed")}
            id="run-pipeline-btn"
          >
            ▶ Run Pipeline
          </button>
        </div>
      </div>

      {/* Overall progress */}
      <div className="card animate-in animate-in-delay-1">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600 }}>
            Pipeline Progress
            {runningStage && (
              <span className="badge badge-teal" style={{ marginLeft: "10px" }}>
                ⟳ Running — {elapsed}s
              </span>
            )}
          </div>
          <div style={{ fontSize: "14px", color: "var(--accent-teal)", fontWeight: 700 }}>
            {completedCount}/{stages.length} stages
          </div>
        </div>
        <div className="progress-bar" style={{ height: "8px" }}>
          <div className="progress-fill teal" style={{ width: `${totalProgress}%` }} />
        </div>
        <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
          {stages.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px" }}>
              <span
                style={{
                  color:
                    s.status === "completed"
                      ? "var(--accent-green)"
                      : s.status === "running"
                      ? "var(--accent-teal)"
                      : s.status === "error"
                      ? "var(--accent-coral)"
                      : "var(--text-muted)",
                }}
              >
                {s.status === "completed" ? "✓" : s.status === "running" ? "⟳" : s.status === "error" ? "✗" : "○"}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>{s.name.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline stages + log */}
      <div className="grid-2-1 animate-in animate-in-delay-2">
        {/* Stages */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {stages.map((stage) => (
            <div key={stage.id} className={`pipeline-stage ${stage.status}`}>
              <div className={`stage-icon-wrap ${stage.status}`}>
                {stage.status === "running" ? (
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                ) : stage.status === "completed" ? (
                  <span style={{ color: "var(--accent-green)" }}>✓</span>
                ) : stage.status === "error" ? (
                  <span style={{ color: "var(--accent-coral)" }}>✗</span>
                ) : (
                  stage.icon
                )}
              </div>
              <div className="stage-meta">
                <div className="stage-name">
                  {stage.name}
                  {stage.status === "completed" && (
                    <span className="badge badge-green" style={{ marginLeft: "8px", fontSize: "9px" }}>Done</span>
                  )}
                  {stage.status === "running" && (
                    <span className="badge badge-teal" style={{ marginLeft: "8px", fontSize: "9px" }}>Running</span>
                  )}
                </div>
                <div className="stage-desc">{stage.description}</div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                  {stage.module}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                {stage.duration && (
                  <span className="stage-duration">{stage.duration}</span>
                )}
                {stage.lastRun && (
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{stage.lastRun}</span>
                )}
                {stage.status === "idle" && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => runStage(stage.id)}
                    disabled={!!runningStage}
                    id={`run-stage-${stage.id}`}
                  >
                    ▶ Run
                  </button>
                )}
              </div>
            </div>
          ))}
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>

        {/* Log terminal + metrics */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card" style={{ padding: "16px" }}>
            <div className="card-header" style={{ marginBottom: "10px" }}>
              <div className="card-title" style={{ fontSize: "13px" }}>
                <div className="card-title-icon">⬛</div>
                Pipeline Logs
              </div>
              <span className="badge badge-teal" style={{ fontSize: "9px" }}>Live</span>
            </div>
            <div className="log-terminal">
              {logs.map((l, i) => (
                <div key={i} className="log-line">
                  <span className="log-time">{l.time}</span>
                  <span
                    className={
                      l.type === "success"
                        ? "log-success"
                        : l.type === "warn"
                        ? "log-warn"
                        : l.type === "error"
                        ? "log-error"
                        : "log-info"
                    }
                  >
                    [{l.type.toUpperCase()}]
                  </span>{" "}
                  <span className="log-text">{l.text}</span>
                </div>
              ))}
              {runningStage && (
                <div className="log-line">
                  <span className="log-time">{new Date().toLocaleTimeString("en-GB")}</span>
                  <span className="log-info">[INFO]</span>{" "}
                  <span className="log-text" style={{ color: "var(--accent-teal)" }}>
                    Processing... ({elapsed}s elapsed)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Hyperparams */}
          <div className="card" style={{ padding: "16px" }}>
            <div className="card-title" style={{ marginBottom: "12px" }}>
              <div className="card-title-icon">⚡</div>
              LightGBM Config
            </div>
            {[
              ["objective", "tweedie (power=1.1)"],
              ["num_leaves", "128"],
              ["learning_rate", "0.03"],
              ["n_estimators", "3,000"],
              ["feature_fraction", "0.80"],
              ["seed", "42"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "12px" }}>
                <span style={{ color: "var(--text-secondary)", fontFamily: "JetBrains Mono, monospace" }}>{k}</span>
                <span style={{ color: "var(--accent-teal)", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Model leaderboard */}
      <div className="card animate-in animate-in-delay-3">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">🏆</div>
            Model Evaluation Results
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>WMAPE ↓</th>
              <th>MAPE ↓</th>
              <th>RMSE ↓</th>
              <th>Bias</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_METRICS.map((m) => (
              <tr key={m.model}>
                <td style={{ fontWeight: 600 }}>{m.model}</td>
                <td>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 700,
                      color:
                        m.status === "best"
                          ? "var(--accent-teal)"
                          : m.status === "good"
                          ? "var(--accent-purple)"
                          : "var(--text-secondary)",
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
                <td>
                  <span
                    className={`badge ${
                      m.status === "best" ? "badge-teal" : m.status === "good" ? "badge-purple" : "badge-coral"
                    }`}
                  >
                    {m.status === "best" ? "✓ Champion" : m.status === "good" ? "Challenger" : "Baseline"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
