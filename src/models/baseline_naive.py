"""
Seasonal-naive baseline: forecast = actual value from the same weekday last cycle.

Usage:
    python -m src.models.baseline_naive --config configs/config.yaml
"""
import argparse

import pandas as pd

from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)


def seasonal_naive_forecast(
    df: pd.DataFrame, target_col: str, id_cols: list, date_col: str, season_length: int = 7
) -> pd.Series:
    """Predict each row's value using the target from `season_length` periods ago
    within the same series (e.g. 7 days back for weekly seasonality)."""
    df = df.sort_values(id_cols + [date_col])
    return df.groupby(id_cols)[target_col].shift(season_length)


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])
    reports_dir = ensure_dir(cfg["evaluation"]["output_dir"])

    df = pd.read_parquet(processed_dir / "features.parquet")
    date_col, target_col, id_cols = cfg["date_col"], cfg["target_col"], cfg["id_cols"]

    train_end = pd.to_datetime(cfg["split"]["train_end"])
    test_end = pd.to_datetime(cfg["split"]["test_end"])

    df[date_col] = pd.to_datetime(df[date_col])
    test = df[(df[date_col] > train_end) & (df[date_col] <= test_end)].copy()

    test["y_pred"] = seasonal_naive_forecast(df, target_col, id_cols, date_col).loc[test.index]

    out_path = reports_dir / "naive_predictions.parquet"
    test[id_cols + [date_col, target_col, "y_pred"]].to_parquet(out_path, index=False)
    logger.info(f"Naive predictions -> {out_path} ({len(test):,} rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    main(args.config)
