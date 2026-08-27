"""
Bottleneck / lead-time engine — Critical Path Method (CPM) over a value-stream map's graph.

Pure functions operating on plain dicts (shape matches Step.to_dict() / Edge.to_dict()), so
this module has no Flask/DB dependency and is directly unit-testable. Routes call
`compute_metrics(steps, edges)` after loading a map's steps/edges from the ORM.

Model:
  - Node weight  = step["human_time_sec"] + step["machine_time_sec"]   (processing time)
  - Edge weight  = edge["wait_time_sec"]                                (queue/transport time)
  - Only edges with kind == "flow" participate (reserved for a future info-flow edge type).

Algorithm: forward pass (earliest start/finish) + backward pass (latest start/finish) + slack,
the standard PERT/CPM approach. Critical nodes/edges are exactly those with slack == 0 — this
is correct under ties / multiple equally-long paths, unlike backtracking from a single argmax.
A single deterministic representative critical path is also derived (for the scalar
total-processing-time / PCE numbers), by backtracking through zero-slack nodes.

Edge cases handled explicitly: cycles (detected and excluded from CPM, reported separately),
disconnected components (CPM runs on the largest component; other steps are flagged, not
silently dropped), single-node maps, multiple sources/sinks, parallel edges between the same
pair of steps (forward pass takes max over them, matching "wait for the slowest path").

Nested value streams: a step that owns a child map (see models.py's `Step.child_map_id`) gets
its "weight" (effective processing time) from that child map's own already-computed CPM lead
time, rather than from its own human_time_sec/machine_time_sec — the caller passes those
pre-computed child results in via `child_map_metrics`. This is what makes "the bottleneck is
Trade Study, three levels down inside Design" possible: the child map's wait time (a CCB/
approval cycle, say) is baked into the number that competes as this step's weight one level up,
recursively, with no special-casing needed at any single level. compute_metrics() itself does
not recurse — it only consumes already-computed child results — the route layer owns walking
the tree (see routes/maps.py's compute_metrics_recursive).
"""

from __future__ import annotations

from collections import defaultdict

_EPS = 1e-6


def _weight(step: dict) -> float:
    return float(step.get("human_time_sec") or 0) + float(step.get("machine_time_sec") or 0)


def _find_back_edges(node_ids: set[str], adj: dict[str, list[tuple[str, dict]]]) -> list[dict]:
    """DFS with white/gray/black coloring. Returns the edge dicts that close a cycle."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n: WHITE for n in node_ids}
    back_edges: list[dict] = []

    def visit(u: str):
        color[u] = GRAY
        for v, edge in sorted(adj.get(u, []), key=lambda pair: pair[0]):
            if color.get(v, WHITE) == WHITE:
                visit(v)
            elif color.get(v) == GRAY:
                back_edges.append(edge)
            # BLACK: forward/cross edge, not a cycle
        color[u] = BLACK

    for n in sorted(node_ids):
        if color[n] == WHITE:
            visit(n)

    return back_edges


def _weakly_connected_components(
    node_ids: set[str], edges: list[dict]
) -> list[set[str]]:
    undirected: dict[str, set[str]] = defaultdict(set)
    for n in node_ids:
        undirected[n]  # ensure isolated nodes appear
    for e in edges:
        undirected[e["source_step_id"]].add(e["target_step_id"])
        undirected[e["target_step_id"]].add(e["source_step_id"])

    seen: set[str] = set()
    components: list[set[str]] = []
    for start in sorted(node_ids):
        if start in seen:
            continue
        stack = [start]
        comp: set[str] = set()
        while stack:
            n = stack.pop()
            if n in comp:
                continue
            comp.add(n)
            stack.extend(undirected[n] - comp)
        seen |= comp
        components.append(comp)

    return components


def _topo_order(node_ids: set[str], preds: dict[str, list[tuple[str, dict]]]) -> list[str]:
    """Kahn's algorithm. Assumes `node_ids`/`preds` already form a DAG (cycles removed)."""
    indegree = {n: len(preds.get(n, [])) for n in node_ids}
    succ: dict[str, list[str]] = defaultdict(list)
    for v, incoming in preds.items():
        for u, _edge in incoming:
            succ[u].append(v)

    queue = sorted([n for n in node_ids if indegree[n] == 0])
    order: list[str] = []
    while queue:
        queue.sort()
        n = queue.pop(0)
        order.append(n)
        for v in succ[n]:
            indegree[v] -= 1
            if indegree[v] == 0:
                queue.append(v)
    return order


