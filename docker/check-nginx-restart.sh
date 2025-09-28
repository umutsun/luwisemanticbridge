#!/bin/bash

echo "=== Checking nginx error logs ==="
docker logs asemb-nginx --tail 20 2>&1

echo -e "\n=== Checking nginx configuration ==="
docker exec asemb-nginx nginx -T 2>&1 | head -50

echo -e "\n=== Testing if API is reachable ==="
docker exec asemb-nginx wget -q --timeout=3 --tries=1 http://asemb-api:8083/api/v1/health -O - && echo "✓ API is reachable" || echo "✗ API is NOT reachable"

echo -e "\n=== Testing if frontend is reachable ==="
docker exec asemb-nginx wget -q --timeout=3 --tries=1 http://asemb-frontend:3000/ -O - && echo "✓ Frontend is reachable" || echo "✗ Frontend is NOT reachable"

echo -e "\n=== Checking container network ==="
docker exec asemb-nginx cat /etc/hosts | grep -E "(asemb-api|asemb-frontend)"