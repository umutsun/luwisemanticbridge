#!/bin/bash

echo "========================================="
echo "Alice Semantic Bridge Docker Setup"
echo "========================================="

# Ortam değişkenlerini yükle
if [ -f ".env.docker" ]; then
    echo "Loading environment from .env.docker..."
    cp .env.docker .env
else
    echo ".env.docker not found! Creating from example..."
    cp .env.example .env.docker
    echo "Please edit .env.docker with your configuration"
    exit 1
fi

# Docker Compose ile başlat
echo "Starting services..."
docker-compose -f docker-compose.asb.yml --env-file .env.docker up -d --build

# Servislerin başlamasını bekle
echo "Waiting for services to start..."
sleep 10

# Servislerin durumunu kontrol et
echo ""
echo "Checking service status..."
docker-compose -f docker-compose.asb.yml ps

echo ""
echo "========================================="
echo "Services should be available at:"
echo "- Frontend: http://localhost:3000"
echo "- Backend API: http://localhost:8083" 
echo "- PostgreSQL: localhost:5433"
echo "- Redis: localhost:6379"
echo "========================================="
echo ""
echo "Use 'docker-compose -f docker-compose.asb.yml logs -f' to view logs"
echo "Use 'docker-compose -f docker-compose.asb.yml down' to stop services"
echo ""
