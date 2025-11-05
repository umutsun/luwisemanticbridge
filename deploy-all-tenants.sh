#!/bin/bash
# =========================================================
# LSEMB Multi-Tenant Complete Deployment Script
# This script deploys all tenants with proper configuration
# =========================================================

echo "=========================================================="
echo "    LSEMB MULTI-TENANT DEPLOYMENT - COMPLETE SETUP"
echo "=========================================================="
echo ""

# Function to create .env.lsemb files for each tenant
create_tenant_env() {
    local tenant=$1
    local app_name=$2
    local backend_port=$3
    local frontend_port=$4
    local python_port=$5
    local db_name=$6
    local redis_db=$7
    local domain=$8

    cat > /var/www/$tenant/.env.$tenant <<EOF
# $app_name Environment Configuration (.env.$tenant)
# Tenant-specific configuration file

# Application
APP_NAME=$app_name
TENANT_ID=$tenant
NODE_ENV=production

# Ports
PORT=$backend_port
FRONTEND_PORT=$frontend_port
PYTHON_SERVICE_PORT=$python_port

# Database
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/$db_name

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=Semsiye!22
REDIS_DB=$redis_db

# Python Service
PYTHON_SERVICE_URL=http://localhost:$python_port

# Security
JWT_SECRET=$tenant-jwt-secret-2024
INTERNAL_API_KEY=$tenant-internal-key-2024

# CORS
CORS_ORIGIN=https://$domain

# Domain
PUBLIC_URL=https://$domain
API_URL=https://$domain
EOF

    echo "✅ Created .env.$tenant"
}

echo "=== Step 1: Creating tenant configuration files ==="
echo ""

# Create LSEMB configuration
create_tenant_env "lsemb" "LSEMB" "8083" "3002" "8002" "lsemb" "2" "lsemb.luwi.dev"

# Create EmlakAI configuration
create_tenant_env "emlakai" "EmlakAI" "8084" "3003" "8001" "emlakai_lsemb" "1" "emlakai.luwi.dev"

# Create Bookie configuration
create_tenant_env "bookie" "Bookie" "8085" "3004" "8003" "bookie_lsemb" "3" "bookie.luwi.dev"

echo ""
echo "=== Step 2: Creating Luwi.dev static site configuration ==="

# Create luwi.dev directory if not exists
if [ ! -d "/var/www/luwi-dev" ]; then
    mkdir -p /var/www/luwi-dev
    echo "Created /var/www/luwi-dev directory"
fi

# Create luwi.dev ecosystem config
cat > /var/www/luwi-dev/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'luwi-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/luwi-dev',
      env: {
        PORT: 3000,
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

echo "✅ Created luwi.dev ecosystem config"

echo ""
echo "=== Step 3: Pulling latest code from GitHub ==="

# Pull LSEMB
echo "Pulling LSEMB..."
cd /var/www/lsemb && git pull origin main

# Pull EmlakAI
echo "Pulling EmlakAI..."
cd /var/www/emlakai && git pull origin main

# Pull Bookie
echo "Pulling Bookie..."
cd /var/www/bookie && git pull origin main

# Pull Luwi.dev (if it has a repo)
if [ -d "/var/www/luwi-dev/.git" ]; then
    echo "Pulling Luwi.dev..."
    cd /var/www/luwi-dev && git pull origin main
fi

echo ""
echo "=== Step 4: Installing dependencies and building ==="

# Function to build tenant
build_tenant() {
    local tenant=$1
    local name=$2

    echo ""
    echo "Building $name..."

    cd /var/www/$tenant

    # Build backend if exists
    if [ -d "backend" ]; then
        echo "  Building backend..."
        cd backend
        npm install
        npm run build 2>&1 | tail -5
        cd ..
    fi

    # Build frontend
    if [ -d "frontend" ]; then
        echo "  Building frontend..."
        cd frontend
        npm install
        npm run build 2>&1 | tail -10
        cd ..
    fi

    echo "✅ $name built successfully"
}

# Build all tenants
build_tenant "lsemb" "LSEMB"
build_tenant "emlakai" "EmlakAI"
build_tenant "bookie" "Bookie"

# Build Luwi.dev
if [ -d "/var/www/luwi-dev" ]; then
    echo ""
    echo "Building Luwi.dev..."
    cd /var/www/luwi-dev
    npm install
    npm run build 2>&1 | tail -10
    echo "✅ Luwi.dev built successfully"
fi

echo ""
echo "=== Step 5: Creating PM2 ecosystem configs ==="

# LSEMB ecosystem config
cat > /var/www/lsemb/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'lsemb-backend',
      script: 'node',
      args: 'dist/server.js',
      cwd: '/var/www/lsemb/backend',
      env: {
        PORT: 8083,
        NODE_ENV: 'production'
      },
      env_file: '/var/www/lsemb/.env.lsemb'
    },
    {
      name: 'lsemb-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/lsemb/frontend',
      env: {
        PORT: 3002,
        NODE_ENV: 'production'
      }
    },
    {
      name: 'lsemb-python',
      script: 'python',
      args: 'main.py',
      cwd: '/var/www/lsemb/backend/python-services',
      env: {
        PORT: 8002,
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      }
    }
  ]
};
EOF

