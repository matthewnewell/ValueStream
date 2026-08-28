from flask import Blueprint, jsonify, request

import ai_client
from models import Map, Step
from routes.maps import compute_metrics_recursive

bp = Blueprint("ai", __name__, url_prefix="/api")


def _duration_hint(step: Step) -> str:
    return (
        f'Step name: "{step.name}"\n'
        f"Description: {step.description or '(none provided)'}\n"
        f"Current values — human processing time: {step.human_time_sec}s, "
        f"machine processing time: {step.machine_time_sec}s, "
        f"operators: {step.operators}, machines: {step.machines}"
    )


@bp.post("/steps/<step_id>/ai-suggest")
def ai_suggest_step(step_id):
    step = Step.query.get_or_404(step_id)

    if not ai_client.is_configured():
        return jsonify({"error": ai_client.NOT_CONFIGURED_MESSAGE}), 503

    system = (
        "You are an industrial/manufacturing process analyst helping an operator estimate "
        "value-stream-mapping parameters for one process step. Given a step's name and "
        "description, estimate realistic human processing time and machine processing time "
        "in seconds (use large values for multi-day/week activities, e.g. a 2-week procurement "
        "lead is ~1209600 seconds), plus a reasonable operator and machine count. "
        "Wait/queue time is NOT part of this step — do not include it.\n\n"
        'Reply with a JSON object with exactly these keys: '
        '{"human_time_sec": <number>, "machine_time_sec": <number>, "operators": <integer>, '
        '"machines": <integer>, "rationale": "<one or two sentence explanation>"}'
    )
    map_ctx = f' It is part of a value stream map named "{step.map.name}".' if step.map else ""
    result = ai_client.chat_json(
        messages=[{"role": "user", "content": _duration_hint(step) + map_ctx}],
        system=system,
        max_tokens=500,
    )

    if "error" in result:
        return jsonify(result), 502

    return jsonify(
        {
            "human_time_sec": result.get("human_time_sec"),
            "machine_time_sec": result.get("machine_time_sec"),
            "operators": result.get("operators"),
            "machines": result.get("machines"),
            "rationale": result.get("rationale"),
        }
    )


def _build_context_lines(m: Map, metrics: dict) -> list[str]:
    """Plain-text description of a map's current computed state, shared by both /ai-insights
    (one-shot narrative) and /chat (ongoing conversation) so the two features never drift
    into describing a map differently. Always built fresh from compute_metrics_recursive at
    call time — never cached — so answers reflect the map's current state, not a stale one."""
    steps_by_id = {s.id: s for s in m.steps}

    lines = [
        f'Value stream map: "{m.name}"',
        f"Total lead time: {metrics['lead_time_sec']:.0f}s, "
        f"total processing time: {metrics['total_processing_time_sec']:.0f}s, "
        f"process cycle efficiency: {metrics['process_cycle_efficiency_pct']:.1f}%",
    ]

    # deepest_bottleneck, not the plain top-level bottleneck: for a step that owns a child
    # map, the top-level one just says "Design, 3.2 weeks" — deepest_bottleneck drills through
    # however many levels of nesting to the actual leaf step responsible, which is what an
    # operator asking "why" actually wants named. Explicitly labeled a *capacity* signal
    # (below, alongside it) so the model doesn't conflate "busiest work step" with "biggest
    # driver of the calendar" — those are frequently two different steps, and the whole point
    # of surfacing both is to stop a PM from fixating on the wrong one.
    db = metrics.get("deepest_bottleneck")
    if db:
        crumb = (
            " (inside " + " › ".join(h["step_name"] for h in db["breadcrumb"][:-1]) + ")"
            if len(db["breadcrumb"]) > 1
            else ""
        )
        lines.append(
            f'Capacity bottleneck (highest single-step WORK time — the constraint on '
            f'throughput, not necessarily the biggest driver of lead time): "{db["name"]}"'
            f"{crumb} at {db['processing_time_sec']:.0f}s "
            f"({'on' if db['on_critical_path'] else 'NOT on'} the critical path)."
        )

    if metrics["wait_contributors"]:
        top = metrics["wait_contributors"][0]
        lines.append(
            f"Dominant delay (the single biggest driver of lead time): "
            f"{top['source_step_name']} → {top['target_step_name']}, "
            f"{top['wait_time_sec']:.0f}s" + (f" ({top['label']})" if top.get("label") else "")
        )
        wbk = metrics.get("wait_by_kind_sec") or {}
        if wbk.get("internal") or wbk.get("external"):
            lines.append(
                f"Wait time you control (internal — approvals, sign-offs, holds): "
                f"{wbk.get('internal', 0):.0f}s. Wait time outside your control (external — "
                f"vendor/supplier/shipping): {wbk.get('external', 0):.0f}s."
            )
        lines.append("Largest wait/queue contributors:")
        # engine.py returns every wait-bearing connector, sorted worst-first, with no cutoff
        # (that's a display decision, not a data one) — trim here specifically because this
        # list is going into an LLM prompt, where an unbounded map could bloat token usage.
        for w in metrics["wait_contributors"][:5]:
            kind_note = f" [{w['wait_kind']}]" if w.get("wait_kind") else ""
            slip = w.get("slip_amplification")
            slip_note = (
                f" — SLIP RISK: a short delay here can miss the {slip['protects_wait_sec']:.0f}s "
                f"window it gates ({slip.get('protects_label') or slip['protects_target_step_name']})"
                if slip
                else ""
            )
            lines.append(
                f"  - {w['source_step_name']} → {w['target_step_name']}: "
                f"{w['wait_time_sec']:.0f}s wait{kind_note}"
                + (f" ({w['label']})" if w.get("label") else "")
                + slip_note
            )

    if metrics["disconnected_step_ids"]:
        names = [steps_by_id[sid].name for sid in metrics["disconnected_step_ids"] if sid in steps_by_id]
        lines.append(f"Steps not connected to the main flow: {', '.join(names)}")
    if metrics["cycles_detected"]:
        lines.append(f"{len(metrics['cycles_detected'])} rework loop(s)/cycle(s) detected.")

    lines.append("\nSteps:")
    for s in m.steps:
        sm = metrics["step_metrics"].get(s.id, {})
        if sm.get("has_child_map"):
            lines.append(
                f"  - {s.name}: expanded into its own {sm.get('child_step_count')}-step "
                f"sub-process — rolled-up total {sm.get('effective_processing_sec', 0):.0f}s "
                f"(human {sm.get('effective_human_sec', 0):.0f}s, "
                f"machine {sm.get('effective_machine_sec', 0):.0f}s, "
                f"wait inside it {sm.get('effective_wait_sec', 0):.0f}s)"
                + (f" — {s.description}" if s.description else "")
            )
        else:
            lines.append(
                f"  - {s.name}: human={s.human_time_sec:.0f}s, machine={s.machine_time_sec:.0f}s"
                + (f" — {s.description}" if s.description else "")
            )

    return lines


