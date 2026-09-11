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
from models import Edge, Map, Step, _now

HOUR = 3600
DAY = 86400


def seed_if_empty():
    if Map.query.count() > 0:
        return
    _build_sample_map()
    db.session.commit()


def _delete_map_tree(m: Map):
    """Delete a map and every sub-process map its steps own, recursively. Each delete cascades
    to that map's own steps + edges."""
    for step in list(m.steps):
        if step.child_map_id:
            child = Map.query.get(step.child_map_id)
            if child is not None:
                _delete_map_tree(child)
    # cloned_from_map_id / published_from_map_id are ON DELETE SET NULL in the model, but the
    # ALTER TABLE that added them can't express that in SQLite — clear inbound refs by hand so
    # a template that's been cloned is still deletable (e.g. retiring the old scaffolds below).
    Map.query.filter_by(cloned_from_map_id=m.id).update(
        {"cloned_from_map_id": None}, synchronize_session=False
    )
    Map.query.filter_by(published_from_map_id=m.id).update(
        {"published_from_map_id": None}, synchronize_session=False
    )
    db.session.delete(m)


def reset_sample_map() -> Map:
    """Restore the Sample Map to its seeded state — the "↺ Reset" action on the sample. Wipes
    the current sample (and any sub-process maps someone expanded off it) and rebuilds it, so
    the sample is a sandbox nobody can permanently break. Caller gets the fresh map."""
    for existing in Map.query.filter_by(lifecycle="sample").all():
        _delete_map_tree(existing)
    db.session.flush()
    m = _build_sample_map()
    db.session.commit()
    return m


def _build_sample_map() -> Map:
    """The seeded 'Bracket Assembly' value stream — a custom hardware bracket from design to
    ship, with a branch/join (parallel procurement of a long-lead casting and stocked hardware)
    so the CPM join logic is exercised from day one. This is the Sample Map: an editable
    sandbox reachable from the nav, not tied to a project. Caller commits."""
    m = Map(
        name="Bracket Assembly",
        description=(
            "Example value stream for a custom hardware bracket: engineering design, "
            "parallel procurement of a long-lead custom casting and standard fasteners, "
            "assembly/machining, and shipment."
        ),
        lifecycle="sample",
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
        owning_team="Design Engineering",
        pos_x=40, pos_y=220,
        human_time_sec=16 * HOUR, machine_time_sec=0, operators=1, machines=0,
        pct_complete_accurate=80,
    )
    procure_long = Step(
        map_id=m.id, name="Procure — Long-Lead Casting",
        description="Sole-source custom aluminum casting from an external foundry.",
        owning_team="Subcontracts",
        pos_x=380, pos_y=60,
        human_time_sec=2 * HOUR, machine_time_sec=0, operators=1, machines=0,
        pct_complete_accurate=96,
    )
    procure_std = Step(
        map_id=m.id, name="Procure — Standard Hardware",
        description="Off-the-shelf fasteners and bushings from a stocked distributor.",
        owning_team="Procurement",
        pos_x=380, pos_y=380,
        human_time_sec=1 * HOUR, machine_time_sec=0, operators=1, machines=0,
        pct_complete_accurate=98,
    )
    build = Step(
        map_id=m.id, name="Build",
        description="Assemble the casting and hardware; CNC finish-machine mounting holes.",
        owning_team="Manufacturing",
        pos_x=720, pos_y=220,
        human_time_sec=8 * HOUR, machine_time_sec=4 * HOUR, operators=2, machines=1,
        pct_complete_accurate=92,
    )
    ship = Step(
        map_id=m.id, name="Ship",
        description="Final inspection, pack, generate shipping docs, hand off to carrier.",
        owning_team="Shipping & Receiving",
        pos_x=1040, pos_y=220,
        human_time_sec=2 * HOUR, machine_time_sec=0, operators=1, machines=0,
        pct_complete_accurate=99,
    )
    db.session.add_all([design, procure_long, procure_std, build, ship])
    db.session.flush()

    db.session.add_all([
        Edge(map_id=m.id, source_step_id=design.id, target_step_id=procure_long.id,
             wait_time_sec=1 * DAY, label="PO approval", wait_kind="internal"),
        Edge(map_id=m.id, source_step_id=design.id, target_step_id=procure_std.id,
             wait_time_sec=0.5 * DAY, label="PO approval", wait_kind="internal"),
        Edge(map_id=m.id, source_step_id=procure_long.id, target_step_id=build.id,
             wait_time_sec=21 * DAY, label="foundry lead time", wait_kind="external"),
        Edge(map_id=m.id, source_step_id=procure_std.id, target_step_id=build.id,
             wait_time_sec=3 * DAY, label="distributor shipping", wait_kind="external"),
        Edge(map_id=m.id, source_step_id=build.id, target_step_id=ship.id,
             wait_time_sec=1 * DAY, label="QA hold", wait_kind="internal"),
        # A design defect that clears every check until final assembly forces a re-buy of the
        # long-lead casting — the worst kind of rework, looping back through the 3-week foundry.
        Edge(map_id=m.id, source_step_id=build.id, target_step_id=procure_long.id,
             kind="rework", rework_rate=12),
    ])
    return m


