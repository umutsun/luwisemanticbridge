#!/bin/bash
echo "=== Deploying YKY Crawler Fix ==="

echo "1. Killing old YKY crawler processes..."
ssh root@91.99.229.96 "pkill -9 -f 'yky_crawler.py'" 2>/dev/null || true

echo "2. Pulling latest code..."
ssh root@91.99.229.96 "cd /var/www/bookie && git pull origin main"

echo "3. Clearing state file..."
ssh root@91.99.229.96 "rm -f /var/www/bookie/backend/python-services/crawlers/yky_crawler_state.json"

echo "4. Clearing Redis DB 2 (bookie data)..."
ssh root@91.99.229.96 "redis-cli -a Semsiye\!22 -n 2 FLUSHDB" 2>/dev/null

echo ""
echo "✅ YKY crawler fix deployed!"
echo ""
echo "To test it, run:"
echo "ssh root@91.99.229.96 'cd /var/www/bookie/backend/python-services/crawlers && python3 yky_crawler.py https://kitap.ykykultur.com.tr/kitaplar/konu-dizini/dogan-kardes'"
