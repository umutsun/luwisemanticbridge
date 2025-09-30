const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { Client } = require('pg');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const chatRouter = require('./chat-router');
const dotenv = require('dotenv');

// Load environment variables from .env.asemb
const envPath = path.resolve(__dirname, '../.env.asemb');
if (fs.existsSync(envPath)) {
    console.log('Loading environment from:', envPath);
    dotenv.config({ path: envPath });
} else {
    console.log('No .env.asemb file found, using process.env');
}

const app = express();
const server = http.createServer(app);
// ... (io, redis, middleware setup remains the same)

// --- Config Loading ---
let dbConfig = {};
let redisConfig = {};
try {
    const configFile = path.resolve(__dirname, '../config/config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    dbConfig = config.database;
    redisConfig = config.redis;
} catch (error) {
    console.error("Failed to load config.json:", error);
}

// Initialize cache manager with config
const { cacheManager } = require('./src/shared/cache-manager');

// Database pool for ASEMB
const asembPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/postgres'
});

app.use(express.json()); // Add this middleware to parse JSON bodies

// --- Config API Routes ---
app.get('/api/config', (req, res) => {
    try {
        const configFile = path.resolve(__dirname, '../config/config.json');
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read configuration.' });
    }
});

app.post('/api/config', (req, res) => {
    try {
        const configFile = path.resolve(__dirname, '../config/config.json');
        // Optional: Add validation for req.body here
        fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2), 'utf-8');
        // Reload config after writing
        dbConfig = req.body.database;
        redisConfig = req.body.redis;
        res.json({ success: true, message: 'Configuration saved successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save configuration.' });
    }
});


