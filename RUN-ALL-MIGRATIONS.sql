-- ========================================
-- COMPLETE MIGRATION SCRIPT
-- Run this in lsemb (rag_chatbot) database
-- ========================================

-- PART 1: Upload Limits Settings
-- ========================================
INSERT INTO settings (category, key, value, description, created_at, updated_at)
VALUES
  ('advanced', 'upload_json_limit_mb', '100', 'Maximum JSON payload size in MB (for large CSV uploads)', NOW(), NOW()),
  ('advanced', 'upload_file_limit_mb', '100', 'Maximum file upload size in MB', NOW(), NOW()),
  ('advanced', 'upload_text_limit_mb', '1', 'Maximum text payload size in MB', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Verify upload limits
SELECT category, key, value, description
FROM settings
WHERE category = 'advanced'
  AND key LIKE '%upload%limit%'
ORDER BY key;


-- PART 2: Transform Tracking Columns
-- ========================================

-- Add original_filename column (for duplicate filename detection)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Add last_transform_row_count column (for smart insert/update detection)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS last_transform_row_count INTEGER;

-- Add column_count for quick reference
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS column_count INTEGER;

-- Add upload_count to track how many times file was uploaded/updated
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS upload_count INTEGER DEFAULT 1;

-- Add UNIQUE constraint on filename (for ON CONFLICT UPSERT)
DO $$
BEGIN
  BEGIN
    ALTER TABLE documents
    ADD CONSTRAINT documents_filename_unique UNIQUE (filename);
  EXCEPTION
    WHEN duplicate_table THEN
      NULL; -- Constraint already exists
    WHEN duplicate_object THEN
      NULL; -- Constraint already exists with different name
  END;
END $$;

-- Add index for original_filename lookups
CREATE INDEX IF NOT EXISTS idx_documents_original_filename
ON documents(original_filename);

-- Add index for composite lookup (filename + target_table)
CREATE INDEX IF NOT EXISTS idx_documents_filename_table
ON documents(original_filename, target_table_name);

-- Update existing records to set original_filename from filename
UPDATE documents
SET original_filename = filename
WHERE original_filename IS NULL;


-- PART 3: Verify All Changes
-- ========================================

-- Check settings
SELECT 'Settings' as table_name, COUNT(*) as count
FROM settings
WHERE category = 'advanced' AND key LIKE '%upload%limit%'
UNION ALL
-- Check documents table columns
SELECT 'New Columns' as table_name, COUNT(*) as count
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name IN (
    'original_filename',
    'last_transform_row_count',
    'column_count',
    'upload_count'
  );

-- Display all transform-related columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name IN (
    'original_filename',
    'last_transform_row_count',
    'column_count',
    'column_headers',
    'row_count',
    'target_table_name',
    'transform_status',
    'transformed_at'
  )
ORDER BY column_name;

-- Display indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'documents'
  AND indexname LIKE '%filename%'
ORDER BY indexname;

-- Display constraints
SELECT
  conname as constraint_name,
  contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'documents'::regclass
  AND conname LIKE '%filename%';

-- Summary
SELECT
  '✅ Upload limits configured' as status
WHERE EXISTS (
  SELECT 1 FROM settings
  WHERE category = 'advanced'
  AND key IN ('upload_json_limit_mb', 'upload_file_limit_mb', 'upload_text_limit_mb')
)
UNION ALL
SELECT
  '✅ Transform columns added' as status
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'documents'
  AND column_name IN ('original_filename', 'last_transform_row_count', 'column_count', 'upload_count')
  HAVING COUNT(*) = 4
)
UNION ALL
SELECT
  '✅ Filename unique constraint added' as status
WHERE EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'documents'::regclass
  AND contype = 'u' -- unique constraint
  AND conname LIKE '%filename%'
);
