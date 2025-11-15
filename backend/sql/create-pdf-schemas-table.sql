-- PDF Schemas Table
-- Stores reusable schemas for batch processing PDF documents

CREATE TABLE IF NOT EXISTS pdf_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Document categorization
  document_type VARCHAR(100),  -- 'novel', 'invoice', 'contract', 'research', etc.
  category VARCHAR(100),        -- Same as metadata.category

  -- Schema definition
  field_selections JSONB NOT NULL,  -- Selected fields from metadata (e.g., ['title', 'author.name', 'mainCharacters'])
  sql_schema JSONB NOT NULL,        -- SQL table structure { tableName, columns: [{ name, type, isPrimary, ... }] }
  analyze_config JSONB,             -- Configuration for analyze method (focus keywords, etc.)

  -- Table reference
  target_table_name VARCHAR(255),   -- Name of the database table this schema creates/uses
  source_database VARCHAR(100),     -- Which database: 'lsemb' or 'source_db'

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  -- Metadata
  created_by UUID,                  -- References users table (optional, can be NULL)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Sample data (optional, for preview)
  sample_json JSONB,                -- Example of the JSON structure this schema expects

  CONSTRAINT unique_schema_name UNIQUE (name)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_pdf_schemas_type ON pdf_schemas(document_type);
CREATE INDEX IF NOT EXISTS idx_pdf_schemas_category ON pdf_schemas(category);
CREATE INDEX IF NOT EXISTS idx_pdf_schemas_table ON pdf_schemas(target_table_name);
CREATE INDEX IF NOT EXISTS idx_pdf_schemas_created_at ON pdf_schemas(created_at DESC);

-- Sample schema for books/novels
INSERT INTO pdf_schemas (
  name,
  description,
  document_type,
  category,
  field_selections,
  sql_schema,
  analyze_config,
  target_table_name,
  source_database,
  sample_json
) VALUES (
  'Novel Template',
  'Standard template for novel/book PDF processing',
  'novel',
  'Other',
  '["title", "author.name", "author.bio", "summary", "mainCharacters", "genre", "language", "pageCount"]'::jsonb,
  '{
    "tableName": "novels",
    "columns": [
      {"name": "id", "type": "UUID", "isPrimary": true, "default": "gen_random_uuid()"},
      {"name": "title", "type": "TEXT", "nullable": false},
      {"name": "author_name", "type": "TEXT"},
      {"name": "author_bio", "type": "TEXT"},
      {"name": "summary", "type": "TEXT"},
      {"name": "main_characters", "type": "TEXT[]"},
      {"name": "genre", "type": "VARCHAR(100)"},
      {"name": "language", "type": "VARCHAR(10)"},
      {"name": "page_count", "type": "INTEGER"},
      {"name": "created_at", "type": "TIMESTAMP", "default": "NOW()"}
    ]
  }'::jsonb,
  '{
    "focusKeywords": ["character", "plot", "author"],
    "extractSections": ["about the author", "synopsis"]
  }'::jsonb,
  'novels',
  'source_db',
  '{
    "title": "Jitterbug Perfume",
    "author": {"name": "Tom Robbins", "bio": "..."},
    "summary": "...",
    "mainCharacters": ["Alobar", "Kudra"],
    "genre": "Fiction",
    "language": "en",
    "pageCount": 357
  }'::jsonb
) ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE pdf_schemas IS 'Stores reusable schemas for batch processing PDF documents';
COMMENT ON COLUMN pdf_schemas.field_selections IS 'JSON array of field paths to extract from metadata (e.g., ["title", "author.name"])';
COMMENT ON COLUMN pdf_schemas.sql_schema IS 'Complete SQL table structure definition';
COMMENT ON COLUMN pdf_schemas.analyze_config IS 'Configuration for the analyze method (focus keywords, sections to extract, etc.)';
