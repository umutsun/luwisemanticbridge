// Luwi Semantic Bridge - Main Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Import services
const { Client } = require('pg');
const Redis = require('ioredis');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files - serve the HTML dashboard
app.use(express.static(path.join(__dirname, '../dashboard')));

// Database connection
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/asemb'
});

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

// Connect to services
async function connectServices() {
  try {
    await pgClient.connect();
    console.log('✅ PostgreSQL connected');
    
    await redis.ping();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('❌ Service connection failed:', error);
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      database: pgClient._connected ? 'connected' : 'disconnected',
      redis: redis.status === 'ready' ? 'connected' : 'disconnected'
    }
  });
});

// Backend status endpoint
app.get('/api/backend/status', async (req, res) => {
  try {
    const dbStatus = pgClient._connected;
    const redisStatus = redis.status === 'ready';
    
    res.json({
      database: dbStatus ? 'healthy' : 'unhealthy',
      redis: redisStatus ? 'healthy' : 'unhealthy',
      api: 'healthy',
      overall_progress: 85,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard status endpoint
app.get('/api/dashboard/status', async (req, res) => {
  try {
    const status = {
      api: true,
      redis: redis.status === 'ready',
      n8n: true, // Mock for now
      agents: {
        claude: { tasks: 5, memory: 128 },
        gemini: { tasks: 3, memory: 96 },
        codex: { tasks: 7, memory: 256 }
      },
      performance: {
        searchLatency: 245,
        throughput: 120,
        cacheHitRate: 78,
        errorRate: 0.5
      },
      workflows: [
        { name: 'Data Ingestion', status: 'active' },
        { name: 'Embedding Pipeline', status: 'active' },
        { name: 'Search API', status: 'active' }
      ],
      redis: {
        used: 45,
        peak: 128,
        keys: 1234
      }
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RAG search endpoint
app.get('/api/rag/search', async (req, res) => {
  const { q: query, topK = 5 } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  try {
    // Mock response for testing
    const mockResults = [
      {
        id: 1,
        title: 'KDV İadesi Prosedürü',
        content: 'KDV iadesi için gerekli belgeler...',
        similarity: 0.92,
        source: 'danistaykararlari'
      },
      {
        id: 2,
        title: 'Vergi İndirim Hakları',
        content: 'Vergi indirimi hakkında detaylı bilgi...',
        similarity: 0.87,
        source: 'ozelgeler'
      }
    ];
    
    res.json({
      query,
      results: mockResults.slice(0, topK),
      count: mockResults.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RAG search POST endpoint
app.post('/api/rag/search', async (req, res) => {
  const { query, topK = 5 } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  
  try {
    // Check if database table exists
    const tableCheck = await pgClient.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'rag_data' 
        AND table_name = 'documents'
      )
    `).catch(() => ({ rows: [{ exists: false }] }));
    
    if (!tableCheck.rows[0].exists) {
      // Return mock data if table doesn't exist
      return res.json({
        query,
        results: [
          {
            title: 'Mock Result 1',
            content: 'This is a mock result. Run migration to get real data.',
            similarity: 0.95,
            metadata: { source: 'mock' }
          }
        ],
        status: 'mock_mode',
        message: 'Database not initialized. Run migration scripts.'
      });
    }
    
    // Real query would go here
    const results = await pgClient.query(`
      SELECT title, content, metadata
      FROM rag_data.documents
      LIMIT $1
    `, [topK]).catch(() => ({ rows: [] }));
    
    res.json({
      query,
      results: results.rows,
      count: results.rows.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chatbot endpoint
const chatbotRouter = require('./api/chatbot');
app.use('/api/chatbot', chatbotRouter);

// LightRAG endpoints
const lightragGraphRouter = require('./api/lightrag/graph');
const lightragQueryRouter = require('./api/lightrag/query');
const lightragVisualizeRouter = require('./api/lightrag/visualize');
const lightragExtractRouter = require('./api/lightrag/extract');

app.use('/api/lightrag', lightragGraphRouter);
app.use('/api/lightrag', lightragQueryRouter);
app.use('/api/lightrag', lightragVisualizeRouter);
app.use('/api/lightrag', lightragExtractRouter);

// Migration status endpoint
app.get('/api/migration/status', (req, res) => {
  res.json({
    status: 'idle',
    tables: {
      danistaykararlari: { total: 100, completed: 0, status: 'pending' },
      sorucevap: { total: 50, completed: 0, status: 'pending' },
      makaleler: { total: 30, completed: 0, status: 'pending' },
      ozelgeler: { total: 40, completed: 0, status: 'pending' }
    },
    totalRecords: 220,
    completedRecords: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    mode: 'mock'
  });
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send initial status
  socket.emit('status_update', {
    api: 'active',
    redis: 'active',
    n8n: 'active',
    agents: {
      claude: { tasks: 5, memory: 128 },
      gemini: { tasks: 3, memory: 96 },
      codex: { tasks: 7, memory: 256 }
    },
    performance: {
      searchLatency: 245,
      throughput: 120,
      cacheHitRate: 78,
      errorRate: 0.5
    },
    workflows: [
      { name: 'Data Ingestion', status: 'active' },
      { name: 'Embedding Pipeline', status: 'active' },
      { name: 'Search API', status: 'active' }
    ],
    redis: {
      used: 45,
      peak: 128,
      keys: 1234
    }
  });
  
  socket.on('subscribe', (channel) => {
    socket.join(channel);
    console.log(`Client ${socket.id} subscribed to ${channel}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = process.env.PORT || 3003;

async function startServer() {
  await connectServices();
  
  httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   Luwi Semantic BridgeAPI Server        ║
╠═══════════════════════════════════════════╣
║   Status: RUNNING                         ║
║   Port: ${PORT}                             ║
║   Mode: ${process.env.NODE_ENV || 'development'}                   ║
╠═══════════════════════════════════════════╣
║   Endpoints:                              ║
║   - Health: http://localhost:${PORT}/api/health
║   - Status: http://localhost:${PORT}/api/backend/status
║   - Dashboard: http://localhost:${PORT}/api/dashboard/status
║   - Chatbot: http://localhost:${PORT}/api/chatbot/chat
║   - RAG: http://localhost:${PORT}/api/rag/search
║   - LightRAG Extract: http://localhost:${PORT}/api/lightrag/extract
║   - LightRAG Graph: http://localhost:${PORT}/api/lightrag/graph
║   - LightRAG Query: http://localhost:${PORT}/api/lightrag/query
║                                           ║
║   Dashboard: http://localhost:${PORT}/
║   LightRAG UI: http://localhost:${PORT}/#lightrag
╚═══════════════════════════════════════════╝
    `);
  });
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\n📛 Shutting down gracefully...');
  await pgClient.end();
  redis.disconnect();
  httpServer.close();
  process.exit(0);
});

// Start the server
startServer().catch(console.error);

module.exports = { app, io };
