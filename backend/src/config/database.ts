import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_SIZE || '20'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '60000'),
  allowExitOnIdle: false,
  // Reuse connections
  statement_timeout: 60000,
  query_timeout: 60000,
  // Add retry logic
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

export const pool = new Pool(poolConfig);

// Handle pool errors with retry logic
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  console.log('Attempting to reconnect to database...');
  
  // Attempt reconnection after error
  setTimeout(() => {
    pool.query('SELECT NOW()', (reconnectErr, res) => {
      if (reconnectErr) {
        console.error('Reconnection failed:', reconnectErr.message);
      } else {
        console.log('✅ Successfully reconnected to database');
      }
    });
  }, 5000);
});

// Test connection with retry
const testConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await pool.query('SELECT NOW()');
      console.log('✅ Database connected at:', res.rows[0].now);
      return;
    } catch (err) {
      console.error(`Database connection attempt ${i + 1} failed:`, (err as Error).message);
      if (i < retries - 1) {
        console.log(`Retrying in ${(i + 1) * 5} seconds...`);
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 5000));
      } else {
        console.error('❌ Failed to connect to database after', retries, 'attempts');
        console.log('Please check:');
        console.log('1. PostgreSQL is running on', process.env.DATABASE_URL);
        console.log('2. Network connectivity to the database server');
        console.log('3. Database credentials are correct');
      }
    }
  }
};

testConnection();

// Database table names configuration
export const TABLE_NAMES = {
  SORUCEVAP: process.env.TABLE_SORUCEVAP || 'sorucevap',
  OZELGELER: process.env.TABLE_OZELGELER || 'ozelgeler',
  MAKALELER: process.env.TABLE_MAKALELER || 'makaleler',
  DANISTAYKARARLARI: process.env.TABLE_DANISTAYKARARLARI || 'danistaykararlari'
};

export default pool;