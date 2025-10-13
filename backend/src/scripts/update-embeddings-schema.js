/**
 * Script to update the document_embeddings table schema
 * Run with: node src/scripts/update-embeddings-schema.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Read SQL file
const sqlPath = path.join(__dirname, 'update-embeddings-schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'asemb',
    user: process.env.POSTGRES_USER || 'asemb_user',
    password: process.env.POSTGRES_PASSWORD || 'Semsiye!22',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Running embeddings schema migration...');

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`\n⚡ Executing:\n${statement.substring(0, 100)}...`);
        await pool.query(statement);
        console.log('✅ Success');
      }
    }

    // Verify the changes
    console.log('\n🔍 Verifying table structure...');
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'document_embeddings'
      AND column_name IN ('model_name', 'tokens_used', 'embedding_dimension')
      ORDER BY ordinal_position
    `);

    console.log('\n✨ Updated columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.column_default ? `(default: ${row.column_default})` : ''}`);
    });

    // Check embedding_model_usage table
    const usageTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'embedding_model_usage'
      ) as exists
    `);

    if (usageTable.rows[0].exists) {
      console.log('\n✅ embedding_model_usage table created successfully');
    }

    console.log('\n🎉 Migration completed successfully!');

    // Show current embedding stats
    const stats = await pool.query(`
      SELECT model_name, COUNT(*) as embeddings, SUM(tokens_used) as total_tokens
      FROM document_embeddings
      GROUP BY model_name
    `);

    if (stats.rows.length > 0) {
      console.log('\n📊 Current embedding statistics:');
      stats.rows.forEach(row => {
        console.log(`  ${row.model_name}: ${row.embeddings} embeddings, ${row.total_tokens || 0} tokens`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });
  runMigration();
}

module.exports = { runMigration };