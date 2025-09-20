#!/bin/bash

# Embedding Fix Script
# This script fixes embedding progress inconsistencies

set -e

echo "🚀 Starting embedding fix process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Step 1: Verify current state
log "Step 1: Verifying current state..."
cd "$PROJECT_ROOT"
node scripts/verify-embedding-state.js

echo ""
read -p "Press Enter to continue with cleanup, or Ctrl+C to abort..."

# Step 2: Run cleanup
log "Step 2: Running cleanup..."
node scripts/cleanup-embedding-progress.js

# Step 3: Clear Redis cache (optional)
echo ""
read -p "Clear Redis cache? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Step 3: Clearing Redis cache..."

    # Try to clear Redis keys
    if command -v redis-cli &> /dev/null; then
        redis-cli -n 2 DEL "embedding:progress" 2>/dev/null || true
        redis-cli -n 2 DEL "embedding:status" 2>/dev/null || true
        log "Redis cache cleared"
    else
        warn "redis-cli not found, skipping Redis cleanup"
    fi
fi

# Step 4: Reset database state
log "Step 4: Resetting database state..."

# Try to reset progress table
if command -v psql &> /dev/null; then
    # Read database config from .env
    DB_HOST=${ASEMB_DB_HOST:-91.99.229.96}
    DB_PORT=${ASEMB_DB_PORT:-5432}
    DB_NAME=${ASEMB_DB_NAME:-postgres}
    DB_USER=${ASEMB_DB_USER:-postgres}

    # Reset stale progress records
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        UPDATE embedding_progress
        SET status = 'pending',
            processed = 0,
            updated_at = NOW()
        WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '1 hour';
    " 2>/dev/null || warn "Could not update progress table"

    # Check unified_embeddings table
    EMBEDDING_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM unified_embeddings;
    " 2>/dev/null || echo "0")

    EMBEDDING_COUNT=$(echo "$EMBEDDING_COUNT" | tr -d ' ')

    if [ "$EMBEDDING_COUNT" = "0" ]; then
        log "✅ unified_embeddings table is empty"
    else
        warn "unified_embeddings has $EMBEDDING_COUNT records"
        read -p "Clear unified_embeddings table? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
                TRUNCATE unified_embeddings RESTART IDENTITY;
            " 2>/dev/null || error "Failed to clear table"
            log "✅ unified_embeddings table cleared"
        fi
    fi
else
    warn "psql not found, skipping database operations"
fi

# Step 5: Final verification
log "Step 5: Final verification..."
node scripts/verify-embedding-state.js

log ""
log "✅ Fix process completed!"
log ""
log "Next steps:"
log "1. Restart your backend server"
log "2. Go to Embeddings Manager in the frontend"
log "3. Start embedding process again"
log ""
log "The embedding system should now be in a clean state."