# ── Map library: the ISO/IEC/IEEE 15288 program value-stream template ──────────────────────
#
# One top-level template: a hardware program's value stream, using 15288:2015 process names
# (Clause 6.1-6.4) arranged the way the program actually flows rather than as four parallel
# process groups. It supersedes the three earlier single-family scaffolds (Agreement /
# Technical Management / Technical), which seed_templates_if_missing() now retires from any
# older DB that still has them.
#
# Design choices, all called out in the map's own description:
#   - Procurement is the program acting as *acquirer*, so both procurement tracks are the
#     Acquisition process (6.1.1); the single Supply process (6.1.2) box at the front is the
#     company supplying its customer. "Prepare / Solicit / Establish agreement / Monitor /
#     Accept" are Acquisition-process *activities*, not separate processes.
#   - Long-lead procurement branches off Architecture Definition and is committed before the
#     design is complete; standard procurement is gated on the post-CDR drawing & BOM release.
#     A kind="rework" connector from Design Definition back to the long-lead award models the
#     design maturing after the commitment and forcing a re-buy.
#   - Continuous processes are not drawn: all of Organizational Project-Enabling (6.2) and
#     6.3.2-6.3.8 of Technical Management are level-of-effort with no unit flowing through
#     them. Project Planning (6.3.1) is kept because it gates work start. Their touchpoints
#     show up as wait labels (acceptance review, incoming inspection queue).
#   - Wait times are representative weeks so the "procurement dominates lead time" story is
#     visible on clone; processing time is on Design Definition only (the phase that must
#     "mature" for the rework loop to mean anything) and 0 elsewhere for the PM to fill in.
#   - Every non-spine branch can be deleted whole without disconnecting the flow (the spine
#     keeps direct Architecture->Design and Design->Implementation edges).

# ── Value-stream category taxonomy ──────────────────────────────────────────────────────────
#
# How a featured template is classified in the library (Map.template_category) — a tag to help
# someone find the altitude that fits their pain point, not a hierarchy to descend through to
# reach a template. A project cloning for one specific problem (manufacturing, say) reaches for
# a narrow template directly rather than cloning the whole program and drilling down to find it,
# so Whole Program templates and narrow single-purpose ones are peers in the library, not parent
# and child. The three narrow categories classify by the kind of "unit" moving through the
# stream; Whole Program is the escape hatch for a full-lifecycle flow that drills into whatever
# phase matters instead of committing to one.
CATEGORY_WHOLE_PROGRAM = "Whole Program"
CATEGORY_ENTERPRISE_SUPPORT = "Enterprise Support"
CATEGORY_DEVELOPMENT = "Development"
CATEGORY_FULFILLMENT = "Fulfillment & Operational"

_15288_PROGRAM = CATEGORY_WHOLE_PROGRAM
_PROGRAM_TEMPLATE_NAME = "Template: Program Value Stream (ISO/IEC/IEEE 15288)"

