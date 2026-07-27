"""
Load and lightly clean raw retail sales data (Rossmann or M5).

Usage:
    python -m src.data.load_data --config configs/config.yaml
"""
import argparse

import pandas as pd

from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)


def load_rossmann(raw_dir: str) -> pd.DataFrame:
    """Load and merge Rossmann train.csv + store.csv into one long dataframe."""
    train = pd.read_csv(f"{raw_dir}/train.csv", parse_dates=["Date"], low_memory=False)
    store = pd.read_csv(f"{raw_dir}/store.csv")

    df = train.merge(store, on="Store", how="left")
    df = df.rename(
        columns={
            "Date": "date",
            "Store": "store_id",
            "Sales": "sales",
            "Promo": "promo",
            "StateHoliday": "state_holiday",
            "SchoolHoliday": "school_holiday",
        }
    )
    df["item_id"] = df["store_id"].astype(str)  # Rossmann is store-level only
    return df.sort_values(["store_id", "date"]).reset_index(drop=True)


def load_m5(raw_dir: str) -> pd.DataFrame:
    """Load and melt M5 sales_train_validation.csv into long format, join calendar/prices."""
    sales = pd.read_csv(f"{raw_dir}/sales_train_validation.csv")
    calendar = pd.read_csv(f"{raw_dir}/calendar.csv", parse_dates=["date"])
    prices = pd.read_csv(f"{raw_dir}/sell_prices.csv")

    id_cols = ["id", "item_id", "dept_id", "cat_id", "store_id", "state_id"]
    day_cols = [c for c in sales.columns if c.startswith("d_")]

    long_df = sales.melt(
        id_vars=id_cols, value_vars=day_cols, var_name="d", value_name="sales"
    )
    long_df = long_df.merge(calendar[["d", "date", "wm_yr_wk"]], on="d", how="left")
    long_df = long_df.merge(
        prices, on=["store_id", "item_id", "wm_yr_wk"], how="left"
    )
    return long_df.sort_values(["store_id", "item_id", "date"]).reset_index(drop=True)


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    raw_dir = cfg["dataset"]["raw_dir"]
    processed_dir = ensure_dir(cfg["dataset"]["processed_dir"])

    if cfg["dataset"]["name"] == "rossmann":
        df = load_rossmann(raw_dir)
    elif cfg["dataset"]["name"] == "m5":
        df = load_m5(raw_dir)
    else:
        raise ValueError(f"Unknown dataset: {cfg['dataset']['name']}")

    out_path = processed_dir / "long_format.parquet"
    df.to_parquet(out_path, index=False)
    logger.info(f"Loaded {len(df):,} rows -> {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    main(args.config)
