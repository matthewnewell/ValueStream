"""
Demo map seed — "Design, Procure, Build, Ship" for a hardware part, matching BurnedValue's
demo-project convention (an app should never open to an empty screen).

Deliberately includes a branch/join (Design forks into two parallel procurement paths that
join at Build), not just a linear chain, so the CPM engine's join/multi-source logic is
exercised against real data from day one — and because it also happens to be a very common,
realistic VSM shape: a long-lead custom part and stocked standard hardware procured in
parallel, with the long-lead item usually turning out to be the real bottleneck.
"""

from db import db
from models import Edge, Map, Step

HOUR = 3600
DAY = 86400


def seed_if_empty():
    if Map.query.count() > 0:
        return

    m = Map(
        name="Demo: Bracket Assembly — Design to Ship",
        description=(
            "Example value stream for a custom hardware bracket: engineering design, "
            "parallel procurement of a long-lead custom casting and standard fasteners, "
            "assembly/machining, and shipment."
        ),
        # Matches the demo project the sibling apps (Conway's Depot, Launchpad) also carry —
        # same project, each app's own copy of the label, tied together by convention.
        portfolio="Industrial Programs",
        project="Demo: Bracket Assembly Program",
    )
    db.session.add(m)
    db.session.flush()

    design = Step(
        map_id=m.id, name="Design",
        description="Engineering finalizes the bracket drawing and BOM.",
        pos_x=40, pos_y=220,
        human_time_sec=16 * HOUR, machine_time_sec=0, operators=1, machines=0,
    )
    procure_long = Step(
        map_id=m.id, name="Procure — Long-Lead Casting",
        description="Sole-source custom aluminum casting from an external foundry.",
        pos_x=380, pos_y=60,
        human_time_sec=2 * HOUR, machine_time_sec=0, operators=1, machines=0,
    )
    procure_std = Step(
        map_id=m.id, name="Procure — Standard Hardware",
        description="Off-the-shelf fasteners and bushings from a stocked distributor.",
        pos_x=380, pos_y=380,
        human_time_sec=1 * HOUR, machine_time_sec=0, operators=1, machines=0,
    )
    build = Step(
        map_id=m.id, name="Build",
        description="Assemble the casting and hardware; CNC finish-machine mounting holes.",
        pos_x=720, pos_y=220,
        human_time_sec=8 * HOUR, machine_time_sec=4 * HOUR, operators=2, machines=1,
    )
    ship = Step(
        map_id=m.id, name="Ship",
        description="Final inspection, pack, generate shipping docs, hand off to carrier.",
        pos_x=1040, pos_y=220,
        human_time_sec=2 * HOUR, machine_time_sec=0, operators=1, machines=0,
    )
    db.session.add_all([design, procure_long, procure_std, build, ship])
    db.session.flush()

    db.session.add_all([
        Edge(map_id=m.id, source_step_id=design.id, target_step_id=procure_long.id,
             wait_time_sec=1 * DAY, label="PO approval"),
        Edge(map_id=m.id, source_step_id=design.id, target_step_id=procure_std.id,
             wait_time_sec=0.5 * DAY, label="PO approval"),
        Edge(map_id=m.id, source_step_id=procure_long.id, target_step_id=build.id,
             wait_time_sec=21 * DAY, label="foundry lead time"),
        Edge(map_id=m.id, source_step_id=procure_std.id, target_step_id=build.id,
             wait_time_sec=3 * DAY, label="distributor shipping"),
        Edge(map_id=m.id, source_step_id=build.id, target_step_id=ship.id,
             wait_time_sec=1 * DAY, label="QA hold"),
    ])
    db.session.commit()


