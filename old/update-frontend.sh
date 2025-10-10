#!/bin/bash

echo "=== Updating Frontend with Final Fix ==="

# Navigate to project directory
cd /var/www/asemb-luwi-dev/asemb

# Pull latest changes
echo "Pulling latest changes..."
git pull origin main

# Rebuild frontend with correct standalone command
echo "Rebuilding frontend..."
docker-compose -f docker-compose.prod.yml build frontend

# Restart frontend container
echo "Restarting frontend..."
docker-compose -f docker-compose.prod.yml up -d frontend

# Wait a moment for container to start
sleep 5

# Show logs
echo "=== Frontend Logs ==="
docker-compose -f docker-compose.prod.yml logs --tail=20 frontend

echo ""
echo "=== Container Status ==="
docker-compose -f docker-compose.prod.yml ps frontend