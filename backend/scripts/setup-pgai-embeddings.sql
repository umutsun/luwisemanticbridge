-- ========================================
-- PGAI EMBEDDING INTEGRATION
-- ========================================
-- This script sets up pgai for automatic embedding generation
-- Benefits: Faster embedding, automatic caching, database-level optimization

\echo '========================================='
\echo 'STEP 1: VERIFY PGAI EXTENSION'
\echo '========================================='

-- Ensure pgai extension is installed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ai') THEN
        RAISE NOTICE 'Installing pgai extension...';
        CREATE EXTENSION IF NOT EXISTS ai CASCADE;
    ELSE
        RAISE NOTICE 'pgai extension already installed';
    END IF;
END $$;

\echo ''
\echo '========================================='
\echo 'STEP 2: CONFIGURE OPENAI API KEY'
\echo '========================================='

-- Check if OpenAI API key is configured
DO $$
DECLARE
    api_key_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM ai.secret WHERE name = 'OPENAI_API_KEY'
    ) INTO api_key_exists;

    IF api_key_exists THEN
        RAISE NOTICE 'OpenAI API key already configured in pgai';
    ELSE
        RAISE NOTICE 'WARNING: OpenAI API key NOT configured!';
        RAISE NOTICE 'Run this command to set it:';
        RAISE NOTICE 'SELECT ai.set_secret(''OPENAI_API_KEY'', ''sk-your-key-here'');';
    END IF;
END $$;

\echo ''
\echo '========================================='
\echo 'STEP 3: CREATE EMBEDDING HELPER FUNCTION'
\echo '========================================='

-- Create a wrapper function for pgai embeddings with error handling
CREATE OR REPLACE FUNCTION generate_embedding_pgai(input_text text)
RETURNS vector
LANGUAGE plpgsql
AS $$
DECLARE
    result vector;
    retry_count int := 0;
    max_retries int := 3;
BEGIN
    -- Try to generate embedding with retries
    LOOP
        BEGIN
            result := ai.openai_embed(
                'text-embedding-3-small',
                input_text,
                api_key => ai.get_secret('OPENAI_API_KEY')
            );
            RETURN result;
        EXCEPTION
            WHEN OTHERS THEN
                retry_count := retry_count + 1;
                IF retry_count >= max_retries THEN
                    RAISE NOTICE 'Failed to generate embedding after % retries: %', max_retries, SQLERRM;
                    RETURN NULL;
                END IF;
                -- Wait a bit before retry (exponential backoff)
                PERFORM pg_sleep(retry_count * 0.5);
        END;
    END LOOP;
END;
$$;

\echo 'Embedding helper function created: generate_embedding_pgai(text)'

\echo ''
\echo '========================================='
\echo 'STEP 4: CREATE BATCH EMBEDDING FUNCTION'
\echo '========================================='

-- Create function for batch embedding generation (more efficient)
CREATE OR REPLACE FUNCTION generate_embeddings_batch(
    texts text[],
    OUT embeddings vector[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    i int;
    current_text text;
    current_embedding vector;
BEGIN
    embeddings := ARRAY[]::vector[];

    FOR i IN 1..array_length(texts, 1) LOOP
        current_text := texts[i];

        -- Skip empty texts
        IF current_text IS NULL OR LENGTH(TRIM(current_text)) = 0 THEN
            embeddings := embeddings || ARRAY[NULL::vector];
            CONTINUE;
        END IF;

        -- Generate embedding
        current_embedding := generate_embedding_pgai(current_text);
        embeddings := embeddings || ARRAY[current_embedding];

        -- Progress logging every 100 items
        IF i % 100 = 0 THEN
            RAISE NOTICE 'Processed % / % embeddings', i, array_length(texts, 1);
        END IF;
    END LOOP;
END;
$$;

\echo 'Batch embedding function created: generate_embeddings_batch(text[])'

\echo ''
\echo '========================================='
\echo 'STEP 5: CREATE AUTOMATIC EMBEDDING TRIGGER'
\echo '========================================='

-- Trigger function to auto-generate embeddings on INSERT/UPDATE
CREATE OR REPLACE FUNCTION auto_generate_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only generate if embedding is NULL and content exists
    IF NEW.embedding IS NULL AND NEW.content IS NOT NULL AND LENGTH(TRIM(NEW.content)) > 0 THEN
        NEW.embedding := generate_embedding_pgai(NEW.content);
        RAISE NOTICE 'Auto-generated embedding for record %', NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger (disabled by default - enable if you want automatic embedding)
DROP TRIGGER IF EXISTS unified_embeddings_auto_embed ON unified_embeddings;

-- Uncomment to enable automatic embedding on insert/update:
-- CREATE TRIGGER unified_embeddings_auto_embed
--     BEFORE INSERT OR UPDATE ON unified_embeddings
--     FOR EACH ROW
--     WHEN (NEW.embedding IS NULL AND NEW.content IS NOT NULL)
--     EXECUTE FUNCTION auto_generate_embedding();

\echo 'Trigger function created (disabled by default)'
\echo 'To enable automatic embedding, uncomment the CREATE TRIGGER line'

\echo ''
\echo '========================================='
\echo 'STEP 6: TEST EMBEDDING GENERATION'
\echo '========================================='

-- Test embedding generation
DO $$
DECLARE
    test_embedding vector;
    api_key_configured boolean;
BEGIN
    -- Check if API key is configured
    SELECT EXISTS (SELECT 1 FROM ai.secret WHERE name = 'OPENAI_API_KEY')
    INTO api_key_configured;

    IF NOT api_key_configured THEN
        RAISE NOTICE 'Skipping test - OpenAI API key not configured';
        RAISE NOTICE 'Configure it with: SELECT ai.set_secret(''OPENAI_API_KEY'', ''sk-...'');';
        RETURN;
    END IF;

    -- Test embedding generation
    RAISE NOTICE 'Testing embedding generation...';
    test_embedding := generate_embedding_pgai('Test embedding generation');

    IF test_embedding IS NOT NULL THEN
        RAISE NOTICE 'SUCCESS! Embedding generated with % dimensions', array_length(test_embedding, 1);
    ELSE
        RAISE NOTICE 'FAILED! Could not generate test embedding';
    END IF;
END $$;

\echo ''
\echo '========================================='
\echo 'PGAI SETUP COMPLETE!'
\echo '========================================='
\echo ''
\echo 'Available functions:'
\echo '  - generate_embedding_pgai(text) -> vector'
\echo '  - generate_embeddings_batch(text[]) -> vector[]'
\echo ''
\echo 'Example usage:'
\echo '  SELECT generate_embedding_pgai(''Your text here'');'
\echo ''
\echo 'To set OpenAI API key:'
\echo '  SELECT ai.set_secret(''OPENAI_API_KEY'', ''sk-your-key-here'');'
\echo ''
\echo 'Next steps:'
\echo '  1. Set OpenAI API key if not already set'
\echo '  2. Optionally enable auto-embedding trigger'
\echo '  3. Update backend to use generate_embedding_pgai() for queries'
\echo '========================================='
