-- VERIFICATION SCRIPT: Check which database the table was created in
-- Run this after transformation completes

-- Step 1: Connect to lsemb (system database) and check for table
-- If you see the table here, it's WRONG - it should be in rag_chatbot
\c lsemb
SELECT
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '%ozelgeler%'
ORDER BY tablename;

-- If table found in lsemb:
-- SELECT COUNT(*) FROM <tablename>; -- Check row count

-- Step 2: Connect to rag_chatbot (user's source database) and check for table
-- If you see the table here, it's CORRECT ✅
\c rag_chatbot
SELECT
    schemaname,
    tablename,
    tableowner,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '%ozelgeler%'
ORDER BY tablename;

-- If table found in rag_chatbot:
-- SELECT COUNT(*) FROM <tablename>; -- Should be 99 rows
-- SELECT * FROM <tablename> LIMIT 5; -- Check sample data

-- Step 3: Check database settings in lsemb database
\c lsemb
SELECT key, value
FROM settings
WHERE key LIKE 'database.%'
ORDER BY key;

-- Expected settings:
-- database.host = 91.99.229.96
-- database.port = 5432
-- database.user = postgres
-- database.password = <password>
-- database.name = rag_chatbot (or similar)
