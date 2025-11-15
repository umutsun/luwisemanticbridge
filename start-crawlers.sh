#!/bin/bash

echo "=== Starting YKY Crawler ==="
curl -X POST https://bookie.luwi.dev/api/v2/crawler/crawler-directories/yky_crawler/script/run \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://kitap.ykykultur.com.tr/kitaplar/konu-dizini/dogan-kardes"}' \
  2>&1 | head -10

echo ""
echo ""
echo "=== Starting CAN Crawler ==="
curl -X POST https://bookie.luwi.dev/api/v2/crawler/crawler-directories/can_crawler/script/run \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.canyayinlari.com/kategori/cocuk"}' \
  2>&1 | head -10

echo ""
echo "✅ Crawlers başlatıldı!"
