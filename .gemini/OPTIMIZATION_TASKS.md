# 🔧 Gemini - Backend Optimization Tasks

## 📋 Current Task: Optimize RAG Backend for Production

### 🚀 Step 1: Add CORS and Error Handling

Update `backend/src/server.ts` to ensure proper CORS:
```typescript
// Add this after helmet middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});
```

### 📊 Step 2: Add Database Connection Pooling

Create `backend/src/config/database.ts`:
```typescript
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create a singleton pool instance
class DatabasePool {
  private static instance: Pool;

  static getInstance(): Pool {
    if (!this.instance) {
      this.instance = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
        statement_timeout: 30000,
        query_timeout: 30000,
        ssl: false
      });

      // Log pool events
      this.instance.on('connect', () => {
        console.log('✅ New database connection established');
      });

      this.instance.on('error', (err) => {
        console.error('❌ Database pool error:', err);
      });
    }

    return this.instance;
  }
}

export const db = DatabasePool.getInstance();
```

### 🔥 Step 3: Optimize Search Queries

Update search queries in `semantic-search.service.ts`:
```typescript
// Add indexes check
async checkIndexes() {
  const indexQuery = `
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = 'documents'
    AND schemaname = 'rag_data';
  `;
  
  const result = await this.pool.query(indexQuery);
  console.log('Available indexes:', result.rows);
}

// Optimize keyword search with full-text search
async optimizedKeywordSearch(query: string, limit: number = 10) {
  const searchQuery = `
    SELECT 
      id::text as id,
      title,
      source_table,
      source_id::text as source_id,
      LEFT(text, 500) as excerpt,
      ts_rank(
        setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(text, '')), 'B'),
        plainto_tsquery('simple', $1)
      ) as rank
    FROM rag_data.documents
    WHERE 
      setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(text, '')), 'B')
      @@ plainto_tsquery('simple', $1)
    ORDER BY rank DESC
    LIMIT $2
  `;

  const result = await this.pool.query(searchQuery, [query, limit]);
  return result.rows;
}
```

### 🎯 Step 4: Add Response Caching

Create `backend/src/middleware/cache.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { redis } from '../server';

export const cacheMiddleware = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return next();
    }

    const key = `cache:${req.method}:${req.path}:${JSON.stringify(req.body || {})}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        console.log('Cache hit:', key);
        return res.json(JSON.parse(cached));
      }
    } catch (error) {
      console.error('Cache error:', error);
    }

    // Store original send
    const originalSend = res.json;
    
    // Override send
    res.json = function(data: any) {
      // Cache the response
      redis.setex(key, ttl, JSON.stringify(data)).catch(err => {
        console.error('Cache set error:', err);
      });
      
      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
};
```

### 📈 Step 5: Add Performance Monitoring

Create `backend/src/middleware/monitoring.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { redis } from '../server';

export const performanceMonitoring = async (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - start;
    
    const metric = {
      timestamp: new Date(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('user-agent')
    };
    
    // Log slow requests
    if (duration > 1000) {
      console.warn('⚠️ Slow request:', metric);
    }
    
    // Send to Redis for monitoring
    try {
      await redis.lpush('asb:metrics:requests', JSON.stringify(metric));
      await redis.ltrim('asb:metrics:requests', 0, 999); // Keep last 1000
      
      // Update stats
      await redis.hincrby('asb:stats:requests', `${req.method}:${req.path}`, 1);
      await redis.hincrby('asb:stats:response_time', `${req.method}:${req.path}`, duration);
    } catch (error) {
      console.error('Monitoring error:', error);
    }
  });
  
  next();
};
```

### 🔐 Step 6: Add Rate Limiting

Update routes with rate limiting:
```typescript
import rateLimit from 'express-rate-limit';

const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many search requests, please try again later.'
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'Too many chat requests, please try again later.'
});

// Apply to routes
router.post('/api/v2/search/semantic', searchLimiter, async (req, res) => {
  // ... existing code
});

router.post('/api/v2/chat', chatLimiter, async (req, res) => {
  // ... existing code
});
```

### 📊 Step 7: Add Health Monitoring Endpoint

Create comprehensive health check:
```typescript
app.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'checking',
    timestamp: new Date().toISOString(),
    services: {},
    metrics: {}
  };

  // Check PostgreSQL
  try {
    const pgResult = await pgPool.query('SELECT COUNT(*) FROM rag_data.documents');
    health.services.postgres = {
      status: 'healthy',
      documents: pgResult.rows[0].count
    };
  } catch (error) {
    health.services.postgres = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check Redis
  try {
    await redis.ping();
    const dbSize = await redis.dbsize();
    health.services.redis = {
      status: 'healthy',
      keys: dbSize
    };
  } catch (error) {
    health.services.redis = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check OpenAI
  health.services.openai = {
    status: process.env.OPENAI_API_KEY ? 'configured' : 'not configured'
  };

  // Get metrics
  try {
    const requests = await redis.hgetall('asb:stats:requests');
    const responseTimes = await redis.hgetall('asb:stats:response_time');
    
    health.metrics = {
      totalRequests: Object.values(requests).reduce((a, b) => a + parseInt(b), 0),
      avgResponseTime: calculateAverage(responseTimes, requests)
    };
  } catch (error) {
    health.metrics = { error: 'Unable to fetch metrics' };
  }

  health.status = health.services.postgres?.status === 'healthy' && 
                   health.services.redis?.status === 'healthy' 
                   ? 'healthy' : 'degraded';

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

### ✅ Optimization Checklist

- [ ] Update CORS configuration
- [ ] Implement connection pooling
- [ ] Optimize search queries
- [ ] Add response caching
- [ ] Implement performance monitoring
- [ ] Add rate limiting
- [ ] Create detailed health endpoint
- [ ] Test with load (use Apache Bench or K6)
- [ ] Monitor memory usage
- [ ] Document API endpoints

### 🚀 Performance Targets

- Response time: < 500ms (p95)
- Throughput: > 100 req/sec
- Error rate: < 0.1%
- Cache hit rate: > 60%
- Memory usage: < 512MB

### 📊 Load Testing Script

```bash
# Install Apache Bench (ab)
# Test search endpoint
ab -n 1000 -c 10 -p search.json -T application/json http://localhost:8080/api/v2/search/semantic

# search.json content:
{"query": "elektrik", "limit": 5}
```
