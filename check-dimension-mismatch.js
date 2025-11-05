const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function checkDimensionMismatch() {
  console.log('🔍 Checking Embedding Dimension Mismatch\n');
  console.log('='.repeat(80));

  try {
    // Check embedding dimensions using pgvector function
    const dimResult = await pool.query(`
      SELECT
        vector_dims(embedding) as dimension,
        COUNT(*) as count,
        metadata->>'table' as source_table
      FROM unified_embeddings
      WHERE embedding IS NOT NULL
      GROUP BY vector_dims(embedding), metadata->>'table'
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('\n📊 Embedding Dimensions in Database:\n');
    dimResult.rows.forEach(row => {
      console.log(`  ${row.dimension}D: ${row.count.padStart(6)} embeddings (source: ${row.source_table})`);
    });

    // Check current embedding model settings
    const settingsResult = await pool.query(`
      SELECT key, value FROM settings
      WHERE key IN ('llmSettings.activeEmbeddingModel', 'llmSettings.embeddingModel', 'llmSettings.embeddingProvider')
      ORDER BY key
    `);

    console.log('\n📋 Current Embedding Settings:\n');
    settingsResult.rows.forEach(row => {
      console.log(`  ${row.key.padEnd(40)}: ${row.value}`);
    });

    console.log('\n⚠️  DIMENSION MISMATCH CHECK:\n');
    const expectedDims = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
      'text-embedding-004': 768,
      'multimodalembedding': 768
    };

    const currentModelRow = settingsResult.rows.find(r => r.key === 'llmSettings.embeddingModel');
    const currentModel = currentModelRow?.value || 'unknown';
    const expected = expectedDims[currentModel] || 'unknown';
    const actual = dimResult.rows[0]?.dimension || 'unknown';

    console.log(`  Current Model:       ${currentModel}`);
    console.log(`  Expected Dimension:  ${expected}`);
    console.log(`  Actual DB Dimension: ${actual}`);

    if (expected != actual && expected !== 'unknown' && actual !== 'unknown') {
      console.log('\n  ❌ MISMATCH DETECTED!');
      console.log('     This WILL cause semantic search to fail.');
      console.log('\n  Solutions:');
      console.log('     1. Change model to match DB dimension:');
      if (actual == 768) {
        console.log('        → Use: text-embedding-004 (Google, 768D)');
      } else if (actual == 1536) {
        console.log('        → Use: text-embedding-3-small (OpenAI, 1536D)');
      } else if (actual == 3072) {
        console.log('        → Use: text-embedding-3-large (OpenAI, 3072D)');
      }
      console.log('     2. OR: Re-generate all embeddings with current model');
      console.log('        (Warning: This will take time and API credits)');
    } else if (expected == actual) {
      console.log('\n  ✅ Dimensions match! Semantic search should work.');
    } else {
      console.log('\n  ⚠️  Could not verify (unknown dimension).');
    }

    // Check recent search behavior
    console.log('\n📊 Recent Search Behavior:\n');
    const ragSettings = await pool.query(`
      SELECT key, value FROM settings
      WHERE key LIKE 'ragSettings.%'
      ORDER BY key
      LIMIT 5
    `);

    ragSettings.rows.forEach(row => {
      console.log(`  ${row.key.padEnd(40)}: ${row.value}`);
    });

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDimensionMismatch();
