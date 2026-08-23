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
"""

from __future__ import annotations

from collections import defaultdict

_EPS = 1e-6
TOP_WAIT_CONTRIBUTORS = 5


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


def _run_cpm(node_ids: set[str], steps_by_id: dict[str, dict], dag_edges: list[dict]) -> dict:
    """Forward + backward pass over one DAG component. Returns per-node CPM values."""
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
        earliest_finish[v] = es + _weight(steps_by_id[v])

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
        latest_start[v] = lf - _weight(steps_by_id[v])

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
    """Deterministic single critical path (for the scalar PCE number), via backtrack through
    zero-slack nodes. The *set* of zero-slack nodes/edges (not this single path) is what the UI
    should use for highlighting — this path is only for computing one total-processing-time."""
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


def compute_metrics(steps: list[dict], edges: list[dict]) -> dict:
    """
    steps: list of dicts with at least {id, name, human_time_sec, machine_time_sec}
    edges: list of dicts with at least
           {id, source_step_id, target_step_id, wait_time_sec, kind, label}
    """
    steps_by_id = {s["id"]: s for s in steps}
    all_ids = set(steps_by_id.keys())

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
                -sum(_weight(steps_by_id[n]) for n in c),
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
        cpm = _run_cpm(main_component, steps_by_id, main_edges)
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
    total_processing_time = sum(_weight(steps_by_id[n]) for n in rep_path)
    pce = (total_processing_time / lead_time * 100.0) if lead_time > _EPS else 0.0

    # Theory-of-Constraints bottleneck: highest-weight step across the WHOLE map, independent
    # of critical path / component membership.
    bottleneck = None
    if steps:
        bottleneck_step = max(steps, key=lambda s: (_weight(s), s["id"]))
        bottleneck = {
            "step_id": bottleneck_step["id"],
            "name": bottleneck_step["name"],
            "processing_time_sec": _weight(bottleneck_step),
            "on_critical_path": bottleneck_step["id"] in critical_step_ids,
        }

    top_wait = sorted(flow_edges, key=lambda e: -(e.get("wait_time_sec") or 0))[
        :TOP_WAIT_CONTRIBUTORS
    ]
    top_wait_contributors = [
        {
            "edge_id": e["id"],
            "source_step_id": e["source_step_id"],
            "source_step_name": steps_by_id.get(e["source_step_id"], {}).get("name"),
            "target_step_id": e["target_step_id"],
            "target_step_name": steps_by_id.get(e["target_step_id"], {}).get("name"),
            "wait_time_sec": e.get("wait_time_sec") or 0,
        }
        for e in top_wait
        if (e.get("wait_time_sec") or 0) > 0
    ]

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
                (_weight(steps_by_id[n]) / lead_time * 100.0) if lead_time > _EPS else 0.0
            ),
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
        }

    return {
        "lead_time_sec": lead_time,
        "total_processing_time_sec": total_processing_time,
        "process_cycle_efficiency_pct": pce,
        "bottleneck": bottleneck,
        "critical_step_ids": critical_step_ids,
        "critical_edge_ids": critical_edge_ids,
        "top_wait_contributors": top_wait_contributors,
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
