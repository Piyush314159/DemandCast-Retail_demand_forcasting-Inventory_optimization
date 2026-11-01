"""Recompute descriptive metrics on the intersection of saved prediction keys.

Run: python -m src.evaluation.audit_saved_predictions --reports-dir reports
This audits artifacts; it does not establish a common forecasting protocol.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

KEYS = ["store_id", "item_id", "date"]
MODELS = ("lightgbm", "naive", "prophet", "sarima")


def audit_frames(frames):
    normalized = {}
    common = None
    for name, original in frames.items():
        frame = original.rename(columns={"y_true": "sales"}).copy()
        frame["date"] = pd.to_datetime(frame["date"])
        if frame[KEYS].isna().any().any() or frame.duplicated(KEYS).any():
            raise ValueError(f"{name}: missing or duplicate prediction keys")
        if not np.isfinite(frame[["sales", "y_pred"]].to_numpy(dtype=float)).all():
            raise ValueError(f"{name}: non-finite outcomes or predictions")
        normalized[name] = frame
        common = frame[KEYS] if common is None else common.merge(
            frame[KEYS], on=KEYS, how="inner", validate="one_to_one"
        )
    if common is None or common.empty:
        raise ValueError("No shared prediction observations")
    metrics, reference = {}, None
    for name, frame in normalized.items():
        aligned = common.merge(frame, on=KEYS, validate="one_to_one")
        actual = aligned["sales"].to_numpy(dtype=float)
        if reference is not None and not np.array_equal(actual, reference):
            raise ValueError(f"{name}: outcomes disagree on shared keys")
        reference = actual
        denominator = np.abs(actual).sum()
        if denominator == 0:
            raise ValueError("WMAPE is undefined for zero total absolute sales")
        error = actual - aligned["y_pred"].to_numpy(dtype=float)
        metrics[name] = {
            "source_rows": len(frame), "evaluated_rows": len(aligned),
            "excluded_rows": len(frame) - len(aligned),
            "wmape_percent": float(100 * np.abs(error).sum() / denominator),
            "rmse": float(np.sqrt(np.mean(error ** 2))),
        }
    return {
        "status": "descriptive_artifact_audit",
        "start_date": common["date"].min().date().isoformat(),
        "end_date": common["date"].max().date().isoformat(),
        "shared_observations": len(common), "metrics": metrics,
        "limitations": [
            "Saved predictions use different forecast origins and information sets.",
            "LightGBM features use realized prior sales; this is not a fixed-origin multi-step forecast.",
            "Common dates alone do not make these scores a controlled model comparison.",
            "Artifact provenance does not establish training time, MinT gains, or inventory savings.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--reports-dir", type=Path, default=Path("reports"))
    args = parser.parse_args()
    paths = {name: args.reports_dir / f"{name}_predictions.parquet" for name in MODELS}
    result = audit_frames({name: pd.read_parquet(path) for name, path in paths.items()})
    result["artifact_sha256"] = {
        name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in paths.items()
    }
    output = args.reports_dir / "saved_prediction_audit.json"
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
