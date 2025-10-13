#!/bin/bash

# Luwi Semantic Bridge - Frontend Rebuild Script
# Production server için frontend temizleme ve yeniden build

echo "🚀 Starting frontend rebuild for production..."

echo "📁 Current directory: $(pwd)"

# PM2 process'lerini durdur
echo "⏹️ Stopping PM2 processes..."
pm2 stop lsemb-frontend 2>/dev/null || echo "lsemb-frontend not running"
pm2 stop lsemb-backend 2>/dev/null || echo "lsemb-backend not running"

# Frontend klasörüne git
cd frontend

echo "🧹 Cleaning frontend build files..."
rm -rf .next
rm -rf node_modules/.cache
rm -rf out

echo "📦 Installing dependencies..."
npm install

echo "🔍 Fixing any audit issues..."
npm audit fix || echo "No audit issues found"

echo "🏗️ Building for production..."
npm run build

# Build kontrol
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed!"
    exit 1
fi

echo "🔙 Returning to root directory..."
cd ..

echo "🚀 Starting PM2 processes..."
# Backend'i başlat
pm2 start lsemb-backend

# Frontend'i başlat
pm2 start lsemb-frontend

echo "💾 Saving PM2 configuration..."
pm2 save

echo "📊 PM2 Status:"
pm2 status

echo "📋 PM2 Logs (last 20 lines):"
echo "--- Backend Logs ---"
pm2 logs lsemb-backend --lines 10 --nostream
echo "--- Frontend Logs ---"
pm2 logs lsemb-frontend --lines 10 --nostream

echo "✅ Frontend rebuild completed!"
echo "🌐 Visit: https://lsemb.luwi.dev"