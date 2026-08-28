from flask import Blueprint, jsonify, request

from db import db
from engine import compute_metrics
from models import Edge, Map, Step

bp = Blueprint("maps", __name__, url_prefix="/api/maps")

# Guards compute_metrics_recursive against a pathological/corrupted ownership chain. Nesting
# this deep shouldn't happen in practice — child maps are only ever created fresh via
# /expand, so the ownership graph is a tree by construction — this is defense in depth only.
MAX_NESTING_DEPTH = 12
_EMPTY_ROLLUP = {"lead_time_sec": 0.0, "total_human_time_sec": 0.0, "total_machine_time_sec": 0.0, "step_count": 0}


@bp.get("")
def list_maps():
    # A map that some step has expanded into a sub-process shouldn't clutter the top-level
    # map list — it's reached by drilling into that step, not by picking it off this list.
    # Templates are excluded the same way: they live in the map library (GET /maps/templates),
    # reached by cloning, not by picking one off the project list.
    child_map_ids = db.session.query(Step.child_map_id).filter(Step.child_map_id.isnot(None))
    maps = (
        Map.query.filter(~Map.id.in_(child_map_ids))
        .filter(Map.is_template.is_(False))
        .order_by(Map.updated_at.desc())
        .all()
    )
    return jsonify([m.to_dict(include_graph=False) for m in maps])


@bp.get("/templates")
def list_templates():
    """The map library: reusable starting points, grouped by template_category. Never shown
    in the main list — cloned via the same POST /<id>/duplicate every other map uses, which
    always drops is_template on the copy (see duplicate_map)."""
    templates = (
        Map.query.filter(Map.is_template.is_(True))
        .order_by(Map.template_category, Map.name)
        .all()
    )
    return jsonify([m.to_dict(include_graph=False) for m in templates])


def compute_metrics_recursive(map_obj: Map, _visited: frozenset[str] | None = None) -> dict:
    """Bottom-up recursive CPM: any step that owns a child map gets that child's metrics
    computed first (recursively), then folded into this level via engine.compute_metrics's
    child_map_metrics param. Also builds `deepest_bottleneck` — walking down through however
    many levels of nesting to report the actual leaf step, with a breadcrumb of every
    map/step hop along the way (see engine.py's module docstring for why this works: each
    level's own bottleneck search already only sees rolled-up weights, so if the winning step
    itself has a child map, its recursively-already-computed deepest_bottleneck is correct by
    construction — we just prepend one breadcrumb entry per level as recursion unwinds)."""
    visited = _visited or frozenset()
    if map_obj.id in visited or len(visited) >= MAX_NESTING_DEPTH:
        return {**_EMPTY_ROLLUP, "bottleneck": None, "deepest_bottleneck": None}
    visited = visited | {map_obj.id}

    child_map_metrics: dict[str, dict] = {}
    child_full_results: dict[str, dict] = {}
    for step in map_obj.steps:
        if not step.child_map_id:
            continue
        child_map = Map.query.get(step.child_map_id)
        if child_map is None:
            continue  # dangling reference — shouldn't happen (ON DELETE SET NULL prevents it)
        child_result = compute_metrics_recursive(child_map, visited)
        child_full_results[step.id] = (child_map, child_result)
        child_map_metrics[step.id] = {
            "lead_time_sec": child_result["lead_time_sec"],
            "total_human_time_sec": child_result["total_human_time_sec"],
            "total_machine_time_sec": child_result["total_machine_time_sec"],
            "step_count": child_result["step_count"],
        }

    metrics = compute_metrics(
        [s.to_dict() for s in map_obj.steps],
        [e.to_dict() for e in map_obj.edges],
        child_map_metrics=child_map_metrics,
    )

    bottleneck = metrics["bottleneck"]
    if bottleneck is None:
        metrics["deepest_bottleneck"] = None
    else:
        crumb = {
            "map_id": map_obj.id,
            "map_name": map_obj.name,
            "step_id": bottleneck["step_id"],
            "step_name": bottleneck["name"],
        }
        if bottleneck["step_id"] in child_full_results:
            _child_map, child_result = child_full_results[bottleneck["step_id"]]
            deeper = child_result["deepest_bottleneck"]
            metrics["deepest_bottleneck"] = (
                {**deeper, "breadcrumb": [crumb, *deeper["breadcrumb"]]} if deeper else {**bottleneck, "breadcrumb": [crumb]}
            )
        else:
            metrics["deepest_bottleneck"] = {**bottleneck, "breadcrumb": [crumb]}

    return metrics


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
    # Cascades to this map's own steps + edges only. Any step *inside* it that owned a child
    # map (a nested sub-process) is deleted too, but that child map itself is not — it becomes
    # ownerless and resurfaces in the top-level map list rather than being silently destroyed.
    # A deep, no-warning cascade felt like the wrong default for a delete this easy to trigger.
    db.session.delete(m)
    db.session.commit()
    return "", 204


