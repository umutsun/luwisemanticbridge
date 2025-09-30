#!/bin/bash

echo "🚀 Starting Alice Semantic Bridge with Docker databases..."

# Start Docker databases
echo "📊 Starting PostgreSQL and Redis containers..."
docker-compose -f docker-compose.db-only.yml up -d

# Wait for databases to be healthy
echo "⏳ Waiting for databases to be ready..."
sleep 5

# Check database status
echo "🔍 Checking database status..."
docker-compose -f docker-compose.db-only.yml ps

echo ""
echo "✅ Docker databases are running!"
echo ""
echo "📋 Connection Details:"
echo "   PostgreSQL: localhost:5433"
echo "   Redis: localhost:6380"
echo ""
echo "🚀 To start the application:"
echo "   1. Copy environment variables: cp .env.docker .env"
echo "   2. Start API: cd api && npm run dev"
echo "   3. Start Frontend: cd frontend && npm run dev"
echo ""
echo "🛑 To stop databases: docker-compose -f docker-compose.db-only.yml down"