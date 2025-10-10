#!/bin/bash
# =====================================================
# Luwi Semantic Bridge - Service Status (Linux)
# =====================================================

echo ""
echo "========================================"
echo "  Service Status"
echo "========================================"
echo ""

pm2 list

echo ""
echo "========================================"
echo "  Service Details"
echo "========================================"
echo ""

# Check backend health
echo "[Backend Health Check]"
if curl -s http://localhost:8083/health > /dev/null 2>&1; then
    echo "[OK] Backend is responding"
    curl -s http://localhost:8083/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8083/health
else
    echo "[ERROR] Backend is not responding!"
fi

echo ""
echo ""

# Check frontend health
echo "[Frontend Health Check]"
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "[OK] Frontend is responding"
else
    echo "[ERROR] Frontend is not responding!"
fi

echo ""
echo "========================================"
echo "  Quick Commands"
echo "========================================"
echo ""
echo "pm2 monit          - Open PM2 monitoring dashboard"
echo "pm2 logs           - View all logs"
echo "pm2 logs backend   - View backend logs only"
echo "pm2 logs frontend  - View frontend logs only"
echo "pm2 restart all    - Restart all services"
echo "pm2 reload all     - Reload all services (zero-downtime)"
echo ""

# Don't pause if run from another script
if [ "$1" != "nopause" ]; then
    read -p "Press Enter to continue..."
fi
