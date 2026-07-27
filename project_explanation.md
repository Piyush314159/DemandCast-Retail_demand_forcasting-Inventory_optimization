# 📦 DemandCast — Complete Project Explanation

> A retail demand forecasting & inventory optimization system.

---

## 1️⃣ WHY Are We Doing This?

### The Real-World Problem

Every retail business — whether a supermarket chain like Rossmann (1,000+ stores across Europe) or a giant e-commerce retailer (like Walmart's M5 dataset) — faces the same painful dilemma every single day:

| Scenario | What happens |
|:---------|:-------------|
| **Order too much stock** | Items sit on shelves → capital tied up, wastage, markdowns |
| **Order too little stock** | Shelves go empty → lost sales, unhappy customers, lost loyalty |

This is called the **stockout vs. overstock trade-off**, and it costs retailers billions of dollars every year.

### Why Traditional Methods Fail

Most retailers historically used simple rules:
- "Order what we sold last week plus 10%"
- Manual reorder points set by store managers
- Simple seasonal averages (same week last year)

These approaches **don't capture**:
- Promotions (a sale can double or triple demand overnight)
- Holidays and school breaks
- Cross-store demand patterns
- Complex weekly/monthly seasonality

### The Business Goal

> **Predict daily sales per store/SKU up to 4 weeks ahead** so that:
> - Purchasing departments know exactly how much to order
> - Stockouts are minimized (fewer lost sales)
> - Overstock is minimized (less cash tied up in inventory)
> - Store/region forecasts are **consistent** (SKU-level predictions add up to store totals correctly)

---

## 2️⃣ WHAT Is the Purpose?

### This Project Builds a Full ML Pipeline That:

1. **Ingests** raw retail sales data (supports 2 real-world datasets)
2. **Engineers** rich time-series features that encode demand patterns
3. **Trains** a powerful global ML model (LightGBM) across ALL stores/SKUs simultaneously
4. **Benchmarks** it against traditional baseline models (Naive, SARIMA, Prophet)
5. **Reconciles** forecasts hierarchically (SKU → Store → Region) so they remain consistent
6. **Evaluates** using business-relevant metrics (WMAPE, cost impact)

### Two Real-World Datasets Supported

| Dataset | Description | Scale |
|:--------|:------------|:------|
| **Rossmann** | German drug store chain | ~1,115 stores, daily sales |
| **M5** | Walmart hierarchical sales | ~30,490 time series, 5 years |

The pipeline is **dataset-agnostic** — just change one line in `config.yaml` to switch between them.

### Key Design Decisions

- **Global model** (one LightGBM trained across all series) → learns patterns across all stores simultaneously, unlike per-series models
- **Tweedie loss** in LightGBM → handles zero-inflated sales data naturally (days with 0 sales are common)
- **Rolling-origin validation** → no future data ever leaks into training folds
- **Hierarchical reconciliation** → ensures aggregate forecasts at different levels don't contradict each other

---

## 3️⃣ HOW Are We Solving It — Step by Step?

```
Raw CSV Data
     │
     ▼
[Step 1] load_data.py      ← Ingest & clean
     │
     ▼
[Step 2] build_features.py ← Engineer features
     │
     ├──────────────────────────────────────┐
     ▼                                      ▼
[Step 3] Baselines                    [Step 4] LightGBM
  SARIMA · Prophet · Naive            Global Model Training
     │                                      │
     └──────────────┬───────────────────────┘
                    ▼
             [Step 5] reconcile.py
             Hierarchical Reconciliation
                    │
                    ▼
             [Step 6] metrics.py
             Evaluation & Cost Impact
                    │
                    ▼
             reports/ + models/
```

---

### Step 1 — Data Ingestion: `load_data.py`

**File:** [load_data.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/data/load_data.py)

**What it does:**

Raw data comes in multiple CSV files. This step merges them into one unified long-format table.

#### For Rossmann:
```
train.csv  ──┐
              ├── Merge on Store ID ──► long_format.parquet
store.csv  ──┘
```
- `train.csv` has daily sales per store
- `store.csv` has store metadata (type, competition distance, assortment, etc.)
- Both are merged on `Store` ID, columns are renamed to lowercase standard names
- Result: one row = one store × one day

#### For M5 (Walmart):
```
sales_train_validation.csv ──┐
                              ├── Melt + Join ──► long_format.parquet
calendar.csv               ──┤
sell_prices.csv            ──┘
```
- M5 starts in **wide format** (each day is a column `d_1`, `d_2`, ..., `d_1913`)
- `.melt()` converts it to **long format** (one row = one item × one store × one day)
- Calendar data adds actual dates, week numbers
- Sell prices add pricing info

**Output:** `data/processed/long_format.parquet`

---

### Step 2 — Feature Engineering: `build_features.py`

**File:** [build_features.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/features/build_features.py)

This is the most critical step — it transforms raw sales history into meaningful signals for the ML model. Four types of features are created:

#### A. Calendar / Seasonality Features
```python
df["day_of_week"]  = 0–6    # Monday=0, Sunday=6
df["is_weekend"]   = 0 or 1  # weekends typically have different demand
df["week_of_year"] = 1–52    # captures annual seasonality
df["month"]        = 1–12    # monthly patterns
df["year"]         = YYYY    # year-over-year trend
```
**Why:** Retail demand has strong day-of-week and seasonal patterns.

#### B. Lag Features (Memory of past sales)
```python
df["sales_lag_7"]  = sales 7 days ago   (same weekday last week)
df["sales_lag_14"] = sales 14 days ago  (2 weeks ago)
df["sales_lag_28"] = sales 28 days ago  (4 weeks ago)
```
**Why:** The best predictor of tomorrow's sales is often the same day last week. The model uses these as "memory" of what happened before.

#### C. Rolling Window Features (Smoothed trends)
```python
# Mean and standard deviation over trailing windows
df["sales_roll_mean_7"]   = avg of last 7 days
df["sales_roll_mean_14"]  = avg of last 14 days
df["sales_roll_mean_28"]  = avg of last 28 days
df["sales_roll_mean_90"]  = avg of last 90 days  ← long-term trend
df["sales_roll_std_7"]    = volatility over 7 days
```
> [!IMPORTANT]
> All rolling windows are **shifted by 1 day** before computing. This ensures the current day's actual value is NEVER included in the feature — preventing **data leakage**.

**Why:** Rolling averages smooth out noise and capture the underlying trend at different timescales.

#### D. Promotion & Holiday Features
```python
df["promo"]            = 1 if store is running a promotion today
df["is_state_holiday"] = 1 if today is a state-level public holiday
df["school_holiday"]   = 1 if schools are on holiday (affects foot traffic)
```
**Why:** Promotions can spike demand 2–3×. Holidays shift demand patterns significantly.

**Output:** `data/processed/features.parquet`

---

### Step 3 — Baseline Models

These traditional models are trained first so we have a **benchmark to beat**. They answer: "What would a simple, well-known method achieve?"

#### A. Seasonal Naive Baseline
**File:** [baseline_naive.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_naive.py)

The simplest possible forecast: **"Tomorrow will be the same as the same weekday last week."**

- No training required
- Fast but ignores promotions, holidays, trends

#### B. SARIMA Baseline
**File:** [baseline_sarima.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_sarima.py)

**Seasonal AutoRegressive Integrated Moving Average** — the classical statistics approach.

- Configured as `SARIMA(1,1,1)(1,1,1)[7]` — weekly seasonality
- **Fit separately per store/series** (one model per time series)
- Handles trends and seasonality mathematically

**Drawback:** Slow (one model per series), can't use external features like promotions easily.

#### C. Prophet Baseline
**File:** [baseline_prophet.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_prophet.py)

Facebook's Prophet model:

- Automatically decomposes into trend + weekly + yearly seasonality
- Natively supports holiday regressors
- Also **per-series** (one model per store/SKU)

**Drawback:** Same scalability issue — 1,000 stores = 1,000 separate models.

---

### Step 4 — LightGBM Global Model (The Main Model)

**File:** [train_lightgbm.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/train_lightgbm.py)

This is the **star of the show**. Instead of one model per store/SKU, we train a **single global model** using ALL stores/SKUs together.

#### Why "Global"?

| Approach | Models trained | Learns cross-series? |
|:---------|:-------------|:---------------------|
| Per-series (SARIMA/Prophet) | 1 per store/SKU | ❌ No |
| **Global (LightGBM)** | **1 total** | **✅ Yes** |

A single global model learns that "stores in city centers behave differently from suburban stores" and "promotions in summer have a different impact than in winter" — patterns that per-series models simply cannot see.

#### Training Pipeline

```
features.parquet
      │
      ├── train set  (dates ≤ 2015-06-19)
      ├── valid set  (2015-06-20 → 2015-07-17)  ← early stopping uses this
      └── test set   (2015-07-18 → 2015-08-14)  ← held out, never seen during training
```

**Key hyperparameters from config.yaml:**
```yaml
objective: tweedie          # Good for sparse/zero-inflated sales
tweedie_variance_power: 1.1
num_leaves: 128             # Tree complexity
learning_rate: 0.03         # Small lr + many trees = stable convergence
n_estimators: 3000          # Max trees
early_stopping_rounds: 100  # Stop if validation doesn't improve for 100 rounds
feature_fraction: 0.8       # Subsample features per tree (prevents overfitting)
bagging_fraction: 0.8       # Subsample data per tree (prevents overfitting)
```

**Why Tweedie objective?** Sales data often has many zeros (closed stores, zero-demand days). Tweedie distribution handles this "zero-inflated, right-skewed" shape better than standard MSE.

**Outputs:**
- `models/lightgbm_model.txt` — saved trained model
- `reports/lightgbm_predictions.parquet` — test set predictions
- `reports/feature_importance.csv` — which features drove predictions most

---

### Step 5 — Hierarchical Reconciliation: `reconcile.py`

**File:** [reconcile.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/reconcile.py)

#### The Problem

If LightGBM predicts:
- Store A, Item 1 → 50 units
- Store A, Item 2 → 30 units

But independently predicts:
- Store A (total) → 100 units

There's a **contradiction**: 50 + 30 = 80, not 100. Supply chain planners need these numbers to be consistent.

#### Two Reconciliation Methods

**Method 1: Bottom-Up (default)**
```
SKU-level forecasts  →  Sum up  →  Store-level forecasts  →  Sum up  →  Region-level
```
Trust the most granular level, aggregate upward by simple summation.

**Method 2: MinT (Minimum Trace)**
A more sophisticated approach using weighted least squares. It:
1. Computes the historical forecast error variance per series
2. Down-weights noisier series (high variance = less trust)
3. Uses those weights when aggregating

**Hierarchy configured in config.yaml:**
```yaml
reconciliation:
  hierarchy: [item_id, store_id, region]  # most → least granular
```

**Output:** `reports/reconciled_forecasts.parquet`

---

### Step 6 — Evaluation: `metrics.py`

**File:** [metrics.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/evaluation/metrics.py)

Four metrics are computed to assess forecast quality:

| Metric | Formula | Purpose |
|:-------|:--------|:--------|
| **WMAPE** | `Σ\|error\| / Σ\|actual\|` | Primary metric — weighted by volume so high-selling SKUs matter more |
| **MAPE** | Mean `\|error/actual\|` | Simple percentage error |
| **RMSE** | `√(mean(error²))` | Penalizes large errors heavily |
| **Bias** | `mean(pred - actual) / mean(actual)` | Positive = over-forecasting, Negative = under-forecasting |

#### Business Cost Impact Estimate
Beyond accuracy metrics, the code estimates **actual dollar impact**:

```python
# Under-forecast → Stockout cost (lost revenue)
# Over-forecast  → Overstock cost (holding + wastage cost)

reduction_pct = (baseline_cost - model_cost) / baseline_cost × 100
```

This answers: **"How much money does our ML model save over the naive baseline?"**

---

## 🗂️ How Everything Connects

```
configs/config.yaml           ← Central control: one file to rule all settings
        │
        ├── dataset.name      → load_data.py     → long_format.parquet
        ├── features.*        → build_features.py → features.parquet
        ├── model.lightgbm.*  → train_lightgbm.py → lightgbm_model.txt
        ├── model.sarima.*    → baseline_sarima.py → sarima_predictions.parquet
        ├── model.prophet.*   → baseline_prophet.py → prophet_predictions.parquet
        ├── reconciliation.*  → reconcile.py     → reconciled_forecasts.parquet
        └── evaluation.*      → metrics.py       → evaluation summaries
```

---

## 🧠 Key Concepts Summary

| Concept | Simple Explanation |
|:--------|:------------------|
| **Long format** | One row per (store, date) or (store, item, date) — standard for time series ML |
| **Lag features** | "What was the sales 7 days ago?" — gives the model historical memory |
| **Rolling windows** | Smoothed averages — captures trend at different timescales |
| **Data leakage** | Using future data to predict the future — we prevent this by shifting features |
| **Global model** | One model trained on ALL series — learns cross-series patterns |
| **Tweedie loss** | Loss function for zero-heavy, skewed data like retail sales |
| **Early stopping** | Stops training when validation metric stops improving — prevents overfitting |
| **WMAPE** | Primary accuracy metric — emphasizes accuracy on high-volume items |
| **Hierarchical reconciliation** | Makes SKU + store + region forecasts mathematically consistent |
| **Bottom-up** | Simplest reconciliation: trust lowest level, sum upward |
| **MinT** | Smarter reconciliation: weight by historical accuracy before summing |
