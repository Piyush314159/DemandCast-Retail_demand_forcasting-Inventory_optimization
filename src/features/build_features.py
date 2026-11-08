"""
Engineer lag, rolling-window, seasonality, and promo/holiday features.

Usage:
    python -m src.features.build_features --config configs/config.yaml
"""
import argparse

import numpy as np
import pandas as pd

from src.data.database import read_frame
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
    df: pd.DataFrame, target_col: str, id_cols: list, lags: list, date_col: str = "date"
) -> pd.DataFrame:
    # Calendar offsets, rather than row offsets: missing dates must not turn
    # a seven-day lag into the seventh previous observation months earlier.
    lookup = df.set_index(id_cols + [date_col])[target_col]
    for lag in lags:
        if not isinstance(lag, int) or lag < 1:
            raise ValueError("Lag offsets must be positive integers")
        keys = df[id_cols + [date_col]].copy()
        keys[date_col] = keys[date_col] - pd.Timedelta(days=lag)
        df[f"{target_col}_lag_{lag}"] = lookup.reindex(pd.MultiIndex.from_frame(keys)).to_numpy()
    return df


def add_rolling_features(
    df: pd.DataFrame, target_col: str, id_cols: list, windows: list, date_col: str = "date"
) -> pd.DataFrame:
    for w in windows:
        if not isinstance(w, int) or w < 1:
            raise ValueError("Rolling windows must be positive integers")
        df[f"{target_col}_roll_mean_{w}"] = np.nan
        df[f"{target_col}_roll_std_{w}"] = np.nan
    for _, group in df.groupby(id_cols, sort=False):
        # Leave unobserved dates as NaN, then shift to exclude today's sales.
        shifted = group.set_index(date_col)[target_col].asfreq("D").shift(1)
        for w in windows:
            rolling = shifted.rolling(w, min_periods=max(1, w // 3))
            df.loc[group.index, f"{target_col}_roll_mean_{w}"] = rolling.mean().reindex(group[date_col]).to_numpy()
            df.loc[group.index, f"{target_col}_roll_std_{w}"] = rolling.std().reindex(group[date_col]).to_numpy()
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

    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    if df[id_cols + [date_col]].isna().any().any() or df.duplicated(id_cols + [date_col]).any():
        raise ValueError("Sales require nonmissing, unique series/date keys")
    df = df.sort_values(id_cols + [date_col]).reset_index(drop=True)
    if feat_cfg.get("use_calendar", True):
        df = add_calendar_features(df, date_col)
    df = add_lag_features(df, target_col, id_cols, feat_cfg["lags"], date_col)
    df = add_rolling_features(df, target_col, id_cols, feat_cfg["rolling_windows"], date_col)

    if feat_cfg.get("use_promo") or feat_cfg.get("use_holidays"):
        df = add_promo_holiday_features(df)

    if not feat_cfg.get("use_promo", True):
        df = df.drop(columns=["promo", "Promo2", "Promo2SinceWeek", "Promo2SinceYear", "PromoInterval"], errors="ignore")
    if not feat_cfg.get("use_holidays", True):
        df = df.drop(columns=["state_holiday", "is_state_holiday", "school_holiday"], errors="ignore")

    return df


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])

    df = read_frame(cfg, "sales", processed_dir / "long_format.parquet")
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
