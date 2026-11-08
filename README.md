# DemandCast

Retail sales forecasting with an attention GRU, classical baselines, SQL storage, and a professional dashboard connected to actual saved predictions.

## Current implementation

- Python ingestion, calendar-aware lag/rolling features, LightGBM, seasonal-naive, Prophet, SARIMA, and an optional **attention GRU**.
- The GRU uses 56 days of history, predicts 14 days directly, scales from training observations only, and selects its checkpoint using validation WMAPE. Future inputs contain calendar features only.
- A matched fixed-origin seasonal baseline is evaluated on the same stores, dates and horizon as the GRU. The recurrent model is an additional option; it does not silently replace LightGBM.
- A single chronological train/validation/test split configured in `configs/config.yaml`; repeated rolling-origin cross-validation is not implemented.
- Bottom-up aggregation across available hierarchy columns. Missing hierarchy levels are logged and skipped; Rossmann store sales do not establish SKU-level inventory performance.
- MinT is unavailable. The former inverse-error weighting used test outcomes and was not MinT. Selecting `method: mint` now raises an explicit error without consuming evaluation targets.
- The Next.js workspace reads a pipeline-exported snapshot of actual MySQL predictions, with store filtering, model exploration, data checks, CSV/JSON/Markdown exports and a local evidence guide. The inventory planner is an explicit calculator with editable assumptions; it does not place orders.
- Same-day customer counts are excluded from new LightGBM training, and category vocabularies are fitted on training rows only. Old saved LightGBM outputs require retraining to reflect these fixes.
- Calendar gaps remain missing rather than zero. Lag and rolling features use calendar days, not previous row positions.

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

These are descriptive artifact metrics, not a controlled model leaderboard. The historical LightGBM run also included contemporaneous `Customers`, which is unavailable at forecast time; the 4.607% result must not be treated as deployment accuracy. New training excludes this input. LightGBM uses realized prior sales in precomputed lag and rolling features. Prophet and SARIMA forecast from an earlier origin, while seasonal-naive uses realized lagged sales. Aligning target dates does not align forecast horizons or available information. A fixed-origin multi-step comparison requires a new consistent backtest. The original 7.1% benchmark and training-time table were not substantiated by these saved artifacts and have been withdrawn.

No measured 38.2% inventory-cost reduction or $18,400 monthly savings is established. `reports/cost_impact.md` describes an illustrative error-cost calculation; actual replenishment outcomes require explicit lead times, stock, service policies, and cost assumptions. No measured MinT improvement is claimed.

## Run the pipeline

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/mysql_local.py start  # after the one-time MySQL setup below
python run_pipeline.py --config configs/config.yaml
```

Supply the dataset files expected by the configuration. The configured test end can exceed the dates available in the source data; report actual coverage from artifacts. Keep `reconciliation.method: bottom_up`.

## Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Export actual pipeline results first, from the project root:

```bash
python run_pipeline.py --only dashboard
```

The workspace reads `dashboard/data/workspace.json` through a server route. After an export, use **Refresh forecast data** in the header. Missing or invalid snapshots show an explicit error; no simulated results are substituted. Keep MySQL credentials on the server; the browser receives only the exported snapshot. API keys are not required or accepted by the local guide. Existing `NEXT_PUBLIC_*_API_KEY` variables are no longer used; remove them from local configuration.

The current source is historical Rossmann store-sales revenue, not live sales or SKU unit demand. Historical model scores cannot be ranked against the GRU's controlled backtest.

## Checks

```bash
python -m unittest tests.test_saved_prediction_audit -v
python -m pytest tests
```

Historical tutorials in the repository describe intended capabilities. This README, the audit JSON, and current executable code define the verified implementation. Previous exports should not be used as evidence of current results.

## MySQL database

MySQL 8.4 is the sales and forecast store. SQLAlchemy and PyMySQL connect the Python pipeline to it; SQLite is no longer a runtime backend or a fallback. Parquet files remain compatibility exports, and feature matrices remain in Parquet for training.

The current machine uses a project-local MySQL instance at **127.0.0.1:3307**, database **demandcast**. Port 3306 belongs to another local service. Generated credentials are in the ignored root `.env` with owner-only permissions. They are never included in the dashboard or committed to Git.

For a new macOS installation:

```bash
brew install mysql@8.4
python -m pip install -r requirements.txt
python scripts/mysql_local.py init
```

Initialization creates a dedicated data directory under `data/processed/mysql`, creates the application user, generates private passwords and starts MySQL. It never overwrites an existing data directory. For the already configured local installation, use:

```bash
python scripts/mysql_local.py start
python scripts/mysql_local.py status
# Stop later without deleting data:
python scripts/mysql_local.py stop
```

For an existing MySQL server, configure the root `.env` from `.env.example`: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD`. Provision that database and grant the application user permissions within it, including table/index creation and `CREATE VIEW`. The local helper is only for this project's local instance. `DEMANDCAST_DATABASE_URL` can override the individual settings with a `mysql+pymysql://...` URL; use URL encoding for reserved password characters in a handwritten URL. No credentials belong in YAML. An old `database.path` or SQLite URL raises an explicit error.

