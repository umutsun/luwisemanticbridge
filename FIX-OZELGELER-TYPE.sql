-- Fix OZELGELER file type from TEXT to CSV
-- Run this in PostgreSQL (lsemb database)

UPDATE documents
SET file_type = 'csv'
WHERE filename LIKE '%OZELGELER%'
  AND file_type = 'text';

-- Verify the change
SELECT id, filename, file_type, size
FROM documents
WHERE filename LIKE '%OZELGELER%';
