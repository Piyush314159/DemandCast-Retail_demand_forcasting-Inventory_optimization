import json
import importlib.util
import subprocess
import sys
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
import yaml

from src.data.database import write_frame
from src.evaluation.export_dashboard import main as export
from src.features.build_features import build_features
from src.models.train_lightgbm import get_feature_cols, make_splits
from run_pipeline import _import_mains


def cfg(tmp_path):
    return {"dataset": {"name": "rossmann", "processed_dir": str(tmp_path)},
            "evaluation": {"output_dir": str(tmp_path)}, "date_col": "date", "target_col": "sales",
            "id_cols": ["store_id", "item_id"], "features": {"lags": [1], "rolling_windows": [2]},
            "dashboard": {"snapshot_path": str(tmp_path / "workspace.json")},
            "split": {"train_end": "2024-01-01", "valid_end": "2024-01-02", "test_end": "2024-01-05"}}


def frame():
    return pd.DataFrame({"date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-05"]),
                         "store_id": [1, 1, 1], "item_id": ["A"] * 3, "sales": [10, 20, 30],
                         "Customers": [1, 2, 3], "promo": [0, 1, 0]})


def test_customer_counts_cannot_be_selected_as_forecast_features():
    columns = get_feature_cols(frame(), "sales", "date", ["store_id", "item_id"])
    assert "Customers" not in columns
    assert "sales" not in columns
    assert "promo" in columns


def test_lags_and_rolling_use_calendar_days_not_previous_rows(tmp_path):
    output = build_features(frame(), cfg(tmp_path))
    assert output.sales_lag_1.iloc[1] == 10
    assert np.isnan(output.sales_lag_1.iloc[2])
    assert np.isnan(output.sales_roll_mean_2.iloc[2])
    assert output.sales_roll_mean_2.iloc[1] == 10


def test_features_reject_zero_lags_duplicates_and_honor_flags(tmp_path):
    config = cfg(tmp_path)
    config["features"]["lags"] = [0]
    with pytest.raises(ValueError, match="positive"):
        build_features(frame(), config)
    config["features"]["lags"] = [1]
    with pytest.raises(ValueError, match="unique"):
        build_features(pd.concat([frame(), frame().head(1)]), config)
    config["features"].update(use_calendar=False, use_promo=False, use_holidays=False)
    output = build_features(frame(), config)
    assert "day_of_week" not in output
    assert "promo" not in output


def test_split_order_and_empty_windows_are_rejected(tmp_path):
    config = cfg(tmp_path)
    config["split"]["train_end"] = "2025-01-01"
    with pytest.raises(ValueError, match="train_end"):
        make_splits(frame(), "date", config)
    config = cfg(tmp_path)
    config["split"]["test_end"] = "2024-01-03"
    with pytest.raises(ValueError, match="contain observations"):
        make_splits(frame(), "date", config)


def test_optional_models_are_imported_only_when_their_stage_runs():
    with patch("run_pipeline.subprocess.run") as runner:
        stages = _import_mains(["gru"])
        runner.assert_not_called()
        stages["gru"]("settings.yaml")
        runner.assert_called_once_with([sys.executable, "-m", "src.models.train_gru", "--config", "settings.yaml"], check=True)


@pytest.mark.usefixtures("mysql_database")
def test_export_reads_real_sql_and_missing_models_are_not_simulated(tmp_path):
    config = cfg(tmp_path)
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(config))
    write_frame(config, "sales", frame())
    write_frame(config, "lightgbm_predictions", frame().assign(y_pred=[11., 19., 32.]))
    export(str(path))
    output = json.loads((tmp_path / "workspace.json").read_text())
    assert output["source"] == "MySQL forecast tables"
    assert output["salesRows"] == 3
    assert len(output["models"]) == 1
    model = output["models"][0]
    assert model["id"] == "lightgbm"
    assert model["actual"] == 60
    assert model["forecast"] == 62
    assert model["wmape"] == pytest.approx(4 / 60 * 100)
    assert model["stores"][0]["points"][0]["forecast"] == 11


@pytest.mark.usefixtures("mysql_database")
def test_corrupt_model_does_not_replace_last_good_snapshot(tmp_path):
    config = cfg(tmp_path)
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(config))
    output = tmp_path / "workspace.json"
    output.write_text('{"previous":"good"}')
    write_frame(config, "sales", frame())
    write_frame(config, "gru_predictions", frame().assign(y_pred=np.nan))
    with pytest.raises(ValueError, match="invalid forecasts"):
        export(str(path))
    assert json.loads(output.read_text()) == {"previous": "good"}


@pytest.mark.usefixtures("mysql_database")
def test_lightgbm_training_saves_training_only_vocabulary_and_input_provenance(tmp_path):
    if importlib.util.find_spec("lightgbm") is None:
        pytest.skip("LightGBM is optional for this integration check")
    config = cfg(tmp_path)
    config["models_dir"] = str(tmp_path / "models")
    config["split"] = {"train_end": "2024-03-01", "valid_end": "2024-03-21", "test_end": "2024-04-09"}
    config["model"] = {"lightgbm": {"objective": "regression", "num_leaves": 4, "learning_rate": .1,
                                      "n_estimators": 5, "early_stopping_rounds": 2, "min_child_samples": 2,
                                      "num_threads": 1, "verbosity": -1}}
    dates = pd.date_range("2024-01-01", "2024-04-09")
    frame = pd.DataFrame({"date": dates, "store_id": 1, "item_id": "A", "sales": 100 + np.arange(len(dates)),
                          "Customers": 10 + np.arange(len(dates)), "promo": np.arange(len(dates)) % 2,
                          "StoreType": ["train-only" if d <= pd.Timestamp("2024-03-01") else "unseen" for d in dates]})
    frame.to_parquet(tmp_path / "features.parquet", index=False)
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(config))
    subprocess.run([sys.executable, "-m", "src.models.train_lightgbm", "--config", str(path)], check=True)
    metadata = json.loads((tmp_path / "models" / "lightgbm_metadata.json").read_text())
    assert "Customers" not in metadata["features"]
    assert metadata["category_vocabularies"]["StoreType"] == ["train-only"]
    assert len(metadata["forecast_sha256"]) == 64
    write_frame(config, "sales", frame)
    export(str(path))
    snapshot = json.loads((tmp_path / "workspace.json").read_text())
    assert snapshot["models"][0]["inputWarning"] is None
