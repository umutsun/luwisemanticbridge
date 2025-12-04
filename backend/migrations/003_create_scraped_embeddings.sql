-- Create scraped_embeddings table for web crawler data embeddings
-- This table stores embeddings from web scrapers (crawl4ai) stored in Redis

CREATE TABLE IF NOT EXISTS scraped_embeddings (
  id SERIAL PRIMARY KEY,
  scraper_name VARCHAR(255) NOT NULL,  -- Name of the crawler (e.g., 'yeditepe_crawler')
  url TEXT NOT NULL UNIQUE,             -- Source URL (unique constraint prevents duplicates)
  chunk_text TEXT NOT NULL,             -- The actual content/text chunk
  embedding vector(1536),                -- OpenAI text-embedding-3-small/large
  metadata JSONB DEFAULT '{}'::jsonb,   -- Additional metadata (title, tags, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  model_name VARCHAR(100),              -- Embedding model used
  tokens_used INTEGER DEFAULT 0,        -- Token usage tracking
  source_table VARCHAR(255),            -- Optional: link to source DB table
  CONSTRAINT scraped_embeddings_url_key UNIQUE (url)
);

-- Create index on scraper_name for filtering
CREATE INDEX IF NOT EXISTS idx_scraped_embeddings_scraper_name ON scraped_embeddings(scraper_name);

-- Create index on source_table for linking
CREATE INDEX IF NOT EXISTS idx_scraped_embeddings_source_table ON scraped_embeddings(source_table);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_scraped_embeddings_created_at ON scraped_embeddings(created_at DESC);

-- Create vector similarity search index (HNSW for fast approximate search)
CREATE INDEX IF NOT EXISTS scraped_embeddings_embedding_idx ON scraped_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add comment
COMMENT ON TABLE scraped_embeddings IS 'Stores embeddings from web crawler data (crawl4ai Redis storage)';
COMMENT ON COLUMN scraped_embeddings.scraper_name IS 'Crawler identifier from Redis (crawl4ai:{scraper_name}:*)';
COMMENT ON COLUMN scraped_embeddings.url IS 'Source URL - unique constraint for deduplication';
COMMENT ON COLUMN scraped_embeddings.source_table IS 'Optional reference to transformed source database table';
