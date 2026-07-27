"""
Engineer lag, rolling-window, seasonality, and promo/holiday features.

Usage:
    python -m src.features.build_features --config configs/config.yaml
"""
import argparse

import numpy as np
import pandas as pd

from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)


def add_calendar_features(df: pd.DataFrame, date_col: str) -> pd.DataFrame:
    df["day_of_week"] = df[date_col].dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)
    df["week_of_year"] = df[date_col].dt.isocalendar().week.astype(int)
    df["month"] = df[date_col].dt.month
    df["year"] = df[date_col].dt.year
    return df


def add_lag_features(
    df: pd.DataFrame, target_col: str, id_cols: list, lags: list
) -> pd.DataFrame:
    grouped = df.groupby(id_cols)[target_col]
    for lag in lags:
        df[f"{target_col}_lag_{lag}"] = grouped.shift(lag)
    return df


def add_rolling_features(
    df: pd.DataFrame, target_col: str, id_cols: list, windows: list
) -> pd.DataFrame:
    # Shift by 1 first so the rolling window never includes the current day (no leakage)
    shifted = df.groupby(id_cols)[target_col].shift(1)
    for w in windows:
        df[f"{target_col}_roll_mean_{w}"] = shifted.groupby(
            [df[c] for c in id_cols]
        ).transform(lambda s: s.rolling(w, min_periods=max(1, w // 3)).mean())
        df[f"{target_col}_roll_std_{w}"] = shifted.groupby(
            [df[c] for c in id_cols]
        ).transform(lambda s: s.rolling(w, min_periods=max(1, w // 3)).std())
    return df


def add_promo_holiday_features(df: pd.DataFrame) -> pd.DataFrame:
    if "promo" in df.columns:
        df["promo"] = df["promo"].fillna(0).astype(int)
    if "state_holiday" in df.columns:
        df["is_state_holiday"] = (
            df["state_holiday"].astype(str).ne("0")
        ).astype(int)
    if "school_holiday" in df.columns:
        df["school_holiday"] = df["school_holiday"].fillna(0).astype(int)
    return df


def build_features(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    date_col = cfg["date_col"]
    target_col = cfg["target_col"]
    id_cols = cfg["id_cols"]
    feat_cfg = cfg["features"]

    df = df.sort_values(id_cols + [date_col]).reset_index(drop=True)
    df = add_calendar_features(df, date_col)
    df = add_lag_features(df, target_col, id_cols, feat_cfg["lags"])
    df = add_rolling_features(df, target_col, id_cols, feat_cfg["rolling_windows"])

    if feat_cfg.get("use_promo") or feat_cfg.get("use_holidays"):
        df = add_promo_holiday_features(df)

    return df


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])

    df = pd.read_parquet(processed_dir / "long_format.parquet")
    df[cfg["date_col"]] = pd.to_datetime(df[cfg["date_col"]])

    df = build_features(df, cfg)

    out_path = processed_dir / "features.parquet"
    df.to_parquet(out_path, index=False)
    logger.info(f"Built features for {len(df):,} rows, {df.shape[1]} columns -> {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    main(args.config)
