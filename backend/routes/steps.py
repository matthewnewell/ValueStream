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
    # If this step owned a child map (a nested sub-process), that map is not cascade-deleted —
    # same "no silent deep destruction" reasoning as DELETE /api/maps/<id>. It becomes
    # ownerless and resurfaces in the top-level map list instead of vanishing outright.
    db.session.delete(step)
    db.session.commit()
    return "", 204


@bp.post("/api/steps/<step_id>/expand")
def expand_step(step_id):
    """Create a fresh, empty child map and link this step to it — "explode Design into its
    own Requirements Analysis -> Trade Study -> ... sub-process". Returns the new map so the
    frontend can navigate straight into it."""
    step = Step.query.get_or_404(step_id)
    if step.child_map_id:
        return jsonify({"error": "this step already has a sub-process — open it instead of expanding again"}), 400

    child_map = Map(
        name=f"{step.name} — sub-process",
        description=f'Sub-process for "{step.name}" in {step.map.name}.',
    )
    db.session.add(child_map)
    db.session.flush()  # assign child_map.id before linking

    step.child_map_id = child_map.id
    db.session.commit()
    return jsonify(child_map.to_dict()), 201


@bp.delete("/api/steps/<step_id>/child-map")
def collapse_step(step_id):
    """Delete this step's child map (and everything in it) and unlink it, turning the step
    back into a plain leaf. Destructive — the frontend confirms before calling this."""
    step = Step.query.get_or_404(step_id)
    if not step.child_map_id:
        return jsonify({"error": "this step has no sub-process to collapse"}), 400

    child_map = Map.query.get(step.child_map_id)
    step.child_map_id = None  # explicit, rather than relying solely on ON DELETE SET NULL
    if child_map is not None:
        db.session.delete(child_map)  # cascades to the child map's own steps + edges
    db.session.commit()
    return "", 204
