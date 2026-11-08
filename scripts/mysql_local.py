"""Start/stop a project-local MySQL 8.4 instance (macOS or Linux).

Install the server first, e.g. brew install mysql@8.4. Credentials and database
files stay in ignored local paths. No login service or global config is changed.
"""
import argparse
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time

from dotenv import dotenv_values, load_dotenv, set_key
import pymysql
from sqlalchemy.engine import URL

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
DATA = ROOT / "data" / "processed" / "mysql"
RUN = ROOT / "data" / "processed" / "mysql-run"
SOCKET = RUN / "mysql.sock"
PID = RUN / "mysql.pid"
LOG = RUN / "mysql.log"


def server_binary():
    candidates = [os.getenv("MYSQLD_BIN"), shutil.which("mysqld"),
                  "/opt/homebrew/opt/mysql@8.4/bin/mysqld", "/usr/local/opt/mysql@8.4/bin/mysqld"]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate).resolve()
    raise RuntimeError("Install MySQL 8.4 first (brew install mysql@8.4 on macOS), or set MYSQLD_BIN")


def credentials(create=False):
    if create:
        current = dotenv_values(ENV_FILE) if ENV_FILE.exists() else {}
        values = {"MYSQL_HOST": "127.0.0.1", "MYSQL_PORT": "3307", "MYSQL_DATABASE": "demandcast",
                  "MYSQL_USER": "demandcast", "MYSQL_PASSWORD": secrets.token_urlsafe(32),
                  "MYSQL_ROOT_PASSWORD": secrets.token_urlsafe(32)}
        if not ENV_FILE.exists():
            ENV_FILE.touch(mode=0o600)
        for key, default in values.items():
            if not current.get(key):
                set_key(str(ENV_FILE), key, os.getenv(key, default))
        os.chmod(ENV_FILE, 0o600)
        current = dotenv_values(ENV_FILE)
        if not current.get("DEMANDCAST_TEST_MYSQL_URL"):
            # Tests create and drop only fresh demandcast_test_* databases.
            url = URL.create("mysql+pymysql", username="root", password=current["MYSQL_ROOT_PASSWORD"],
                             host="127.0.0.1", port=int(current["MYSQL_PORT"]), database="mysql")
            set_key(str(ENV_FILE), "DEMANDCAST_TEST_MYSQL_URL", url.render_as_string(hide_password=False))
    load_dotenv(ENV_FILE, override=False)
    if not os.getenv("MYSQL_ROOT_PASSWORD"):
        raise RuntimeError("Project-local MySQL is not configured. Run this script with init first.")
    if os.getenv("MYSQL_HOST") != "127.0.0.1" or os.getenv("MYSQL_DATABASE") != "demandcast" or os.getenv("MYSQL_USER") != "demandcast":
        raise RuntimeError("Local helper requires MYSQL_HOST=127.0.0.1, MYSQL_DATABASE=demandcast, MYSQL_USER=demandcast. Use your own server for custom settings.")


def connect(password=None):
    return pymysql.connect(unix_socket=str(SOCKET), user="root",
                           password=os.environ["MYSQL_ROOT_PASSWORD"] if password is None else password,
                           connect_timeout=2, autocommit=True)


def verified_connection():
    conn = connect()
    with conn.cursor() as cursor:
        cursor.execute("SELECT @@datadir")
        actual = Path(cursor.fetchone()[0]).resolve()
    if actual != DATA.resolve():
        conn.close()
        raise RuntimeError("Refusing to control a MySQL instance outside this project's data folder")
    return conn


def launch(bootstrap=False):
    binary = server_binary()
    RUN.mkdir(parents=True, exist_ok=True, mode=0o700)
    args = [str(binary), "--no-defaults", f"--basedir={binary.parent.parent}", f"--datadir={DATA}",
            f"--socket={SOCKET}", f"--pid-file={PID}", f"--log-error={LOG}",
            "--bind-address=127.0.0.1", f"--port={os.getenv('MYSQL_PORT', '3307')}",
            "--mysqlx=OFF", "--local-infile=OFF", "--skip-log-bin", "--default-storage-engine=InnoDB",
            "--innodb-buffer-pool-size=128M", "--innodb-redo-log-capacity=64M"]
    if bootstrap:
        args.append("--skip-networking")
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)
    deadline = time.monotonic() + 50
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"MySQL did not start. Inspect {LOG}")
        try:
            conn = connect(password="" if bootstrap else None)
            conn.close()
            return
        except pymysql.Error:
            time.sleep(.2)
    raise TimeoutError(f"MySQL startup timed out. Inspect {LOG}")


def stop():
    with verified_connection() as conn, conn.cursor() as cursor:
        cursor.execute("SHUTDOWN")
    deadline = time.monotonic() + 20
    while PID.exists() and time.monotonic() < deadline:
        time.sleep(.2)
    if PID.exists():
        raise TimeoutError("MySQL is still shutting down")


def initialize():
    if (DATA / "auto.cnf").exists():
        raise RuntimeError("This project's MySQL data directory already exists. Use start; initialization never overwrites data.")
    credentials(create=True)
    DATA.mkdir(parents=True, mode=0o700, exist_ok=True)
    RUN.mkdir(parents=True, mode=0o700, exist_ok=True)
    binary = server_binary()
    result = subprocess.run([str(binary), "--no-defaults", "--initialize-insecure", f"--basedir={binary.parent.parent}",
                             f"--datadir={DATA}", f"--log-error={LOG}"], capture_output=True)
    if result.returncode:
        raise RuntimeError(f"MySQL initialization failed. Inspect {LOG}")
    launch(bootstrap=True)
    with connect(password="") as conn, conn.cursor() as cursor:
        cursor.execute("CREATE DATABASE demandcast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        for host in ("localhost", "127.0.0.1"):
            cursor.execute("CREATE USER 'demandcast'@%s IDENTIFIED BY %s", (host, os.environ["MYSQL_PASSWORD"]))
            cursor.execute("GRANT ALL PRIVILEGES ON demandcast.* TO 'demandcast'@%s", (host,))
        cursor.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s", (os.environ["MYSQL_ROOT_PASSWORD"],))
    stop()
    launch()
    print("MySQL initialized and started on 127.0.0.1:" + os.getenv("MYSQL_PORT", "3307"))
    print("Database: demandcast. Private credentials saved to the ignored project .env.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "start", "stop", "status"])
    args = parser.parse_args()
    if args.action == "init":
        initialize()
        return
    credentials()
    if args.action == "start":
        if PID.exists():
            try:
                os.kill(int(PID.read_text().strip()), 0)
            except ProcessLookupError:
                # A reboot/unclean shutdown can leave a PID file. Remove only
                # this project's stale marker; never signal another process.
                PID.unlink()
        if PID.exists():
            with verified_connection():
                print("Project MySQL is already running")
        else:
            launch()
            print("Project MySQL started")
    elif args.action == "stop":
        stop()
        print("Project MySQL stopped; its data is preserved")
    else:
        with verified_connection() as conn, conn.cursor() as cursor:
            cursor.execute("SELECT VERSION(), @@port")
            version, port = cursor.fetchone()
        print(f"MySQL {version} running on 127.0.0.1:{port}; database demandcast")


if __name__ == "__main__":
    main()
