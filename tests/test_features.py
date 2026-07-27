import pandas as pd

from src.features.build_features import add_lag_features, add_calendar_features


def _sample_df():
    dates = pd.date_range("2023-01-01", periods=10, freq="D")
    return pd.DataFrame(
        {
            "date": list(dates) * 1,
            "store_id": [1] * 10,
            "item_id": ["A"] * 10,
            "sales": range(10),
        }
    )


def test_add_calendar_features_adds_expected_columns():
    df = _sample_df()
    out = add_calendar_features(df.copy(), "date")
    for col in ["day_of_week", "is_weekend", "week_of_year", "month", "year"]:
        assert col in out.columns


def test_add_lag_features_shifts_correctly():
    df = _sample_df()
    out = add_lag_features(df.copy(), "sales", ["store_id", "item_id"], [1])
    # value at row i should equal sales at row i-1 for lag_1
    assert out["sales_lag_1"].iloc[1] == df["sales"].iloc[0]
    assert pd.isna(out["sales_lag_1"].iloc[0])


def test_add_lag_features_respects_series_boundaries():
    df1 = _sample_df()
    df2 = _sample_df()
    df2["store_id"] = 2
    df = pd.concat([df1, df2], ignore_index=True)
    out = add_lag_features(df, "sales", ["store_id", "item_id"], [1])
    # first row of each series should have a NaN lag (no leakage across series)
    first_rows = out.groupby(["store_id", "item_id"]).head(1)
    assert first_rows["sales_lag_1"].isna().all()
