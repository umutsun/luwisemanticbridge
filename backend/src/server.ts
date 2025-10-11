import dotenv from 'dotenv';
dotenv.config({ path: '.env.asemb' });

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { WebSocketServer as StandardWebSocketServer } from 'ws';
import Redis from 'ioredis';
import { SERVER, API } from './config';
import { initializeRedis } from './config/redis';
import { initializeConfigs, getAppConfig, asembPool, initializeAsembDatabase, syncAPIKeysToDatabase } from './config/database.config';

// Import routes
import searchRoutes from './routes/search.routes';
import chatRoutes from './routes/chat.routes';
import dashboardRoutes from './routes/dashboard.routes';
import scraperRoutes from './routes/scraper.routes';
import chatbotSettingsRoutes from './routes/chatbot-settings.routes';
import historyRoutes from './routes/history.routes';
import documentsRoutes from './routes/documents.routes';
import migrationRoutes from './routes/migration.routes';
import embeddingsV2Routes from './routes/embeddings-v2.routes';
import embeddingProgressRoutes from './routes/embedding-progress.routes';
import settingsRoutes from './routes/settings.routes';
import migrationCheckRoutes from './routes/migration-check.routes';
import activityRoutes from './routes/activity.routes';
import ragAnythingRoutes from './routes/raganything.routes';
import ragRoutes from './routes/rag.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import subscriptionRoutes from './routes/subscription.routes';
import embeddingHistoryRoutes from './routes/embedding-history.routes';
import embeddingCleanupRoutes from './routes/embedding-cleanup.routes';
import aiSettingsRoutes from './routes/ai-settings.routes';
import appSettingsRoutes from './routes/app-settings.routes';
import healthRoutes from './routes/health.routes';
import adminRoutes from './routes/admin.routes';
import llmStatusRoutes from './routes/llm-status.routes';
import logsRoutes, { initializeLogWebSocket } from './routes/logs.routes';
import embeddingsTablesRoutes from './routes/embeddings-tables.routes';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';


// Initialize Express app
const app: Application = express();
const httpServer = createServer(app);

// Parse CORS origins from environment variable - use CORS_ORIGINS from .env.asemb
const corsOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || `http://localhost:${SERVER.DEFAULT_PORTS.FRONTEND},http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3008`).split(',').map(origin => origin.trim());

// Initialize Socket.io if WebSocket is enabled
console.log('🔌 WebSocket Configuration:', {
  ENABLED: SERVER.WEBSOCKET.ENABLED,
  PORT: SERVER.WEBSOCKET.PORT,
  PATH: SERVER.WEBSOCKET.PATH,
  CORS_ORIGINS: corsOrigins,
  ENV_ENABLED: process.env.ENABLE_WEBSOCKET
});

const io = SERVER.WEBSOCKET.ENABLED ? new SocketServer(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST"]
  },
  path: SERVER.WEBSOCKET.PATH,
  transports: ['websocket', 'polling']
}) : null;

// Initialize Standard WebSocket Server for notifications if enabled
const wss = SERVER.WEBSOCKET.ENABLED ? new StandardWebSocketServer({
  noServer: true,
  path: SERVER.WEBSOCKET.NOTIFICATIONS_PATH
}) : null;

// Initialize WebSocket Server for logs
const logWss = SERVER.WEBSOCKET.ENABLED ? new StandardWebSocketServer({
  noServer: true,
  path: '/ws/logs'
}) : null;

// Initialize log WebSocket service
if (SERVER.WEBSOCKET.ENABLED && logWss) {
  initializeLogWebSocket(logWss);
}

// Handle WebSocket upgrade for standard WebSocket connections if enabled
if (SERVER.WEBSOCKET.ENABLED && (wss || logWss)) {
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname;

    if (pathname === SERVER.WEBSOCKET.NOTIFICATIONS_PATH && wss) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/logs' && logWss) {
      logWss.handleUpgrade(request, socket, head, (ws) => {
        logWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });
}

