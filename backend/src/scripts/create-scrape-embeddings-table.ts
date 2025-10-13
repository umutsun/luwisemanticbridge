import { lsembPool } from '../config/database.config';

async function createScrapeEmbeddingsTable() {
  console.log('Creating scrape_embeddings table...');

  try {
    // Drop table if exists (for fresh start)
    await lsembPool.query('DROP TABLE IF EXISTS scrape_embeddings CASCADE');

    // Create the table with pgvector extension
    await lsembPool.query(`
      CREATE TABLE scrape_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Content fields
        original_content TEXT NOT NULL,
        processed_content TEXT,
        summary TEXT,

        -- Embedding field
        embedding vector(1536),

        -- Source information
        source_url TEXT NOT NULL,
        source_type VARCHAR(50) DEFAULT 'scrape',

        -- Project and site relationship
        project_id UUID NOT NULL,
        site_id UUID,
        scrape_session_id UUID,

        -- Content metadata
        title TEXT,
        author TEXT,
        publish_date TIMESTAMP,
        content_type VARCHAR(50) DEFAULT 'general',
        language VARCHAR(10) DEFAULT 'tr',

        -- Entity information
        entities JSONB DEFAULT '[]',
        entity_types TEXT[] DEFAULT '{}',

        -- Extended metadata
        metadata JSONB DEFAULT '{}',

        -- Processing information
        processing_status VARCHAR(20) DEFAULT 'pending',
        processing_errors TEXT[],
        llm_processed BOOLEAN DEFAULT FALSE,

        -- Chunking information
        chunk_index INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 1,
        parent_id UUID REFERENCES scrape_embeddings(id),

        -- Quality metrics
        relevance_score FLOAT,
        quality_score FLOAT,

        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);

    // Create indexes for performance
    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_project_id ON scrape_embeddings(project_id);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_site_id ON scrape_embeddings(site_id);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_session_id ON scrape_embeddings(scrape_session_id);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_content_type ON scrape_embeddings(content_type);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_language ON scrape_embeddings(language);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_created_at ON scrape_embeddings(created_at DESC);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_processed_at ON scrape_embeddings(processed_at DESC);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_llm_processed ON scrape_embeddings(llm_processed);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_entity_types ON scrape_embeddings USING GIN(entity_types);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_metadata ON scrape_embeddings USING GIN(metadata);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_parent_id ON scrape_embeddings(parent_id);
    `);

    // Create vector index for similarity search
    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_vector ON scrape_embeddings
      USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
    `);

    // Create composite indexes for common queries
    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_project_status ON scrape_embeddings(project_id, processing_status);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_site_type ON scrape_embeddings(site_id, content_type);
    `);

    await lsembPool.query(`
      CREATE INDEX idx_scrape_embeddings_url_hash ON scrape_embeddings(md5(source_url));
    `);

    // Create trigger for updated_at
    await lsembPool.query(`
      CREATE OR REPLACE FUNCTION update_scrape_embeddings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await lsembPool.query(`
      CREATE TRIGGER scrape_embeddings_updated_at
        BEFORE UPDATE ON scrape_embeddings
        FOR EACH ROW
        EXECUTE FUNCTION update_scrape_embeddings_updated_at();
    `);

    console.log('✅ scrape_embeddings table created successfully');

    // Create table for tracking scraping statistics
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS scrape_statistics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID,
        date DATE DEFAULT CURRENT_DATE,
        total_urls INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        total_embeddings INTEGER DEFAULT 0,
        categories_processed TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ scrape_statistics table created successfully');

    // Check if table exists and show structure
    const result = await lsembPool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'scrape_embeddings'
      ORDER BY ordinal_position
    `);

    console.log('\n📊 Table Structure:');
    console.table(result.rows);

  } catch (error: any) {
    console.error('❌ Error creating tables:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createScrapeEmbeddingsTable()
    .then(() => {
      console.log('\n✅ Success! Tables are ready for scraping embeddings.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed:', error);
      process.exit(1);
    });
}

export default createScrapeEmbeddingsTable;