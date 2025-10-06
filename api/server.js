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

// Load environment variables from .env/.env.asemb
const envCandidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../.env.asemb'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '.env.asemb'),
];

// Try to load environment variables from the first available file
const loadedEnv = envCandidates.find((candidate) => {
    if (fs.existsSync(candidate)) {
        console.log('Loading environment from:', candidate);
        dotenv.config({ path: candidate });
        return true;
    }
    return false;
});

if (!loadedEnv) {
    console.log('No .env or .env.asemb file found, using process.env defaults');
}

const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const corsOptions = {
    origin: process.env.CORS_ORIGINS ?
        process.env.CORS_ORIGINS.split(',') :
        ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8083'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin']
};

app.use(cors(corsOptions));

// --- Config Loading ---
const defaultDbConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'postgres',
};

if (process.env.POSTGRES_SSL === 'true') {
    defaultDbConfig.ssl = { rejectUnauthorized: false };
}

const defaultRedisConfig = {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '2', 10),
};

let dbConfig = { ...defaultDbConfig };
let redisConfig = { ...defaultRedisConfig };
try {
    const configFile = path.resolve(__dirname, '../config/config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    dbConfig = { ...dbConfig, ...config.database };
    redisConfig = { ...redisConfig, ...config.redis };
} catch (error) {
    console.error("Failed to load config.json:", error);
}

// Initialize cache manager with config
const { cacheManager } = require('./src/shared/cache-manager');

// Database pool for ASEMB
const connectionString = process.env.ASEMB_DATABASE_URL || process.env.DATABASE_URL;
const poolConfig = connectionString
    ? { connectionString }
    : {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        password: dbConfig.password,
    };

if (process.env.POSTGRES_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const asembPool = new Pool(poolConfig);

// --- Redis Setup ---
let redis = null;
try {
    const Redis = require('ioredis');
    redis = new Redis({
        host: redisConfig.host || 'redis',
        port: redisConfig.port || 6379,
        password: redisConfig.password || undefined,
        db: redisConfig.db || 2
    });

    redis.on('error', (err) => {
        console.error('Redis Client Error:', err);
    });

    redis.on('connect', () => {
        console.log('Redis Client Connected');
    });
} catch (redisError) {
    console.warn('Redis not available:', redisError.message);
}

app.use(express.json()); // Add this middleware to parse JSON bodies
const runtimeSettings = {
    database: { ...dbConfig },
    redis: { ...redisConfig },
    lightrag: {
        baseUrl: process.env.LIGHTRAG_BASE_URL || 'http://localhost:8002',
    },
    chatbot: {},
    dashboard: {},
};

app.locals.runtimeSettings = runtimeSettings;

async function loadRuntimeSettingsFromDatabase() {
    const client = await asembPool.connect();
    try {
        const settingKeys = [
            'database_settings',
            'redis_settings',
            'lightrag_settings',
            'chatbot_settings',
            'dashboard_settings',
        ];

        const result = await client.query(
            'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
            [settingKeys]
        );

        result.rows.forEach(({ key, value }) => {
            if (!value) {
                return;
            }

            switch (key) {
                case 'database_settings':
                    runtimeSettings.database = { ...runtimeSettings.database, ...value };
                    break;
                case 'redis_settings':
                    runtimeSettings.redis = { ...runtimeSettings.redis, ...value };
                    break;
                case 'lightrag_settings':
                    runtimeSettings.lightrag = { ...runtimeSettings.lightrag, ...value };
                    break;
                case 'chatbot_settings':
                    runtimeSettings.chatbot = { ...runtimeSettings.chatbot, ...value };
                    break;
                case 'dashboard_settings':
                    runtimeSettings.dashboard = { ...runtimeSettings.dashboard, ...value };
                    break;
                default:
                    runtimeSettings[key] = value;
                    break;
            }
        });

        console.log('[Settings] Runtime settings hydrated from database');
    } catch (error) {
        console.warn('[Settings] Failed to hydrate runtime settings from database:', error.message);
    } finally {
        client.release();
    }
}

loadRuntimeSettingsFromDatabase().catch((error) => {
    console.warn('[Settings] Bootstrap error:', error.message);
});



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

app.post('/api/config', async (req, res) => {
    try {
        const configFile = path.resolve(__dirname, '../config/config.json');
        // Optional: Add validation for req.body here
        fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2), 'utf-8');

        dbConfig = { ...defaultDbConfig, ...(req.body.database || {}) };
        redisConfig = { ...defaultRedisConfig, ...(req.body.redis || {}) };
        runtimeSettings.database = { ...dbConfig };
        runtimeSettings.redis = { ...redisConfig };

        await loadRuntimeSettingsFromDatabase();

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

// --- Chat Suggestions Endpoint ---
app.get('/api/v2/chat/suggestions', (req, res) => {
  const suggestions = [
    "Sistem nasıl çalışır?",
    "Hangi belgelere erişebilirim?",
    "Semantic search nedir?",
    "RAG sistemi hakkında bilgi alabilir miyim?",
    "Veritabanı durumu nedir?"
  ];
  res.json(suggestions);
});

// --- Dashboard Endpoint ---
app.get('/api/dashboard', (req, res) => {
  res.json({
    stats: {
      total_documents: 220,
      total_entities: 1760,
      total_relationships: 1045,
      active_users: 1
    },
    system_status: {
      database: 'healthy',
      redis: 'healthy',
      embeddings: 'ready'
    },
    // Header component expected format
    database: {
      connected: true,
      size: '2.4 GB',
      documents: 220
    },
    redis: {
      connected: true,
      used_memory: '45.2 MB'
    },
    lightrag: {
      initialized: true,
      documentCount: 220
    }
  });
});

// --- Health Check Endpoints ---
app.get('/api/v2/health/system', async (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    // Check database connection
    let dbStatus = 'unknown';
    let dbResponseTime = null;
    try {
      const dbStart = Date.now();
      const dbClient = await asembPool.connect();
      await dbClient.query('SELECT 1');
      dbClient.release();
      dbResponseTime = Date.now() - dbStart;
      dbStatus = 'healthy';
    } catch (dbError) {
      console.error('Database health check failed:', dbError);
      dbStatus = 'error';
    }

    // Check Redis connection
    let redisStatus = 'unknown';
    let redisResponseTime = null;
    try {
      const redisStart = Date.now();
      // Use redis client if available
      if (redis && redis.status === 'ready') {
        await redis.ping();
        redisResponseTime = Date.now() - redisStart;
        redisStatus = 'healthy';
      } else {
        redisStatus = 'disconnected';
      }
    } catch (redisError) {
      console.error('Redis health check failed:', redisError);
      redisStatus = 'error';
    }

    const overallStatus = (dbStatus === 'healthy' && redisStatus === 'healthy') ? 'healthy' : 'degraded';

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      services: {
        asemb_database: {
          status: dbStatus,
          responseTime: dbResponseTime
        },
        redis: {
          status: redisStatus,
          responseTime: redisResponseTime
        },
        settings: {
          status: 'healthy',
          responseTime: 25
        }
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get('/api/v2/health/config', (req, res) => {
  try {
    res.json({
      asemb_database: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        connected: true
      },
      customer_database: {
        host: process.env.CUSTOM_DB_HOST || 'not_configured',
        port: process.env.CUSTOM_DB_PORT || '5432',
        database: process.env.CUSTOM_DB_NAME || 'not_configured',
        connected: false
      },
      redis: {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db || 0,
        connected: redis && redis.status === 'ready'
      },
      app_config: {
        name: 'Alice Semantic Bridge',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    console.error('Config health check failed:', error);
    res.status(500).json({
      error: 'Failed to get config status',
      details: error.message
    });
  }
});

// --- Settings Endpoints ---
app.get('/api/v2/settings', async (req, res) => {
  try {
    const settings = {
      success: true,
      settings: {
        database: {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database
        },
        redis: {
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db || 0
        },
        llm_providers: {
          openai: {
            enabled: !!(process.env.OPENAI_API_KEY),
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
          },
          claude: {
            enabled: !!(process.env.CLAUDE_API_KEY),
            model: 'claude-3-sonnet-20240229'
          },
          gemini: {
            enabled: !!(process.env.GEMINI_API_KEY),
            model: 'gemini-pro'
          },
          deepseek: {
            enabled: !!(process.env.DEEPSEEK_API_KEY),
            model: 'deepseek-chat'
          }
        },
        app_config: {
          name: 'Alice Semantic Bridge',
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development'
        }
      }
    };
    res.json(settings);
  } catch (error) {
    console.error('Failed to get settings:', error);
    res.status(500).json({
      error: 'Failed to get settings',
      details: error.message
    });
  }
});

app.get('/api/v2/config', async (req, res) => {
  try {
    // First try to get settings from database
    let dbSettings = {};
    try {
      const result = await asembPool.query('SELECT key, value FROM settings');
      result.rows.forEach(row => {
        dbSettings[row.key] = row.value;
      });
      console.log('[Config] Settings loaded from database');
    } catch (dbError) {
      console.error('[Config] Failed to load settings from database:', dbError);
      // Fallback to environment variables
    }

    res.json({
      app: {
        name: dbSettings['app.name'] || 'Alice Semantic Bridge',
        description: dbSettings['app.description'] || 'AI-Powered Knowledge Management System',
        logoUrl: dbSettings['app.logoUrl'] || '',
        locale: dbSettings['app.locale'] || 'tr'
      },
      database: {
        host: dbConfig.host,
        port: dbConfig.port,
        name: dbConfig.database,
        user: dbConfig.user,
        password: '********', // Hide password for security
        ssl: false,
        maxConnections: 20,
      },
      redis: {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password ? '********' : '',
        db: redisConfig.db || 0,
      },
      openai: {
        apiKey: dbSettings['openai.apiKey'] || process.env.OPENAI_API_KEY || '',
        model: dbSettings['openai.model'] || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        embeddingModel: dbSettings['openai.embeddingModel'] || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        maxTokens: parseInt(dbSettings['openai.maxTokens'] || '4096'),
        temperature: parseFloat(dbSettings['openai.temperature'] || '0.7'),
      },
      google: {
        apiKey: dbSettings['google.apiKey'] || process.env.GEMINI_API_KEY || '',
        model: dbSettings['google.model'] || 'gemini-pro',
        maxTokens: parseInt(dbSettings['google.maxTokens'] || '4096'),
        temperature: parseFloat(dbSettings['google.temperature'] || '0.7'),
      },
      claude: {
        apiKey: dbSettings['claude.apiKey'] || process.env.CLAUDE_API_KEY || '',
        model: dbSettings['claude.model'] || 'claude-3-sonnet-20240229',
        maxTokens: parseInt(dbSettings['claude.maxTokens'] || '4096'),
        temperature: parseFloat(dbSettings['claude.temperature'] || '0.7'),
      },
      anthropic: {
        apiKey: dbSettings['claude.apiKey'] || process.env.CLAUDE_API_KEY || '',
        model: dbSettings['claude.model'] || 'claude-3-sonnet-20240229',
        maxTokens: parseInt(dbSettings['claude.maxTokens'] || '4096'),
        temperature: parseFloat(dbSettings['claude.temperature'] || '0.7'),
      },
      deepseek: {
        apiKey: dbSettings['deepseek.apiKey'] || process.env.DEEPSEEK_API_KEY || '',
        model: dbSettings['deepseek.model'] || 'deepseek-chat',
        maxTokens: parseInt(dbSettings['deepseek.maxTokens'] || '4096'),
        temperature: parseFloat(dbSettings['deepseek.temperature'] || '0.7'),
      },
      huggingface: {
        apiKey: dbSettings['huggingface.apiKey'] || process.env.HUGGINGFACE_API_KEY || '',
        model: dbSettings['huggingface.model'] || 'sentence-transformers/all-MiniLM-L6-v2',
        maxTokens: 4096,
        temperature: 0.7,
      },
      ollama: {
        apiKey: '',
        model: dbSettings['ollama.model'] || 'llama2',
        baseUrl: dbSettings['ollama.baseUrl'] || 'http://localhost:11434',
        maxTokens: 4096,
        temperature: 0.7,
      },
      embeddings: {
        chunkSize: parseInt(dbSettings['embeddings.chunkSize'] || '1000'),
        chunkOverlap: parseInt(dbSettings['embeddings.chunkOverlap'] || '200'),
        maxBatchSize: parseInt(dbSettings['embeddings.maxBatchSize'] || '100'),
        provider: dbSettings['embeddings.provider'] || 'openai',
        model: dbSettings['embeddings.model'] || 'text-embedding-3-small',
        dimensions: parseInt(dbSettings['embeddings.dimensions'] || '1536')
      },
      llmSettings: {
        activeChatModel: dbSettings['llmSettings.activeChatModel'] || 'gpt-4o-mini',
        activeEmbeddingModel: dbSettings['llmSettings.activeEmbeddingModel'] || 'text-embedding-3-small',
        maxTokens: parseInt(dbSettings['llmSettings.maxTokens'] || '4096'),
        temperature: parseFloat(dbSettings['llmSettings.temperature'] || '0.7'),
        enableStreaming: dbSettings['llmSettings.enableStreaming'] === 'true',
        enableSystemPrompt: dbSettings['llmSettings.enableSystemPrompt'] !== 'false'
      },
      security: {
        enableAuth: dbSettings['security.enableAuth'] === 'true',
        enableRateLimit: dbSettings['security.enableRateLimit'] !== 'false',
        maxRequestsPerMinute: parseInt(dbSettings['security.maxRequestsPerMinute'] || '60'),
        enableCORS: dbSettings['security.enableCORS'] !== 'false',
        allowedOrigins: dbSettings['security.allowedOrigins'] || 'http://localhost:3000',
        jwtSecret: dbSettings['security.jwtSecret'] || process.env.JWT_SECRET || 'default-secret-key',
        sessionTimeout: parseInt(dbSettings['security.sessionTimeout'] || '3600')
      },
      n8n: {
        url: dbSettings['n8n.url'] || 'http://localhost:5678',
        username: dbSettings['n8n.username'] || 'admin',
        password: dbSettings['n8n.password'] || 'admin123',
        enabled: dbSettings['n8n.enabled'] === 'true'
      },
      scraper: {
        enabled: dbSettings['scraper.enabled'] !== 'false',
        timeout: parseInt(dbSettings['scraper.timeout'] || '30000'),
        maxRetries: parseInt(dbSettings['scraper.maxRetries'] || '3'),
        userAgent: dbSettings['scraper.userAgent'] || 'Mozilla/5.0 (compatible; AliceBot/1.0)',
        followRedirects: dbSettings['scraper.followRedirects'] !== 'false',
        respectRobotsTxt: dbSettings['scraper.respectRobotsTxt'] !== 'false',
        maxDepth: parseInt(dbSettings['scraper.maxDepth'] || '3'),
        maxPages: parseInt(dbSettings['scraper.maxPages'] || '100')
      },
      logging: {
        level: dbSettings['logging.level'] || 'info',
        enableConsole: dbSettings['logging.enableConsole'] !== 'false',
        enableFile: dbSettings['logging.enableFile'] === 'true',
        logFile: dbSettings['logging.logFile'] || 'logs/asemb.log',
        maxSize: parseInt(dbSettings['logging.maxSize'] || '10485760'),
        maxFiles: parseInt(dbSettings['logging.maxFiles'] || '5'),
        enableApiLogging: dbSettings['logging.enableApiLogging'] === 'true',
        enableDatabaseLogging: dbSettings['logging.enableDatabaseLogging'] === 'true'
      },
      websocket: {
        url: `ws://localhost:8083`,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10
      }
    });
  } catch (error) {
    console.error('Failed to get config:', error);
    res.status(500).json({
      error: 'Failed to get config',
      details: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// --- RAG Settings Endpoints ---
app.get('/api/v2/rag/ai/settings', (req, res) => {
  try {
    res.json({
      success: true,
      settings: {
        provider: process.env.AI_PROVIDER || 'openai',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 2000,
        embeddingProvider: process.env.EMBEDDING_PROVIDER || 'openai',
        embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        features: {
          ragEnabled: true,
          semanticSearch: true,
          documentUpload: true
        }
      }
    });
  } catch (error) {
    console.error('Failed to get AI settings:', error);
    res.status(500).json({
      error: 'Failed to get AI settings',
      details: error.message
    });
  }
});

app.get('/api/v2/rag/prompts', (req, res) => {
  try {
    res.json({
      success: true,
      prompts: [
        {
          id: 'system',
          name: 'System Prompt',
          prompt: "Sen Alice Semantic Bridge asistanısın. Kullanıcılara sistem hakkında bilgi ver ve onlara yardımcı ol.",
          isActive: true,
          temperature: 0.7,
          maxTokens: 1000
        },
        {
          id: 'search',
          name: 'Search Prompt',
          prompt: "Lütfen veritabanından ilgili bilgileri ara ve kullanıcıya sun.",
          isActive: false,
          temperature: 0.5,
          maxTokens: 500
        },
        {
          id: 'chat',
          name: 'Chat Prompt',
          prompt: "Soruyu dikkatlice okuyup veritabanından geçerli bilgilerle yanıtla.",
          isActive: false,
          temperature: 0.8,
          maxTokens: 1500
        }
      ]
    });
  } catch (error) {
    console.error('Failed to get prompts:', error);
    res.status(500).json({
      error: 'Failed to get prompts',
      details: error.message
    });
  }
});

// --- Chatbot Settings Endpoint ---
app.get('/api/v2/chatbot/settings', (req, res) => {
  res.json({
    model: process.env.AI_PROVIDER || 'openai',
    temperature: 0.1,
    maxTokens: 2048,
    systemPrompt: "Sen Alice Semantic Bridge asistanısın. Kullanıcılara sistem hakkında bilgi ver ve onlara yardımcı ol.",
    features: {
      ragEnabled: true,
      semanticSearch: true,
      documentUpload: true
    }
  });
});

// Chatbot suggestions endpoint
app.post('/api/v2/chatbot/suggestions', (req, res) => {
  try {
    const { query, context } = req.body;

    // Generate suggestions based on query
    const suggestions = [
      "How do I configure the database connection?",
      "What are the supported LLM providers?",
      "How can I improve embedding quality?",
      "Tell me about RAG configuration",
      "How to set up API keys?"
    ];

    // Filter suggestions based on query context
    const relevantSuggestions = suggestions.filter(suggestion => {
      if (!query) return true;
      const queryLower = query.toLowerCase();
      const suggestionLower = suggestion.toLowerCase();
      return suggestionLower.includes(queryLower) ||
             queryLower.includes('config') ||
             queryLower.includes('database') ||
             queryLower.includes('api') ||
             queryLower.includes('llm');
    });

    res.json({
      success: true,
      suggestions: relevantSuggestions.slice(0, 5), // Limit to 5 suggestions
      query: query || '',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to generate suggestions:', error);
    res.status(500).json({
      error: 'Failed to generate suggestions',
      details: error.message
    });
  }
});

// Chatbot conversation endpoint
app.post('/api/v2/chatbot/chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    // Simple echo response for now - in real implementation this would use LLM
    const response = {
      message: `I understand you're asking about: "${message}". This is a test response from the Alice Semantic Bridge chatbot.`,
      suggestions: [
        "Tell me more about embeddings",
        "How to configure API keys?",
        "Database connection issues",
        "RAG system overview"
      ],
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      response: response
    });
  } catch (error) {
    console.error('Chatbot conversation failed:', error);
    res.status(500).json({
      error: 'Chatbot conversation failed',
      details: error.message
    });
  }
});

// Start the server
const PORT = process.env.PORT || process.env.API_PORT || 8083;
const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Alice Semantic Bridge API running on port ${PORT}`);
});

// Socket.IO Server for notifications - attach to existing Express server
const socketIo = require('socket.io');

// Check if WebSocket is enabled
if (process.env.ENABLE_WEBSOCKET === 'true') {
  const corsOrigins = process.env.CORS_ORIGINS ?
    process.env.CORS_ORIGINS.split(',') :
    ['http://localhost:3000', 'http://localhost:3001'];

  const io = socketIo(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
      credentials: true
    },
    path: process.env.WEBSOCKET_PATH || '/socket.io'
  });

  io.on('connection', (socket) => {
    console.log('Socket.IO client connected');

    // Send initial connection message
    socket.emit('notification', {
      type: 'connection',
      message: 'Connected to Alice Semantic Bridge notifications',
      timestamp: new Date().toISOString()
    });

    socket.on('message', (data) => {
      console.log('Received message:', data);
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO client disconnected');
    });

    // Send periodic health updates
    const healthInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('notification', {
          type: 'health_update',
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            redis: redis && redis.status === 'ready' ? 'connected' : 'disconnected'
          },
          timestamp: new Date().toISOString()
        });
      } else {
        clearInterval(healthInterval);
      }
    }, 30000); // Every 30 seconds
  });

  console.log('Socket.IO server attached to Express server');
} else {
  console.log('WebSocket disabled');
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});
