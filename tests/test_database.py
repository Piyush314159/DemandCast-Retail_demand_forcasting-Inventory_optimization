import threading
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError

from src.data.database import database_url, forecast_summary, get_engine, read_frame, write_frame
from src.features.build_features import build_features


@pytest.fixture
def cfg(tmp_path, mysql_database):
    return {"dataset": {"processed_dir": str(tmp_path)}, "evaluation": {"output_dir": str(tmp_path)},
            "date_col": "date", "target_col": "sales", "id_cols": ["store_id", "item_id"],
            "features": {"lags": [1], "rolling_windows": [2]}}


def frame():
    return pd.DataFrame({"store_id": [1, 1, 2], "item_id": ["001", "001", "B"],
                         "date": pd.date_range("2020-01-01", periods=3), "sales": [10, 20, 30],
                         "promo": [0, 1, 0], "distance": [1., np.nan, 2.]})


def test_round_trip_preserves_features_and_replaces_without_duplicates(cfg):
    original = frame()
    write_frame(cfg, "sales", original)
    loaded = read_frame(cfg, "sales")
    pd.testing.assert_frame_equal(loaded, original)
    pd.testing.assert_frame_equal(build_features(loaded, cfg), build_features(original.copy(), cfg))
    write_frame(cfg, "sales", original.iloc[:1])
    pd.testing.assert_frame_equal(read_frame(cfg, "sales"), original.iloc[:1])


def test_bootstrap_only_once_then_mysql_is_authoritative(cfg, tmp_path):
    path = tmp_path / "old.parquet"
    original = frame()
    original.to_parquet(path, index=False)
    read_frame(cfg, "sales", path)
    path.unlink()
    pd.testing.assert_frame_equal(read_frame(cfg, "sales", path), original)


def test_failed_insert_keeps_previous_data(cfg):
    write_frame(cfg, "sales", frame())
    with patch.object(pd.DataFrame, "to_sql", side_effect=RuntimeError("failed import")):
        with pytest.raises(RuntimeError, match="failed import"):
            write_frame(cfg, "sales", frame().iloc[:1])
    pd.testing.assert_frame_equal(read_frame(cfg, "sales"), frame())


def test_bootstrap_does_not_overwrite_a_concurrently_published_snapshot(cfg):
    current = frame().assign(sales=[101, 102, 103])
    write_frame(cfg, "sales", current)
    assert write_frame(cfg, "sales", frame(), if_missing=True) is False
    pd.testing.assert_frame_equal(read_frame(cfg, "sales"), current)


def test_summary_uses_mysql_and_indexes_exist(cfg):
    write_frame(cfg, "lightgbm_predictions", frame().assign(y_pred=[8., 22., 33.]))
    with patch("src.data.database.read_frame", side_effect=AssertionError("full read")):
        summary = forecast_summary(cfg)
    assert summary.observations.tolist() == [2, 1]
    assert summary.wmape.iloc[0] == pytest.approx(4 / 30)
    assert "idx_series" in {index["name"] for index in inspect(get_engine(cfg)).get_indexes("lightgbm_predictions")}
    with get_engine(cfg).connect() as conn:
        assert conn.execute(text("SELECT name FROM dataset_tables WHERE name='lightgbm_predictions'")).scalar() == "lightgbm_predictions"


def test_mysql_atomic_rename_failure_preserves_old_data_and_schema(cfg):
    write_frame(cfg, "sales", frame())
    def invalid_rename(conn, pairs):
        conn.commit()
        conn.exec_driver_sql("RENAME TABLE sales TO _test_retired, _nonexistent TO sales")
    with patch("src.data.database._publish", side_effect=invalid_rename):
        with pytest.raises(DBAPIError):
            write_frame(cfg, "sales", frame().assign(new_column=2))
    pd.testing.assert_frame_equal(read_frame(cfg, "sales"), frame())
    assert "_test_retired" not in inspect(get_engine(cfg)).get_table_names()


def test_refresh_changes_columns_and_preserves_empty_frames(cfg):
    write_frame(cfg, "sales", frame())
    changed = frame().assign(active=[True, False, True], label=["café", "東京", "O'Reilly"])
    write_frame(cfg, "sales", changed)
    pd.testing.assert_frame_equal(read_frame(cfg, "sales"), changed)
    write_frame(cfg, "sales", changed.iloc[:0])
    pd.testing.assert_frame_equal(read_frame(cfg, "sales"), changed.iloc[:0])


