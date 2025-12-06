/**
 * Verify import_jobs table exists
 */

import pool from '../config/database';

async function verifyTable() {
  try {
    console.log('Checking import_jobs table...');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'import_jobs'
      );
    `);

    console.log('Table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      // Get table structure
      const structure = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'import_jobs'
        ORDER BY ordinal_position;
      `);

      console.log('\nTable structure:');
      structure.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      });

      // Count rows
      const count = await pool.query('SELECT COUNT(*) FROM import_jobs');
      console.log('\nTotal rows:', count.rows[0].count);

      // Get recent jobs
      const recent = await pool.query('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 5');
      console.log('\nRecent jobs:');
      console.log(JSON.stringify(recent.rows, null, 2));
    }

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

verifyTable();
