"""
Hierarchical reconciliation: keep SKU -> store -> region forecasts consistent.

Supports:
- bottom_up: aggregate base-level (SKU) forecasts upward by summation.
- mint: a simplified MinT-style trace-minimization reconciliation using
  in-sample residual covariance (diagonal approximation for tractability).

Usage:
    python -m src.models.reconcile --config configs/config.yaml
"""
import argparse

import numpy as np
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
    """Simplified MinT reconciliation using a diagonal residual-variance weighting
    (WLS variant of MinT). Weights base forecasts inversely to their historical
    error variance before summing up the hierarchy, which down-weights noisier
    series relative to a plain bottom-up sum.
    """
    df = df.copy()

    # Compute per-series residual variance safely without relying on outer-df index
    def _series_residual_var(grp):
        return ((grp[true_col] - grp[pred_col]) ** 2).mean()

    residual_var = df.groupby(hierarchy[0]).apply(_series_residual_var)
    global_mean_var = residual_var[residual_var > 0].mean()
    residual_var = residual_var.replace(0, global_mean_var).fillna(global_mean_var)

    weights = (1 / residual_var).rename("weight")
    df = df.merge(weights, left_on=hierarchy[0], right_index=True, how="left")

    # Apply weights to forecasts so the weighted sum propagates up the hierarchy
    df["weighted_pred"] = df[pred_col] * df["weight"]
    reconciled = bottom_up_reconcile(df, hierarchy, "weighted_pred")
    reconciled = reconciled.rename(columns={"weighted_pred": pred_col})
    return reconciled


def main(config_path: str) -> None:
    cfg = load_config(config_path)
    reports_dir = ensure_dir(cfg["evaluation"]["output_dir"])

    preds_path = reports_dir / "lightgbm_predictions.parquet"
    df = pd.read_parquet(preds_path)

    recon_cfg = cfg["reconciliation"]
    hierarchy = recon_cfg["hierarchy"]

    missing = [c for c in hierarchy if c not in df.columns and c != "region"]
    if missing:
        logger.warning(
            f"Hierarchy columns missing from predictions ({missing}); "
            "add a region/store mapping before running reconciliation."
        )

    if recon_cfg["method"] == "bottom_up":
        reconciled = bottom_up_reconcile(df, hierarchy, "y_pred")
    elif recon_cfg["method"] == "mint":
        reconciled = mint_diagonal_reconcile(df, hierarchy, "y_pred", cfg["target_col"])
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
