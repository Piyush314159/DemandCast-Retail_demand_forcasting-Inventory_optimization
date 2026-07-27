# 📚 How to Study the Demand Forecasting Project — Step by Step

This guide walks you through **every file and notebook** in the correct order, explaining what each does and what to focus on.

---

## 🗺️ Project at a Glance

```
demand-forecasting/
├── README.md                        ← START HERE
├── requirements.txt                 ← Dependencies
├── configs/config.yaml              ← Central config (all knobs)
├── notebooks/
│   ├── 01_eda.ipynb                 ← Explore the data
│   ├── 02_baselines.ipynb           ← Baseline models
│   └── 03_lightgbm.ipynb            ← Main model dev
├── src/
│   ├── data/load_data.py            ← Data loading
│   ├── features/build_features.py   ← Feature engineering
│   ├── models/
│   │   ├── baseline_naive.py        ← Seasonal-naive
│   │   ├── baseline_sarima.py       ← SARIMA baseline
│   │   ├── baseline_prophet.py      ← Prophet baseline
│   │   ├── train_lightgbm.py        ← Main model
│   │   └── reconcile.py             ← Hierarchical reconciliation
│   ├── evaluation/metrics.py        ← Metrics calculation
│   └── utils/io.py                  ← Config/logging helpers
├── tests/
│   ├── test_features.py
│   └── test_metrics.py
└── reports/cost_impact.md           ← Business impact report
```

---

## ✅ Step-by-Step Study Plan

---

### 🟢 STEP 1 — Understand the Goal (15 min)
**File:** [README.md](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/README.md)

**What to read:**
- The **Overview** section — understand *what* the project does (SKU-level retail forecasting).
- The **Pipeline Overview** flowchart — this is the big picture of data → features → models → evaluation.
- The **Results table** — understand the models being compared (Naive, SARIMA, Prophet, LightGBM).
- The **Project Structure** — map the folder layout in your head before touching code.

**Key questions to answer:**
- What dataset is being used? (Rossmann or M5)
- What is the target variable? (`sales`)
- What metric is used to compare models? (`WMAPE`)
- What does "hierarchical reconciliation" mean at a high level?

---

### 🟢 STEP 2 — Understand the Configuration (10 min)
**File:** [configs/config.yaml](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/configs/config.yaml)

**What to read:**
- `dataset:` — which dataset, where raw/processed data lives.
- `split:` — how train/validation/test dates are divided (rolling-origin strategy).
- `features:` — which lags, rolling windows, and flags are used.
- `model:` — hyperparameters for LightGBM, SARIMA, and Prophet.
- `reconciliation:` — bottom-up vs. MinT, and the hierarchy levels.
- `evaluation:` — the primary metric and output directory.

**Why this matters:** Every Python module reads from this single file. Changing one value here changes the whole pipeline. This is the "control panel."

---

### 🟢 STEP 3 — Understand Dependencies (5 min)
**File:** [requirements.txt](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/requirements.txt)

| Library | Role in This Project |
|:--------|:--------------------|
| `pandas`, `numpy` | Data manipulation |
| `lightgbm` | Main forecasting model |
| `scikit-learn` | Utilities, cross-validation |
| `statsmodels` | SARIMA baseline |
| `prophet` | Prophet baseline |
| `optuna` | Hyperparameter optimization |
| `pyyaml` | Reading `config.yaml` |
| `matplotlib`, `seaborn` | Plotting |
| `pyarrow` | Fast parquet I/O |
| `tqdm` | Progress bars |
| `jupyter` | Running notebooks |

---

### 🟡 STEP 4 — Study Data Loading (20 min)
**File:** [src/data/load_data.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/data/load_data.py)

**What to look for:**
- How raw CSVs are loaded (Rossmann or M5 format).
- Dtype fixes — which columns are cast to what types and why.
- Missing value handling — which columns can have NaNs and how they're filled.
- Calendar joins — how date-based features (holidays, etc.) are merged in at this stage.
- How processed data is written (parquet or CSV) into `data/processed/`.

