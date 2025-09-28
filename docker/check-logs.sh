#!/bin/bash
echo "=== Checking nginx logs ==="
docker logs asemb-nginx --tail 50

echo -e "\n=== Checking api logs ==="
docker logs asemb-api --tail 50

echo -e "\n=== Checking frontend logs ==="
docker logs asemb-frontend --tail 50

echo -e "\n=== Checking container status ==="
docker ps -a | grep -E "(asemb-nginx|asemb-api|asemb-frontend)"

echo -e "\n=== Checking nginx configuration ==="
docker exec asemb-nginx nginx -T