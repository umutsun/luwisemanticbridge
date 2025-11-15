-- Add document processing status and type tracking
-- This migration adds status tracking for PDF processing workflow

-- Add status column if it doesn't exist
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'uploaded';

-- Add file_type column if it doesn't exist
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);

-- Add OCR status tracking
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS ocr_status VARCHAR(50) DEFAULT 'pending';

-- Add analysis status tracking
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(50) DEFAULT 'pending';

-- Add transform status tracking
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS transform_status VARCHAR(50) DEFAULT 'pending';

-- Add processing metadata
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS processing_metadata JSONB;

-- Create indexes for status queries
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_ocr_status ON documents(ocr_status);
CREATE INDEX IF NOT EXISTS idx_documents_analysis_status ON documents(analysis_status);
CREATE INDEX IF NOT EXISTS idx_documents_transform_status ON documents(transform_status);

-- Update existing documents to have correct file_type based on title
UPDATE documents
SET file_type = CASE
    WHEN LOWER(title) LIKE '%.pdf' OR LOWER(file_path) LIKE '%.pdf' THEN 'application/pdf'
    WHEN LOWER(title) LIKE '%.docx' OR LOWER(file_path) LIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN LOWER(title) LIKE '%.doc' OR LOWER(file_path) LIKE '%.doc' THEN 'application/msword'
    WHEN LOWER(title) LIKE '%.txt' OR LOWER(file_path) LIKE '%.txt' THEN 'text/plain'
    ELSE file_type
  END
WHERE file_type IS NULL OR file_type = '';

-- Create a function to update document status
CREATE OR REPLACE FUNCTION update_document_status(
    doc_id INTEGER,
    new_status VARCHAR(50),
    status_type VARCHAR(50) DEFAULT NULL -- 'ocr', 'analysis', 'transform', or NULL for main status
) RETURNS BOOLEAN AS $$
BEGIN
    IF status_type IS NULL THEN
        UPDATE documents SET status = new_status WHERE id = doc_id;
    ELSIF status_type = 'ocr' THEN
        UPDATE documents SET ocr_status = new_status WHERE id = doc_id;
    ELSIF status_type = 'analysis' THEN
        UPDATE documents SET analysis_status = new_status WHERE id = doc_id;
    ELSIF status_type = 'transform' THEN
        UPDATE documents SET transform_status = new_status WHERE id = doc_id;
    ELSE
        RAISE EXCEPTION 'Invalid status_type: %', status_type;
    END IF;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically update main status when all sub-statuses are complete
CREATE OR REPLACE FUNCTION check_document_completion() RETURNS TRIGGER AS $$
BEGIN
    -- If all sub-statuses are complete, mark as completed
    IF NEW.ocr_status = 'completed' AND
       NEW.analysis_status = 'completed' AND
       NEW.transform_status = 'completed' THEN
        NEW.status = 'completed';
    ELSIF NEW.ocr_status = 'failed' OR
          NEW.analysis_status = 'failed' OR
          NEW.transform_status = 'failed' THEN
        NEW.status = 'failed';
    ELSIF NEW.ocr_status = 'processing' OR
          NEW.analysis_status = 'processing' OR
          NEW.transform_status = 'processing' THEN
        NEW.status = 'processing';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_document_completion
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION check_document_completion();

-- Views for easy querying
CREATE OR REPLACE VIEW pdf_documents AS
SELECT
    id,
    title,
    file_path,
    file_type,
    status,
    ocr_status,
    analysis_status,
    transform_status,
    content,
    metadata,
    created_at,
    updated_at,
    CASE
        WHEN file_type = 'application/pdf' THEN true
        ELSE false
    END as is_pdf
FROM documents
WHERE file_type = 'application/pdf'
   OR LOWER(title) LIKE '%.pdf'
   OR LOWER(file_path) LIKE '%.pdf';

CREATE OR REPLACE VIEW pdf_ready_for_batch AS
SELECT *
FROM pdf_documents
WHERE ocr_status = 'completed'
  AND analysis_status = 'completed'
  AND (transform_status != 'completed' OR transform_status IS NULL);

-- Comment on columns
COMMENT ON COLUMN documents.status IS 'Overall document processing status: uploaded, processing, completed, failed';
COMMENT ON COLUMN documents.file_type IS 'MIME type of the document file';
COMMENT ON COLUMN documents.ocr_status IS 'OCR processing status: pending, processing, completed, failed, skipped';
COMMENT ON COLUMN documents.analysis_status IS 'Analysis status: pending, processing, completed, failed';
COMMENT ON COLUMN documents.transform_status IS 'Transform status: pending, processing, completed, failed';
COMMENT ON COLUMN documents.processing_metadata IS 'JSON metadata about processing steps, timestamps, errors, etc';