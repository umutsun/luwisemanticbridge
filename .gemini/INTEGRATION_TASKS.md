# 🚨 Gemini - Integration Tasks via Redis

## 📡 Redis'ten Gelen Yeni Görevler

### Task ID: URGENT_INTEGRATION
**Priority**: CRITICAL  
**Deadline**: September 4, 2025 - 18:00

## 🎯 Immediate Actions (NOW!)

### 1. Start Backend Server
```bash
cd backend
npm run dev
# Server should run on http://localhost:8080
```

### 2. Verify CORS Configuration
```javascript
// backend/src/server.ts
app.use(cors({
  origin: 'http://localhost:3000',  // Frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 3. Test Endpoints with cURL
```bash
# Health Check
curl http://localhost:8080/health

# Chat API Test
curl -X POST http://localhost:8080/api/v2/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "ÖZELGE nedir?", "conversationId": "demo-001"}'

# Search API Test  
curl -X POST http://localhost:8080/api/v2/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"query": "vergi", "limit": 5}'
```

### 4. WebSocket Test
```javascript
// Quick WebSocket test
const io = require('socket.io-client');
const socket = io('http://localhost:8080');

socket.on('connect', () => {
  console.log('Connected to WebSocket');
  socket.emit('chat:typing', { user: 'test', typing: true });
});
```

## 📊 Demo Data Setup

### Create Sample Legal Documents
```sql
-- Run these queries in PostgreSQL
INSERT INTO documents (id, title, type, metadata) VALUES
  (gen_random_uuid(), 'ÖZELGE: Vergi Usul Kanunu', 'legal', '{"category": "tax", "year": 2024}'),
  (gen_random_uuid(), 'Danıştay Kararı 2024/1234', 'legal', '{"category": "decision", "court": "danistay"}'),
  (gen_random_uuid(), 'Vergi Hukuku Makalesi', 'article', '{"author": "Dr. Ahmet Yılmaz", "journal": "Vergi Dünyası"}');

-- Create sample chunks
INSERT INTO chunks (document_id, content, chunk_index) VALUES
  ((SELECT id FROM documents WHERE title LIKE '%ÖZELGE%'), 'ÖZELGE, Maliye Bakanlığı tarafından vergi mükelleflerine...', 0),
  ((SELECT id FROM documents WHERE title LIKE '%Danıştay%'), 'Danıştay 4. Daire kararına göre...', 0);
```

### Generate Embeddings for Demo
```javascript
// backend/scripts/generate-demo-embeddings.js
const { OpenAI } = require('openai');
const { Pool } = require('pg');

async function generateDemoEmbeddings() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Get chunks without embeddings
  const chunks = await pool.query('SELECT id, content FROM chunks WHERE id NOT IN (SELECT chunk_id FROM embeddings)');
  
  for (const chunk of chunks.rows) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: chunk.content
    });
    
    await pool.query(
      'INSERT INTO embeddings (chunk_id, embedding, model) VALUES ($1, $2, $3)',
      [chunk.id, JSON.stringify(response.data[0].embedding), 'text-embedding-ada-002']
    );
  }
  
  console.log(`Generated ${chunks.rows.length} embeddings`);
}
```

## 📝 API Documentation Template

### Create API.md
```markdown
# ASB Backend API v2

## Base URL
`http://localhost:8080/api/v2`

## Authentication
- Bearer token in Authorization header
- Get token from `/auth/login`

## Endpoints

### Chat
**POST** `/chat`
```json
{
  "message": "Your question here",
  "conversationId": "optional-id"
}
```

**Response**:
```json
{
  "response": "AI generated response",
  "sources": [
    {
      "title": "Document title",
      "content": "Relevant excerpt",
      "score": 0.95
    }
  ],
  "conversationId": "uuid"
}
```

### Hybrid Search
**POST** `/search/hybrid`
```json
{
  "query": "search terms",
  "limit": 10,
  "filters": {
    "type": "legal",
    "dateFrom": "2024-01-01"
  }
}
```

### WebSocket Events
- `connection` - Client connected
- `chat:message` - New message
- `chat:typing` - Typing indicator
- `search:results` - Search results ready
```

## 🔄 Real-time Monitoring

### Status Updates to Redis
```javascript
// Send status every 30 seconds
setInterval(async () => {
  const status = {
    timestamp: new Date(),
    health: 'healthy',
    metrics: {
      activeConnections: io.engine.clientsCount,
      requestsPerMinute: getRequestRate(),
      avgResponseTime: getAvgResponseTime(),
      cacheHitRate: getCacheHitRate()
    }
  };
  
  await redis.publish('asb:backend:status', JSON.stringify(status));
}, 30000);
```

### Error Reporting
```javascript
// Global error handler
app.use((err, req, res, next) => {
  const error = {
    timestamp: new Date(),
    endpoint: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack
  };
  
  redis.publish('asb:backend:errors', JSON.stringify(error));
  
  res.status(500).json({ error: 'Internal server error' });
});
```

## ✅ Checklist for Frontend Integration

- [ ] Server running on port 8080
- [ ] CORS configured for localhost:3000
- [ ] Health endpoint responding
- [ ] Chat API tested and working
- [ ] Search API tested and working
- [ ] WebSocket connection established
- [ ] Demo data loaded
- [ ] Embeddings generated
- [ ] API documentation ready
- [ ] Error handling in place

## 🚀 Quick Test Script

```bash
# Save as test-integration.sh
#!/bin/bash

echo "Testing Backend Integration..."

# Health check
echo -n "1. Health Check: "
curl -s http://localhost:8080/health | jq .status

# Chat API
echo -n "2. Chat API: "
curl -s -X POST http://localhost:8080/api/v2/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' | jq .conversationId

# Search API
echo -n "3. Search API: "
curl -s -X POST http://localhost:8080/api/v2/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' | jq '. | length'

echo "✅ Integration tests complete!"
```

## 💬 Communication Channels

Send updates to these Redis channels:
- `asb:backend:status` - Server status
- `asb:backend:metrics` - Performance metrics  
- `asb:backend:errors` - Error reports
- `asb:integration:ready` - When ready for frontend

---

**URGENT**: Frontend is waiting! Get the server running NOW! 🚨
