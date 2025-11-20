-- Add processing_status column to documents table if it doesn't exist
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'waiting';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_processing_status
ON documents(processing_status);

-- Update existing documents
UPDATE documents
SET processing_status =
  CASE
    WHEN transform_status = 'completed' THEN 'transformed'
    WHEN metadata->'analysis' IS NOT NULL THEN 'analyzed'
    ELSE 'waiting'
  END
WHERE processing_status IS NULL OR processing_status = 'waiting';