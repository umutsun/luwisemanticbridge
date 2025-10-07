const bcrypt = require('./backend/node_modules/bcrypt');
const { Pool } = require('./backend/node_modules/pg');

async function createAdmin() {
  const pool = new Pool({
    host: '91.99.229.96',
    port: 5432,
    database: 'asemb',
    user: 'postgres',
    password: 'Psd1234!'
  });

  const email = 'admin@asb.com';
  const password = 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // First, let's check if user exists
    const checkResult = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );

    if (checkResult.rows.length > 0) {
      // Update existing user
      await pool.query(
        'UPDATE users SET password = $1, role = $2 WHERE email = $3',
        [passwordHash, 'admin', email]
      );
      console.log('✅ Admin user updated successfully');
    } else {
      // Create new user
      await pool.query(
        'INSERT INTO users (username, email, password, role, email_verified, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
        ['admin', email, passwordHash, 'admin', true]
      );
      console.log('✅ Admin user created successfully');
    }

    // Verify the user
    const verifyResult = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [email]
    );
    console.log('📋 Admin user details:', verifyResult.rows[0]);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

createAdmin();