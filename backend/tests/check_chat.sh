#!/bin/bash
set -e
BASE=http://localhost:8080/api
MAP_ID=$(curl -s $BASE/maps | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
echo "map: $MAP_ID"
echo "== chat with AI_PROVIDER=none should 503 gracefully =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST $BASE/maps/$MAP_ID/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"why is lead time so long?"}]}'
echo "== missing messages should 400 =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST $BASE/maps/$MAP_ID/chat \
  -H 'Content-Type: application/json' -d '{}'
echo "== ai-insights still works (recursive metrics) =="
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST $BASE/maps/$MAP_ID/ai-insights
