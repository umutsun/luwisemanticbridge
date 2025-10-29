const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function runFix() {
  try {
    console.log('🔧 Fixing OZELGELER file type...');

    // Update file type
    const updateResult = await pool.query(`
      UPDATE documents
      SET file_type = 'csv'
      WHERE filename LIKE '%OZELGELER%'
        AND file_type = 'text'
    `);

    console.log(`✅ Updated ${updateResult.rowCount} rows`);

    // Verify the change
    const verifyResult = await pool.query(`
      SELECT id, filename, file_type, size
      FROM documents
      WHERE filename LIKE '%OZELGELER%'
    `);

    console.log('\n📋 Verification Results:');
    verifyResult.rows.forEach(row => {
      console.log(`  - ID: ${row.id}, File: ${row.filename}, Type: ${row.file_type}, Size: ${row.size}`);
    });

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

runFix();
