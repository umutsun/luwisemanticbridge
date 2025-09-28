#!/bin/bash

echo "=== Checking HTTPS response ==="
curl -k -I https://asemb.luwi.dev

echo -e "\n=== Checking nginx error logs ==="
docker logs asemb-nginx 2>&1 | tail -30

echo -e "\n=== Checking nginx access logs ==="
docker exec asemb-nginx tail -20 /var/log/nginx/access.log

echo -e "\n=== Checking API connectivity from nginx ==="
docker exec asemb-nginx wget -q --timeout=5 --tries=1 http://asemb-api:8083/api/v1/health -O - && echo "API is reachable" || echo "API is not reachable"

echo -e "\n=== Checking frontend connectivity from nginx ==="
docker exec asemb-nginx wget -q --timeout=5 --tries=1 http://asemb-frontend:3000/ -O - && echo "Frontend is reachable" || echo "Frontend is not reachable"