def _deep_copy_map(src: Map, *, name: str, is_template: bool = False, template_category: str | None = None) -> Map:
    """Shared deep-copy mechanics for duplicate (plain copy, always is_template=False) and
    promote (copy into the library, is_template=True) below — same graph copy, different
    destination flags. Caller still owns the commit."""
    new_map = Map(
        name=name, description=src.description,
        is_template=is_template, template_category=template_category,
    )
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
            # child_map_id intentionally NOT copied: "one owning step per child map" is the
            # invariant that lets metrics rollup stay simple, and pointing two steps at the
            # same child map would break it. A copied step starts as a plain leaf; the
            # operator can /expand it fresh if the copy also needs its own sub-process.
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
                wait_kind=e.wait_kind,
            )
        )

    return new_map


@bp.post("/<map_id>/duplicate")
def duplicate_map(map_id):
    src = Map.query.get_or_404(map_id)
    body = request.get_json(silent=True) or {}
    new_name = (body.get("name") or f"{src.name} (copy)").strip()

    # is_template/template_category are deliberately NOT copied: cloning a template (or any
    # map) always produces a normal, editable project map, defaulting to is_template=False.
    # That's what keeps "cloned from the library" from silently becoming "another template."
    new_map = _deep_copy_map(src, name=new_name)

    db.session.commit()
    return jsonify(new_map.to_dict()), 201


@bp.post("/<map_id>/promote")
def promote_map_to_template(map_id):
    """The "closeout -> library" step from the Theory of Operation page: turn a finished
    project into a reusable starting point for the next one. This is a COPY, not a move — the
    original project map is left exactly where it was, still a normal map in the main list.
    Unlike a from-scratch template, the copy carries the original's actual recorded numbers
    forward (real durations, real wait times) rather than a zero scaffold — that's the whole
    point of promoting a *finished* project instead of starting from an empty template."""
    src = Map.query.get_or_404(map_id)
    if src.is_template:
        return jsonify({"error": "this map is already a library template"}), 400

    body = request.get_json(silent=True) or {}
    category = (body.get("template_category") or "").strip() or None
    new_name = (body.get("name") or f"Template: {src.name}").strip()

    new_map = _deep_copy_map(src, name=new_name, is_template=True, template_category=category)

    db.session.commit()
    return jsonify(new_map.to_dict()), 201


@bp.get("/<map_id>/metrics")
def get_map_metrics(map_id):
    m = Map.query.get_or_404(map_id)
    return jsonify(compute_metrics_recursive(m))


@bp.get("/<map_id>/breadcrumb")
def get_map_breadcrumb(map_id):
    """Root-to-current chain of {map_id, map_name, via_step_name} for rendering
    "Value Stream > Design > ..." navigation. `via_step_name` is the name of the step, in the
    PREVIOUS map in the list, whose child_map_id points down into this entry's map — null for
    the root entry, which isn't reached by drilling into anything."""
    chain = []
    current = Map.query.get_or_404(map_id)
    seen: set[str] = set()
    via_step_name = None
    for _ in range(MAX_NESTING_DEPTH + 1):
        if current.id in seen:
            break  # defensive: cyclic ownership shouldn't be reachable, but never hang on one
        seen.add(current.id)
        chain.append({"map_id": current.id, "map_name": current.name, "via_step_name": via_step_name})

        owning_step = Step.query.filter_by(child_map_id=current.id).first()
        if owning_step is None:
            break
        via_step_name = owning_step.name
        current = Map.query.get(owning_step.map_id)
        if current is None:
            break

    chain.reverse()
    return jsonify(chain)


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
                wait_kind=e.get("wait_kind"),
            )
        )

    db.session.commit()
    return jsonify(new_map.to_dict()), 201
