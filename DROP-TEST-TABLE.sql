-- Drop test table from previous attempts
-- Run this in PgAdmin on rag_chatbot (lsemb) database

DROP TABLE IF EXISTS ozelgeler_xlsx___test_100;

-- Verify it's dropped
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ozelgeler_xlsx___test_100';
