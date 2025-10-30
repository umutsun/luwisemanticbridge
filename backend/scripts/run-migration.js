/**
 * Run Complete Migration Script
 * This script executes the complete_migration.sql file
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb',
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting LSEMB Database Migration...\n');

    // Read SQL file
    const sqlPath = path.join(__dirname, '..', 'sql', 'complete_migration.sql');
    console.log(`📖 Reading migration file: ${sqlPath}`);
    const sql = await fs.readFile(sqlPath, 'utf8');

    console.log('✅ SQL file loaded successfully');
    console.log(`📊 File size: ${(sql.length / 1024).toFixed(2)} KB\n`);

    // Execute migration
    console.log('⚙️  Executing migration...');
    const startTime = Date.now();

    await client.query('BEGIN');

    try {
      // Execute the entire SQL script
      await client.query(sql);

      await client.query('COMMIT');

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Migration completed successfully in ${duration}s\n`);

      // Verify tables were created
      console.log('🔍 Verifying table creation...');
      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN (
          'unified_embeddings',
          'document_embeddings',
          'message_embeddings',
          'embedding_tokens',
          'migration_progress'
        )
        ORDER BY table_name
      `);

      console.log('\n✅ Created tables:');
      tables.rows.forEach(row => {
        console.log(`   ✓ ${row.table_name}`);
      });

      // Verify functions
      console.log('\n🔍 Verifying functions...');
      const functions = await client.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
        AND routine_name IN (
          'search_unified_embeddings',
          'search_documents',
          'search_messages',
          'calculate_embedding_cost',
          'update_updated_at_column'
        )
        ORDER BY routine_name
      `);

      console.log('\n✅ Created functions:');
      functions.rows.forEach(row => {
        console.log(`   ✓ ${row.routine_name}()`);
      });

      // Verify views
      console.log('\n🔍 Verifying views...');
      const views = await client.query(`
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name IN (
          'embedding_statistics',
          'token_cost_summary',
          'migration_status_summary'
        )
        ORDER BY table_name
      `);

      console.log('\n✅ Created views:');
      views.rows.forEach(row => {
        console.log(`   ✓ ${row.table_name}`);
      });

      // Check pgvector extension
      console.log('\n🔍 Verifying extensions...');
      const extensions = await client.query(`
        SELECT extname, extversion
        FROM pg_extension
        WHERE extname IN ('vector', 'uuid-ossp', 'pg_trgm')
        ORDER BY extname
      `);

      console.log('\n✅ Active extensions:');
      extensions.rows.forEach(row => {
        console.log(`   ✓ ${row.extname} (v${row.extversion})`);
      });

      console.log('\n' + '='.repeat(80));
      console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
      console.log('='.repeat(80));
      console.log('\nNext steps:');
      console.log('  1. Restart the Python service if not already running');
      console.log('  2. Test the /api/python/pgai/worker/start endpoint');
      console.log('  3. Monitor embedding generation progress');
      console.log('  4. Check embedding_statistics view for progress\n');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });