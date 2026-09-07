"""
SQLAlchemy models: Map, Step, Edge.

A Map is a directed graph of process Steps connected by Edges. Step processing time
(human_time_sec + machine_time_sec) is the node weight for the CPM engine (see engine.py).
Edge wait_time_sec is the edge weight — wait/queue/transport time lives on the connector
between two steps, not on the step itself, because a join step can be fed by paths with
genuinely different queue delays (see plan doc for the full rationale).

All durations are stored in seconds. Unit conversion is a frontend-only concern.

Nested value streams: a Step may optionally own a child Map (`child_map_id`) — "Design"
exploding into its own Requirements Analysis -> Trade Study -> ... sub-map. Ownership is a
strict tree (one owning step per child map, enforced by construction: child maps are only
ever created via the /expand route, never linked by hand), not a shared/reusable template —
see engine.py for how a step-with-a-child-map's effective duration and human/machine/wait
breakdown are rolled up recursively from that child map's own CPM run.
"""

from datetime import datetime, timezone

from db import _uuid, db


def _now():
    return datetime.now(timezone.utc)


# A map's place in the lifecycle. Only `working` maps are editable and only they show in the
# main map list (Admin). The other three are read-only:
#   working    — a live project's map; the PM builds and runs it
#   published  — a frozen snapshot contributed to the library at project closeout (a copy of a
#                working map, carrying its real recorded numbers), cloned to seed a new project
#   featured   — an org-issued generic scaffold (the ISO/IEC/IEEE 15288 starter maps); never
#                belonged to a real project
#   sample     — the single canned demo map the nav's "Sample Map" opens, so someone evaluating
#                the tool has one representative map to look at without opening the catalog
MAP_LIFECYCLES = ("working", "published", "featured", "sample")