_RETIRED_TEMPLATE_NAMES = (
    "Template: Agreement Processes (ISO/IEC/IEEE 15288)",
    "Template: Technical Management Processes (ISO/IEC/IEEE 15288)",
    "Template: Technical Processes (ISO/IEC/IEEE 15288)",
)

_PROGRAM_TEMPLATE_DESCRIPTION = (
    "A hardware program's value stream, in ISO/IEC/IEEE 15288:2015 process names "
    "(Clause 6.1-6.4), arranged as the program actually flows. Clone it and adjust.\n\n"
    "Procurement is detailed because its wait usually dominates lead time. When the program "
    "buys parts it is the acquirer, so both procurement tracks are the Acquisition process "
    "(6.1.1); the Supply process (6.1.2) box at the front is the company supplying its "
    "customer. The Prepare / Solicit / Establish agreement / Monitor / Accept boxes are "
    "Acquisition-process activities. Long-lead items branch off Architecture Definition and "
    "are committed before design is complete; standard build-to-print procurement is gated on "
    "the post-CDR drawing & BOM release. The rework connector from Design Definition back to "
    "the long-lead award is the design maturing after the commitment and forcing a re-buy.\n\n"
    "Not drawn: Organizational Project-Enabling (6.2) and Technical Management 6.3.2-6.3.8 are "
    "continuous level-of-effort work with no unit flowing through them; their touchpoints show "
    "up here as wait labels. Project Planning (6.3.1) is kept because it gates work start.\n\n"
    "Wait times are representative weeks; processing time is pre-filled only on detailed "
    "design and the procurement activities. Milestone names on connectors (SRR, PDR, CDR) are "
    "convention, not 15288. Every branch can be deleted whole without disconnecting the flow."
)

WEEK = 7 * DAY


