#!/bin/bash

echo "=== Docker Cleanup Script ==="
echo "Cleaning up unused containers, images, and volumes..."

# Stop all running containers
echo "Stopping all containers..."
docker-compose -f docker-compose.prod.yml down

# Remove all stopped containers
echo "Removing stopped containers..."
docker container prune -f

# Remove all unused images (not just dangling)
echo "Removing unused images..."
docker image prune -a -f

# Remove all unused volumes
echo "Removing unused volumes..."
docker volume prune -f

# Remove all unused networks
echo "Removing unused networks..."
docker network prune -f

# Show disk usage
echo -e "\n=== Docker Disk Usage After Cleanup ==="
docker system df

echo -e "\n=== Active Containers ==="
docker ps -a

echo -e "\n=== Active Images ==="
docker images | head -20