#!/bin/bash
# =====================================================
# Alice Semantic Bridge - Start All Services (Linux)
# =====================================================

echo ""
echo "========================================"
echo "  Alice Semantic Bridge - Starting..."
echo "========================================"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "[ERROR] PM2 is not installed!"
    echo "Installing PM2 globally..."
    npm install -g pm2
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install PM2"
        exit 1
    fi
fi

# Create logs directory if not exists
mkdir -p logs

echo "[1/5] Checking environment configuration..."
if [ ! -f "backend/.env" ]; then
    echo "[WARNING] backend/.env not found"
    if [ -f ".env.asemb" ]; then
        echo "Copying from .env.asemb..."
        cp .env.asemb backend/.env
    else
        echo "[ERROR] Please create backend/.env first"
        exit 1
    fi
fi

if [ ! -f "frontend/.env.local" ]; then
    echo "[ERROR] frontend/.env.local not found!"
    echo "Please create frontend/.env.local first"
    exit 1
fi
echo "[OK] Environment files found"

echo ""
echo "[2/5] Building frontend (production build)..."
cd frontend
npm run build
if [ $? -ne 0 ]; then
    echo "[ERROR] Frontend build failed!"
    cd ..
    exit 1
fi
cd ..
echo "[OK] Frontend built successfully"

echo ""
echo "[3/5] Starting services with PM2..."
pm2 start ecosystem.config.js
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to start services!"
    exit 1
fi

echo ""
echo "[4/5] Waiting for services to initialize..."
sleep 5

echo ""
echo "[5/5] Checking service health..."
./pm2-status.sh nopause

echo ""
echo "========================================"
echo "  Services Started Successfully!"
echo "========================================"
echo ""
echo "Backend API:    http://localhost:8083"
echo "Frontend:       http://localhost:3001"
echo "PM2 Dashboard:  pm2 monit"
echo ""
echo "Commands:"
echo "  - View logs:    ./pm2-logs.sh"
echo "  - Check status: ./pm2-status.sh"
echo "  - Stop all:     ./pm2-stop-all.sh"
echo "  - Restart:      ./pm2-restart.sh"
echo ""
