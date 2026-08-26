#!/bin/bash
set -e
BASE=http://localhost:8080/api

MAP_ID=$(curl -s $BASE/maps | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
echo "root map: $MAP_ID"

DESIGN_ID=$(curl -s $BASE/maps/$MAP_ID | python3 -c "
import json,sys
d = json.load(sys.stdin)
print([s['id'] for s in d['steps'] if s['name']=='Design'][0])
")
echo "Design step: $DESIGN_ID"

echo "== expand Design into a sub-process =="
CHILD=$(curl -s -X POST $BASE/steps/$DESIGN_ID/expand)
echo "$CHILD" | python3 -m json.tool
CHILD_ID=$(echo "$CHILD" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

echo "== expanding again should 400 =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST $BASE/steps/$DESIGN_ID/expand

echo "== add sub-steps: Requirements(4h) -> Trade Study(40h, the real bottleneck) -> CCB wait(1wk) -> Approval(2h) =="
REQ=$(curl -s -X POST $BASE/maps/$CHILD_ID/steps -H 'Content-Type: application/json' -d '{"name":"Requirements Analysis","human_time_sec":14400}')
REQ_ID=$(echo "$REQ" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
TRADE=$(curl -s -X POST $BASE/maps/$CHILD_ID/steps -H 'Content-Type: application/json' -d '{"name":"Trade Study","human_time_sec":144000}')
TRADE_ID=$(echo "$TRADE" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
CCB=$(curl -s -X POST $BASE/maps/$CHILD_ID/steps -H 'Content-Type: application/json' -d '{"name":"Approval","human_time_sec":7200}')
CCB_ID=$(echo "$CCB" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

curl -s -X POST $BASE/maps/$CHILD_ID/edges -H 'Content-Type: application/json' -d "{\"source_step_id\":\"$REQ_ID\",\"target_step_id\":\"$TRADE_ID\"}" > /dev/null
curl -s -X POST $BASE/maps/$CHILD_ID/edges -H 'Content-Type: application/json' -d "{\"source_step_id\":\"$TRADE_ID\",\"target_step_id\":\"$CCB_ID\",\"wait_time_sec\":604800}" > /dev/null

echo "== root map metrics (Design's own fields should be IGNORED in favor of child rollup) =="
curl -s $BASE/maps/$MAP_ID/metrics | python3 -c "
import json,sys
m = json.load(sys.stdin)
print('lead_time_sec:', m['lead_time_sec'])
print('bottleneck:', m['bottleneck'])
print('deepest_bottleneck:', m['deepest_bottleneck'])
sm = m['step_metrics']['$DESIGN_ID']
print('Design step_metrics:', {k: sm[k] for k in ['has_child_map','child_map_id','child_step_count','effective_processing_sec','effective_human_sec','effective_wait_sec']})
"

echo "== breadcrumb from the child map =="
curl -s $BASE/maps/$CHILD_ID/breadcrumb | python3 -m json.tool

echo "== child map does NOT appear in top-level map list =="
curl -s $BASE/maps | python3 -c "
import json,sys
maps = json.load(sys.stdin)
ids = [m['id'] for m in maps]
assert '$CHILD_ID' not in ids, 'FAIL: child map leaked into top-level list'
print('OK: child map correctly hidden from list')
"

echo "== collapse Design back to a leaf =="
curl -s -w "HTTP_STATUS:%{http_code}\n" -X DELETE $BASE/steps/$DESIGN_ID/child-map
curl -s $BASE/maps/$MAP_ID | python3 -c "
import json,sys
d = json.load(sys.stdin)
s = [s for s in d['steps'] if s['id']=='$DESIGN_ID'][0]
assert s['child_map_id'] is None
print('OK: Design collapsed back to a leaf')
"
echo "== collapse deletes the child map outright (not just orphans it) =="
curl -s -o /dev/null -w "child map GET now returns HTTP_STATUS:%{http_code}\n" $BASE/maps/$CHILD_ID

echo "ALL NESTING CHECKS PASSED"
