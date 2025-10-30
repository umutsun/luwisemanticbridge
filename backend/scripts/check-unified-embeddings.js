const { Pool } = require('pg');

const pool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: '12Kemal1221'
});

async function checkUnifiedEmbeddings() {
  try {
    console.log('🔍 Checking unified_embeddings table...\n');

    // Record type distribution
    const typeQuery = await pool.query(`
      SELECT record_type, COUNT(*) as count
      FROM unified_embeddings
      GROUP BY record_type
      ORDER BY count DESC
    `);

    console.log('📊 Record Type Distribution:');
    typeQuery.rows.forEach(row => {
      console.log(`  - ${row.record_type}: ${row.count} records`);
    });

    // Sample records from each type
    console.log('\n📝 Sample Records:');
    for (const type of typeQuery.rows) {
      const sampleQuery = await pool.query(`
        SELECT id, record_type, metadata->>'title' as title,
               LEFT(content, 100) as content_preview
        FROM unified_embeddings
        WHERE record_type = $1
        LIMIT 2
      `, [type.record_type]);

      console.log(`\n  ${type.record_type}:`);
      sampleQuery.rows.forEach(row => {
        console.log(`    - ID: ${row.id}`);
        console.log(`      Title: ${row.title || 'N/A'}`);
        console.log(`      Content: ${row.content_preview}...`);
      });
    }

    // Check for any filters or constraints
    console.log('\n🔧 Table Constraints:');
    const constraintsQuery = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'unified_embeddings'
    `);
    constraintsQuery.rows.forEach(row => {
      console.log(`  - ${row.constraint_name}: ${row.constraint_type}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUnifiedEmbeddings();
