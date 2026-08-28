from flask import Blueprint, jsonify, request

from db import db
from models import Edge, Map, Step

bp = Blueprint("edges", __name__)

_WAIT_KINDS = {"internal", "external"}


def _validate_wait_kind(body: dict) -> str | None:
    """Returns an error message if body has an invalid wait_kind, else None. A missing key or
    explicit null both mean "uncategorized" — only a non-null value outside the allowed set
    is rejected."""
    if "wait_kind" in body and body["wait_kind"] is not None and body["wait_kind"] not in _WAIT_KINDS:
        return f"wait_kind must be one of {sorted(_WAIT_KINDS)} or null, got {body['wait_kind']!r}"
    return None


@bp.post("/api/maps/<map_id>/edges")
def create_edge(map_id):
    Map.query.get_or_404(map_id)
    body = request.get_json(force=True) or {}

    source_id = body.get("source_step_id")
    target_id = body.get("target_step_id")
    if not source_id or not target_id:
        return jsonify({"error": "source_step_id and target_step_id are required"}), 400
    if source_id == target_id:
        return jsonify({"error": "a step cannot connect to itself"}), 400
    if err := _validate_wait_kind(body):
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
    )
    db.session.add(edge)
    db.session.commit()
    return jsonify(edge.to_dict()), 201


@bp.put("/api/edges/<edge_id>")
def update_edge(edge_id):
    edge = Edge.query.get_or_404(edge_id)
    body = request.get_json(force=True) or {}
    if err := _validate_wait_kind(body):
        return jsonify({"error": err}), 400

    if "wait_time_sec" in body:
        edge.wait_time_sec = body["wait_time_sec"]
    if "label" in body:
        edge.label = body["label"]
    if "kind" in body:
        edge.kind = body["kind"]
    if "wait_kind" in body:
        edge.wait_kind = body["wait_kind"]

    db.session.commit()
    return jsonify(edge.to_dict())


@bp.delete("/api/edges/<edge_id>")
def delete_edge(edge_id):
    edge = Edge.query.get_or_404(edge_id)
    db.session.delete(edge)
    db.session.commit()
    return "", 204