def _seed_program_value_stream_template():
    m = Map(
        name=_PROGRAM_TEMPLATE_NAME,
        description=_PROGRAM_TEMPLATE_DESCRIPTION,
        lifecycle="featured",
        is_template=True,
        template_category=_15288_PROGRAM,
    )
    db.session.add(m)
    db.session.flush()

    def S(name, team, x, y, desc):
        s = Step(map_id=m.id, name=name, owning_team=team, description=desc, pos_x=x, pos_y=y)
        db.session.add(s)
        return s

    spine_y = 380
    dx = 300

    # ── Spine: the value-adding flow, left to right ────────────────────────────────────────
    supply = S(
        "Supply process (Clause 6.1.2)", "Business Development / Contracts",
        40, spine_y,
        "Prepare the proposal, negotiate, and execute the agreement to supply the customer - "
        "the company as supplier to its acquirer.",
    )
    planning = S(
        "Project Planning process (Clause 6.3.1)", "Program Management Office",
        40 + dx, spine_y,
        "Stand up the program: WBS, IMS, budgets, staffing plan, SEMP. The one continuous "
        "(6.3) process kept on the map because it gates work start.",
    )
    bma = S(
        "Business or Mission Analysis process (Clause 6.4.1)", "Systems Engineering",
        40 + 2 * dx, spine_y,
        "Define the problem space and the business/mission need the system must address.",
    )
    stkh = S(
        "Stakeholder Needs and Requirements Definition process (Clause 6.4.2)",
        "Systems Engineering", 40 + 3 * dx, spine_y,
        "Capture what stakeholders need the system to do, in their terms.",
    )
    sysreq = S(
        "System Requirements Definition process (Clause 6.4.3)", "Systems Engineering",
        40 + 4 * dx, spine_y,
        "Translate stakeholder needs into verifiable system requirements.",
    )
    arch = S(
        "Architecture Definition process (Clause 6.4.4)", "Systems Engineering / Chief Engineer",
        40 + 5 * dx, spine_y,
        "Establish the system architecture - elements, interfaces, allocations. The "
        "preliminary BOM and long-lead item list come out of here.",
    )
    design = S(
        "Design Definition process (Clause 6.4.5)", "Mechanical / Design Engineering",
        40 + 6 * dx, spine_y,
        "Detailed design of each system element; release the drawing & BOM package at CDR. "
        "This is the design-maturity gate for standard procurement.",
    )
    impl = S(
        "Implementation process (Clause 6.4.7)", "Manufacturing",
        40 + 7 * dx, spine_y,
        "Fabricate and build the make items per the released design.",
    )
    integ = S(
        "Integration process (Clause 6.4.8)", "Assembly & Integration",
        40 + 8 * dx, spine_y,
        "Assemble system elements - make items plus procured parts - into the system.",
    )
    verif = S(
        "Verification process (Clause 6.4.9)", "Test & Evaluation",
        40 + 9 * dx, spine_y,
        "Confirm the system meets its specified requirements.",
    )
    trans = S(
        "Transition process (Clause 6.4.10)", "Program Management / Field Operations",
        40 + 10 * dx, spine_y,
        "Deliver and install the verified system in its operational environment.",
    )
    valid = S(
        "Validation process (Clause 6.4.11)", "Systems Engineering / Customer",
        40 + 11 * dx, spine_y,
        "Confirm the system meets the stakeholder need in operation.",
    )
    oper = S(
        "Operation process (Clause 6.4.12)", "Customer / Sustainment",
        40 + 12 * dx, spine_y,
        "Use the system to deliver its services. Usually outside the build program - prune "
        "if out of scope.",
    )
    maint = S(
        "Maintenance process (Clause 6.4.13)", "Sustainment",
        40 + 13 * dx, spine_y,
        "Sustain system capability over its operational life. Prune if out of scope.",
    )
    disp = S(
        "Disposal process (Clause 6.4.14)", "Sustainment / EH&S",
        40 + 14 * dx, spine_y,
        "Retire and dispose of the system at end of life. Prune if out of scope.",
    )

    # ── Parallel analysis branch (prunable) ───────────────────────────────────────────────
    sysan = S(
        "System Analysis process (Clause 6.4.6)", "Engineering Analysis",
        40 + 5 * dx + dx // 2, spine_y - 230,
        "Trade studies and performance/stress/thermal analysis feeding architecture and "
        "design decisions. Prune if analysis is folded into Design Definition.",
    )

    # ── Long-lead procurement path (committed before design is complete) ───────────────────
    ll_y = spine_y - 210
    ll_prep = S(
        "Acquisition process - Prepare (Clause 6.1.1)", "Supply Chain / Procurement Engineering",
        40 + 6 * dx, ll_y,
        "Make/buy decisions, long-lead item list, and source strategy for the long-lead "
        "items - the Acquisition-process 'prepare for the acquisition' activity.",
    )
    ll_award = S(
        "Acquisition process - Select supplier & establish agreement, long-lead (Clause 6.1.1)",
        "Subcontracts", 40 + 7 * dx, ll_y,
        "Source-select and place the long-lead order ahead of CDR under an advance "
        "procurement authorization - committed before the design is complete.",
    )
    ll_accept = S(
        "Acquisition process - Monitor & accept, long-lead (Clause 6.1.1)", "Supplier Quality",
        40 + 9 * dx, ll_y,
        "Expedite and monitor the supplier through the lead time, then source / receiving "
        "inspection on delivery.",
    )

    # ── Standard build-to-print procurement path (gated on drawing release) ────────────────
    std_y = spine_y + 210
    std_solicit = S(
        "Acquisition process - Solicit & select supplier, build-to-print (Clause 6.1.1)",
        "Procurement", 40 + 7 * dx, std_y,
        "RFQ the released drawings/BOM, evaluate, and select suppliers for the build-to-print "
        "parts. Gated on the post-CDR drawing & BOM release.",
    )
    std_award = S(
        "Acquisition process - Establish agreement, PO / subcontract (Clause 6.1.1)",
        "Subcontracts", 40 + 8 * dx, std_y,
        "Place purchase orders / subcontracts against the selected suppliers.",
    )
    std_monitor = S(
        "Acquisition process - Monitor the agreement (Clause 6.1.1)",
        "Procurement / Program Management", 40 + 9 * dx, std_y,
        "Track supplier progress and expedite through the manufacturing lead time.",
    )
    std_accept = S(
        "Acquisition process - Accept, receiving inspection (Clause 6.1.1)", "Receiving Inspection",
        40 + 10 * dx, std_y,
        "Receiving inspection and acceptance of the delivered parts.",
    )

    # Representative processing time on the phases this template is built to illustrate:
    # detailed design, and the procurement (Acquisition) activities that carry real buyer /
    # subcontracts labour spread across the calendar lead time. The pure-SE and manufacturing
    # spine steps are left at 0 for the PM to fill in per program.
    design.human_time_sec = 12 * WEEK
    ll_prep.human_time_sec = 2 * WEEK
    ll_award.human_time_sec = 3 * WEEK
    ll_accept.human_time_sec = 2 * WEEK
    std_solicit.human_time_sec = 2 * WEEK
    std_award.human_time_sec = 1 * WEEK
    std_monitor.human_time_sec = 1 * WEEK
    std_accept.human_time_sec = 1 * WEEK

    db.session.flush()

    def E(a, b, wait_sec=0, label=None, wait_kind=None, kind="flow", rework_rate=None):
        db.session.add(Edge(
            map_id=m.id, source_step_id=a.id, target_step_id=b.id,
            wait_time_sec=wait_sec, label=label, wait_kind=wait_kind,
            kind=kind, rework_rate=rework_rate,
        ))

    # Spine
    E(supply, planning, 1 * WEEK, "contract award", "internal")
    E(planning, bma, 2 * WEEK, "IMS baseline / authorization to proceed", "internal")
    E(bma, stkh, 0)
    E(stkh, sysreq, 1 * WEEK, "SRR", "internal")
    E(sysreq, arch, 1 * WEEK, "SFR", "internal")
    E(arch, design, 2 * WEEK, "PDR", "internal")
    E(design, impl, 3 * WEEK, "CDR + released drawing & BOM package", "internal")
    E(impl, integ, 1 * WEEK, "make parts to assembly", "internal")
    E(integ, verif, 1 * WEEK, "integration complete", "internal")
    E(verif, trans, 2 * WEEK, "acceptance review", "internal")
    E(trans, valid, 2 * WEEK, "site installation", "external")
    E(valid, oper, 4 * WEEK, "operational acceptance", "external")
    E(oper, maint, 0)
    E(maint, disp, 0)

    # Analysis branch - arch->design direct edge above keeps the spine intact when pruned
    E(arch, sysan, 0)
    E(sysan, design, 1 * WEEK, "analysis cycle", "internal")

    # Long-lead procurement
    E(arch, ll_prep, 1 * WEEK, "long-lead item list", "internal")
    E(ll_prep, ll_award, 2 * WEEK, "advance procurement authorization", "internal")
    E(ll_award, ll_accept, 36 * WEEK, "long-lead manufacturing lead time", "external")
    E(ll_accept, integ, 1 * WEEK, "source + receiving inspection", "internal")
    # Design matures after the long-lead commitment -> spec change forces a re-buy.
    E(design, ll_award, kind="rework", rework_rate=15)

    # Standard procurement
    E(design, std_solicit, 2 * WEEK, "drawing & BOM release (post-CDR)", "internal")
    E(std_solicit, std_award, 3 * WEEK, "RFQ / quote turnaround", "external")
    E(std_award, std_monitor, 1 * WEEK, "PO approval routing", "internal")
    E(std_monitor, std_accept, 12 * WEEK, "supplier manufacturing + delivery lead time", "external")
    E(std_accept, impl, 1 * WEEK, "incoming inspection queue", "internal")


