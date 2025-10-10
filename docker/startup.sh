#!/bin/sh
set -e

echo "========================================="
echo "Luwi Semantic Bridge Starting..."
echo "========================================="

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until nc -z postgres 5432; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "PostgreSQL is ready!"

# Wait for Redis
echo "Waiting for Redis..."
until nc -z redis 6379; do
  echo "Redis is unavailable - sleeping"
  sleep 2
done
echo "Redis is ready!"

# Start Backend API
echo "Starting Backend API on port 8083..."
cd /app/backend
NODE_ENV=${NODE_ENV:-production} npm start &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 5

# Start Frontend
echo "Starting Frontend on port 3000..."
cd /app/frontend
NODE_ENV=${NODE_ENV:-production} npm start &
FRONTEND_PID=$!

echo "========================================="
echo "Services started successfully!"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8083"
echo "========================================="

# Function to handle shutdown
shutdown() {
    echo "Shutting down services..."
    kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID"
    echo "Services stopped."
    exit 0
}

# Set up signal handlers
trap shutdown SIGTERM SIGINT

# Keep the script running
wait
