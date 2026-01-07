# RAG Architecture Documentation

## Overview

LSEMB (Luwi Software Engineering Multi-Backend) implements a sophisticated **3-tier microservice architecture** for Retrieval-Augmented Generation (RAG) powered chat applications.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  ChatInterface  │  │  DataSchemaTab  │  │    PromptsTab       │  │
│  │    (React)      │  │   (Settings)    │  │    (Settings)       │  │
│  └────────┬────────┘  └─────────────────┘  └─────────────────────┘  │
│           │                                                         │
└───────────┼─────────────────────────────────────────────────────────┘
            │ HTTP/WebSocket
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js/Express)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  chat.routes.ts │  │ RAGChatService  │  │ PythonIntegration   │  │
│  │   /api/v2/chat  │──│   (LLM calls)   │──│     Service         │  │
│  └─────────────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│                                │                       │            │
└────────────────────────────────┼───────────────────────┼────────────┘
                                 │                       │
                                 │  HTTP (axios)         │
                                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PYTHON SERVICES (FastAPI)                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ SemanticSearch  │  │ SemanticAnalyzer│  │   Other Services    │  │
│  │    Service      │  │    Service      │  │  (PDF, Whisper...)  │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────┘  │
│           │                    │                                    │
│           └────────────────────┴──────────────┐                     │
│                                               │                     │
└───────────────────────────────────────────────┼─────────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────┐
                    │                           │                   │
                    ▼                           ▼                   ▼
            ┌──────────────┐          ┌──────────────┐     ┌──────────────┐
            │  PostgreSQL  │          │    Redis     │     │   OpenAI/    │
            │  (pgvector)  │          │   (Cache)    │     │   Gemini     │
            └──────────────┘          └──────────────┘     └──────────────┘
```

---

## Component Breakdown

### 1. Frontend (Next.js + React)

**Location**: `frontend/src/components/`

#### Chat Components

| Component | Path | Purpose |
|-----------|------|---------|
| `ChatInterface.tsx` | `/components/` | Main chat UI with streaming support |
| `TemplateChatInterface.tsx` | `/components/` | Template-based chat variant |
| `chat-container.tsx` | `/components/chat/` | Chat container wrapper |
| `message-item.tsx` | `/components/chat/` | Individual message rendering |
| `message-list.tsx` | `/components/chat/` | Message list with auto-scroll |
| `source-citation.tsx` | `/components/chat/` | RAG source citation display |
| `typing-indicator.tsx` | `/components/chat/` | AI typing animation |

#### Settings Components

| Component | Path | Purpose |
|-----------|------|---------|
| `DataSchemaSettings.tsx` | `/components/settings/` | Schema field configuration |
| `PromptsSettings.tsx` | `/components/settings/` | System prompts & LLM guide |

#### Key Interfaces

```typescript
// Message structure
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];           // RAG sources
  relatedTopics?: any[];
  isStreaming?: boolean;
  responseTime?: number;
  tokens?: { input, output, total };
}
```

---

### 2. Backend (Node.js + Express)

**Location**: `backend/src/`

#### Chat Routes

| Route | File | Method | Purpose |
|-------|------|--------|---------|
| `/api/v2/chat` | `routes/chat.routes.ts` | POST | Main chat endpoint |
| `/api/v2/chat/stream` | `routes/chat.routes.ts` | WS | Streaming chat |
| `/api/v2/conversations` | `routes/chat.routes.ts` | GET/POST | Conversation management |

#### Core Services

| Service | File | Purpose |
|---------|------|---------|
| `RAGChatService` | `services/rag-chat.service.ts` | Chat orchestration, LLM calls |
| `SemanticSearchService` | `services/semantic-search.service.ts` | Vector search (Node wrapper) |
| `PythonIntegrationService` | `services/python-integration.service.ts` | Python microservice communication |
| `LLMManager` | `services/llm-manager.service.ts` | Multi-provider LLM abstraction |

#### RAGChatService Flow

```
1. User message received
      ↓
2. Follow-up detection (Turkish pronoun analysis)
      ↓
3. Call Python SemanticSearch (via PythonIntegrationService)
      ↓
4. Format context from search results
      ↓
5. Build prompt with:
   - System prompt (from DB settings)
   - LLM guide (from DB settings)
   - RAG context (search results)
   - Conversation history
      ↓
