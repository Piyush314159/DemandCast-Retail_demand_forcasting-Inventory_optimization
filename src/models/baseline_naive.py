"""Seasonal-naive baseline: forecast = actual value from the same weekday last cycle."""
import pandas as pd


def seasonal_naive_forecast(
    df: pd.DataFrame, target_col: str, id_cols: list, date_col: str, season_length: int = 7
) -> pd.Series:
    """Predict each row's value using the target from `season_length` periods ago
    within the same series (e.g. 7 days back for weekly seasonality)."""
    df = df.sort_values(id_cols + [date_col])
    return df.groupby(id_cols)[target_col].shift(season_length)