# ── Map library: ISO/IEC/IEEE 15288 starter templates ──────────────────────────────────────
#
# Three top-level maps aligned to the standard's process families the user wants to model:
# Agreement (6.1), Technical Management (6.3), and Technical (6.4) — Organizational
# Project-Enabling (6.2) deliberately left out. All processing/wait times are left at 0: these
# are structural scaffolds to clone and fill in per project, not fabricated example data (that
# would misrepresent what real durations look like, the same reason the demo map above uses
# durations, but a *template* shouldn't pretend to know your project's numbers in advance).
#
# Technical Processes is the one family that's genuinely linear in the standard's own clause
# order, so it's seeded as a straight chain. Technical Management Processes runs continuously
# across the whole project rather than in any sequence — chaining it would misrepresent it, so
# it's seeded as parallel branches between a start and closeout anchor instead. Agreement is
# really two concurrent buyer/supplier roles, not a sequence either; it's seeded as a simple
# two-step pairing as a starting scaffold, with that simplification called out in its own
# description.

_15288_AGREEMENT = "Agreement Processes"
_15288_TECH_MGMT = "Technical Management Processes"
_15288_TECHNICAL = "Technical Processes"


def _seed_agreement_template():
    m = Map(
        name="Template: Agreement Processes (ISO/IEC/IEEE 15288)",
        description=(
            "Starter value stream for Agreement Processes (Clause 6.1) — Acquisition and "
            "Supply. These are typically concurrent buyer/supplier roles rather than a strict "
            "sequence; treat this as a simplified starting scaffold. Clone it, then adjust the "
            "shape and fill in real durations for your agreement."
        ),
        is_template=True,
        template_category=_15288_AGREEMENT,
    )
    db.session.add(m)
    db.session.flush()

    acquisition = Step(
        map_id=m.id, name="Acquisition Process (Clause 6.1.1)",
        description="Obtain a product or service from a supplier per an agreement.",
        pos_x=40, pos_y=200,
    )
    supply = Step(
        map_id=m.id, name="Supply Process (Clause 6.1.2)",
        description="Provide a product or service to an acquirer per an agreement.",
        pos_x=380, pos_y=200,
    )
    db.session.add_all([acquisition, supply])
    db.session.flush()

    db.session.add(Edge(
        map_id=m.id, source_step_id=acquisition.id, target_step_id=supply.id,
        wait_time_sec=0, label="agreement executed",
    ))


def _seed_technical_management_template():
    m = Map(
        name="Template: Technical Management Processes (ISO/IEC/IEEE 15288)",
        description=(
            "Starter value stream for Technical Management Processes (Clause 6.3) — Project "
            "Planning through Quality Assurance. These run continuously across the life of "
            "the project rather than in sequence, so they're modeled as parallel branches "
            "between kickoff and closeout instead of a false chain. Clone it, then adjust to "
            "fit how your project actually runs them."
        ),
        is_template=True,
        template_category=_15288_TECH_MGMT,
    )
    db.session.add(m)
    db.session.flush()

    start = Step(
        map_id=m.id, name="Project Start",
        description="Anchor step — kickoff of the technical management effort.",
        pos_x=40, pos_y=400,
    )
    closeout = Step(
        map_id=m.id, name="Project Closeout",
        description="Anchor step — technical management effort wraps up with the project.",
        pos_x=760, pos_y=400,
    )
    db.session.add_all([start, closeout])
    db.session.flush()

    process_defs = [
        ("Project Planning Process (Clause 6.3.1)",
         "Produce and maintain the plans that coordinate the technical effort."),
        ("Project Assessment and Control Process (Clause 6.3.2)",
         "Track progress against the plan and act on deviations."),
        ("Decision Management Process (Clause 6.3.3)",
         "Make and record key technical decisions using a consistent, defensible process."),
        ("Risk Management Process (Clause 6.3.4)",
         "Identify, analyze, and treat risks (and opportunities) across the project."),
        ("Configuration Management Process (Clause 6.3.5)",
         "Establish and maintain the integrity of the system's configuration items."),
        ("Information Management Process (Clause 6.3.6)",
         "Manage the project's information so the right people have the right data."),
        ("Measurement Process (Clause 6.3.7)",
         "Collect and analyze data to support effective management decisions."),
        ("Quality Assurance Process (Clause 6.3.8)",
         "Provide confidence that products and processes meet requirements and plans."),
    ]
    ys = [20, 130, 240, 350, 460, 570, 680, 790]
    steps = []
    for (name, blurb), y in zip(process_defs, ys):
        s = Step(map_id=m.id, name=name, description=blurb, pos_x=400, pos_y=y)
        db.session.add(s)
        steps.append(s)
    db.session.flush()

    for s in steps:
        db.session.add(Edge(
            map_id=m.id, source_step_id=start.id, target_step_id=s.id,
            wait_time_sec=0, label="concurrent, project-length",
        ))
        db.session.add(Edge(
            map_id=m.id, source_step_id=s.id, target_step_id=closeout.id, wait_time_sec=0,
        ))


