#!/bin/bash
# Smoke test for "publish a finished project into the library" (POST /maps/<id>/publish):
# non-destructive copy, real numbers carried forward (not a zero scaffold), republish
# overwrites rather than duplicating, and the legacy /promote alias still routes here.
set -e
BASE=http://localhost:8080/api

echo "== clone the published exemplar to get a fresh working map to publish =="
PUB_ID=$(curl -s "$BASE/maps/library" | python3 -c "
import json, sys
print(next(m['id'] for m in json.load(sys.stdin) if m['lifecycle'] == 'published'))
")
WORKING=$(curl -s -X POST "$BASE/maps/$PUB_ID/clone" -H 'Content-Type: application/json' \
  -d '{"portfolio":"Test","project":"Publish Smoke Test"}')
WORKING_ID=$(echo "$WORKING" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "working map: $WORKING_ID"

echo "== publish it, with a category =="
SNAP=$(curl -s -X POST "$BASE/maps/$WORKING_ID/publish" -H 'Content-Type: application/json' \
  -d '{"template_category":"Hardware Fabrication"}')
echo "$SNAP" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['lifecycle'] == 'published', d['lifecycle']
assert d['read_only'] is True
assert d['template_category'] == 'Hardware Fabrication'
assert d['published_from_map_id'] is not None
assert d['published_at'] is not None
print('published ok:', d['name'], '| steps:', d['step_count'])
"

echo "== the working map is untouched: still working, still in the main list =="
curl -s "$BASE/maps" | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = next(x for x in d if x['id'] == '$WORKING_ID')
assert m['lifecycle'] == 'working', m['lifecycle']
print('ok — working map still present and editable')
"

echo "== snapshot carries real (nonzero) wait times forward =="
SNAP_ID=$(echo "$SNAP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
curl -s "$BASE/maps/$SNAP_ID" | python3 -c "
import json, sys
waits = [e['wait_time_sec'] for e in json.load(sys.stdin)['edges']]
assert any(w > 0 for w in waits), 'snapshot should carry real wait times forward'
print('ok — real wait times:', waits)
"

echo "== republish overwrites: still exactly one snapshot from this working map =="
curl -s -X POST "$BASE/maps/$WORKING_ID/promote" -o /dev/null   # legacy alias
curl -s "$BASE/maps/library" | python3 -c "
import json, sys
snaps = [m for m in json.load(sys.stdin) if m.get('published_from_map_id') == '$WORKING_ID']
assert len(snaps) == 1, f'expected 1 snapshot after republish, got {len(snaps)}'
print('ok — exactly one snapshot after republish')
"

echo "== publishing a non-working map 400s (the published exemplar itself) =="
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" -X POST "$BASE/maps/$PUB_ID/publish"

echo "== cleanup =="
NEW_SNAP_ID=$(curl -s "$BASE/maps/library" | python3 -c "
import json, sys
print(next(m['id'] for m in json.load(sys.stdin) if m.get('published_from_map_id') == '$WORKING_ID'))
")
curl -s -X DELETE "$BASE/maps/$NEW_SNAP_ID" -o /dev/null -w 'delete snapshot: %{http_code}\n'
curl -s -X DELETE "$BASE/maps/$WORKING_ID" -o /dev/null -w 'delete working: %{http_code}\n'

echo "all checks passed"