# EmlakAI ecosystem config
cat > /var/www/emlakai/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'emlakai-backend',
      script: 'node',
      args: 'dist/server.js',
      cwd: '/var/www/emlakai/backend',
      env: {
        PORT: 8084,
        NODE_ENV: 'production'
      },
      env_file: '/var/www/emlakai/.env.emlakai'
    },
    {
      name: 'emlakai-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/emlakai/frontend',
      env: {
        PORT: 3003,
        NODE_ENV: 'production'
      }
    },
    {
      name: 'emlakai-python',
      script: 'python',
      args: 'main.py',
      cwd: '/var/www/emlakai/backend/python-services',
      env: {
        PORT: 8001,
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      }
    }
  ]
};
EOF

# Bookie ecosystem config
cat > /var/www/bookie/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'bookie-backend',
      script: 'node',
      args: 'dist/server.js',
      cwd: '/var/www/bookie/backend',
      env: {
        PORT: 8085,
        NODE_ENV: 'production'
      },
      env_file: '/var/www/bookie/.env.bookie'
    },
    {
      name: 'bookie-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/bookie/frontend',
      env: {
        PORT: 3004,
        NODE_ENV: 'production'
      }
    },
    {
      name: 'bookie-python',
      script: 'python',
      args: 'main.py',
      cwd: '/var/www/bookie/backend/python-services',
      env: {
        PORT: 8003,
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      }
    }
  ]
};
EOF

echo "✅ Created PM2 ecosystem configs"

echo ""
echo "=== Step 6: Restarting PM2 services ==="

# Stop all existing services
pm2 stop all

# Delete existing services
pm2 delete all

# Start LSEMB services
cd /var/www/lsemb
pm2 start ecosystem.config.js

# Start EmlakAI services
cd /var/www/emlakai
pm2 start ecosystem.config.js

# Start Bookie services
cd /var/www/bookie
pm2 start ecosystem.config.js

# Start Luwi.dev
cd /var/www/luwi-dev
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup systemd -u root --hp /root

echo ""
echo "=== Step 7: Testing all services ==="
sleep 5

echo ""
echo "LSEMB (Port 8083):"
curl -s http://localhost:8083/api/v2/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d.get(\"status\",\"error\")}')" 2>/dev/null || echo "  Not responding"

echo ""
echo "EmlakAI (Port 8084):"
curl -s http://localhost:8084/api/v2/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d.get(\"status\",\"error\")}')" 2>/dev/null || echo "  Not responding"

echo ""
echo "Bookie (Port 8085):"
curl -s http://localhost:8085/api/v2/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d.get(\"status\",\"error\")}')" 2>/dev/null || echo "  Not responding"

echo ""
echo "Luwi.dev (Port 3000):"
curl -s http://localhost:3000 > /dev/null && echo "  Status: responding" || echo "  Not responding"

echo ""
echo "=========================================================="
echo "              DEPLOYMENT COMPLETE!"
echo "=========================================================="
echo ""
echo "Services URLs:"
echo "  - LSEMB:    https://lsemb.luwi.dev"
echo "  - EmlakAI:  https://emlakai.luwi.dev"
echo "  - Bookie:   https://bookie.luwi.dev"
echo "  - Luwi.dev: https://luwi.dev"
echo ""
echo "PM2 Status:"
pm2 list
echo ""
echo "To view logs: pm2 logs [service-name]"
echo "To monitor: pm2 monit"
echo ""
echo "=========================================================="