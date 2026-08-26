import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import compute_metrics


def step(id_, name, human=0, machine=0):
    return {"id": id_, "name": name, "human_time_sec": human, "machine_time_sec": machine}


def edge(id_, src, tgt, wait=0, kind="flow"):
    return {
        "id": id_,
        "source_step_id": src,
        "target_step_id": tgt,
        "wait_time_sec": wait,
        "kind": kind,
        "label": None,
    }


def test_single_node():
    steps = [step("a", "A", human=10, machine=5)]
    m = compute_metrics(steps, [])

    assert m["lead_time_sec"] == 15
    assert m["total_processing_time_sec"] == 15
    assert m["process_cycle_efficiency_pct"] == 100.0
    assert m["critical_step_ids"] == ["a"]
    assert m["disconnected_step_ids"] == []
    assert m["bottleneck"]["step_id"] == "a"
    assert m["bottleneck"]["on_critical_path"] is True
    assert m["cycles_detected"] == []


def test_multi_source_multi_sink_and_critical_path():
    # A(10),B(5) -> C(20) -> D(8),E(30)   (multiple sources A/B, multiple sinks D/E)
    steps = [
        step("A", "A", human=10),
        step("B", "B", human=5),
        step("C", "C", human=20),
        step("D", "D", human=8),
        step("E", "E", human=30),
    ]
    edges = [
        edge("e1", "A", "C", wait=2),
        edge("e2", "B", "C", wait=1),
        edge("e3", "C", "D", wait=0),
        edge("e4", "C", "E", wait=0),
    ]
    m = compute_metrics(steps, edges)

    assert m["lead_time_sec"] == 62  # via A(10)+wait2 -> C(20) -> E(30) = 62
    assert set(m["critical_step_ids"]) == {"A", "C", "E"}
    assert "B" not in m["critical_step_ids"]
    assert "D" not in m["critical_step_ids"]
    assert set(m["critical_edge_ids"]) == {"e1", "e4"}

    # ToC bottleneck = highest single-node processing time across the WHOLE map = E (30)
    assert m["bottleneck"]["step_id"] == "E"
    assert m["bottleneck"]["on_critical_path"] is True

    assert m["disconnected_step_ids"] == []


def test_bottleneck_not_on_critical_path():
    # Branch 1: A -> B(50) -> Z    (B is the single heaviest processing step: total 52)
    # Branch 2: A -> C -> [wait 100] -> D   (dominated by wait time, not processing: total 103)
    # The critical path (longest overall) is A->C->D, but the ToC bottleneck (heaviest single
    # processing step) is B — and B is NOT on the critical path. This is the "your slowest
    # step isn't even on your longest path" insight the engine is meant to surface.
    steps = [
        step("A", "A", human=1),
        step("B", "B", human=50),
        step("Z", "Z", human=1),
        step("C", "C", human=1),
        step("D", "D", human=1),
    ]
    edges = [
        edge("e1", "A", "B", wait=0),
        edge("e2", "B", "Z", wait=0),
        edge("e3", "A", "C", wait=0),
        edge("e4", "C", "D", wait=100),
    ]
    m = compute_metrics(steps, edges)

    assert m["bottleneck"]["step_id"] == "B"
    assert m["bottleneck"]["on_critical_path"] is False
    assert set(m["critical_step_ids"]) == {"A", "C", "D"}
    assert m["lead_time_sec"] == 103


def test_tied_parallel_paths_are_all_critical():
    # S(5) -> A(10) -> T(5)
    # S(5) -> B(10) -> T(5)   (A and B are equal-length parallel branches: both critical)
    steps = [
        step("S", "S", human=5),
        step("A", "A", human=10),
        step("B", "B", human=10),
        step("T", "T", human=5),
    ]
    edges = [
        edge("e1", "S", "A"),
        edge("e2", "S", "B"),
        edge("e3", "A", "T"),
        edge("e4", "B", "T"),
    ]
    m = compute_metrics(steps, edges)

    assert m["lead_time_sec"] == 20
    assert set(m["critical_step_ids"]) == {"S", "A", "B", "T"}
    assert set(m["critical_edge_ids"]) == {"e1", "e2", "e3", "e4"}
    # PCE is 100%: this is a pure serial chain in time terms, no wait time anywhere.
    assert m["process_cycle_efficiency_pct"] == 100.0


def test_cycle_is_detected_and_excluded_from_cpm():
    # A -> B -> C -> A (rework loop)
    steps = [step("A", "A", human=5), step("B", "B", human=5), step("C", "C", human=5)]
    edges = [
        edge("e1", "A", "B", wait=1),
        edge("e2", "B", "C", wait=1),
        edge("e3", "C", "A", wait=1),  # closes the cycle
    ]
    m = compute_metrics(steps, edges)

    assert len(m["cycles_detected"]) == 1
    assert m["cycles_detected"][0]["edge_id"] == "e3"
    # cycle nodes are still one connected component, not flagged as disconnected
    assert m["disconnected_step_ids"] == []
    # with e3 excluded, A->B->C is a straight DAG: lead time = 5+1+5+1+5 = 17
    assert m["lead_time_sec"] == 17


