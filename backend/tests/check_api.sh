#!/bin/bash
set -e
MAP_ID=$(curl -s http://localhost:8080/api/maps | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
echo "map id: $MAP_ID"
echo "--- metrics ---"
curl -s "http://localhost:8080/api/maps/$MAP_ID/metrics" | python3 -m json.tool
