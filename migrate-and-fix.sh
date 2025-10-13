#!/bin/bash

# Luwi Semantic Bridge - Complete Migration Script
# Production server için proje taşıma ve düzeltmeler

echo "🚀 Starting complete migration and fix..."

echo "📁 Current directory: $(pwd)"

# PM2 process'lerini durdur
echo "⏹️ Stopping all PM2 processes..."
pm2 stop all 2>/dev/null || echo "No PM2 processes running"

# Proje taşıma
echo "📦 Moving projects to correct directories..."

# Eğer hala eski dizindeyse taşı
if [ -d "/var/www/asemb-luwi-dev" ]; then
    echo "Moving /var/www/asemb-luwi-dev -> /var/www/lsemb"
    mv /var/www/asemb-luwi-dev /var/www/lsemb
fi

# Doğru dizine git
cd /var/www/lsemb

echo "🗂️ Current directory contents:"
ls -la

echo "🗑️ Removing problematic dashboard prompts page..."
rm -f frontend/src/app/dashboard/prompts/page.tsx

echo "🧹 Cleaning frontend build files..."
cd frontend
rm -rf .next
rm -rf node_modules/.cache
rm -rf out

echo "📦 Installing dependencies..."
npm install

echo "🏗️ Building for production..."
npm run build

# Build kontrol
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed! Checking errors..."
    exit 1
fi

echo "🔙 Returning to root directory..."
cd ..

echo "🔧 Updating PM2 configuration..."
# PM2'deki eski config'leri temizle
pm2 delete all 2>/dev/null || echo "No PM2 processes to delete"

# Yeni ecosystem config oluştur
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'lsemb-backend',
      script: 'src/server.ts',
      cwd: './backend',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      env: {
        NODE_ENV: 'production',
        PORT: 8083
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true
    },
    {
      name: 'lsemb-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: './frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true
    }
  ]
};
EOF

# Log dizinleri oluştur
mkdir -p logs

echo "🚀 Starting PM2 processes with new config..."
pm2 start ecosystem.config.js

echo "💾 Saving PM2 configuration..."
pm2 save

echo "📊 PM2 Status:"
pm2 status

echo "📋 PM2 Logs (last 10 lines):"
pm2 logs --lines 10

echo "🌐 Nginx configuration reminder:"
echo "Please update nginx config files:"
echo "- lsemb.luwi.dev -> /var/www/lsemb/frontend"
echo "- luwi.dev -> /var/www/luwi-dev"

echo "✅ Migration completed!"
echo "🌐 Visit: https://lsemb.luwi.dev"