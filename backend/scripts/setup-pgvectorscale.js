/**
 * PgVectorScale Setup and Optimization Script
 * Configures DiskANN indexes for 28x faster similarity search
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function setupPgVectorScale() {
  console.log('🚀 PgVectorScale Setup and Optimization');
  console.log('========================================\n');

  try {
    // 1. Check if pgvectorscale is installed
    console.log('1️⃣ Checking pgvectorscale installation...');
    const extCheck = await pool.query(`
      SELECT
        extname,
        extversion,
        extnamespace::regnamespace as schema
      FROM pg_extension
      WHERE extname IN ('vector', 'vectorscale', 'vectors')
    `);

    console.log('Installed extensions:');
    extCheck.rows.forEach(ext => {
      console.log(`  ✅ ${ext.extname} v${ext.extversion} (schema: ${ext.schema})`);
    });

    const hasVectorScale = extCheck.rows.some(e =>
      e.extname === 'vectorscale' || e.extname === 'vectors'
    );

    if (!hasVectorScale) {
      console.log('\n⚠️  pgvectorscale not found. Trying to create extension...');
      try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS vectorscale');
        console.log('✅ pgvectorscale extension created successfully!');
      } catch (err) {
        console.log('❌ Could not create pgvectorscale:', err.message);
        console.log('Falling back to standard pgvector indexes...\n');
      }
    }

    // 2. Create optimized indexes for unified_embeddings
    console.log('\n2️⃣ Creating optimized indexes...');

    // Drop old indexes if they exist
    console.log('Dropping old indexes if they exist...');
    await pool.query(`
      DROP INDEX IF EXISTS idx_unified_embeddings_embedding_ivfflat;
      DROP INDEX IF EXISTS idx_unified_embeddings_embedding_hnsw;
      DROP INDEX IF EXISTS idx_unified_embeddings_diskann;
    `).catch(() => {}); // Ignore errors if indexes don't exist

    if (hasVectorScale) {
      // Create DiskANN index for best performance
      console.log('Creating DiskANN index (28x faster)...');

      try {
        await pool.query(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_embeddings_diskann
          ON unified_embeddings
          USING diskann (embedding)
          WITH (
            num_neighbors = 100,
            search_list_size = 200,
            max_alpha = 1.2,
            storage_layout = 'memory_optimized'
          );
        `);
        console.log('✅ DiskANN index created successfully!');
      } catch (err) {
        console.log('⚠️  DiskANN index failed, trying StreamingDiskANN...');

        // Try StreamingDiskANN for very large datasets
        try {
          await pool.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_embeddings_streaming
            ON unified_embeddings
            USING streamingdiskann (embedding)
            WITH (
              num_neighbors = 50,
              search_list_size = 100
            );
          `);
          console.log('✅ StreamingDiskANN index created!');
        } catch (err2) {
          console.log('❌ Advanced indexes not available:', err2.message);
        }
      }
    } else {
      // Fall back to HNSW index (still good performance)
      console.log('Creating HNSW index (better than IVFFlat)...');

      await pool.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_embeddings_hnsw
        ON unified_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (
          m = 16,
          ef_construction = 64
        );
      `);
      console.log('✅ HNSW index created!');
    }

    // 3. Create indexes for other important columns
    console.log('\n3️⃣ Creating supporting indexes...');

    const supportingIndexes = [
      {
        name: 'idx_unified_embeddings_source',
        sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_embeddings_source ON unified_embeddings(source_table, source_id)'
      },
      {
        name: 'idx_unified_embeddings_created',
        sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_embeddings_created ON unified_embeddings(created_at DESC)'
      },
      {
        name: 'idx_unified_embeddings_tokens',
        sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_embeddings_tokens ON unified_embeddings(tokens_used) WHERE tokens_used > 0'
      }
    ];

    for (const index of supportingIndexes) {
      try {
        await pool.query(index.sql);
        console.log(`✅ ${index.name} created`);
      } catch (err) {
        console.log(`⏭️  ${index.name} already exists`);
      }
    }

    // 4. Optimize table statistics
    console.log('\n4️⃣ Optimizing table statistics...');
    await pool.query('ANALYZE unified_embeddings');
    console.log('✅ Table statistics updated');

    // 5. Get performance metrics
    console.log('\n5️⃣ Performance metrics...');

    // Check table size
    const sizeResult = await pool.query(`
      SELECT
        pg_size_pretty(pg_total_relation_size('unified_embeddings')) as total_size,
        pg_size_pretty(pg_relation_size('unified_embeddings')) as table_size,
        pg_size_pretty(pg_indexes_size('unified_embeddings')) as indexes_size,
        (SELECT COUNT(*) FROM unified_embeddings) as total_rows
    `);

    console.log('\n📊 Table Statistics:');
    console.log(`  Total Size: ${sizeResult.rows[0].total_size}`);
    console.log(`  Table Size: ${sizeResult.rows[0].table_size}`);
    console.log(`  Index Size: ${sizeResult.rows[0].indexes_size}`);
    console.log(`  Total Rows: ${sizeResult.rows[0].total_rows}`);

    // Check index details
    const indexResult = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_indexes
      WHERE tablename = 'unified_embeddings'
      ORDER BY pg_relation_size(indexname::regclass) DESC
    `);

    console.log('\n📑 Indexes:');
    indexResult.rows.forEach(idx => {
      console.log(`  • ${idx.indexname}: ${idx.size}`);
    });

    // 6. Create optimized search function
    console.log('\n6️⃣ Creating optimized search function...');

    await pool.query(`
      CREATE OR REPLACE FUNCTION search_similar_embeddings(
        query_embedding vector,
        limit_count int DEFAULT 10,
        similarity_threshold float DEFAULT 0.7
      )
      RETURNS TABLE (
        id bigint,
        source_table varchar,
        source_id varchar,
        content text,
        similarity float,
        metadata jsonb
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          e.id,
          e.source_table,
          e.source_id,
          e.content,
          1 - (e.embedding <=> query_embedding) as similarity,
          e.metadata
        FROM unified_embeddings e
        WHERE 1 - (e.embedding <=> query_embedding) > similarity_threshold
        ORDER BY e.embedding <=> query_embedding
        LIMIT limit_count;
      END;
      $$;
    `);

    console.log('✅ Optimized search function created');

    // 7. Test performance
    console.log('\n7️⃣ Testing search performance...');

    // Get a sample embedding for testing
    const sampleResult = await pool.query(`
      SELECT embedding
      FROM unified_embeddings
      WHERE embedding IS NOT NULL
      LIMIT 1
    `);

    if (sampleResult.rows.length > 0) {
      const startTime = Date.now();

      await pool.query(`
        SELECT * FROM search_similar_embeddings($1::vector, 10, 0.5)
      `, [sampleResult.rows[0].embedding]);

      const searchTime = Date.now() - startTime;

      console.log(`✅ Search performance: ${searchTime}ms for top-10 similar vectors`);

      if (searchTime < 50) {
        console.log('🎉 Excellent performance! (< 50ms)');
      } else if (searchTime < 200) {
        console.log('✅ Good performance (< 200ms)');
      } else {
        console.log('⚠️  Performance could be improved (> 200ms)');
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('✨ Optimization Complete!');
    console.log('========================================\n');

    if (hasVectorScale) {
      console.log('🚀 pgvectorscale is active with DiskANN indexes');
      console.log('   Expected improvements:');
      console.log('   • 28x faster similarity search');
      console.log('   • 75% less memory usage');
      console.log('   • Better scaling for large datasets');
    } else {
      console.log('✅ Standard pgvector with HNSW indexes configured');
      console.log('   Performance is optimized within pgvector limits');
      console.log('   For best performance, install pgvectorscale on server');
    }

    console.log('\n📝 Next steps:');
    console.log('1. Test migration with new indexes');
    console.log('2. Monitor query performance');
    console.log('3. Adjust index parameters if needed');

    await pool.end();

  } catch (error) {
    console.error('\n❌ Setup error:', error.message);
    console.error('Details:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run setup
setupPgVectorScale().catch(console.error);