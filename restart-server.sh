#!/bin/bash

# Restart server with updated configuration

echo "🔄 Restarting Alice Semantic Bridge server..."

# Stop existing processes
echo "🛑 Stopping existing processes..."
pm2 stop all
pm2 delete all
pm2 kill

# Install any missing dependencies
echo "📦 Installing dependencies..."
cd api && npm install
cd ../frontend && npm install
cd ..

# Start services with PM2
echo "🚀 Starting services..."
pm2 start ecosystem.config.js

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Show status
echo "📊 Service status:"
pm2 status

echo "✅ Server restarted successfully!"
echo "🌐 Frontend: http://localhost:3002"
echo "🔧 API: http://localhost:8083"
echo "📝 Logs: pm2 logs"