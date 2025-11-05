/**
 * Check Embedding Settings in Database
 *
 * This script verifies that all required settings for semantic search are properly configured.
 */

const { Pool } = require('pg');

// Database connection - using production database
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function checkEmbeddingSettings() {
  console.log('🔍 Checking Embedding & Semantic Search Settings\n');
  console.log('='.repeat(80));

  try {
    // 1. Check LLM settings
    console.log('\n📊 1. LLM SETTINGS (llmSettings.*)\n');
    const llmResult = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key LIKE 'llmSettings.%'
      ORDER BY key
    `);

    if (llmResult.rows.length === 0) {
      console.log('❌ NO LLM settings found in database!');
    } else {
      llmResult.rows.forEach(row => {
        console.log(`   ${row.key.padEnd(40)} = ${row.value}`);
      });
    }

    // 2. Check embedding settings
    console.log('\n📊 2. EMBEDDING SETTINGS (embeddings.* / embedding.*)\n');
    const embedResult = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key LIKE 'embeddings.%' OR key LIKE 'embedding.%'
      ORDER BY key
    `);

    if (embedResult.rows.length === 0) {
      console.log('❌ NO embedding settings found in database!');
    } else {
      embedResult.rows.forEach(row => {
        console.log(`   ${row.key.padEnd(40)} = ${row.value}`);
      });
    }

    // 3. Check RAG settings
    console.log('\n📊 3. RAG SETTINGS (ragSettings.*)\n');
    const ragResult = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key LIKE 'ragSettings.%' OR key LIKE 'rag.%'
      ORDER BY key
    `);

    if (ragResult.rows.length === 0) {
      console.log('❌ NO RAG settings found in database!');
    } else {
      ragResult.rows.forEach(row => {
        console.log(`   ${row.key.padEnd(40)} = ${row.value}`);
      });
    }

    // 4. Check provider API keys
    console.log('\n📊 4. PROVIDER API KEYS\n');
    const apiKeyResult = await pool.query(`
      SELECT key,
        CASE
          WHEN value IS NULL OR value = '' THEN '❌ MISSING'
          WHEN LENGTH(value) < 20 THEN '⚠️ INVALID (too short)'
          ELSE '✅ SET (' || SUBSTRING(value, 1, 10) || '...)'
        END as status
      FROM settings
      WHERE key IN ('openai.apiKey', 'google.apiKey', 'anthropic.apiKey', 'deepseek.apiKey')
      ORDER BY key
    `);

    apiKeyResult.rows.forEach(row => {
      console.log(`   ${row.key.padEnd(25)} ${row.status}`);
    });

    // 5. Check unified embeddings table
    console.log('\n📊 5. UNIFIED EMBEDDINGS TABLE STATUS\n');
    const embeddingsCountResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding,
        COUNT(DISTINCT metadata->>'table') as unique_tables
      FROM unified_embeddings
    `);

    const stats = embeddingsCountResult.rows[0];
    console.log(`   Total records:          ${stats.total}`);
    console.log(`   With embeddings:        ${stats.with_embedding}`);
    console.log(`   Unique source tables:   ${stats.unique_tables}`);

    if (parseInt(stats.with_embedding) === 0) {
      console.log('\n   ⚠️  NO EMBEDDINGS FOUND! Semantic search will fall back to keyword search.');
    }

    // 6. Check vector index
    console.log('\n📊 6. VECTOR INDEX STATUS\n');
    const indexResult = await pool.query(`
      SELECT
        indexname,
        indexdef,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_indexes
      WHERE tablename = 'unified_embeddings'
        AND indexname LIKE '%embedding%'
        AND indexname NOT LIKE '%record_type%'
        AND indexname NOT LIKE '%has_embedding%'
      ORDER BY indexname
    `);

    if (indexResult.rows.length === 0) {
      console.log('   ⚠️  NO VECTOR INDEX FOUND!');
      console.log('   Performance will be significantly degraded (100x slower)');
      console.log('   Run: backend/scripts/QUICK-FIX.sql to create index');
    } else {
      indexResult.rows.forEach(row => {
        const indexType = row.indexname.includes('hnsw') ? 'HNSW'
          : row.indexname.includes('diskann') ? 'DiskANN'
          : row.indexname.includes('ivfflat') ? 'IVFFlat'
          : 'Unknown';

        console.log(`   ✅ ${indexType} index found: ${row.indexname}`);
        console.log(`      Size: ${row.index_size}`);
      });
    }

    // 7. Recommendations
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 RECOMMENDATIONS\n');

    const recommendations = [];

    // Check active embedding model
    const activeEmbedResult = await pool.query(`
      SELECT value FROM settings WHERE key = 'llmSettings.activeEmbeddingModel'
    `);

    if (activeEmbedResult.rows.length === 0) {
      recommendations.push('❌ Set llmSettings.activeEmbeddingModel (e.g., "openai/text-embedding-3-small")');
    } else {
      const model = activeEmbedResult.rows[0].value;
      if (model.includes('gpt-') && !model.includes('embedding')) {
        recommendations.push(`⚠️  WRONG MODEL! "${model}" is a chat model, not an embedding model!`);
        recommendations.push('   Fix: Change to "openai/text-embedding-3-small" or "google/text-embedding-004"');
      } else {
        console.log(`✅ Active embedding model is correctly set: ${model}`);
      }
    }

    // Check embedding provider
    const embeddingProviderResult = await pool.query(`
      SELECT value FROM settings WHERE key = 'llmSettings.embeddingProvider'
    `);

    if (embeddingProviderResult.rows.length === 0) {
      recommendations.push('⚠️  Set llmSettings.embeddingProvider (e.g., "openai" or "google")');
    }

    // Check similarity threshold
    const similarityThresholdResult = await pool.query(`
      SELECT value FROM settings WHERE key = 'ragSettings.similarityThreshold'
    `);

    if (similarityThresholdResult.rows.length === 0) {
      recommendations.push('⚠️  Set ragSettings.similarityThreshold (recommended: 0.02 for balanced results)');
    } else {
      const threshold = parseFloat(similarityThresholdResult.rows[0].value);
      if (threshold > 0.5) {
        recommendations.push(`⚠️  Similarity threshold is too high (${threshold}), results will be too strict`);
        recommendations.push('   Recommended: 0.02 - 0.2 for good balance');
      }
    }

    if (recommendations.length === 0) {
      console.log('✅ All settings look good!');
    } else {
      recommendations.forEach(rec => console.log(`   ${rec}`));
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('\n❌ Error checking settings:', error.message);
  } finally {
    await pool.end();
  }
}

checkEmbeddingSettings();
