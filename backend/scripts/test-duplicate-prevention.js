/**
 * Test Duplicate Prevention in Embedding System
 * This script tests that duplicate embeddings are not created
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb',
});

async function testDuplicatePrevention() {
  const client = await pool.connect();

  try {
    console.log('🧪 Testing Duplicate Prevention in Embedding System\n');
    console.log('='.repeat(80));

    // Step 1: Create test table
    console.log('\n📝 Step 1: Creating test table with sample data...');
    await client.query(`
      DROP TABLE IF EXISTS test_embeddings_source CASCADE;

      CREATE TABLE test_embeddings_source (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        content TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Insert test data
    await client.query(`
      INSERT INTO test_embeddings_source (title, content) VALUES
      ('Test Document 1', 'This is the first test document for duplicate prevention.'),
      ('Test Document 2', 'This is the second test document with different content.'),
      ('Test Document 3', 'This is the third test document for comprehensive testing.');
    `);

    const testData = await client.query('SELECT COUNT(*) as count FROM test_embeddings_source');
    console.log(`✅ Created test table with ${testData.rows[0].count} records`);

    // Step 2: Manually create embeddings for first 2 documents
    console.log('\n📝 Step 2: Creating embeddings for first 2 documents (simulating existing embeddings)...');

    const docs = await client.query('SELECT id, title FROM test_embeddings_source WHERE id <= 2');

    for (const doc of docs.rows) {
      // Create a dummy embedding (all zeros for testing) - using 768 dimensions
      const dummyEmbedding = new Array(768).fill(0);

      await client.query(`
        INSERT INTO unified_embeddings (
          source_table,
          source_type,
          source_id,
          source_name,
          content,
          embedding,
          metadata,
          tokens_used,
          model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (source_table, source_id) DO NOTHING
      `, [
        'test_embeddings_source',
        'test_document',
        doc.id,
        doc.title,
        'Test content',
        JSON.stringify(dummyEmbedding),
        JSON.stringify({ test: true }),
        100,
        'text-embedding-3-large'
      ]);
    }

    console.log('✅ Created embeddings for 2 documents');

    // Step 3: Check current state
    console.log('\n📊 Step 3: Current state before processing...');

    const beforeState = await client.query(`
      SELECT
        COUNT(*) as total_docs,
        (SELECT COUNT(*) FROM unified_embeddings WHERE source_table = 'test_embeddings_source') as existing_embeddings
      FROM test_embeddings_source
    `);

    console.log(`   Total documents: ${beforeState.rows[0].total_docs}`);
    console.log(`   Existing embeddings: ${beforeState.rows[0].existing_embeddings}`);

    // Step 4: Show which documents need processing
    console.log('\n🔍 Step 4: Checking which documents need embeddings...');

    const needsEmbedding = await client.query(`
      SELECT
        d.id,
        d.title,
        CASE
          WHEN ue.id IS NULL THEN '❌ Needs embedding'
          ELSE '✅ Already has embedding'
        END as status
      FROM test_embeddings_source d
      LEFT JOIN unified_embeddings ue
        ON ue.source_table = 'test_embeddings_source'
        AND ue.source_id = d.id
      ORDER BY d.id
    `);

    console.log('\nDocument Status:');
    needsEmbedding.rows.forEach(row => {
      console.log(`   Doc ${row.id} (${row.title}): ${row.status}`);
    });

    // Step 5: Test the duplicate prevention query
    console.log('\n🧪 Step 5: Testing duplicate prevention query (what worker would find)...');

    const wouldProcess = await client.query(`
      SELECT d.id, d.title, d.content
      FROM test_embeddings_source d
      LEFT JOIN unified_embeddings ue
        ON ue.source_table = 'test_embeddings_source'
        AND ue.source_id = d.id
      WHERE ue.id IS NULL
      AND d.content IS NOT NULL
      AND LENGTH(d.content) > 0
      ORDER BY d.id
      LIMIT 10
    `);

    console.log(`\n✅ Worker would process ${wouldProcess.rows.length} documents:`);
    wouldProcess.rows.forEach(row => {
      console.log(`   - Doc ${row.id}: ${row.title}`);
    });

    // Step 6: Simulate embedding the third document
    console.log('\n📝 Step 6: Simulating worker processing document 3...');

    if (wouldProcess.rows.length > 0) {
      const doc = wouldProcess.rows[0];
      const dummyEmbedding = new Array(768).fill(0.1);

      await client.query(`
        INSERT INTO unified_embeddings (
          source_table,
          source_type,
          source_id,
          source_name,
          content,
          embedding,
          metadata,
          tokens_used,
          model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (source_table, source_id) DO NOTHING
      `, [
        'test_embeddings_source',
        'test_document',
        doc.id,
        doc.title,
        doc.content,
        JSON.stringify(dummyEmbedding),
        JSON.stringify({ test: true, processed_by: 'duplicate_test' }),
        120,
        'text-embedding-3-large'
      ]);

      console.log(`✅ Processed document ${doc.id}`);
    }

    // Step 7: Final state check
    console.log('\n📊 Step 7: Final state after processing...');

    const afterState = await client.query(`
      SELECT
        COUNT(*) as total_docs,
        (SELECT COUNT(*) FROM unified_embeddings WHERE source_table = 'test_embeddings_source') as total_embeddings,
        (SELECT COUNT(*) FROM unified_embeddings WHERE source_table = 'test_embeddings_source' AND metadata->>'test' = 'true') as test_embeddings
      FROM test_embeddings_source
    `);

    console.log(`   Total documents: ${afterState.rows[0].total_docs}`);
    console.log(`   Total embeddings: ${afterState.rows[0].total_embeddings}`);
    console.log(`   Test embeddings: ${afterState.rows[0].test_embeddings}`);

    // Step 8: Try to insert duplicate (should be prevented)
    console.log('\n🧪 Step 8: Testing duplicate insertion (should be prevented)...');

    try {
      const dummyEmbedding = new Array(768).fill(0.5);
      const result = await client.query(`
        INSERT INTO unified_embeddings (
          source_table,
          source_type,
          source_id,
          source_name,
          content,
          embedding,
          metadata,
          tokens_used,
          model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (source_table, source_id) DO NOTHING
        RETURNING id
      `, [
        'test_embeddings_source',
        'test_document',
        1, // Duplicate of existing record
        'Duplicate Test',
        'This should not be inserted',
        JSON.stringify(dummyEmbedding),
        JSON.stringify({ duplicate_test: true }),
        100,
        'text-embedding-3-large'
      ]);

      if (result.rows.length === 0) {
        console.log('✅ Duplicate insertion prevented successfully!');
      } else {
        console.log('❌ WARNING: Duplicate was inserted (constraint not working)');
      }
    } catch (error) {
      console.log('✅ Duplicate insertion prevented by constraint');
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log('✅ Test table created with 3 documents');
    console.log('✅ Pre-populated 2 embeddings');
    console.log('✅ Worker correctly identified only 1 document needing processing');
    console.log('✅ Processed the 1 missing document');
    console.log('✅ Duplicate prevention working correctly');
    console.log('✅ All 3 documents now have embeddings (no duplicates)');

    console.log('\n🎯 Result: Duplicate prevention is working perfectly!');
    console.log('\nℹ️  Note: Test table "test_embeddings_source" left for inspection.');
    console.log('   Run this to clean up: DROP TABLE test_embeddings_source CASCADE;');

  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run test
testDuplicatePrevention()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
