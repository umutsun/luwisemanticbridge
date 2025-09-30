import dotenv from 'dotenv';
dotenv.config();

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { WebSocketServer as StandardWebSocketServer } from 'ws';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { SERVER, API } from './config';
import { initializeRedis } from './config/redis';

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
import ragConfigRoutes from './routes/rag-config.routes';
import activityRoutes from './routes/activity.routes';
import ragAnythingRoutes from './routes/raganything.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import embeddingHistoryRoutes from './routes/embedding-history.routes';
import embeddingCleanupRoutes from './routes/embedding-cleanup.routes';
import aiSettingsRoutes from './routes/ai-settings.routes';
import aiSettingsRoutes from './routes/ai-settings.routes';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const httpServer = createServer(app);

// Parse CORS origins from environment variable
const corsOrigins = (process.env.CORS_ORIGIN || `http://localhost:${SERVER.DEFAULT_PORTS.FRONTEND}`).split(',').map(origin => origin.trim());

// Initialize Socket.io
const io = new SocketServer(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true
  }
});

// Initialize Standard WebSocket Server for /ws/notifications
const wss = new StandardWebSocketServer({
  noServer: true,
  path: '/ws/notifications'
});

// Handle WebSocket upgrade for standard WebSocket connections
httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws/notifications') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Initialize PostgreSQL
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000
});

