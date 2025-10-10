#!/bin/bash
# Luwi Semantic Bridge - Quick Status Check

echo "==================================="
echo "ASB Phase 3 - Status Check"
echo "==================================="
echo

# Check build status
echo "[1] Build Status:"
cd /c/xampp/htdocs/alice-semantic-bridge
npm run build 2>&1 | grep -E "(error|Error|SUCCESS)" | head -5

echo
echo "[2] Test Status:"
npm test 2>&1 | grep -E "(PASS|FAIL|Test Suites)" | head -5

echo
echo "[3] Redis Messages:"
redis-cli -n 2 KEYS "asb:messages:*" | head -5

echo
echo "[4] Progress Tracking:"
redis-cli -n 2 KEYS "asb:progress:*" | head -5

echo
echo "==================================="
echo "Use ASB-CLI tools directly:"
echo "- asb_status"
echo "- asb_redis get asb:messages:{agent}"
echo "- asb_redis set asb:progress:{agent}:{task} 'done'"
echo "==================================="
