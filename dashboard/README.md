# DemandCast workspace

A retail forecasting workbench with a navy masthead, horizontal navigation, cobalt and orange chart signals, condensed headings and monospaced figures. A continuous metrics strip leads into a large forecast plot and a measured model-comparison brief. Built with Next.js, React, Recharts and Lucide.

## Run

From the **project root**, start the configured MySQL instance and export its saved predictions:

```bash
python scripts/mysql_local.py start
python run_pipeline.py --only dashboard
```

Then start the website:

```bash
cd dashboard
npm install
npm run dev
```

Open the URL printed by Next.js. After rerunning the export, use the header refresh button. The snapshot is read at request time; no rebuild is required for data updates.

To train the recurrent model and update the website, install `requirements-rnn.txt` in your Python environment and run `python run_pipeline.py --only gru dashboard` from the project root.

## Features

- Overview: real metrics, daily forecasts and stores with high forecast error.
- Forecast explorer: model selection, all-store or individual-store charts, store search and CSV exports.
- Model lab: measured attention-GRU and same-origin seasonal-baseline evaluation, architecture, dates and limitations.
- Inventory planner: explicit unit-demand scenarios with safety stock, reorder points and order-up-to quantities. It does not infer units from Rossmann revenue or place orders.
- Data health: source counts, integrity checks, missing calendar days and export timestamp.
- Reports: actual CSV, JSON and Markdown downloads.
- Workspace guide: deterministic explanations grounded in saved results. No external model, paid provider or API key is used.

## Data contract

`GET /api/workspace` reads `data/workspace.json`. Set server-only `DEMANDCAST_SNAPSHOT_PATH` to use another absolute path. The exporter writes atomically; a failed export retains the last valid snapshot. Missing or malformed snapshots produce a visible error, rather than demo data.

`POST /api/chat` accepts a question of up to 2,000 characters, validates JSON and origin, and returns a local evidence-based explanation. It rejects provider API keys. Previous `NEXT_PUBLIC_*_API_KEY` variables are unused and should be removed from local configuration.

MySQL connection credentials live in the ignored project-root `.env` and are used by Python only. The database is not exposed to the browser. The snapshot contains aggregated sales results and per-store predictions. Deploy only where that dataset is appropriate for the intended audience. Native server hosting is required for the API routes, and the snapshot must be supplied on the server.

## Verification

```bash
npx tsc --noEmit
npm run build
```

The Python suite in the project root checks temporal boundaries, feature leakage safeguards, recurrent training, SQL storage and snapshot exports. Browser checks cover navigation, store selection, search, model results, inventory recalculation and the evidence guide.
