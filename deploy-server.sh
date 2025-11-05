#!/bin/bash
echo "============================================"
echo "LSEMB Python Services Full Deployment Script"
echo "============================================"

# Function to handle errors
handle_error() {
    echo "[ERROR] $1"
    exit 1
}

# 1. Update all projects from GitHub
echo ""
echo "[1/7] Pulling latest code from GitHub..."
cd /var/www/lsemb && git pull origin main || handle_error "Failed to pull LSEMB"
cd /var/www/emlakai && git pull origin main || handle_error "Failed to pull EmlakAI"
cd /var/www/bookie && git pull origin main || handle_error "Failed to pull Bookie"

# 2. Fix Python service configurations
echo ""
echo "[2/7] Configuring Python services..."

# LSEMB Python (Port 8002)
echo ">> Configuring LSEMB Python (Port 8002)..."
cd /var/www/lsemb/backend/python-services

# Update main.py to use PORT environment variable
sed -i 's/PYTHON_API_PORT/PORT/g' main.py

# Create .env file
cat > .env <<'EOF'
PORT=8002
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=Semsiye!22
REDIS_DB=2
ENVIRONMENT=production
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3002,http://localhost:8083,https://lsemb.luwi.dev
INTERNAL_API_KEY=lsemb-internal-key-2024
# OPENAI_API_KEY should be set as environment variable, not hardcoded
EOF

# EmlakAI Python (Port 8001 - already running)
echo ">> EmlakAI Python already configured on port 8001"

# Bookie Python (Port 8003)
echo ">> Configuring Bookie Python (Port 8003)..."
cd /var/www/bookie/backend/python-services
if [ ! -f ".env" ]; then
cat > .env <<'EOF'
PORT=8003
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/bookie_lsemb
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=Semsiye!22
REDIS_DB=3
ENVIRONMENT=production
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3004,http://localhost:8085,https://bookie.luwi.dev
INTERNAL_API_KEY=bookie-internal-key-2024
EOF
fi

# 3. Build TypeScript (with error suppression)
echo ""
echo "[3/7] Building TypeScript for all projects..."
cd /var/www/lsemb/backend
npx tsc --noEmitOnError false 2>&1 | tail -10 || true

cd /var/www/emlakai/backend
npx tsc --noEmitOnError false 2>&1 | tail -10 || true

cd /var/www/bookie/backend
npx tsc --noEmitOnError false 2>&1 | tail -10 || true

# 4. Update backend .env files
echo ""
echo "[4/7] Updating backend environment files..."

# LSEMB Backend
cd /var/www/lsemb/backend
if [ ! -f ".env" ]; then
cat > .env <<'EOF'
NODE_ENV=production
PORT=8083
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=Semsiye!22
REDIS_DB=2
PYTHON_SERVICE_URL=http://localhost:8002
INTERNAL_API_KEY=lsemb-internal-key-2024
JWT_SECRET=lsemb-jwt-secret-2024
CORS_ORIGIN=https://lsemb.luwi.dev
EOF
fi

# 5. Restart all PM2 services
echo ""
echo "[5/7] Restarting PM2 services..."
pm2 stop lsemb-python bookie-python 2>/dev/null
pm2 restart lsemb-backend emlakai-backend bookie-backend
pm2 restart lsemb-python bookie-python 2>/dev/null

# Wait for services to stabilize
sleep 5

# 6. Test services
echo ""
echo "[6/7] Testing services..."
echo ""
echo ">> LSEMB Backend (8083):"
curl -s http://localhost:8083/api/v2/health | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Status: {data.get("status", "error")}');" 2>/dev/null || echo "Failed"

echo ""
echo ">> EmlakAI Backend (8084):"
curl -s http://localhost:8084/api/v2/health | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Status: {data.get("status", "error")}');" 2>/dev/null || echo "Failed"

echo ""
echo ">> Bookie Backend (8085):"
curl -s http://localhost:8085/api/v2/health | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Status: {data.get("status", "error")}');" 2>/dev/null || echo "Failed"

echo ""
echo ">> LSEMB Python (8002):"
curl -s http://localhost:8002/health | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Status: {data.get("status", "error")}');" 2>/dev/null || echo "Not yet running"

# 7. Show final status
echo ""
echo "[7/7] Final status check..."
pm2 list

echo ""
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
echo "Services Status:"
echo "- LSEMB: https://lsemb.luwi.dev (Backend: 8083, Python: 8002)"
echo "- EmlakAI: https://emlakai.luwi.dev (Backend: 8084, Python: 8001)"
echo "- Bookie: https://bookie.luwi.dev (Backend: 8085, Python: 8003)"
echo ""
echo "Test endpoints:"
echo "- /api/v2/health - Health check"
echo "- /api/v2/settings - Settings management"
echo "- /api/v2/documents - Document management"
echo "- /api/v2/chat - Chat/RAG endpoint"
echo "- /api/v2/scrape - Web scraping"
echo "============================================"