# ── Second featured template: a manufacturing routing canvas ───────────────────────────────
#
# Narrower and operational rather than a whole-program spine: one box rolls up the engineering
# work that has to close before production can start, one box is the routing itself. Both are
# nested (Step.child_map_id) — "Design & Engineering" expands into Requirements -> Design ->
# Configuration Baseline, "Implementation" expands into the routing — so the top-level canvas
# stays uncluttered by req/design/CM detail nobody on the shop floor needs to touch, and
# production support's own canvas (the routing) isn't sharing space with anything else.
#
# All durations are 0: unlike the program template, this one isn't telling an illustrative
# story — it's the literal tool production support fills in with their actual routing and
# actual times, so fabricated example numbers would just be noise to clear out first.

_15288_MFG = CATEGORY_DEVELOPMENT
_MFG_ROUTING_TEMPLATE_NAME = "Template: Manufacturing Routing (ISO/IEC/IEEE 15288)"

_MFG_ROUTING_DESCRIPTION = (
    "A manufacturing routing value stream anchored to ISO/IEC/IEEE 15288:2015. \"Design & "
    "Engineering\" rolls up System Requirements Definition (6.4.3), Design Definition (6.4.5), "
    "and the Configuration Baseline that releases the design to production (a milestone from "
    "the Configuration Management process, 6.3.5, not a process in its own right) — expand it "
    "to see each step.\n\n"
    "\"Implementation process (Clause 6.4.7)\" is the routing: expand it and edit the "
    "operations to match your actual routing, recording each one's processing time and the "
    "wait to the next. The eight seeded here are generic placeholders, not 15288 clause items "
    "— reorder, rename, add, or delete them freely."
)


