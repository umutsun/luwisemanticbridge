# n8n.luwi.dev Server Setup for ASEMB

## 1. PostgreSQL Setup
```sql
-- Connect to PostgreSQL
sudo -u postgres psql

-- Create database and user
CREATE DATABASE asemb;
CREATE USER asemb_user WITH ENCRYPTED PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE asemb TO asemb_user;

-- Connect to asemb database
\c asemb

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Create tables
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    source_id VARCHAR(255) NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(255) PRIMARY KEY,
    url TEXT,
    title TEXT,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes from Gemini's optimizations
CREATE INDEX idx_documents_content_trgm ON documents USING gin(content gin_trgm_ops);
CREATE INDEX idx_documents_embedding ON documents USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_documents_source_created ON documents(source_id, created_at DESC);
CREATE INDEX idx_documents_metadata ON documents USING gin(metadata);
CREATE INDEX idx_documents_hybrid ON documents(source_id, content_hash, created_at DESC) INCLUDE (content, embedding, metadata);

-- Analyze tables
ANALYZE documents;
ANALYZE sources;
```

## 2. Redis Setup
```bash
# Check Redis status
sudo systemctl status redis

# Configure Redis (edit /etc/redis/redis.conf)
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10

# Restart Redis
sudo systemctl restart redis

# Test Redis connection
redis-cli ping
```

## 3. n8n Node Installation
```bash
# Find n8n installation
docker ps | grep n8n
# OR
pm2 list | grep n8n

# For Docker installation:
docker exec -it n8n-container bash
cd /home/node/.n8n/nodes
mkdir -p n8n-nodes-alice-semantic-bridge
cd n8n-nodes-alice-semantic-bridge

# Upload and extract the tar.gz file here
tar -xzf asemb-node-v0.1.0.tar.gz
npm install --production

# Exit container and restart
exit
docker restart n8n-container

# For PM2 installation:
cd ~/.n8n/nodes
mkdir -p n8n-nodes-alice-semantic-bridge
cd n8n-nodes-alice-semantic-bridge
tar -xzf /path/to/asemb-node-v0.1.0.tar.gz
npm install --production
pm2 restart n8n
```

## 4. n8n Configuration
```json
// Add to n8n settings if needed
{
  "nodes": {
    "exclude": [],
    "errorTriggerType": "n8n-nodes-base.errorTrigger"
  },
  "queue": {
    "bull": {
      "redis": {
        "host": "localhost",
        "port": 6379,
        "db": 0
      }
    }
  }
}
```

## 5. Verify Installation
1. Open https://n8n.luwi.dev
2. Go to Workflows > New
3. Add node > Search "Alice"
4. Should see:
   - Alice Semantic Bridge
   - Web Scrape Enhanced
   - Pg Hybrid Query
   - Text Chunk

## 6. Create Credentials in n8n UI

### OpenAI API
- Go to Credentials > New
- Select "OpenAI API"
- Add your API key

### PostgreSQL
- Go to Credentials > New  
- Select "Postgres"
- Configure:
  - Host: localhost
  - Database: asemb
  - User: asemb_user
  - Password: your_password
  - Port: 5432
  - SSL: Disable (if local)

## 7. Test Workflow
Import this test workflow JSON to verify everything works:

```json
{
  "name": "ASEMB Test - Web to Vector",
  "nodes": [
    {
      "parameters": {
        "url": "https://example.com",
        "selector": "body"
      },
      "name": "Web Scrape",
      "type": "n8n-nodes-alice-semantic-bridge.webScrapeEnhanced",
      "position": [250, 300],
      "typeVersion": 1
    },
    {
      "parameters": {
        "chunkSize": 512,
        "overlap": 64
      },
      "name": "Chunk Text",
      "type": "n8n-nodes-alice-semantic-bridge.textChunk",
      "position": [450, 300],
      "typeVersion": 1
    },
    {
      "parameters": {
        "operation": "upsert",
        "sourceId": "test-{{$now.toUnix()}}"
      },
      "name": "Store Vectors",
      "type": "n8n-nodes-alice-semantic-bridge.aliceSemanticBridge",
      "position": [650, 300],
      "typeVersion": 2,
      "credentials": {
        "postgresDb": {
          "id": "1",
          "name": "Postgres ASEMB"
        },
        "openAiApi": {
          "id": "2", 
          "name": "OpenAI"
        }
      }
    }
  ],
  "connections": {
    "Web Scrape": {
      "main": [
        [{
          "node": "Chunk Text",
          "type": "main",
          "index": 0
        }]
      ]
    },
    "Chunk Text": {
      "main": [
        [{
          "node": "Store Vectors",
          "type": "main",
          "index": 0
        }]
      ]
    }
  }
}
```

## 8. Monitor Performance
```bash
# Check PostgreSQL
psql -U asemb_user -d asemb -c "SELECT count(*) FROM documents;"

# Check Redis
redis-cli
> INFO stats
> KEYS asemb:*

# Check n8n logs
docker logs n8n-container -f --tail 100
# OR
pm2 logs n8n --lines 100

# Test cache stats endpoint (if API is deployed)
curl http://n8n.luwi.dev:3000/api/v1/cache/stats
```

## 9. Troubleshooting

### Node not appearing:
- Clear browser cache
- Restart n8n again
- Check logs for errors

### Database connection issues:
- Verify PostgreSQL is running
- Check credentials
- Test connection manually: `psql -h localhost -U asemb_user -d asemb`

### Performance issues:
- Run VACUUM ANALYZE on tables
- Check index usage
- Monitor Redis memory usage

## 10. Production Optimizations
```sql
-- PostgreSQL tuning
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET work_mem = '256MB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
SELECT pg_reload_conf();

-- Check performance
SELECT * FROM pg_stat_user_tables WHERE schemaname = 'public';
SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';
```
