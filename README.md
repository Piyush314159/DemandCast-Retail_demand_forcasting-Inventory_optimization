# DemandCast

Retail sales forecasting pipeline and an illustrative inventory dashboard.

## Current implementation

- Python ingestion, lag/rolling/calendar features, LightGBM, seasonal-naive, Prophet and SARIMA.
- A single chronological train/validation/test split configured in `configs/config.yaml`; repeated rolling-origin cross-validation is not implemented.
- Bottom-up aggregation across available hierarchy columns. Missing hierarchy levels are logged and skipped; Rossmann store sales do not establish SKU-level inventory performance.
- MinT is unavailable. The former inverse-error weighting used test outcomes and was not MinT. Selecting `method: mint` now raises an explicit error without consuming evaluation targets.
- The Next.js dashboard contains simulated charts, inventory, pipeline controls, and financial examples. Its assistant explains demo data; it does not query live forecasts or inventory. Adding an LLM API key does not connect a data pipeline.

## Saved prediction audit

Run from the project root:

```bash
python -m src.evaluation.audit_saved_predictions --reports-dir reports
```

The audit validates unique keys, finite values and matching observed sales, intersects model coverage, and writes `reports/saved_prediction_audit.json` with file hashes. Current saved artifacts share **15,610 observations, 2015-07-18 through 2015-07-31**.

| Saved model output | WMAPE | RMSE | Rows in original artifact |
|---|---:|---:|---:|
| lightgbm | 4.607% | 416.340 | 15,610 |
| naive | 29.968% | 2372.019 | 46,830 |
| prophet | 19.358% | 1498.568 | 46,830 |
| sarima | 20.502% | 1652.404 | 46,830 |

These are descriptive artifact metrics, not a controlled model leaderboard. LightGBM uses realized prior sales in precomputed lag and rolling features. Prophet and SARIMA forecast from an earlier origin, while seasonal-naive uses realized lagged sales. Aligning target dates does not align forecast horizons or available information. A fixed-origin multi-step comparison requires a new consistent backtest. The original 7.1% benchmark and training-time table were not substantiated by these saved artifacts and have been withdrawn.

No measured 38.2% inventory-cost reduction or $18,400 monthly savings is established. `reports/cost_impact.md` describes an illustrative error-cost calculation; actual replenishment outcomes require explicit lead times, stock, service policies, and cost assumptions. No measured MinT improvement is claimed.

## Run the pipeline

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run_pipeline.py --config configs/config.yaml
```

Supply the dataset files expected by the configuration. The configured test end can exceed the dates available in the source data; report actual coverage from artifacts. Keep `reconciliation.method: bottom_up`.

## Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

The dashboard starts as a demo. An optional API key enables generated explanations of the same simulated catalogue. Example UI metrics are not the Python artifact audit. No orders are executed.

## Checks

```bash
python -m unittest tests.test_saved_prediction_audit -v
python -m pytest tests
```

Historical tutorials in the repository describe intended capabilities. This README, the audit JSON, and current executable code define the verified implementation. Previous exports should not be used as evidence of current results.
