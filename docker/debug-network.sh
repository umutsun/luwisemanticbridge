#!/bin/bash

echo "=== Checking all containers ==="
docker ps -a | grep asemb

echo -e "\n=== Checking container networks ==="
docker inspect asemb-api | grep -A 10 "NetworkSettings"

echo -e "\n=== Testing connectivity from host ==="
curl -f http://localhost:8083/api/v1/health && echo "✓ API reachable from host" || echo "✗ API not reachable from host"

echo -e "\n=== Checking if containers are on same network ==="
docker network inspect asemb_asemb-network | grep -A 20 "Containers"

echo -e "\n=== Checking API container logs ==="
docker logs asemb-api --tail 10