def test_disconnected_steps_are_flagged_not_dropped():
    # Main flow: A -> B -> C (3 steps). Side chain: D -> E (2 steps). Isolated: F (1 step).
    steps = [
        step("A", "A", human=1), step("B", "B", human=1), step("C", "C", human=1),
        step("D", "D", human=1), step("E", "E", human=1),
        step("F", "F", human=1),
    ]
    edges = [
        edge("e1", "A", "B"),
        edge("e2", "B", "C"),
        edge("e3", "D", "E"),
    ]
    m = compute_metrics(steps, edges)

    assert set(m["disconnected_step_ids"]) == {"D", "E", "F"}
    assert m["lead_time_sec"] == 3  # A->B->C only
    assert m["step_metrics"]["F"]["is_critical"] is False
    assert m["step_metrics"]["F"]["earliest_start_sec"] is None


def test_empty_map():
    m = compute_metrics([], [])
    assert m["lead_time_sec"] == 0
    assert m["bottleneck"] is None
    assert m["critical_step_ids"] == []
    assert m["disconnected_step_ids"] == []


def test_self_loop_edges_are_not_expected_but_do_not_crash():
    # Defense in depth: the API layer rejects self-loops on create, but the engine itself
    # should not infinite-loop or crash if one ever slips through (e.g. bad data import).
    steps = [step("A", "A", human=5)]
    edges = [edge("e1", "A", "A", wait=1)]
    m = compute_metrics(steps, edges)
    assert len(m["cycles_detected"]) == 1
    assert m["lead_time_sec"] == 5


def test_top_wait_contributors_sorted_and_zero_wait_excluded():
    steps = [step("A", "A"), step("B", "B"), step("C", "C")]
    edges = [
        edge("e1", "A", "B", wait=0),
        edge("e2", "B", "C", wait=500),
    ]
    m = compute_metrics(steps, edges)
    assert len(m["top_wait_contributors"]) == 1
    assert m["top_wait_contributors"][0]["edge_id"] == "e2"


# ── Nested value streams (child_map_metrics rollup) ─────────────────────────────────────────


def test_step_with_child_map_uses_rolled_up_weight_not_own_fields():
    # A(1) -> Design -> C(1). Design's own human/machine fields are stale/irrelevant (10000s)
    # because it owns a child map whose own CPM lead time is only 500s — the rollup value must
    # win, not the step's raw fields.
    steps = [
        step("A", "A", human=1),
        step("Design", "Design", human=10000, machine=10000),
        step("C", "C", human=1),
    ]
    edges = [edge("e1", "A", "Design"), edge("e2", "Design", "C")]
    child_map_metrics = {
        "Design": {
            "lead_time_sec": 500,
            "total_human_time_sec": 50,
            "total_machine_time_sec": 20,
            "step_count": 6,
        },
    }
    m = compute_metrics(steps, edges, child_map_metrics=child_map_metrics)

    assert m["lead_time_sec"] == 502  # 1 + 500 + 1, not 1 + 20000 + 1
    sm = m["step_metrics"]["Design"]
    assert sm["has_child_map"] is True
    assert sm["child_step_count"] == 6
    assert sm["effective_processing_sec"] == 500
    assert sm["effective_human_sec"] == 50
    assert sm["effective_machine_sec"] == 20
    # 500 - 50 - 20 = 430s of rolled-up wait time (e.g. a CCB/approval cycle inside Design)
    assert sm["effective_wait_sec"] == 430


def test_bottleneck_can_be_a_step_with_a_child_map():
    # A plain leaf step (B, 10s) vs. a step with a child map whose rolled-up lead time (500s)
    # is much larger — the expanded step must win the ToC bottleneck search.
    steps = [
        step("A", "A", human=1),
        step("Design", "Design", human=1),  # own fields are trivial/stale
        step("B", "B", human=10),
    ]
    edges = [edge("e1", "A", "Design"), edge("e2", "A", "B")]
    child_map_metrics = {
        "Design": {"lead_time_sec": 500, "total_human_time_sec": 100, "total_machine_time_sec": 0, "step_count": 3},
    }
    m = compute_metrics(steps, edges, child_map_metrics=child_map_metrics)

    assert m["bottleneck"]["step_id"] == "Design"
    assert m["bottleneck"]["processing_time_sec"] == 500
    assert m["bottleneck"]["has_child_map"] is True


def test_leaf_steps_have_no_child_map_rollup():
    steps = [step("A", "A", human=5, machine=2)]
    m = compute_metrics(steps, [])
    sm = m["step_metrics"]["A"]
    assert sm["has_child_map"] is False
    assert sm["child_map_id"] is None
    assert sm["effective_processing_sec"] == 7
    assert sm["effective_human_sec"] == 5
    assert sm["effective_machine_sec"] == 2
    assert sm["effective_wait_sec"] == 0
    assert m["total_human_time_sec"] == 5
    assert m["total_machine_time_sec"] == 2
