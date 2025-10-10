#!/bin/bash

echo "Starting Luwi Semantic Bridge..."

# Kill existing processes
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "npm start" 2>/dev/null || true

# Start frontend
cd /root/alice-semantic-bridge
nohup npm run dev > frontend.log 2>&1 &
echo "Frontend starting on port 3000..."

# Start API
cd /root/alice-semantic-bridge/api
nohup npm start > api.log 2>&1 &
echo "API starting on port 8083..."

# Wait a bit
sleep 5

# Check status
echo ""
echo "=== Status ==="
ps aux | grep -E "(npm run dev|npm start)" | grep -v grep
echo ""
echo "=== Frontend logs (last 10 lines) ==="
tail -n 10 /root/alice-semantic-bridge/frontend.log
echo ""
echo "=== API logs (last 10 lines) ==="
tail -n 10 /root/alice-semantic-bridge/api/api.log