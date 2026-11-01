// Mock data generator for DemandCast dashboard
// Simulates realistic Rossmann-style retail forecasting data

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  date: string;
  actual: number;
  predicted: number;
  lower: number;
  upper: number;
}

export interface ModelMetrics {
  model: string;
  wmape: number;
  rmse: number;
  mape: number;
  bias: number;
  status: "best" | "good" | "baseline";
}

export interface SKU {
  id: string;
  name: string;
  store: string;
  category: string;
  weeklyDemand: number;
  accuracy: number;
  stockoutRisk: "high" | "medium" | "low";
  safetyStock: number;
}

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  module: string;
  icon: string;
  status: "idle" | "running" | "completed" | "error";
  duration?: string;
  lastRun?: string;
}

export interface InventoryItem {
  sku: string;
  name: string;
  store: string;
  currentStock: number;
  safetyStock: number;
  reorderPoint: number;
  forecastDemand: number;
  stockoutProb: number;
  overstockProb: number;
  action: "reorder" | "ok" | "overstock";
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Forecast Data ───────────────────────────────────────────────────────────

export function generateForecastData(
  days = 90,
  baseValue = 4200,
  seed = 42
): ForecastPoint[] {
  const rng = seededRandom(seed);
  const data: ForecastPoint[] = [];
  const start = new Date("2015-04-15");

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const dayOfWeek = d.getDay();
    const weeklyPattern = [0.6, 0.85, 0.9, 0.95, 1.1, 1.35, 0.75][dayOfWeek];
    const trend = 1 + (i / days) * 0.15;
    const noise = (rng() - 0.5) * 0.2;
    const promo = (i % 14 === 6 || i % 14 === 7) ? 1.4 : 1;

    const actual = Math.round(baseValue * weeklyPattern * trend * (1 + noise) * promo);
    const predNoise = (rng() - 0.5) * 0.1;
    const predicted = Math.round(actual * (1 + predNoise));
    const uncertainty = Math.round(predicted * 0.12);

    data.push({
      date: d.toISOString().slice(0, 10),
      actual: i < 70 ? actual : 0,
      predicted,
      lower: predicted - uncertainty,
      upper: predicted + uncertainty,
    });
  }
  return data;
}

// ─── Model Metrics ───────────────────────────────────────────────────────────

export const MODEL_METRICS: ModelMetrics[] = [
  { model: "⚡ LightGBM (Global)", wmape: 7.1, rmse: 312, mape: 6.8, bias: -0.3, status: "best" },
  { model: "🔮 Prophet", wmape: 11.4, rmse: 487, mape: 10.9, bias: 1.2, status: "good" },
  { model: "📈 SARIMA", wmape: 13.8, rmse: 601, mape: 13.2, bias: 2.1, status: "baseline" },
  { model: "📅 Seasonal Naive", wmape: 18.2, rmse: 789, mape: 17.6, bias: -0.8, status: "baseline" },
];

// ─── SKU Data ─────────────────────────────────────────────────────────────────

