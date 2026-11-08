"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  Layers3,
  LoaderCircle,
  Menu,
  Network,
  Package,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store as StoreIcon,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Model, Point, Workspace } from "@/lib/workspace";

type Tab =
  "overview" | "forecasts" | "models" | "inventory" | "data" | "reports";
const navigation = [
  { id: "overview" as Tab, label: "Overview", icon: Layers3 },
  { id: "forecasts" as Tab, label: "Forecast explorer", icon: TrendingUp },
  { id: "models" as Tab, label: "Model lab", icon: Network },
  { id: "inventory" as Tab, label: "Inventory planner", icon: Package },
  { id: "data" as Tab, label: "Data health", icon: ShieldCheck },
  { id: "reports" as Tab, label: "Reports & exports", icon: FileText },
];
const number = (v: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v);
const compact = (v: number) =>
  new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v);
const percent = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);
const date = (v: string) =>
  new Date(`${v.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
function download(content: string, name: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportPoints(points: Point[], model: string, store: string) {
  download(
    [
      "date,actual_sales,forecast_sales,model,store",
      ...points.map(
        (p) => `${p.date},${p.actual},${p.forecast},${model},${store}`,
      ),
    ].join("\n"),
    `demandcast-${model}-${store}.csv`,
  );
}
function TrendChart({
  points,
  baseline,
  currency = true,
}: {
  points: Point[];
  baseline?: Point[];
  currency?: boolean;
}) {
  const data = points.map((p) => ({
    ...p,
    baseline: baseline?.find((b) => b.date === p.date)?.forecast,
  }));
  return (
    <div
      className="forecast-chart"
      role="img"
      aria-label="Actual sales and model forecast by date"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={data}
          margin={{ top: 18, right: 12, left: 4, bottom: 6 }}
        >
          <defs>
            <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.075} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="#e5eaf0"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={38}
            tick={{
              fontSize: 11,
              fill: "#788595",
              fontFamily: "IBM Plex Mono, monospace",
            }}
            tickFormatter={(v) =>
              new Date(`${v}T12:00:00Z`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })
            }
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={65}
            tick={{
              fontSize: 11,
              fill: "#788595",
              fontFamily: "IBM Plex Mono, monospace",
            }}
            tickFormatter={(v) => `${currency ? "€" : ""}${compact(v)}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 2,
              border: "1px solid #dce3ed",
              fontSize: 12,
              boxShadow: "0 8px 28px #172c1510",
            }}
            labelFormatter={(v) => date(String(v))}
            formatter={(v) => [`${currency ? "€" : ""}${number(Number(v))}`]}
          />
          <Area
            type="linear"
            dataKey="actual"
            name="Actual sales"
            stroke="#205dc9"
            strokeWidth={2.5}
            fill="url(#sales-fill)"
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="forecast"
            name="Model forecast"
            stroke="#dc843f"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
          {baseline && (
            <Line
              type="linear"
              dataKey="baseline"
              name="Seasonal baseline"
              stroke="#91a0b3"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
function SectionTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function ModelBadge({ model }: { model: Model }) {
  return (
    <span className={`tag ${model.id === "gru" ? "tag-green" : "tag-neutral"}`}>
      {model.id === "gru" && <Network size={12} />}
      {model.id === "gru" ? "Attention GRU" : model.name}
    </span>
  );
}

export default function ForecastWorkspace() {
  const [tab, setTab] = useState<Tab>("overview");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modelId, setModelId] = useState("gru");
  const [store, setStore] = useState("all");
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [thinking, setThinking] = useState(false);
  const [storeSeries, setStoreSeries] = useState<{
    modelId: string;
    storeId: string;
    points: Point[];
    baseline?: Point[];
  } | null>(null);
  const [storeError, setStoreError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const dialogOpen = assistantOpen || helpOpen;
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssistantOpen(false);
        setHelpOpen(false);
      }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [dialogOpen]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to load forecasts");
      setWorkspace(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load forecasts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const model =
    workspace?.models.find((m) => m.id === modelId) || workspace?.models[0];
  const baseline = workspace?.models.find((m) => m.id === "gru_baseline");
  const selected = model?.stores.find((s) => s.id === store);
  const activeSeries =
    storeSeries?.modelId === model?.id && storeSeries?.storeId === store
      ? storeSeries
      : null;
  const points = selected ? activeSeries?.points || [] : model?.points || [];
  useEffect(() => {
    if (!model || !selected) return;
    const controller = new AbortController();
    setStoreError("");
    setStoreSeries(null);
    const params = new URLSearchParams({ model: model.id, store: selected.id });
    fetch(`/api/workspace?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setStoreSeries(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setStoreError(
            error.message || "Unable to read this store's forecast.",
          );
      });
    return () => controller.abort();
  }, [model?.id, selected?.id, workspace?.exportedAt]);
  const currency = workspace?.dataset === "rossmann";
  const storeRows = useMemo(
    () =>
      model?.stores
        .filter((s) => `store ${s.id}`.includes(query.toLowerCase()))
        .sort((a, b) => (b.wmape ?? -1) - (a.wmape ?? -1)) || [],
    [model, query],
  );
  const navigate = (next: Tab) => {
    setTab(next);
    setMobileNav(false);
    setQuery("");
    window.scrollTo({ top: 0 });
  };
  const ask = async (message: string) => {
    if (!message.trim() || thinking) return;
    setThinking(true);
    setAnswer("");
    setAssistantInput(message);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, stream: false }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setAnswer(body.content);
    } catch {
      setAnswer("The workspace guide is unavailable. Please try again.");
    } finally {
      setThinking(false);
    }
  };
  const matchedBase =
    store === "all" ? baseline?.points : activeSeries?.baseline;

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <div className="desk-masthead">
        <header className="workspace-header">
          <a className="wordmark" href="/" aria-label="DemandCast home">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            Demand<span>Cast</span>
            <sup>DC / 01</sup>
          </a>
          <span className="brand-caption">
            RETAIL DEMAND
            <br />
            INTELLIGENCE PLATFORM
          </span>
          <div className="header-actions">
            <span className="desk-source">
              <span className="status-dot" />
              {workspace?.dataset === "m5" ? "M5" : "ROSSMANN"}
              <span className="source-separator">/</span>RESEARCH DATA
            </span>
            <button
              className="icon-button"
              onClick={() => setHelpOpen(true)}
              aria-label="Workspace guide"
              title="Workspace guide"
            >
              <BookOpen size={17} />
            </button>
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label="Refresh forecast data"
              title="Refresh forecast data"
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? "spinning" : ""} />
            </button>
            <button
              className="guide-trigger"
              onClick={() => setAssistantOpen(true)}
            >
              <Sparkles size={15} />
              Ask workspace
              <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
      </div>
      <div className="navigation-wrap">
        <div className="desk-toolbar">
          <button
            className="mobile-menu"
            aria-label={mobileNav ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNav}
            aria-controls="desk-navigation"
            onClick={() => setMobileNav((value) => !value)}
          >
            <Menu size={18} />
            {navigation.find((n) => n.id === tab)?.label}
            <ChevronDown size={14} />
          </button>
          <nav
            id="desk-navigation"
            className={`desk-navigation ${mobileNav ? "is-open" : ""}`}
            aria-label="Main navigation"
          >
            {navigation.map(({ id, label }, index) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={`nav-link ${tab === id ? "is-active" : ""}`}
                aria-current={tab === id ? "page" : undefined}
              >
                <span className="nav-index" aria-hidden="true">
                  0{index + 1}
                </span>
                <span>{label}</span>
                {id === "models" && (
                  <span className="nav-new" aria-hidden="true">
                    RNN
                  </span>
                )}
              </button>
            ))}
          </nav>
          <span className="desk-edition">
            FORECAST DESK <span>/</span> RESEARCH EDITION
          </span>
        </div>
      </div>
      <div className="workspace-main">
        <main id="workspace-content" className="workspace-content">
          {error && (
            <div className="error-banner" role="alert">
              <Activity size={18} />
              <div>
                <strong>Forecast data unavailable</strong>
                <p>{error}</p>
              </div>
              <button className="button" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          )}
          {loading && (
            <div className="loading-state" role="status">
              <LoaderCircle size={26} className="spinning" />
              <h2>Opening your workspace</h2>
              <p>Reading saved pipeline results…</p>
            </div>
          )}
          {!loading && workspace && model && (
            <>
              {tab === "overview" && (
                <>
                  <SectionTitle
                    eyebrow="01 / PLANNING OVERVIEW"
                    title="Demand intelligence."
                    description="Forecasts, model evidence, and the decisions that follow."
                  >
                    <button
                      className="button button-primary"
                      onClick={() =>
                        exportPoints(model.points, model.id, "all")
                      }
                    >
                      <ArrowDownToLine size={15} />
                      Export forecast
                    </button>
                  </SectionTitle>
                  <div className="context-strip">
                    <span>
                      <Database size={14} />
                      <strong>
                        {workspace.dataset === "m5" ? "M5" : "Rossmann"}
                      </strong>{" "}
                      retail dataset
                    </span>
                    <span>
                      <span className="tiny-divider" />
                      {date(model.start)} — {date(model.end)}
                    </span>
                    <ModelBadge model={model} />
                    <span className="context-note">Historical backtest</span>
                  </div>
                  {!["gru", "gru_baseline"].includes(model.id) && (
                    <ArtifactNote model={model} />
                  )}
                  <div className="metric-grid">
                    <Metric
                      label="Forecast sales"
                      value={`${currency ? "€" : ""}${compact(model.forecast)}`}
                      detail={`Across ${number(model.stores.length)} stores · ${model.points.length} days`}
                      icon={<TrendingUp size={17} />}
                      spark={model.points.map((p) => p.forecast)}
                    />
                    <Metric
                      label="Forecast error"
                      value={percent(model.wmape)}
                      detail="Weighted absolute percentage error"
                      icon={<Activity size={17} />}
                      spark={model.points.map((p) =>
                        Math.abs(p.forecast - p.actual),
                      )}
                      amber
                    />
                    <Metric
                      label="Actual sales"
                      value={`${currency ? "€" : ""}${compact(model.actual)}`}
                      detail={
                        currency
                          ? "Observed revenue in the test window"
                          : "Observed unit sales in the test window"
                      }
                      icon={<BarChart3 size={17} />}
                      spark={model.points.map((p) => p.actual)}
                    />
                    <Metric
                      label="Stores evaluated"
                      value={number(model.stores.length)}
                      detail={`${number(workspace.storeCount)} stores in the source dataset`}
                      icon={<StoreIcon size={17} />}
                      spark={workspace.history.slice(-14).map((p) => p.actual)}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel main-chart-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            <span className="section-index">01</span>Actuals vs.
                            forecast
                          </h2>
                          <p>
                            Daily sales revenue · aggregate across the store
                            network
                          </p>
                        </div>
                        <select
                          aria-label="Chart model"
                          value={model.id}
                          onChange={(e) => {
                            setModelId(e.target.value);
                            setStore("all");
                          }}
                        >
                          {workspace.models
                            .filter((m) => m.id !== "gru_baseline")
                            .map((m) => (
                              <option value={m.id} key={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="chart-meta">
                        <span className="chart-unit">{workspace.unit}</span>
                        <div className="chart-legend">
                          <span>
                            <i className="legend-actual" />
                            Actual sales
                          </span>
                          <span>
                            <i className="legend-forecast" />
                            Forecast
                          </span>
                        </div>
                      </div>
                      <TrendChart points={model.points} currency={currency} />
                      <div className="chart-footer">
                        <span>
                          <span className="status-dot" />
                          {number(model.observations)} observed sales records
                        </span>
                        <button
                          className="text-button"
                          onClick={() => navigate("forecasts")}
                        >
                          Explore forecasts
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </section>
                    <section className="forecast-brief">
                      <div className="brief-heading">
                        <span className="eyebrow">02 / MODEL BRIEF</span>
                        <Network size={18} />
                      </div>
                      <h2>
                        A recurrent view
                        <br />
                        of retail demand.
                      </h2>
                      <p>
                        Attention GRU reads the sales history and forecasts the
                        whole evaluation window at once.
                      </p>
                      {workspace.backtest ? (
                        <>
                          <div className="brief-comparison">
                            <span className="brief-caption">
                              MATCHED FORECAST ERROR <span>WMAPE ↓</span>
                            </span>
                            <div className="comparison-row">
                              <div>
                                <span>
                                  <i className="comparison-key" />
                                  Attention GRU
                                </span>
                                <strong>
                                  {percent(
                                    workspace.backtest.metrics.gru
                                      .wmape_percent,
                                  )}
                                </strong>
                              </div>
                              <span className="comparison-track">
                                <i
                                  style={{
                                    width: `${Math.min(100, (workspace.backtest.metrics.gru.wmape_percent / Math.max(workspace.backtest.metrics.gru.wmape_percent, workspace.backtest.metrics.seasonal_naive.wmape_percent, 1)) * 100)}%`,
                                  }}
                                />
                              </span>
                            </div>
                            <div className="comparison-row baseline-row">
                              <div>
                                <span>
                                  <i className="comparison-key" />
                                  Seasonal baseline
                                </span>
                                <strong>
                                  {percent(
                                    workspace.backtest.metrics.seasonal_naive
                                      .wmape_percent,
                                  )}
                                </strong>
                              </div>
                              <span className="comparison-track">
                                <i
                                  style={{
                                    width: `${Math.min(100, (workspace.backtest.metrics.seasonal_naive.wmape_percent / Math.max(workspace.backtest.metrics.gru.wmape_percent, workspace.backtest.metrics.seasonal_naive.wmape_percent, 1)) * 100)}%`,
                                  }}
                                />
                              </span>
                            </div>
                          </div>
                          <div className="brief-window">
                            <div>
                              <strong>
                                {workspace.backtest.lookback}
                                <small>D</small>
                              </strong>
                              <span>HISTORY</span>
                            </div>
                            <ArrowRight size={21} />
                            <div>
                              <strong>
                                {workspace.backtest.horizon}
                                <small>D</small>
                              </strong>
                              <span>FORECAST</span>
                            </div>
                            <span className="brief-model">
                              GRU
                              <br />+ attention
                            </span>
                          </div>
                          <p className="brief-footnote">
                            <CircleHelp size={13} />
                            One historical origin. Broader validation remains
                            necessary.
                          </p>
                        </>
                      ) : (
                        <div className="brief-empty">
                          <CircleHelp size={17} />
                          <p>
                            No recurrent-model evaluation has been exported yet.
                          </p>
                        </div>
                      )}
                      <button
                        className="brief-link"
                        onClick={() => navigate("models")}
                      >
                        Review model evidence
                        <ArrowUpRight size={16} />
                      </button>
                    </section>
                  </div>
                  <div className="lower-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            <span className="section-index">03</span>Store
                            exceptions
                          </h2>
                          <p>Highest forecast error · selected model</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("forecasts")}
                        >
                          View all
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      <StoreTable
                        rows={storeRows.slice(0, 5)}
                        currency={currency}
                        onSelect={(id) => {
                          setStore(id);
                          navigate("forecasts");
                        }}
                      />
                    </section>
                    <section className="panel notes-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            <span className="section-index">04</span>Before you
                            act
                          </h2>
                          <p>Read the evidence in its operating context.</p>
                        </div>
                        <CircleHelp size={17} />
                      </div>
                      <ContextItem
                        icon={<ShieldCheck size={17} />}
                        title="Compare like for like"
                        text="The GRU and its seasonal baseline use the same forecast date and evaluation window."
                      />
                      <ContextItem
                        icon={<Database size={17} />}
                        title="Work from traceable outputs"
                        text="Charts come from saved SQL predictions. Refresh the snapshot after a pipeline run."
                      />
                      <ContextItem
                        icon={<Package size={17} />}
                        title="Keep revenue and units separate"
                        text="This dataset measures store sales. Unit-level inventory planning needs additional inputs."
                      />
                    </section>
                  </div>
                </>
              )}
              {tab === "forecasts" && (
                <>
                  <SectionTitle
                    eyebrow="FORECAST EXPLORER"
                    title="Forecast explorer."
                    description="Inspect the whole network or look closer at an individual store."
                  >
                    <button
                      className="button"
                      onClick={() => exportPoints(points, model.id, store)}
                      disabled={!!selected && !activeSeries}
                    >
                      <ArrowDownToLine size={15} />
                      Export selection
                    </button>
                  </SectionTitle>
                  <div className="filter-bar">
                    <label>
                      <SlidersHorizontal size={15} />
                      Model
                      <select
                        aria-label="Model"
                        value={model.id}
                        onChange={(e) => {
                          setModelId(e.target.value);
                          setStore("all");
                        }}
                      >
                        {workspace.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Store
                      <select
                        aria-label="Store"
                        value={selected ? store : "all"}
                        onChange={(e) => setStore(e.target.value)}
                      >
                        <option value="all">All stores</option>
                        {model.stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            Store {s.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="filter-note">{model.protocol}</span>
                  </div>
                  {!["gru", "gru_baseline"].includes(model.id) && (
                    <ArtifactNote model={model} />
                  )}
                  <div className="metric-grid three">
                    <Metric
                      label="Forecast sales"
                      value={`${currency ? "€" : ""}${compact((selected || model).forecast)}`}
                      detail={
                        selected ? `Store ${store}` : "All evaluated stores"
                      }
                    />
                    <Metric
                      label="Forecast error · WMAPE"
                      value={percent((selected || model).wmape)}
                      detail="Lower is better"
                    />
                    <Metric
                      label="Forecast bias"
                      value={percent((selected || model).bias)}
                      detail="Positive means overforecasting"
                    />
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          {selected ? `Store ${store}` : "All stores"} · sales
                          forecast
                        </h2>
                        <p>
                          {date(model.start)} — {date(model.end)}
                        </p>
                      </div>
                      <div className="chart-legend">
                        <span>
                          <i className="legend-actual" />
                          Actual
                        </span>
                        <span>
                          <i className="legend-forecast" />
                          Forecast
                        </span>
                        {model.id === "gru" && (
                          <span>
                            <i className="legend-baseline" />
                            Seasonal baseline
                          </span>
                        )}
                      </div>
                    </div>
                    {selected && !activeSeries && (
                      <div className="chart-loading" role="status">
                        {storeError || "Reading store forecast…"}
                      </div>
                    )}
                    <TrendChart
                      points={points}
                      baseline={model.id === "gru" ? matchedBase : undefined}
                      currency={currency}
                    />
                  </section>
                  <section className="panel table-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Store performance</h2>
                        <p>
                          {number(storeRows.length)} stores · ordered by
                          forecast error
                        </p>
                      </div>
                      <label className="search-field">
                        <Search size={16} />
                        <input
                          aria-label="Search stores"
                          placeholder="Find a store…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    </div>
                    <StoreTable
                      rows={storeRows.slice(0, 50)}
                      currency={currency}
                      onSelect={setStore}
                    />
                    {storeRows.length > 50 && (
                      <div className="table-note">
                        Showing the first 50 stores. Search by store number to
                        narrow the list.
                      </div>
                    )}
                  </section>
                </>
              )}
              {tab === "models" && (
                <ModelLab
                  workspace={workspace}
                  onExplore={() => {
                    setModelId("gru");
                    setStore("all");
                    navigate("forecasts");
                  }}
                />
              )}
              {tab === "inventory" && <InventoryPlanner />}
              {tab === "data" && (
                <>
                  <SectionTitle
                    eyebrow="DATA HEALTH"
                    title="Data quality & lineage."
                    description="Inspect the records behind the forecast and understand their limits."
                  />
                  <div className="metric-grid three">
                    <Metric
                      label="Sales records"
                      value={number(workspace.salesRows)}
                      detail={`${date(workspace.salesStart)} — ${date(workspace.salesEnd)}`}
                    />
                    <Metric
                      label="Source stores"
                      value={number(workspace.storeCount)}
                      detail="Rossmann store-level observations"
                    />
                    <Metric
                      label="Forecast outputs"
                      value={String(workspace.models.length)}
                      detail="Available saved model and baseline outputs"
                    />
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Source integrity checks</h2>
                        <p>
                          Computed against the sales table when the snapshot is
                          exported
                        </p>
                      </div>
                      <span className="tag tag-green">
                        {workspace.quality.every((q) => q.value === 0)
                          ? "All checks passed"
                          : "Coverage to review"}
                      </span>
                    </div>
                    <div className="quality-list">
                      {workspace.quality.map((q) => (
                        <div key={q.name}>
                          <span
                            className={
                              q.value === 0 ? "quality-pass" : "quality-fail"
                            }
                          >
                            {q.value === 0 ? (
                              <CheckCircle2 size={18} />
                            ) : (
                              <Activity size={18} />
                            )}
                          </span>
                          <strong>{q.name}</strong>
                          <span>
                            {number(q.value)} {q.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="lower-grid">
                    <section className="panel prose-panel">
                      <h2>Data lineage</h2>
                      <ol className="lineage">
                        <li>
                          <Database size={18} />
                          <div>
                            <strong>Sales database</strong>
                            <p>Cleaned retail sales stored in MySQL.</p>
                          </div>
                        </li>
                        <li>
                          <Network size={18} />
                          <div>
                            <strong>Forecasting pipeline</strong>
                            <p>Chronological training and saved predictions.</p>
                          </div>
                        </li>
                        <li>
                          <Layers3 size={18} />
                          <div>
                            <strong>Workspace snapshot</strong>
                            <p>
                              Atomic export of metrics, series and integrity
                              checks.
                            </p>
                          </div>
                        </li>
                      </ol>
                      <p className="subtle">
                        Snapshot exported{" "}
                        {new Date(workspace.exportedAt).toLocaleString("en-GB")}
                      </p>
                    </section>
                    <section className="panel prose-panel">
                      <h2>What this data supports</h2>
                      {workspace.notices.map((n) => (
                        <p className="notice-line" key={n}>
                          <CircleHelp size={16} />
                          {n}
                        </p>
                      ))}
                    </section>
                  </div>
                </>
              )}
              {tab === "reports" && (
                <>
                  <SectionTitle
                    eyebrow="REPORTS & EXPORTS"
                    title="Research & exports."
                    description="Download the data you see, with its evaluation context intact."
                  />
                  <div className="export-grid">
                    {[
                      {
                        title: "Selected forecast",
                        text: "Daily actuals and forecasts for your current model and store selection.",
                        icon: TrendingUp,
                        action: () => exportPoints(points, model.id, store),
                        type: "CSV",
                      },
                      {
                        title: "GRU evaluation",
                        text: "Matched seasonal baseline, evaluation dates, settings and learning history.",
                        icon: Network,
                        action: () =>
                          download(
                            JSON.stringify(workspace.backtest, null, 2),
                            "demandcast-gru-backtest.json",
                            "application/json",
                          ),
                        type: "JSON",
                        disabled: !workspace.backtest,
                      },
                      {
                        title: "Workspace summary",
                        text: "A shareable research note with measured results and known limitations.",
                        icon: FileText,
                        action: () =>
                          download(
                            report(workspace),
                            "demandcast-research-summary.md",
                            "text/markdown",
                          ),
                        type: "MARKDOWN",
                      },
                    ].map((item) => (
                      <section className="panel export-card" key={item.title}>
                        <span className="export-icon">
                          <item.icon size={24} strokeWidth={1.5} />
                        </span>
                        <span className="export-format">{item.type}</span>
                        <h2>{item.title}</h2>
                        <p>{item.text}</p>
                        <button
                          className="button"
                          disabled={item.disabled}
                          onClick={item.action}
                        >
                          <ArrowDownToLine size={15} />
                          Download report
                        </button>
                      </section>
                    ))}
                  </div>
                  <section className="panel prose-panel">
                    <h2>Reading historical model scores</h2>
                    <p>
                      Saved LightGBM, Prophet, SARIMA and naive artifacts use
                      different forecast origins and information sets. Their
                      scores describe their own outputs; they do not form a
                      controlled leaderboard.
                    </p>
                    <p>
                      Earlier LightGBM runs included same-day customer counts.
                      That input is now excluded from training. Only retrained
                      outputs reflect the fix; the explorer identifies outputs
                      without verified training metadata.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigate("models")}
                    >
                      See the controlled GRU comparison
                      <ArrowRight size={15} />
                    </button>
                  </section>
                </>
              )}
              <footer className="workspace-footer">
                <span>
                  DEMANDCAST <i>/</i> FORECAST DESK
                </span>
                <span>
                  Source: {workspace.source}{" "}
                  <span className="footer-dot">·</span> Historical data through{" "}
                  {date(workspace.salesEnd)}
                </span>
              </footer>
            </>
          )}
          {!loading && !workspace && (
            <section className="empty-workspace">
              <Database size={34} />
              <h1>Your forecast workspace is ready.</h1>
              <p>
                Export your pipeline results to bring real sales and model
                evaluations into view.
              </p>
              <code>python run_pipeline.py --only dashboard</code>
              <button
                className="button button-primary"
                onClick={() => void refresh()}
              >
                <RefreshCw size={15} />
                Check for results
              </button>
            </section>
          )}
        </main>
      </div>
      {(assistantOpen || helpOpen) && (
        <div
          className="drawer-backdrop"
          onClick={() => {
            setAssistantOpen(false);
            setHelpOpen(false);
          }}
        >
          <aside
            ref={dialogRef}
            className="workspace-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={helpOpen ? "Workspace guide" : "Ask workspace"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <div>
                <Sparkles size={19} />
                <h2>
                  {helpOpen ? "Your workspace guide" : "Ask your workspace"}
                </h2>
              </div>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close guide"
                onClick={() => {
                  setAssistantOpen(false);
                  setHelpOpen(false);
                }}
              >
                <X size={20} />
              </button>
            </div>
            {helpOpen ? (
              <div className="drawer-content">
                <h3>From sales to a clearer plan.</h3>
                <p>
                  Start with Overview, inspect individual stores in Forecast
                  explorer, and compare the recurrent model with its matched
                  baseline in Model lab.
                </p>
                <h3>Keep the workspace current</h3>
                <p>
                  After a model run, export the latest results from the project
                  folder:
                </p>
                <code>python run_pipeline.py --only dashboard</code>
                <p>
                  Then use the refresh button in the header. Every chart
                  reflects the exported results, rather than live sales.
                </p>
                <h3>What the error means</h3>
                <p>
                  WMAPE divides total absolute forecast error by total actual
                  sales. Lower is better. Bias indicates whether forecasts tend
                  to be too high or too low.
                </p>
                <h3>Inventory planning</h3>
                <p>
                  The planner is a transparent calculator. Enter your own
                  unit-level inputs; it cannot convert Rossmann revenue into
                  stock orders.
                </p>
              </div>
            ) : (
              <div className="drawer-content">
                <span className="tag tag-green">
                  <Database size={12} />
                  Grounded in saved results
                </span>
                <h3>A closer look, in plain language.</h3>
                <p>
                  Ask about the recurrent model, forecast error, data quality or
                  inventory assumptions.
                </p>
                <div className="guide-suggestions">
                  {[
                    "How did the GRU perform?",
                    "Can I compare all the models?",
                    "What data is missing for inventory?",
                  ].map((q) => (
                    <button
                      key={q}
                      disabled={thinking}
                      onClick={() => void ask(q)}
                    >
                      {q}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
                <form
                  className="guide-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(assistantInput);
                  }}
                >
                  <label htmlFor="guide-question">Your question</label>
                  <textarea
                    id="guide-question"
                    maxLength={2000}
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    placeholder="What would you like to understand?"
                  />
                  <button
                    className="button button-primary"
                    disabled={thinking || !assistantInput.trim()}
                  >
                    {thinking ? (
                      <LoaderCircle className="spinning" size={15} />
                    ) : (
                      <Send size={15} />
                    )}
                    Ask workspace
                  </button>
                </form>
                {(answer || thinking) && (
                  <div className="guide-answer" role="status">
                    {thinking ? "Reading the saved evaluation…" : answer}
                  </div>
                )}
                <p className="subtle">
                  Local evidence guide · no API key needed. Answers use saved
                  workspace results.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
function ArtifactNote({ model }: { model: Model }) {
  return (
    <div className="artifact-note">
      <CircleHelp size={15} />
      <span>
        Historical output · different models used different forecast origins.{" "}
        {model.inputWarning ||
          "Use the matched GRU and seasonal-baseline evaluation for a controlled comparison."}
      </span>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
  spark,
  amber,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: React.ReactNode;
  spark?: number[];
  amber?: boolean;
}) {
  const min = Math.min(...(spark || [0])),
    max = Math.max(...(spark || [1]));
  const line = spark
    ?.map(
      (v, i) =>
        `${(i / Math.max(spark.length - 1, 1)) * 75},${28 - ((v - min) / Math.max(max - min, 1)) * 23}`,
    )
    .join(" ");
  return (
    <section className="metric">
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <div className="metric-value-row">
        <strong>{value}</strong>
        {line && (
          <svg width="76" height="32" viewBox="0 0 76 32" aria-hidden="true">
            <polyline
              points={line}
              fill="none"
              stroke={amber ? "#d77a3b" : "#4c739c"}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p>{detail}</p>
    </section>
  );
}
function ContextItem({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="context-item">
      <span>{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}
function StoreTable({
  rows,
  currency,
  onSelect,
}: {
  rows: Model["stores"];
  currency?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>STORE</th>
            <th>ACTUAL SALES</th>
            <th>FORECAST ERROR</th>
            <th>BIAS</th>
            <th>
              <span className="sr-only">Open store</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>
                <button className="store-button" onClick={() => onSelect(s.id)}>
                  <span className="store-icon">
                    <StoreIcon size={14} />
                  </span>
                  Store {s.id}
                </button>
              </td>
              <td>
                {currency ? "€" : ""}
                {number(s.actual)}
              </td>
              <td>
                <span
                  className={`error-tag ${(s.wmape ?? 0) > 25 ? "error-high" : ""}`}
                >
                  {percent(s.wmape)}
                </span>
              </td>
              <td className="bias-cell">
                {s.bias != null && s.bias > 0 ? "+" : ""}
                {percent(s.bias)}
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`View store ${s.id}`}
                  onClick={() => onSelect(s.id)}
                >
                  <ArrowUpRight size={15} />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="table-empty">
                No stores match your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function ModelLab({
  workspace,
  onExplore,
}: {
  workspace: Workspace;
  onExplore: () => void;
}) {
  const run = workspace.backtest;
  const improvement = run
    ? run.metrics.seasonal_naive.wmape_percent - run.metrics.gru.wmape_percent
    : 0;
  return (
    <>
      <SectionTitle
        eyebrow="MODEL LAB"
        title="Model evaluation."
        description="An attention GRU with a seasonal foundation and an honest evaluation."
      >
        <button className="button" onClick={onExplore} disabled={!run}>
          Explore GRU forecasts
          <ArrowUpRight size={15} />
        </button>
      </SectionTitle>
      <section className="model-blueprint">
        <div>
          <span className="tag tag-outline">RECURRENT NEURAL NETWORK</span>
          <h2>
            Patterns in.
            <br />
            Perspective out.
          </h2>
          <p>
            A shared GRU learns temporal patterns across stores.
            Calendar-conditioned attention reads the sales history, then
            predicts all {run?.horizon ?? 14} days together.
          </p>
        </div>
        <div className="architecture">
          <div>
            <span>01 / ENCODE</span>
            <strong>{run?.lookback ?? 56}-day history</strong>
            <small>Sales + calendar signals</small>
          </div>
          <ArrowRight size={22} />
          <div>
            <span>02 / LEARN</span>
            <strong>GRU + attention</strong>
            <small>Shared temporal patterns</small>
          </div>
          <ArrowRight size={22} />
          <div>
            <span>03 / FORECAST</span>
            <strong>{run?.horizon ?? 14}-day horizon</strong>
            <small>Weekly baseline + residual</small>
          </div>
        </div>
      </section>
      {run ? (
        <>
          <div className="evaluation-verdict">
            <CheckCircle2 size={18} />
            <span>
              <strong>
                {improvement > 0
                  ? "The GRU reduced forecast error"
                  : "The seasonal baseline performed better"}{" "}
                on this test window.
              </strong>{" "}
              {Math.abs(improvement).toFixed(2)} percentage points of WMAPE
              separate the two. This is one historical origin; broader
              validation is still needed.
            </span>
          </div>
          <div className="metric-grid three">
            <Metric
              label="GRU · test WMAPE"
              value={percent(run.metrics.gru.wmape_percent)}
              detail="Fixed-origin, direct multi-step prediction"
            />
            <Metric
              label="Seasonal baseline · WMAPE"
              value={percent(run.metrics.seasonal_naive.wmape_percent)}
              detail="Same origin, dates and evaluated stores"
            />
            <Metric
              label="Evaluation coverage"
              value={number(run.series)}
              detail={`${number(run.observations)} matched observations`}
            />
          </div>
          <div className="lower-grid">
            <section className="panel prose-panel">
              <h2>Evaluation protocol</h2>
              <dl className="detail-list">
                <div>
                  <dt>Training cutoff</dt>
                  <dd>{date(run.train_end)}</dd>
                </div>
                <div>
                  <dt>Test forecast origin</dt>
                  <dd>{date(run.forecast_origin)}</dd>
                </div>
                <div>
                  <dt>Test window</dt>
                  <dd>
                    {date(run.test_start)} — {date(run.test_end)}
                  </dd>
                </div>
                <div>
                  <dt>Training windows</dt>
                  <dd>{number(run.training_samples)}</dd>
                </div>
                <div>
                  <dt>Measured training time</dt>
                  <dd>{run.training_seconds.toFixed(1)} seconds</dd>
                </div>
                <div>
                  <dt>Selection</dt>
                  <dd>Validation WMAPE · early stopping</dd>
                </div>
              </dl>
            </section>
            <section className="panel prose-panel">
              <h2>Designed to close the gaps</h2>
              <ContextItem
                icon={<Check size={17} />}
                title="Future actuals stay out"
                text="The encoder stops at the forecast origin. Future inputs contain calendar features only."
              />
              <ContextItem
                icon={<Check size={17} />}
                title="Training-only scaling"
                text="Each store’s scale comes from training sales. Validation chooses the model checkpoint."
              />
              <ContextItem
                icon={<Check size={17} />}
                title="A matched comparison"
                text="The seasonal baseline repeats the last observed week from exactly the same origin."
              />
            </section>
          </div>
          <section className="panel prose-panel">
            <h2>Where the evidence ends</h2>
            {run.limitations.map((n) => (
              <p className="notice-line" key={n}>
                <CircleHelp size={16} />
                {n}
              </p>
            ))}
          </section>
        </>
      ) : (
        <section className="panel prose-panel">
          <h2>No training run published yet</h2>
          <p>
            Install the optional recurrent-model dependency and run the GRU and
            dashboard export stages to see a measured comparison.
          </p>
          <code>python run_pipeline.py --only gru dashboard</code>
        </section>
      )}
    </>
  );
}
function InventoryPlanner() {
  const [daily, setDaily] = useState(100),
    [lead, setLead] = useState(7),
    [deviation, setDeviation] = useState(20),
    [service, setService] = useState(1.645),
    [onHand, setOnHand] = useState(400),
    [onOrder, setOnOrder] = useState(0),
    [review, setReview] = useState(7);
  const valid =
    [daily, lead, deviation, onHand, onOrder, review].every(
      (v) => Number.isFinite(v) && v >= 0,
    ) &&
    lead >= 1 &&
    review >= 1;
  const safety = service * deviation * Math.sqrt(lead);
  const reorder = Math.ceil(daily * lead + safety);
  const target = Math.ceil(
    daily * (lead + review) + service * deviation * Math.sqrt(lead + review),
  );
  const quantity = Math.max(0, target - onHand - onOrder);
  return (
    <>
      <SectionTitle
        eyebrow="INVENTORY PLANNER"
        title="Inventory planning."
        description="An illustrative unit-demand calculator. Enter your own operating inputs."
      />
      <div className="planner-notice">
        <CircleHelp size={18} />
        <p>
          These are editable example inputs. Store revenue is not converted to
          unit demand, and no orders are placed. This calculator assumes
          independent daily demand and fixed supplier lead time.
        </p>
      </div>
      <div className="lower-grid">
        <section className="panel prose-panel">
          <h2>Your planning inputs</h2>
          <p className="subtle">
            Use unit quantities from your own SKU-level records.
          </p>
          <div className="planner-inputs">
            {[
              {
                label: "Mean daily demand (units)",
                value: daily,
                set: setDaily,
                min: 0,
              },
              {
                label: "Daily demand standard deviation",
                value: deviation,
                set: setDeviation,
                min: 0,
              },
              {
                label: "Supplier lead time (days)",
                value: lead,
                set: setLead,
                min: 1,
              },
              {
                label: "Review interval (days)",
                value: review,
                set: setReview,
                min: 1,
              },
              {
                label: "Stock on hand (units)",
                value: onHand,
                set: setOnHand,
                min: 0,
              },
              {
                label: "Stock on order (units)",
                value: onOrder,
                set: setOnOrder,
                min: 0,
              },
            ].map((input) => (
              <label key={input.label}>
                {input.label}
                <input
                  type="number"
                  min={input.min}
                  max={10000000}
                  value={Number.isNaN(input.value) ? "" : input.value}
                  onChange={(e) =>
                    input.set(
                      e.target.value === "" ? NaN : Number(e.target.value),
                    )
                  }
                />
              </label>
            ))}
            <label>
              Cycle service level
              <select
                aria-label="Cycle service level"
                value={service}
                onChange={(e) => setService(Number(e.target.value))}
              >
                <option value={1.282}>90%</option>
                <option value={1.645}>95%</option>
                <option value={2.326}>99%</option>
              </select>
            </label>
          </div>
          {!valid && (
            <p role="alert" className="validation-error">
              Enter nonnegative quantities and at least one day for lead time
              and review interval.
            </p>
          )}
        </section>
        <section className="panel planner-results">
          <span className="eyebrow">ILLUSTRATIVE PLANNING RESULT</span>
          <h2>A starting point for your policy.</h2>
          <div>
            <span>Safety stock</span>
            <strong>
              {valid ? number(Math.ceil(safety)) : "—"}
              <small>units</small>
            </strong>
            <p>z × daily standard deviation × √lead time</p>
          </div>
          <div>
            <span>Reorder point</span>
            <strong>
              {valid ? number(reorder) : "—"}
              <small>units</small>
            </strong>
            <p>Expected lead-time demand + safety stock</p>
          </div>
          <div>
            <span>Order-up-to quantity</span>
            <strong>
              {valid ? number(quantity) : "—"}
              <small>units</small>
            </strong>
            <p>Review-period target − stock on hand − stock on order</p>
          </div>
          <span className="tag tag-neutral">
            Scenario only · no purchasing connection
          </span>
        </section>
      </div>
    </>
  );
}
function report(w: Workspace) {
  return `# DemandCast research summary\n\nSnapshot: ${w.exportedAt}\nDataset: ${w.dataset}\nCoverage: ${w.salesStart} to ${w.salesEnd}\nStores: ${w.storeCount}\n\n## Controlled GRU evaluation\n${w.backtest ? `Forecast origin: ${w.backtest.forecast_origin}\nGRU WMAPE: ${w.backtest.metrics.gru.wmape_percent.toFixed(2)}%\nMatched seasonal baseline WMAPE: ${w.backtest.metrics.seasonal_naive.wmape_percent.toFixed(2)}%\n\n${w.backtest.limitations.map((l) => `- ${l}`).join("\n")}` : "No GRU evaluation exported."}\n\n## Limitations\n${w.notices.map((n) => `- ${n}`).join("\n")}\n- Historical LightGBM outputs included contemporaneous customer counts. Code now excludes this input; historical results require retraining.\n`;
}
