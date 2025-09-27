#!/bin/bash

# Development environment startup script

echo "🚀 Starting ASEM Development Environment..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please update .env file with your API keys"
fi

# Stop existing containers
echo "Stopping existing containers..."
docker-compose -f docker-compose.dev.yml down

# Start core services
echo "Starting core services (PostgreSQL, Redis, API)..."
docker-compose -f docker-compose.dev.yml up -d postgres redis api

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 10

# Start frontend
echo "Starting frontend..."
docker-compose -f docker-compose.dev.yml up -d frontend

echo ""
echo "✅ Development environment is ready!"
echo ""
echo "📊 API: http://localhost:8083"
echo "🌐 Frontend: http://localhost:3000"
echo "🗄️  Database: localhost:5432"
echo "📦 Redis: localhost:6379"
echo ""
echo "🔧 Development tools:"
echo "   Adminer: http://localhost:8080 (database UI)"
echo ""
echo "To start additional services:"
echo "   n8n: docker-compose -f docker-compose.dev.yml --profile with-n8n up -d"
echo "   Nginx: docker-compose -f docker-compose.dev.yml --profile with-nginx up -d"
echo ""
echo "To view logs:"
echo "   docker-compose -f docker-compose.dev.yml logs -f [service-name]"
echo ""
echo "To stop:"
echo "   docker-compose -f docker-compose.dev.yml down"