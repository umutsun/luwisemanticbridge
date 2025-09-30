#!/bin/bash

# Development Deployment Script
# Usage: ./scripts/deploy-dev.sh

set -e

echo "🚀 Starting Development Deployment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env.asemb exists
if [ ! -f ".env.asemb" ]; then
    echo "❌ .env.asemb file not found. Please create it from .env.asemb.example"
    exit 1
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose --env-file ./.env.asemb -f docker-compose.dev.yml down

# Build and start services
echo "🔨 Building and starting development services..."
docker compose --env-file ./.env.asemb -f docker-compose.dev.yml up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service status
echo "📊 Checking service status..."
docker compose --env-file ./.env.asemb -f docker-compose.dev.yml ps

# Show logs
echo "📝 Showing recent logs..."
docker compose --env-file ./.env.asemb -f docker-compose.dev.yml logs --tail=20

echo ""
echo "✅ Development deployment complete!"
echo "🌐 Frontend: http://localhost:${FRONTEND_PORT:-3000}"
echo "🔧 API: http://localhost:${API_PORT:-8083}"
echo "📊 Adminer: http://localhost:${ADMINER_PORT:-8080} (if enabled)"
echo "🔄 Redis Commander: http://localhost:${REDIS_COMMANDER_PORT:-8081} (if enabled)"
echo "🔧 n8n: http://localhost:${N8N_PORT:-5678} (if enabled)"
echo ""
echo "📋 To view logs: docker compose --env-file ./.env.asemb -f docker-compose.dev.yml logs -f"
echo "🛑 To stop: docker compose --env-file ./.env.asemb -f docker-compose.dev.yml down"