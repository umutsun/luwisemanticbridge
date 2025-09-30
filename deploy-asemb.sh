#!/bin/bash

# ASEMB Deployment Script
# Usage: ./deploy-asemb.sh [dev|prod]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_NAME="asemb"

echo "🚀 Deploying Alice Semantic Bridge to $ENVIRONMENT environment..."

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.asemb.production down

# Build and start services
echo "🏗️ Building and starting services..."
if [ "$ENVIRONMENT" = "prod" ]; then
    docker-compose -f docker-compose.prod.yml --env-file .env.asemb.production up --build -d
else
    docker-compose -f docker-compose.dev.yml --env-file .env.asemb up --build -d
fi

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service status
echo "📊 Checking service status..."
docker-compose -f docker-compose.prod.yml --env-file .env.asemb.production ps

# Run health checks
echo "🏥 Running health checks..."
curl -f http://localhost:8088/health || echo "⚠️ Health check failed"

echo "✅ Deployment completed!"
echo ""
echo "🌐 Access URLs:"
echo "   - Frontend: https://asemb.luwi.dev"
echo "   - API: https://asemb.luwi.dev/api"
echo "   - Health: https://asemb.luwi.dev/health"
echo ""
echo "📝 Logs: docker-compose -f docker-compose.prod.yml --env-file .env.asemb.production logs -f"
echo "🛑 Stop: docker-compose -f docker-compose.prod.yml --env-file .env.asemb.production down"