class Map(db.Model):
    __tablename__ = "map"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now, nullable=False)

    # Where this map sits in the lifecycle — see MAP_LIFECYCLES above. This is the field the
    # routes filter and gate on: the main list is lifecycle == "working", the library is
    # "featured" + "published", the nav's Sample Map is the one "sample" row, and anything not
    # "working" is read-only.
    lifecycle = db.Column(db.String(20), nullable=False, default="working")

    # Legacy flag, kept in sync (True iff lifecycle == "featured") so the older smoke tests and
    # any external reader still work — new code reads `lifecycle`, not this. template_category
    # is a cosmetic grouping label for the library UI (e.g. "Technical Processes" for a featured
    # scaffold, or a fabrication family for a published project map); nothing in the engine
    # reads it. The clone/publish routes always set both this and lifecycle together.
    is_template = db.Column(db.Boolean, default=False, nullable=False)
    template_category = db.Column(db.String(100), nullable=True)

    # For a map cloned out of the library into a project: which library map it came from. Powers
    # the library's "Used by N projects" count (distinct projects among the working maps that
    # point here). Null on maps not cloned from the library. ON DELETE SET NULL so removing a
    # library entry doesn't cascade into its clones.
    cloned_from_map_id = db.Column(
        db.String(36), db.ForeignKey("map.id", ondelete="SET NULL"), nullable=True
    )
    # For a published snapshot: the working map it was published from. Republishing that working
    # map overwrites the snapshot (delete the old, write a fresh one) — this is how it's found.
    published_from_map_id = db.Column(
        db.String(36), db.ForeignKey("map.id", ondelete="SET NULL"), nullable=True
    )
    published_at = db.Column(db.DateTime, nullable=True)

    # Which portfolio / project this value stream belongs to — plain text labels, not links to
    # entities. Value Stream stays unaware of Conway's Depot (the ecosystem's project system of
    # record); it keeps its own copy of this context, the same way BurnedValue and Launchpad
    # do, tied together only by convention. Null on templates and on maps not yet filed under
    # a project. The map library groups on template_category instead; the main list groups and
    # filters on these.
    portfolio = db.Column(db.String(200), nullable=True)
    project = db.Column(db.String(200), nullable=True)

    # `Step` now has two FKs pointing at `map.id` (its owning `map_id`, and the optional
    # `child_map_id` a step uses to point *down* into a sub-process) — foreign_keys must be
    # explicit here or SQLAlchemy can't tell which one this "owning map" relationship means.
    steps = db.relationship(
        "Step",
        foreign_keys="Step.map_id",
        backref="map",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    edges = db.relationship(
        "Edge", backref="map", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def read_only(self) -> bool:
        """Only a working map can be edited. Published snapshots, featured scaffolds, and the
        sample map are frozen — clone one into a project to make changes."""
        return self.lifecycle != "working"

    def to_dict(self, include_graph: bool = True) -> dict:
        d = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "step_count": len(self.steps),
            "lifecycle": self.lifecycle,
            "read_only": self.read_only,
            "is_template": self.is_template,
            "template_category": self.template_category,
            "portfolio": self.portfolio,
            "project": self.project,
            "cloned_from_map_id": self.cloned_from_map_id,
            "published_from_map_id": self.published_from_map_id,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }
        if include_graph:
            d["steps"] = [s.to_dict() for s in self.steps]
            d["edges"] = [e.to_dict() for e in self.edges]
        return d


class Step(db.Model):
    __tablename__ = "step"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    map_id = db.Column(
        db.String(36), db.ForeignKey("map.id"), nullable=False, index=True
    )

    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)  # AI context

    pos_x = db.Column(db.Float, default=0.0, nullable=False)
    pos_y = db.Column(db.Float, default=0.0, nullable=False)

    human_time_sec = db.Column(db.Float, default=0.0, nullable=False)
    machine_time_sec = db.Column(db.Float, default=0.0, nullable=False)
    operators = db.Column(db.Integer, default=1, nullable=False)
    machines = db.Column(db.Integer, default=0, nullable=False)

    notes = db.Column(db.Text, nullable=True)
    ai_rationale = db.Column(db.Text, nullable=True)

    # Nullable link to a sub-process map "inside" this step. SET NULL on delete so removing
    # the child map (the /child-map collapse route) doesn't require deleting the step itself.
    # Never set directly via PUT /api/steps/<id> — only ever created through /expand, which is
    # what keeps "one owning step per child map" true without needing a DB-level uniqueness
    # constraint (SQLite can't add one via ALTER TABLE ADD COLUMN anyway).
    child_map_id = db.Column(
        db.String(36), db.ForeignKey("map.id", ondelete="SET NULL"), nullable=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "map_id": self.map_id,
            "name": self.name,
            "description": self.description,
            "pos_x": self.pos_x,
            "pos_y": self.pos_y,
            "human_time_sec": self.human_time_sec,
            "machine_time_sec": self.machine_time_sec,
            "operators": self.operators,
            "machines": self.machines,
            "notes": self.notes,
            "ai_rationale": self.ai_rationale,
            "child_map_id": self.child_map_id,
        }


class Edge(db.Model):
    __tablename__ = "edge"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    map_id = db.Column(
        db.String(36), db.ForeignKey("map.id"), nullable=False, index=True
    )

    source_step_id = db.Column(db.String(36), db.ForeignKey("step.id"), nullable=False)
    target_step_id = db.Column(db.String(36), db.ForeignKey("step.id"), nullable=False)

    wait_time_sec = db.Column(db.Float, default=0.0, nullable=False)
    label = db.Column(db.String(200), nullable=True)
    kind = db.Column(db.String(20), default="flow", nullable=False)

    # Whether this wait is something the operator's own org controls (an internal queue —
    # approvals, sign-offs, QA holds) or sits outside their control (external — vendor lead
    # time, shipping transit). Nullable/unset by default: the operator categorizes it, the
    # engine never guesses. Distinct from `kind` above (topology: flow vs a future info-flow
    # edge type) — this is about who can act on the delay, not what the edge represents.
    wait_kind = db.Column(db.String(20), nullable=True)  # "internal" | "external" | None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "map_id": self.map_id,
            "source_step_id": self.source_step_id,
            "target_step_id": self.target_step_id,
            "wait_time_sec": self.wait_time_sec,
            "label": self.label,
            "kind": self.kind,
            "wait_kind": self.wait_kind,
        }
