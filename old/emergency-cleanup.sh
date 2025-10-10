#!/bin/bash

echo "=== EMERGENCY DISK CLEANUP ==="

# Stop all containers to free space
echo "Stopping all Docker containers..."
docker-compose -f docker-compose.prod.yml down

# Clean Docker aggressively
echo "Cleaning Docker..."
docker system prune -a -f
docker volume prune -f
docker builder prune -a -f

# Remove all asemb related images
echo "Removing asemb images..."
docker images | grep asemb | awk '{print $3}' | xargs docker rmi -f 2>/dev/null || true

# Clean system logs
echo "Cleaning system logs..."
> /var/log/messages
> /var/log/secure
journalctl --vacuum-size=100M

# Clean package cache
echo "Cleaning package cache..."
yum clean all 2>/dev/null || true

# Find and remove large log files
echo "Finding and removing large log files..."
find /var/log -type f -name "*.log" -exec truncate -s 0 {} \;
find /var/log -type f -name "*.gz" -delete

# Check disk space
echo -e "\n=== Disk Usage After Cleanup ==="
df -h

echo -e "\n=== Docker Disk Usage ==="
docker system df