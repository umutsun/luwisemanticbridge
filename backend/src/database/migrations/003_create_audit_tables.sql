-- Create Document Audit Tables for Enterprise Compliance
-- Migration: 003_create_audit_tables
-- Created: 2025-10-15

-- Document Audit Logs Table
CREATE TABLE IF NOT EXISTS document_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    operation VARCHAR(50) NOT NULL CHECK (operation IN (
        'upload', 'download', 'view', 'delete', 'edit', 'share',
        'ocr', 'translate', 'embed', 'preview', 'export'
    )),
    details JSONB DEFAULT '{}',
    ip_address INET NOT NULL,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255),

    -- Indexes for performance
    INDEX idx_audit_logs_user_id (user_id),
    INDEX idx_audit_logs_document_id (document_id),
    INDEX idx_audit_logs_timestamp (timestamp),
    INDEX idx_audit_logs_operation (operation),
    INDEX idx_audit_logs_user_timestamp (user_id, timestamp)
);

-- Document Watermarks Table
CREATE TABLE IF NOT EXISTS document_watermarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    watermark_type VARCHAR(20) NOT NULL CHECK (watermark_type IN ('text', 'image', 'invisible')),
    content TEXT NOT NULL,
    position VARCHAR(20) DEFAULT 'footer' CHECK (position IN ('header', 'footer', 'diagonal', 'center')),
    opacity DECIMAL(3,2) DEFAULT 0.5 CHECK (opacity >= 0 AND opacity <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint per document/user
    UNIQUE(document_id, user_id),

    -- Indexes
    INDEX idx_watermarks_document_id (document_id),
    INDEX idx_watermarks_user_id (user_id)
);

-- Document Classification Table (AI-powered)
CREATE TABLE IF NOT EXISTS document_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
    tags TEXT[],
    language VARCHAR(10),
    content_type VARCHAR(50),
    sensitivity_level VARCHAR(20) DEFAULT 'public' CHECK (sensitivity_level IN (
        'public', 'internal', 'confidential', 'secret'
    )),
    ai_model_version VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint per document
    UNIQUE(document_id),

    -- Indexes
    INDEX idx_classifications_category (category),
    INDEX idx_classifications_sensitivity (sensitivity_level),
    INDEX idx_classifications_tags USING GIN (tags),
    INDEX idx_classifications_language (language)
);

-- Document Analytics Table
CREATE TABLE IF NOT EXISTS document_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views_count INTEGER DEFAULT 0,
    downloads_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    avg_view_duration_seconds INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    search_hits INTEGER DEFAULT 0,

    -- Unique constraint per document per day
    UNIQUE(document_id, date),

    -- Indexes
    INDEX idx_analytics_document_date (document_id, date),
    INDEX idx_analytics_date (date),
    INDEX idx_analytics_views (views_count)
);

-- Document Similarity Cache Table
CREATE TABLE IF NOT EXISTS document_similarity_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    similar_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    similarity_score DECIMAL(5,4) NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
    algorithm_version VARCHAR(20) DEFAULT 'v1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure each pair is stored only once
    CHECK (document_id < similar_document_id),
    UNIQUE(document_id, similar_document_id),

    -- Indexes
    INDEX idx_similarity_document (document_id),
    INDEX idx_similarity_score (similarity_score DESC)
);

-- Document Processing Queue Table
CREATE TABLE IF NOT EXISTS document_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    processing_type VARCHAR(50) NOT NULL CHECK (processing_type IN (
        'ocr', 'translation', 'embedding', 'thumbnail', 'classification'
    )),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),
    priority INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_processing_queue_status (status),
    INDEX idx_processing_queue_priority (priority DESC, created_at),
    INDEX idx_processing_queue_type (processing_type),
    INDEX idx_processing_queue_document (document_id)
);

-- Document Storage Metrics Table
CREATE TABLE IF NOT EXISTS document_storage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    total_documents INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    avg_size_bytes BIGINT DEFAULT 0,
    file_type_counts JSONB DEFAULT '{}',
    storage_cost DECIMAL(12,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_storage_metrics_date (date)
);

-- GDPR Compliance Table
CREATE TABLE IF NOT EXISTS gdpr_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    request_type VARCHAR(20) NOT NULL CHECK (request_type IN (
        'export', 'delete', 'correct', 'restrict'
    )),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'rejected'
    )),
    request_data JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_gdpr_requests_user (user_id),
    INDEX idx_gdpr_requests_status (status)
);

-- Row Level Security (RLS) for audit logs
ALTER TABLE document_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_classifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY document_audit_logs_policy ON document_audit_logs
    FOR ALL TO authenticated_user
    USING (
        user_id = current_user_id()
        OR EXISTS (
            SELECT 1 FROM user_permissions
            WHERE user_id = current_user_id()
            AND permission = 'view_audit_logs'
        )
    );

-- Comments for documentation
COMMENT ON TABLE document_audit_logs IS 'Enterprise audit trail for all document operations';
COMMENT ON TABLE document_watermarks IS 'Digital watermarks for document security and tracking';
COMMENT ON TABLE document_classifications IS 'AI-powered document classification and metadata';
COMMENT ON TABLE document_analytics IS 'Daily analytics for document usage statistics';
COMMENT ON TABLE document_similarity_cache IS 'Precomputed document similarity scores';
COMMENT ON TABLE document_processing_queue IS 'Background processing queue for heavy operations';
COMMENT ON TABLE document_storage_metrics IS 'Storage usage metrics and cost tracking';
COMMENT ON TABLE gdpr_requests IS 'GDPR compliance requests and tracking';