#!/bin/bash

echo "=== 1. Checking container status ==="
docker ps -a | grep asemb

echo -e "\n=== 2. Checking available disk space ==="
df -h

echo -e "\n=== 3. Checking Docker system info ==="
docker system info | grep -E "(Docker Root Dir|Total Memory)"

echo -e "\n=== 4. Checking if containers can be started individually ==="

# First, try starting just postgres
echo "Starting postgres..."
docker-compose -f docker-compose.prod.yml up -d postgres
sleep 5
docker ps | grep postgres

# Then redis
echo -e "\nStarting redis..."
docker-compose -f docker-compose.prod.yml up -d redis
sleep 5
docker ps | grep redis

echo -e "\n=== 5. Checking API build logs ==="
docker-compose -f docker-compose.prod.yml build api 2>&1 | tail -50

echo -e "\n=== 6. Checking if there are any permission issues ==="
ls -la api/
ls -la src/shared/
ls -la config/

echo -e "\n=== 7. Checking Docker version ==="
docker --version
docker-compose --version