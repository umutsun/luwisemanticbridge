-- Check current documents table structure
-- Run this in pgAdmin to see what columns exist

SELECT
    column_name,
    data_type,
    character_maximum_length,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;

-- This will show you ALL columns in the documents table
