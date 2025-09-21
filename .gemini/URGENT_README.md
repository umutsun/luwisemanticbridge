# 🚨 Gemini - URGENT Backend Tasks

## ⚡ Critical Path - 7 Days to Launch

### 📅 Timeline
- **Project Deadline**: September 10, 2025
- **MVP Demo**: September 5, 2025
- **Current Date**: September 3, 2025

### 🎯 Priority 1: Chat API (Due: Sept 5)

```typescript
// IMMEDIATE: Create this file first!
// backend/src/routes/chat.routes.ts

import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';

const router = Router();
const chatController = new ChatController();

// Core endpoints needed TODAY
router.post('/api/v2/chat', chatController.sendMessage);
router.get('/api/v2/chat/history/:conversationId', chatController.getHistory);

export default router;
```

### 🏃‍♂️ Quick Start Commands

```bash
# Step 1: Navigate to backend
cd C:\xampp\htdocs\alice-semantic-bridge\backend

# Step 2: Create source structure
mkdir -p src/controllers src/services src/models src/routes src/middleware src/utils src/websocket

# Step 3: Install critical dependencies NOW
npm install express cors dotenv pg pgvector openai langchain @langchain/openai socket.io ioredis

# Step 4: Create main server file
```

### 📝 Server Setup (Copy-Paste Ready)

```typescript
// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    credentials: true
  }
});

// Database connection
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000
});

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '50mb' }));

// Health check - CRITICAL for frontend
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', agent: 'gemini', timestamp: new Date() });
});

// Chat endpoint - IMPLEMENT NOW
app.post('/api/v2/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    
    // TODO: Implement RAG pipeline
    // For now, echo back to unblock frontend
    res.json({
      response: `Received: ${message}`,
      sources: [],
      conversationId: conversationId || 'temp-001'
    });
  } catch (error) {
    res.status(500).json({ error: 'Chat API error' });
  }
});

// WebSocket for real-time
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('chat:typing', (data) => {
    socket.broadcast.emit('chat:typing', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`🚀 Gemini Backend running on port ${PORT}`);
});
```

### 🔥 RAG Pipeline Service (Priority)

```typescript
// backend/src/services/rag.service.ts
import { OpenAI } from 'openai';
import { Pool } from 'pg';

export class RAGService {
  private openai: OpenAI;
  private pgPool: Pool;
  
  constructor(pool: Pool) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.pgPool = pool;
  }
  
  async processQuery(query: string, limit = 5) {
    // Step 1: Generate embedding
    const embedding = await this.generateEmbedding(query);
    
    // Step 2: Search similar chunks
    const chunks = await this.searchSimilarChunks(embedding, limit);
    
    // Step 3: Generate response
    const response = await this.generateResponse(query, chunks);
    
    return {
      response,
      sources: chunks.map(c => ({
        title: c.title,
        content: c.content,
        score: c.similarity
      }))
    };
  }
  
  private async generateEmbedding(text: string) {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  }
  
  private async searchSimilarChunks(embedding: number[], limit: number) {
    const query = `
      SELECT 
        c.id,
        c.content,
        c.metadata,
        d.title,
        e.embedding <=> $1::vector as similarity
      FROM embeddings e
      JOIN chunks c ON e.chunk_id = c.id
      JOIN documents d ON c.document_id = d.id
      WHERE e.embedding <=> $1::vector < 0.5
      ORDER BY similarity
      LIMIT $2
    `;
    
    const result = await this.pgPool.query(query, [
      JSON.stringify(embedding),
      limit
    ]);
    
    return result.rows;
  }
  
  private async generateResponse(query: string, chunks: any[]) {
    const context = chunks.map(c => c.content).join('\n\n');
    
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful legal assistant. Answer based on the provided context.'
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${query}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    return completion.choices[0].message.content;
  }
}
```

### 🚀 Today's Critical Tasks

1. **[NOW] Create Express server** ✅
2. **[1 HOUR] Setup pgvector connection**
3. **[2 HOURS] Implement basic chat endpoint**
4. **[3 HOURS] RAG pipeline with OpenAI**
5. **[4 HOURS] WebSocket integration**

### 📊 Database Setup (Run NOW)

```sql
-- Create tables if not exist
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255),
  title VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  role VARCHAR(50),
  content TEXT,
  sources JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500),
  type VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  content TEXT,
  chunk_index INTEGER,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID REFERENCES chunks(id),
  embedding vector(1536),
  model VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
ON embeddings USING ivfflat (embedding vector_cosine_ops);
```

### 🔴 Blockers to Remove

1. **Missing .env file** - Create NOW:
```env
PORT=8080
DATABASE_URL=postgresql://user:password@91.99.229.96:5432/postgres
OPENAI_API_KEY=your-key-here
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

2. **CORS Issues** - Already handled in server setup

3. **Database Connection** - Test with:
```bash
npm run dev
curl http://localhost:8080/health
```

### 📱 Communication

- **Status Updates**: Every 2 hours to Redis
- **Blockers**: Immediately to `asb:backend:blockers`
- **Progress**: `asb:backend:progress`

### ⏰ Next 24 Hours Schedule

- **NOW - 2 PM**: Basic chat API working
- **2 PM - 6 PM**: RAG pipeline integrated
- **6 PM - 10 PM**: WebSocket real-time
- **Tomorrow AM**: Testing with Claude's frontend

---

**🚨 CRITICAL**: If blocked, immediately notify via Redis:
```javascript
redis.publish('asb:backend:blockers', JSON.stringify({
  agent: 'gemini',
  issue: 'describe issue',
  needsHelp: true
}));
```
