#!/bin/bash

# ASEM Docker Local Development Startup Script
echo "🚀 Starting ASEM Project in Docker (Local Development)..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.dev.yml --env-file .env.asemb down

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose -f docker-compose.dev.yml --env-file .env.asemb up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service status
echo "🔍 Checking service status..."
docker-compose -f docker-compose.dev.yml --env-file .env.asemb ps

# Display access URLs
echo ""
echo "✅ ASEM Project is running!"
echo ""
echo "📊 Service URLs:"
echo "   Frontend:    http://localhost:3000"
echo "   API:         http://localhost:8083"
echo "   API Docs:    http://localhost:8083/api/v1/docs"
echo "   Database:    localhost:5432"
echo "   Redis:       localhost:6379"
echo "   Adminer:     http://localhost:8080"
echo "   Redis Cmd:   http://localhost:8081"
echo "   n8n:         http://localhost:5678"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs:   docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs -f"
echo "   Stop all:    docker-compose -f docker-compose.dev.yml --env-file .env.asemb down"
echo "   Restart:     docker-compose -f docker-compose.dev.yml --env-file .env.asemb restart"
echo ""
echo "📝 To view logs for a specific service:"
echo "   docker-compose -f docker-compose.dev.yml --env-file .env.asemb logs -f [service-name]"