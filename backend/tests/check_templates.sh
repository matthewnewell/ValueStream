#!/bin/bash
# Smoke test for the map library (templates): seeded content, list-filtering, and the
# clone-drops-is_template invariant duplicate_map relies on.
set -e
BASE=http://localhost:8080/api

echo "== GET /maps/templates: expect the 3 seeded 15288 templates =="
curl -s "$BASE/maps/templates" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for t in d:
    print(t['template_category'], '|', t['name'], '|', t['step_count'], 'steps')
assert len(d) >= 3, 'expected at least the 3 seeded templates'
assert all(t['is_template'] for t in d), 'every entry here should be a template'
"

echo "== GET /maps: templates must NOT appear here =="
curl -s "$BASE/maps" | python3 -c "
import json, sys
names = [m['name'] for m in json.load(sys.stdin)]
assert not any(n.startswith('Template:') for n in names), f'a template leaked into the main list: {names}'
print('ok —', len(names), 'non-template map(s)')
"

echo "== clone the parallel-branch template, verify is_template resets and metrics compute =="
TMPL_ID=$(curl -s "$BASE/maps/templates" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(next(t['id'] for t in d if 'Technical Management' in t['name']))
")
CLONE=$(curl -s -X POST "$BASE/maps/$TMPL_ID/duplicate")
echo "$CLONE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['is_template'] is False, 'clone must not inherit is_template'
assert d['template_category'] is None, 'clone must not inherit template_category'
assert d['step_count'] == 10, f\"expected 10 steps (8 processes + 2 anchors), got {d['step_count']}\"
print('clone ok:', d['name'], '| is_template:', d['is_template'])
"
CLONE_ID=$(echo "$CLONE" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

curl -s "$BASE/maps/$CLONE_ID/metrics" | python3 -c "
import json, sys
m = json.load(sys.stdin)
assert m['cycles_detected'] == [], 'fan-out/fan-in topology should not read as a cycle'
assert m['disconnected_step_ids'] == [], 'fan-out/fan-in topology should not read as disconnected'
print('metrics ok — lead_time_sec:', m['lead_time_sec'], '| bottleneck:', m['bottleneck']['name'])
"

echo "== cleanup =="
curl -s -X DELETE "$BASE/maps/$CLONE_ID" -o /dev/null -w 'delete status: %{http_code}\n'

echo "all checks passed"
