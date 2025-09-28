#!/bin/bash

echo "Stopping system nginx..."
sudo systemctl stop nginx

echo "Disabling nginx from starting on boot..."
sudo systemctl disable nginx

echo "Checking if nginx stopped..."
sudo systemctl status nginx

echo -e "\nStarting docker nginx container..."
docker-compose -f docker-compose.prod.yml start nginx

echo -e "\nChecking docker container status..."
docker ps | grep nginx