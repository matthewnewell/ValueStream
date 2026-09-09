from flask import Blueprint, jsonify, request

from db import db
from models import Map, MapEvent

from .guards import writable_or_403

bp = Blueprint("events", __name__)


@bp.get("/api/maps/<map_id>/events")
def list_events(map_id):
    """The map's journal, newest first. `?target_id=<id>` scopes it to one step/edge (the
    drawer's per-element view); omit it for the whole-map feed."""
    Map.query.get_or_404(map_id)
    q = MapEvent.query.filter_by(map_id=map_id)
    target_id = request.args.get("target_id")
    if target_id:
        q = q.filter_by(target_id=target_id)
    # Newest group first; within a group (one save) the mechanical changes, then the note.
    events = q.order_by(MapEvent.created_at.desc(), MapEvent.kind.asc(), MapEvent.id.asc()).all()
    return jsonify([e.to_dict() for e in events])


@bp.post("/api/maps/<map_id>/events")
def add_event(map_id):
    """Add a manual note. Body: {note, author?, target_type?, target_id?, target_name?}.
    Auto-captured 'change' events are written by the step/edge PUT routes, not here."""
    Map.query.get_or_404(map_id)
    if resp := writable_or_403(map_id):
        return resp
    body = request.get_json(force=True) or {}
    note = (body.get("note") or "").strip()
    if not note:
        return jsonify({"error": "note is required"}), 400

    ev = MapEvent(
        map_id=map_id,
        kind="note",
        note=note,
        author=(body.get("author") or "").strip() or None,
        target_type=body.get("target_type") or "map",
        target_id=body.get("target_id"),
        target_name=body.get("target_name"),
    )
    db.session.add(ev)
    db.session.commit()
    return jsonify(ev.to_dict()), 201


@bp.delete("/api/maps/<map_id>/events/<event_id>")
def delete_event(map_id, event_id):
    """Remove a manual note (a typo, a wrong call). 'change' history is permanent."""
    ev = MapEvent.query.get_or_404(event_id)
    if ev.map_id != map_id:
        return jsonify({"error": "event not found on this map"}), 404
    if resp := writable_or_403(map_id):
        return resp
    if ev.kind != "note":
        return jsonify({"error": "only manual notes can be deleted; change history is permanent"}), 400
    db.session.delete(ev)
    db.session.commit()
    return "", 204
