/**
 * Fix Embedding Dimension Mismatch
 *
 * Database has 768D embeddings (Google), but settings say OpenAI 1536D
 * This script fixes the settings to match the database.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function fixDimensionMismatch() {
  console.log('🔧 Fixing Embedding Dimension Mismatch\n');
  console.log('='.repeat(80));

  try {
    console.log('\n📝 Step 1: Check current database dimensions');
    const dimCheck = await pool.query(`
      SELECT vector_dims(embedding) as dimension, COUNT(*) as count
      FROM unified_embeddings
      WHERE embedding IS NOT NULL
      GROUP BY vector_dims(embedding)
      ORDER BY count DESC
      LIMIT 1
    `);

    const dbDimension = dimCheck.rows[0]?.dimension;
    console.log(`   Database embeddings: ${dbDimension}D`);

    console.log('\n📝 Step 2: Determine correct model for database');
    let correctProvider, correctModel;

    if (dbDimension == 768) {
      correctProvider = 'google';
      correctModel = 'text-embedding-004';
      console.log(`   ✅ Match found: Google text-embedding-004 (768D)`);
    } else if (dbDimension == 1536) {
      correctProvider = 'openai';
      correctModel = 'text-embedding-3-small';
      console.log(`   ✅ Match found: OpenAI text-embedding-3-small (1536D)`);
    } else if (dbDimension == 3072) {
      correctProvider = 'openai';
      correctModel = 'text-embedding-3-large';
      console.log(`   ✅ Match found: OpenAI text-embedding-3-large (3072D)`);
    } else {
      console.log(`   ❌ Unknown dimension: ${dbDimension}D`);
      return;
    }

    console.log('\n📝 Step 3: Update settings to match database');

    // Update activeEmbeddingModel
    await pool.query(`
      UPDATE settings
      SET value = $1, updated_at = CURRENT_TIMESTAMP
      WHERE key = 'llmSettings.activeEmbeddingModel'
    `, [`${correctProvider}/${correctModel}`]);
    console.log(`   ✅ activeEmbeddingModel → ${correctProvider}/${correctModel}`);

    // Update embeddingModel
    await pool.query(`
      UPDATE settings
      SET value = $1, updated_at = CURRENT_TIMESTAMP
      WHERE key = 'llmSettings.embeddingModel'
    `, [correctModel]);
    console.log(`   ✅ embeddingModel → ${correctModel}`);

    // Update embeddingProvider
    await pool.query(`
      UPDATE settings
      SET value = $1, updated_at = CURRENT_TIMESTAMP
      WHERE key = 'llmSettings.embeddingProvider'
    `, [correctProvider]);
    console.log(`   ✅ embeddingProvider → ${correctProvider}`);

    console.log('\n📝 Step 4: Verify the fix');
    const verifyResult = await pool.query(`
      SELECT key, value FROM settings
      WHERE key IN (
        'llmSettings.activeEmbeddingModel',
        'llmSettings.embeddingModel',
        'llmSettings.embeddingProvider'
      )
      ORDER BY key
    `);

    console.log('\n   Current settings:');
    verifyResult.rows.forEach(row => {
      console.log(`   ✅ ${row.key.padEnd(40)} = ${row.value}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Dimension mismatch fixed!');
    console.log('\nNext steps:');
    console.log('1. Restart backend: pm2 restart lsemb-backend');
    console.log('2. Test semantic search in ChatInterface');
    console.log('3. Should now get proper search results\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixDimensionMismatch();
