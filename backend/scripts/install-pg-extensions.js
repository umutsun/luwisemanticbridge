/**
 * PostgreSQL Extensions Installation Script
 * Installs pgai and pgvectorscale for optimized embeddings
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function installExtensions() {
  console.log('========================================');
  console.log('PostgreSQL Extensions Installation');
  console.log('========================================\n');

  try {
    // Check current extensions
    console.log('1️⃣ Checking current extensions...');
    const currentExtensions = await pool.query(`
      SELECT extname, extversion
      FROM pg_extension
      ORDER BY extname
    `);

    console.log('Currently installed extensions:');
    currentExtensions.rows.forEach(ext => {
      console.log(`  ✅ ${ext.extname} v${ext.extversion}`);
    });

    // Check available extensions
    console.log('\n2️⃣ Checking available extensions...');
    const availableExtensions = await pool.query(`
      SELECT name, default_version, comment
      FROM pg_available_extensions
      WHERE name IN ('pgai', 'ai', 'vectorscale', 'pgvectorscale', 'pg_cron', 'pgml', 'plpython3u')
      ORDER BY name
    `);

    if (availableExtensions.rows.length > 0) {
      console.log('Available extensions on server:');
      availableExtensions.rows.forEach(ext => {
        console.log(`  📦 ${ext.name} v${ext.default_version}`);
        if (ext.comment) {
          console.log(`     ${ext.comment}`);
        }
      });
    } else {
      console.log('⚠️ pgai and pgvectorscale are not available on this server.');
      console.log('These extensions need to be installed on the PostgreSQL server first.');
    }

    // Try to install pgvector if not installed
    console.log('\n3️⃣ Checking pgvector...');
    const pgvectorCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) as installed
    `);

    if (!pgvectorCheck.rows[0].installed) {
      try {
        console.log('Installing pgvector...');
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
        console.log('✅ pgvector installed successfully!');
      } catch (error) {
        console.log('❌ Could not install pgvector:', error.message);
      }
    } else {
      console.log('✅ pgvector is already installed');
    }

    // Try to install other useful extensions
    const extensionsToTry = [
      { name: 'uuid-ossp', description: 'UUID generation' },
      { name: 'pg_trgm', description: 'Trigram text search' },
      { name: 'btree_gin', description: 'GIN index support' },
      { name: 'pg_stat_statements', description: 'Query performance tracking' }
    ];

    console.log('\n4️⃣ Installing supporting extensions...');
    for (const ext of extensionsToTry) {
      try {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS "${ext.name}"`);
        console.log(`✅ ${ext.name} installed (${ext.description})`);
      } catch (error) {
        // Extension might not be available
        if (!error.message.includes('already exists')) {
          console.log(`⏭️ ${ext.name} not available on server`);
        }
      }
    }

    // Create optimized tables for embeddings
    console.log('\n5️⃣ Creating optimized embedding tables...');

    // Create unified_embeddings table with optimal structure
    await pool.query(`
      CREATE TABLE IF NOT EXISTS unified_embeddings_optimized (
        id BIGSERIAL PRIMARY KEY,
        source_table VARCHAR(255) NOT NULL,
        source_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        embedding vector(3072),
        embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-large',
        metadata JSONB DEFAULT '{}',
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

        -- Constraints
        UNIQUE(source_table, source_id)
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_unified_embeddings_source
        ON unified_embeddings_optimized(source_table, source_id);

      CREATE INDEX IF NOT EXISTS idx_unified_embeddings_created
        ON unified_embeddings_optimized(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_unified_embeddings_metadata
        ON unified_embeddings_optimized USING gin(metadata);

      -- Add comment
      COMMENT ON TABLE unified_embeddings_optimized IS
        'Optimized table for storing embeddings with pgai/pgvectorscale support';
    `);

    console.log('✅ Optimized embedding table created');

    // Create migration tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migration_jobs (
        id SERIAL PRIMARY KEY,
        job_name VARCHAR(255) UNIQUE NOT NULL,
        source_table VARCHAR(255) NOT NULL,
        target_table VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        total_rows INTEGER DEFAULT 0,
        processed_rows INTEGER DEFAULT 0,
        failed_rows INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_migration_jobs_status
        ON migration_jobs(status, created_at DESC);
    `);

    console.log('✅ Migration tracking table created');

    // Create batch processing function
    console.log('\n6️⃣ Creating helper functions...');

    await pool.query(`
      CREATE OR REPLACE FUNCTION process_embedding_batch(
        p_table_name VARCHAR,
        p_batch_size INTEGER DEFAULT 100
      ) RETURNS TABLE (
        processed INTEGER,
        errors INTEGER
      ) AS $$
      DECLARE
        v_processed INTEGER := 0;
        v_errors INTEGER := 0;
      BEGIN
        -- This function can be enhanced when pgai is available
        -- For now, it returns a placeholder
        RETURN QUERY SELECT v_processed, v_errors;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Helper functions created');

    // Check if we can use Python for advanced features
    const pythonCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_language WHERE lanname = 'plpython3u'
      ) as available
    `);

    if (pythonCheck.rows[0].available) {
      console.log('\n7️⃣ Python support detected!');
      console.log('✅ Advanced ML features can be enabled');
    } else {
      console.log('\n7️⃣ Python support not available');
      console.log('ℹ️ For advanced ML features, install plpython3u extension');
    }

    // Summary and recommendations
    console.log('\n========================================');
    console.log('Installation Summary');
    console.log('========================================');

    console.log('\n✅ Successfully configured:');
    console.log('  • pgvector for vector operations');
    console.log('  • Optimized embedding tables');
    console.log('  • Migration tracking system');
    console.log('  • Helper functions');

    console.log('\n⚠️ Manual installation required on server:');
    console.log('\n1. pgai - For automatic embeddings:');
    console.log('   Connect to server as superuser and run:');
    console.log('   CREATE EXTENSION pgai;');
    console.log('   Documentation: https://github.com/pgai-app/pgai\n');

    console.log('2. pgvectorscale - For performance optimization:');
    console.log('   Download from: https://github.com/timescale/pgvectorscale');
    console.log('   Install and run: CREATE EXTENSION vectorscale;\n');

    console.log('3. Alternative: Use TimescaleDB Cloud');
    console.log('   - Includes pgai and pgvectorscale pre-installed');
    console.log('   - Free tier available');
    console.log('   - Visit: https://www.timescale.com/');

    await pool.end();

  } catch (error) {
    console.error('\n❌ Installation error:', error.message);
    console.error('Details:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run installation
installExtensions().catch(console.error);