import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_SIZE || '30'),
  // Increase idle timeout to 10 minutes for long-running operations like embedding
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '600000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '120000'),
  allowExitOnIdle: false,
  // Reuse connections
  statement_timeout: 300000, // 5 minutes for long queries
  query_timeout: 300000, // 5 minutes
  // Add retry logic
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Add retry on connection errors (handled by application logic)
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
        console.log(' Successfully reconnected to database');
      }
    });
  }, 5000);
});

// Test connection with retry
const testConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await pool.query('SELECT NOW()');
      console.log(' Database connected at:', res.rows[0].now);
      return;
    } catch (err) {
      console.error(`Database connection attempt ${i + 1} failed:`, (err as Error).message);
      if (i < retries - 1) {
        console.log(`Retrying in ${(i + 1) * 5} seconds...`);
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 5000));
      } else {
        console.error(' Failed to connect to database after', retries, 'attempts');
        console.log('Please check:');
        console.log('1. PostgreSQL is running on', process.env.DATABASE_URL);
        console.log('2. Network connectivity to the database server');
        console.log('3. Database credentials are correct');
      }
    }
  }
};

testConnection();

// Database table names configuration - dynamically loaded
// Note: Use tableConfigService to get actual table names dynamically
export const TABLE_NAMES = {} as { [key: string]: string };

// Helper function to get table names dynamically
export async function getTableNames(): Promise<{ [key: string]: string }> {
  const { tableConfigService } = await import('./table-config.service');
  return await tableConfigService.getTableNames();
}

export default pool;