const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function checkDistribution() {
  try {
    console.log('=== Checking unified_embeddings Distribution ===\n');

    // 1. Check distribution by table
    const distribution = await pool.query(`
      SELECT
        metadata->>'table' as source_table,
        COUNT(*) as total_records,
        COUNT(embedding) as with_embeddings,
        ROUND(COUNT(embedding)::numeric / COUNT(*)::numeric * 100, 2) as embedding_percentage
      FROM unified_embeddings
      GROUP BY metadata->>'table'
      ORDER BY total_records DESC
    `);

    console.log('📊 Distribution by source table:');
    distribution.rows.forEach(r => {
      console.log(`  ${r.source_table || 'NULL'}: ${r.total_records} records (${r.with_embeddings} with embeddings, ${r.embedding_percentage}%)`);
    });

    // 2. Check if imsdb exists
    console.log('\n=== Checking for imsdb table ===');
    const imsdbCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM unified_embeddings
      WHERE metadata->>'table' = 'imsdb'
    `);

    console.log(`imsdb records in unified_embeddings: ${imsdbCheck.rows[0].count}`);

    // 3. Check all available tables in database
    console.log('\n=== All tables in database ===');
    const allTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
      ORDER BY table_name
    `);

    console.log('Available tables:');
    allTables.rows.forEach(r => {
      console.log(`  - ${r.table_name}`);
    });

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

checkDistribution();
