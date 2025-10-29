-- Add transform tracking columns to documents table
-- This enables smart duplicate detection and better transform history

-- Add original_filename column (for duplicate filename detection)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Add last_transform_row_count column (for smart insert/update detection)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS last_transform_row_count INTEGER;

-- Add column_count for quick reference
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS column_count INTEGER;

-- Add UNIQUE constraint on filename (for ON CONFLICT UPSERT)
-- Drop existing constraint if it exists, then add it
DO $$
BEGIN
  -- Try to add unique constraint (will fail silently if already exists)
  BEGIN
    ALTER TABLE documents
    ADD CONSTRAINT documents_filename_unique UNIQUE (filename);
  EXCEPTION
    WHEN duplicate_table THEN
      -- Constraint already exists, skip
      NULL;
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

-- Verify columns
SELECT
  column_name,
  data_type,
  is_nullable
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