def _seed_technical_processes_template():
    m = Map(
        name="Template: Technical Processes (ISO/IEC/IEEE 15288)",
        description=(
            "Starter value stream for Technical Processes (Clause 6.4) — Business/Mission "
            "Analysis through Disposal, in clause order. This family is the most naturally "
            "linear of the three — a reasonable default chain to clone and customize."
        ),
        is_template=True,
        template_category=_15288_TECHNICAL,
    )
    db.session.add(m)
    db.session.flush()

    step_defs = [
        ("Business or Mission Analysis Process (Clause 6.4.1)",
         "Define the problem space and business/mission need this system must address."),
        ("Stakeholder Needs & Requirements Definition Process (Clause 6.4.2)",
         "Capture what stakeholders need the system to do, in their language."),
        ("System Requirements Definition Process (Clause 6.4.3)",
         "Translate stakeholder needs into verifiable system-level requirements."),
        ("Architecture Definition Process (Clause 6.4.4)",
         "Establish the system's structure — subsystems, interfaces, and how they fit together."),
        ("Design Definition Process (Clause 6.4.5)",
         "Develop the detailed design sufficient to build each system element."),
        ("System Analysis Process (Clause 6.4.6)",
         "Run trade studies and analyses to inform requirements, architecture, and design decisions."),
        ("Implementation Process (Clause 6.4.7)",
         "Fabricate, code, or otherwise realize a system element per its design."),
        ("Integration Process (Clause 6.4.8)",
         "Assemble system elements into the aggregates that make up the system."),
        ("Verification Process (Clause 6.4.9)",
         "Confirm the system was built right — it meets its specified requirements."),
        ("Transition Process (Clause 6.4.10)",
         "Move the verified system into its operational environment."),
        ("Validation Process (Clause 6.4.11)",
         "Confirm the system does the right job — it meets the stakeholder need."),
        ("Operation Process (Clause 6.4.12)",
         "Use the system to deliver its intended services in the operational environment."),
        ("Maintenance Process (Clause 6.4.13)",
         "Sustain the system's capability over its operational life."),
        ("Disposal Process (Clause 6.4.14)",
         "Retire the system and dispose of it at end of life."),
    ]
    steps = []
    for i, (name, blurb) in enumerate(step_defs):
        s = Step(map_id=m.id, name=name, description=blurb, pos_x=40 + i * 300, pos_y=200)
        db.session.add(s)
        steps.append(s)
    db.session.flush()

    for a, b in zip(steps, steps[1:]):
        db.session.add(Edge(map_id=m.id, source_step_id=a.id, target_step_id=b.id, wait_time_sec=0))


def seed_templates_if_missing():
    """Additive and idempotent, unlike seed_if_empty above: runs every startup, checking each
    template by name so re-running never duplicates one, and adding any that are new (e.g.
    after an upgrade) without touching a DB that already has real project maps in it."""
    existing = {name for (name,) in db.session.query(Map.name).filter(Map.is_template.is_(True)).all()}
    builders = {
        "Template: Agreement Processes (ISO/IEC/IEEE 15288)": _seed_agreement_template,
        "Template: Technical Management Processes (ISO/IEC/IEEE 15288)": _seed_technical_management_template,
        "Template: Technical Processes (ISO/IEC/IEEE 15288)": _seed_technical_processes_template,
    }
    for name, builder in builders.items():
        if name in existing:
            continue
        builder()
    db.session.commit()
