#!/bin/bash

# pgAI Extension Server Installation Script
# This script should be run on the PostgreSQL server with sudo privileges

echo "======================================"
echo "pgAI Extension Server Installation"
echo "======================================"
echo ""

# Check if running as root/sudo
if [ "$EUID" -ne 0 ]; then
   echo "Please run with sudo: sudo bash $0"
   exit 1
fi

# PostgreSQL version detection
PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oP '\d+(?=\.)')
echo "PostgreSQL version: $PG_VERSION"

# Install dependencies
echo "1. Installing dependencies..."
apt-get update
apt-get install -y \
    postgresql-server-dev-$PG_VERSION \
    python3-pip \
    python3-dev \
    build-essential \
    git \
    curl

# Install pgai from source
echo ""
echo "2. Installing pgai extension..."

# Method 1: Using pre-built package (if available)
echo "Checking for pre-built packages..."

# For PostgreSQL 15+
if [ "$PG_VERSION" -ge 15 ]; then
    echo "Installing for PostgreSQL $PG_VERSION..."

    # Clone pgai repository
    cd /tmp
    rm -rf pgai
    git clone https://github.com/timescale/pgai.git
    cd pgai

    # Build and install
    make
    make install

    echo "✅ pgai installed from source"
else
    echo "⚠️ PostgreSQL version $PG_VERSION may not be fully supported"
fi

# Alternative: Install using pgxn (if available)
echo ""
echo "3. Checking pgxn availability..."
if command -v pgxn &> /dev/null; then
    pgxn install pgai
    echo "✅ pgai installed via pgxn"
else
    echo "pgxn not found, skipping..."
fi

# Create extension in database
echo ""
echo "4. Creating pgai extension in database..."

sudo -u postgres psql -d lsemb <<EOF
-- Create pgai extension
CREATE EXTENSION IF NOT EXISTS plpython3u;
CREATE EXTENSION IF NOT EXISTS pgai CASCADE;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'pgai';
EOF

# Configure pgai
echo ""
echo "5. Configuring pgai..."

sudo -u postgres psql -d lsemb <<'EOF'
-- Create pgai schema if not exists
CREATE SCHEMA IF NOT EXISTS ai;

-- Create OpenAI configuration
SELECT ai.create_openai(
    name => 'openai_default',
    api_key_name => 'OPENAI_API_KEY'
);

-- Set API key (you'll need to replace this)
-- ALTER SYSTEM SET ai.openai_api_key = 'your-openai-api-key-here';
-- SELECT pg_reload_conf();
EOF

echo ""
echo "6. Creating helper functions..."

sudo -u postgres psql -d lsemb <<'EOF'
-- Create embedding function
CREATE OR REPLACE FUNCTION ai.generate_embedding(
    content TEXT,
    model TEXT DEFAULT 'text-embedding-3-small'
) RETURNS vector
LANGUAGE plpgsql
AS $$
DECLARE
    embedding_result vector;
BEGIN
    -- Call pgai embedding function
    SELECT ai.openai_embed(
        'openai_default',
        content,
        model => model
    ) INTO embedding_result;

    RETURN embedding_result;
END;
$$;

-- Create automatic embedding trigger
CREATE OR REPLACE FUNCTION ai.auto_embed_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip if content is null or empty
    IF NEW.content IS NULL OR LENGTH(NEW.content) < 10 THEN
        RETURN NEW;
    END IF;

    -- Generate embedding automatically
    NEW.embedding = ai.generate_embedding(NEW.content);
    NEW.tokens_used = LENGTH(NEW.content) / 4;
    NEW.updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to unified_embeddings
DROP TRIGGER IF EXISTS auto_generate_embedding ON unified_embeddings;

CREATE TRIGGER auto_generate_embedding
BEFORE INSERT OR UPDATE OF content
ON unified_embeddings
FOR EACH ROW
EXECUTE FUNCTION ai.auto_embed_trigger();

-- Create vectorizer for batch processing
CREATE OR REPLACE FUNCTION ai.batch_generate_embeddings(
    table_name TEXT,
    content_column TEXT,
    embedding_column TEXT DEFAULT 'embedding',
    batch_size INTEGER DEFAULT 100
) RETURNS INTEGER AS $$
DECLARE
    processed_count INTEGER := 0;
    batch_record RECORD;
BEGIN
    -- Process in batches
    FOR batch_record IN
        EXECUTE format(
            'SELECT id, %I as content FROM %I WHERE %I IS NULL LIMIT %s',
            content_column, table_name, embedding_column, batch_size
        )
    LOOP
        -- Generate embedding
        EXECUTE format(
            'UPDATE %I SET %I = ai.generate_embedding($1) WHERE id = $2',
            table_name, embedding_column
        ) USING batch_record.content, batch_record.id;

        processed_count := processed_count + 1;
    END LOOP;

    RETURN processed_count;
END;
$$ LANGUAGE plpgsql;

-- Status check function
CREATE OR REPLACE FUNCTION ai.check_status()
RETURNS TABLE (
    extension_installed BOOLEAN,
    openai_configured BOOLEAN,
    triggers_active INTEGER,
    pending_embeddings BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgai') as extension_installed,
        EXISTS(SELECT 1 FROM ai._openai_providers WHERE name = 'openai_default') as openai_configured,
        (SELECT COUNT(*)::INTEGER FROM pg_trigger WHERE tgname LIKE '%embed%') as triggers_active,
        (SELECT COUNT(*) FROM unified_embeddings WHERE embedding IS NULL) as pending_embeddings;
END;
$$ LANGUAGE plpgsql;

-- Show status
SELECT * FROM ai.check_status();
EOF

echo ""
echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Set your OpenAI API key:"
echo "   sudo -u postgres psql -d lsemb -c \"ALTER SYSTEM SET ai.openai_api_key = 'your-key-here';\""
echo "   sudo -u postgres psql -d lsemb -c \"SELECT pg_reload_conf();\""
echo ""
echo "2. Test embedding generation:"
echo "   sudo -u postgres psql -d lsemb -c \"SELECT ai.generate_embedding('Test text');\""
echo ""
echo "3. Process existing records:"
echo "   sudo -u postgres psql -d lsemb -c \"SELECT ai.batch_generate_embeddings('unified_embeddings', 'content');\""
echo ""
echo "4. Monitor status:"
echo "   sudo -u postgres psql -d lsemb -c \"SELECT * FROM ai.check_status();\""