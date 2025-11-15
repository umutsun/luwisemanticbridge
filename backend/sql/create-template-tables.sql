-- Template-Based Tables with Array Columns for Transform
-- Phase 3: Batch process results go here after experimental phase

-- ========================================
-- 1. LEGAL DOCUMENTS (Kanun/Mevzuat)
-- ========================================
CREATE TABLE IF NOT EXISTS source_legal_documents (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,

  -- Common fields (from common object)
  summary TEXT,
  keywords TEXT[],                    -- Array
  topics TEXT[],                      -- Array
  category VARCHAR(100),
  language VARCHAR(10),

  -- Focus keywords (Human-in-the-Loop)
  focus_keywords TEXT[],              -- Array
  keyword_matches JSONB,              -- {keyword: [contexts]}

  -- Statistics
  page_count INTEGER,
  word_count INTEGER,
  sentence_count INTEGER,
  character_count INTEGER,
  reading_time_minutes INTEGER,

  -- Structure
  has_table_of_contents BOOLEAN,
  chapter_count INTEGER,
  chapters TEXT[],                    -- Array
  sections TEXT[],                    -- Array
  headings TEXT[],                    -- Array

  -- Entities
  people TEXT[],                      -- Array
  organizations TEXT[],               -- Array
  locations TEXT[],                   -- Array
  dates TEXT[],                       -- Array
  money TEXT[],                       -- Array

  -- Extracted tables from Vision OCR
  extracted_tables JSONB,             -- Array of {tableId, description, rows, columns, data}

  -- Data quality
  quality_score INTEGER,
  has_structured_data BOOLEAN,
  table_count INTEGER,
  suggested_table_name VARCHAR(255),

  -- Legal-specific fields (from templateData.fields)
  kanun_no VARCHAR(50),
  maddeler TEXT[],                    -- Array! Each article separately
  yururluk_tarihi DATE,
  mevzuat_turu VARCHAR(100),
  madde_sayisi INTEGER,
  degisiklikler TEXT[],               -- Array
  yaptirimlar TEXT[],                 -- Array
  yetkili_kurum VARCHAR(200),

  -- Full metadata for embedding
  metadata_json JSONB,
  embedding vector(1536),             -- Metadata embedding for semantic search

  -- Template info
  template_id VARCHAR(50),            -- "legal_v1", "legal_v2", etc.
  template_version INTEGER DEFAULT 1,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_legal_docs_document_id ON source_legal_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_legal_docs_kanun_no ON source_legal_documents(kanun_no);
CREATE INDEX IF NOT EXISTS idx_legal_docs_mevzuat_turu ON source_legal_documents(mevzuat_turu);
CREATE INDEX IF NOT EXISTS idx_legal_docs_keywords ON source_legal_documents USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_legal_docs_maddeler ON source_legal_documents USING GIN(maddeler);
CREATE INDEX IF NOT EXISTS idx_legal_docs_yaptirimlar ON source_legal_documents USING GIN(yaptirimlar);
CREATE INDEX IF NOT EXISTS idx_legal_docs_template ON source_legal_documents(template_id);

-- Full text search on summary
CREATE INDEX IF NOT EXISTS idx_legal_docs_summary_fts ON source_legal_documents USING gin(to_tsvector('turkish', summary));

-- ========================================
-- 2. NOVELS / FICTION
-- ========================================
CREATE TABLE IF NOT EXISTS source_novels (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,

  -- Common fields
  summary TEXT,
  keywords TEXT[],
  topics TEXT[],
  category VARCHAR(100),
  language VARCHAR(10),

  -- Focus keywords
  focus_keywords TEXT[],
  keyword_matches JSONB,

  -- Statistics
  page_count INTEGER,
  word_count INTEGER,
  sentence_count INTEGER,
  character_count INTEGER,
  reading_time_minutes INTEGER,

  -- Structure
  has_table_of_contents BOOLEAN,
  chapter_count INTEGER,
  chapters TEXT[],
  sections TEXT[],
  headings TEXT[],

  -- Entities
  people TEXT[],
  organizations TEXT[],
  locations TEXT[],
  dates TEXT[],
  money TEXT[],

  -- Extracted tables
  extracted_tables JSONB,

  -- Data quality
  quality_score INTEGER,
  has_structured_data BOOLEAN,
  table_count INTEGER,
  suggested_table_name VARCHAR(255),

  -- Novel-specific fields (from templateData.fields)
  main_characters TEXT[],             -- Array! ONLY proper names
  narrative_style VARCHAR(50),        -- first_person, third_person, mixed
  genre VARCHAR(100),                 -- fiction_novel, mystery, romance, thriller, fantasy
  plot_themes TEXT[],                 -- Array
  setting TEXT,                       -- Time period and location

  -- Full metadata
  metadata_json JSONB,
  embedding vector(1536),

  -- Template info
  template_id VARCHAR(50),
  template_version INTEGER DEFAULT 1,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_novels_document_id ON source_novels(document_id);
CREATE INDEX IF NOT EXISTS idx_novels_genre ON source_novels(genre);
CREATE INDEX IF NOT EXISTS idx_novels_narrative_style ON source_novels(narrative_style);
CREATE INDEX IF NOT EXISTS idx_novels_main_characters ON source_novels USING GIN(main_characters);
CREATE INDEX IF NOT EXISTS idx_novels_plot_themes ON source_novels USING GIN(plot_themes);
CREATE INDEX IF NOT EXISTS idx_novels_keywords ON source_novels USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_novels_template ON source_novels(template_id);

-- Full text search
CREATE INDEX IF NOT EXISTS idx_novels_summary_fts ON source_novels USING gin(to_tsvector('english', summary));

-- ========================================
-- 3. SHEET MUSIC (Musical Notation)
-- ========================================
CREATE TABLE IF NOT EXISTS source_sheet_music (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,

  -- Common fields
  summary TEXT,
  keywords TEXT[],
  topics TEXT[],
  category VARCHAR(100),
  language VARCHAR(10),

  -- Focus keywords
  focus_keywords TEXT[],
  keyword_matches JSONB,

  -- Statistics
  page_count INTEGER,
  word_count INTEGER,
  sentence_count INTEGER,
  character_count INTEGER,
  reading_time_minutes INTEGER,

  -- Structure
  has_table_of_contents BOOLEAN,
  chapter_count INTEGER,
  chapters TEXT[],
  sections TEXT[],
  headings TEXT[],

  -- Entities
  people TEXT[],
  organizations TEXT[],
  locations TEXT[],
  dates TEXT[],
  money TEXT[],

  -- Extracted tables (chord progressions, etc.)
  extracted_tables JSONB,

  -- Data quality
  quality_score INTEGER,
  has_structured_data BOOLEAN,
  table_count INTEGER,
  suggested_table_name VARCHAR(255),

  -- Sheet music specific fields (from templateData.fields)
  title VARCHAR(500),
  composer VARCHAR(200),
  lyricist VARCHAR(200),
  genre VARCHAR(100),                 -- türkü, klasik, pop, rock, jazz
  musical_key VARCHAR(50),            -- Do majör, La minör, etc.
  makam VARCHAR(100),                 -- Hüseyni, Hicaz, Rast, Uşşak (Turkish classical music)
  usul VARCHAR(100),                  -- Sofyan, Düyek, Aksak (Turkish rhythm patterns)
  time_signature VARCHAR(20),         -- 4/4, 3/4, 6/8, 9/8
  tempo VARCHAR(100),                 -- Andante, Allegro, 120 BPM
  lyrics TEXT,                        -- Full lyrics with line breaks
  chords TEXT[],                      -- Array: [C, Am, F, G]
  musical_notation TEXT,
  arranger VARCHAR(200),
  publisher VARCHAR(200),
  copyright TEXT,
  difficulty VARCHAR(50),             -- beginner, intermediate, advanced
  instruments TEXT[],                 -- Array: [piyano, gitar, ses, bağlama]
  form VARCHAR(100),                  -- şarkı, türkü, marş, ninni

  -- Full metadata
  metadata_json JSONB,
  embedding vector(1536),

  -- Template info
  template_id VARCHAR(50),
  template_version INTEGER DEFAULT 1,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sheet_music_document_id ON source_sheet_music(document_id);
CREATE INDEX IF NOT EXISTS idx_sheet_music_title ON source_sheet_music(title);
CREATE INDEX IF NOT EXISTS idx_sheet_music_composer ON source_sheet_music(composer);
CREATE INDEX IF NOT EXISTS idx_sheet_music_genre ON source_sheet_music(genre);
CREATE INDEX IF NOT EXISTS idx_sheet_music_makam ON source_sheet_music(makam);
CREATE INDEX IF NOT EXISTS idx_sheet_music_usul ON source_sheet_music(usul);
CREATE INDEX IF NOT EXISTS idx_sheet_music_instruments ON source_sheet_music USING GIN(instruments);
CREATE INDEX IF NOT EXISTS idx_sheet_music_chords ON source_sheet_music USING GIN(chords);
CREATE INDEX IF NOT EXISTS idx_sheet_music_template ON source_sheet_music(template_id);

-- Full text search on lyrics (Turkish)
CREATE INDEX IF NOT EXISTS idx_sheet_music_lyrics_fts ON source_sheet_music USING gin(to_tsvector('turkish', lyrics));

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE source_legal_documents IS 'Legal documents (Kanun, Mevzuat) transformed from PDFs with template-based analysis';
COMMENT ON COLUMN source_legal_documents.maddeler IS 'Array of articles: each element is one madde (e.g., "Madde 1: Bu kanunun adı...")';
COMMENT ON COLUMN source_legal_documents.yaptirimlar IS 'Array of sanctions/penalties extracted from the document';
COMMENT ON COLUMN source_legal_documents.metadata_json IS 'Full metadata JSON for embedding - used for semantic search';
COMMENT ON COLUMN source_legal_documents.embedding IS 'Vector embedding of metadata (not raw text) for semantic search';

COMMENT ON TABLE source_novels IS 'Fiction/novels with character, plot, and narrative analysis';
COMMENT ON COLUMN source_novels.main_characters IS 'Array of character names - ONLY proper names, NOT pronouns';
COMMENT ON COLUMN source_novels.plot_themes IS 'Array of main themes (e.g., love, betrayal, coming-of-age)';

COMMENT ON TABLE source_sheet_music IS 'Sheet music / musical notation with lyrics, chords, and Turkish music metadata';
COMMENT ON COLUMN source_sheet_music.makam IS 'Turkish classical music makam (Hüseyni, Hicaz, Rast, etc.)';
COMMENT ON COLUMN source_sheet_music.usul IS 'Turkish classical music rhythm pattern (Sofyan, Düyek, Aksak, etc.)';
COMMENT ON COLUMN source_sheet_music.chords IS 'Array of chords in progression (e.g., [C, Am, F, G])';
COMMENT ON COLUMN source_sheet_music.instruments IS 'Array of instruments used (e.g., [piyano, gitar, ses, bağlama])';
