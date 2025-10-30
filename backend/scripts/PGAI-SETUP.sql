-- ========================================
-- PGAI CONFIGURATION (OPTIONAL - FOR FUTURE USE)
-- ========================================
-- This sets up pgai for database-level embedding generation
-- Note: Current backend already handles embeddings efficiently
-- This is for advanced use cases and future optimization

\echo '========================================='
\echo 'CHECKING PGAI EXTENSION'
\echo '========================================='

SELECT
    extname,
    extversion,
    CASE
        WHEN extname = 'ai' THEN 'pgai is installed'
        ELSE 'Extension available'
    END as status
FROM pg_extension
WHERE extname IN ('vector', 'vectorscale', 'ai')
ORDER BY extname;

\echo ''
\echo '========================================='
\echo 'PGAI STATUS'
\echo '========================================='

-- Check if pgai is installed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ai') THEN
        RAISE NOTICE '✓ pgai is installed and ready';
        RAISE NOTICE '';
        RAISE NOTICE 'To configure OpenAI API key (if not already set):';
        RAISE NOTICE '  SELECT ai.set_secret(''OPENAI_API_KEY'', ''your-openai-key-here'');';
        RAISE NOTICE '';
        RAISE NOTICE 'To generate an embedding:';
        RAISE NOTICE '  SELECT ai.openai_embed(''text-embedding-3-small'', ''your text here'');';
    ELSE
        RAISE NOTICE '✗ pgai is NOT installed';
        RAISE NOTICE '';
        RAISE NOTICE 'To install pgai:';
        RAISE NOTICE '  1. Follow instructions at: https://github.com/timescale/pgai';
        RAISE NOTICE '  2. Run: CREATE EXTENSION ai CASCADE;';
    END IF;
END $$;

\echo ''
\echo '========================================='
\echo 'IMPORTANT NOTE'
\echo '========================================='
\echo 'pgai is OPTIONAL for this system.'
\echo 'The backend already handles embeddings efficiently.'
\echo 'pgai can be used for advanced scenarios like:'
\echo '  - Database-triggered embedding generation'
\echo '  - Batch processing directly in PostgreSQL'
\echo '  - Reducing network latency for embeddings'
\echo ''
\echo 'For now, focus on the DiskANN index optimization!'
\echo '========================================='
