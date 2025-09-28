#!/bin/bash

echo "Stopping nginx container..."
docker-compose -f docker-compose.prod.yml stop nginx

echo "Letting system nginx handle port 80 temporarily..."
# Check if nginx is installed and running
if systemctl is-active --quiet nginx; then
    sudo systemctl stop nginx
fi

echo "Running certbot for single domain..."
sudo certbot --nginx -d asemb.luwi.dev

echo "Copying certificates to project directory..."
sudo mkdir -p ./nginx/letsencrypt
sudo cp -r /etc/letsencrypt/live/asemb.luwi.dev/* ./nginx/letsencrypt/
sudo chown -R $USER:$USER ./nginx/letsencrypt

echo "Updating docker-compose to use Let's Encrypt certificates..."
# Create a backup
cp docker-compose.prod.yml docker-compose.prod.yml.backup

# Update the SSL volume mounts
sed -i 's|- ./nginx/ssl:/etc/nginx/ssl:ro|- ./nginx/letsencrypt:/etc/nginx/ssl:ro|' docker-compose.prod.yml

echo "Starting containers again..."
docker-compose -f docker-compose.prod.yml up -d

echo "Done! SSL certificates updated."