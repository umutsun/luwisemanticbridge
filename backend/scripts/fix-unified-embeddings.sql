-- Fix unified_embeddings source_table names to match rag_chatbot table names
-- This script updates the source_table values to match actual table names

-- Update "Danıştay Kararları" to "danistaykararlari"
UPDATE unified_embeddings
SET source_table = 'danistaykararlari'
WHERE source_table = 'Danıştay Kararları';

-- Update "Sorucevap" to "sorucevap" (if needed)
UPDATE unified_embeddings
SET source_table = 'sorucevap'
WHERE source_table = 'Sorucevap';

-- Update "Makaleler" to "makaleler" (if needed)
UPDATE unified_embeddings
SET source_table = 'makaleler'
WHERE source_table = 'Makaleler';

-- Update "Özelgeler" to "ozelgeler" (if needed)
UPDATE unified_embeddings
SET source_table = 'ozelgeler'
WHERE source_table = 'Özelgeler' OR source_table = 'Ozelgeler';

-- Show the results
SELECT source_table, COUNT(DISTINCT source_id) as record_count
FROM unified_embeddings
GROUP BY source_table
ORDER BY record_count DESC;