-- Migration: BM25 Full-Text Search via tsvector
-- Date: 2026-02-18
-- Description: Adds Turkish full-text search vector column to unified_embeddings
--              for BM25 hybrid search (combined with pgvector cosine similarity).
--              Uses GENERATED ALWAYS STORED for automatic maintenance.

-- =============================================
-- COLUMN: search_vector (tsvector, auto-generated)
-- Turkish stemming: "zamanaşımı" → "zamanaş", "VUK" → "vuk"
-- Auto-updated on INSERT/UPDATE - no trigger needed
-- =============================================

ALTER TABLE unified_embeddings
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('turkish', coalesce(content, ''))) STORED;

-- =============================================
-- INDEX: GIN index for fast full-text search
-- CONCURRENTLY avoids locking the table during build
-- =============================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ue_search_vector
  ON unified_embeddings USING gin(search_vector);
