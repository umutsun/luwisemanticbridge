import pool from '../config/database';

async function checkTables() {
  try {
    console.log('Checking database tables...\n');

    // Get all tables in public schema
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('Available tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('\nChecking for specific tables:');
    const expectedTables = ['Soru-Cevap', 'Özelgeler', 'Makaleler', 'Danıştay Kararları', 'RAG_DATA'];

    for (const table of expectedTables) {
      const checkResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [table]);

      const exists = checkResult.rows[0].exists;
      console.log(`  ${table}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    }

    // Check RAG_DATA table structure
    try {
      const ragStructure = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'RAG_DATA'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `);

      if (ragStructure.rows.length > 0) {
        console.log('\nRAG_DATA table structure:');
        ragStructure.rows.forEach(col => {
          console.log(`  - ${col.column_name}: ${col.data_type}`);
        });
      }
    } catch (error) {
      console.log('\nRAG_DATA table not found or cannot access structure');
    }

  } catch (error) {
    console.error('Error checking tables:', error);
  } finally {
    await pool.end();
  }
}

checkTables();