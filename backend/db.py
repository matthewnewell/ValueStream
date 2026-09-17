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
    ("map", "is_template", "ALTER TABLE map ADD COLUMN is_template BOOLEAN NOT NULL DEFAULT 0"),
    ("map", "template_category", "ALTER TABLE map ADD COLUMN template_category VARCHAR(100)"),
    # Project context a map belongs to — plain labels, not entities. Each ecosystem app keeps
    # its own copy of this (the Depot is the system of record), tied together by convention,
    # not a shared table. See models.Map.
    ("map", "portfolio", "ALTER TABLE map ADD COLUMN portfolio VARCHAR(200)"),
    ("map", "project", "ALTER TABLE map ADD COLUMN project VARCHAR(200)"),
    # Map lifecycle (working / published / featured / sample) — see models.MAP_LIFECYCLES. The
    # column lands defaulted to 'working'; _backfill below promotes the existing library
    # templates to 'featured', and seed.py tags the demo map 'sample'.
    ("map", "lifecycle", "ALTER TABLE map ADD COLUMN lifecycle VARCHAR(20) NOT NULL DEFAULT 'working'"),
    ("map", "cloned_from_map_id", "ALTER TABLE map ADD COLUMN cloned_from_map_id VARCHAR(36) REFERENCES map(id)"),
    ("map", "published_from_map_id", "ALTER TABLE map ADD COLUMN published_from_map_id VARCHAR(36) REFERENCES map(id)"),
    ("map", "published_at", "ALTER TABLE map ADD COLUMN published_at DATETIME"),
    # Quality / rework model. pct_complete_accurate: Lean VSM %C&A per step. rework_rate:
    # the escape rate on a kind="rework" edge (null → derived from the origin step's %C&A).
    ("step", "pct_complete_accurate", "ALTER TABLE step ADD COLUMN pct_complete_accurate FLOAT"),
    ("edge", "rework_rate", "ALTER TABLE edge ADD COLUMN rework_rate FLOAT"),
    # The owning team/function shown on a process box (VSM convention).
    ("step", "owning_team", "ALTER TABLE step ADD COLUMN owning_team VARCHAR(120)"),
]


def _backfill(app):
    """Data fixups the additive migrations above imply but ALTER TABLE can't express. Idempotent
    and cheap — safe to run every startup."""
    with app.app_context():
        inspector = inspect(db.engine)
        if "map" not in set(inspector.get_table_names()):
            return
        cols = {c["name"] for c in inspector.get_columns("map")}
        if not {"lifecycle", "is_template"} <= cols:
            return
        with db.engine.begin() as conn:
            # Library templates predate the lifecycle column, so the ALTER left them 'working'.
            # is_template has only ever been set on the seeded 15288 scaffolds → 'featured'.
            conn.execute(text(
                "UPDATE map SET lifecycle='featured' "
                "WHERE is_template=1 AND lifecycle='working'"
            ))


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


def _drop_dead_tables(app):
    """The one genuinely destructive migration here, unlike everything above — same exception
    Conway's Depot's own db.py documents for a truly dead column. `map_event` backed this app's
    own native per-map journal (auto-captured field changes + manual notes), removed in favor
    of Conway's Depot's cross-app Journal widget — no code writes or reads this table anymore,
    and the Depot was never told to merge its data in. SQLite (3.35+) can drop a table directly."""
    with app.app_context():
        inspector = inspect(db.engine)
        if "map_event" in set(inspector.get_table_names()):
            with db.engine.begin() as conn:
                conn.execute(text("DROP TABLE map_event"))


def init_db(app):
    db_path = get_db_path(app)
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    with app.app_context():
        event.listen(db.engine, "connect", _set_sqlite_pragma)
        db.create_all()

    _run_migrations(app)
    _backfill(app)
    _drop_dead_tables(app)
