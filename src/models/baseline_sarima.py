"""
Per-series SARIMA baseline.

Usage:
    python -m src.models.baseline_sarima --config configs/config.yaml
"""
import argparse

import pandas as pd
# pyrefly: ignore [missing-import]
from statsmodels.tsa.statespace.sarimax import SARIMAX
import warnings
# pyrefly: ignore [missing-import]
from statsmodels.tools.sm_exceptions import ConvergenceWarning
warnings.filterwarnings("ignore", category=ConvergenceWarning)
from tqdm import tqdm

from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)


def fit_predict_sarima(
    series: pd.Series, order: tuple, seasonal_order: tuple, horizon: int
) -> pd.Series:
    """Fit a SARIMA model on `series` and forecast `horizon` steps ahead."""
    model = SARIMAX(
        series,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    forecast = fitted.forecast(steps=horizon)
    return forecast


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])
    reports_dir = ensure_dir(cfg["evaluation"]["output_dir"])

    df = pd.read_parquet(processed_dir / "features.parquet")
    date_col, target_col, id_cols = cfg["date_col"], cfg["target_col"], cfg["id_cols"]
    order = tuple(cfg["model"]["sarima"]["order"])
    seasonal_order = tuple(cfg["model"]["sarima"]["seasonal_order"])

    train_end = pd.to_datetime(cfg["split"]["train_end"])
    test_end = pd.to_datetime(cfg["split"]["test_end"])

    results = []
    groups = list(df.groupby(id_cols))
    n_total = len(groups)
    n_ok, n_fail, n_skip = 0, 0, 0

    # NOTE: for large catalogs, sample a subset of series or parallelize this loop.
    pbar = tqdm(groups, desc="SARIMA", unit="store", dynamic_ncols=True)
    for i, (keys, group) in enumerate(pbar, start=1):
        store_label = keys if not isinstance(keys, tuple) else "/".join(str(k) for k in keys)
        pbar.set_postfix({"store": store_label, "ok": n_ok, "fail": n_fail, "skip": n_skip})

        group = group.set_index(date_col).sort_index()
        train = group.loc[:train_end, target_col].asfreq("D").fillna(0)
        test = group.loc[(group.index > train_end) & (group.index <= test_end), target_col]
        if len(train) < 30 or len(test) == 0:
            n_skip += 1
            continue
        try:
            preds = fit_predict_sarima(train, order, seasonal_order, len(test))
            preds.index = test.index
            results.append(
                pd.DataFrame(
                    {"y_true": test.values, "y_pred": preds.values, "date": test.index}
                ).assign(**dict(zip(id_cols, keys if isinstance(keys, tuple) else [keys])))
            )
            n_ok += 1
        except Exception as e:
            logger.warning(f"SARIMA failed for {keys}: {e}")
            n_fail += 1

    logger.info(f"SARIMA done — {n_ok} ok / {n_fail} failed / {n_skip} skipped out of {n_total} series")


    out = pd.concat(results, ignore_index=True) if results else pd.DataFrame()
    out_path = reports_dir / "sarima_predictions.parquet"
    out.to_parquet(out_path, index=False)
    logger.info(f"SARIMA predictions -> {out_path} ({len(out):,} rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    main(args.config)
