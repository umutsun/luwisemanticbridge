const { Pool } = require('pg');
require('dotenv').config();

async function runMigration() {
  const pool = new Pool({
    host: '91.99.229.96',
    port: 5432,
    database: 'lsemb',
    user: 'postgres',
    password: 'Semsiye!22'
  });

  try {
    console.log('Connecting to database...');

    // Add processing_status column
    console.log('Adding processing_status column...');
    await pool.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'waiting'
    `);

    // Create index
    console.log('Creating index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_processing_status
      ON documents(processing_status)
    `);

    // Update existing documents
    console.log('Updating existing documents...');
    await pool.query(`
      UPDATE documents
      SET processing_status =
        CASE
          WHEN transform_status = 'completed' THEN 'transformed'
          WHEN metadata->>'analysis' IS NOT NULL THEN 'analyzed'
          ELSE 'waiting'
        END
      WHERE processing_status IS NULL OR processing_status = 'waiting'
    `);

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await pool.end();
  }
}

runMigration();