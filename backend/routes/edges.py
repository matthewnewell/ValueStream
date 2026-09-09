from flask import Blueprint, jsonify, request

import journal
from db import db
from models import Edge, Map, Step

from .guards import writable_or_403

bp = Blueprint("edges", __name__)

_WAIT_KINDS = {"internal", "external"}
_EDGE_KINDS = {"flow", "rework"}


def _validate_edge_body(body: dict) -> str | None:
    """Returns an error message for an invalid wait_kind / kind, else None. Missing or null
    wait_kind means "uncategorized"; kind defaults to "flow"."""
    if "wait_kind" in body and body["wait_kind"] is not None and body["wait_kind"] not in _WAIT_KINDS:
        return f"wait_kind must be one of {sorted(_WAIT_KINDS)} or null, got {body['wait_kind']!r}"
    if "kind" in body and body["kind"] not in _EDGE_KINDS:
        return f"kind must be one of {sorted(_EDGE_KINDS)}, got {body['kind']!r}"
    return None


@bp.post("/api/maps/<map_id>/edges")
def create_edge(map_id):
    Map.query.get_or_404(map_id)
    if resp := writable_or_403(map_id):
        return resp
    body = request.get_json(force=True) or {}

    source_id = body.get("source_step_id")
    target_id = body.get("target_step_id")
    if not source_id or not target_id:
        return jsonify({"error": "source_step_id and target_step_id are required"}), 400
    if source_id == target_id:
        return jsonify({"error": "a step cannot connect to itself"}), 400
    if err := _validate_edge_body(body):
        return jsonify({"error": err}), 400

    # Route-level check, not enforceable by a plain FK: both steps must exist AND belong to
    # this exact map (an edge can't span two different maps).
    source = Step.query.get(source_id)
    target = Step.query.get(target_id)
    if source is None or source.map_id != map_id:
        return jsonify({"error": "source_step_id does not belong to this map"}), 400
    if target is None or target.map_id != map_id:
        return jsonify({"error": "target_step_id does not belong to this map"}), 400

    edge = Edge(
        map_id=map_id,
        source_step_id=source_id,
        target_step_id=target_id,
        wait_time_sec=body.get("wait_time_sec", 0.0),
        label=body.get("label"),
        kind=body.get("kind", "flow"),
        wait_kind=body.get("wait_kind"),
        rework_rate=body.get("rework_rate"),
    )
    db.session.add(edge)
    db.session.commit()
    return jsonify(edge.to_dict()), 201


@bp.put("/api/edges/<edge_id>")
def update_edge(edge_id):
    edge = Edge.query.get_or_404(edge_id)
    if resp := writable_or_403(edge.map_id):
        return resp
    body = request.get_json(force=True) or {}
    if err := _validate_edge_body(body):
        return jsonify({"error": err}), 400

    before = {f: getattr(edge, f) for f in journal.EDGE_FIELDS}
    if "wait_time_sec" in body:
        edge.wait_time_sec = body["wait_time_sec"]
    if "label" in body:
        edge.label = body["label"]
    if "kind" in body:
        edge.kind = body["kind"]
    if "wait_kind" in body:
        edge.wait_kind = body["wait_kind"]
    if "rework_rate" in body:
        r = body["rework_rate"]
        edge.rework_rate = None if r is None else max(0.0, min(100.0, float(r)))

    src = Step.query.get(edge.source_step_id)
    tgt = Step.query.get(edge.target_step_id)
    edge_name = f"{src.name if src else '?'} → {tgt.name if tgt else '?'}"
    after = {f: getattr(edge, f) for f in journal.EDGE_FIELDS}
    journal.record_changes(
        edge.map_id, "edge", edge.id, edge_name, before, after, journal.EDGE_FIELDS,
        author=body.get("author"), note=body.get("journal_note"),
    )

    db.session.commit()
    return jsonify(edge.to_dict())


@bp.delete("/api/edges/<edge_id>")
def delete_edge(edge_id):
    edge = Edge.query.get_or_404(edge_id)
    if resp := writable_or_403(edge.map_id):
        return resp
    db.session.delete(edge)
    db.session.commit()
    return "", 204
