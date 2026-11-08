"""Real MySQL integration tests, isolated from DemandCast's working database."""
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url


@pytest.fixture(scope="session")
def mysql_admin():
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    raw = os.getenv("DEMANDCAST_TEST_MYSQL_URL")
    if not raw:
        pytest.skip("Set DEMANDCAST_TEST_MYSQL_URL to run real MySQL integration tests")
    url = make_url(raw)
    if url.drivername != "mysql+pymysql":
        raise ValueError("MySQL integration tests require a mysql+pymysql admin URL")
    engine = create_engine(url, hide_parameters=True, connect_args={"connect_timeout": 5})
    with engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")
    yield engine
    engine.dispose()


@pytest.fixture
def mysql_database(mysql_admin, monkeypatch):
    name = "demandcast_test_" + uuid4().hex
    with mysql_admin.begin() as conn:
        conn.exec_driver_sql(f"CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    # Subprocess model stages inherit this exact isolated connection too.
    url = mysql_admin.url.set(database=name)
    monkeypatch.setenv("DEMANDCAST_DATABASE_URL", url.render_as_string(hide_password=False))
    try:
        yield name
    finally:
        from src.data.database import _engine, get_engine
        get_engine({}).dispose()
        _engine.cache_clear()
        with mysql_admin.begin() as conn:
            conn.exec_driver_sql(f"DROP DATABASE `{name}`")
