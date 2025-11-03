const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function testEmbeddings() {
  try {
    console.log('=== Full Embeddings Diagnostic ===\n');

    // 1. Check if embeddings exist and their dimensions
    const embeddingStats = await pool.query(`
      SELECT
        metadata->>'table' as source_table,
        COUNT(*) as total_records,
        COUNT(embedding) as records_with_embeddings,
        CASE WHEN COUNT(embedding) > 0
          THEN (SELECT vector_dims(embedding) FROM unified_embeddings WHERE embedding IS NOT NULL LIMIT 1)
          ELSE 0
        END as embedding_dimensions
      FROM unified_embeddings
      GROUP BY metadata->>'table'
      ORDER BY total_records DESC
    `);

    console.log('📊 Embedding Statistics:');
    embeddingStats.rows.forEach(r => {
      console.log(`  ${r.source_table}: ${r.records_with_embeddings}/${r.total_records} have embeddings (${r.embedding_dimensions}D)`);
    });

    // 2. Test actual semantic search with a real query
    console.log('\n=== Testing: "KDV iade işlemleri nasıl yapılır?" ===\n');

    // First, let's see what record types are available
    const recordTypes = await pool.query(`
      SELECT DISTINCT metadata->>'table' as record_type
      FROM unified_embeddings
      WHERE metadata->>'table' IS NOT NULL
      ORDER BY record_type
    `);

    console.log('📁 Available record types:', recordTypes.rows.map(r => r.record_type).join(', '));

    // 3. Check RAG settings
    const ragSettings = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key LIKE '%ragSettings%'
        OR key LIKE '%Threshold%'
        OR key LIKE '%Results%'
        OR key LIKE '%embeddingProvider%'
        OR key LIKE '%embeddingModel%'
      ORDER BY key
    `);

    console.log('\n⚙️  RAG Settings:');
    ragSettings.rows.forEach(r => {
      console.log(`  ${r.key}: ${r.value}`);
    });

    // 4. Test if we can generate a mock embedding and search
    console.log('\n🔍 Testing mock semantic search (using random embedding)...');

    // Create a simple mock 768-dimensional embedding
    const mockEmbedding = Array(768).fill(0).map(() => Math.random() * 0.1);
    const embeddingString = `[${mockEmbedding.join(',')}]`;

    const mockSearchResult = await pool.query(`
      SELECT
        metadata->>'title' as title,
        metadata->>'table' as source,
        LEFT(content, 100) as preview,
        1 - (embedding <=> $1::vector) as similarity_score,
        (1 - (embedding <=> $1::vector)) * 100 as similarity_percentage
      FROM unified_embeddings
      WHERE embedding IS NOT NULL
        AND metadata->>'table' IN ('sorucevap', 'makaleler', 'ozelgeler', 'danistaykararlari')
      ORDER BY embedding <=> $1::vector
      LIMIT 10
    `, [embeddingString]);

    console.log(`Found ${mockSearchResult.rows.length} results with mock embedding:`);
    mockSearchResult.rows.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.title || 'No title'}`);
      console.log(`   Source: ${r.source}`);
      console.log(`   Similarity: ${r.similarity_percentage.toFixed(2)}% (${r.similarity_score.toFixed(4)})`);
      console.log(`   Preview: ${r.preview}...`);
    });

    // 5. Check LLM settings for embedding generation
    const llmSettings = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key LIKE '%llmSettings%'
        OR key LIKE '%apiKey%'
        OR key LIKE '%activeChatModel%'
      ORDER BY key
    `);

    console.log('\n🤖 LLM Settings:');
    llmSettings.rows.forEach(r => {
      const value = r.key.includes('apiKey') ? (r.value ? '***REDACTED***' : 'NOT SET') : r.value;
      console.log(`  ${r.key}: ${value}`);
    });

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testEmbeddings();
