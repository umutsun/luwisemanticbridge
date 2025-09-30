import pool from '../config/database';

async function checkRagData() {
  try {
    console.log('Checking RAG_DATA table structure...\n');

    // Check if RAG_DATA exists and its structure
    const structureResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'RAG_DATA'
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    if (structureResult.rows.length === 0) {
      console.log('❌ RAG_DATA table not found');
      return;
    }

    console.log('RAG_DATA table structure:');
    structureResult.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'}`);
    });

    // Check sample data
    const sampleResult = await pool.query(`
      SELECT COUNT(*) as total_count
      FROM RAG_DATA
    `);

    console.log(`\nTotal records in RAG_DATA: ${sampleResult.rows[0].total_count}`);

    // Check sample records
    if (sampleResult.rows[0].total_count > 0) {
      const samplesResult = await pool.query(`
        SELECT id, source_table, title, LEFT(content, 100) as content_preview
        FROM RAG_DATA
        LIMIT 5
      `);

      console.log('\nSample records:');
      samplesResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Source: ${row.source_table}, Title: ${row.title}`);
        console.log(`    Content: ${row.content_preview}...`);
      });

      // Check unique source tables
      const sourcesResult = await pool.query(`
        SELECT source_table, COUNT(*) as count
        FROM RAG_DATA
        GROUP BY source_table
        ORDER BY count DESC
      `);

      console.log('\nSource table distribution:');
      sourcesResult.rows.forEach(row => {
        console.log(`  - ${row.source_table}: ${row.count} records`);
      });
    }

  } catch (error) {
    console.error('Error checking RAG_DATA:', error);
  } finally {
    await pool.end();
  }
}

checkRagData();