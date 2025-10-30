-- ============================================
-- LSEMB Extension Installation Script
-- Run this in pgAdmin as superuser
-- ============================================

-- 1. First check what extensions are available
SELECT name, default_version, comment
FROM pg_available_extensions
WHERE name IN ('vector', 'ai', 'vectorscale', 'pg_cron', 'pgcrypto', 'uuid-ossp')
ORDER BY name;

-- ============================================
-- 2. Install required extensions
-- ============================================

-- UUID support (if not already installed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Crypto functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Vector operations (already installed, but just in case)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 3. Try to install pgai (if available)
-- ============================================
-- Note: pgai might not be available on your server
-- If this fails, we'll use our client-side worker

DO $$
BEGIN
    -- Check if ai extension exists
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'ai'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS ai CASCADE;
        RAISE NOTICE 'pgai extension installed successfully';
    ELSE
        RAISE NOTICE 'pgai extension not available on this server - will use client-side worker';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not install pgai: %, will use client-side implementation', SQLERRM;
END $$;

-- ============================================
-- 4. Try to install pgvectorscale (if available)
-- ============================================
-- Note: pgvectorscale requires TimescaleDB and special installation

DO $$
BEGIN
    -- Check if vectorscale extension exists
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'vectorscale'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
        RAISE NOTICE 'pgvectorscale extension installed successfully';
    ELSE
        RAISE NOTICE 'pgvectorscale extension not available on this server';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not install pgvectorscale: %', SQLERRM;
END $$;

-- ============================================
-- 5. Alternative: Install pg_cron for scheduling
-- ============================================
-- This can be used as alternative to pgai for scheduling

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
        RAISE NOTICE 'pg_cron extension installed successfully';
    ELSE
        RAISE NOTICE 'pg_cron extension not available';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not install pg_cron: %', SQLERRM;
END $$;

-- ============================================
-- 6. Create custom embedding functions (alternative to pgai)
-- ============================================

-- Function to track documents needing embeddings
CREATE OR REPLACE FUNCTION get_documents_without_embeddings()
RETURNS TABLE (
    document_id UUID,
    title TEXT,
    content TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT d.id, d.title, d.content
    FROM documents d
    LEFT JOIN embeddings e ON d.id = e.document_id
    WHERE e.id IS NULL
    AND d.content IS NOT NULL
    AND LENGTH(d.content) > 0
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to track messages needing embeddings
CREATE OR REPLACE FUNCTION get_messages_without_embeddings()
RETURNS TABLE (
    message_id UUID,
    session_id VARCHAR,
    content TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.session_id, m.content
    FROM messages m
    LEFT JOIN message_embeddings me ON m.id = me.message_id
    WHERE me.id IS NULL
    AND m.content IS NOT NULL
    AND LENGTH(m.content) > 10
    AND m.created_at > NOW() - INTERVAL '7 days'
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Create indexes for better performance
-- ============================================

-- Index for finding documents without embeddings
CREATE INDEX IF NOT EXISTS idx_documents_no_embeddings
ON documents(id)
WHERE id NOT IN (SELECT DISTINCT document_id FROM embeddings WHERE document_id IS NOT NULL);

-- Index for recent messages
CREATE INDEX IF NOT EXISTS idx_messages_recent
ON messages(created_at DESC)
WHERE created_at > NOW() - INTERVAL '7 days';

-- ============================================
-- 8. Check installation results
-- ============================================

-- List all installed extensions
SELECT
    extname AS "Extension",
    extversion AS "Version",
    extowner::regrole AS "Owner"
FROM pg_extension
WHERE extname NOT IN ('plpgsql')
ORDER BY extname;

-- Check if our custom functions were created
SELECT
    proname AS "Function Name",
    pg_get_function_result(oid) AS "Returns"
FROM pg_proc
WHERE proname IN ('get_documents_without_embeddings', 'get_messages_without_embeddings');

-- ============================================
-- 9. Grant permissions (adjust username as needed)
-- ============================================

-- Grant usage on vector type to your application user
-- Replace 'your_app_user' with actual username
DO $$
DECLARE
    app_user TEXT := current_user;  -- or specify: 'your_app_user'
BEGIN
    -- Grant permissions on vector extension
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_user);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', app_user);

    RAISE NOTICE 'Permissions granted to user: %', app_user;
END $$;

-- ============================================
-- 10. Summary
-- ============================================

SELECT
    'Installation Complete' AS status,
    COUNT(*) FILTER (WHERE extname = 'vector') AS vector_installed,
    COUNT(*) FILTER (WHERE extname = 'ai') AS pgai_installed,
    COUNT(*) FILTER (WHERE extname = 'vectorscale') AS pgvectorscale_installed,
    COUNT(*) FILTER (WHERE extname = 'pg_cron') AS pg_cron_installed,
    COUNT(*) FILTER (WHERE extname = 'uuid-ossp') AS uuid_installed,
    COUNT(*) FILTER (WHERE extname = 'pgcrypto') AS pgcrypto_installed
FROM pg_extension;

-- Note: If pgai or pgvectorscale show as 0, they're not available on your server
-- The application will use client-side implementations instead