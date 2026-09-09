"""Journal capture — turns a step/edge edit into append-only MapEvent rows.

The set of fields worth logging is deliberately narrow: the numbers and labels a PM would
review, not bookkeeping like node positions. Values are frozen as short display strings at
capture time (a log line should read the same forever, even after the formatter changes).
"""

from datetime import datetime, timezone

from db import db
from models import MapEvent

# field name -> label shown in the feed
STEP_FIELDS = {
    "name": "name",
    "human_time_sec": "human time",
    "machine_time_sec": "machine time",
    "operators": "operators",
    "machines": "machines",
    "description": "description",
    "pct_complete_accurate": "%C&A",
}

EDGE_FIELDS = {
    "wait_time_sec": "wait time",
    "label": "label",
    "wait_kind": "who controls it",
    "kind": "connector type",
    "rework_rate": "rework rate",
}

_UNITS = (("wk", 604800), ("d", 86400), ("h", 3600), ("m", 60))


def _num(v: float) -> str:
    return str(int(v)) if float(v) == int(v) else str(round(float(v), 2))


def _fmt(field: str, value) -> str:
    if value is None or value == "":
        return "—"
    if field.endswith("_sec"):
        s = float(value)
        if s == 0:
            return "0"
        for unit, size in _UNITS:
            if s >= size:
                return f"{_num(s / size)}{unit}"
        return f"{_num(s)}s"
    if field in ("pct_complete_accurate", "rework_rate"):
        return f"{_num(value)}%"
    return str(value)


def record_changes(
    map_id: str,
    target_type: str,
    target_id: str,
    target_name: str,
    before: dict,
    after: dict,
    fields: dict,
    *,
    author: str | None = None,
    note: str | None = None,
) -> bool:
    """Append one 'change' event per field in `fields` that actually changed, plus one 'note'
    event if `note` was supplied. All events from one save share an exact timestamp so the feed
    can group them. Returns whether anything changed. Caller commits."""
    author = (author or "").strip() or None
    ts = datetime.now(timezone.utc)
    changed = False
    for field, label in fields.items():
        old, new = before.get(field), after.get(field)
        if old == new:
            continue
        changed = True
        db.session.add(
            MapEvent(
                map_id=map_id,
                created_at=ts,
                target_type=target_type,
                target_id=target_id,
                target_name=target_name,
                author=author,
                kind="change",
                field=label,
                old_value=_fmt(field, old),
                new_value=_fmt(field, new),
            )
        )
    if note and note.strip():
        db.session.add(
            MapEvent(
                map_id=map_id,
                created_at=ts,
                target_type=target_type,
                target_id=target_id,
                target_name=target_name,
                author=author,
                kind="note",
                note=note.strip(),
            )
        )
    return changed
