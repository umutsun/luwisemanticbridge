import { lsembPool } from './config/database.config';

(async () => {
  try {
    console.log('🔍 Checking unified_embeddings table...\n');

    // Check if table exists and has data
    const countResult = await lsembPool.query('SELECT COUNT(*) as total FROM unified_embeddings');
    console.log('✅ Total records:', countResult.rows[0].total);

    // Check for embeddings
    const embeddingResult = await lsembPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as not_null_embedding
      FROM unified_embeddings
    `);
    console.log('\n📊 Embedding status:');
    console.log('  Total:', embeddingResult.rows[0].total);
    console.log('  With embedding:', embeddingResult.rows[0].with_embedding);
    console.log('  Not NULL embedding:', embeddingResult.rows[0].not_null_embedding);

    // Check vector dimension
    const dimResult = await lsembPool.query(`
      SELECT
        CASE
          WHEN embedding IS NULL THEN 'NULL'
          ELSE array_length(embedding, 1)::text || ' dimensions'
        END as dimension_info,
        COUNT(*) as count
      FROM unified_embeddings
      GROUP BY array_length(embedding, 1)
      LIMIT 5
    `);
    console.log('\n📏 Vector dimensions:');
    dimResult.rows.forEach(row => console.log(`  ${row.dimension_info}: ${row.count} records`));

    // Check for damga vergisi content
    const damgaResult = await lsembPool.query(`
      SELECT COUNT(*) as count
      FROM unified_embeddings
      WHERE content ILIKE '%damga%' OR content ILIKE '%vergisi%'
    `);
    console.log('\n🔍 Damga vergisi content:', damgaResult.rows[0].count);

    // Sample a few records
    const sampleResult = await lsembPool.query(`
      SELECT
        id,
        LEFT(content, 100) as content_preview,
        metadata->>'table' as table_name,
        CASE WHEN embedding IS NULL THEN 'NO' ELSE 'YES' END as has_embedding
      FROM unified_embeddings
      LIMIT 3
    `);
    console.log('\n📄 Sample records:');
    sampleResult.rows.forEach((row, idx) => {
      console.log(`\n  ${idx + 1}. ID: ${row.id}`);
      console.log(`     Table: ${row.table_name}`);
      console.log(`     Has embedding: ${row.has_embedding}`);
      console.log(`     Content: ${row.content_preview}...`);
    });

    await lsembPool.end();
    console.log('\n✅ Database check complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
