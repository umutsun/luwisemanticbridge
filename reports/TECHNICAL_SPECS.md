# LSEMB Technical Specifications

## Architecture Overview

LSEMB is a **RAG (Retrieval-Augmented Generation)** platform that provides AI-powered chat interfaces for domain-specific knowledge bases.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ ChatInterface│  │  Dashboard  │  │  Settings/Migrations    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Backend (Node.js/Express)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  RAG Chat   │  │  LLM Manager│  │  Semantic Search        │  │
│  │  Service    │  │  (Multi-LLM)│  │  (Vector + Keyword)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PostgreSQL + pgvector                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  unified_embeddings (content, embedding vector(1536), ...)  ││
│  │  settings, chatbot_settings, conversations, messages        ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Core Services

### 1. LLM Manager (`llm-manager.service.ts`)

Multi-provider LLM orchestration with automatic fallback:

```typescript
// Provider priority (configurable)
fallbackOrder: ['gemini', 'claude', 'openai', 'openrouter', 'deepseek']

// Supported providers
- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic Claude (claude-3-5-sonnet-20241022)
- Google Gemini (gemini-2.0-flash)
- DeepSeek
- OpenRouter (any model)
```

**Key Features:**
- Automatic fallback on 429/rate limit errors
- Per-provider API key management from database
- Lazy initialization (clients created on first use)
- Streaming support

### 2. Semantic Search (`semantic-search.service.ts`)

Hybrid search combining vector similarity and keyword matching:

```typescript
// Search flow
1. Generate query embedding (OpenAI text-embedding-3-small)
2. Vector similarity search using pgvector
3. Optional keyword boost for exact matches
4. Apply source table weights
5. Return ranked results with scores
```

**Configuration (from settings table):**
- `similarityThreshold`: 0.001 (very permissive)
- `maxResults`: 25
- `minResults`: 1
- `enableHybridSearch`: true
- `enableKeywordBoost`: true

### 3. RAG Chat (`rag-chat.service.ts`)

End-to-end chat flow:

```typescript
1. User sends message
2. Semantic search finds relevant sources
3. Context built from top sources
4. LLM generates response with sources
5. Conversation stored in database
6. Suggestion questions generated
```

## Database Schema

### unified_embeddings
```sql
CREATE TABLE unified_embeddings (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding vector(1536),  -- OpenAI dimensions
    source_table VARCHAR(255),
    source_id VARCHAR(255),
    metadata JSONB,
    summary TEXT,            -- Pre-computed summary (optional)
    processed_at TIMESTAMP,
    tokens_used INTEGER,
    model_used VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- DiskANN or HNSW index for fast similarity search
CREATE INDEX unified_embeddings_embedding_idx
ON unified_embeddings USING hnsw (embedding vector_cosine_ops);
```

### settings
```sql
-- Key-value store for all configuration
key VARCHAR PRIMARY KEY,
value TEXT,
category VARCHAR,
description TEXT
```

## API Endpoints

### Chat
- `POST /api/v2/chat` - Send message, get AI response
- `GET /api/v2/chat/conversations` - List conversations
- `GET /api/v2/chat/suggestions` - Get suggestion questions

### Embeddings
- `GET /api/v2/embeddings/stats` - Embedding statistics with dimensions
- `POST /api/v2/embeddings/generate` - Generate embeddings for tables
- `GET /api/v2/embeddings/progress` - Migration progress

### Settings
- `GET /api/settings/:key` - Get setting value
- `POST /api/settings` - Update setting
- `GET /api/chatbot-settings` - Get chatbot configuration

## Embedding Configuration

### Standard: OpenAI text-embedding-3-small
- **Dimensions:** 1536
- **Max tokens:** 8191
- **Cost:** $0.02 / 1M tokens

### Alternative: Gemini text-embedding-004
- **Dimensions:** 768
- **Max tokens:** 2048
- **Cost:** Free tier (15 req/min)

**Important:** All sources in a database must use the same embedding dimension. Mixing 768 and 1536 dimensions causes search errors.

## Performance Optimizations

### 1. No Runtime LLM Summaries
```typescript
// OLD: 25+ LLM calls per search (30-90s)
const summaryPromises = sources.map(source => this.generateSourceSummary(source));

// NEW: Use excerpt directly (1-5s)
sources.forEach(source => {
  source.summary = source.excerpt?.substring(0, 200) || '';
});
```

### 2. Vector Index
```sql
-- HNSW index for ~10x faster search
CREATE INDEX ON unified_embeddings
USING hnsw (embedding vector_cosine_ops);
```

### 3. Embedding Cache
```typescript
// L1: In-memory cache (5 min TTL)
private embeddingCache: Map<string, number[]>

// L2: Redis cache (10 min TTL)
private redis: Redis
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=xxx
POSTGRES_DB=lsemb

# API Keys (also stored in settings table)
OPENAI_API_KEY=sk-xxx
GOOGLE_API_KEY=xxx
ANTHROPIC_API_KEY=xxx

# Server
PORT=8080
NODE_ENV=production

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Deployment Commands

```bash
# Deploy backend
cd /var/www/{deployment}
git pull origin main
pm2 restart {deployment}-backend

# Re-embed with OpenAI
python3 /tmp/embed_all.py "$OPENAI_KEY" "$DATABASE_URL"

# Check embedding dimensions
psql "$DATABASE_URL" -c "
  SELECT vector_dims(embedding), COUNT(*)
  FROM unified_embeddings
  WHERE embedding IS NOT NULL
  GROUP BY vector_dims(embedding);
"
```

## Monitoring

```bash
# PM2 logs
pm2 logs {deployment}-backend --lines 100

# Check for errors
pm2 logs {deployment}-backend --lines 200 | grep -E 'error|Error|failed|Failed'

# Database stats
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM unified_embeddings;"
```