The existing sales and forecast data has been migrated and verified in MySQL. The obsolete SQLite database and one-time migration helper have been removed. Saved Parquet files remain in use for training inputs, notebooks, audits and bootstrapping a new MySQL installation.

Bootstrap missing MySQL tables from saved Parquet exports, query a model in SQL, and refresh the website:

```bash
python -m src.data.database --import-existing
python -m src.data.database --model gru
python run_pipeline.py --only dashboard
```

Tables: `sales`, `lightgbm_predictions`, `naive_predictions`, `sarima_predictions`, `prophet_predictions`, `gru_predictions`, and `reconciled_forecasts`. The `dataset_tables` view exposes the type metadata and refresh timestamps. Internal schema tables and row-order keys support safe publication; the DataFrame API returns the original columns.

Each refresh loads and indexes a staging table before an atomic InnoDB rename publishes both data and its schema. Failed imports retain the previous snapshot. Reader transactions prevent mixing old type metadata with newly published data. Database failures are reported instead of switching to SQLite or silently reading stale Parquet files.

MySQL integration tests create fresh, randomly named `demandcast_test_*` schemas using `DEMANDCAST_TEST_MYSQL_URL`, then drop only those schemas. The local initializer generates this private test setting. Without it, MySQL integration tests are explicitly skipped; ordinary model/feature unit tests still run.

## Train the recurrent model

Use Python 3.11 for this project. The virtual environment’s `python`, `python3` and `pip` all use the same Python 3.11 interpreter:

```bash
python -m pip install -r requirements.txt -r requirements-rnn.txt
python run_pipeline.py --only gru dashboard
```

The GRU is opt-in: normal full runs skip it unless `model.gru.enabled` is true. Each selected stage runs in its own Python process, so optional dependencies and conflicting native runtimes do not break unrelated stages.

Measured exploratory backtest (`reports/gru_backtest.json`):

| Model | WMAPE | RMSE |
|---|---:|---:|
| Attention GRU | 20.134% | 1727.716 |
| Matched weekly seasonal baseline | 20.920% | 1846.084 |

Forecast origin: **2015-07-17**, evaluated **2015-07-18 through 2015-07-31**, **1,115 stores / 15,610 observations**. This is a 0.786 percentage-point reduction on one historical window. It is an exploratory single-origin result, not proof of broad superiority. Repeated rolling-origin evaluation remains outstanding. Settings, learning history and measured training time are stored with the report. The checkpoint is `models/gru_model.pt`; predictions are saved to SQL and Parquet.

See `reports/implementation_review.md` for the defects fixed, verification and remaining limitations.
