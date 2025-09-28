#!/bin/bash

echo "=== Checking what's using port 80 ==="
sudo netstat -tlnp | grep :80

echo -e "\n=== Checking if system nginx is running ==="
sudo systemctl status nginx

echo -e "\n=== Stopping system nginx if running ==="
sudo systemctl stop nginx

echo -e "\n=== Disabling nginx autostart ==="
sudo systemctl disable nginx

echo -e "\n=== Checking port 80 again ==="
sudo netstat -tlnp | grep :80

echo -e "\n=== Starting docker nginx ==="
docker-compose -f docker-compose.prod.yml start nginx