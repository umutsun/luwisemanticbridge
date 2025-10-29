-- =====================================================
-- DOCUMENT TRANSFORM MIGRATION
-- Run this in pgAdmin or your PostgreSQL client
-- Database: lsemb (91.99.229.96:5432)
-- =====================================================

-- Add fields for CSV/JSON document transformation workflow
-- These fields support the preview → transform → source_db pipeline

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS parsed_data JSONB,
  ADD COLUMN IF NOT EXISTS column_headers TEXT[],
  ADD COLUMN IF NOT EXISTS row_count INTEGER,
  ADD COLUMN IF NOT EXISTS transform_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS transform_progress INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_table_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_db_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS transform_errors JSONB,
  ADD COLUMN IF NOT EXISTS transformed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS data_quality_score FLOAT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_transform_status ON documents(transform_status);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_source_db_id ON documents(source_db_id);

-- Add comment for documentation
COMMENT ON COLUMN documents.parsed_data IS 'Parsed CSV/JSON data stored as JSONB for preview';
COMMENT ON COLUMN documents.column_headers IS 'Array of column names detected from CSV/JSON';
COMMENT ON COLUMN documents.row_count IS 'Number of rows in the uploaded document';
COMMENT ON COLUMN documents.transform_status IS 'Status: pending, analyzing, transforming, completed, failed';
COMMENT ON COLUMN documents.transform_progress IS 'Progress percentage (0-100)';
COMMENT ON COLUMN documents.target_table_name IS 'Target table name in source_db';
COMMENT ON COLUMN documents.source_db_id IS 'Reference to source database from settings';
COMMENT ON COLUMN documents.transform_errors IS 'Error details if transformation failed';
COMMENT ON COLUMN documents.transformed_at IS 'Timestamp when transformation completed';
COMMENT ON COLUMN documents.data_quality_score IS 'Quality score from data analysis (0-1)';

-- Verify columns were added
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name IN (
    'parsed_data',
    'column_headers',
    'row_count',
    'transform_status',
    'transform_progress',
    'target_table_name',
    'source_db_id',
    'transform_errors',
    'transformed_at',
    'data_quality_score'
  )
ORDER BY column_name;

-- =====================================================
-- EXPECTED RESULT: 10 rows showing the new columns
-- =====================================================
