#!/bin/bash
# =====================================================
# Luwi Semantic Bridge - Stop All Services (Linux)
# =====================================================

echo ""
echo "========================================"
echo "  Stopping All Services..."
echo "========================================"
echo ""

pm2 stop all
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to stop services!"
    exit 1
fi

echo ""
echo "[OK] All services stopped successfully"
echo ""
echo "To start again, run: ./pm2-start-all.sh"
echo "To delete all services: pm2 delete all"
echo ""
