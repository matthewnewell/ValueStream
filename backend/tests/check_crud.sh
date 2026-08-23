#!/bin/bash
set -e
BASE=http://localhost:8080/api

MAP_ID=$(curl -s $BASE/maps | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
echo "== create step =="
NEW_STEP=$(curl -s -X POST $BASE/maps/$MAP_ID/steps -H 'Content-Type: application/json' \
  -d '{"name":"Test Step","human_time_sec":100}')
echo "$NEW_STEP"
STEP_ID=$(echo "$NEW_STEP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

echo "== partial PUT (position only) =="
curl -s -X PUT $BASE/steps/$STEP_ID -H 'Content-Type: application/json' -d '{"pos_x": 999}'
echo
echo "== confirm human_time_sec untouched by position-only PUT =="
curl -s $BASE/maps/$MAP_ID | python3 -c "
import json,sys
d = json.load(sys.stdin)
s = [x for x in d['steps'] if x['id']=='$STEP_ID'][0]
print('pos_x:', s['pos_x'], 'human_time_sec:', s['human_time_sec'])
assert s['pos_x'] == 999
assert s['human_time_sec'] == 100
print('OK partial merge works')
"

echo "== reject edge across maps =="
OTHER_MAP=$(curl -s -X POST $BASE/maps -H 'Content-Type: application/json' -d '{"name":"Other Map"}')
OTHER_MAP_ID=$(echo "$OTHER_MAP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
OTHER_STEP=$(curl -s -X POST $BASE/maps/$OTHER_MAP_ID/steps -H 'Content-Type: application/json' -d '{"name":"Other Step"}')
OTHER_STEP_ID=$(echo "$OTHER_STEP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST $BASE/maps/$MAP_ID/edges -H 'Content-Type: application/json' \
  -d "{\"source_step_id\":\"$STEP_ID\",\"target_step_id\":\"$OTHER_STEP_ID\"}")
echo "$RESP"

echo "== reject self-loop =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST $BASE/maps/$MAP_ID/edges -H 'Content-Type: application/json' \
  -d "{\"source_step_id\":\"$STEP_ID\",\"target_step_id\":\"$STEP_ID\"}"

echo "== AI suggest with AI_PROVIDER=none =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST $BASE/steps/$STEP_ID/ai-suggest

echo "== duplicate map =="
DUP=$(curl -s -X POST $BASE/maps/$MAP_ID/duplicate)
echo "$DUP" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('duplicated:', d['name'], 'steps:', len(d['steps']), 'edges:', len(d['edges']))
"

echo "== delete test step (cascade edge cleanup) =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X DELETE $BASE/steps/$STEP_ID

echo "== cleanup: delete extra maps =="
curl -s -w "HTTP_STATUS:%{http_code}\n" -X DELETE $BASE/maps/$OTHER_MAP_ID
DUP_ID=$(echo "$DUP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
curl -s -w "HTTP_STATUS:%{http_code}\n" -X DELETE $BASE/maps/$DUP_ID

echo "ALL CHECKS DONE"
