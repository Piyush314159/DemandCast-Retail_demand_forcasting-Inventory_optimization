"""MySQL sales/forecast storage, with atomic data-and-schema publication.

SQLAlchemy + PyMySQL are the only runtime database path. Existing Parquet
exports can bootstrap missing tables.
"""
import argparse
from contextlib import contextmanager
from functools import lru_cache
import hashlib
import json
import logging
import os
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import BigInteger, Boolean, create_engine, inspect, text
from sqlalchemy.dialects.mysql import DOUBLE, LONGTEXT, VARCHAR
from sqlalchemy.engine import make_url, URL

from src.utils.io import load_config

logger = logging.getLogger(__name__)
TABLES = {
    "sales", "naive_predictions", "sarima_predictions", "prophet_predictions",
    "lightgbm_predictions", "gru_predictions", "reconciled_forecasts",
}
ROW_ID = "__dc_row_id"


def _check_name(name):
    if name not in TABLES:
        raise ValueError(f"Unknown database table: {name}")


def _quote(identifier):
    if not isinstance(identifier, str) or not identifier or len(identifier) > 64 or "\0" in identifier:
        raise ValueError("MySQL identifiers must contain 1–64 characters without NUL")
    return "`" + identifier.replace("`", "``") + "`"


def database_url(cfg):
    """Build credentials safely, allowing URL-reserved characters in passwords."""
    load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
    settings = cfg.get("database", {})
    if settings.get("driver", "mysql") != "mysql" or "path" in settings:
        raise ValueError("DemandCast now requires MySQL; replace database.path with MySQL connection settings")
    configured_url = os.getenv("DEMANDCAST_DATABASE_URL")
    if configured_url:
        url = make_url(configured_url)
        if url.drivername not in {"mysql", "mysql+pymysql"} or not url.database:
            raise ValueError("DEMANDCAST_DATABASE_URL must be a mysql+pymysql URL with a database name")
        return url.set(drivername="mysql+pymysql")
    password = os.getenv(settings.get("password_env", "MYSQL_PASSWORD"))
    if not password:
        raise ValueError("Set MYSQL_PASSWORD in the project .env, or set DEMANDCAST_DATABASE_URL. No SQLite fallback is used.")
    return URL.create(
        "mysql+pymysql", username=os.getenv("MYSQL_USER", settings.get("user", "demandcast")),
        password=password, host=os.getenv("MYSQL_HOST", settings.get("host", "127.0.0.1")),
        port=int(os.getenv("MYSQL_PORT", settings.get("port", 3306))),
        database=os.getenv("MYSQL_DATABASE", settings.get("name", "demandcast")),
        query={"charset": "utf8mb4"},
    )


def database_label(cfg):
    url = database_url(cfg)
    return f"MySQL {url.host or 'localhost'}:{url.port or 3306}/{url.database}"


def _metadata_table(name):
    return f"_schema_{name}"


