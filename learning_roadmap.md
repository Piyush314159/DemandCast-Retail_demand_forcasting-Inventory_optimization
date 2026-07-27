# 🏔️ The Complete Learning Hill — Demand Forecasting Project

> A stepwise roadmap from zero to fully understanding every line of this project.
> Each level has a **goal**, **exact files to read/run**, and a **checkpoint** to confirm you've got it.

---

## 📥 Where to Get the Data

This project supports **two datasets**. Pick one to start — **Rossmann is easier**.

### Dataset 1 — Rossmann Store Sales *(Recommended for beginners)*
| | |
|:--|:--|
| **Source** | [kaggle.com/c/rossmann-store-sales](https://www.kaggle.com/c/rossmann-store-sales) |
| **Size** | ~40 MB, easy to work with |
| **What it is** | 1,115 German pharmacy stores, daily sales from 2013–2015 |
| **Files you download** | `train.csv`, `store.csv`, `test.csv` |
| **Drop them in** | `data/raw/` |

### Dataset 2 — M5 Forecasting Accuracy *(More complex, Walmart scale)*
| | |
|:--|:--|
| **Source** | [kaggle.com/c/m5-forecasting-accuracy](https://www.kaggle.com/c/m5-forecasting-accuracy) |
| **Size** | ~450 MB |
| **What it is** | 30,490 Walmart item-store combinations across 3 US states |
| **Files you download** | `sales_train_validation.csv`, `calendar.csv`, `sell_prices.csv` |
| **Drop them in** | `data/raw/` |

> [!TIP]
> You need a free Kaggle account. Go to the competition page → Data tab → Download All.
> After downloading, unzip and place files directly in `data/raw/` (no subfolders).

---

## 📂 The Two Data Folders Explained

```
data/
├── raw/          ← YOU put files here (from Kaggle). Never modified by code.
└── processed/    ← CODE puts files here. Auto-generated. Safe to delete & rebuild.
```

### `data/raw/` — What goes in (you manually place these)

**For Rossmann:**
| File | What it contains |
|:-----|:-----------------|
| `train.csv` | ~1M rows: Store, Date, Sales, Promo, StateHoliday, SchoolHoliday |
| `store.csv` | 1,115 rows of store metadata: type, competition distance, assortment |

**For M5:**
| File | What it contains |
|:-----|:-----------------|
| `sales_train_validation.csv` | Wide-format table: 30,490 items × 1,913 day columns (`d_1`, `d_2` … `d_1913`) |
| `calendar.csv` | Maps day IDs (`d_1` etc.) to real dates + event/holiday info |
| `sell_prices.csv` | Item × store × week → sell price (used as a feature) |

### `data/processed/` — What the code generates (auto-created)

| File | Created by | What it is |
|:-----|:-----------|:-----------|
| `long_format.parquet` | `load_data.py` | Raw data merged & standardized into one long table (one row = one store+item+day) |
| `features.parquet` | `build_features.py` | `long_format` + all engineered features added as new columns |

> [!NOTE]
> **Parquet** is like a compressed, fast-loading version of CSV. pandas reads it with `pd.read_parquet()`.
> The pipeline converts everything to parquet for speed — Rossmann has ~1M rows, M5 has ~58M rows.

---

## 🏔️ The 7-Level Hill of Learning

```
                                    ▲
                              ┌─────┴─────┐
                              │  Level 7  │  Extend & Own
                           ┌──┴───────────┴──┐
                           │    Level 6      │  Reconciliation
                        ┌──┴─────────────────┴──┐
                        │       Level 5         │  LightGBM (Main Model)
                     ┌──┴───────────────────────┴──┐
                     │          Level 4            │  Baselines
                  ┌──┴─────────────────────────────┴──┐
                  │             Level 3               │  Feature Engineering
               ┌──┴───────────────────────────────────┴──┐
               │                Level 2                  │  The Data
            ┌──┴─────────────────────────────────────────┴──┐
            │                   Level 1                     │  The Problem
            └───────────────────────────────────────────────┘
```

---

### 🟫 Level 1 — Understand the Problem *(~1 hour)*

**Goal:** Be able to explain in plain English what this project does and why it matters.

**Read:**
- [`README.md`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/README.md) — top to bottom
- [`configs/config.yaml`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/configs/config.yaml) — every line, with comments

**Core concepts to Google if unfamiliar:**
- What is SKU-level forecasting?
- What is WMAPE and how is it different from MAPE?
- What does "hierarchical" mean in forecasting? (SKU → Store → Region)

**✅ Checkpoint:** Answer these without looking:
1. What is the target variable (what are we predicting)?
2. What does `id_cols: [store_id, item_id]` mean in context?
3. What are the three date splits and why do we need all three?

---

### 🟧 Level 2 — Understand the Data *(~2 hours)*

**Goal:** Know the raw data shape, columns, and what a single row means.

**Do:**
1. Download Rossmann from Kaggle → put `train.csv` + `store.csv` in `data/raw/`
2. Open `notebooks/01_eda.ipynb` in Jupyter
3. Manually open `train.csv` in a text editor or Excel first — read 10 rows

**Read the code that loads it:**
- [`src/data/load_data.py`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/data/load_data.py)

**Focus on these lines in `load_rossmann()`:**
```python
df = train.merge(store, on="Store", how="left")   # joins the two CSV files
df["item_id"] = df["store_id"].astype(str)         # Rossmann has no items — store IS the series
```
This tells you: **Rossmann is store-level only** (no individual products). The `item_id` is just the store ID repeated — a simplification.

**Run it:**
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m src.data.load_data --config configs/config.yaml
```
Then inspect what was created:
```python
import pandas as pd
df = pd.read_parquet("data/processed/long_format.parquet")
print(df.shape)      # how many rows?
print(df.dtypes)     # what are the column types?
print(df.head(10))   # what does one row look like?
```

**✅ Checkpoint:**
1. How many rows does `long_format.parquet` have?
2. What do the columns `state_holiday` and `school_holiday` contain?
3. Why is `item_id` the same as `store_id` in the Rossmann version?

---

### 🟨 Level 3 — Feature Engineering *(~3 hours)*

**Goal:** Understand why we transform raw data into features, and specifically why **shift/lag** prevents data leakage.

**Read:**
- [`src/features/build_features.py`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/features/build_features.py)

**The 4 feature groups — understand each one:**

#### 1. Calendar Features (`add_calendar_features`)
```python
df["day_of_week"] = df[date_col].dt.dayofweek   # 0=Monday … 6=Sunday
df["is_weekend"]  = df["day_of_week"].isin([5, 6]).astype(int)
df["week_of_year"] = ...
df["month"] = ...
```
*Why:* Retail sales have strong weekly/monthly seasonality. Monday ≠ Saturday.

#### 2. Lag Features (`add_lag_features`)
```python
df[f"sales_lag_7"]  = grouped.shift(7)   # "what did we sell 7 days ago?"
df[f"sales_lag_14"] = grouped.shift(14)
df[f"sales_lag_28"] = grouped.shift(28)
```
*Why:* The model can't see today's future — but it CAN use past sales as a signal.

#### 3. Rolling Window Features (`add_rolling_features`) ⚠️ Most important
```python
shifted = df.groupby(id_cols)[target_col].shift(1)  # shift FIRST
# then rolling mean/std on the shifted series
```
> [!IMPORTANT]
> **The `.shift(1)` before rolling is the critical anti-leakage step.**
> Without it, the rolling mean for day T would include day T's own sales — the model would be "cheating" by looking at what it's trying to predict.
> With `.shift(1)`, the window only covers days up to T-1.

#### 4. Promo/Holiday Features (`add_promo_holiday_features`)
```python
df["is_state_holiday"] = (df["state_holiday"].astype(str).ne("0")).astype(int)
```
*Why:* Promotions and holidays cause spikes/dips that the model needs to be aware of.

**Run it:**
```bash
python -m src.features.build_features --config configs/config.yaml
```
Then check the output:
```python
df = pd.read_parquet("data/processed/features.parquet")
print(df.columns.tolist())   # see all new feature columns
print(df[["sales", "sales_lag_7", "sales_roll_mean_28"]].head(30))
```
Notice the NaN values at the top of each series — these exist because there's no "7 days ago" for the first 7 rows. The LightGBM model handles NaNs automatically.

**✅ Checkpoint:**
1. Why does `sales_roll_mean_28` have NaN values for the first 28 rows of each series?
2. What would happen to model accuracy if you removed the `.shift(1)` in rolling features?
3. How many total columns does `features.parquet` have compared to `long_format.parquet`?

---

### 🟩 Level 4 — Baseline Models *(~2 hours)*

**Goal:** Understand what you're trying to beat before using a complex model.

**The philosophy:** Always establish baselines. A "good" model is only good if it beats simple alternatives.

#### Baseline 1 — Seasonal Naive
**Read:** [`src/models/baseline_naive.py`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_naive.py)

```python
return df.groupby(id_cols)[target_col].shift(season_length)  # that's the whole model!
```
*Prediction = sales from the same weekday last week.*  
This is astonishingly simple but often surprisingly hard to beat.

#### Baseline 2 — SARIMA
**Read:** [`src/models/baseline_sarima.py`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_sarima.py)

SARIMA = **S**easonal **A**uto**R**egressive **I**ntegrated **M**oving **A**verage.  
From config: `order: [1,1,1]` + `seasonal_order: [1,1,1,7]`  
*One separate SARIMA model is fitted per store/SKU series.*  
**Weakness:** Doesn't scale — fitting 1,115 SARIMA models takes significant time.

#### Baseline 3 — Prophet
**Read:** [`src/models/baseline_prophet.py`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/baseline_prophet.py)

Facebook Prophet decomposes time series into trend + weekly seasonality + yearly seasonality + holidays.  
Still one model per series, but more automatic than SARIMA.

**Run them:**
```bash
python -m src.models.baseline_sarima  --config configs/config.yaml
python -m src.models.baseline_prophet --config configs/config.yaml
```

**✅ Checkpoint:**
1. Why is SARIMA "per-series" a scaling problem for M5 (30,490 series)?
2. What does the `[1,1,1]` in SARIMA `order` mean? (Google: ARIMA p,d,q)
3. What does the `7` in `seasonal_order` mean?

---

### 🟦 Level 5 — LightGBM (The Main Model) *(~4 hours)*

**Goal:** Understand why a single global gradient boosting model outperforms per-series statistical models.

**Read:** [`src/models/train_lightgbm.py`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/train_lightgbm.py)

**The key insight — "global" model:**
```python
# ALL stores, ALL items, ALL dates → trained together as one model
lgb_train = lgb.Dataset(train[feature_cols], label=train[target_col], ...)
```
Instead of 1,115 separate models (one per store), there's ONE model that learns patterns shared across all stores.  
This works because: *if Store A and Store B both have promotions, the promotion signal is stronger with cross-series learning.*

**Key design decisions in the code:**

| Decision | Line | Why |
|:---------|:-----|:----|
| `objective: tweedie` | config.yaml | Sales data has many zeros & is right-skewed. Tweedie handles this better than MSE. |
| `early_stopping_rounds: 100` | config.yaml | Stops training when validation loss stops improving — prevents overfitting |
| `categorical_feature=cat_features` | train_lightgbm.py L54 | store_id, item_id are IDs, not numbers — LightGBM handles them natively |
| Time-based splits | `make_splits()` | Train on past, validate on immediate future, test on further future — never random |

**The three-way split:**
```
─────────────────────────────────────────────────────▶ time
│          TRAIN           │   VALID   │    TEST   │
│   up to 2015-06-19       │  4 weeks  │  4 weeks  │
│  (model learns here)     │  (tuning) │ (report)  │
```

**Run it:**
```bash
python -m src.models.train_lightgbm --config configs/config.yaml
```
Watch the training log — you'll see `[100]  train's tweedie: X  valid's tweedie: Y` printed every 100 rounds.  
The gap between train and valid scores tells you about overfitting.

**After running, check the outputs:**
```python
import pandas as pd
imp = pd.read_csv("reports/feature_importance.csv")
print(imp.head(15))   # which features matter most?
```

**✅ Checkpoint:**
1. Why do we use `tweedie` objective instead of `regression` (MSE)?
2. What would happen if we used random CV instead of time-based splits?
3. In `feature_importance.csv`, which top 3 features have the highest gain? Does the ranking make intuitive sense?

---

### 🟪 Level 6 — Hierarchical Reconciliation *(~2 hours)*

**Goal:** Understand why raw ML forecasts are "incoherent" and how reconciliation fixes that.

**The Problem:**
```
LightGBM predicts:
  Store 1 → Item A: 100 units
  Store 1 → Item B: 50  units
  Store 1 total:    180 units  ← ❌ doesn't add up! (100 + 50 ≠ 180)
```
This is incoherence — the model independently forecasts every level, so they don't sum correctly. This breaks supply chain planning.

**Read:** [`src/models/reconcile.py`](file:///Users/piyushmaji/Desktop/Project/demand-forecasting/src/models/reconcile.py)

**Method 1 — Bottom-Up (default):**
```python
def bottom_up_reconcile(df, hierarchy, pred_col):
    for level in hierarchy:
        agg = df.groupby(group_cols + ["date"])[pred_col].sum()  # just sum up!
```
Ignore higher-level forecasts. Trust the base (SKU) level, sum everything up. Simple and always coherent.

**Method 2 — MinT (diagonal approximation):**
```python
residual_var = ...  # compute how "noisy" each series' forecasts were historically
weights = 1 / residual_var  # noisier series get lower weight
```
Weight the base forecasts by how reliable each series has been. Better in theory, but more complex.

**Run it:**
```bash
python -m src.models.reconcile --config configs/config.yaml
# outputs: reports/reconciled_forecasts.parquet
```

**✅ Checkpoint:**
1. Why does incoherence matter for a supply chain manager but not for a pure accuracy benchmark?
2. What does `hierarchy: [item_id, store_id, region]` mean for the order of summation?
3. When would MinT beat bottom-up? When would it be worse?

---

### 🟥 Level 7 — Extend & Own the Project *(ongoing)*

**Goal:** Go beyond running the pipeline — make it yours.

**Experiment ideas, ordered by difficulty:**

| Difficulty | Experiment | What you'll learn |
|:----------:|:-----------|:------------------|
| ⭐ | Add `days_to_next_holiday` as a feature in `build_features.py` | Feature engineering intuition |
| ⭐ | Change `learning_rate` from 0.03 → 0.1 in config — see WMAPE change | Hyperparameter sensitivity |
| ⭐⭐ | Plot `sales` vs `sales_lag_7` correlation for one store | Why lag features work |
| ⭐⭐ | Remove all lag features, retrain, compare WMAPE | Feature importance validation |
| ⭐⭐ | Switch dataset from `rossmann` to `m5` in config | Scale & complexity difference |
| ⭐⭐⭐ | Add Optuna hyperparameter search (the infra is already built) | AutoML / HPO concepts |
| ⭐⭐⭐ | Write a new metric in `metrics.py` — e.g. SMAPE | Code extension skills |
| ⭐⭐⭐⭐ | Replace LightGBM with XGBoost or CatBoost | Model comparison |
| ⭐⭐⭐⭐⭐ | Add a neural baseline (e.g. N-BEATS or a simple LSTM) | Deep learning for time series |

---

## 🗓️ Suggested Timeline

| Day | Focus | Output |
|:----|:------|:-------|
| Day 1 | Level 1 + 2: understand problem, download data, run `load_data.py` | `long_format.parquet` exists |
| Day 2 | Level 3: read & run `build_features.py`, inspect features | `features.parquet` exists |
| Day 3 | Level 4: run all baselines, record WMAPE numbers | Baseline WMAPE in notes |
| Day 4 | Level 5: run LightGBM, read training logs, inspect feature importance | LightGBM WMAPE < baselines |
| Day 5 | Level 6: run reconciliation, understand output table | `reconciled_forecasts.parquet` exists |
| Day 6+ | Level 7: experiments, extensions, making it your own | Your own improvements |

---

## 📚 Concept Glossary

| Term | Plain-English Meaning |
|:-----|:----------------------|
| **SKU** | Stock Keeping Unit — one specific product variant |
| **Lag feature** | "What was the value N days ago?" — used as model input |
| **Rolling window** | Average/std of the last N days — smooths out noise |
| **Data leakage** | Accidentally using future information during training — makes results unrealistically good |
| **WMAPE** | `sum(|actual - predicted|) / sum(actual)` — errors weighted by sales volume |
| **Global model** | One ML model trained on all series at once (vs one model per series) |
| **Hierarchical reconciliation** | Making sure item forecasts sum to store forecasts, which sum to region forecasts |
| **Bottom-up** | Trust the most granular forecasts; sum them upward |
| **MinT** | A smarter reconciliation that weights series by their historical forecast reliability |
| **Tweedie** | A probability distribution for non-negative, zero-inflated data (like sales) |
| **Early stopping** | Stop training when validation loss stops improving — prevents overfitting |
| **Parquet** | Efficient columnar file format — much faster to read than CSV for large data |