// Initialize ASEMB PostgreSQL
export const asembPool = new Pool({
  host: process.env.ASEMB_DB_HOST || 'localhost',
  port: parseInt(process.env.ASEMB_DB_PORT || '5432'),
  database: process.env.ASEMB_DB_NAME || 'asemb',
  user: process.env.ASEMB_DB_USER || 'postgres',
  password: process.env.ASEMB_DB_PASSWORD || 'postgres',
  ssl: process.env.ASEMB_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Initialize Redis
export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '2')
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // For development
}));
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(compression());
app.use(morgan('dev', {
  skip: (req, res) => {
    // Skip logging for progress endpoint to reduce console noise
    return req.path.includes('/embeddings/progress') || req.path.includes('/embeddings/progress/stream');
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get(API.ENDPOINTS.V2.HEALTH, async (req: Request, res: Response) => {
  try {
    // Check PostgreSQL
    await pgPool.query('SELECT 1');
    
    // Check Redis
    await redis.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgres: 'connected',
        redis: 'connected',
        lightrag: 'initializing'
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
app.use(dashboardRoutes);
app.use(API.ENDPOINTS.V2.SCRAPER, scraperRoutes);
app.use('/api/v2/chatbot', chatbotSettingsRoutes);
app.use(historyRoutes);
app.use(documentsRoutes);
app.use(API.ENDPOINTS.V2.MIGRATION, migrationRoutes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingsV2Routes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingProgressRoutes);
app.use(API.ENDPOINTS.V2.SETTINGS, settingsRoutes);
app.use('/api/v2/config', settingsRoutes);
app.use('/api/v2/migration-check', migrationCheckRoutes);
app.use(API.ENDPOINTS.V2.RAG, ragConfigRoutes);
app.use(API.ENDPOINTS.V2.ACTIVITY, activityRoutes);
app.use('/api/v2/raganything', ragAnythingRoutes);
app.use(API.ENDPOINTS.V2.AUTH, authRoutes);
app.use(API.ENDPOINTS.V2.USERS, usersRoutes);
app.use('/api/v2/embedding-history', embeddingHistoryRoutes);
app.use(API.ENDPOINTS.V2.EMBEDDINGS, embeddingCleanupRoutes);
app.use('/api/v2/ai', aiSettingsRoutes);
app.use('/api/v2/ai', aiSettingsRoutes);

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
        overview: API.ENDPOINTS.V2.DASHBOARD,
        lightrag: {
          stats: '/api/v2/lightrag/stats',
          query: '/api/v2/lightrag/query',
          documents: '/api/v2/lightrag/documents'
        }
      }
    }
  });
});

// WebSocket handling
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

// Standard WebSocket connection handling
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

// Helper function to broadcast notifications to all connected standard WebSocket clients
export function broadcastNotification(notification: {
  severity: string;
  id: string;
  title: string;
  message: string;
  timestamp: string;
  source: string;
}) {
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
io.on('connection', (socket) => {
  socket.on('notification', (notification) => {
    broadcastNotification(notification);
  });
});

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

// Import LightRAG service
import LightRAGService from './services/lightrag.service';
export let lightRAGService: LightRAGService | null = null;

// Import embeddings progress loader
import { loadProgressFromRedis } from './routes/embeddings.routes';
import { loadProgressFromRedis as loadV2ProgressFromRedis } from './routes/embeddings-v2.routes';

// Start server
const PORT = SERVER.PORT;
httpServer.listen(PORT, async () => {
  console.log(`🚀 ASB Backend Server running on port ${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    // Test database connections
    console.log('\n📊 Initializing Services...');

    // PostgreSQL connection
    await pgPool.query('SELECT 1');
    console.log('✅ PostgreSQL: Connected');

    // Initialize Redis with settings from database
    await initializeRedis();
    console.log('✅ Redis: Connected');

    // Check Redis database info
    const redisInfo = await redis.info('keyspace');
    const dbKeys = redisInfo.match(/db\d+:keys=(\d+)/);
    if (dbKeys) {
      console.log(`📋 Redis DB${process.env.REDIS_DB || 2}: ${dbKeys[1]} keys`);
    }

    // Initialize AI Services
    console.log('\n🤖 AI Services Status:');

    // Check API keys from both .env and database
    try {
      const dbSettings = await getAiSettings();
      const aiServices = [
        { name: 'OpenAI', envKey: 'OPENAI_API_KEY', dbKey: 'openai_api_key', model: 'GPT-3.5/4' },
        { name: 'Claude', envKey: 'ANTHROPIC_API_KEY', dbKey: 'anthropic_api_key', model: 'Claude 3' },
        { name: 'Gemini', envKey: 'GOOGLE_API_KEY', dbKey: 'google_api_key', model: 'Gemini Pro' },
        { name: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY', dbKey: 'deepseek_api_key', model: 'DeepSeek' }
      ];

      aiServices.forEach(service => {
        const envKey = process.env[service.envKey];
        const dbKey = dbSettings[service.dbKey];

        if (envKey || dbKey) {
          const source = envKey && dbKey ? 'both' : (envKey ? '.env' : 'database');
          console.log(`✅ ${service.name}: Available (${service.model}) [${source}]`);
        } else {
          console.log(`❌ ${service.name}: Not configured`);
        }
      });
    } catch (error) {
      // Fallback to .env only
      const aiServices = [
        { name: 'OpenAI', key: 'OPENAI_API_KEY', model: 'GPT-3.5/4' },
        { name: 'Claude', key: 'ANTHROPIC_API_KEY', model: 'Claude 3' },
        { name: 'Gemini', key: 'GOOGLE_API_KEY', model: 'Gemini Pro' },
        { name: 'DeepSeek', key: 'DEEPSEEK_API_KEY', model: 'DeepSeek' }
      ];

      aiServices.forEach(service => {
        if (process.env[service.key]) {
          console.log(`✅ ${service.name}: Available (${service.model}) [.env]`);
        } else {
          console.log(`❌ ${service.name}: Not configured`);
        }
      });
    }

    // Check Embedding settings
    console.log('\n🔤 Embedding Configuration:');
    try {
      const aiSettings = await getAiSettings();
      const embeddingProvider = aiSettings?.embeddingProvider || 'openai';
      const useLocal = process.env.USE_LOCAL_EMBEDDINGS === 'true';

      if (useLocal) {
        console.log('📦 Provider: Local (random vectors)');
      } else {
        const providerName = embeddingProvider.toUpperCase();
        console.log(`📦 Provider: ${providerName}`);

        if (embeddingProvider === 'openai' && aiSettings?.openaiApiBase) {
          console.log(`   Base URL: ${aiSettings.openaiApiBase}`);
        } else if (embeddingProvider === 'google') {
          console.log(`   Model: text-embedding-004`);
        } else if (embeddingProvider === 'cohere') {
          console.log(`   Model: embed-v3.0`);
        } else if (embeddingProvider === 'voyage') {
          console.log(`   Model: voyage-large-2`);
        }
      }
    } catch (error) {
      // Fallback to basic info
      if (process.env.USE_LOCAL_EMBEDDINGS === 'true') {
        console.log('📦 Provider: Local (random vectors)');
      } else {
        console.log('📦 Provider: OpenAI (default)');
      }
    }

    // Initialize LightRAG service
    console.log('\n🔍 LightRAG Status:');
    lightRAGService = new LightRAGService(pgPool, redis);
    await lightRAGService.initialize();

    // Load migration progress from Redis
    console.log('\n📈 Migration Status:');
    await loadProgressFromRedis();

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
          console.log('⚠️ Auto-resume failed, user can resume manually:', autoResumeError.message);
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

    // Clean up stale embedding progress records
    try {
      await pgPool.query(`
        UPDATE embedding_progress
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE status IN ('processing', 'paused')
        AND started_at < NOW() - INTERVAL '1 hour'
      `);
    } catch (cleanupError) {
      // Silently ignore
    }

    // Check for existing embedding process on startup
    try {
      const existingProcess = await pgPool.query(`
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
          await pgPool.query(`
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
    
    // Final startup status
    console.log('\n🎉 Backend Initialization Complete!');
    console.log('📡 WebSocket server ready');
    console.log(`🌐 API available at: http://localhost:${PORT}`);
    console.log('📖 Health check: GET /health');
    console.log('🔗 API docs: GET /api/v2');

    // Publish startup event
    await redis.publish('asb:backend:status', JSON.stringify({
      event: 'startup',
      timestamp: new Date(),
      port: PORT,
      status: 'ready'
    }));
  } catch (error) {
    console.error('❌ Startup error:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');

  httpServer.close(() => {
    // HTTP server closed
  });

  await pgPool.end();
  await redis.quit();

  process.exit(0);
});

export { app, io };
