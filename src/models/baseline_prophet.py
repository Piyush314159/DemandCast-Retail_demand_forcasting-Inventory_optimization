"""
Per-series Prophet baseline with weekly/yearly seasonality and holiday regressors.

Usage:
    python -m src.models.baseline_prophet --config configs/config.yaml
"""
import argparse

import pandas as pd
from prophet import Prophet

from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)


def fit_predict_prophet(
    train_df: pd.DataFrame, horizon: int, cfg: dict
) -> pd.DataFrame:
    """train_df must have columns ['ds', 'y']. Returns forecast dataframe with ['ds','yhat']."""
    model = Prophet(
        weekly_seasonality=cfg["weekly_seasonality"],
        yearly_seasonality=cfg["yearly_seasonality"],
    )
    if cfg.get("holidays"):
        model.add_country_holidays(country_name="DE")  # adjust to your market
    model.fit(train_df)
    future = model.make_future_dataframe(periods=horizon)
    forecast = model.predict(future)
    return forecast[["ds", "yhat"]].tail(horizon)


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])
    reports_dir = ensure_dir(cfg["evaluation"]["output_dir"])

    df = pd.read_parquet(processed_dir / "features.parquet")
    date_col, target_col, id_cols = cfg["date_col"], cfg["target_col"], cfg["id_cols"]
    prophet_cfg = cfg["model"]["prophet"]

    train_end = pd.to_datetime(cfg["split"]["train_end"])
    test_end = pd.to_datetime(cfg["split"]["test_end"])

    results = []
    for keys, group in df.groupby(id_cols):
        group = group.sort_values(date_col)
        train = group[group[date_col] <= train_end][[date_col, target_col]].rename(
            columns={date_col: "ds", target_col: "y"}
        )
        test = group[(group[date_col] > train_end) & (group[date_col] <= test_end)]
        if len(train) < 30 or len(test) == 0:
            continue
        try:
            fc = fit_predict_prophet(train, len(test), prophet_cfg)
            results.append(
                pd.DataFrame(
                    {
                        "date": test[date_col].values,
                        "y_true": test[target_col].values,
                        "y_pred": fc["yhat"].values,
                    }
                ).assign(**dict(zip(id_cols, keys if isinstance(keys, tuple) else [keys])))
            )
        except Exception as e:
            logger.warning(f"Prophet failed for {keys}: {e}")

    out = pd.concat(results, ignore_index=True) if results else pd.DataFrame()
    out_path = reports_dir / "prophet_predictions.parquet"
    out.to_parquet(out_path, index=False)
    logger.info(f"Prophet predictions -> {out_path} ({len(out):,} rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    main(args.config)
