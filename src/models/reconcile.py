"""
Hierarchical reconciliation: keep SKU -> store -> region forecasts consistent.

Supports:
- bottom_up: aggregate base-level (SKU) forecasts upward by summation.
- mint: unavailable until independent forecasts at all hierarchy levels and
  residual covariance estimated before the evaluation period are supplied.

Usage:
    python -m src.models.reconcile --config configs/config.yaml
"""
import argparse

import pandas as pd

from src.utils.io import load_config, get_logger, ensure_dir

logger = get_logger(__name__)


def bottom_up_reconcile(df: pd.DataFrame, hierarchy: list, pred_col: str) -> pd.DataFrame:
    """Sum base-level forecasts up through each higher level of the hierarchy.
    `hierarchy` should be ordered from most granular to least, e.g.
    ['item_id', 'store_id', 'region']. Returns a long dataframe with a 'level'
    column indicating which hierarchy level each row aggregates to.
    """
    frames = []
    for i, level in enumerate(hierarchy):
        group_cols = hierarchy[i:]  # this level and everything above it
        agg = df.groupby(group_cols + ["date"], as_index=False)[pred_col].sum()
        agg["level"] = level
        frames.append(agg)
    return pd.concat(frames, ignore_index=True)


def mint_diagonal_reconcile(
    df: pd.DataFrame, hierarchy: list, pred_col: str, true_col: str
) -> pd.DataFrame:
    """Reject the former test-outcome-weighted routine, which was not MinT.

    Keep the entry point to fail clearly for existing callers. No evaluation
    targets are read. Use bottom-up aggregation for the current pipeline.
    """
    raise NotImplementedError(
        "MinT is not implemented. Use method: bottom_up. Valid MinT requires "
        "a summing matrix, independent base forecasts at all levels, and "
        "forecast-error covariance estimated on pre-test data."
    )


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    reports_dir = ensure_dir(cfg["evaluation"]["output_dir"])

    preds_path = reports_dir / "lightgbm_predictions.parquet"
    df = pd.read_parquet(preds_path)

    recon_cfg = cfg["reconciliation"]
    hierarchy = recon_cfg["hierarchy"]

    # Filter hierarchy to only columns that actually exist in the predictions.
    # Rossmann has no 'region' column; M5 may have state_id etc.
    available_hierarchy = [c for c in hierarchy if c in df.columns]
    missing = [c for c in hierarchy if c not in df.columns]
    if missing:
        logger.warning(
            f"Skipping hierarchy levels not in predictions: {missing}. "
            "To use them, add a store→region mapping in load_data."
        )
    if not available_hierarchy:
        logger.error("No valid hierarchy columns found — skipping reconciliation.")
        return

    if recon_cfg["method"] == "bottom_up":
        reconciled = bottom_up_reconcile(df, available_hierarchy, "y_pred")
    elif recon_cfg["method"] == "mint":
        reconciled = mint_diagonal_reconcile(df, available_hierarchy, "y_pred", cfg["target_col"])
    else:
        raise ValueError(f"Unknown reconciliation method: {recon_cfg['method']}")

    out_path = reports_dir / "reconciled_forecasts.parquet"
    reconciled.to_parquet(out_path, index=False)
    logger.info(f"Reconciled forecasts -> {out_path} ({len(reconciled):,} rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    main(args.config)
