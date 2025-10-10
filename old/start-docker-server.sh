#!/bin/bash

# ASEM Docker Server Production Startup Script
echo "🚀 Starting ASEM Project in Docker (Server Production)..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.asemb down

# Prune old images and containers
echo "🧹 Cleaning up old Docker resources..."
docker system prune -f

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose -f docker-compose.prod.yml --env-file .env.asemb up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service status
echo "🔍 Checking service status..."
docker-compose -f docker-compose.prod.yml --env-file .env.asemb ps

# Run health checks
echo "🏥 Running health checks..."
sleep 10

# Check if API is responding
if curl -f http://localhost:8083/api/v1/health > /dev/null 2>&1; then
    echo "✅ API is healthy"
else
    echo "⚠️  API health check failed"
fi

# Check if Frontend is responding
if curl -f http://localhost:3000/ > /dev/null 2>&1; then
    echo "✅ Frontend is healthy"
else
    echo "⚠️  Frontend health check failed"
fi

# Display access URLs
echo ""
echo "✅ ASEM Project is running in Production mode!"
echo ""
echo "📊 Service URLs:"
echo "   Frontend:    https://asemb.luwi.dev"
echo "   API:         https://asemb.luwi.dev/api"
echo "   n8n:         https://n8n.luwi.dev"
echo "   Monitoring:  http://localhost:3030 (Grafana)"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs:   docker-compose -f docker-compose.prod.yml --env-file .env.asemb logs -f"
echo "   Stop all:    docker-compose -f docker-compose.prod.yml --env-file .env.asemb down"
echo "   Restart:     docker-compose -f docker-compose.prod.yml --env-file .env.asemb restart"
echo "   Update:      docker-compose -f docker-compose.prod.yml --env-file .env.asemb pull && docker-compose -f docker-compose.prod.yml --env-file .env.asemb up --build -d"
echo ""
echo "📝 To view logs for a specific service:"
echo "   docker-compose -f docker-compose.prod.yml --env-file .env.asemb logs -f [service-name]"
echo ""
echo "🔄 To restart a specific service:"
echo "   docker-compose -f docker-compose.prod.yml --env-file .env.asemb restart [service-name]"