export const SKU_DATA: SKU[] = [
  { id: "SKU-001", name: "Organic Whole Milk 1L", store: "Store #42", category: "Dairy", weeklyDemand: 840, accuracy: 94.2, stockoutRisk: "low", safetyStock: 120 },
  { id: "SKU-002", name: "Artisan Sourdough Loaf", store: "Store #42", category: "Bakery", weeklyDemand: 620, accuracy: 88.7, stockoutRisk: "medium", safetyStock: 80 },
  { id: "SKU-003", name: "Premium Orange Juice 2L", store: "Store #17", category: "Beverages", weeklyDemand: 1200, accuracy: 91.5, stockoutRisk: "low", safetyStock: 200 },
  { id: "SKU-004", name: "Free-Range Eggs (12pk)", store: "Store #08", category: "Dairy", weeklyDemand: 960, accuracy: 85.3, stockoutRisk: "high", safetyStock: 150 },
  { id: "SKU-005", name: "Greek Yogurt 500g", store: "Store #42", category: "Dairy", weeklyDemand: 580, accuracy: 92.1, stockoutRisk: "low", safetyStock: 100 },
  { id: "SKU-006", name: "Coffee Beans 250g", store: "Store #17", category: "Beverages", weeklyDemand: 420, accuracy: 87.8, stockoutRisk: "medium", safetyStock: 60 },
  { id: "SKU-007", name: "Butter 250g", store: "Store #08", category: "Dairy", weeklyDemand: 780, accuracy: 93.4, stockoutRisk: "low", safetyStock: 110 },
  { id: "SKU-008", name: "Croissants (6pk)", store: "Store #42", category: "Bakery", weeklyDemand: 340, accuracy: 79.2, stockoutRisk: "high", safetyStock: 60 },
];

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: "ingest",
    name: "Data Ingestion",
    description: "Load raw Rossmann/M5 CSVs, dtype fixes, missing flags, calendar joins",
    module: "src/data/load_data.py",
    icon: "🗂️",
    status: "completed",
    duration: "2m 14s",
    lastRun: "Today, 09:12",
  },
  {
    id: "features",
    name: "Feature Engineering",
    description: "Lag features, rolling windows, calendar/seasonality, promo/holiday flags",
    module: "src/features/build_features.py",
    icon: "⚙️",
    status: "completed",
    duration: "4m 38s",
    lastRun: "Today, 09:14",
  },
  {
    id: "baselines",
    name: "Baseline Models",
    description: "Seasonal-naive, per-series SARIMA, Prophet with holiday regressors",
    module: "src/models/baseline_*.py",
    icon: "📐",
    status: "completed",
    duration: "18m 02s",
    lastRun: "Today, 09:19",
  },
  {
    id: "lightgbm",
    name: "LightGBM Training",
    description: "Global model with categorical encoding, early stopping, Optuna HPO",
    module: "src/models/train_lightgbm.py",
    icon: "⚡",
    status: "idle",
    duration: undefined,
    lastRun: "Yesterday, 14:30",
  },
  {
    id: "reconcile",
    name: "Hierarchical Reconciliation",
    description: "Bottom-up aggregation; MinT is not implemented",
    module: "src/models/reconcile.py",
    icon: "🔗",
    status: "idle",
    duration: undefined,
    lastRun: "Yesterday, 14:55",
  },
  {
    id: "evaluate",
    name: "Evaluation & Reports",
    description: "WMAPE, MAPE, RMSE, bias, cost-impact estimate → reports/",
    module: "src/evaluation/metrics.py",
    icon: "📏",
    status: "idle",
    duration: undefined,
    lastRun: "Yesterday, 15:01",
  },
];

// ─── Inventory Data ──────────────────────────────────────────────────────────

export const INVENTORY_DATA: InventoryItem[] = [
  { sku: "SKU-004", name: "Free-Range Eggs (12pk)", store: "Store #08", currentStock: 45, safetyStock: 150, reorderPoint: 200, forecastDemand: 960, stockoutProb: 87, overstockProb: 2, action: "reorder" },
  { sku: "SKU-008", name: "Croissants (6pk)", store: "Store #42", currentStock: 22, safetyStock: 60, reorderPoint: 80, forecastDemand: 340, stockoutProb: 73, overstockProb: 1, action: "reorder" },
  { sku: "SKU-002", name: "Artisan Sourdough Loaf", store: "Store #42", currentStock: 95, safetyStock: 80, reorderPoint: 110, forecastDemand: 620, stockoutProb: 42, overstockProb: 8, action: "reorder" },
  { sku: "SKU-006", name: "Coffee Beans 250g", store: "Store #17", currentStock: 180, safetyStock: 60, reorderPoint: 90, forecastDemand: 420, stockoutProb: 12, overstockProb: 35, action: "ok" },
  { sku: "SKU-001", name: "Organic Whole Milk 1L", store: "Store #42", currentStock: 320, safetyStock: 120, reorderPoint: 160, forecastDemand: 840, stockoutProb: 5, overstockProb: 15, action: "ok" },
  { sku: "SKU-003", name: "Premium Orange Juice 2L", store: "Store #17", currentStock: 680, safetyStock: 200, reorderPoint: 280, forecastDemand: 1200, stockoutProb: 3, overstockProb: 8, action: "ok" },
  { sku: "SKU-007", name: "Butter 250g", store: "Store #08", currentStock: 890, safetyStock: 110, reorderPoint: 150, forecastDemand: 780, stockoutProb: 1, overstockProb: 68, action: "overstock" },
  { sku: "SKU-005", name: "Greek Yogurt 500g", store: "Store #42", currentStock: 520, safetyStock: 100, reorderPoint: 140, forecastDemand: 580, stockoutProb: 2, overstockProb: 72, action: "overstock" },
];

