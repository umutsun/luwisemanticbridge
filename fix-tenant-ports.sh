#!/bin/bash
echo "=== Fixing Tenant Frontend Ports ==="

# Stop all frontends first
echo "Stopping all frontend services..."
pm2 stop bookie-frontend emlakai-frontend

# Fix Bookie frontend port (3004)
echo ""
echo "Fixing Bookie frontend (Port 3004)..."
cd /var/www/bookie/frontend
sed -i 's/"next start -p [0-9]*"/"next start -p 3004"/' package.json
sed -i 's/"dev": "next dev -p [0-9]*"/"dev": "next dev -p 3004"/' package.json
echo "Bookie package.json updated:"
grep -E '"(start|dev)"' package.json

# Fix EmlakAI frontend port (3003)
echo ""
echo "Fixing EmlakAI frontend (Port 3003)..."
cd /var/www/emlakai/frontend
sed -i 's/"next start -p [0-9]*"/"next start -p 3003"/' package.json
sed -i 's/"dev": "next dev -p [0-9]*"/"dev": "next dev -p 3003"/' package.json
echo "EmlakAI package.json updated:"
grep -E '"(start|dev)"' package.json

# Delete PM2 apps and re-add them with correct configs
echo ""
echo "Deleting and re-adding PM2 apps..."
pm2 delete bookie-frontend emlakai-frontend 2>/dev/null

# Re-add with ecosystem configs
cd /var/www/bookie
pm2 start ecosystem.config.js --only bookie-frontend

cd /var/www/emlakai
pm2 start ecosystem.config.js --only emlakai-frontend

# Save PM2 config
pm2 save

# Show status
echo ""
echo "=== Final PM2 Status ==="
pm2 list | grep frontend

echo ""
echo "=== Testing Frontend Ports ==="
sleep 5
netstat -tulpn | grep -E ':(3002|3003|3004)' || ss -tulpn | grep -E ':(3002|3003|3004)'

echo ""
echo "✅ Port configuration complete!"
echo "LSEMB: 3002"
echo "EmlakAI: 3003"
echo "Bookie: 3004"