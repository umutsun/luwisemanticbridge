-- =====================================================
-- FIX DOCUMENTS TABLE - Add Missing Columns
-- Run this in pgAdmin
-- Database: lsemb (91.99.229.96:5432)
-- =====================================================

-- First, check what columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;

-- Add missing base columns if they don't exist
ALTER TABLE documents ADD COLUMN IF NOT EXISTS filename TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_type VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_count INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add transform columns (from previous migration)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parsed_data JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS column_headers TEXT[];
ALTER TABLE documents ADD COLUMN IF NOT EXISTS row_count INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transform_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transform_progress INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS target_table_name VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_db_id VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transform_errors JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transformed_at TIMESTAMP;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS data_quality_score FLOAT;

-- Create all indexes
CREATE INDEX IF NOT EXISTS idx_documents_transform_status ON documents(transform_status);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_source_db_id ON documents(source_db_id);

-- Verify all columns now exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;

-- =====================================================
-- EXPECTED: 20 columns total
-- =====================================================
-- id, filename, content, file_type, file_size,
-- chunk_count, embedding_count, metadata,
-- created_at, updated_at, parsed_data, column_headers,
-- row_count, transform_status, transform_progress,
-- target_table_name, source_db_id, transform_errors,
-- transformed_at, data_quality_score
-- =====================================================
