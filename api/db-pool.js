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
    lsembPool = new Pool(poolConfig);
  }
  return lsembPool;
}

module.exports = { getLsembPool };
