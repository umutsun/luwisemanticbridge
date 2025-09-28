#!/bin/bash

echo "=== Checking container status ==="
docker ps -a | grep asemb

echo -e "\n=== Checking nginx error logs ==="
docker logs asemb-nginx --tail 20 2>&1

echo -e "\n=== Checking API logs ==="
docker logs asemb-api --tail 20

echo -e "\n=== Checking frontend logs ==="
docker logs asemb-frontend --tail 20

echo -e "\n=== Testing API from nginx container ==="
docker exec asemb-nginx wget -q --timeout=3 --tries=1 http://asemb-api:8083/api/v1/health -O - && echo "✓ API is reachable from nginx" || echo "✗ API is NOT reachable from nginx"

echo -e "\n=== Testing frontend from nginx container ==="
docker exec asemb-nginx wget -q --timeout=3 --tries=1 http://asemb-frontend:3000/ -O - && echo "✓ Frontend is reachable from nginx" || echo "✗ Frontend is NOT reachable from nginx"

echo -e "\n=== Checking API health directly ==="
docker exec asemb-api curl -f http://localhost:8083/api/v1/health && echo "✓ API is healthy" || echo "✗ API is not healthy"

echo -e "\n=== Checking frontend health directly ==="
docker exec asemb-frontend wget -q --timeout=3 --tries=1 http://localhost:3000/ -O - && echo "✓ Frontend is healthy" || echo "✗ Frontend is not healthy"