-- Check what documents are in the database
SELECT 
  id,
  title,
  type,
  LEFT(content, 100) as content_preview,
  file_path,
  created_at
FROM documents
ORDER BY id DESC
LIMIT 20;