**Key concepts to understand:**
- Why separate `load_data` from `build_features`? (Clean separation: ingestion vs. transformation.)
- Why save processed data to disk? (Reproducibility — you can re-run feature engineering without re-downloading.)

---

### 🟡 STEP 5 — Study Feature Engineering (25 min)
**File:** [src/features/build_features.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/features/build_features.py)

**What to look for:**
- **Lag features** (`sales_lag_7`, `sales_lag_14`, `sales_lag_28`) — shifted sales values to give the model "memory."
- **Rolling window features** — mean and std over 7/14/28/90 days (shifted to avoid data leakage).
- **Calendar/seasonality features** — day-of-week, week-of-year, month, `is_weekend`, `days_to_next_holiday`.
- **Promo/holiday flags** — binary flags from the raw data joined in here.

**Critical concept — Data Leakage:**
Look for how `.shift()` is applied *before* `.rolling()`. This ensures that at prediction time for day `t`, only days `t-1` and earlier are used. Getting this wrong is the most common mistake in time-series ML.

---

### 🟡 STEP 6 — Understand Utility Helpers (10 min)
**File:** [src/utils/io.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/utils/io.py)

**What to look for:**
- Config loading function — how `config.yaml` is parsed and returned as a Python dict.
- Logging setup — how log messages are formatted across the whole project.

This is a small but important file — every other module imports from it.

---

### 🔴 STEP 7 — Study Baseline Models (30 min)
Study these **in order** — they build from simplest to most complex.

#### 7a. [src/models/baseline_naive.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_naive.py)
- The simplest possible forecast: "next week looks like the same weekday last week."
- Understand why this is used as the *floor* — if your fancy model can't beat this, something is wrong.

#### 7b. [src/models/baseline_sarima.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_sarima.py)
- SARIMA = Seasonal AutoRegressive Integrated Moving Average.
- Fits *one model per time series* (per store/SKU) — expensive but accurate for individual series.
- Look for: how `order` and `seasonal_order` are read from config, how forecasts are serialized.

#### 7c. [src/models/baseline_prophet.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_prophet.py)
- Facebook Prophet — handles seasonality and holidays automatically.
- Also fits one model per series, but is more robust to missing data.
- Look for: how holiday regressors are added, how the `ds`/`y` column naming convention works.

---

### 🔴 STEP 8 — Study the Main Model (30 min)
**File:** [src/models/train_lightgbm.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/train_lightgbm.py)

**What to look for:**
- **Global model** — ONE model trained across ALL stores and SKUs (unlike SARIMA/Prophet which are per-series).
- How categorical features (`store_id`, `item_id`) are encoded for LightGBM.
- The **Tweedie objective** — appropriate for zero-inflated count data like retail sales.
- **Early stopping** — how `early_stopping_rounds` prevents overfitting.
- **Optuna HPO** — how hyperparameters are tuned automatically.
- How the trained model is saved to `models/`.

**Key insight:** This is the most scalable approach — SARIMA/Prophet need N models for N series, while LightGBM uses 1 model for all N series, learning cross-series patterns.

---

### 🔴 STEP 9 — Study Hierarchical Reconciliation (20 min)
**File:** [src/models/reconcile.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/reconcile.py)

**What to look for:**
- **The problem:** Raw LightGBM forecasts for individual SKUs may not sum correctly to store totals, which causes inconsistency in supply chain planning.
- **Bottom-up method:** Forecast at the lowest level (SKU), then sum up.
- **MinT (Minimum Trace):** Statistically optimal reconciliation — adjusts all levels simultaneously.
- How the hierarchy `[item_id, store_id, region]` from config is used here.

---

### 🟣 STEP 10 — Study Evaluation Metrics (15 min)
**File:** [src/evaluation/metrics.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/evaluation/metrics.py)

