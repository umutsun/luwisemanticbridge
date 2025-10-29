-- Check if any new tables were created in rag_chatbot database
-- Run this BEFORE and AFTER testing to compare

-- 1. List all tables in rag_chatbot
SELECT
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Check for table name similar to CSV file
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '%ozelgeler%';

-- 3. Count rows in specific table if it exists (run this after testing)
-- SELECT COUNT(*) FROM ozelgeler_xlsx___test_100;

-- 4. Show recent table creation timestamps (PostgreSQL 9.1+)
SELECT
    c.relname AS table_name,
    c.reltuples AS row_count,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relname LIKE '%ozelgeler%'
ORDER BY c.relname;