// Use the ASEMB pool from database.config - it will be initialized properly

// Initialize Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '2'),
  password: process.env.REDIS_PASSWORD || undefined
});

// Disable helmet for CORS issues during development
app.use(helmet({
  contentSecurityPolicy: false, // For development
  crossOriginEmbedderPolicy: false, // For CORS
  crossOriginResourcePolicy: false, // For CORS
  crossOriginOpenerPolicy: false, // For CORS
}));

// CORS middleware - place AFTER helmet
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log(`CORS Debug - Request received: ${req.method} ${req.url}, Origin: ${origin}`);

  // Parse CORS origins from environment variable
  const corsOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || `http://localhost:${SERVER.DEFAULT_PORTS.FRONTEND},http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3008`).split(',').map(o => o.trim());

  // Check if origin is in allowed list
  const isOriginAllowed = origin && corsOrigins.includes(origin);

  // Set CORS headers based on origin validation
  if (isOriginAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // For requests without origin or disallowed origins, use a safe default
    res.setHeader('Access-Control-Allow-Origin', corsOrigins[0] || 'http://localhost:3000');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Origin, Accept, X-API-Key, Cache-Control, Pragma');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS Debug - Handling OPTIONS preflight request');
    res.status(200).end();
    return;
  }

  next();
});
app.use(require('cookie-parser')());
app.use(compression());
app.use(morgan('dev', {
  skip: (req, res) => {
    // Skip logging for progress endpoint to reduce console noise
    return req.path.includes('/embeddings/progress') || req.path.includes('/embeddings/progress/stream');
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get(API.ENDPOINTS.V2.HEALTH, async (req: Request, res: Response) => {
  try {
    // Check PostgreSQL
    await asembPool.query('SELECT 1');

    // Check Redis
    await redis.ping();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgres: 'connected',
        redis: 'connected',
        lightrag: 'disabled'
      },
      agent: 'claude'
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// API Routes
app.use(searchRoutes);
app.use(chatRoutes);
app.use('/api/v2/dashboard', dashboardRoutes);
app.use('/api/v2/scraper', scraperRoutes);
app.use('/api/v2/chatbot', chatbotSettingsRoutes);
app.use(historyRoutes);
app.use('/api/v2/documents', documentsRoutes);
app.use(API.ENDPOINTS.V2.MIGRATION, migrationRoutes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingsV2Routes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingProgressRoutes);
// settingsRoutes and appSettingsRoutes moved down to fix conflicts
app.use('/api/v2/migration-check', migrationCheckRoutes);
app.use(API.ENDPOINTS.V2.ACTIVITY, activityRoutes);
app.use('/api/v2/raganything', ragAnythingRoutes);
app.use(API.ENDPOINTS.V2.RAG, ragRoutes);
app.use(API.ENDPOINTS.V2.AUTH, authRoutes);
app.use(API.ENDPOINTS.V2.USERS, usersRoutes);
app.use('/api/v2/subscription', subscriptionRoutes);
app.use('/api/v2/embedding-history', embeddingHistoryRoutes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingCleanupRoutes);
app.use('/api/v2/ai', aiSettingsRoutes);
// TODO: Fix route conflict - only use one settings route
// app.use('/api/v2/settings', appSettingsRoutes);
app.use(API.ENDPOINTS.V2.SETTINGS, settingsRoutes);
app.use('/api/v2/config', settingsRoutes);
app.use('/api/v2/health', healthRoutes);
app.use('/api/v2/llm', llmStatusRoutes);
app.use('/api/v2/admin', adminRoutes);
app.use('/api/v2/logs', logsRoutes);
app.use('/api/v2/embeddings-tables', embeddingsTablesRoutes);

// Base route
app.get('/api/v2', (req: Request, res: Response) => {
  res.json({
    message: 'ASB Backend API v2',
    version: '2.0.0',
    endpoints: {
      health: API.ENDPOINTS.V2.HEALTH,
      chat: API.ENDPOINTS.V2.CHAT,
      search: {
        semantic: API.ENDPOINTS.V2.SEARCH + '/semantic',
        hybrid: API.ENDPOINTS.V2.SEARCH + '/hybrid',
        stats: API.ENDPOINTS.V2.SEARCH + '/stats'
      },
      scraper: API.ENDPOINTS.V2.SCRAPER,
      embeddings: API.ENDPOINTS.V2.EMBEDDINGS,
      dashboard: {
        overview: API.ENDPOINTS.V2.DASHBOARD
      }
    }
  });
});

// WebSocket handling - only if enabled
if (SERVER.WEBSOCKET.ENABLED && io) {
  console.log(`🔌 WebSocket enabled on path: ${SERVER.WEBSOCKET.PATH}`);
  io.on('connection', (socket) => {
  console.log('WebSocket client connected');

  // Handle notifications namespace
  if (socket.handshake.query.namespace === 'notifications') {
    socket.join('notifications');
    console.log('Client joined notifications room');
  }

  // Join user room
  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`);
  });

  // Handle typing indicators
  socket.on('chat:typing', (data: any) => {
    socket.broadcast.to(`conversation:${data.conversationId}`).emit('chat:typing', data);
  });

  // Handle chat messages
  socket.on('chat:message', async (data: any) => {
    // Broadcast to conversation participants
    io.to(`conversation:${data.conversationId}`).emit('chat:message', data);

    // Update Redis for real-time sync
    await redis.publish('asb:chat:messages', JSON.stringify(data));
  });

  // Dashboard real-time updates
  socket.on('dashboard:subscribe', () => {
    socket.join('dashboard:updates');
  });

  // Test notification endpoint
  socket.on('notification:test', () => {
    socket.emit('notification', {
      type: 'test',
      id: Date.now().toString(),
      severity: 'info',
      title: 'Test Notification',
      message: 'WebSocket connection is working',
      timestamp: new Date().toISOString(),
      source: 'System'
    });
  });

  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected');
  });
});
} else {
  console.log('🔌 WebSocket disabled by configuration');
}

// Standard WebSocket connection handling - only if enabled
if (SERVER.WEBSOCKET.ENABLED && wss) {
  console.log(`🔌 Standard WebSocket enabled on path: ${SERVER.WEBSOCKET.NOTIFICATIONS_PATH}`);
  wss.on('connection', (ws, request) => {
  console.log('Standard WebSocket client connected to /ws/notifications');

  // Store the IP address for logging/security
  const clientIp = request.socket.remoteAddress;

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'WebSocket connection established',
    timestamp: new Date().toISOString()
  }));

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle different message types
      switch (message.type) {
        case 'test':
          // Send test notification
          ws.send(JSON.stringify({
            type: 'notification',
            id: Date.now().toString(),
            severity: 'info',
            title: 'Test Notification',
            message: 'Standard WebSocket connection is working',
            timestamp: new Date().toISOString(),
            source: 'System'
          }));
          break;

        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
          break;

        default:
          console.log('Received unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      }));
    }
  });

  // Handle connection close
  ws.on('close', (code, reason) => {
    console.log(`Standard WebSocket client disconnected: ${code} - ${reason}`);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('Standard WebSocket error:', error);
  });

  // Set up a ping interval to keep the connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      }));
    }
  }, 30000); // Every 30 seconds

  // Clean up ping interval when connection closes
  ws.on('close', () => {
    clearInterval(pingInterval);
  });
});
}

// Helper function to broadcast notifications to all connected standard WebSocket clients
export function broadcastNotification(notification: {
  severity: string;
  id: string;
  title: string;
  message: string;
  timestamp: string;
  source: string;
}) {
  // Only broadcast if WebSocket is enabled and wss is available
  if (!SERVER.WEBSOCKET.ENABLED || !wss) {
    return;
  }

  const message = JSON.stringify({
    type: 'notification',
    ...notification
  });

  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

// Also forward Socket.IO notifications to standard WebSocket clients
if (SERVER.WEBSOCKET.ENABLED && io) {
  io.on('connection', (socket) => {
    socket.on('notification', (notification) => {
      broadcastNotification(notification);
    });
  });
}

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  // Send error to monitoring
  redis.publish('asb:backend:errors', JSON.stringify({
    timestamp: new Date(),
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  }));
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// LightRAG service disabled
export let lightRAGService = null;

// Import embeddings progress loader
import { loadProgressFromRedis } from './routes/embeddings.routes';
import { loadProgressFromRedis as loadV2ProgressFromRedis } from './routes/embeddings-v2.routes';

// Start server with database dependency
const PORT = SERVER.PORT;

async function startServer() {
  console.log(`🚀 Starting ASB Backend Server on port ${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket: ${SERVER.WEBSOCKET.ENABLED ? 'Enabled' : 'Disabled'}`);
  if (SERVER.WEBSOCKET.ENABLED) {
    console.log(`   Socket.IO Path: ${SERVER.WEBSOCKET.PATH}`);
    console.log(`   Notifications Path: ${SERVER.WEBSOCKET.NOTIFICATIONS_PATH}`);
  }

  // Database connection variables
  let dbConnectionAttempts = 0;
  const maxDbRetries = 5;
  const dbRetryDelay = 5000; // 5 seconds

  // Retry database connection with backoff
  while (dbConnectionAttempts < maxDbRetries) {
    try {
      console.log('\n📊 Initializing ASEMB Database Connection...');
      console.log(`📡 Attempt ${dbConnectionAttempts + 1}/${maxDbRetries}`);
      console.log(`🔗 Connecting to: ${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'asemb'}`);

      await asembPool.query('SELECT 1');
      console.log('✅ ASEMB Database: Connected');
      break; // Success, exit retry loop

    } catch (dbError: any) {
      dbConnectionAttempts++;
      console.error(`❌ Database connection attempt ${dbConnectionAttempts} failed:`, dbError.message);

      if (dbConnectionAttempts >= maxDbRetries) {
        console.error('\n🔴 DATABASE CONNECTION ERROR: Could not connect to ASEMB database after multiple attempts');
        console.error('🔴 Please check your database configuration in .env file');
        console.error(`🔴 Expected: ${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'asemb'}`);
        console.error('🔴 Server will continue in LIMITED MODE - Dashboard will show loading state');

        // Set server status to indicate database connection failure
        (global as any).serverStatus = {
          database: 'disconnected',
          loading: true,
          error: dbError.message
        };
        break;
      }

      console.log(`⏳ Retrying in ${dbRetryDelay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, dbRetryDelay));
    }
  }

  // Only proceed with full initialization if database is connected
  if ((global as any).serverStatus?.database !== 'disconnected') {
    try {
      // Initialize ASEMB database tables
      console.log('🗃️ Initializing ASEMB Database Tables...');
      await initializeAsembDatabase();
      console.log('✅ ASEMB Database Tables: Ready');

      // Create default admin user if not exists
      const authService = new AuthService();
      await authService.createDefaultAdmin();

      // Load all configurations from ASEMB database
      console.log('⚙️ Loading configurations from ASEMB database...');
      await initializeConfigs();
      console.log('✅ All configurations loaded from database');

      // Sync API keys from environment variables to database
      await syncAPIKeysToDatabase();
      console.log('✅ API keys synced to database');

      // Update server status to indicate successful database connection
      (global as any).serverStatus = {
        database: 'connected',
        loading: false,
        settings: 'loaded'
      };
    } catch (configError: any) {
      console.error('⚠️ Database connected but failed to load configurations:', configError.message);
      (global as any).serverStatus = {
        database: 'connected',
        loading: false,
        settings: 'failed',
        error: configError.message
      };
    }
  }

    // Initialize Redis with settings from database
  try {
    console.log('\n📡 Initializing Redis...');
    await initializeRedis();
    console.log('✅ Redis: Connected');

    // Update server status with Redis connection
    if ((global as any).serverStatus) {
      (global as any).serverStatus.redis = 'connected';
    }
  } catch (redisError: any) {
    console.error('⚠️ Redis connection failed:', redisError.message);
    if ((global as any).serverStatus) {
      (global as any).serverStatus.redis = 'disconnected';
      (global as any).serverStatus.redisError = redisError.message;
    }
  }

    // Check Redis database info if Redis is available
  if (redis) {
    try {
      const redisInfo = await redis.info('keyspace');
      const dbKeys = redisInfo.match(/db\d+:keys=(\d+)/);
      if (dbKeys) {
        console.log(`📋 Redis DB${process.env.REDIS_DB || 2}: ${dbKeys[1]} keys`);
      }
    } catch (redisInfoError) {
      console.log('⚠️ Could not get Redis info:', (redisInfoError as Error).message);
    }
  }

    // Initialize AI Services (load from database first, fallback to .env)
  console.log('\n🤖 AI Services Status:');
  const settingsService = SettingsService.getInstance();
  const aiServices = [
    { name: 'OpenAI', key: 'OPENAI_API_KEY', model: 'GPT-3.5/4', settingKey: 'openai.apiKey' },
    { name: 'Claude', key: 'CLAUDE_API_KEY', model: 'Claude 3', settingKey: 'anthropic.apiKey' },
    { name: 'Gemini', key: 'GEMINI_API_KEY', model: 'Gemini Pro', settingKey: 'google.apiKey' },
    { name: 'DeepSeek', key: 'DEEPSEEK_API_KEY', model: 'DeepSeek', settingKey: 'deepseek.apiKey' }
  ];

  for (const service of aiServices) {
    let isConfigured = false;
    let source = 'not configured';

    try {
      // Try to get API key from database first (settings are stored as flat key-value pairs)
      const allSettings = await settingsService.getAllSettings();
      let parsedSettings = allSettings;

      // If settings is a JSON string, parse it first
      if (typeof allSettings === 'string') {
        try {
          parsedSettings = JSON.parse(allSettings);
        } catch (parseError) {
          console.error('Failed to parse settings JSON:', parseError);
          parsedSettings = {};
        }
      }

      // Access the API key directly using the flat key structure (e.g., 'deepseek.apiKey')
      const dbApiKey = parsedSettings[service.settingKey];

      if (dbApiKey && dbApiKey.trim() !== '') {
        isConfigured = true;
        source = 'database';
      } else if (process.env[service.key]) {
        // Fallback to environment variable
        isConfigured = true;
        source = '.env';
      }
    } catch (error) {
      console.error(`Error checking ${service.name}:`, error);
      // If database fails, check environment variable
      if (process.env[service.key]) {
        isConfigured = true;
        source = '.env';
      }
    }

    if (isConfigured) {
      console.log(`✅ ${service.name}: Available (${service.model}) [${source}]`);
    } else {
      console.log(`❌ ${service.name}: Not configured`);
    }
  }

    // Check Embedding settings (basic)
  console.log('\n🔤 Embedding Configuration:');
  if (process.env.USE_LOCAL_EMBEDDINGS === 'true') {
    console.log('📦 Provider: Local (random vectors)');
  } else {
    console.log('📦 Provider: OpenAI (default)');
  }

    // LightRAG service disabled
  console.log('\n🔍 LightRAG Status: Disabled by configuration');
  lightRAGService = null;

    // Load migration progress from Redis (only if Redis is available)
  if (redis) {
    try {
      console.log('\n📈 Migration Status:');
      await loadProgressFromRedis();
    } catch (migrationError: any) {
      console.log('⚠️ Migration progress check failed:', migrationError.message);
    }
  }

    // Also check v2 embedding progress
    const v2ProgressLoaded = await loadV2ProgressFromRedis();
    if (v2ProgressLoaded) {
      console.log('🔄 Found active v2 embedding process');

      // If process was paused, auto-resume it after backend restart
      const embeddingStatus = await redis.get('embedding:status');
      if (embeddingStatus === 'paused') {
        console.log('🔄 Auto-resuming paused embedding process...');
        try {
          // Internal auto-resume - don't log this as user operation
          await fetch(`http://localhost:${PORT}/api/v2/embeddings/auto-resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (autoResumeError) {
          if (autoResumeError instanceof Error) {
            console.log('⚠️ Auto-resume failed, user can resume manually:', autoResumeError.message);
          } else {
            console.log('⚠️ Auto-resume failed with an unknown error, user can resume manually.');
          }
        }
      }
    }

    // Check embedding progress
    try {
      const embeddingProgress = await redis.get('embedding:progress');
      if (embeddingProgress) {
        const progress = JSON.parse(embeddingProgress);
        console.log(`📊 Migration Status: ${progress.status || 'unknown'}`);
        if (progress.currentTable) {
          console.log(`   Active Table: ${progress.currentTable}`);
          console.log(`   Progress: ${progress.current || 0}/${progress.total || 0} records`);
        }
      }
    } catch (error) {
      // Silently ignore
    }

    // Clean up stale embedding progress records (only if database is connected)
    if ((global as any).serverStatus?.database === 'connected') {
      try {
        await asembPool.query(`
          UPDATE embedding_progress
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE status IN ('processing', 'paused')
          AND started_at < NOW() - INTERVAL '1 hour'
        `);
      } catch (cleanupError) {
        // Silently ignore
      }

      // Check for existing embedding process on startup (only if database is connected)
      try {
        const existingProcess = await asembPool.query(`
          SELECT * FROM embedding_progress
          WHERE status IN ('processing', 'paused')
          ORDER BY started_at DESC
          LIMIT 1
        `);

        if (existingProcess.rows.length > 0) {
          const process = existingProcess.rows[0];

          // If process was 'processing', mark it as 'paused' for safety
          if (process.status === 'processing') {
            // Found orphaned processing process, marking as paused
            await asembPool.query(`
              UPDATE embedding_progress
              SET status = 'paused'
              WHERE id = $1
            `, [process.id]);

            // Also update Redis
            await redis.set('embedding:status', 'paused');
            const progressData = {
              status: 'paused',
              current: process.processed_chunks || 0,
              total: process.total_chunks || 0,
              percentage: process.total_chunks > 0 ? Math.round((process.processed_chunks / process.total_chunks) * 100) : 0,
              currentTable: process.document_type,
              error: process.error_message,
              startTime: new Date(process.started_at).getTime(),
                newlyEmbedded: process.processed_chunks || 0,
              errorCount: process.error_message ? 1 : 0,
              processedTables: process.document_type ? [process.document_type] : []
            };
            await redis.set('embedding:progress', JSON.stringify(progressData), 'EX', 7 * 24 * 60 * 60);
            // Process marked as paused, user can resume manually
          }
        }
      } catch (checkError) {
        // Silently ignore
      }
    }
  }


// Start HTTP server (this should always happen regardless of database status)
const startHttpServer = () => {
  console.log('\n🎉 Backend Server Starting...');
  console.log('📡 WebSocket server ready');
  console.log(`🌐 API available at: http://localhost:${PORT}`);
  console.log('📖 Health check: GET /health');
  console.log('🔗 API docs: GET /api/v2');

  // Publish startup event
  if (redis) {
    redis.publish('asb:backend:status', JSON.stringify({
      event: 'startup',
      timestamp: new Date(),
      port: PORT,
      status: (global as any).serverStatus?.database === 'connected' ? 'ready' : 'limited'
    })).catch(err => console.log('Could not publish startup event:', err));
  }

  // Start the HTTP server
  if (!httpServer.listening) {
    httpServer.listen(PORT, () => {
      console.log(`\n🚀 HTTP Server listening on port ${PORT}`);

      // Display server status
      const serverStatus = (global as any).serverStatus;
      if (serverStatus?.database === 'connected') {
        console.log('✅ Server Status: Fully Operational');
      } else if (serverStatus?.loading) {
        console.log('⚠️ Server Status: Limited Mode - Database Connection Failed');
        console.log('🔄 Dashboard will show loading state');
      } else {
        console.log('⚠️ Server Status: Limited Mode - Some Services Unavailable');
      }
    });
  }
};

// 🚀 Emergency Chat Routes - Quick Fix
const setupChatRoutes = () => {
  console.log('🔄 Setting up emergency /api/v2/chatbot routes...');
  console.log('🔄 Setting up emergency /api/v2/chatbot routes...');

  // 1. Settings
  app.get('/api/v2/chatbot/settings', async (req, res) => {
    try {
      console.log('✅ /api/v2/chatbot/settings called');
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

      // Get chatbot settings from database
      const settingsResult = await asembPool.query(`
        SELECT value FROM settings WHERE key = 'chatbot'
      `);

      let chatbotSettings: any = {};
      if (settingsResult.rows.length > 0) {
        chatbotSettings = settingsResult.rows[0].value || {};
      }

      res.json({
        title: (chatbotSettings as any).title || 'ASB Hukuki Asistan',
        subtitle: (chatbotSettings as any).subtitle || 'Yapay Zeka Asistanınız',
        logoUrl: (chatbotSettings as any).logoUrl || '',
        welcomeMessage: (chatbotSettings as any).welcomeMessage || 'Merhaba! Ben AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.',
        placeholder: (chatbotSettings as any).placeholder || 'Sorunuzu yazın...',
        primaryColor: (chatbotSettings as any).primaryColor || '#3B82F6',
        activeModel: (chatbotSettings as any).activeModel || 'Claude 3'
      });
    } catch (error) {
      console.error('Error fetching chatbot settings:', error);
      res.json({
        title: 'ASB Hukuki Asistan',
        subtitle: 'Yapay Zeka Asistanınız',
        logoUrl: '',
        welcomeMessage: 'Merhaba! Ben AI asistanınız. Veritabanımızdaki bilgiler doğrultusunda size yardımcı olabilirim.',
        placeholder: 'Sorunuzu yazın...',
        primaryColor: '#3B82F6',
        activeModel: 'Claude 3'
      });
    }
  });

  // 2. Chat
  app.post('/api/v2/chat', (req, res) => {
    console.log('✅ /api/v2/chat called', req.body);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.json({
      id: Date.now().toString(),
      sessionId: 'default',
      message: "Backend çalışıyor! Emergency route devrede. / Merhaba! Backend çalışıyor ve emergency route devrede.",
      timestamp: new Date().toISOString(),
      type: 'bot',
      sources: [],
      relatedTopics: [],
      conversationId: 'emergency-' + Date.now()
    });
  });

  // 3. Suggestions
  app.get('/api/v2/chat/suggestions', (req, res) => {
    console.log('✅ /api/v2/chat/suggestions called');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.json([
      'Hukuki sistem hakkında bilgi verir misiniz?',
      'Hangi konularda yardımcı olabilirsiniz?',
      'Mevzuat taraması nasıl yapılır?'
    ]);
  });

  console.log('✅ Emergency routes mounted successfully!');
};

// Setup emergency routes first - will be called after function declaration
setupChatRoutes();

// 🚀 Start server immediately without waiting for all services
const emergencyServerStarted = false;

// Try to start full services (but don't block)
startServer().then(() => {
  // After trying to start full services, ensure HTTP server is ready
  if (!emergencyServerStarted) {
    startHttpServer();
  }
}).catch(err => {
  console.error('⚠️ Full startup failed, but emergency routes are working:', err);
  // Even if full startup fails, start HTTP server in limited mode
  if (!emergencyServerStarted) {
    startHttpServer();
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');

  httpServer.close(() => {
    // HTTP server closed
  });

  await asembPool.end();
  await redis.quit();

  process.exit(0);
});

export { app, io, httpServer, asembPool as pgPool, redis };
// Trigger restart
