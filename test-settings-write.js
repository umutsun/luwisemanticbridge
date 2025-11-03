const { Pool } = require('pg');

// Test Bookie settings write
async function testSettingsWrite() {
  const pool = new Pool({
    host: '91.99.229.96',
    port: 5432,
    database: 'bookie_lsemb',
    user: 'postgres',
    password: 'Semsiye!22'
  });

  try {
    console.log('=== Testing settings write to bookie_lsemb ===\n');

    // Check if we can read
    console.log('1. Reading existing settings...');
    const readResult = await pool.query('SELECT COUNT(*) FROM settings;');
    console.log(`   ✅ Can read: ${readResult.rows[0].count} settings found\n`);

    // Try to update an existing setting
    console.log('2. Trying to UPDATE an existing setting...');
    const updateResult = await pool.query(
      `UPDATE settings SET value = $1 WHERE key = $2 RETURNING *;`,
      ['Test Value Updated ' + new Date().toISOString(), 'test_update_key']
    );

    if (updateResult.rowCount > 0) {
      console.log(`   ✅ Updated ${updateResult.rowCount} row(s)`);
    } else {
      console.log('   ⚠️  No rows updated (key might not exist)');
    }

    // Try to insert a new setting
    console.log('\n3. Trying to INSERT a new setting...');
    try {
      const insertResult = await pool.query(
        `INSERT INTO settings (category, key, value, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
         RETURNING *;`,
        ['test_category', 'test_write_key_' + Date.now(), 'Test Value', 'Test write permission']
      );
      console.log(`   ✅ INSERT succeeded!`);
      console.log(`   Inserted/Updated:`, insertResult.rows[0]);
    } catch (err) {
      console.log(`   ❌ INSERT failed: ${err.message}`);
    }

    // Check table permissions
    console.log('\n4. Checking table permissions...');
    const permCheck = await pool.query(`
      SELECT
        grantee,
        privilege_type
      FROM information_schema.role_table_grants
      WHERE table_name='settings' AND grantee='postgres';
    `);
    console.log('   Postgres user permissions on settings table:');
    permCheck.rows.forEach(row => {
      console.log(`     - ${row.privilege_type}`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

testSettingsWrite().catch(console.error);
