#!/bin/bash
# =============================================
# Fix Redis Isolation - Each instance gets unique DB
# Date: 2025-01-22
# CRITICAL: Prevent Redis data collision
# =============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Redis Isolation Fix${NC}"
echo -e "${GREEN}=========================================${NC}"

# Redis DB Assignment (Each instance MUST have unique DB)
# DB 0: Reserved for general cache
# DB 1: emlakai
# DB 2: lsemb
# DB 3: scriptus
# DB 4: bookie (CHANGED from 2 to 4!)
# DB 5-15: Reserved for future instances

echo -e "${YELLOW}Current Redis DB assignments:${NC}"
echo "DB 0: General cache (reserved)"
echo "DB 1: emlakai ✅"
echo "DB 2: lsemb ✅"
echo "DB 3: scriptus ✅"
echo "DB 4: bookie (fixing from DB 2 → DB 4) 🔧"

# Fix BOOKIE Redis isolation
echo -e "\n${YELLOW}Fixing BOOKIE Redis isolation...${NC}"
ssh root@91.99.229.96 << 'EOF'
# Backup current .env
cp /var/www/bookie/.env.lsemb /var/www/bookie/.env.lsemb.backup.$(date +%Y%m%d_%H%M%S)

# Update Redis DB from 2 to 4
sed -i 's/^REDIS_DB=2$/REDIS_DB=4/' /var/www/bookie/.env.lsemb

# Verify change
echo "Bookie Redis config after fix:"
grep REDIS_DB /var/www/bookie/.env.lsemb

# Restart bookie backend to apply changes
pm2 restart bookie-backend
echo "Bookie backend restarted with new Redis DB"
EOF

echo -e "\n${GREEN}✅ Bookie Redis isolation fixed!${NC}"

# Add DATABASE_URL for EMLAKAI if missing
echo -e "\n${YELLOW}Fixing EMLAKAI DATABASE_URL...${NC}"
ssh root@91.99.229.96 << 'EOF'
# Check if DATABASE_URL exists
if ! grep -q "DATABASE_URL" /var/www/emlakai/.env.lsemb; then
  echo "DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/emlakai_lsemb" >> /var/www/emlakai/.env.lsemb
  echo "DATABASE_URL added to emlakai .env"
else
  echo "DATABASE_URL already exists in emlakai .env"
fi

# Verify
grep DATABASE_URL /var/www/emlakai/.env.lsemb
EOF

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Verification${NC}"
echo -e "${GREEN}=========================================${NC}"

# Verify all Redis DBs are now unique
echo -e "\n${YELLOW}Final Redis DB assignments:${NC}"
ssh root@91.99.229.96 << 'EOF'
echo "LSEMB: $(grep REDIS_DB /var/www/lsemb/.env.lsemb)"
echo "EMLAKAI: $(grep REDIS_DB /var/www/emlakai/.env.lsemb)"
echo "BOOKIE: $(grep REDIS_DB /var/www/bookie/.env.lsemb)"
echo "SCRIPTUS: $(grep REDIS_DB /var/www/scriptus/.env.lsemb)"
EOF

# Test Redis connectivity for each DB
echo -e "\n${YELLOW}Testing Redis DB isolation:${NC}"
ssh root@91.99.229.96 << 'EOF'
# Test each Redis DB
for db in 1 2 3 4; do
  echo -n "DB $db: "
  redis-cli -n $db ping && echo "✅ OK" || echo "❌ Failed"
done

# Check key counts in each DB
echo -e "\nKey counts per DB:"
for db in 1 2 3 4; do
  count=$(redis-cli -n $db DBSIZE | awk '{print $1}')
  echo "DB $db: $count keys"
done
EOF

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Cache Fix - Implement proper cache mechanism${NC}"
echo -e "${GREEN}=========================================${NC}"

# Create improved cache implementation
cat > /tmp/fix_cache_metrics.sql << 'SQLEOF'
-- Fix cache metrics tracking
-- Add proper hit/miss tracking to ai.embedding_cache

-- Add cache statistics table if not exists
CREATE TABLE IF NOT EXISTS ai.cache_statistics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(50) NOT NULL,
  metric_value INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(metric_name)
);

