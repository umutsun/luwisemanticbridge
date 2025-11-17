const { Pool } = require("pg");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.lsemb") });

let lsembPool;

function getLsembPool() {
  if (!lsembPool) {
    const connectionString =
      process.env.LSEMB_DATABASE_URL || process.env.DATABASE_URL;
    const poolConfig = connectionString ? { connectionString } : {};

    if (process.env.POSTGRES_SSL === "true") {
      poolConfig.ssl = { rejectUnauthorized: false };
    }

    // Optimize the connection pool with explicit settings
    // These values can be tuned via environment variables for different environments
    poolConfig.max = parseInt(process.env.PG_MAX_CLIENTS, 10) || 20;
    poolConfig.idleTimeoutMillis = parseInt(process.env.PG_IDLE_TIMEOUT_MS, 10) || 10000;
    poolConfig.connectionTimeoutMillis = parseInt(process.env.PG_CONNECTION_TIMEOUT_MS, 10) || 5000;
    
    lsembPool = new Pool(poolConfig);
  }
  return lsembPool;
}

module.exports = { getLsembPool };
