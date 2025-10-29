-- Drop the incorrectly created table (with wrong PRIMARY KEY)
-- Run this in rag_chatbot database

\c rag_chatbot

DROP TABLE IF EXISTS ozelgeler_xlsx___test_100 CASCADE;

-- Verify it's gone
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '%ozelgeler%';

-- Should return 0 rows