// --- Helper for shell commands ---
const runCommand = (command) => new Promise((resolve, reject) => {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Command Error [${command}]: ${stderr}`);
      return reject(new Error(stderr || error.message));
    }
    resolve(stdout);
  });
});

// --- API Routes ---

// Health Check Endpoint for Docker
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// --- Service Management Router ---
const serviceRouter = express.Router();

// LightRAG (RAG-anything) Status
serviceRouter.get('/lightrag/status', (req, res) => {
    const options = {
        hostname: 'localhost',
        port: 8002,
        path: '/health', // Assuming a /health endpoint
        method: 'GET',
        timeout: 2000,
    };

    const request = http.request(options, (response) => {
        if (response.statusCode === 200) {
            res.json({ status: 'running' });
        } else {
            res.json({ status: 'stopped', error: `Received status code ${response.statusCode}` });
        }
    });

    request.on('error', (e) => {
        res.json({ status: 'stopped', error: e.message });
    });

    request.on('timeout', () => {
        request.destroy();
        res.json({ status: 'stopped', error: 'Request timed out' });
    });

    request.end();
});

// Postgres Status
serviceRouter.get('/postgres/status', async (req, res) => {
    const client = new Client({
        host: dbConfig.host || 'localhost',
        port: dbConfig.port || 5432,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        connectionTimeoutMillis: 2000,
    });
    try {
        await client.connect();
        await client.end();
        res.json({ status: 'running' });
    } catch (error) {
        res.json({ status: 'stopped', error: error.message });
    }
});

// Redis Status
serviceRouter.get('/redis/status', async (req, res) => {
    try {
        const redisClient = cacheManager.getRedisClient();
        const reply = await redisClient.ping();
        if (reply === 'PONG') {
            res.json({ status: 'running' });
        } else {
            res.json({ status: 'stopped', error: 'Did not receive PONG' });
        }
    } catch (error) {
        res.json({ status: 'stopped', error: error.message });
    }
});


// PM2 Status
serviceRouter.get('/pm2/status', async (req, res) => {
  try {
    const stdout = await runCommand('npx pm2 jlist');
    const processes = JSON.parse(stdout);
    const online = processes.filter(p => p.pm2_env.status === 'online').length;
    res.json({ status: 'running', online_processes: online, total_processes: processes.length });
  } catch (e) {
    res.json({ status: 'stopped', online_processes: 0, total_processes: 0 });
  }
});

// PM2 Logs
serviceRouter.get('/pm2/logs', async (req, res) => {
  try {
    // Get last 100 lines from all processes, without streaming
    const stdout = await runCommand('npx pm2 logs --lines 100 --nostream');
    res.setHeader('Content-Type', 'text/plain');
    res.send(stdout);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// PM2 Actions
serviceRouter.post('/pm2/:action', async (req, res) => {
  const { action } = req.params;
  const command = action === 'restart' ? 'restart all' : action === 'stop' ? 'stop all' : null;
  if (!command) return res.status(400).json({ error: 'Invalid action.' });
  try {
    const output = await runCommand(`npx pm2 ${command}`);
    res.json({ success: true, message: `PM2 '${command}' executed.`, output });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.use('/api/v2/services', serviceRouter);
app.use('/api/v2', chatRouter);

// --- DIRECT DATABASE TEST ROUTE ---
app.post('/api/v2/settings/database/test', async (req, res) => {
  const { host, port, database, user, password, ssl } = req.body;
  console.log('[DB Test] Gelen Bağlantı Bilgileri:', { host, port, database, user, ssl }); // Log incoming request
  
  const connectionConfig = { 
    host, 
    port: parseInt(port, 10), 
    database, 
    user, 
    password, 
    connectionTimeoutMillis: 5000 
  };

  if (ssl) {
    connectionConfig.ssl = { rejectUnauthorized: false };
  }

  const client = new Client(connectionConfig);

  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    await client.end();
    console.log('[DB Test] Bağlantı Başarılı:', result.rows[0].version);
    return res.json({ success: true, version: result.rows[0].version, database });
  } catch (error) {
    console.error('[DB Test Hatası] Detaylar:', error); // Log the full error object
    return res.status(500).json({ 
      success: false, 
      error: error.message, 
      code: error.code,
      fullError: error.toString() // Send more details to the frontend
    });
  }
});

// Save embedding settings
app.post('/api/v2/settings/embedding', async (req, res) => {
    try {
        const { embeddingProvider, embeddingModel, ollamaBaseUrl, ollamaEmbeddingModel } = req.body;

        const client = await asembPool.connect();
        try {
            // Get current AI settings
            const result = await client.query('SELECT value FROM settings WHERE key = \'ai_settings\'');
            let aiSettings = {};

            if (result.rows.length > 0 && result.rows[0].value) {
                aiSettings = result.rows[0].value;
            }

            // Update embedding settings
            aiSettings.embeddingProvider = embeddingProvider;
            aiSettings.embeddingModel = embeddingModel;
            if (ollamaBaseUrl) aiSettings.ollamaBaseUrl = ollamaBaseUrl;
            if (ollamaEmbeddingModel) aiSettings.ollamaEmbeddingModel = ollamaEmbeddingModel;

            // Save back to database
            await client.query(`
                INSERT INTO settings (key, value, category, description)
                VALUES ('ai_settings', $1, 'ai', 'AI service settings')
                ON CONFLICT (key)
                DO UPDATE SET
                    value = $1,
                    updated_at = CURRENT_TIMESTAMP
            `, [aiSettings]);

            res.json({ success: true });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Failed to save embedding settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- AI Settings (Model, Fallback, Prompts) ---

// Get AI settings
app.get('/api/v2/settings/ai', async (req, res) => {
    try {
        const client = await asembPool.connect();
        try {
            const result = await client.query("SELECT value FROM settings WHERE key = 'ai_settings'");
            if (result.rows.length > 0) {
                res.json(result.rows[0].value);
            } else {
                // Return a default structure if not found, so the frontend can handle it
                res.status(404).json({ error: 'AI settings not found. Please configure them first.' });
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Failed to get AI settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save AI settings
app.post('/api/v2/settings/ai', async (req, res) => {
    try {
        const newAiSettings = req.body;
        // Optional: Add validation for the settings object here
        const client = await asembPool.connect();
        try {
            await client.query(`
                INSERT INTO settings (key, value, category, description)
                VALUES ('ai_settings', $1, 'ai', 'AI model, fallback, and prompt settings')
                ON CONFLICT (key)
                DO UPDATE SET
                    value = $1,
                    updated_at = CURRENT_TIMESTAMP
            `, [newAiSettings]);
            res.json({ success: true, message: 'AI settings saved successfully.' });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Failed to save AI settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// ... (rest of the server file)

// Start server
const PORT = process.env.API_PORT || process.env.PORT || 8083;
server.listen(PORT, () => {
  console.log(`Alice Semantic Bridge API running on port ${PORT}`);
});
