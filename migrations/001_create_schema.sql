-- Luwi Semantic Bridge Database Schema
-- Phase 3 - Production Ready

-- Enable pgvector extension (already enabled)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  source_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create chunks table
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES embeddings(id) ON DELETE CASCADE,
  content TEXT,
  position INTEGER,
  metadata JSONB DEFAULT '{}'
);

-- Create sources table (for manage operations)
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
  ON embeddings USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_embeddings_source_id 
  ON embeddings(source_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_created_at 
  ON embeddings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
  ON chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_workspace 
  ON embeddings((metadata->>'workspace'));

-- Text search index
CREATE INDEX IF NOT EXISTS idx_embeddings_content_gin 
  ON embeddings USING gin(to_tsvector('english', text));

-- Performance tracking tables
CREATE TABLE IF NOT EXISTS queries (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,  
  execution_time_ms INTEGER,
  result_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id SERIAL PRIMARY KEY,
  operation VARCHAR(50) NOT NULL,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cache table (optional, for persistent cache)
CREATE TABLE IF NOT EXISTS chunks_cache (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  content TEXT,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance tables
CREATE INDEX IF NOT EXISTS idx_queries_created_at 
  ON queries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_operation 
  ON performance_metrics(operation);

CREATE INDEX IF NOT EXISTS idx_metrics_created_at 
  ON performance_metrics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cache_source_id 
  ON chunks_cache(source_id);

CREATE INDEX IF NOT EXISTS idx_cache_expires_at 
  ON chunks_cache(expires_at);
