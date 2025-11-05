const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@localhost:5432/lsemb'
});

(async () => {
  try {
    console.log('🔍 Checking database content...\n');

    // Check unified_embeddings
    const ue = await pool.query('SELECT COUNT(*) as count FROM unified_embeddings');
    console.log('✅ Unified Embeddings total:', ue.rows[0].count);

    // Check rag_data
    const rd = await pool.query('SELECT COUNT(*) as count FROM rag_data');
    console.log('✅ RAG Data total:', rd.rows[0].count);

    // Check for damga vergisi content
    const dv = await pool.query("SELECT COUNT(*) as count FROM unified_embeddings WHERE content ILIKE '%damga%' OR content ILIKE '%vergisi%'");
    console.log('✅ Damga vergisi related:', dv.rows[0].count);

    // Check table types
    const tt = await pool.query("SELECT metadata->>'table' as table_name, COUNT(*) as count FROM unified_embeddings WHERE metadata->>'table' IS NOT NULL GROUP BY metadata->>'table' ORDER BY count DESC");
    console.log('\n📊 Table distribution:');
    tt.rows.forEach(row => console.log(`  ${row.table_name}: ${row.count}`));

    await pool.end();
    console.log('\n✅ Database check complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
})();
