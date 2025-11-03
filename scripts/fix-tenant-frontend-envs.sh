#!/bin/bash
#
# Fix Tenant Frontend Environment Files
# Creates proper .env.local files for Bookie and EmlakAI frontends with correct API URLs
# Then rebuilds each frontend with tenant-specific configuration
#

echo "=== Fixing Tenant Frontend .env Files ==="

# Bookie Frontend .env.local
echo ""
echo "1. Creating /var/www/bookie/frontend/.env.local"
cat > /var/www/bookie/frontend/.env.local << 'EOF'
# Bookie Frontend Configuration
NEXT_PUBLIC_API_URL=https://bookie.luwi.dev
NEXT_PUBLIC_API_PORT=8085
NEXT_PUBLIC_API_HOST=bookie.luwi.dev

# Frontend Port
NEXT_PUBLIC_PORT=3004

# WebSocket Configuration
NEXT_PUBLIC_WEBSOCKET_URL=wss://bookie.luwi.dev
NEXT_PUBLIC_WEBSOCKET_PATH=/socket.io
EOF

echo "✅ Bookie frontend .env.local created"

# EmlakAI Frontend .env.local
echo ""
echo "2. Creating /var/www/emlakai/frontend/.env.local"
cat > /var/www/emlakai/frontend/.env.local << 'EOF'
# EmlakAI Frontend Configuration
NEXT_PUBLIC_API_URL=https://emlakai.luwi.dev
NEXT_PUBLIC_API_PORT=8084
NEXT_PUBLIC_API_HOST=emlakai.luwi.dev

# Frontend Port
NEXT_PUBLIC_PORT=3003

# WebSocket Configuration
NEXT_PUBLIC_WEBSOCKET_URL=wss://emlakai.luwi.dev
NEXT_PUBLIC_WEBSOCKET_PATH=/socket.io
EOF

echo "✅ EmlakAI frontend .env.local created"

echo ""
echo "3. Stopping frontends before rebuilding"
pm2 stop bookie-frontend emlakai-frontend

echo ""
echo "4. Clearing .next caches"
rm -rf /var/www/bookie/frontend/.next
rm -rf /var/www/emlakai/frontend/.next
echo "✅ Frontend caches cleared"

echo ""
echo "5. Building Bookie frontend with new environment"
cd /var/www/bookie/frontend && npm run build 2>&1 | tail -10

echo ""
echo "6. Building EmlakAI frontend with new environment"
cd /var/www/emlakai/frontend && npm run build 2>&1 | tail -10

echo ""
echo "7. Restarting frontends"
pm2 restart bookie-frontend emlakai-frontend
sleep 3

echo ""
echo "8. Checking frontend status"
pm2 list | grep frontend

echo ""
echo "✅ All tenant frontend .env files fixed and frontends rebuilt!"
echo ""
echo "Test URLs:"
echo "  - Bookie:  https://bookie.luwi.dev"
echo "  - EmlakAI: https://emlakai.luwi.dev"
echo ""
echo "Each frontend should now make API requests to its own backend:"
echo "  - Bookie → https://bookie.luwi.dev/api/v2/*"
echo "  - EmlakAI → https://emlakai.luwi.dev/api/v2/*"
