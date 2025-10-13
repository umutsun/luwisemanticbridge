const { asembPool } = require('../config/database.config');

async function resetTables() {
  try {
    console.log('Dropping old tables...');

    // Drop tables in correct order (due to foreign keys)
    await asembPool.query('DROP TABLE IF EXISTS advanced_scraped_content CASCADE');
    await asembPool.query('DROP TABLE IF EXISTS advanced_site_configurations CASCADE');
    await asembPool.query('DROP TABLE IF EXISTS advanced_scraping_projects CASCADE');

    // Also drop new tables if they exist
    await asembPool.query('DROP TABLE IF EXISTS scraped_content CASCADE');
    await asembPool.query('DROP TABLE IF EXISTS site_configurations CASCADE');
    await asembPool.query('DROP TABLE IF EXISTS scraping_projects CASCADE');

    console.log('Old tables dropped successfully');

    // Create new tables
    console.log('Creating new tables...');

    await asembPool.query(`
      CREATE TABLE scraping_projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        auto_process BOOLEAN DEFAULT true,
        auto_embeddings BOOLEAN DEFAULT true,
        real_time BOOLEAN DEFAULT true,
        status TEXT DEFAULT 'active',
        stats JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await asembPool.query(`
      CREATE TABLE site_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT,
        selectors JSONB DEFAULT '{}',
        auth_config JSONB DEFAULT '{}',
        rate_limit INTEGER DEFAULT 10,
        pagination_config JSONB DEFAULT '{}',
        filters JSONB DEFAULT '{}',
        transforms JSONB DEFAULT '{}',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await asembPool.query(`
      CREATE TABLE scraped_content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES scraping_projects(id),
        site_id UUID REFERENCES site_configurations(id),
        url TEXT NOT NULL,
        title TEXT,
        content TEXT,
        category TEXT,
        metadata JSONB DEFAULT '{}',
        processed BOOLEAN DEFAULT false,
        embedding_generated BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await asembPool.query(`
      CREATE INDEX IF NOT EXISTS idx_scraped_content_category ON scraped_content(category);
      CREATE INDEX IF NOT EXISTS idx_scraped_content_project ON scraped_content(project_id);
      CREATE INDEX IF NOT EXISTS idx_scraped_content_url ON scraped_content(url);
      CREATE INDEX IF NOT EXISTS idx_scraped_content_processed ON scraped_content(processed);
    `);

    console.log('New tables created successfully');

    // Create test project
    console.log('Creating test project...');
    const result = await asembPool.query(`
      INSERT INTO scraping_projects
      (name, description, category, auto_process, auto_embeddings, real_time, status, created_at)
      VALUES ('Pinokyo Analysis', 'Analysis of Pinokyo-related content from various sources', 'pinokyo', true, true, true, 'active', NOW())
      RETURNING *
    `);

    console.log('Test project created:', result.rows[0]);

    await asembPool.end();
    console.log('Done!');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetTables();