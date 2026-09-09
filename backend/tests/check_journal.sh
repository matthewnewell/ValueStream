#!/bin/bash
# The map journal: auto-captured "change" events on step/edge edits, manual "note" events,
# per-target scoping, delete rules, and the read-only guard. Runs against a throwaway working
# map cloned from the published exemplar.
set -e
BASE=http://localhost:8080/api

PUB_ID=$(curl -s "$BASE/maps/library" | python3 -c "
import json, sys
print(next(m['id'] for m in json.load(sys.stdin) if m['lifecycle'] == 'published'))
")
MAP_ID=$(curl -s -X POST "$BASE/maps/$PUB_ID/clone" -H 'Content-Type: application/json' \
  -d '{"project":"journal smoke test"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "map: $MAP_ID"
trap 'curl -s -X DELETE "$BASE/maps/$MAP_ID" -o /dev/null' EXIT

STEP_ID=$(curl -s $BASE/maps/$MAP_ID | python3 -c "import json,sys; print(json.load(sys.stdin)['steps'][0]['id'])")
EDGE_ID=$(curl -s $BASE/maps/$MAP_ID | python3 -c "import json,sys; print(json.load(sys.stdin)['edges'][0]['id'])")

echo "== fresh clone has an empty journal =="
curl -s "$BASE/maps/$MAP_ID/events" | python3 -c "
import json,sys
assert json.load(sys.stdin) == [], 'expected no events'
print('ok')
"

echo "== a step edit with a note -> change events + one note event =="
STEP=$(curl -s $BASE/maps/$MAP_ID | python3 -c "import json,sys; s=next(x for x in json.load(sys.stdin)['steps'] if x['id']=='$STEP_ID'); print(int(s['human_time_sec']+3600), s['operators']+2)")
NEW_HUMAN=$(echo $STEP | cut -d' ' -f1)
NEW_OPS=$(echo $STEP | cut -d' ' -f2)
curl -s -X PUT $BASE/steps/$STEP_ID -H 'Content-Type: application/json' \
  -d "{\"human_time_sec\": $NEW_HUMAN, \"operators\": $NEW_OPS, \"author\": \"Sam\", \"journal_note\": \"added a shift\"}" > /dev/null
curl -s "$BASE/maps/$MAP_ID/events?target_id=$STEP_ID" | python3 -c "
import json,sys
ev = json.load(sys.stdin)
kinds = sorted(e['kind'] for e in ev)
assert kinds == ['change','change','note'], kinds
assert all(e['author'] == 'Sam' for e in ev)
note = next(e for e in ev if e['kind']=='note')
assert note['note'] == 'added a shift'
changes = {e['field']: (e['old_value'], e['new_value']) for e in ev if e['kind']=='change'}
assert 'human time' in changes and 'operators' in changes, changes
print('ok --', changes)
"

echo "== editing a field to the same value logs nothing =="
BEFORE=$(curl -s "$BASE/maps/$MAP_ID/events" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
curl -s -X PUT $BASE/steps/$STEP_ID -H 'Content-Type: application/json' -d "{\"operators\": $NEW_OPS}" > /dev/null
AFTER=$(curl -s "$BASE/maps/$MAP_ID/events" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
test "$BEFORE" = "$AFTER" && echo "ok -- still $AFTER events" || { echo "FAIL: $BEFORE -> $AFTER"; exit 1; }

echo "== an edge edit is captured too =="
curl -s -X PUT $BASE/edges/$EDGE_ID -H 'Content-Type: application/json' \
  -d '{"label": "revised in smoke test", "author": "Dana"}' > /dev/null
curl -s "$BASE/maps/$MAP_ID/events?target_id=$EDGE_ID" | python3 -c "
import json,sys
ev = json.load(sys.stdin)
assert any(e['kind']=='change' and e['field']=='label' and e['new_value']=='revised in smoke test' for e in ev), ev
print('ok')
"

echo "== a manual map-level note =="
NOTE_ID=$(curl -s -X POST "$BASE/maps/$MAP_ID/events" -H 'Content-Type: application/json' \
  -d '{"note": "baseline locked", "author": "Jess"}' | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['target_type']=='map'; print(d['id'])")
echo "note: $NOTE_ID"

echo "== empty note -> 400 =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/maps/$MAP_ID/events" \
  -H 'Content-Type: application/json' -d '{"note": "  "}' | grep -q 400 && echo ok

echo "== delete a manual note (204), a change (400) =="
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/maps/$MAP_ID/events/$NOTE_ID" | grep -q 204 && echo "note deleted"
CHANGE_ID=$(curl -s "$BASE/maps/$MAP_ID/events" | python3 -c "import json,sys; print(next(e['id'] for e in json.load(sys.stdin) if e['kind']=='change'))")
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/maps/$MAP_ID/events/$CHANGE_ID" | grep -q 400 && echo "change protected"

echo "== read-only map rejects a note (403) =="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/maps/$PUB_ID/events" \
  -H 'Content-Type: application/json' -d '{"note": "nope"}' | grep -q 403 && echo ok

echo "all checks passed"
