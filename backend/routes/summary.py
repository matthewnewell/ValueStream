import os

from flask import Blueprint, jsonify, request

from models import Map
from routes.maps import compute_metrics_recursive

bp = Blueprint("summary", __name__, url_prefix="/api")

# Where this app's own frontend lives, for building a deep link into the summarized map — not
# read from Conway's Depot (this app stays unaware of it, same as models.py's Map.portfolio /
# Map.project comment explains). Override in .env for a non-default port or a deployed origin.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")

# Process cycle efficiency thresholds for the tile's status color — PCE is the standard Lean
# "value-add time / lead time" ratio; these bands are the conventional reading (world-class
# manufacturing sits above ~25%, most admin/engineering workflows run in the single digits),
# not something invented for this tile.
_PCE_CRITICAL_BELOW = 5.0
_PCE_WARN_BELOW = 15.0


def _fmt_lead_time(seconds: float) -> str:
    days = seconds / 86400
    if days >= 1:
        return f"{days:.1f}d lead time"
    hours = seconds / 3600
    return f"{hours:.1f}h lead time"


@bp.get("/summary")
def summary():
    """The Launchpad's app-summary contract (see Conway's Depot's routes/applications.py for
    the proxy that calls this). `project_id` here is never Conway's Depot's own project id —
    the Depot translates it through its ProjectAppLink.external_ref crosswalk into whatever
    pointer this app actually understands, which for Value Stream is one of its own map ids
    (the same id its seed data and "Design -> Procure -> Build -> Ship" demo link already use).
    No match (no id passed, a stale/deleted map, a project that was never linked) is a normal
    state, not an error — same {headline: null, label, status: null, href: null} shape the
    Depot itself falls back to."""
    map_id = request.args.get("project_id")
    m = Map.query.get(map_id) if map_id else None
    if m is None:
        return jsonify({"headline": None, "label": "No map linked yet", "status": None, "href": None})

    metrics = compute_metrics_recursive(m)
    bottleneck = metrics.get("bottleneck")
    pce = metrics["process_cycle_efficiency_pct"]

    status = "ok"
    if pce < _PCE_CRITICAL_BELOW:
        status = "critical"
    elif pce < _PCE_WARN_BELOW:
        status = "warn"

    label = f"Bottleneck: {bottleneck['name']}" if bottleneck else "No bottleneck identified"

    return jsonify({
        "headline": _fmt_lead_time(metrics["lead_time_sec"]),
        "label": label,
        "status": status,
        "href": f"{FRONTEND_BASE_URL}/maps/{m.id}/timeline",
    })