def test_row_order_and_nanosecond_datetime_are_preserved(cfg):
    original = frame().iloc[[2, 0, 1]].reset_index(drop=True)
    original["date"] = pd.to_datetime(["2020-01-01 00:00:00.123456789", "2020-01-01 00:00:00.123456788", "2020-01-02"] , format="mixed")
    write_frame(cfg, "sales", original)
    pd.testing.assert_frame_equal(read_frame(cfg, "sales"), original)


def test_reader_cannot_mix_old_schema_with_new_data(cfg):
    from src.data.database import _publish
    write_frame(cfg, "sales", frame())
    ready = threading.Event()
    errors = []
    def publishing(conn, pairs):
        ready.set()
        return _publish(conn, pairs)
    def writer():
        try:
            write_frame(cfg, "sales", frame().assign(new_column=2))
        except Exception as error:
            errors.append(error)
    with patch("src.data.database._publish", side_effect=publishing):
        with get_engine(cfg).begin() as conn:
            conn.execute(text("SELECT schema_json FROM _schema_sales")).one()
            thread = threading.Thread(target=writer)
            thread.start()
            assert ready.wait(10)
            # The writer is waiting for this reader's metadata locks.
            assert "new_column" not in pd.read_sql_query(text("SELECT * FROM sales"), conn).columns
        thread.join(15)
    assert not thread.is_alive()
    assert not errors
    assert "new_column" in read_frame(cfg, "sales").columns


def test_pipeline_stages_use_mysql_and_keep_exports(cfg, tmp_path):
    import yaml
    from src.data.load_data import main as load
    from src.features.build_features import main as features
    from src.models.baseline_naive import main as naive
    raw = tmp_path / "raw"
    raw.mkdir()
    pd.DataFrame({"Store": [1] * 12, "Date": pd.date_range("2020-01-01", periods=12),
                  "Sales": range(12), "Promo": [0] * 12}).to_csv(raw / "train.csv", index=False)
    pd.DataFrame({"Store": [1], "StoreType": ["a"]}).to_csv(raw / "store.csv", index=False)
    cfg["dataset"].update(name="rossmann", raw_dir=str(raw))
    cfg["split"] = {"train_end": "2020-01-08", "test_end": "2020-01-12"}
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(cfg))
    load(str(config))
    sales = read_frame(cfg, "sales")
    (tmp_path / "long_format.parquet").unlink()
    features(str(config))
    naive(str(config))
    pd.testing.assert_frame_equal(pd.read_parquet(tmp_path / "features.parquet"), build_features(sales, cfg))
    pd.testing.assert_frame_equal(read_frame(cfg, "naive_predictions"), pd.read_parquet(tmp_path / "naive_predictions.parquet"))


def test_password_characters_are_not_parsed_as_url_syntax(monkeypatch):
    monkeypatch.delenv("DEMANDCAST_DATABASE_URL", raising=False)
    monkeypatch.setenv("MYSQL_PASSWORD", "example:p@ss/word?#%")
    with patch("src.data.database.load_dotenv"):
        url = database_url({})
    assert url.password == "example:p@ss/word?#%"
    assert url.drivername == "mysql+pymysql"


def test_old_sqlite_config_and_sqlite_url_are_rejected(monkeypatch):
    with pytest.raises(ValueError, match="requires MySQL"):
        database_url({"database": {"path": "legacy.sqlite3"}})
    monkeypatch.setenv("DEMANDCAST_DATABASE_URL", "sqlite:///not-used.db")
    with pytest.raises(ValueError, match="mysql\\+pymysql"):
        database_url({})


def test_missing_credentials_and_unknown_tables_fail_explicitly(monkeypatch):
    monkeypatch.delenv("DEMANDCAST_DATABASE_URL", raising=False)
    monkeypatch.delenv("MYSQL_PASSWORD", raising=False)
    with patch("src.data.database.load_dotenv"):
        with pytest.raises(ValueError, match="No SQLite fallback"):
            database_url({})
    with pytest.raises(ValueError, match="Unknown database table"):
        read_frame({}, "sales; DROP DATABASE demandcast")


def test_unavailable_mysql_never_falls_back_to_saved_files(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMANDCAST_DATABASE_URL", "mysql+pymysql://unavailable:example@127.0.0.1:1/demandcast")
    path = tmp_path / "fallback.parquet"
    frame().to_parquet(path, index=False)
    with pytest.raises(DBAPIError):
        read_frame({}, "sales", path)