def _run_cpm(
    node_ids: set[str],
    steps_by_id: dict[str, dict],
    dag_edges: list[dict],
    weight_fn,
) -> dict:
    """Forward + backward pass over one DAG component. Returns per-node CPM values.

    `weight_fn(step)` supplies each node's duration — plain human+machine time for a leaf
    step, or a rolled-up child-map lead time for a step that owns a sub-process (see module
    docstring)."""
    preds: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    succs: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for e in dag_edges:
        preds[e["target_step_id"]].append((e["source_step_id"], e))
        succs[e["source_step_id"]].append((e["target_step_id"], e))

    order = _topo_order(node_ids, preds)

    earliest_start: dict[str, float] = {}
    earliest_finish: dict[str, float] = {}
    for v in order:
        incoming = preds.get(v, [])
        if not incoming:
            es = 0.0
        else:
            es = max(earliest_finish[u] + e["wait_time_sec"] for u, e in incoming)
        earliest_start[v] = es
        earliest_finish[v] = es + weight_fn(steps_by_id[v])

    lead_time = max(earliest_finish.values()) if earliest_finish else 0.0

    latest_finish: dict[str, float] = {}
    latest_start: dict[str, float] = {}
    for v in reversed(order):
        outgoing = succs.get(v, [])
        if not outgoing:
            lf = lead_time
        else:
            lf = min(latest_start[w] - e["wait_time_sec"] for w, e in outgoing)
        latest_finish[v] = lf
        latest_start[v] = lf - weight_fn(steps_by_id[v])

    slack = {v: max(0.0, latest_start[v] - earliest_start[v]) for v in node_ids}

    return {
        "order": order,
        "earliest_start": earliest_start,
        "earliest_finish": earliest_finish,
        "latest_start": latest_start,
        "latest_finish": latest_finish,
        "slack": slack,
        "lead_time": lead_time,
        "preds": preds,
    }


def _representative_critical_path(
    cpm: dict, node_ids: set[str]
) -> list[str]:
    """Deterministic single critical path (for the scalar PCE number, and for rendering a
    linear VSM timeline), via backtrack through zero-slack nodes. Two different things want
    two different shapes here: `critical_step_ids`/`critical_edge_ids` (elsewhere in this
    module) are the full *set* of zero-slack nodes/edges — correct under ties, right for
    highlighting every co-critical path on the canvas — while THIS ordered list is one single
    walkable sequence, source to sink, for anything that needs "first this, then that" (the
    scalar processing-time sum, and `critical_path_step_ids`/`critical_path_edge_ids` for a
    sawtooth timeline visual). Under a tie, which of several equal-length paths gets walked
    is arbitrary-but-deterministic (lowest id wins at each fork) — fine for a single number
    or one timeline rendering, not fine as "the" definitive critical path for highlighting."""
    if not node_ids:
        return []

    critical = [n for n in node_ids if cpm["slack"][n] < _EPS]
    if not critical:
        return []

    # Start from the zero-slack node with the latest earliest_finish (a critical sink).
    current = max(critical, key=lambda n: (cpm["earliest_finish"][n], n))
    path = [current]
    seen = {current}
    while True:
        candidates = [
            u
            for u, e in cpm["preds"].get(current, [])
            if cpm["slack"].get(u, 1) < _EPS
            and abs(cpm["earliest_finish"][u] + e["wait_time_sec"] - cpm["earliest_start"][current]) < _EPS
            and u not in seen
        ]
        if not candidates:
            break
        nxt = min(candidates)  # deterministic tie-break
        path.append(nxt)
        seen.add(nxt)
        current = nxt

    path.reverse()
    return path