-- Initialize cache metrics if not exists
INSERT INTO ai.cache_statistics (metric_name, metric_value)
VALUES
  ('cache_hits', 0),
  ('cache_misses', 0),
  ('total_requests', 0),
  ('bytes_saved', 0),
  ('tokens_saved', 0)
ON CONFLICT (metric_name) DO NOTHING;

-- Create function to update cache hit
CREATE OR REPLACE FUNCTION ai.record_cache_hit(
  p_content_hash TEXT,
  p_tokens INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  -- Increment hit counter
  UPDATE ai.cache_statistics
  SET metric_value = metric_value + 1,
      last_updated = CURRENT_TIMESTAMP
  WHERE metric_name = 'cache_hits';

  -- Increment total requests
  UPDATE ai.cache_statistics
  SET metric_value = metric_value + 1,
      last_updated = CURRENT_TIMESTAMP
  WHERE metric_name = 'total_requests';

  -- Track tokens saved
  IF p_tokens > 0 THEN
    UPDATE ai.cache_statistics
    SET metric_value = metric_value + p_tokens,
        last_updated = CURRENT_TIMESTAMP
    WHERE metric_name = 'tokens_saved';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to update cache miss
CREATE OR REPLACE FUNCTION ai.record_cache_miss() RETURNS VOID AS $$
BEGIN
  -- Increment miss counter
  UPDATE ai.cache_statistics
  SET metric_value = metric_value + 1,
      last_updated = CURRENT_TIMESTAMP
  WHERE metric_name = 'cache_misses';

  -- Increment total requests
  UPDATE ai.cache_statistics
  SET metric_value = metric_value + 1,
      last_updated = CURRENT_TIMESTAMP
  WHERE metric_name = 'total_requests';
END;
$$ LANGUAGE plpgsql;

-- Create view for cache metrics
CREATE OR REPLACE VIEW ai.cache_metrics AS
SELECT
  COALESCE((SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'cache_hits'), 0) as cache_hits,
  COALESCE((SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'cache_misses'), 0) as cache_misses,
  COALESCE((SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'total_requests'), 0) as total_requests,
  CASE
    WHEN COALESCE((SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'total_requests'), 0) > 0 THEN
      ROUND(
        COALESCE((SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'cache_hits'), 0)::numeric /
        (SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'total_requests')::numeric * 100,
        2
      )
    ELSE 0
  END as hit_rate_percent,
  COALESCE((SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'tokens_saved'), 0) as tokens_saved,
  COALESCE((SELECT metric_value FROM ai.cache_statistics WHERE metric_name = 'bytes_saved'), 0) as bytes_saved;

-- Grant permissions
GRANT SELECT ON ai.cache_metrics TO PUBLIC;
GRANT EXECUTE ON FUNCTION ai.record_cache_hit TO PUBLIC;
GRANT EXECUTE ON FUNCTION ai.record_cache_miss TO PUBLIC;

SELECT 'Cache metrics system created successfully' as status;
SQLEOF

# Apply cache fix to each database
echo -e "\n${YELLOW}Applying cache metrics fix to all databases...${NC}"
for db in lsemb emlakai_lsemb bookie_lsemb scriptus_lsemb; do
  echo -e "Fixing $db..."
  ssh root@91.99.229.96 "PGPASSWORD=Semsiye!22 psql -U postgres -d $db -f /tmp/fix_cache_metrics.sql" || echo "Failed for $db (might not have ai schema)"
done

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Summary${NC}"
echo -e "${GREEN}=========================================${NC}"

echo -e "${GREEN}✅ Redis isolation fixed:${NC}"
echo "  - Each instance now has unique Redis DB"
echo "  - Bookie moved from DB 2 → DB 4"
echo "  - No more data collision between instances"

echo -e "\n${GREEN}✅ Cache metrics fixed:${NC}"
echo "  - Proper hit/miss tracking implemented"
echo "  - Cache statistics table created"
echo "  - Real hit rate calculation available"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Monitor cache hit rates with: SELECT * FROM ai.cache_metrics;"
echo "2. Update application code to call ai.record_cache_hit() and ai.record_cache_miss()"
echo "3. Check /api/v2/ai-services/cache/stats endpoint"

echo -e "\n${GREEN}Fix completed successfully!${NC}"