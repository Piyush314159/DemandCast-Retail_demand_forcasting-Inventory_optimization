# DemandCast implementation review

## Addressed

- **Unavailable same-day input:** new LightGBM training excludes `Customers`/`customers`; old model outputs retain their historical status and are not presented as deployment evidence.
- **Category vocabulary contamination:** LightGBM category labels are fitted from training rows only; unseen validation/test labels use the unknown code.
- **Incorrect lags across missing days:** lag lookups use exact calendar offsets. Rolling windows retain calendar gaps as missing and exclude the current day's target.
- **Configuration and split failures:** chronological split order, nonempty evaluation windows, positive lag/window offsets and unique series/date keys are validated. Feature flags now control calendar, promotion and holiday fields.
- **Optional dependency and native-runtime conflicts:** selected pipeline stages run in isolated Python processes. Tree and neural-model native libraries cannot collide within one stage. PyTorch is optional and the GRU stage is opt-in.
- **Unfair recurrent-model evaluation:** the attention GRU and weekly seasonal baseline share one forecast origin, horizon, store set and observed outcomes. Training scales use only training observations. Validation selects the checkpoint, not test results. Training origins rotate through weekdays.
- **Simulated dashboard results:** the active website reads actual SQL-derived snapshots. Invalid forecasts fail the export and preserve its previous snapshot; missing data is shown explicitly. Report metadata is checked against the GRU prediction table.
- **Browser API-key exposure and provider misuse:** the active UI and API no longer use public-prefixed API keys, accept provider credentials or make paid provider calls. The local guide validates input and same-origin requests and explains actual saved results.
- **Nonworking controls:** forecast filters, store search, real file exports, snapshot refresh, navigation and the unit-demand scenario calculator are implemented. The website does not simulate successful training or purchasing operations.
- **Professional presentation:** a forecasting desk uses a navy masthead, horizontal navigation, cobalt and orange chart signals, condensed headings, and monospaced metrics. The overview combines a continuous metrics strip, a prominent chart and a measured model-comparison brief. Responsive layouts, labelled controls, keyboard focus, dialog dismissal/focus handling and reduced-motion support are included.

## Evidence and limits

The exported recurrent run covers all 1,115 stores over 15,610 observations, 18–31 July 2015. Its forecast origin is 17 July 2015. WMAPE is 20.134% for the GRU versus 20.920% for the matched weekly baseline; RMSE is 1727.716 versus 1846.084. The GRU is exploratory and trained on recent windows with a fixed seed and validation-based early stopping. One historical origin does not establish robustness or a production model choice.

Remaining work includes repeated rolling-origin evaluation, a consistently evaluated corrected LightGBM model, forecast uncertainty calibration and live data ingestion. Historical artifact comparisons remain descriptive. The existing old LightGBM model has not been retrained as part of this change. Calendar gaps in source data are surfaced, not invented or zero-filled. Rossmann store revenue does not establish SKU inventory outcomes. MinT remains unimplemented. The planner's service-level formulas assume independent daily unit demand and fixed lead times; supplier variability and correlated demand require a richer policy.

The website is a local research workspace. Shared production hosting would need an appropriate access policy and a deliberate data-publication workflow; this change does not publish the dataset or website.

## Verification

- 38 Python tests passed, including real isolated MySQL integration tests, LightGBM training, training-only vocabulary/provenance, GRU checkpoint reload, temporal boundaries, calendar gaps and atomic snapshot export.
- Production website build and TypeScript checks passed.
- Migration verified all seven full-data tables against their source frames. The dashboard export completed against MySQL for 1,017,209 sales records and 1,115 stores. Feature generation and recurrent/tree-model training also passed against isolated MySQL test fixtures.
- Local HTTP checks passed for overview and per-store data, missing selections, malformed/oversized questions, cross-origin rejection, credential rejection and evidence-guide responses.
- Browser checks verified model/store selection, search, a downloaded 14-row store CSV, inventory recalculation, the guide, data-health results and the mobile layout.
- The overview response is approximately 1.1 MB instead of the full 11.6 MB snapshot; store histories load on selection.


## MySQL migration

The runtime database adapter now uses MySQL 8.4 through SQLAlchemy and PyMySQL. Connection credentials come from the project-root `.env` or an explicit MySQL URL. A local helper initializes and controls the project's dedicated server; port 3307 avoids an existing service on port 3306. The SQLite database and completed migration helper were removed during the requested cleanup after confirming all seven MySQL tables.

MySQL publication stages and indexes a complete frame, then atomically renames its data and companion type-metadata tables. Readers hold metadata locks in a transaction to avoid mixed-version reads. The metadata registry is a view over the current per-table metadata. Tests use actual isolated MySQL schemas, rather than SQLite emulation.

The dashboard's snapshot source and evidence guide identify MySQL. The frontend design and forecasting algorithms are unchanged by this storage migration.

Verified migrated rows: `sales` 1,017,209; `gru_predictions` 15,610; `lightgbm_predictions` 15,610; `naive_predictions` 46,830; `prophet_predictions` 46,830; `sarima_predictions` 46,830; `reconciled_forecasts` 31,220. The superseded SQLite backup was removed after migration verification. The refreshed website snapshot contains six model/baseline outputs from MySQL, and the production website build passed.


## Repository cleanup

Removed the superseded SQLite database and its completed migration helper, eight disconnected demo components, the mock-data module, five unused starter graphics, obsolete dashboard-only AI key configuration, an outdated UI screenshot and generated caches. The current ForecastWorkspace, MySQL data/credentials, trained models, source datasets, notebooks and Parquet inputs/audit artifacts are retained. The database CLI now supports MySQL queries and Parquet imports only.