def compute_metrics(
    steps: list[dict],
    edges: list[dict],
    child_map_metrics: dict[str, dict] | None = None,
) -> dict:
    """
    steps: list of dicts with at least {id, name, human_time_sec, machine_time_sec}
    edges: list of dicts with at least
           {id, source_step_id, target_step_id, wait_time_sec, kind, label}
    child_map_metrics: optional {step_id: {lead_time_sec, total_human_time_sec,
           total_machine_time_sec, step_count}} for any step that owns a child map — the
           caller (routes/maps.py) computes these recursively, bottom-up, before calling in.
    """
    child_map_metrics = child_map_metrics or {}
    steps_by_id = {s["id"]: s for s in steps}
    all_ids = set(steps_by_id.keys())

    def weight(step: dict) -> float:
        child = child_map_metrics.get(step["id"])
        return child["lead_time_sec"] if child else _weight(step)

    def human_weight(step: dict) -> float:
        child = child_map_metrics.get(step["id"])
        return child["total_human_time_sec"] if child else float(step.get("human_time_sec") or 0)

    def machine_weight(step: dict) -> float:
        child = child_map_metrics.get(step["id"])
        return child["total_machine_time_sec"] if child else float(step.get("machine_time_sec") or 0)

    flow_edges = [e for e in edges if e.get("kind", "flow") == "flow"]

    # Adjacency used for cycle detection (directed).
    adj: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for e in flow_edges:
        adj[e["source_step_id"]].append((e["target_step_id"], e))

    back_edges = _find_back_edges(all_ids, adj)
    back_edge_ids = {e["id"] for e in back_edges}
    acyclic_edges = [e for e in flow_edges if e["id"] not in back_edge_ids]

    # Weakly-connected components over ALL flow edges (a node in a cycle is still "connected"
    # to the map even though its cycle edge is excluded from the CPM DAG).
    components = _weakly_connected_components(all_ids, flow_edges)
    main_component: set[str] = (
        min(
            components,
            key=lambda c: (
                -len(c),
                -sum(weight(steps_by_id[n]) for n in c),
                sorted(c),
            ),
        )
        if components
        else set()
    )
    disconnected_ids = sorted(all_ids - main_component)

    main_edges = [
        e
        for e in acyclic_edges
        if e["source_step_id"] in main_component and e["target_step_id"] in main_component
    ]

    if main_component:
        cpm = _run_cpm(main_component, steps_by_id, main_edges, weight)
    else:
        cpm = {
            "earliest_start": {}, "earliest_finish": {}, "latest_start": {},
            "latest_finish": {}, "slack": {}, "lead_time": 0.0, "preds": {},
        }

    lead_time = cpm["lead_time"]
    critical_step_ids = sorted(n for n in main_component if cpm["slack"][n] < _EPS)
    critical_edge_ids = sorted(
        e["id"]
        for e in main_edges
        if cpm["slack"].get(e["source_step_id"], 1) < _EPS
        and cpm["slack"].get(e["target_step_id"], 1) < _EPS
        and abs(
            cpm["earliest_finish"][e["source_step_id"]]
            + e["wait_time_sec"]
            - cpm["earliest_start"][e["target_step_id"]]
        )
        < _EPS
    )

    rep_path = _representative_critical_path(cpm, main_component)
    total_processing_time = sum(weight(steps_by_id[n]) for n in rep_path)
    total_human_time = sum(human_weight(steps_by_id[n]) for n in rep_path)
    total_machine_time = sum(machine_weight(steps_by_id[n]) for n in rep_path)
    pce = (total_processing_time / lead_time * 100.0) if lead_time > _EPS else 0.0

    # Theory-of-Constraints bottleneck: highest-weight step across the WHOLE map, independent
    # of critical path / component membership. A step that owns a child map competes here using
    # its rolled-up lead time — a 3-week "Design" can absolutely be the real bottleneck, and if
    # it's picked, the route layer drills into it to report which step *inside* Design is truly
    # the deepest bottleneck (see routes/maps.py).
    bottleneck = None
    if steps:
        bottleneck_step = max(steps, key=lambda s: (weight(s), s["id"]))
        bottleneck = {
            "step_id": bottleneck_step["id"],
            "name": bottleneck_step["name"],
            "processing_time_sec": weight(bottleneck_step),
            "on_critical_path": bottleneck_step["id"] in critical_step_ids,
            "has_child_map": bottleneck_step["id"] in child_map_metrics,
        }

    # Every wait-bearing connector, worst first — no arbitrary cutoff. The engine's job is to
    # compute and sort; how many of these a UI chooses to show is a display decision, not a
    # data decision, and shouldn't be baked into the API response.
    wait_contributors = sorted(
        (
            {
                "edge_id": e["id"],
                "source_step_id": e["source_step_id"],
                "source_step_name": steps_by_id.get(e["source_step_id"], {}).get("name"),
                "target_step_id": e["target_step_id"],
                "target_step_name": steps_by_id.get(e["target_step_id"], {}).get("name"),
                "wait_time_sec": e.get("wait_time_sec") or 0,
                "label": e.get("label"),
            }
            for e in flow_edges
            if (e.get("wait_time_sec") or 0) > 0
        ),
        key=lambda w: (-w["wait_time_sec"], w["edge_id"]),
    )

    # Ordered step/edge sequence along the representative critical path, source to sink — for
    # rendering a classic VSM sawtooth timeline (box, gap, box, gap...). Reuses the same
    # rep_path already computed above rather than a second backtrack.
    critical_path_edges_by_pair: dict[tuple[str, str], dict] = {}
    for e in main_edges:
        pair = (e["source_step_id"], e["target_step_id"])
        critical_path_edges_by_pair.setdefault(pair, e)
    critical_path_edge_ids = [
        critical_path_edges_by_pair[(rep_path[i], rep_path[i + 1])]["id"]
        for i in range(len(rep_path) - 1)
        if (rep_path[i], rep_path[i + 1]) in critical_path_edges_by_pair
    ]

    def rollup_fields(n: str) -> dict:
        child = child_map_metrics.get(n)
        eff_processing = weight(steps_by_id[n])
        eff_human = human_weight(steps_by_id[n])
        eff_machine = machine_weight(steps_by_id[n])
        return {
            "has_child_map": child is not None,
            "child_map_id": steps_by_id[n].get("child_map_id"),
            "child_step_count": child["step_count"] if child else None,
            "effective_processing_sec": eff_processing,
            "effective_human_sec": eff_human,
            "effective_machine_sec": eff_machine,
            # Wait time rolled up from inside a child map (e.g. a CCB/approval cycle) — 0 for
            # an ordinary leaf step, since its own wait time lives on its *edges*, not on it.
            "effective_wait_sec": max(0.0, eff_processing - eff_human - eff_machine),
        }

    step_metrics = {}
    for n in main_component:
        step_metrics[n] = {
            "earliest_start_sec": cpm["earliest_start"][n],
            "earliest_finish_sec": cpm["earliest_finish"][n],
            "latest_start_sec": cpm["latest_start"][n],
            "latest_finish_sec": cpm["latest_finish"][n],
            "slack_sec": cpm["slack"][n],
            "is_critical": cpm["slack"][n] < _EPS,
            "pct_of_lead_time": (
                (weight(steps_by_id[n]) / lead_time * 100.0) if lead_time > _EPS else 0.0
            ),
            **rollup_fields(n),
        }
    for n in disconnected_ids:
        step_metrics[n] = {
            "earliest_start_sec": None,
            "earliest_finish_sec": None,
            "latest_start_sec": None,
            "latest_finish_sec": None,
            "slack_sec": None,
            "is_critical": False,
            "pct_of_lead_time": 0.0,
            **rollup_fields(n),
        }

    return {
        "lead_time_sec": lead_time,
        "total_processing_time_sec": total_processing_time,
        "total_human_time_sec": total_human_time,
        "total_machine_time_sec": total_machine_time,
        "process_cycle_efficiency_pct": pce,
        "bottleneck": bottleneck,
        "critical_step_ids": critical_step_ids,
        "critical_edge_ids": critical_edge_ids,
        "critical_path_step_ids": rep_path,
        "critical_path_edge_ids": critical_path_edge_ids,
        "wait_contributors": wait_contributors,
        "disconnected_step_ids": disconnected_ids,
        "cycles_detected": [
            {
                "edge_id": e["id"],
                "source_step_id": e["source_step_id"],
                "target_step_id": e["target_step_id"],
            }
            for e in back_edges
        ],
        "step_metrics": step_metrics,
        "step_count": len(steps),
        "edge_count": len(edges),
    }