def _seed_manufacturing_routing_template():
    m = Map(
        name=_MFG_ROUTING_TEMPLATE_NAME,
        description=_MFG_ROUTING_DESCRIPTION,
        lifecycle="featured",
        is_template=True,
        template_category=_15288_MFG,
    )
    db.session.add(m)
    db.session.flush()

    design_eng = Step(
        map_id=m.id, name="Design & Engineering", owning_team="Engineering",
        description=(
            "Requirements through the configuration baseline that releases the design to "
            "production. Expand to see Requirements, Design, and Configuration Baseline."
        ),
        pos_x=40, pos_y=200,
    )
    make = Step(
        map_id=m.id, name="Implementation process (Clause 6.4.7) — Manufacturing",
        owning_team="Production Support",
        description=(
            "The manufacturing routing. Expand and edit the operations to match your actual "
            "routing, recording each one's processing time and the wait to the next."
        ),
        pos_x=420, pos_y=200,
    )
    db.session.add_all([design_eng, make])
    db.session.flush()

    db.session.add(Edge(
        map_id=m.id, source_step_id=design_eng.id, target_step_id=make.id,
        wait_time_sec=0, label="design released to production", wait_kind="internal",
    ))

    # ── "Design & Engineering" sub-process ──
    de_map = Map(
        name="Design & Engineering — sub-process",
        description=f'Sub-process for "Design & Engineering" in {m.name}.',
    )
    db.session.add(de_map)
    db.session.flush()
    design_eng.child_map_id = de_map.id

    req = Step(
        map_id=de_map.id, name="System Requirements Definition process (Clause 6.4.3)",
        owning_team="Systems Engineering",
        description="Translate stakeholder needs into verifiable system requirements.",
        pos_x=40, pos_y=200,
    )
    des = Step(
        map_id=de_map.id, name="Design Definition process (Clause 6.4.5)",
        owning_team="Design Engineering",
        description="Develop the detailed design sufficient to build each system element.",
        pos_x=340, pos_y=200,
    )
    cb = Step(
        map_id=de_map.id,
        name="Configuration Baseline — Product Baseline (Configuration Management process, Clause 6.3.5)",
        owning_team="Configuration Management",
        description=(
            "The design is formally baselined and released for production — a milestone from "
            "the Configuration Management process, not a process name in its own right."
        ),
        pos_x=640, pos_y=200,
    )
    db.session.add_all([req, des, cb])
    db.session.flush()
    db.session.add_all([
        Edge(map_id=de_map.id, source_step_id=req.id, target_step_id=des.id, wait_time_sec=0),
        Edge(map_id=de_map.id, source_step_id=des.id, target_step_id=cb.id, wait_time_sec=0),
    ])

    # ── "Implementation" / manufacturing routing sub-process ──
    routing_map = Map(
        name="Manufacturing Routing — sub-process",
        description=f'Sub-process for "{make.name}" in {m.name}.',
    )
    db.session.add(routing_map)
    db.session.flush()
    make.child_map_id = routing_map.id

    op_defs = [
        ("Material Issue / Kitting", "Material Handling",
         "Pull and kit the parts and materials called out on the routing."),
        ("Fabrication (Cut / Machine)", "Machine Shop",
         "Cut, mill, turn, or otherwise machine parts to print."),
        ("Joining (Weld / Braze / Bond)", "Weld Shop",
         "Join fabricated parts per the design's joining method."),
        ("In-Process Inspection", "Quality",
         "Verify the in-process build against the drawing before it moves on."),
        ("Finish (Paint / Coat / Plate)", "Paint & Finish",
         "Apply the specified surface finish or protective coating."),
        ("Assembly", "Assembly",
         "Assemble the finished parts and installed hardware into the end item."),
        ("Final Inspection & Test", "Quality",
         "Final acceptance inspection and functional test before release."),
        ("Pack & Stage to Stock", "Shipping & Receiving",
         "Pack, label, and stage the completed unit."),
    ]
    ops = []
    for i, (op_name, team, desc) in enumerate(op_defs):
        s = Step(
            map_id=routing_map.id, name=op_name, owning_team=team, description=desc,
            pos_x=40 + i * 260, pos_y=200,
        )
        db.session.add(s)
        ops.append(s)
    db.session.flush()
    for a, b in zip(ops, ops[1:]):
        db.session.add(
            Edge(map_id=routing_map.id, source_step_id=a.id, target_step_id=b.id, wait_time_sec=0)
        )


