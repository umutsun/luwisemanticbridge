#!/bin/bash

# Alice Semantic Bridge Docker Health Check

echo "Checking Alice Semantic Bridge services..."
echo "========================================="

# Check containers
echo "Container Status:"
docker-compose -f docker-compose.asb.yml ps

echo ""
echo "Service Health:"

# Check Frontend
if curl -s http://localhost:3000 > /dev/null; then
    echo "✓ Frontend is running"
else
    echo "✗ Frontend is not accessible"
fi

# Check Backend
if curl -s http://localhost:8083/health > /dev/null 2>&1; then
    echo "✓ Backend API is running"
else
    echo "✗ Backend API is not accessible"
fi

# Check PostgreSQL
if docker exec asb-postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✓ PostgreSQL is running"
else
    echo "✗ PostgreSQL is not accessible"
fi

# Check Redis
if docker exec asb-redis redis-cli ping > /dev/null 2>&1; then
    echo "✓ Redis is running"
else
    echo "✗ Redis is not accessible"
fi

echo "========================================="
echo ""

# Show logs if requested
if [ "$1" == "--logs" ]; then
    echo "Recent logs:"
    docker-compose -f docker-compose.asb.yml logs --tail=20
fi
