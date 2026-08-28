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
    # operator asking "why" actually wants named.
    db = metrics.get("deepest_bottleneck")
    if db:
        crumb = (
            " (inside " + " › ".join(h["step_name"] for h in db["breadcrumb"][:-1]) + ")"
            if len(db["breadcrumb"]) > 1
            else ""
        )
        lines.append(
            f'Bottleneck (highest single-step processing time): "{db["name"]}"{crumb} at '
            f"{db['processing_time_sec']:.0f}s "
            f"({'on' if db['on_critical_path'] else 'NOT on'} the critical path)."
        )

    if metrics["wait_contributors"]:
        lines.append("Largest wait/queue contributors:")
        # engine.py returns every wait-bearing connector, sorted worst-first, with no cutoff
        # (that's a display decision, not a data one) — trim here specifically because this
        # list is going into an LLM prompt, where an unbounded map could bloat token usage.
        for w in metrics["wait_contributors"][:5]:
            lines.append(
                f"  - {w['source_step_name']} → {w['target_step_name']}: "
                f"{w['wait_time_sec']:.0f}s wait"
                + (f" ({w['label']})" if w.get("label") else "")
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
        "You are a Lean/Six Sigma value-stream-mapping analyst. Given the computed metrics and "
        "step list for a value stream map, write a concise executive analysis (3-6 short "
        "paragraphs or bullet points): identify the bottleneck and explain its impact, call out "
        "the biggest sources of wasted (wait) time, and give 2-3 concrete, specific "
        "improvement suggestions. Be direct and practical, not generic."
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
        "You are a Lean/Six Sigma value-stream-mapping analyst having an ongoing conversation "
        "with the operator who owns the value stream map described below. Answer questions "
        "about it, explain what's driving lead time, discuss constraints, and give concrete, "
        "specific recommendations grounded in the actual numbers below — never generic advice "
        "unconnected to this map. If asked something the data can't answer (e.g. the real-world "
        "root cause behind a delay), say so plainly rather than guessing. Keep replies "
        "conversational and reasonably short unless the operator asks for depth.\n\n"
        + "\n".join(lines)
    )

    reply = ai_client.chat(messages=messages, system=system, max_tokens=1024)
    return jsonify({"reply": reply})
