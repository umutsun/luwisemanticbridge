// api/knexfile.js
const path = require('path');

// Load environment variables from the root .env files
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.lsemb') });

const connectionString = process.env.LSEMB_DATABASE_URL || process.env.DATABASE_URL;

const sslConfig = process.env.POSTGRES_SSL === 'true' 
  ? { ssl: { rejectUnauthorized: false } } 
  : {};

module.exports = {
  development: {
    client: 'pg',
    connection: connectionString,
    ...sslConfig,
    migrations: {
      directory: './migrations'
    }
  },
  production: {
    client: 'pg',
    connection: connectionString,
    ...sslConfig,
    migrations: {
      directory: './migrations'
    }
  }
};
