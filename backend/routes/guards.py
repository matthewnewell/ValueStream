"""Shared route guards.

Value Stream has no auth, but it does have read-only maps: a published snapshot and a featured
15288 scaffold are frozen library artifacts. The graph-editing routes call `writable_or_403`
so a stray PUT (or a curious poke at the API) can't corrupt one — you clone a library map into
a project to change it, you don't edit it in place. Working maps and the sample map (an
editable sandbox, restored by "↺ Reset") are writable.
"""

from flask import jsonify

from models import Map


def writable_or_403(map_id: str):
    """Return a (response, status) tuple to bail with when `map_id` names a read-only map, else
    None. A missing map is left for the caller's own get_or_404 to handle."""
    m = Map.query.get(map_id)
    if m is not None and m.read_only:
        return (
            jsonify({
                "error": (
                    f"This map is a {m.lifecycle} library entry and read-only. "
                    "Clone it into a project from the Map Library to make changes."
                )
            }),
            403,
        )
    return None
