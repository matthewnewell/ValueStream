from flask import Blueprint, jsonify

import ai_client
from engine import compute_metrics
from models import Map, Step

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


@bp.post("/maps/<map_id>/ai-insights")
def ai_insights(map_id):
    m = Map.query.get_or_404(map_id)

    if not ai_client.is_configured():
        return jsonify({"error": ai_client.NOT_CONFIGURED_MESSAGE}), 503

    metrics = compute_metrics(
        [s.to_dict() for s in m.steps],
        [e.to_dict() for e in m.edges],
    )
    steps_by_id = {s.id: s for s in m.steps}

    lines = [
        f'Value stream map: "{m.name}"',
        f"Total lead time: {metrics['lead_time_sec']:.0f}s, "
        f"total processing time: {metrics['total_processing_time_sec']:.0f}s, "
        f"process cycle efficiency: {metrics['process_cycle_efficiency_pct']:.1f}%",
    ]
    if metrics["bottleneck"]:
        b = metrics["bottleneck"]
        lines.append(
            f"Highest single-step processing time (throughput bottleneck): "
            f"\"{b['name']}\" at {b['processing_time_sec']:.0f}s "
            f"({'on' if b['on_critical_path'] else 'NOT on'} the critical path)."
        )
    if metrics["top_wait_contributors"]:
        lines.append("Largest wait/queue contributors:")
        for w in metrics["top_wait_contributors"]:
            lines.append(
                f"  - {w['source_step_name']} → {w['target_step_name']}: "
                f"{w['wait_time_sec']:.0f}s wait"
            )
    if metrics["disconnected_step_ids"]:
        names = [steps_by_id[sid].name for sid in metrics["disconnected_step_ids"] if sid in steps_by_id]
        lines.append(f"Steps not connected to the main flow: {', '.join(names)}")
    if metrics["cycles_detected"]:
        lines.append(f"{len(metrics['cycles_detected'])} rework loop(s)/cycle(s) detected.")

    lines.append("\nSteps:")
    for s in m.steps:
        lines.append(
            f"  - {s.name}: human={s.human_time_sec:.0f}s, machine={s.machine_time_sec:.0f}s"
            + (f" — {s.description}" if s.description else "")
        )

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
