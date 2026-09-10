#!/bin/bash
# Smoke test for the Map Library: the featured program value-stream template + published
# project snapshots, the "used by N projects" count, list-filtering (library maps never in
# the main list), and the clone-into-a-project flow.
set -e
BASE=http://localhost:8080/api

echo "== GET /maps/library: the featured 15288 program template + the published exemplar =="
curl -s "$BASE/maps/library" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for m in d:
    print(f\"  {m['lifecycle']:9} used_by={m['used_by_projects']} | {m['name']}\")
feat = [m for m in d if m['lifecycle'] == 'featured']
pub = [m for m in d if m['lifecycle'] == 'published']
assert len(feat) >= 1, 'expected the seeded featured program template'
assert any('Program Value Stream' in m['name'] for m in feat), 'program template missing'
assert not any(n in m['name'] for m in feat for n in ('Agreement Processes', 'Technical Management Processes', 'Technical Processes (ISO')), 'retired single-family scaffold still present'
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

echo "== POST /maps/sample/reset rebuilds it to the canonical 5 steps, each with an owner =="
SAMPLE_ID=$(curl -s -X POST "$BASE/maps/sample/reset" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['lifecycle'] == 'sample' and d['step_count'] == 5, d
print(d['id'])
")
curl -s "$BASE/maps/$SAMPLE_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert all(s['owning_team'] for s in d['steps']), [s['name'] for s in d['steps'] if not s['owning_team']]
print('ok — reset to', d['step_count'], 'steps, all owned')
"

echo "== clone the featured program template into a project =="
TMPL_ID=$(curl -s "$BASE/maps/library" | python3 -c "
import json, sys
print(next(m['id'] for m in json.load(sys.stdin) if 'Program Value Stream' in m['name']))
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
assert d['step_count'] == 23, f\"expected 23 steps, got {d['step_count']}\"
assert any(s['owning_team'] for s in d['steps']), 'template steps should carry owners'
print('clone ok:', d['name'], '| lifecycle:', d['lifecycle'], '|', d['step_count'], 'steps')
"
CLONE_ID=$(echo "$CLONE" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

echo "== the clone bumped the template's used-by count =="
curl -s "$BASE/maps/library" | python3 -c "
import json, sys
m = next(x for x in json.load(sys.stdin) if x['id'] == '$TMPL_ID')
assert m['used_by_projects'] >= 1, m['used_by_projects']
print('ok — template used_by_projects:', m['used_by_projects'])
"

echo "== clone metrics: procurement dominates, rework loop present, no false cycle =="
curl -s "$BASE/maps/$CLONE_ID/metrics" | python3 -c "
import json, sys
m = json.load(sys.stdin)
assert m['cycles_detected'] == [], m['cycles_detected']
assert m['disconnected_step_ids'] == [], m['disconnected_step_ids']
assert len(m['rework_loops']) == 1, m['rework_loops']
worst = m['wait_contributors'][0]
assert 'long-lead manufacturing lead time' == (worst['label'] or ''), worst
assert worst['edge_id'] in m['critical_edge_ids'], 'dominant wait should be on the critical path'
gate = next(w for w in m['wait_contributors'] if w['label'] == 'advance procurement authorization')
assert gate.get('slip_amplification'), 'the pre-commit authorization should flag slip amplification'
print('metrics ok — lead_time_sec:', m['lead_time_sec'], '| worst wait:', worst['label'])
"

echo "== cloning a working map via /clone 400s (only library maps) =="
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" -X POST "$BASE/maps/$CLONE_ID/clone"

echo "== cleanup =="
curl -s -X DELETE "$BASE/maps/$CLONE_ID" -o /dev/null -w 'delete status: %{http_code}\n'

echo "all checks passed"
