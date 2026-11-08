"""Publish a bounded, atomic dashboard snapshot from the actual SQL/artifacts."""
import argparse
import hashlib
from datetime import datetime, timezone
import json
from pathlib import Path

import numpy as np
import pandas as pd

from src.data.database import read_frame
from src.utils.io import load_config


def scores(frame):
    actual, forecast = frame["sales"], frame["y_pred"]
    denominator = float(actual.abs().sum())
    error = forecast - actual
    return {"wmape": float(error.abs().sum() / denominator * 100) if denominator else None,
            "rmse": float(np.sqrt(np.mean(error ** 2))),
            "bias": float(error.sum() / denominator * 100) if denominator else None,
            "actual": float(actual.sum()), "forecast": float(forecast.sum()), "observations": len(frame)}


def points(frame):
    grouped = frame.groupby("date")[["sales", "y_pred"]].sum().reset_index()
    return [{"date": str(row.date.date()), "actual": round(float(row.sales), 2),
             "forecast": round(float(row.y_pred), 2)} for row in grouped.itertuples()]


def main(config_path):
    cfg = load_config(config_path)
    reports = Path(cfg["evaluation"]["output_dir"])
    sales = read_frame(cfg, "sales", Path(cfg["dataset"]["processed_dir"]) / "long_format.parquet")
    date, target = cfg["date_col"], cfg["target_col"]
    sales = sales.rename(columns={date: "date", target: "sales"})
    sales["date"] = pd.to_datetime(sales["date"])
    ids = cfg["id_cols"]
    quality = [
        {"name": "Unique series and dates", "value": int(sales.duplicated(ids + ["date"]).sum()), "unit": "duplicate rows"},
        {"name": "Complete sales values", "value": int(sales["sales"].isna().sum()), "unit": "missing values"},
        {"name": "Nonnegative sales", "value": int((sales["sales"] < 0).sum()), "unit": "negative values"},
        {"name": "Finite sales values", "value": int((~np.isfinite(sales["sales"])).sum()), "unit": "invalid values"},
    ]
    coverage = sales.groupby(ids)["date"].agg(["min", "max", "count"])
    gaps = int(((coverage["max"] - coverage["min"]).dt.days + 1 - coverage["count"]).clip(lower=0).sum())
    quality.append({"name": "Calendar coverage gaps", "value": gaps, "unit": "unobserved series-days"})
    models = []
    for name, label in [("gru", "Attention GRU"), ("lightgbm", "LightGBM"), ("naive", "Seasonal naive"),
                        ("prophet", "Prophet"), ("sarima", "SARIMA")]:
        path = reports / f"{name}_predictions.parquet"
        # A truly missing optional model is omitted. Corrupt existing artifacts fail loudly.
        try:
            frame = read_frame(cfg, f"{name}_predictions", path)
        except FileNotFoundError:
            continue
        frame = frame.rename(columns={"y_true": "sales", date: "date", target: "sales"})
        frame["date"] = pd.to_datetime(frame["date"])
        if frame.empty or not np.isfinite(frame[["sales", "y_pred"]].to_numpy(dtype=float)).all():
            raise ValueError(f"{name}: empty or invalid forecasts")
        if frame.duplicated(ids + ["date"]).any():
            raise ValueError(f"{name}: duplicate forecast keys")
        stores = []
        for store, group in frame.groupby("store_id", sort=True):
            stores.append({"id": str(store), **scores(group), "points": points(group)})
        input_warning = None
        if name == "lightgbm":
            metadata_path = Path(cfg.get("models_dir", "models")) / "lightgbm_metadata.json"
            metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
            verified = (path.exists() and metadata.get("forecast_sha256") == hashlib.sha256(path.read_bytes()).hexdigest()
                        and bool(metadata.get("features")) and not {"Customers", "customers"}.intersection(metadata["features"]))
            if not verified:
                input_warning = "This historical LightGBM output predates verified removal of same-day customer counts. Retrain with corrected features before assessing it."
        models.append({"id": name, "name": label, **scores(frame), "inputWarning": input_warning,
                       "start": str(frame.date.min().date()), "end": str(frame.date.max().date()),
                       "points": points(frame), "stores": stores,
                       "protocol": f"Fixed-origin · {int(frame['horizon_day'].max())}-day forecast" if name == "gru" else "Historical artifact · descriptive only"})
    backtest_path = reports / "gru_backtest.json"
    backtest = json.loads(backtest_path.read_text()) if backtest_path.exists() else None
    if backtest and any(m["id"] == "gru" for m in models):
        gru_frame = read_frame(cfg, "gru_predictions")
        measured = scores(gru_frame.rename(columns={target: "sales"}))
        if (len(gru_frame) != backtest["observations"] or
                str(gru_frame[date].min().date()) != backtest["test_start"] or
                str(gru_frame[date].max().date()) != backtest["test_end"] or
                not np.isclose(measured["wmape"], backtest["metrics"]["gru"]["wmape_percent"], rtol=1e-6)):
            raise ValueError("GRU predictions and evaluation metadata do not match; rerun the GRU stage")
        baseline = gru_frame.rename(columns={"y_pred": "gru_pred", "seasonal_pred": "y_pred", date: "date", target: "sales"})
        models.insert(1, {"id": "gru_baseline", "name": "Seasonal baseline", **scores(baseline),
                          "start": str(baseline.date.min().date()), "end": str(baseline.date.max().date()),
                          "points": points(baseline), "protocol": "Fixed-origin · matched GRU window",
                          "stores": [{"id": str(store), **scores(g), "points": points(g)}
                                     for store, g in baseline.groupby("store_id", sort=True)]})
    recent = sales[sales.date >= sales.date.max() - pd.Timedelta(days=55)]
    history = recent.groupby("date")["sales"].sum()
    audit_path = reports / "saved_prediction_audit.json"
    snapshot = {"version": 1, "exportedAt": datetime.now(timezone.utc).isoformat(),
                "dataset": cfg["dataset"]["name"], "source": "MySQL forecast tables",
                "salesStart": str(sales.date.min().date()), "salesEnd": str(sales.date.max().date()),
                "salesRows": len(sales), "storeCount": int(sales.store_id.nunique()),
                "unit": "Sales revenue (€)" if cfg["dataset"]["name"] == "rossmann" else "Unit sales",
                "quality": quality, "models": models, "backtest": backtest,
                "history": [{"date": str(d.date()), "actual": float(v)} for d, v in history.items()],
                "audit": json.loads(audit_path.read_text()) if audit_path.exists() else None,
                "notices": ["Rossmann is store-level revenue; SKU inventory decisions require unit-demand data.",
                            "Historical model artifacts use different forecast origins and cannot be ranked fairly.",
                            "No live stock, supplier lead times or inventory cost outcomes are connected."]}
    output = Path(cfg.get("dashboard", {}).get("snapshot_path", "dashboard/data/workspace.json"))
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, allow_nan=False, separators=(",", ":")) + "\n")
    temporary.replace(output)
    print(f"Exported {len(models)} model outputs, {snapshot['storeCount']} stores -> {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="configs/config.yaml")
    main(parser.parse_args().config)
