import { setupServer } from 'msw/node';
import { rest } from 'msw';

// Mock API handlers
export const handlers = [
  // Health check
  rest.get('/api/v2/health', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          postgres: 'connected',
          redis: 'connected',
          lightrag: 'disabled'
        },
        agent: 'claude'
      })
    );
  }),

  // Search API
  rest.post('/api/v2/search/semantic', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        results: [
          {
            id: 1,
            title: 'Test Document',
            content: 'This is a test document',
            similarity: 0.95,
            metadata: {}
          }
        ],
        query: req.body.query,
        total: 1
      })
    );
  }),

  // Chat API
  rest.post('/api/v2/chat', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        id: Date.now().toString(),
        sessionId: 'test-session',
        message: 'This is a test response',
        timestamp: new Date().toISOString(),
        type: 'bot',
        sources: [],
        relatedTopics: [],
        conversationId: 'test-conversation'
      })
    );
  }),

  // Settings API
  rest.get('/api/v2/settings', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        chatbot: {
          title: 'ASB Hukuki Asistan',
          subtitle: 'Yapay Zeka Asistanınız',
          welcomeMessage: 'Merhaba! Size nasıl yardımcı olabilirim?',
          primaryColor: '#3B82F6'
        },
        ai: {
          activeModel: 'claude-3-sonnet',
          temperature: 0.1,
          maxTokens: 2048
        }
      })
    );
  }),

  // Embeddings progress
  rest.get('/api/v2/embeddings/progress', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        status: 'completed',
        current: 100,
        total: 100,
        percentage: 100,
        currentTable: 'documents',
        error: null,
        startTime: Date.now() - 10000,
        newlyEmbedded: 10,
        errorCount: 0,
        processedTables: ['documents']
      })
    );
  }),

  // Dashboard stats
  rest.get('/api/v2/dashboard/overview', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        totalDocuments: 1000,
        totalEmbeddings: 5000,
        activeUsers: 10,
        totalQueries: 500,
        systemHealth: 'healthy'
      })
    );
  }),

  // Auth API
  rest.post('/api/v2/auth/login', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        token: 'test-token',
        user: {
          id: '1',
          name: 'Test User',
          email: 'test@example.com',
          role: 'admin'
        }
      })
    );
  }),

  // Documents API
  rest.get('/api/v2/documents', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        documents: [
          {
            id: 1,
            title: 'Test Document',
            type: 'pdf',
            size: 1024,
            createdAt: new Date().toISOString(),
            status: 'processed'
          }
        ],
        total: 1,
        page: 1,
        limit: 10
      })
    );
  }),
];

// Create MSW server
export const server = setupServer(...handlers);