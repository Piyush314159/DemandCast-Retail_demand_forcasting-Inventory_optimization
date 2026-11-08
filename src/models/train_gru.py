"""Global attention GRU with direct, fixed-origin multi-day forecasts.

Only calendar covariates are used for future dates. Sales after the forecast
origin never enter the encoder. Validation selects the checkpoint; the test
window is evaluated once against the same-origin weekly seasonal baseline.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import time

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from src.data.database import read_frame, write_frame
from src.evaluation.metrics import wmape, rmse
from src.utils.io import ensure_dir, get_logger, load_config

logger = get_logger(__name__)


def calendar(dates):
    dates = pd.DatetimeIndex(dates)
    week = 2 * np.pi * dates.dayofweek.to_numpy() / 7
    year = 2 * np.pi * dates.dayofyear.to_numpy() / 365.25
    return np.stack([np.sin(week), np.cos(week), np.sin(year), np.cos(year)], axis=-1).astype("float32")


def prepare_series(frame, cfg):
    """Keep missing days missing: a gap must never become a zero-sale day."""
    date, target, ids = cfg["date_col"], cfg["target_col"], cfg["id_cols"]
    frame = frame.copy()
    frame[date] = pd.to_datetime(frame[date])
    if frame[ids + [date, target]].isna().any().any():
        raise ValueError("Sales contain missing keys, dates or targets")
    if frame.duplicated(ids + [date]).any():
        raise ValueError("Duplicate series/date observations")
    if not np.isfinite(frame[target].to_numpy(dtype=float)).all() or (frame[target] < 0).any():
        raise ValueError("Sales must be finite and nonnegative")
    cutoff = pd.Timestamp(cfg["split"]["train_end"])
    series = []
    for key, group in frame.groupby(ids, sort=True):
        group = group.sort_values(date).set_index(date)
        group = group.reindex(pd.date_range(group.index.min(), group.index.max(), freq="D"))
        training = group.loc[:cutoff, target].dropna().to_numpy(dtype="float32")
        if not len(training):
            continue
        scale = max(float(training.mean()), 1.0)
        values = group[target].to_numpy(dtype="float32")
        series.append({"key": key if isinstance(key, tuple) else (key,), "dates": group.index,
                       "sales": values, "scale": scale, "calendar": calendar(group.index)})
    if not series:
        raise ValueError("No series have training observations")
    return series


def window(series, origin, lookback, horizon):
    """The encoder ends at origin; the decoder sees calendar features only."""
    position = series["dates"].get_indexer([pd.Timestamp(origin)])[0]
    if position < lookback - 1 or position + horizon >= len(series["sales"]):
        return None
    past = series["sales"][position - lookback + 1:position + 1]
    target = series["sales"][position + 1:position + horizon + 1]
    if not np.isfinite(past).all() or not np.isfinite(target).all():
        return None
    x = np.column_stack([past / series["scale"], series["calendar"][position - lookback + 1:position + 1]])
    future = series["calendar"][position + 1:position + horizon + 1]
    baseline = np.resize(past[-7:], horizon) / series["scale"]
    return x, future, baseline, target / series["scale"]


class AttentionGRU(nn.Module):
    def __init__(self, hidden_size=32, layers=1, dropout=0.1):
        super().__init__()
        self.encoder = nn.GRU(5, hidden_size, num_layers=layers, batch_first=True,
                              dropout=dropout if layers > 1 else 0)
        self.query = nn.Linear(4, hidden_size)
        self.head = nn.Sequential(nn.Linear(2 * hidden_size + 4, hidden_size),
                                  nn.GELU(), nn.Dropout(dropout), nn.Linear(hidden_size, 1))
        nn.init.zeros_(self.head[-1].weight)
        nn.init.zeros_(self.head[-1].bias)

    def forward(self, past, future, seasonal):
        encoded, hidden = self.encoder(past)
        weights = torch.softmax(torch.bmm(self.query(future), encoded.transpose(1, 2)) /
                                encoded.shape[-1] ** 0.5, dim=-1)
        context = torch.bmm(weights, encoded)
        state = hidden[-1].unsqueeze(1).expand(-1, future.shape[1], -1)
        residual = self.head(torch.cat([context, state, future], dim=-1)).squeeze(-1)
        return torch.clamp(seasonal + residual, min=0)


def stack_windows(windows):
    return tuple(torch.from_numpy(np.stack(values).astype("float32")) for values in zip(*windows))


def predict(model, tensors, batch_size=256):
    model.eval()
    with torch.inference_mode():
        return torch.cat([model(*batch[:3]) for batch in
                          DataLoader(TensorDataset(*tensors), batch_size=batch_size)]).numpy()


def main(config_path):
    cfg = load_config(config_path)
    settings = cfg["model"]["gru"]
    lookback, horizon = int(settings["lookback"]), int(settings["horizon"])
    if lookback < 7 or horizon < 1:
        raise ValueError("GRU requires lookback >= 7 and horizon >= 1")
    seed = int(settings.get("seed", 42))
    torch.manual_seed(seed)
    np.random.seed(seed)
    torch.set_num_threads(int(settings.get("threads", 4)))
    processed = Path(cfg["dataset"]["processed_dir"])
    reports = ensure_dir(cfg["evaluation"]["output_dir"])
    models = ensure_dir(cfg.get("models_dir", "models"))
    train_end = pd.Timestamp(cfg["split"]["train_end"])
    valid_end = pd.Timestamp(cfg["split"]["valid_end"])
    test_end = pd.Timestamp(cfg["split"]["test_end"])
    if not train_end < valid_end < test_end or train_end + pd.Timedelta(days=horizon) > valid_end:
        raise ValueError("Invalid chronological splits or horizon exceeds validation window")
    if valid_end + pd.Timedelta(days=horizon) > test_end:
        raise ValueError("GRU horizon exceeds configured test window")
    raw = read_frame(cfg, "sales", processed / "long_format.parquet")
    series = prepare_series(raw, cfg)
    windows, validation, testing, evaluated = [], [], [], []
    for item in series:
        for origin in pd.date_range(train_end - pd.Timedelta(days=int(settings.get("training_days", 180))),
                                    train_end - pd.Timedelta(days=horizon), freq="3D"):
            example = window(item, origin, lookback, horizon)
            if example is not None:
                windows.append(example)
        valid = window(item, train_end, lookback, horizon)
        test = window(item, valid_end, lookback, horizon)
        if valid is not None and test is not None:
            validation.append(valid)
            testing.append(test)
            evaluated.append(item)
    if not windows or not evaluated:
        raise ValueError("Not enough contiguous daily history for training, validation and test")
    rng = np.random.default_rng(seed)
    cap = int(settings.get("max_samples", 30000))
    if len(windows) > cap:
        windows = [windows[i] for i in rng.choice(len(windows), cap, replace=False)]
    train = stack_windows(windows)
    valid, test = stack_windows(validation), stack_windows(testing)
    model = AttentionGRU(int(settings.get("hidden_size", 32)), int(settings.get("layers", 1)),
                         float(settings.get("dropout", 0.1)))
    optimizer = torch.optim.AdamW(model.parameters(), lr=float(settings.get("learning_rate", 0.001)))
    loader = DataLoader(TensorDataset(*train), batch_size=int(settings.get("batch_size", 256)),
                        shuffle=True, generator=torch.Generator().manual_seed(seed))
    scales = np.array([s["scale"] for s in evaluated])[:, None]
    best, best_state, stale, history = float("inf"), None, 0, []
    started = time.monotonic()
    for epoch in range(int(settings.get("epochs", 12))):
        model.train()
        losses = []
        for past, future, baseline, target in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = nn.functional.l1_loss(model(past, future, baseline), target)
            if not torch.isfinite(loss):
                raise ValueError("Non-finite training loss")
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(loss.item())
        score = float(wmape(valid[3].numpy() * scales, predict(model, valid) * scales))
        history.append({"epoch": epoch + 1, "train_loss": float(np.mean(losses)), "validation_wmape": score})
        logger.info("Epoch %d | loss %.4f | validation WMAPE %.2f%%", epoch + 1, np.mean(losses), score * 100)
        if score < best:
            best, best_state, stale = score, deepcopy(model.state_dict()), 0
        else:
            stale += 1
        if stale >= int(settings.get("patience", 3)):
            break
    if best_state is None:
        raise ValueError("No valid GRU checkpoint produced")
    model.load_state_dict(best_state)
    predictions = predict(model, test) * scales
    # Preserve original observed amounts without round-trip scaling error.
    actual = np.stack([s["sales"][s["dates"].get_loc(valid_end) + 1:s["dates"].get_loc(valid_end) + horizon + 1]
                       for s in evaluated])
    baseline = np.stack([np.resize(s["sales"][s["dates"].get_loc(valid_end) - 6:s["dates"].get_loc(valid_end) + 1], horizon)
                         for s in evaluated])
    rows = []
    for index, item in enumerate(evaluated):
        for day in range(horizon):
            rows.append(dict(zip(cfg["id_cols"], item["key"])) | {
                cfg["date_col"]: valid_end + pd.Timedelta(days=day + 1),
                cfg["target_col"]: float(actual[index, day]), "y_pred": float(predictions[index, day]),
                "seasonal_pred": float(baseline[index, day]), "forecast_origin": valid_end,
                "horizon_day": day + 1})
    output = pd.DataFrame(rows)
    output.to_parquet(reports / "gru_predictions.parquet", index=False)
    write_frame(cfg, "gru_predictions", output)
    torch.save({"state_dict": best_state, "settings": settings,
                "scales": [{"key": list(s["key"]), "scale": s["scale"]} for s in series],
                "train_end": str(train_end.date()), "input_features": ["scaled_sales", "weekday_sin", "weekday_cos", "year_sin", "year_cos"]},
               models / "gru_model.pt")
    result = {"protocol": "fixed_origin_direct_multistep", "model": "Attention GRU",
              "train_end": str(train_end.date()), "forecast_origin": str(valid_end.date()),
              "test_start": str(output[cfg["date_col"]].min().date()),
              "test_end": str(output[cfg["date_col"]].max().date()), "horizon": horizon,
              "lookback": lookback, "series": len(evaluated), "excluded_series": len(series) - len(evaluated),
              "training_samples": len(windows), "observations": len(output), "seed": seed,
              "best_validation_wmape": best, "history": history,
              "training_seconds": round(time.monotonic() - started, 2),
              "metrics": {"gru": {"wmape_percent": float(wmape(actual, predictions) * 100), "rmse": rmse(actual, predictions)},
                          "seasonal_naive": {"wmape_percent": float(wmape(actual, baseline) * 100), "rmse": rmse(actual, baseline)}},
              "limitations": ["Single fixed-origin test; repeated rolling-origin evaluation is still needed.",
                              "Compare GRU only with this same-origin seasonal baseline, not historical model artifacts.",
                              "Rossmann measures store sales revenue, not SKU unit demand or inventory savings.",
                              "Future promotions and opening schedules are not used; only future calendar features are known."]}
    (reports / "gru_backtest.json").write_text(json.dumps(result, indent=2) + "\n")
    logger.info("Fixed-origin test: %s", result["metrics"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="configs/config.yaml")
    main(parser.parse_args().config)