def _ensure_template(name: str, category: str, builder) -> None:
    """Create the named featured template if missing; if it already exists, backfill its
    category onto the taxonomy's current value (e.g. after a rename) without touching anything
    else about it — same drift-fixup spirit as ensure_sample_map below."""
    existing = Map.query.filter_by(name=name).first()
    if existing is None:
        builder()
    elif existing.template_category != category:
        existing.template_category = category


def seed_templates_if_missing():
    """Idempotent startup: ensure the featured templates exist, and retire the three
    superseded single-family scaffolds if an older DB still carries them. Keyed by name, so
    re-running never duplicates and never touches real project maps."""
    for name in _RETIRED_TEMPLATE_NAMES:
        stale = Map.query.filter_by(name=name).first()
        if stale is not None:
            _delete_map_tree(stale)
    _ensure_template(_PROGRAM_TEMPLATE_NAME, _15288_PROGRAM, _seed_program_value_stream_template)
    _ensure_template(_MFG_ROUTING_TEMPLATE_NAME, _15288_MFG, _seed_manufacturing_routing_template)
    db.session.commit()


def ensure_sample_map():
    """Idempotent startup fixup: there is exactly one Sample Map, tagged lifecycle='sample' and
    titled "Bracket Assembly". Covers a DB seeded before the sample concept (or the short name)
    existed, and rebuilds the sample if it's gone entirely (someone can edit it freely now, so
    "↺ Reset" and this are the two ways back to a known state)."""
    m = (
        Map.query.filter_by(lifecycle="sample").first()
        or Map.query.filter(Map.name.like("Demo: Bracket Assembly%")).first()
    )
    if m is None:
        _build_sample_map()
        db.session.commit()
        return
    changed = False
    if m.lifecycle != "sample":
        m.lifecycle = "sample"
        changed = True
    if m.name != "Bracket Assembly":
        m.name = "Bracket Assembly"
        changed = True
    if changed:
        db.session.commit()


# ── A published project snapshot + two clones, so the library isn't empty on first run ─────
#
# The "closeout -> library -> clone" story only reads if the library actually contains a
# finished project's map with real numbers, and something has cloned it. This seeds one:
# a closed-out cast-bracket program (same shape as the sample, different recorded actuals),
# plus two working maps cloned from it under other projects — so the library shows
# "Used by 2 projects" against it from the start.