6. Call LLM (OpenAI/Claude/Gemini/DeepSeek)
      ↓
7. Stream response to frontend
      ↓
8. Store in database
```

#### Python Integration

```typescript
// PythonIntegrationService singleton pattern
const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002';

// Example call
const response = await pythonService.semanticSearch(query, {
  limit: 25,
  useCache: true,
  debug: false
});
```

---

### 3. Python Services (FastAPI)

**Location**: `backend/python-services/`

#### Main Application

**File**: `main.py`

```python
# Multi-tenant support
APP_NAME = os.getenv("APP_NAME", "LSEMB")  # GeoLex, Vergilex, Bookie

# Router mounting
app.include_router(semantic_search_router, prefix="/api/python/semantic-search")
app.include_router(semantic_analyzer_router, prefix="/api/v2/semantic")
app.include_router(embedding_router, prefix="/api/python/embedding")
# ... more routers
```

#### Router Structure

| Router | Prefix | Purpose |
|--------|--------|---------|
| `semantic_search_router` | `/api/python/semantic-search` | Vector search |
| `semantic_analyzer_router` | `/api/v2/semantic` | Quote validation, quality analysis |
| `embedding_router` | `/api/python/embedding` | Embedding generation |
| `document_analyzer_router` | `/api/python` | PDF batch processing |
| `csv_transform_router` | `/api/python/csv` | CSV import/transform |
| `whisper_router` | `/api/python/whisper` | Audio transcription |
| `crawl_router` | `/api/python/crawl` | Web crawling |
| `scheduler_router` | `/api/python/scheduler` | Job scheduling |
| `devops_router` | `/api/python/devops` | Deployment management |

#### Core Services

| Service | File | Purpose |
|---------|------|---------|
| `SemanticSearchService` | `services/semantic_search_service.py` | High-performance vector search |
| `SemanticAnalyzerService` | `services/semantic_analyzer_service.py` | RAG quality control |
| `EmbeddingService` | `services/embedding_service.py` | Multi-provider embeddings |
| `DocumentAnalyzerService` | `services/document_analyzer_service.py` | PDF text extraction |

---

## Semantic Search Pipeline

### Search Flow

```
Query: "KDV oranı nedir?"
           ↓
┌──────────────────────────────────────────────────────────────────┐
│ 1. EMBEDDING GENERATION                                          │
│    - Check Redis cache (24h TTL)                                 │
│    - Generate via OpenAI/Gemini if cache miss                    │
│    - 1536 dimensions (text-embedding-3-small)                    │
└───────────────────────────┬──────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. VECTOR SEARCH (pgvector)                                      │
│    - Query unified_embeddings table                              │
│    - HNSW index for ~10ms search                                 │
│    - Filter by similarity_threshold (default: 0.001)             │
└───────────────────────────┬──────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. HYBRID SCORING                                                │
│    - Vector similarity (base)                                    │
│    - Keyword boost (+0.05 to +0.20)                              │
│    - Source priority (database: 0.8, documents: 0.5)             │
│    - Table weight (user configurable per table)                  │
└───────────────────────────┬──────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ 4. RETRIEVAL-LEVEL PENALTIES (NEW!)                              │
│    ┌─────────────────────────────────────────────────────────┐   │
│    │ Temporal Mismatch Detection                             │   │
│    │ - If question has no year but content is year-specific  │   │
│    │ - Penalty: -0.15 (configurable)                         │   │
│    │ - Example: "KDV oranı nedir?" + "2024 yılı için..."     │   │
│    └─────────────────────────────────────────────────────────┘   │
│    ┌─────────────────────────────────────────────────────────┐   │
│    │ TOC Content Detection                                   │   │
│    │ - Detects table of contents / header-only chunks        │   │
│    │ - Penalty: -0.25 (configurable)                         │   │
│    │ - Patterns: numbered lists, "içindekiler", page refs    │   │
│    └─────────────────────────────────────────────────────────┘   │
└───────────────────────────┬──────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ 5. RANKING & FILTERING                                           │
│    - Sort by final_score                                         │
│    - Limit to max_results (default: 25)                          │
│    - Cache results in Redis (10 min TTL)                         │
└──────────────────────────────────────────────────────────────────┘
```

### Configuration

#### Database Settings (ragSettings.*)

```sql
-- Settings table keys
ragSettings.similarityThreshold    -- default: 0.001
ragSettings.maxResults             -- default: 25
ragSettings.enableHybridSearch     -- default: true
ragSettings.enableKeywordBoost     -- default: true
ragSettings.databasePriority       -- default: 0.8
ragSettings.documentsPriority      -- default: 0.5

