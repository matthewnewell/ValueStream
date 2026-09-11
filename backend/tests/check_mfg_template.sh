#!/bin/bash
# Smoke test for the "Manufacturing Routing" featured template: the nested structure seeds
# correctly (Design & Engineering -> req/design/config-baseline, Implementation -> the 8-op
# routing), and — the thing this template exists to prove — cloning it carries the nested
# sub-processes along instead of silently collapsing them back to plain leaves.
set -e
BASE=http://localhost:8080/api

echo "== GET /maps/library: the Manufacturing Routing template is featured, 2 top-level steps =="
MFG_ID=$(curl -s "$BASE/maps/library" | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = next(x for x in d if 'Manufacturing Routing' in x['name'] and x['lifecycle'] == 'featured')
assert m['step_count'] == 2, m['step_count']
print(m['id'])
")
echo "template id: $MFG_ID"

echo "== both top-level steps own a child map =="
curl -s "$BASE/maps/$MFG_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
steps = {s['name']: s for s in d['steps']}
de = steps['Design & Engineering']
make = next(s for n, s in steps.items() if n != 'Design & Engineering')
assert de['child_map_id'], 'Design & Engineering has no child map'
assert make['child_map_id'], 'Implementation step has no child map'
print('DESIGN_CHILD', de['child_map_id'])
print('MAKE_CHILD', make['child_map_id'])
" > /tmp/mfg_ids.txt
DESIGN_CHILD=$(grep DESIGN_CHILD /tmp/mfg_ids.txt | cut -d' ' -f2)
MAKE_CHILD=$(grep MAKE_CHILD /tmp/mfg_ids.txt | cut -d' ' -f2)

echo "== Design & Engineering child: Requirements -> Design -> Configuration Baseline =="
curl -s "$BASE/maps/$DESIGN_CHILD" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert len(d['steps']) == 3, len(d['steps'])
assert len(d['edges']) == 2, len(d['edges'])
names = {s['name'] for s in d['steps']}
assert any('Requirements' in n for n in names)
assert any('Design Definition' in n for n in names)
assert any('Configuration Baseline' in n for n in names)
print('ok — 3 steps, 2 edges')
"

echo "== Implementation child: the 8-operation routing =="
curl -s "$BASE/maps/$MAKE_CHILD" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert len(d['steps']) == 8, len(d['steps'])
assert len(d['edges']) == 7, len(d['edges'])
assert all(s['owning_team'] for s in d['steps']), 'every routing op should have an owner'
print('ok — 8 operations, 7 edges, all owned')
"

echo "== metrics compute cleanly (all-zero durations, but no cycle/disconnected false positives) =="
curl -s "$BASE/maps/$MFG_ID/metrics" | python3 -c "
import json, sys
m = json.load(sys.stdin)
assert m['disconnected_step_ids'] == [], m['disconnected_step_ids']
assert m['cycles_detected'] == [], m['cycles_detected']
print('ok')
"

echo "== clone the template — the recursive-copy fix under test =="
CLONE=$(curl -s -X POST "$BASE/maps/$MFG_ID/clone" -H 'Content-Type: application/json' \
  -d '{"portfolio":"Test","project":"Mfg Template Smoke Test"}')
CLONE_ID=$(echo "$CLONE" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "clone id: $CLONE_ID"

curl -s "$BASE/maps/$CLONE_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
steps = {s['name']: s for s in d['steps']}
de = steps['Design & Engineering']
make = next(s for n, s in steps.items() if n != 'Design & Engineering')
assert de['child_map_id'], 'CLONE LOST the Design & Engineering child map'
assert make['child_map_id'], 'CLONE LOST the Implementation child map'
assert de['child_map_id'] != '$DESIGN_CHILD', 'clone points at the SAME child map as the template'
assert make['child_map_id'] != '$MAKE_CHILD', 'clone points at the SAME child map as the template'
print('CLONE_DESIGN_CHILD', de['child_map_id'])
print('CLONE_MAKE_CHILD', make['child_map_id'])
" > /tmp/mfg_clone_ids.txt
CLONE_DESIGN_CHILD=$(grep CLONE_DESIGN_CHILD /tmp/mfg_clone_ids.txt | cut -d' ' -f2)
CLONE_MAKE_CHILD=$(grep CLONE_MAKE_CHILD /tmp/mfg_clone_ids.txt | cut -d' ' -f2)

echo "== the clone's own child maps carry the full nested content, and are editable =="
curl -s "$BASE/maps/$CLONE_DESIGN_CHILD" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert len(d['steps']) == 3, len(d['steps'])
assert d['lifecycle'] == 'working' and d['read_only'] is False
print('ok — clone Design & Engineering child: 3 steps, working')
"
curl -s "$BASE/maps/$CLONE_MAKE_CHILD" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert len(d['steps']) == 8, len(d['steps'])
assert d['lifecycle'] == 'working' and d['read_only'] is False
print('ok — clone routing child: 8 steps, working')
"

echo "== a clone's nested child maps do NOT leak into the Map Library list =="
curl -s "$BASE/maps/library" | python3 -c "
import json, sys
ids = {m['id'] for m in json.load(sys.stdin)}
assert '$CLONE_DESIGN_CHILD' not in ids
assert '$CLONE_MAKE_CHILD' not in ids
print('ok')
"

echo "== deleting the clone recursively cleans up its child maps (no orphans) =="
curl -s -o /dev/null -w 'delete status: %{http_code}\n' -X DELETE "$BASE/maps/$CLONE_ID"
curl -s -o /dev/null -w "orphan check (expect 404): %{http_code}\n" "$BASE/maps/$CLONE_DESIGN_CHILD"
curl -s -o /dev/null -w "orphan check (expect 404): %{http_code}\n" "$BASE/maps/$CLONE_MAKE_CHILD"

rm -f /tmp/mfg_ids.txt /tmp/mfg_clone_ids.txt
echo "all checks passed"
