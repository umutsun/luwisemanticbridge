-- Migration: Chunk Relationships and Entities
-- Date: 2026-02-17
-- Description: Adds graph layer for chunk-to-chunk relationships and entity extraction.
--              Backward-compatible: does NOT modify unified_embeddings table.
--              Enables graph-enhanced RAG retrieval.

-- =============================================
-- TABLE: chunk_relationships
-- Stores directed relationships between chunks in unified_embeddings.
-- source_chunk_id -> target_chunk_id with type and confidence.
-- target_chunk_id can be NULL for unresolved references (target not yet embedded).
-- =============================================

CREATE TABLE IF NOT EXISTS chunk_relationships (
    id SERIAL PRIMARY KEY,
    source_chunk_id INTEGER NOT NULL,
    target_chunk_id INTEGER,
    relationship_type VARCHAR(30) NOT NULL,
    confidence FLOAT DEFAULT 0.0,
    extracted_by VARCHAR(20) DEFAULT 'llm',
    target_reference TEXT,
    target_law_code VARCHAR(20),
    target_article_number VARCHAR(20),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Relationship type constraint
ALTER TABLE chunk_relationships
DROP CONSTRAINT IF EXISTS chk_relationship_type;

ALTER TABLE chunk_relationships
ADD CONSTRAINT chk_relationship_type
CHECK (relationship_type IN ('references', 'amends', 'parent_of', 'related_to', 'supersedes', 'interprets'));

-- Extracted by constraint
ALTER TABLE chunk_relationships
DROP CONSTRAINT IF EXISTS chk_extracted_by;

ALTER TABLE chunk_relationships
ADD CONSTRAINT chk_extracted_by
CHECK (extracted_by IN ('llm', 'regex', 'manual'));

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_cr_source ON chunk_relationships(source_chunk_id);
CREATE INDEX IF NOT EXISTS idx_cr_target ON chunk_relationships(target_chunk_id) WHERE target_chunk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cr_type ON chunk_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_cr_law_ref ON chunk_relationships(target_law_code, target_article_number)
    WHERE target_law_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cr_unresolved ON chunk_relationships(target_chunk_id)
    WHERE target_chunk_id IS NULL AND target_law_code IS NOT NULL;

-- Prevent exact duplicate relationships
CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_unique_rel
ON chunk_relationships(source_chunk_id, COALESCE(target_chunk_id, -1), relationship_type);

COMMENT ON TABLE chunk_relationships IS 'Graph layer: directed relationships between unified_embeddings chunks. Types: references (atif), amends (degistirme), parent_of (hiyerarsi), related_to, supersedes (yururlukten kaldirma), interprets (yorumlama)';
COMMENT ON COLUMN chunk_relationships.target_chunk_id IS 'NULL when reference is unresolved (target chunk not yet in unified_embeddings)';
COMMENT ON COLUMN chunk_relationships.target_reference IS 'Raw reference text from source, e.g. "GVK Madde 40". Used for resolution.';
COMMENT ON COLUMN chunk_relationships.confidence IS 'Extraction confidence 0.0-1.0. LLM extraction typically 0.7-0.95.';

-- =============================================
-- TABLE: chunk_entities
-- Extracted entities from chunk content (law codes, article numbers, etc.)
-- =============================================

CREATE TABLE IF NOT EXISTS chunk_entities (
    id SERIAL PRIMARY KEY,
    chunk_id INTEGER NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_value TEXT NOT NULL,
    normalized_value TEXT,
    position_start INTEGER,
    position_end INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Entity type constraint
ALTER TABLE chunk_entities
DROP CONSTRAINT IF EXISTS chk_entity_type;

ALTER TABLE chunk_entities
ADD CONSTRAINT chk_entity_type
CHECK (entity_type IN ('law_code', 'article_number', 'institution', 'date', 'rate', 'penalty', 'concept'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ce_chunk ON chunk_entities(chunk_id);
CREATE INDEX IF NOT EXISTS idx_ce_type_value ON chunk_entities(entity_type, normalized_value);
CREATE INDEX IF NOT EXISTS idx_ce_type ON chunk_entities(entity_type);

-- Prevent duplicate entities for same chunk
CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_unique_entity
ON chunk_entities(chunk_id, entity_type, entity_value);

COMMENT ON TABLE chunk_entities IS 'Extracted entities from unified_embeddings chunk content. Types: law_code, article_number, institution, date, rate, penalty, concept';

-- =============================================
-- TABLE: extraction_jobs
-- Tracks batch extraction job progress
-- =============================================

CREATE TABLE IF NOT EXISTS extraction_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    source_table VARCHAR(100),
    total_chunks INTEGER DEFAULT 0,
    processed_chunks INTEGER DEFAULT 0,
    failed_chunks INTEGER DEFAULT 0,
    relationships_found INTEGER DEFAULT 0,
    entities_found INTEGER DEFAULT 0,
    model_used VARCHAR(50),
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE extraction_jobs
DROP CONSTRAINT IF EXISTS chk_extraction_status;

ALTER TABLE extraction_jobs
ADD CONSTRAINT chk_extraction_status
CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_ej_status ON extraction_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ej_job_id ON extraction_jobs(job_id);

COMMENT ON TABLE extraction_jobs IS 'Tracks batch relationship/entity extraction jobs. Used for progress monitoring and resume.';

-- =============================================
-- AUTO-UPDATE TRIGGER FOR updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_chunk_relationships_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cr_updated_at ON chunk_relationships;
CREATE TRIGGER trigger_cr_updated_at
BEFORE UPDATE ON chunk_relationships
FOR EACH ROW
EXECUTE FUNCTION update_chunk_relationships_timestamp();

-- =============================================
-- SETTINGS: Relationship extraction configuration
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.extractionEnabled', 'true', 'relationships', 'Enable LLM-based relationship extraction from chunk content')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.graphRetrievalEnabled', 'false', 'relationships', 'Enable graph-enhanced retrieval in RAG scoring pipeline. Enable after batch extraction completes.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.graphBoostScore', '0.08', 'relationships', 'Base boost score for graph-related results (0.0-0.2). Applied per mutual reference found.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.maxGraphHops', '1', 'relationships', 'Max graph traversal depth. 1=direct references only, 2=references of references.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.maxRelatedResults', '3', 'relationships', 'Max related chunks to inject from graph per query. These supplement vector search results.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.extractionModel', 'gpt-4o-mini', 'relationships', 'LLM model for entity/relationship extraction. gpt-4o-mini recommended for cost efficiency.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.batchSize', '50', 'relationships', 'Number of chunks to process per batch in extraction jobs.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES
    ('relationships.confidenceThreshold', '0.7', 'relationships', 'Minimum confidence score (0.0-1.0) to store extracted relationship. Below this threshold, relationship is discarded.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- VERIFICATION
-- =============================================
-- Run these queries to verify migration succeeded:
-- SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('chunk_relationships', 'chunk_entities', 'extraction_jobs');
-- SELECT * FROM settings WHERE category = 'relationships';

-- =============================================
-- ROLLBACK (if needed)
-- =============================================
-- DROP TABLE IF EXISTS chunk_relationships CASCADE;
-- DROP TABLE IF EXISTS chunk_entities CASCADE;
-- DROP TABLE IF EXISTS extraction_jobs CASCADE;
-- DROP FUNCTION IF EXISTS update_chunk_relationships_timestamp();
-- DELETE FROM settings WHERE category = 'relationships';
