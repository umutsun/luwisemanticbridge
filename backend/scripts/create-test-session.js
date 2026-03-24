require('dotenv').config();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createTestSession() {
  const userId = 'ee182e9f-6c00-4af8-bd32-19261e432eb0';
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour

  // Create token with userId field (not id)
  const token = jwt.sign(
    { userId: userId, email: 'admin@vergilex.com', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Delete existing session and insert new one
  await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  await pool.query(
    'INSERT INTO user_sessions (id, user_id, token, expires_at, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [sessionId, userId, token, expiresAt]
  );

  console.log('TOKEN=' + token);
  await pool.end();
}

createTestSession().catch(e => { console.error(e.message); process.exit(1); });
