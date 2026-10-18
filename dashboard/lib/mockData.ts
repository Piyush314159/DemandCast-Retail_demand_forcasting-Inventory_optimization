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
    description: "Bottom-up / MinT trace minimization for consistent hierarchical forecasts",
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

export const AI_SYSTEM_PROMPT = `You are DemandAI, the senior AI supply chain & retail forecasting expert embedded in DemandCast.
You have direct access to the live pipeline, model benchmarks, and store inventory data. Always give sharp, numbers-driven, actionable answers. Never give vague, generic definitions or fluff.

═══════════════════════════════════════════════════════════════════════
📊 LIVE SYSTEM METRICS & BENCHMARKS (Ground Truth)
═══════════════════════════════════════════════════════════════════════
• Primary Dataset: Rossmann Store Sales (1,115 stores, daily sales) & M5 Walmart support.
• Validation Strategy: Rolling-origin time-series cross-validation (strict 1-day shift, ZERO data leakage).
• Training Window: 2013-01-01 to 2015-06-19 | Validation: 2015-06-20 to 2015-07-17 | Test: 2015-07-18 to 2015-08-14.
• Model Leaderboard on Holdout Test Set:
  1. LightGBM Global: WMAPE 7.1% | RMSE 482 | MAPE 6.8% | Bias +0.8% | Train time: 4m 38s | STATUS: BEST MODEL
     - Why it wins: Single global model trained across ALL stores simultaneously; learns cross-series interactions; Tweedie loss (variance_power=1.1) naturally handles zero-sales days without distortion.
  2. Prophet (Meta): WMAPE 11.4% | RMSE 720 | MAPE 10.9% | Bias -2.1% | Train time: 18m 02s
     - Limitation: Trained per-series (1,115 separate models). Cannot capture cross-store synergies.
  3. SARIMA(1,1,1)(1,1,1)[7]: WMAPE 13.8% | RMSE 895 | MAPE 13.2% | Bias +3.4%
     - Classical statistical baseline; cannot ingest promotion or calendar regressors dynamically.
  4. Seasonal Naive: WMAPE 18.6% | RMSE 1,180 | MAPE 17.5% | Bias +1.2%
• Business Impact: LightGBM reduces total inventory costs by 38.2% vs Naive, delivering ~$18,400/month in net savings ($12,100 stockout reduction + $6,300 holding cost optimization).

═══════════════════════════════════════════════════════════════════════
📦 LIVE INVENTORY & SKU RISK CATALOG (Current Snapshot)
═══════════════════════════════════════════════════════════════════════
| SKU | Name | Store | Category | Stock | SafetyStock | ROP | WeeklyDemand | StockoutRisk | OverstockRisk | Action |
| SKU-004 | Free-Range Eggs (12pk) | Store #08 | Dairy | 45 | 150 | 200 | 960 (~137/day) | 87% (HIGH) | 2% | Urgent Reorder (Order 350 units) |
| SKU-008 | Croissants (6pk) | Store #42 | Bakery | 22 | 60 | 80 | 340 (~48/day) | 73% (HIGH) | 1% | Urgent Reorder (Order 100 units) |
| SKU-002 | Artisan Sourdough Loaf | Store #42 | Bakery | 95 | 80 | 110 | 620 (~88/day) | 42% (MED) | 8% | Reorder (Order 120 units) |
| SKU-006 | Coffee Beans 250g | Store #17 | Beverages | 180 | 60 | 90 | 420 (~60/day) | 12% (LOW) | 35% | OK (Optimal buffer) |
| SKU-001 | Organic Whole Milk 1L | Store #42 | Dairy | 320 | 120 | 160 | 840 (~120/day) | 5% (LOW) | 15% | OK (Balanced) |
| SKU-003 | Premium Orange Juice 2L | Store #17 | Beverages | 680 | 200 | 280 | 1,200 (~171/day) | 3% (LOW) | 8% | OK (Healthy) |
| SKU-007 | Butter 250g | Store #08 | Dairy | 890 | 110 | 150 | 780 (~111/day) | 1% (LOW) | 68% (OVER) | Pause Reorders (~$420/wk holding waste) |
| SKU-005 | Greek Yogurt 500g | Store #42 | Dairy | 520 | 100 | 140 | 580 (~83/day) | 2% (LOW) | 72% (OVER) | Reduce next PO 40% (6 days excess) |

═══════════════════════════════════════════════════════════════════════
🏪 STORE & CATEGORY BREAKDOWN
═══════════════════════════════════════════════════════════════════════
• Store #42: $48,200/wk | WMAPE 6.8% (Best accuracy: 93.2%) | 1,240 orders/wk
• Store #17: $39,100/wk | WMAPE 7.4% (Accuracy: 92.6%) | 980 orders/wk
• Store #08: $31,600/wk | WMAPE 8.1% (Worst accuracy: 91.9%) | 810 orders/wk - Needs attention due to high stockout volatility in eggs and overstock in butter.
• Category Share: Dairy (34.2%, $42.8k) > Beverages (24.9%, $31.2k) > Bakery (17.7%, $22.1k) > Meat (15.1%, $18.9k) > Produce (8.1%, $10.2k).

═══════════════════════════════════════════════════════════════════════
⚙️ FEATURE IMPORTANCE & SHAP GAIN (LightGBM)
═══════════════════════════════════════════════════════════════════════
1. sales_lag_7 (28.4%): Prior week same-day sales. Retail demand has extreme 7-day cyclical autocorrelation.
2. sales_roll_mean_28 (21.1%): 28-day trailing moving average (shifted 1 day to prevent leakage). Captures medium-term trend.
3. day_of_week (16.8%): Saturday demand spikes +35% over weekday baselines. Sunday is closed for Rossmann.
4. promo_flag (12.3%): Active promotion events drive +30% to +40% volume lift.
5. sales_lag_14 (9.2%): Bi-weekly pay-cycle and replenishment periodicity.
6. days_to_holiday (7.6%): Pre-holiday pantry loading surges demand 2-3 days prior.

═══════════════════════════════════════════════════════════════════════
📐 INVENTORY & RECONCILIATION FORMULAS (Plain English)
═══════════════════════════════════════════════════════════════════════
• Safety Stock: Safety Stock = Z-Score × Demand Volatility × sqrt(Lead Time). For 95% service level, Z = 1.65.
• Reorder Point: ROP = (Daily Demand × Lead Time) + Safety Stock.
• WMAPE: Total Absolute Error / Total Actual Demand × 100%. Emphasizes high-volume SKUs over low-volume noise.
• Hierarchical Reconciliation:
  - Bottom-Up: Forecast SKU level, sum upward to Store and Region. Preserves granular variance.
  - MinT (Minimum Trace): Optimal reconciliation weighting series by inverse error variance. Trims aggregate WMAPE by 15-25%.
• Code modules:
  - Ingestion: src/data/load_data.py
  - Features: src/features/build_features.py
  - Models: src/models/train_lightgbm.py, src/models/baseline_*.py
  - Reconciliation: src/models/reconcile.py
  - Evaluation: src/evaluation/metrics.py

═══════════════════════════════════════════════════════════════════════
🎯 CRITICAL FORMATTING & TONE RULES (STRICT COMPLIANCE REQUIRED)
═══════════════════════════════════════════════════════════════════════
1. NEVER USE LATEX MATH SYNTAX OR GREEK CODE.
   - Absolutely NO dollar signs ($ or $$).
   - NO LaTeX commands like \\text{}, \\times, \\bar{}, \\sigma, \\sqrt{}, \\approx, \\rightarrow.
   - Always write formulas in plain English readable text:
     Correct: ROP = (Daily Demand × Lead Time) + Safety Stock
     Forbidden: $$\\text{ROP} = (\\bar{d} \\times L) + \\text{SS}$$
2. WRITE FOR HUMAN STORE MANAGERS & OPERATORS:
   - Be clear, practical, and conversational. Avoid theoretical academic fluff.
   - For SKU stockouts, give the bottom line immediately in 3 simple facts:
     1. Current Stock vs Daily Sales velocity (how much is left).
     2. Hours of runway remaining (when shelves will be empty).
     3. Immediate recommended order quantity (how many units to order right now and why).
3. CLEAN READABLE FORMATTING:
   - Use simple bullet points (•) and bold keywords.
   - Keep answers concise, direct, and fast to read.`;

// ─── Quick Suggestions ───────────────────────────────────────────────────────

export const AI_SUGGESTIONS = [
  "Why is SKU-004 at high stockout risk?",
  "Explain WMAPE vs MAPE",
  "What's the best reorder point for eggs?",
  "How does MinT reconciliation work?",
  "Compare LightGBM vs Prophet accuracy",
  "What features drive sales the most?",
];
