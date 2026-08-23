from flask import Blueprint, jsonify, request

from db import db
from engine import compute_metrics
from models import Edge, Map, Step

bp = Blueprint("maps", __name__, url_prefix="/api/maps")


@bp.get("")
def list_maps():
    maps = Map.query.order_by(Map.updated_at.desc()).all()
    return jsonify([m.to_dict(include_graph=False) for m in maps])


@bp.post("")
def create_map():
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    m = Map(name=name, description=body.get("description"))
    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict()), 201


@bp.get("/<map_id>")
def get_map(map_id):
    m = Map.query.get_or_404(map_id)
    return jsonify(m.to_dict())


@bp.put("/<map_id>")
def update_map(map_id):
    m = Map.query.get_or_404(map_id)
    body = request.get_json(force=True) or {}

    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            return jsonify({"error": "name cannot be empty"}), 400
        m.name = name
    if "description" in body:
        m.description = body["description"]

    db.session.commit()
    return jsonify(m.to_dict())


@bp.delete("/<map_id>")
def delete_map(map_id):
    m = Map.query.get_or_404(map_id)
    db.session.delete(m)  # cascades to steps + edges via relationship cascade
    db.session.commit()
    return "", 204


@bp.post("/<map_id>/duplicate")
def duplicate_map(map_id):
    src = Map.query.get_or_404(map_id)
    body = request.get_json(silent=True) or {}
    new_name = (body.get("name") or f"{src.name} (copy)").strip()

    new_map = Map(name=new_name, description=src.description)
    db.session.add(new_map)
    db.session.flush()  # assign new_map.id without committing yet

    old_to_new_step_id = {}
    for s in src.steps:
        new_step = Step(
            map_id=new_map.id,
            name=s.name,
            description=s.description,
            pos_x=s.pos_x,
            pos_y=s.pos_y,
            human_time_sec=s.human_time_sec,
            machine_time_sec=s.machine_time_sec,
            operators=s.operators,
            machines=s.machines,
            notes=s.notes,
        )
        db.session.add(new_step)
        db.session.flush()
        old_to_new_step_id[s.id] = new_step.id

    for e in src.edges:
        db.session.add(
            Edge(
                map_id=new_map.id,
                source_step_id=old_to_new_step_id[e.source_step_id],
                target_step_id=old_to_new_step_id[e.target_step_id],
                wait_time_sec=e.wait_time_sec,
                label=e.label,
                kind=e.kind,
            )
        )

    db.session.commit()
    return jsonify(new_map.to_dict()), 201


@bp.get("/<map_id>/metrics")
def get_map_metrics(map_id):
    m = Map.query.get_or_404(map_id)
    metrics = compute_metrics(
        [s.to_dict() for s in m.steps],
        [e.to_dict() for e in m.edges],
    )
    return jsonify(metrics)


@bp.get("/<map_id>/export")
def export_map(map_id):
    m = Map.query.get_or_404(map_id)
    return jsonify(m.to_dict())


@bp.post("/import")
def import_map():
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "Imported map").strip()

    new_map = Map(name=name, description=body.get("description"))
    db.session.add(new_map)
    db.session.flush()

    old_to_new_step_id = {}
    for s in body.get("steps", []):
        new_step = Step(
            map_id=new_map.id,
            name=s.get("name", "Untitled step"),
            description=s.get("description"),
            pos_x=s.get("pos_x", 0.0),
            pos_y=s.get("pos_y", 0.0),
            human_time_sec=s.get("human_time_sec", 0.0),
            machine_time_sec=s.get("machine_time_sec", 0.0),
            operators=s.get("operators", 1),
            machines=s.get("machines", 0),
            notes=s.get("notes"),
        )
        db.session.add(new_step)
        db.session.flush()
        old_to_new_step_id[s["id"]] = new_step.id

    for e in body.get("edges", []):
        if e["source_step_id"] not in old_to_new_step_id or e["target_step_id"] not in old_to_new_step_id:
            continue  # skip edges referencing unknown steps rather than failing the whole import
        db.session.add(
            Edge(
                map_id=new_map.id,
                source_step_id=old_to_new_step_id[e["source_step_id"]],
                target_step_id=old_to_new_step_id[e["target_step_id"]],
                wait_time_sec=e.get("wait_time_sec", 0.0),
                label=e.get("label"),
                kind=e.get("kind", "flow"),
            )
        )

    db.session.commit()
    return jsonify(new_map.to_dict()), 201
