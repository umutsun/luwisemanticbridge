// ASB Migration API - api/migration-api.js
const express = require('express');
const { Client } = require('pg');
const Redis = require('ioredis');
const OpenAI = require('openai');
const crypto = require('crypto');
const router = express.Router();

// Database configuration
const pgConfig = {
  host: process.env.PG_HOST || '91.99.229.96',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'postgres',
  user: process.env.PG_USER || 'makaleler',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD
};

// Redis configuration
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_DB || 2
    });

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper function to chunk text
function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlap;
  }
  
  return chunks;
}

// Generate embeddings
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding error:', error);
    return null;
  }
}

// Check connection status
router.get('/status', async (req, res) => {
  try {
    const redisStatus = await redis.ping() === 'PONG';
    
    const pg = new Client(pgConfig);
    await pg.connect();
    const pgStatus = await pg.query('SELECT 1').then(() => true).catch(() => false);
    await pg.end();
    
    res.json({
      connections: {
        redis: redisStatus,
        postgres: pgStatus
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get database statistics
router.get('/database/stats', async (req, res) => {
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    const stats = {};
    const tables = ['embeddings', 'chunks', 'sources', 'queries'];
    
    for (const table of tables) {
      try {
        const result = await pg.query(`SELECT COUNT(*) as count FROM ${table}`);
        stats[table] = result.rows[0].count;
      } catch (e) {
        stats[table] = 0;
      }
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await pg.end();
  }
});

// Analyze table
router.post('/analyze', async (req, res) => {
  const { table } = req.body;
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    const countResult = await pg.query(`SELECT COUNT(*) as count FROM "${table}"`);
    
    let readyCount = countResult.rows[0].count;
    try {
      const readyResult = await pg.query(`
        SELECT COUNT(*) as ready 
        FROM "${table}" t
        WHERE NOT EXISTS (
          SELECT 1 FROM sources s 
          WHERE s.original_id = t.id::text 
          AND s.table_name = $1
        )
      `, [table]);
      readyCount = readyResult.rows[0].ready;
    } catch (e) {
      // sources table doesn't exist yet
    }
    
    res.json({
      count: countResult.rows[0].count,
      ready: readyCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await pg.end();
  }
});

// Preview table data
router.get('/preview', async (req, res) => {
  const { table, limit = 5 } = req.query;
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    const preview = await pg.query(`SELECT * FROM "${table}" LIMIT $1`, [parseInt(limit)]);
    res.json(preview.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await pg.end();
  }
});

// Migration with streaming
router.post('/migrate', async (req, res) => {
  // ... (migration logic remains the same)
});

// Test database connection with Redis Caching
router.post('/database/test', async (req, res) => {
  const { host, port, database, user, password, ssl } = req.body;

  // Create a stable key for caching, excluding the password
  const keyData = JSON.stringify({ host, port, database, user, ssl });
  const cacheKey = `db:test:${crypto.createHash('md5').update(keyData).digest('hex')}`;

  try {
    // 1. Check cache first
    const cachedResult = await redis.get(cacheKey);
    if (cachedResult) {
      const parsedResult = JSON.parse(cachedResult);
      const status = parsedResult.success ? 200 : 500;
      return res.status(status).json({ ...parsedResult, cached: true });
    }

    // 2. If not in cache, attempt connection
    const connectionConfig = {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
      connectionTimeoutMillis: 5000,
    };

    // Only add the ssl property if it's explicitly true.
    // The pg client can behave differently with ssl: false vs no ssl property at all.
    if (ssl === true) {
      connectionConfig.ssl = { rejectUnauthorized: false };
    }
    
    const client = new Client(connectionConfig);
    await client.connect();
    const result = await client.query('SELECT version()');
    await client.end();
    
    const successResponse = {
      success: true,
      message: 'Database connection successful!',
      version: result.rows[0].version,
      database,
    };

    // 3. Cache the successful result (e.g., for 10 minutes)
    await redis.set(cacheKey, JSON.stringify(successResponse), 'EX', 600);
    
    return res.json(successResponse);

  } catch (error) {
    const { password: _, ...configForLogging } = req.body;
    console.error('[DB Test Error]', {
      message: error.message,
      code: error.code,
      configUsed: configForLogging
    });
    
    const errorResponse = {
      success: false,
      error: error.message,
      code: error.code,
    };

    // 4. Cache the failure result (e.g., for 2 minutes to prevent spamming)
    await redis.set(cacheKey, JSON.stringify(errorResponse), 'EX', 120);
    
    return res.status(500).json(errorResponse);
  }
});

module.exports = router;