def _create_metadata(conn, name):
    conn.exec_driver_sql(f"""CREATE TABLE IF NOT EXISTS {_quote(name)} (
        name VARCHAR(64) PRIMARY KEY, schema_json LONGTEXT NOT NULL,
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")


@lru_cache(maxsize=16)
def _engine(url):
    engine = create_engine(url, pool_pre_ping=True, pool_recycle=1800,
                           connect_args={"connect_timeout": 10}, hide_parameters=True)
    try:
        with engine.connect() as conn:
            # Each logical table has companion type metadata. MySQL publishes
            # the table and its metadata in one atomic multi-table RENAME.
            for name in sorted(TABLES):
                _create_metadata(conn, _metadata_table(name))
            union = " UNION ALL ".join(
                f"SELECT name, schema_json, updated_at FROM {_quote(_metadata_table(name))}"
                for name in sorted(TABLES))
            conn.exec_driver_sql("CREATE OR REPLACE VIEW dataset_tables AS " + union)
            conn.commit()
    except Exception:
        engine.dispose()
        raise
    return engine


def get_engine(cfg):
    return _engine(database_url(cfg))


@contextmanager
def _writer_lock(conn, cfg, name):
    key = "dc:" + hashlib.sha256(f"{database_url(cfg).database}:{name}".encode()).hexdigest()[:52]
    acquired = conn.execute(text("SELECT GET_LOCK(:key, 30)"), {"key": key}).scalar()
    conn.commit()
    if acquired != 1:
        raise TimeoutError(f"Another writer is still refreshing {name}")
    try:
        yield
    finally:
        conn.rollback()
        conn.execute(text("SELECT RELEASE_LOCK(:key)"), {"key": key})
        conn.commit()


def _publish(conn, pairs):
    """InnoDB RENAME is atomic, including all data/schema names in the list."""
    conn.commit()
    conn.exec_driver_sql("RENAME TABLE " + ", ".join(
        f"{_quote(source)} TO {_quote(destination)}" for source, destination in pairs))
    conn.commit()


def write_frame(cfg, name, frame, *, if_missing=False):
    """Publish a complete MySQL snapshot without exposing partial imports.

    Failed inserts, index creation or publication leave the prior table intact.
    Readers hold metadata locks in a transaction, so schema and data cannot
    come from different refreshes. The internal row key preserves frame order.
    """
    _check_name(name)
    columns = list(frame.columns)
    for column in columns:
        _quote(column)
    if ROW_ID.casefold() in {c.casefold() for c in columns}:
        raise ValueError(f"Column {ROW_ID} is reserved for database row ordering")
    if len({c.casefold() for c in columns}) != len(columns):
        raise ValueError("MySQL column names must be unique without regard to case")
    schema = {column: str(dtype) for column, dtype in frame.dtypes.items()}
    stored = frame.copy()
    dtype_map = {}
    keys = [c for c in list(cfg.get("id_cols", ["store_id", "item_id"])) + [cfg.get("date_col", "date")] if c in columns]
    for column, dtype in frame.dtypes.items():
        if pd.api.types.is_datetime64_any_dtype(dtype):
            # VARCHAR preserves nanosecond precision and timezone offsets too.
            stored[column] = frame[column].astype(str).where(frame[column].notna(), None)
            dtype_map[column] = VARCHAR(64)
        elif pd.api.types.is_bool_dtype(dtype):
            dtype_map[column] = Boolean()
        elif pd.api.types.is_integer_dtype(dtype):
            dtype_map[column] = BigInteger()
        elif pd.api.types.is_numeric_dtype(dtype):
            dtype_map[column] = DOUBLE()
        else:
            dtype_map[column] = VARCHAR(191) if column in keys else LONGTEXT()
    stored[ROW_ID] = np.arange(len(frame), dtype="int64")
    dtype_map[ROW_ID] = BigInteger()
    token = uuid4().hex
    staging, stage_meta = f"_import_{token}", f"_meta_{token}"
    retired, retired_meta = f"_old_{token}", f"_oldmeta_{token}"
    metadata = _metadata_table(name)
    with get_engine(cfg).connect() as conn, _writer_lock(conn, cfg, name):
        if if_missing and conn.execute(text(
            f"SELECT 1 FROM {_quote(metadata)} WHERE name=:name"), {"name": name}).first():
            return False
        try:
            stored.head(0).to_sql(staging, conn, index=False, dtype=dtype_map)
            conn.exec_driver_sql(f"ALTER TABLE {_quote(staging)} ENGINE=InnoDB, ADD PRIMARY KEY ({_quote(ROW_ID)})")
            stored.to_sql(staging, conn, if_exists="append", index=False, chunksize=2000, dtype=dtype_map)
            if keys:
                conn.exec_driver_sql(f"CREATE INDEX idx_series ON {_quote(staging)} (" + ", ".join(_quote(c) for c in dict.fromkeys(keys)) + ")")
            _create_metadata(conn, stage_meta)
            conn.execute(text(f"INSERT INTO {_quote(stage_meta)} (name, schema_json) VALUES (:name, :schema)"),
                         {"name": name, "schema": json.dumps(schema)})
            conn.commit()
            exists = inspect(conn).has_table(name)
            pairs = ([(name, retired)] if exists else []) + [
                (staging, name), (metadata, retired_meta), (stage_meta, metadata)]
            _publish(conn, pairs)
        finally:
            conn.rollback()
            # Never target a live table: all cleanup names are fresh UUIDs.
            for temporary in (staging, stage_meta, retired, retired_meta):
                try:
                    conn.exec_driver_sql(f"DROP TABLE IF EXISTS {_quote(temporary)}")
                    conn.commit()
                except Exception:
                    conn.rollback()
                    logger.warning("Could not remove temporary MySQL table %s", temporary)
    return True


def read_frame(cfg, name, legacy_path=None):
    """Read MySQL, importing a saved Parquet file only for a missing table."""
    _check_name(name)
    with get_engine(cfg).begin() as conn:
        # Transaction-held metadata locks prevent RENAME from changing this
        # schema between the metadata query and the data query.
        row = conn.execute(text(f"SELECT schema_json FROM {_quote(_metadata_table(name))} WHERE name=:name"),
                           {"name": name}).first()
        if row is not None:
            schema = json.loads(row[0])
            if not schema:
                return pd.DataFrame()
            projection = ", ".join(_quote(column) for column in schema)
            frame = pd.read_sql_query(text(f"SELECT {projection} FROM {_quote(name)} ORDER BY {_quote(ROW_ID)}"), conn)
            for column, dtype in schema.items():
                if dtype.startswith("datetime64"):
                    frame[column] = pd.to_datetime(frame[column], format="mixed", utc="," in dtype).astype(dtype)
                else:
                    frame[column] = frame[column].astype(dtype)
            return frame
    if legacy_path is None or not Path(legacy_path).exists():
        raise FileNotFoundError(f"MySQL table {name} is missing. Run its pipeline stage first.")
    # A producer might publish after the missing-table check. Never replace
    # that newer SQL snapshot with a stale compatibility export.
    write_frame(cfg, name, pd.read_parquet(legacy_path), if_missing=True)
    return read_frame(cfg, name)


def forecast_summary(cfg, model="lightgbm"):
    """Aggregate on MySQL; forecast rows do not need to enter Python."""
    name = f"{model}_predictions"
    _check_name(name)
    with get_engine(cfg).begin() as conn:
        present = conn.execute(text(f"SELECT 1 FROM {_quote(_metadata_table(name))} WHERE name=:name"), {"name": name}).first()
    if not present:
        read_frame(cfg, name, Path(cfg["evaluation"]["output_dir"]) / f"{name}.parquet")
    actual = cfg["target_col"] if model in {"lightgbm", "naive", "gru"} else "y_true"
    with get_engine(cfg).begin() as conn:
        row = conn.execute(text(f"SELECT schema_json FROM {_quote(_metadata_table(name))} WHERE name=:name"), {"name": name}).one()
        if actual not in json.loads(row[0]):
            raise ValueError(f"Missing actual column: {actual}")
        actual = _quote(actual)
        return pd.read_sql_query(text(f"""
            SELECT store_id, COUNT(*) AS observations,
                   SUM({actual}) AS actual_sales, SUM(y_pred) AS forecast_sales,
                   SUM(ABS({actual} - y_pred)) / NULLIF(SUM(ABS({actual})), 0) AS wmape
            FROM {_quote(name)} WHERE y_pred IS NOT NULL AND {actual} IS NOT NULL
            GROUP BY store_id ORDER BY store_id
        """), conn)


def main():
    parser = argparse.ArgumentParser(description="Query MySQL forecasts or import saved Parquet data.")
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--import-existing", action="store_true")
    parser.add_argument("--model", choices=["lightgbm", "naive", "sarima", "prophet", "gru"], default="lightgbm")
    args = parser.parse_args()
    cfg = load_config(args.config)
    if args.import_existing:
        paths = {"sales": Path(cfg["dataset"]["processed_dir"]) / "long_format.parquet"}
        paths.update({name: Path(cfg["evaluation"]["output_dir"]) / f"{name}.parquet" for name in TABLES - {"sales"}})
        for name, path in sorted(paths.items()):
            if path.exists():
                imported = read_frame(cfg, name, path)
                print(f"{name}: {len(imported):,} MySQL rows")
    print(f"Database: {database_label(cfg)}")
    print(forecast_summary(cfg, args.model).head(20).to_string(index=False))


if __name__ == "__main__":
    main()
