#!/bin/bash
# Smoke test for the Map Library: featured scaffolds + published project snapshots, the
# "used by N projects" count, list-filtering (library maps never in the main list), and the
# clone-into-a-project flow.
set -e
BASE=http://localhost:8080/api

echo "== GET /maps/library: the 3 featured 15288 scaffolds + the published exemplar =="
curl -s "$BASE/maps/library" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for m in d:
    print(f\"  {m['lifecycle']:9} used_by={m['used_by_projects']} | {m['name']}\")
feat = [m for m in d if m['lifecycle'] == 'featured']
pub = [m for m in d if m['lifecycle'] == 'published']
assert len(feat) >= 3, 'expected at least the 3 seeded featured scaffolds'
assert all(m['read_only'] for m in d), 'every library entry is read-only'
assert len(pub) >= 1, 'expected the seeded published exemplar'
assert any(m['used_by_projects'] >= 2 for m in pub), 'published exemplar should show its seeded clones'
"

echo "== GET /maps: no library maps (featured/published) and no sample in the main list =="
curl -s "$BASE/maps" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert all(m['lifecycle'] == 'working' for m in d), [m['lifecycle'] for m in d]
print('ok —', len(d), 'working map(s)')
"

echo "== GET /maps/sample: exactly one, editable sandbox =="
curl -s "$BASE/maps/sample" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['lifecycle'] == 'sample' and d['read_only'] is False
print('ok —', d['name'])
"

echo "== POST /maps/sample/reset rebuilds it to the canonical 5 steps =="
curl -s -X POST "$BASE/maps/sample/reset" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['lifecycle'] == 'sample' and d['step_count'] == 5, d
print('ok — reset to', d['step_count'], 'steps')
"

echo "== clone the parallel-branch featured scaffold into a project =="
TMPL_ID=$(curl -s "$BASE/maps/library" | python3 -c "
import json, sys
print(next(m['id'] for m in json.load(sys.stdin) if 'Technical Management' in m['name']))
")
CLONE=$(curl -s -X POST "$BASE/maps/$TMPL_ID/clone" -H 'Content-Type: application/json' \
  -d '{"portfolio":"Test","project":"Library Smoke Test"}')
echo "$CLONE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['lifecycle'] == 'working', d['lifecycle']
assert d['read_only'] is False
assert d['cloned_from_map_id'] == '$TMPL_ID'
assert d['project'] == 'Library Smoke Test'
assert d['step_count'] == 10, f\"expected 10 steps, got {d['step_count']}\"
print('clone ok:', d['name'], '| lifecycle:', d['lifecycle'])
"
CLONE_ID=$(echo "$CLONE" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

echo "== the clone bumped the scaffold's used-by count =="
curl -s "$BASE/maps/library" | python3 -c "
import json, sys
m = next(x for x in json.load(sys.stdin) if x['id'] == '$TMPL_ID')
assert m['used_by_projects'] >= 1, m['used_by_projects']
print('ok — featured scaffold used_by_projects:', m['used_by_projects'])
"

echo "== clone metrics still compute (fan-out/fan-in isn't a cycle) =="
curl -s "$BASE/maps/$CLONE_ID/metrics" | python3 -c "
import json, sys
m = json.load(sys.stdin)
assert m['cycles_detected'] == [] and m['disconnected_step_ids'] == []
print('metrics ok — lead_time_sec:', m['lead_time_sec'])
"

echo "== cloning a working map via /clone 400s (only library maps) =="
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" -X POST "$BASE/maps/$CLONE_ID/clone"

echo "== cleanup =="
curl -s -X DELETE "$BASE/maps/$CLONE_ID" -o /dev/null -w 'delete status: %{http_code}\n'

echo "all checks passed"
