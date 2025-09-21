const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: '91.99.229.96',
  database: 'rag_chatbot',
  password: 'Semsiye!22',
  port: 5432
});

async function checkRecords() {
  try {
    // Check total records
    const totalResult = await pool.query('SELECT COUNT(*) FROM public.ozelgeler');
    console.log('Total records in ozelgeler:', totalResult.rows[0].count);

    // Check max ID
    const maxIdResult = await pool.query('SELECT MAX(id) FROM public.ozelgeler');
    console.log('Maximum ID in ozelgeler:', maxIdResult.rows[0].max);

    // Check records after ID 1056
    const afterResult = await pool.query('SELECT COUNT(*) FROM public.ozelgeler WHERE id > 1056');
    console.log('Records after ID 1056:', afterResult.rows[0].count);

    // Check the actual distribution of IDs
    const distResult = await pool.query(`
      SELECT
        COUNT(CASE WHEN id <= 771 THEN 1 END) as first_771,
        COUNT(CASE WHEN id > 771 AND id <= 1001 THEN 1 END) as next_230,
        COUNT(CASE WHEN id > 1001 THEN 1 END) as beyond_1001
      FROM public.ozelgeler
    `);
    console.log('\nID distribution:');
    console.log('  IDs 1-771:', distResult.rows[0].first_771);
    console.log('  IDs 772-1001:', distResult.rows[0].next_230);
    console.log('  IDs >1001:', distResult.rows[0].beyond_1001);

    // Check if there are gaps
    const gapResult = await pool.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT id) as distinct_ids,
        (MAX(id) - MIN(id) + 1) as expected_count
      FROM public.ozelgeler
    `);
    console.log('\nGap analysis:');
    console.log('  Total records:', gapResult.rows[0].total_records);
    console.log('  Distinct IDs:', gapResult.rows[0].distinct_ids);
    console.log('  Expected if sequential:', gapResult.rows[0].expected_count);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkRecords();