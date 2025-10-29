-- Fix SORUCEVAP full test.csv file type from TEXT to CSV
UPDATE documents
SET file_type = 'csv'
WHERE filename LIKE '%SORUCEVAP%'
  AND filename LIKE '%.csv'
  AND (file_type = 'text' OR file_type IS NULL);

-- Verify
SELECT
  id,
  filename,
  file_type,
  file_size,
  created_at
FROM documents
WHERE filename LIKE '%SORUCEVAP%'
ORDER BY created_at DESC
LIMIT 5;