_PUBLISHED_NAME = "Cast Bracket Program — Closed Out (FY24)"


def _seed_published_bracket_exemplar():
    published = Map(
        name=_PUBLISHED_NAME,
        description=(
            "Finished value stream from a closed-out custom cast-bracket build, published to "
            "the library as a starting point for similar programs. Numbers are the actuals "
            "recorded on the program, not a scaffold."
        ),
        lifecycle="published",
        template_category="Hardware Fabrication",
        portfolio="Industrial Programs",
        project="Meridian Antenna Bracket (FY24)",
        published_at=_now(),
    )
    db.session.add(published)
    db.session.flush()

    def build_flow(m: Map, *, design_h, cast_wait, build_h, build_m, qa_wait):
        design = Step(map_id=m.id, name="Design",
                      description="Engineering finalizes the bracket drawing and BOM.",
                      pos_x=40, pos_y=220, human_time_sec=design_h * HOUR)
        cast = Step(map_id=m.id, name="Procure — Cast Housing",
                    description="Sole-source custom aluminum casting from an external foundry.",
                    pos_x=380, pos_y=60, human_time_sec=2 * HOUR)
        std = Step(map_id=m.id, name="Procure — Standard Hardware",
                   description="Off-the-shelf fasteners and bushings from a stocked distributor.",
                   pos_x=380, pos_y=380, human_time_sec=1 * HOUR)
        build = Step(map_id=m.id, name="Build",
                     description="Assemble the casting and hardware; CNC finish-machine mounting holes.",
                     pos_x=720, pos_y=220, human_time_sec=build_h * HOUR,
                     machine_time_sec=build_m * HOUR, operators=2, machines=1)
        ship = Step(map_id=m.id, name="Ship",
                    description="Final inspection, pack, generate shipping docs, hand off to carrier.",
                    pos_x=1040, pos_y=220, human_time_sec=2 * HOUR)
        db.session.add_all([design, cast, std, build, ship])
        db.session.flush()
        db.session.add_all([
            Edge(map_id=m.id, source_step_id=design.id, target_step_id=cast.id,
                 wait_time_sec=1 * DAY, label="PO approval", wait_kind="internal"),
            Edge(map_id=m.id, source_step_id=design.id, target_step_id=std.id,
                 wait_time_sec=0.5 * DAY, label="PO approval", wait_kind="internal"),
            Edge(map_id=m.id, source_step_id=cast.id, target_step_id=build.id,
                 wait_time_sec=cast_wait * DAY, label="foundry lead time", wait_kind="external"),
            Edge(map_id=m.id, source_step_id=std.id, target_step_id=build.id,
                 wait_time_sec=3 * DAY, label="distributor shipping", wait_kind="external"),
            Edge(map_id=m.id, source_step_id=build.id, target_step_id=ship.id,
                 wait_time_sec=qa_wait * DAY, label="QA hold", wait_kind="internal"),
        ])

    build_flow(published, design_h=20, cast_wait=25, build_h=10, build_m=5, qa_wait=2)

    # Two working clones under other projects — the "cloned a finished map from a similar
    # project" path, and what makes the library's "Used by 2 projects" real.
    for proj in ("Coastal Radar Pedestal Bracket", "Rotor Test Fixture"):
        clone = Map(
            name="Cast Bracket Flow",
            description=f"Cloned from {_PUBLISHED_NAME} at kickoff, then adjusted for this program.",
            lifecycle="working",
            portfolio="Industrial Programs",
            project=proj,
            cloned_from_map_id=published.id,
        )
        db.session.add(clone)
        db.session.flush()
        build_flow(clone, design_h=16, cast_wait=21, build_h=8, build_m=4, qa_wait=1)


def seed_published_exemplar_if_missing():
    """Idempotent: seed the published cast-bracket exemplar and its two clones once, keyed by
    the published map's name so re-running never duplicates it."""
    if db.session.query(Map.id).filter_by(name=_PUBLISHED_NAME).first():
        return
    _seed_published_bracket_exemplar()
    db.session.commit()
