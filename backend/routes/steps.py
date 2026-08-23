from flask import Blueprint, jsonify, request

from db import db
from models import Edge, Map, Step

bp = Blueprint("steps", __name__)

_EDITABLE_FIELDS = {
    "name", "description", "pos_x", "pos_y", "human_time_sec", "machine_time_sec",
    "operators", "machines", "notes",
}


@bp.post("/api/maps/<map_id>/steps")
def create_step(map_id):
    Map.query.get_or_404(map_id)  # 404 if the map doesn't exist
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    step = Step(
        map_id=map_id,
        name=name,
        description=body.get("description"),
        pos_x=body.get("pos_x", 0.0),
        pos_y=body.get("pos_y", 0.0),
        human_time_sec=body.get("human_time_sec", 0.0),
        machine_time_sec=body.get("machine_time_sec", 0.0),
        operators=body.get("operators", 1),
        machines=body.get("machines", 0),
        notes=body.get("notes"),
    )
    db.session.add(step)
    db.session.commit()
    return jsonify(step.to_dict()), 201


@bp.put("/api/steps/<step_id>")
def update_step(step_id):
    step = Step.query.get_or_404(step_id)
    body = request.get_json(force=True) or {}

    # Partial merge: only touch fields present in the body. Position-drag autosave sends
    # {pos_x, pos_y} on every drag-stop; drawer field edits send the time/operator fields
    # separately — a full-object PUT would let one clobber fields the other didn't intend to.
    for field in _EDITABLE_FIELDS:
        if field in body:
            setattr(step, field, body[field])

    if "name" in body and not (step.name or "").strip():
        return jsonify({"error": "name cannot be empty"}), 400

    db.session.commit()
    return jsonify(step.to_dict())


@bp.delete("/api/steps/<step_id>")
def delete_step(step_id):
    step = Step.query.get_or_404(step_id)
    # Edges aren't owned by Step (only Map.steps/Map.edges cascade), so any edge touching this
    # step as source or target must be removed explicitly first, or the FK (foreign_keys=ON)
    # would reject the delete.
    Edge.query.filter(
        (Edge.source_step_id == step_id) | (Edge.target_step_id == step_id)
    ).delete(synchronize_session=False)
    db.session.delete(step)
    db.session.commit()
    return "", 204
