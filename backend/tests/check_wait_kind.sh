#!/bin/bash
# Edge wait_kind (internal/external) + metrics.wait_by_kind_sec + slip_amplification.
# Runs against a throwaway working map cloned from the published cast-bracket exemplar, so it
# doesn't depend on whatever happens to be first in the main list (and the sample map is
# read-only anyway).
set -e
BASE=http://localhost:8080/api

PUB_ID=$(curl -s "$BASE/maps/library" | python3 -c "
import json, sys
print(next(m['id'] for m in json.load(sys.stdin) if m['lifecycle'] == 'published'))
")
MAP_ID=$(curl -s -X POST "$BASE/maps/$PUB_ID/clone" -H 'Content-Type: application/json' \
  -d '{"project":"wait_kind smoke test"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "map: $MAP_ID"
trap 'curl -s -X DELETE "$BASE/maps/$MAP_ID" -o /dev/null' EXIT

curl -s $BASE/maps/$MAP_ID | python3 -c "
import json,sys
d = json.load(sys.stdin)
for e in d['edges']:
    src = [s['name'] for s in d['steps'] if s['id']==e['source_step_id']][0]
    tgt = [s['name'] for s in d['steps'] if s['id']==e['target_step_id']][0]
    print(e['id'], src, '->', tgt, e.get('label'), e['wait_time_sec'])
" > /tmp/edges.txt
cat /tmp/edges.txt

PO1=$(grep "PO approval" /tmp/edges.txt | grep "Cast Housing" | awk '{print $1}')
PO2=$(grep "PO approval" /tmp/edges.txt | grep "Standard" | awk '{print $1}')
FOUNDRY=$(grep "foundry" /tmp/edges.txt | awk '{print $1}')
DIST=$(grep "distributor" /tmp/edges.txt | awk '{print $1}')
QA=$(grep "QA hold" /tmp/edges.txt | awk '{print $1}')

echo "== categorizing edges =="
curl -s -X PUT $BASE/edges/$PO1 -H 'Content-Type: application/json' -d '{"wait_kind":"internal"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('PO1:', d['wait_kind'])"
curl -s -X PUT $BASE/edges/$PO2 -H 'Content-Type: application/json' -d '{"wait_kind":"internal"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('PO2:', d['wait_kind'])"
curl -s -X PUT $BASE/edges/$FOUNDRY -H 'Content-Type: application/json' -d '{"wait_kind":"external"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('FOUNDRY:', d['wait_kind'])"
curl -s -X PUT $BASE/edges/$DIST -H 'Content-Type: application/json' -d '{"wait_kind":"external"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('DIST:', d['wait_kind'])"
curl -s -X PUT $BASE/edges/$QA -H 'Content-Type: application/json' -d '{"wait_kind":"internal"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('QA:', d['wait_kind'])"

echo "== invalid wait_kind should 400 =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X PUT $BASE/edges/$QA -H 'Content-Type: application/json' -d '{"wait_kind":"bogus"}'
curl -s -X PUT $BASE/edges/$QA -H 'Content-Type: application/json' -d '{"wait_kind":"internal"}' > /dev/null

echo "== metrics: wait_by_kind_sec + slip_amplification =="
curl -s $BASE/maps/$MAP_ID/metrics | python3 -c "
import json,sys
m = json.load(sys.stdin)
print('wait_by_kind_sec:', m['wait_by_kind_sec'])
print()
for w in m['wait_contributors']:
    print(w['source_step_name'], '->', w['target_step_name'], w['wait_time_sec'], w['wait_kind'], w['slip_amplification'])
"
