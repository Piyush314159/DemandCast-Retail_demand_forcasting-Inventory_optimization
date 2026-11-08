"""Temporal boundaries, missing dates and actual recurrent-model execution."""
import json

import numpy as np
import pandas as pd
import pytest
import yaml

pytest.importorskip("torch")
import torch

from src.data.database import read_frame, write_frame
from src.models.train_gru import AttentionGRU, main, prepare_series, window


def config(tmp_path):
    return {"dataset": {"processed_dir": str(tmp_path)}, "evaluation": {"output_dir": str(tmp_path)},
            "models_dir": str(tmp_path / "models"), "date_col": "date", "target_col": "sales",
            "id_cols": ["store_id", "item_id"],
            "split": {"train_end": "2024-03-10", "valid_end": "2024-03-24", "test_end": "2024-04-07"},
            "model": {"gru": {"lookback": 14, "horizon": 7, "hidden_size": 8, "epochs": 2,
                              "patience": 1, "training_days": 21, "max_samples": 100, "threads": 1}}}


def sales():
    dates = pd.date_range("2024-01-01", "2024-04-07")
    return pd.DataFrame({"date": dates, "store_id": 1, "item_id": "A",
                         "sales": 100 + np.arange(len(dates)) % 7 * 10})


def test_future_sales_do_not_change_encoder_scaling_or_seasonal_baseline(tmp_path):
    cfg = config(tmp_path)
    original = prepare_series(sales(), cfg)[0]
    changed = sales()
    changed.loc[changed.date > cfg["split"]["train_end"], "sales"] = 999999
    perturbed = prepare_series(changed, cfg)[0]
    assert original["scale"] == perturbed["scale"]
    first = window(original, cfg["split"]["train_end"], 14, 7)
    second = window(perturbed, cfg["split"]["train_end"], 14, 7)
    for i in range(3):
        np.testing.assert_array_equal(first[i], second[i])
    assert not np.array_equal(first[3], second[3])


def test_missing_calendar_day_is_not_filled_as_zero_or_bridged(tmp_path):
    cfg = config(tmp_path)
    original = sales()
    frame = original[original.date != pd.Timestamp("2024-03-08")]
    item = prepare_series(frame, cfg)[0]
    assert np.isnan(item["sales"][item["dates"].get_loc("2024-03-08")])
    assert window(item, "2024-03-10", 14, 7) is None


def test_duplicate_or_negative_observations_are_rejected(tmp_path):
    cfg = config(tmp_path)
    with pytest.raises(ValueError, match="Duplicate"):
        prepare_series(pd.concat([sales(), sales().head(1)]), cfg)
    frame = sales()
    frame.loc[0, "sales"] = -1
    with pytest.raises(ValueError, match="nonnegative"):
        prepare_series(frame, cfg)


def test_attention_gru_has_nonnegative_direct_multiday_outputs():
    torch.set_num_threads(1)
    model = AttentionGRU(8)
    output = model(torch.randn(3, 14, 5), torch.randn(3, 7, 4), torch.ones(3, 7))
    assert output.shape == (3, 7)
    assert torch.isfinite(output).all()
    assert (output >= 0).all()
    output.mean().backward()
    assert model.head[-1].weight.grad is not None


@pytest.mark.usefixtures("mysql_database")
def test_training_publishes_matched_sql_predictions_and_reusable_checkpoint(tmp_path):
    cfg = config(tmp_path)
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(cfg))
    write_frame(cfg, "sales", sales())
    main(str(path))
    predictions = read_frame(cfg, "gru_predictions")
    assert len(predictions) == 7
    assert predictions.date.min() == pd.Timestamp("2024-03-25")
    assert predictions.date.max() == pd.Timestamp("2024-03-31")
    assert predictions.forecast_origin.nunique() == 1
    np.testing.assert_array_equal(predictions.sales.to_numpy(), sales().set_index("date").loc[predictions.date, "sales"])
    checkpoint = torch.load(tmp_path / "models" / "gru_model.pt", weights_only=True)
    model = AttentionGRU(8)
    model.load_state_dict(checkpoint["state_dict"])
    report = json.loads((tmp_path / "gru_backtest.json").read_text())
    assert report["observations"] == 7
    assert set(report["metrics"]) == {"gru", "seasonal_naive"}
    assert np.isfinite(report["metrics"]["gru"]["wmape_percent"])
