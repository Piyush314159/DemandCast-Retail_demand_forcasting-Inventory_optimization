# Stockout / Overstock Cost-Impact Methodology

This note explains how the "estimated XX% reduction in stockout/overstock cost"
figure is derived once the pipeline is run end-to-end. Fill in the numbers after
generating predictions from `src/models/baseline_naive.py` (or another baseline)
and `src/models/train_lightgbm.py`.

## Method

For each forecast, classify the error as either:
- **Stockout risk** — when the forecast under-predicts demand (`pred < actual`).
  Approximate cost: `(actual - pred) * unit_stockout_cost`.
- **Overstock risk** — when the forecast over-predicts demand (`pred > actual`).
  Approximate cost: `(pred - actual) * unit_overstock_cost`.

`unit_stockout_cost` and `unit_overstock_cost` should reflect your business
context (e.g. lost margin per unit for stockouts, holding/markdown cost per unit
for overstock). See `src/evaluation/metrics.estimate_cost_impact` for the
implementation.

## Results

| Model                   | Total Estimated Cost | Reduction vs. Baseline |
|--------------------------|----------------------|--------------------------|
| Seasonal-naive baseline  | XX                   | —                        |
| LightGBM (final)         | XX                   | **XX%**                  |

## Caveats

- This is a simplified, unit-linear cost model — real stockout/overstock costs
  are often non-linear (e.g. stockouts can cascade into lost customer loyalty).
- Costs are computed at the same granularity as the forecasts; if you reconcile
  forecasts up to store/region level, re-run the cost estimate at the granularity
  your business actually acts on (usually SKU-store level for replenishment).
- Populate `unit_stockout_cost` / `unit_overstock_cost` with figures from
  finance/ops rather than guessing — the relative ranking of models is fairly
  robust to reasonable changes in these numbers, but the absolute % is not.
