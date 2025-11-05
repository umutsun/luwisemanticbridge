#!/bin/bash
# Multi-tenant deployment script

echo "=== Multi-Tenant Configuration Deployment ==="

# Configure each tenant
for tenant in lsemb emlakai bookie; do
    echo ""
    echo "Configuring $tenant..."

    cd /var/www/$tenant

    # Pull latest code
    git pull origin main

    # Build backend if exists
    if [ -d "backend" ]; then
        cd backend
        npm install
        npm run build
        cd ..
    fi

    # Build frontend
    if [ -d "frontend" ]; then
        cd frontend
        npm install
        npm run build
        cd ..
    fi

    # Restart PM2 services
    pm2 restart $tenant-backend $tenant-frontend $tenant-python
done

# Configure luwi.dev
echo ""
echo "Configuring luwi.dev..."
cd /var/www/luwi-dev
git pull origin main
cd frontend
npm install
npm run build
pm2 restart luwi-frontend

echo ""
echo "=== All tenants configured and restarted ==="
pm2 list