-- Penalty config (NEW!)
ragSettings.penalties.temporal_penalty_weight   -- default: -0.15
ragSettings.penalties.toc_penalty_weight        -- default: -0.25
ragSettings.penalties.toc_score_threshold       -- default: 0.5
ragSettings.penalties.toc_min_pattern_count     -- default: 2
ragSettings.penalties.table_parser_enabled      -- default: true
```

---

## Semantic Analyzer Service

### Purpose

Post-retrieval quality control for RAG responses:
- Quote validation (is quote from source text?)
- Temporal mismatch detection (year alignment)
- Verdict extraction (zorunludur, mümkündür, etc.)
- Action/modality matching (question vs answer alignment)

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/semantic/analyze/chunks` | POST | Analyze chunks for relevance |
| `/api/v2/semantic/validate-quote` | POST | Validate quote + answer combination |
| `/api/v2/semantic/filter` | POST | Filter chunks before LLM |

### Validation Response

```python
{
  "quote_valid": true,
  "answer_mode": "definitive" | "cautious" | "negative",
  "confidence": 0.85,
  "verdict": {
    "has_verdict": true,
    "sentence": "KDV oranı %18'dir",
    "modality": "ZORUNLU"
  },
  "issues": [],  # ["temporal_mismatch", "semantic_drift", ...]
  "suggested_quote": "...",  # If original quote is invalid
  "reason_codes": ["TEMPORAL_ALIGNED", "VERDICT_PRESENT"]
}
```

### Golden Tests

**Location**: `backend/python-services/tests/golden/`

```bash
# Run golden tests
cd backend/python-services
python -m pytest tests/test_semantic_analyzer_golden.py -v

# Current status: 65/65 passing
```

---

## Settings Architecture

### Tab Separation

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Settings Page                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Data Source │  │    Schema    │  │   Prompts    │              │
│  │     Tab      │  │     Tab      │  │     Tab      │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│         ▼                 ▼                 ▼                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ DB Selection │  │ Field Config │  │System Prompt │              │
│  │ Table Weights│  │ LLM Config   │  │  LLM Guide   │              │
│  │ Source DB    │  │ Schema Name  │  │    Tone      │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                     │
│  Storage: settings table (key-value)                               │
│                                                                     │
│  Python Services: Read-only (ragSettings.*, penalties.*)            │
│                   Runtime config override via DB                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Config Override Flow

```
1. DEFAULT_CONFIG (hardcoded in Python)
      ↓
2. Database settings (settings table)
      ↓
3. Runtime (cached 5-60 seconds)

Example: Penalty weights
- Default: -0.15 (temporal), -0.25 (TOC)
- Override: INSERT INTO settings (key, value) VALUES
            ('ragSettings.penalties.temporal_penalty_weight', '-0.20');
- Service loads on next cache refresh (5s)
```

---

## Deployment Architecture

### Production Instances

| Instance | Domain | Python Port | Backend Port | Frontend Port |
|----------|--------|-------------|--------------|---------------|
| GeoLex | geolex.luwi.dev | 8001 | 8084 | 4001 |
| Vergilex | vergilex.luwi.dev | 8003 | 8087 | 4003 |
| Bookie | bookie.luwi.dev | 8002 | 8085 | 4002 |

### Server Details

```
Host: root@49.13.38.58
SSH Port: 2222 (NOT 22!)
Disk: /mnt/volume-nbg1-1 (98GB external)
Apps: /var/www/{geolex,vergilex,bookie} (symlinks)
```

### PM2 Services

```bash
# Per-instance services
pm2 list
┌────────────────────┬────┬─────────┬──────┐
│ name               │ id │ status  │ cpu  │
├────────────────────┼────┼─────────┼──────┤
│ geolex-backend     │ 0  │ online  │ 0.1% │
│ geolex-frontend    │ 1  │ online  │ 0.1% │
│ geolex-python      │ 2  │ online  │ 0.3% │
│ vergilex-backend   │ 3  │ online  │ 0.1% │
│ vergilex-frontend  │ 4  │ online  │ 0.1% │
│ vergilex-python    │ 5  │ online  │ 0.3% │
│ bookie-backend     │ 6  │ online  │ 0.1% │
│ bookie-frontend    │ 7  │ online  │ 0.1% │
│ bookie-python      │ 8  │ online  │ 0.3% │
└────────────────────┴────┴─────────┴──────┘
```

