#!/bin/bash

echo "=== Disk Cleanup Script ==="
echo "Cleaning up unnecessary files to free up disk space..."

# Check current disk usage
echo -e "\n=== Current Disk Usage ==="
df -h

# Clean Docker (most important)
echo -e "\n=== Cleaning Docker ==="
docker system prune -a -f
docker volume prune -f

# Clean old logs
echo -e "\n=== Cleaning Old Logs ===
find /var/log -type f -name "*.gz" -delete
find /var/log -type f -name "*.old" -delete
find /var/log -type f -size +100M -exec truncate -s 0 {} \;

# Clean package manager cache
echo -e "\n=== Cleaning Package Cache ==="
yum clean all 2>/dev/null || apt-get clean 2>/dev/null

# Clean temporary files
echo -e "\n=== Cleaning Temporary Files ==="
rm -rf /tmp/*
rm -rf /var/tmp/*

# Check disk usage after cleanup
echo -e "\n=== Disk Usage After Cleanup ==="
df -h

# Find large directories (optional)
echo -e "\n=== Large Directories (Top 10) ==="
du -h --max-depth=1 /var/lib/docker 2>/dev/null | sort -hr | head -10
du -h --max-depth=1 /var/log 2>/dev/null | sort -hr | head -10