-- Find document by filename
SELECT id, title, type, 
       LENGTH(content) as content_size,
       substring(content, 1, 100) as content_preview
FROM documents 
WHERE title LIKE '%1761229751218%' OR title LIKE '%575650115%'
ORDER BY id;

-- Also check document ID 9
SELECT id, title, type,
       LENGTH(content) as content_size, 
       substring(content, 1, 100) as content_preview
FROM documents
WHERE id = 9;