---

## Recent Developments (2025-01)

### 1. Configurable Penalty System

**Commit**: `adfb788`

- Penalty weights now configurable via `ragSettings.penalties.*`
- No code change needed to tune penalties
- Load on service startup, cached for performance

### 2. Temporal Mismatch Detection

- Detects year-specific content for general questions
- Turkish patterns: "2024 yılı için", "... yılında"
- Penalty: -0.15 (reduces ranking, doesn't filter)

### 3. TOC Content Detection

- Detects table of contents / navigation chunks
- Patterns: numbered lists, "içindekiler", page refs
- Penalty: -0.25 (heavy penalty for low-value content)

### 4. HTML Table Parser

- Deterministic server-side parsing
- Converts `<table>` to markdown
- Preserves structure for LLM context

### 5. Semantic Analyzer Enhancements

- `suggested_quote` for invalid quotes
- False positive protection
- Dual-action partial relevance handling
- 65/65 golden tests passing

---

## Debug & Diagnostics

### Debug Mode

Add `?debug=1` to semantic search requests:

```bash
curl "http://localhost:8002/api/python/semantic-search/search?query=KDV&debug=1"
```

Response includes `_debug` object:

```json
{
  "success": true,
  "results": [...],
  "_debug": {
    "penalty_config": {
      "temporal_penalty_weight": -0.15,
      "toc_penalty_weight": -0.25,
      "config_version": "v1.0.0"
    },
    "penalty_stats": {
      "temporal_count": 3,
      "toc_count": 1
    },
    "embedding_provider": "openai",
    "raw_results_count": 50,
    "scored_results_count": 47,
    "top_penalized": [...]
  }
}
```

### Logging

```bash
# Python service logs
pm2 logs geolex-python --lines 50

# Backend logs
pm2 logs geolex-backend --lines 50

# Watch for penalty application
pm2 logs geolex-python | grep -i penalty
```

---

## File Reference

### Frontend

```
frontend/src/
├── components/
│   ├── ChatInterface.tsx           # Main chat UI
│   ├── TemplateChatInterface.tsx   # Template variant
│   ├── chat/
│   │   ├── chat-container.tsx
│   │   ├── message-item.tsx
│   │   ├── message-list.tsx
│   │   ├── source-citation.tsx
│   │   └── typing-indicator.tsx
│   └── settings/
│       ├── DataSchemaSettings.tsx   # Schema tab
│       └── PromptsSettings.tsx      # Prompts tab
└── config/
    └── api.config.ts                # API endpoints
```

### Backend

```
backend/src/
├── routes/
│   ├── chat.routes.ts              # /api/v2/chat
│   └── chatbot-settings.routes.ts  # Settings API
├── services/
│   ├── rag-chat.service.ts         # Chat orchestration
│   ├── semantic-search.service.ts  # Node.js wrapper
│   ├── python-integration.service.ts # Python client
│   └── llm-manager.service.ts      # Multi-provider LLM
└── config/
    └── database.config.ts          # DB connection
```

### Python Services

```
backend/python-services/
├── main.py                         # FastAPI app
├── routers/
│   ├── semantic_search_router.py   # Search API
│   ├── semantic_analyzer_router.py # Analysis API
│   ├── embedding_router.py         # Embedding API
│   └── ...
├── services/
│   ├── semantic_search_service.py  # Vector search + penalties
│   ├── semantic_analyzer_service.py # Quote validation
│   ├── embedding_service.py        # Embedding generation
│   └── database.py                 # asyncpg pool
└── tests/
    ├── golden/
    │   └── temporal_intent_cases.json
    └── test_semantic_analyzer_golden.py
```

---

## Next Steps

### Planned Improvements

1. **Debug Query Param** - Add `?debug=1` support to chat endpoint
2. **Chat Diagnostics** - Minimal stats in chat response
3. **Performance Dashboard** - Real-time search metrics

### Known Issues

1. `semantic_analyzer_router` not mounted in `main.py` (needs fix)
2. Penalty config not exposed in UI (intentional - power user feature)

---

*Last Updated: 2025-01-08*
*Version: 1.0.0*
