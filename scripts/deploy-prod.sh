#!/bin/bash

# Production Deployment Script
# Usage: ./scripts/deploy-prod.sh

set -e

echo "🚀 Starting Production Deployment..."

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

# Check if SSL certificates exist
if [ ! -d "ssl" ]; then
    echo "⚠️  SSL directory not found. Creating..."
    mkdir -p ssl
    echo "📝 Please add your SSL certificates to the ssl/ directory:"
    echo "   - ssl/cert.pem"
    echo "   - ssl/key.pem"
    echo "   - ssl/chain.pem (optional)"
    exit 1
fi

# Create logs directory
mkdir -p logs/nginx

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose --env-file ./.env.asemb -f docker-compose.prod.yml down

# Pull latest images
echo "📥 Pulling latest images..."
docker compose --env-file ./.env.asemb -f docker-compose.prod.yml pull

# Build and start services
echo "🔨 Building and starting production services..."
docker compose --env-file ./.env.asemb -f docker-compose.prod.yml up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 30

# Check service status
echo "📊 Checking service status..."
docker compose --env-file ./.env.asemb -f docker-compose.prod.yml ps

# Show logs
echo "📝 Showing recent logs..."
docker compose --env-file ./.env.asemb -f docker-compose.prod.yml logs --tail=20

echo ""
echo "✅ Production deployment complete!"
echo "🌐 Application: https://${DOMAIN:-localhost}"
echo "🔧 API: https://${DOMAIN:-localhost}/api"
echo "📊 Grafana: https://${DOMAIN:-localhost}:3030 (if enabled)"
echo "🔧 n8n: https://${DOMAIN:-localhost}:${N8N_PORT:-5678} (if enabled)"
echo ""
echo "📋 To view logs: docker compose --env-file ./.env.asemb -f docker-compose.prod.yml logs -f"
echo "🛑 To stop: docker compose --env-file ./.env.asemb -f docker-compose.prod.yml down"
echo "🔄 To restart: docker compose --env-file ./.env.asemb -f docker-compose.prod.yml restart"