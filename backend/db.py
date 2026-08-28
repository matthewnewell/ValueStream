"""
Database setup — SQLAlchemy over SQLite.

Mirrors BurnedValue's db.py conventions: a module-level `db` object, `init_db(app)` that
creates tables then runs additive migrations, and a pragma listener enabling foreign keys.
Value Stream additionally enables WAL mode (BurnedValue does not) because position-drag autosave
and drawer saves produce more frequent small writes than BurnedValue's periodic entry model.
"""

import os
import uuid

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event, inspect, text

db = SQLAlchemy()


def _uuid() -> str:
    return str(uuid.uuid4())


def get_db_path(app) -> str:
    data_dir = os.environ.get("DATA_DIR", os.path.join(app.root_path, "..", "data"))
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "valuestream.db")


def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


# (table_name, column_name, add_column_sql) — additive-only migrations, run after create_all().
# No Alembic: three fresh tables, no legacy data. Revisit only if a destructive change is ever
# needed (SQLite's ALTER TABLE can't cleanly rename/drop/retype columns pre-3.35).
_MIGRATIONS = [
    ("step", "child_map_id", "ALTER TABLE step ADD COLUMN child_map_id VARCHAR(36) REFERENCES map(id)"),
    ("edge", "wait_kind", "ALTER TABLE edge ADD COLUMN wait_kind VARCHAR(20)"),
]


def _run_migrations(app):
    with app.app_context():
        inspector = inspect(db.engine)
        existing_tables = set(inspector.get_table_names())
        with db.engine.begin() as conn:
            for table_name, col_name, alter_sql in _MIGRATIONS:
                if table_name not in existing_tables:
                    continue  # table doesn't exist yet (fresh install already has the column)
                cols = {c["name"] for c in inspector.get_columns(table_name)}
                if col_name not in cols:
                    conn.execute(text(alter_sql))


def init_db(app):
    db_path = get_db_path(app)
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    with app.app_context():
        event.listen(db.engine, "connect", _set_sqlite_pragma)
        db.create_all()

    _run_migrations(app)
