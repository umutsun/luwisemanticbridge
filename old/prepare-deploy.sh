#!/bin/bash
# Quick deployment script for n8n.luwi.dev

echo "🚀 ASEMB Deployment Preparation"

# Build the project
echo "Building project..."
npm run build

# Create deployment directory
rm -rf deploy
mkdir -p deploy

# Copy essential files
cp -r dist deploy/
cp package.json deploy/
cp README.md deploy/
cp -r credentials deploy/ 2>/dev/null || echo "No credentials folder"

# Create deployment info
cat > deploy/DEPLOYMENT_INFO.md << EOF
# ASEMB n8n Node - Deployment Info

## Version: 0.1.0
## Build Date: $(date)

## Included Nodes:
- AliceSemanticBridge (V2 with all Phase 3 features)
- WebScrapeEnhanced
- PgHybridQuery
- TextChunk
- PgvectorUpsert/Query

## Features:
- ✅ Manage Operations (delete, stats, cleanup)
- ✅ Error Handling with Circuit Breaker
- ✅ Multi-layer Caching with Redis fallback
- ✅ Hybrid Search Ready
- ✅ Progress Reporting

## Requirements:
- PostgreSQL 14+ with pgvector
- Redis 6.2+
- OpenAI API key
- n8n 1.0+

## Installation:
1. Extract to ~/.n8n/nodes/
2. Run: npm install --production
3. Restart n8n
4. Configure credentials in n8n UI
EOF

# Create archive
echo "Creating deployment archive..."
cd deploy
tar -czf ../asemb-node-v0.1.0.tar.gz .
cd ..

echo "✅ Deployment package ready: asemb-node-v0.1.0.tar.gz"
echo "Size: $(du -h asemb-node-v0.1.0.tar.gz | cut -f1)"