**What to look for:**
- **WMAPE** (Weighted Mean Absolute Percentage Error) — the primary metric. Weighted by volume so high-selling SKUs matter more.
- **MAPE** — unweighted version.
- **RMSE** — penalizes large errors more.
- **Bias** — is the model systematically over- or under-forecasting?
- **Cost impact estimate** — how forecast error translates to stockout/overstock dollar cost.

---

### 🟣 STEP 11 — Open and Run the Notebooks (60–90 min total)

Open these in Jupyter (`jupyter notebook` in terminal) in order:

#### 📓 [notebooks/01_eda.ipynb](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/notebooks/01_eda.ipynb) — Exploratory Data Analysis
- Distribution of sales across stores and SKUs.
- Seasonality patterns (weekly, yearly).
- Missing data heatmaps.
- Promotion/holiday effect visualization.

#### 📓 [notebooks/02_baselines.ipynb](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/notebooks/02_baselines.ipynb) — Baseline Models
- Running SARIMA and Prophet on sample series.
- Visualizing forecast vs. actual.
- Comparing WMAPE scores of all baselines side-by-side.

#### 📓 [notebooks/03_lightgbm.ipynb](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/notebooks/03_lightgbm.ipynb) — LightGBM Development
- Full model training walkthrough.
- Feature importance plots.
- Optuna HPO trial visualization.
- Final forecast vs. actual at store and SKU level.

---

### 🟣 STEP 12 — Study the Tests (15 min)
**Files:** [tests/test_features.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/tests/test_features.py), [tests/test_metrics.py](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/tests/test_metrics.py)

**What to look for:**
- `test_features.py` — verifies lag/rolling features are computed correctly and that no leakage occurs.
- `test_metrics.py` — verifies WMAPE, RMSE, bias calculations with known inputs and expected outputs.

Tests tell you exactly what the code is *supposed* to do — read them like documentation.

Run all tests with:
```bash
cd /Users/piyushmaji/Desktop/Project/demand-forecasting
python -m pytest tests/ -v
```

---

### 🟣 STEP 13 — Read the Business Report (10 min)
**File:** [reports/cost_impact.md](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/reports/cost_impact.md)

- Understand how a % improvement in WMAPE translates to dollar savings.
- This bridges the ML engineering work to real-world business value.

---

## 🔄 Recommended Full Study Order

```
README.md                      ①
configs/config.yaml            ②
requirements.txt               ③
src/utils/io.py                ④
src/data/load_data.py          ⑤
src/features/build_features.py ⑥
src/models/baseline_naive.py   ⑦
src/models/baseline_sarima.py  ⑧
src/models/baseline_prophet.py ⑨
src/models/train_lightgbm.py   ⑩
src/models/reconcile.py        ⑪
src/evaluation/metrics.py      ⑫
notebooks/01_eda.ipynb         ⑬
notebooks/02_baselines.ipynb   ⑭
notebooks/03_lightgbm.ipynb    ⑮
tests/test_features.py         ⑯
tests/test_metrics.py          ⑰
reports/cost_impact.md         ⑱
```

---

## 💡 Tips for Deeper Understanding

| Tip | How |
|:----|:----|
| **Trace a single data point** | Pick one `store_id`+`item_id` combo, follow it from `load_data.py` all the way to a final forecast |
| **Change config and re-run** | Try adding lag 56 to `features.lags` in `config.yaml` and see what changes |
| **Draw the data flow** | Sketch: raw CSV → processed parquet → feature matrix → model → reconciled forecast |
| **Read tests first** | For `metrics.py` and `build_features.py`, read the tests before the source — they show expected behavior clearly |
| **Run the notebooks** | Don't just read them — execute cell-by-cell and observe the outputs |

---

> [!TIP]
> **Estimated total study time:** ~4–5 hours for a thorough understanding of every file.
> For a quick 1-hour pass: focus on Steps 1, 2, 5, 8, and the three notebooks.