@bp.post("/maps/<map_id>/ai-insights")
def ai_insights(map_id):
    m = Map.query.get_or_404(map_id)

    if not ai_client.is_configured():
        return jsonify({"error": ai_client.NOT_CONFIGURED_MESSAGE}), 503

    metrics = compute_metrics_recursive(m)
    lines = _build_context_lines(m, metrics)

    system = (
        "You are a Lean/Six Sigma value-stream-mapping analyst for project-based engineering "
        "work (not repeatable manufacturing) — the constraint shifts over time and the map "
        "below is a snapshot, so speak to what THIS snapshot shows, not eternal truths. Given "
        "the computed metrics and step list, write a concise executive analysis (3-6 short "
        "paragraphs or bullet points). Explicitly distinguish the capacity bottleneck (the "
        "busiest work step — matters for throughput) from the dominant delay (the biggest "
        "driver of THIS project's calendar — matters for the deadline) when they differ; do "
        "not call the capacity bottleneck 'the bottleneck' as if it's the only one that "
        "matters. Call out slip-risk waits by name if any are flagged. Give 2-3 concrete, "
        "specific improvement suggestions, and prefer actionable ones over ones the operator "
        "can't control (an internal wait they can act on this week beats an external one they "
        "can only pad a buffer around). Be direct and practical, not generic."
    )
    narrative = ai_client.chat(
        messages=[{"role": "user", "content": "\n".join(lines)}],
        system=system,
        max_tokens=1024,
    )

    return jsonify({"narrative": narrative, "metrics": metrics})


@bp.post("/maps/<map_id>/chat")
def chat_with_map(map_id):
    """Ongoing conversation about one map — explanations, constraints, recommendations. The
    frontend owns conversation history (nothing persisted server-side): each request carries
    the full message list so far, and this route rebuilds the map's context fresh every time,
    meaning an edit made mid-conversation is reflected in the very next reply."""
    m = Map.query.get_or_404(map_id)

    if not ai_client.is_configured():
        return jsonify({"error": ai_client.NOT_CONFIGURED_MESSAGE}), 503

    body = request.get_json(force=True) or {}
    messages = body.get("messages")
    if not messages or not isinstance(messages, list):
        return jsonify({"error": "messages (a non-empty list) is required"}), 400

    metrics = compute_metrics_recursive(m)
    lines = _build_context_lines(m, metrics)

    system = (
        "You are a Lean/Six Sigma value-stream-mapping analyst for project-based engineering "
        "work, having an ongoing conversation with the operator who owns the value stream map "
        "described below. Answer questions about it, explain what's driving lead time, discuss "
        "constraints, and give concrete, specific recommendations grounded in the actual "
        "numbers below — never generic advice unconnected to this map. Keep the capacity "
        "bottleneck (busiest work step) and the dominant delay (biggest driver of the "
        "calendar) distinct if the operator conflates them — they're often different steps. "
        "Point out slip-risk waits (a short delay that gates a much longer one) when relevant. "
        "If asked something the data can't answer (e.g. the real-world root cause behind a "
        "delay), say so plainly rather than guessing. Keep replies conversational and "
        "reasonably short unless the operator asks for depth.\n\n"
        + "\n".join(lines)
    )

    reply = ai_client.chat(messages=messages, system=system, max_tokens=1024)
    return jsonify({"reply": reply})
