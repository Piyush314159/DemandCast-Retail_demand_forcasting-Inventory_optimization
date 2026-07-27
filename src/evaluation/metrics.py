"""Forecast accuracy metrics and a simple cost-impact estimate."""
import numpy as np
import pandas as pd


def wmape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Weighted MAPE: sum(|error|) / sum(|actual|). Weights by volume so
    high-selling SKUs dominate the metric, matching business impact."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.abs(y_true).sum()
    if denom == 0:
        return np.nan
    return np.abs(y_true - y_pred).sum() / denom


def mape(y_true: np.ndarray, y_pred: np.ndarray, eps: float = 1e-6) -> float:
    """Mean Absolute Percentage Error. Uses epsilon clipping to avoid division by zero
    for zero-sales periods. Note: MAPE is sensitive to low-volume SKUs; prefer wMAPE
    for business reporting."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return np.mean(np.abs((y_true - y_pred) / np.clip(np.abs(y_true), eps, None)))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def bias(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Mean signed error as a fraction of mean actual. Positive = over-forecasting."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mean_actual = y_true.mean()
    if mean_actual == 0:
        return np.nan
    return float((y_pred - y_true).mean() / mean_actual)


def estimate_cost_impact(
    y_true: np.ndarray,
    y_pred_baseline: np.ndarray,
    y_pred_model: np.ndarray,
    unit_stockout_cost: float,
    unit_overstock_cost: float,
) -> dict:
    """
    Rough stockout/overstock cost comparison between a baseline and a model.
    Under-forecasting (pred < actual) => stockout cost.
    Over-forecasting (pred > actual) => overstock cost.
    """

    def cost(y_true, y_pred):
        err = y_pred - y_true
        stockout = np.clip(-err, 0, None) * unit_stockout_cost
        overstock = np.clip(err, 0, None) * unit_overstock_cost
        return float((stockout + overstock).sum())

    baseline_cost = cost(y_true, y_pred_baseline)
    model_cost = cost(y_true, y_pred_model)
    reduction_pct = (
        (baseline_cost - model_cost) / baseline_cost * 100 if baseline_cost else np.nan
    )

    return {
        "baseline_cost": baseline_cost,
        "model_cost": model_cost,
        "reduction_pct": reduction_pct,
    }


def evaluation_summary(y_true, y_pred, name: str = "model") -> pd.Series:
    return pd.Series(
        {
            "model": name,
            "wmape": wmape(y_true, y_pred),
            "mape": mape(y_true, y_pred),
            "rmse": rmse(y_true, y_pred),
            "bias": bias(y_true, y_pred),
        }
    )
