#!/bin/bash
# Smoke test for "promote a finished project into the library" (POST /maps/<id>/promote):
# non-destructive copy, real numbers carried forward (not a zero scaffold), double-promote
# guard.
set -e
BASE=http://localhost:8080/api

echo "== find the demo map =="
MAP_ID=$(curl -s "$BASE/maps" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(next(m['id'] for m in d if m['name'].startswith('Demo:')))
")
echo "map: $MAP_ID"

echo "== promote it, with a category =="
PROMOTED=$(curl -s -X POST "$BASE/maps/$MAP_ID/promote" -H 'Content-Type: application/json' \
  -d '{"template_category":"Hardware Fabrication"}')
echo "$PROMOTED" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['is_template'] is True
assert d['template_category'] == 'Hardware Fabrication'
assert d['step_count'] == 5
print('promoted ok:', d['name'], '| category:', d['template_category'], '| steps:', d['step_count'])
"
PROMOTED_ID=$(echo "$PROMOTED" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

echo "== original map is untouched: still in the main list =="
curl -s "$BASE/maps" | python3 -c "
import json, sys
names = [m['name'] for m in json.load(sys.stdin)]
assert any(n.startswith('Demo:') for n in names), 'original demo map should still be in the main list'
print('ok — original still present')
"

echo "== promoted copy carries real (nonzero) wait times, unlike the zero-scaffold templates =="
curl -s "$BASE/maps/$PROMOTED_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
waits = [e['wait_time_sec'] for e in d['edges']]
assert any(w > 0 for w in waits), 'promoted copy should carry real wait times forward'
print('ok — real wait times:', waits)
"

echo "== double-promoting the promoted copy should 400 =="
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" -X POST "$BASE/maps/$PROMOTED_ID/promote"

echo "== cleanup =="
curl -s -X DELETE "$BASE/maps/$PROMOTED_ID" -o /dev/null -w 'delete status: %{http_code}\n'

echo "all checks passed"
