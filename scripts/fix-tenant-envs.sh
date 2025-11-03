#!/bin/bash
#
# Fix Tenant Environment Files
# Updates .env files for Bookie and EmlakAI tenants with correct DATABASE_URL, PORT, and CORS settings
#

echo "=== Fixing Tenant .env Files ==="

# Bookie Backend .env
echo ""
echo "1. Fixing /var/www/bookie/backend/.env"
cat > /var/www/bookie/backend/.env.new << 'EOF'
# Bookie Backend Configuration
POSTGRES_HOST=91.99.229.96
POSTGRES_PORT=5432
POSTGRES_DB=bookie_lsemb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Semsiye!22
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/bookie_lsemb

# Application
PORT=8085
NODE_ENV=production

# Redis - DB 3 for Bookie (LSEMB uses 2, EmlakAI uses 1)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=3
REDIS_PASSWORD=Semsiye!22

# CORS
CORS_ORIGIN=https://bookie.luwi.dev
CLIENT_URL=https://bookie.luwi.dev

# API URLs
NEXT_PUBLIC_API_URL=https://bookie.luwi.dev
BACKEND_PORT=8085
FRONTEND_PORT=3004
PYTHON_SERVICE_PORT=8003
EOF

mv /var/www/bookie/backend/.env.new /var/www/bookie/backend/.env
echo "✅ Bookie backend .env fixed"

# EmlakAI Backend .env
echo ""
echo "2. Fixing /var/www/emlakai/backend/.env"
cat > /var/www/emlakai/backend/.env.new << 'EOF'
# EmlakAI Backend Configuration
POSTGRES_HOST=91.99.229.96
POSTGRES_PORT=5432
POSTGRES_DB=emlakai_lsemb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Semsiye!22
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/emlakai_lsemb

# Application
PORT=8084
NODE_ENV=production

# Redis - DB 1 for EmlakAI (LSEMB uses 2, Bookie uses 3)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=1
REDIS_PASSWORD=Semsiye!22

# CORS
CORS_ORIGIN=https://emlakai.luwi.dev
CLIENT_URL=https://emlakai.luwi.dev

# API URLs
NEXT_PUBLIC_API_URL=https://emlakai.luwi.dev
BACKEND_PORT=8084
FRONTEND_PORT=3003
PYTHON_SERVICE_PORT=8002
EOF

mv /var/www/emlakai/backend/.env.new /var/www/emlakai/backend/.env
echo "✅ EmlakAI backend .env fixed"

echo ""
echo "3. Restarting backends with --update-env"
pm2 restart bookie-backend emlakai-backend --update-env
sleep 3

echo ""
echo "4. Checking backend status"
pm2 list | grep backend

echo ""
echo "✅ All tenant .env files fixed and backends restarted!"
echo ""
echo "Test endpoints:"
echo "  - Bookie:  curl http://localhost:8085/api/v2/health"
echo "  - EmlakAI: curl http://localhost:8084/api/v2/health"