// ─── Category Sales ──────────────────────────────────────────────────────────

export const CATEGORY_SALES = [
  { category: "Dairy", sales: 42800, share: 34.2 },
  { category: "Beverages", sales: 31200, share: 24.9 },
  { category: "Bakery", sales: 22100, share: 17.7 },
  { category: "Meat", sales: 18900, share: 15.1 },
  { category: "Produce", sales: 10200, share: 8.1 },
];

// ─── Store Performance ───────────────────────────────────────────────────────

export const STORE_PERFORMANCE = [
  { store: "Store #42", sales: 48200, wmape: 6.8, accuracy: 93.2, orders: 1240 },
  { store: "Store #17", sales: 39100, wmape: 7.4, accuracy: 92.6, orders: 980 },
  { store: "Store #08", sales: 31600, wmape: 8.1, accuracy: 91.9, orders: 810 },
  { store: "Store #29", sales: 27300, wmape: 9.2, accuracy: 90.8, orders: 660 },
  { store: "Store #55", sales: 21800, wmape: 10.5, accuracy: 89.5, orders: 520 },
];

// ─── Weekly Sales by Region ──────────────────────────────────────────────────

export const REGIONAL_DATA = [
  { week: "W14", north: 28400, south: 19200, east: 22100, west: 16800 },
  { week: "W15", north: 31200, south: 20800, east: 24300, west: 18200 },
  { week: "W16", north: 29800, south: 22100, east: 23800, west: 19600 },
  { week: "W17", north: 34100, south: 24600, east: 27200, west: 21400 },
  { week: "W18", north: 36800, south: 23900, east: 29100, west: 22800 },
  { week: "W19", north: 33200, south: 25800, east: 26400, west: 24100 },
  { week: "W20", north: 38400, south: 27200, east: 31200, west: 25600 },
];

// ─── AI System Prompt ────────────────────────────────────────────────────────

export const AI_SYSTEM_PROMPT = `You are DemandAI, an assistant explaining the DemandCast demonstration.
The dashboard contains simulated data. You have no tools or connection to live inventory, pipeline jobs, or saved prediction files.
Begin numerical answers with "In this simulated example". Never present example figures as measured results, live facts, validated stockout probabilities, or realized savings.
Current backend capability: bottom-up aggregation only. MinT is unavailable; do not recommend enabling it or claim a measured improvement.
The forecasting pipeline uses a single chronological train/validation/test split. Its LightGBM features use realized prior-day sales; a fixed-origin multi-step benchmark has not been established.
Saved-artifact audits are descriptive only because models use different forecast origins and information sets. Do not invent benchmark scores or training times.
Illustrative inventory records: ${JSON.stringify(INVENTORY_DATA)}
Explain formulas in plain language. Reorder recommendations require lead time, demand uncertainty, on-order stock, and an agreed service-level policy. State missing inputs instead of inventing an order quantity.
Keep answers concise and identify the source as the simulated inventory catalogue.`;

// ─── Quick Suggestions ───────────────────────────────────────────────────────

export const AI_SUGGESTIONS = [
  "Why is SKU-004 at high stockout risk?",
  "Explain WMAPE vs MAPE",
  "What's the best reorder point for eggs?",
  "How does MinT reconciliation work?",
  "Compare LightGBM vs Prophet accuracy",
  "What features drive sales the most?",
];
