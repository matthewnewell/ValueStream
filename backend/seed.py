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
