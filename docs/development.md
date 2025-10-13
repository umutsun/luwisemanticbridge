# LSEMB Development Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                    n8n Node                     │
│         (TypeScript - Claude/Gemini)            │
├─────────────────────────────────────────────────┤
│                  FastAPI Server                 │
│           (Python - Codex)                      │
├─────────────────────────────────────────────────┤
│                   LightRAG                      │
│         (Graph-based RAG Framework)             │
├─────────────────────────────────────────────────┤
│                Storage Layer                    │
│     PostgreSQL | Redis | Neo4j                  │
└─────────────────────────────────────────────────┘
```

## Development Setup

### Prerequisites
- Node.js 18+ and npm 9+
- Python 3.11+ and pip
- Docker and Docker Compose
- Git
- VS Code (recommended)

### Initial Setup

1. **Clone and Initialize**
```bash
git clone https://github.com/yourusername/lsemb.git
cd lsemb
git submodule update --init --recursive
```

2. **Install Dependencies**
```bash
# Node.js dependencies
npm install

# Python dependencies
cd api
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

3. **Configure Environment**
```bash
cp .env.lsemb.example .env.lsemb
# Edit .env.lsemb with your configuration
```

4. **Start Services**
```bash
# Start all services
docker-compose up -d

# Or start specific services
docker-compose up -d postgres redis
```

5. **Initialize Database**
```bash
cd api
python scripts/init_db.py
```

## Project Structure

```
lsemb/
├── src/                    # n8n node source (TypeScript)
│   ├── nodes/             # Node implementations
│   │   ├── AsembNode.node.ts        # Main node (Claude)
│   │   ├── AsembNode.properties.ts  # Properties (Gemini)
│   │   └── operations/              # Operations (Gemini)
│   ├── shared/            # Shared utilities (Claude)
│   └── credentials/       # Credential types
│
├── api/                   # FastAPI server (Python)
│   ├── main.py           # Application entry
│   ├── routers/          # API endpoints (Codex)
│   ├── rag/              # LightRAG integration (Codex)
│   ├── storage/          # Storage backends (Codex)
│   └── models/           # Pydantic models
│
├── tests/                 # Test suites (DeepSeek)
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
│
├── docs/                  # Documentation (DeepSeek)
│   ├── api.md            # API reference
│   ├── development.md    # This file
│   └── architecture.md   # System design
│
└── packages/
    └── lightrag/         # LightRAG submodule
```

## Development Workflow

### 1. TypeScript Development (n8n Node)

**Watch Mode:**
```bash
npm run dev
```

**Build:**
```bash
npm run build
```

**Test:**
```bash
npm run test:unit
npm run test:watch
```

**Code Style:**
```typescript
// Use strict typing
interface AsembDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  workspace: string;
}

// Proper error handling
try {
  const result = await operation();
  return result;
} catch (error) {
  throw new NodeOperationError(
    this.getNode(),
    `LSEMB Error: ${error.message}`,
    { description: 'Detailed error info' }
  );
}

// Use async/await
async function processDocument(
  doc: AsembDocument
): Promise<ProcessedDocument> {
  const embedding = await generateEmbedding(doc.content);
  return { ...doc, embedding };
}
```

### 2. Python Development (API Server)

**Run Server:**
```bash
cd api
uvicorn main:app --reload --port 8000
```

**Test:**
```bash
pytest tests/ -v
pytest tests/ --cov=api
```

**Code Style:**
```python
# Type hints everywhere
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class DocumentModel(BaseModel):
    """Document model with validation"""
    id: Optional[str] = Field(None, description="Document ID")
    content: str = Field(..., min_length=1, max_length=100000)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    workspace_id: str = Field(..., pattern="^lsemb_[a-z0-9_]+$")

# Async endpoints
@router.post("/documents")
async def create_document(
    document: DocumentModel,
    workspace_id: str = Path(...),
    db: AsyncSession = Depends(get_db)
) -> DocumentResponse:
    """Create a new document with proper error handling"""
    try:
        result = await document_service.create(
            workspace_id, 
            document, 
            db
        )
        return DocumentResponse.from_orm(result)
    except WorkspaceNotFoundError as e:
        raise HTTPException(404, detail=str(e))
```

### 3. Testing Strategy

#### Unit Tests
```typescript
// tests/unit/nodes/AsembNode.test.ts
describe('AsembNode', () => {
  it('should validate workspace ID format', () => {
    const validId = 'lsemb_customer1_prod';
    expect(validateWorkspaceId(validId)).toBe(true);
    
    const invalidId = 'invalid-format';
    expect(validateWorkspaceId(invalidId)).toBe(false);
  });
});
```

#### Integration Tests
```python
# tests/integration/test_workflow.py
@pytest.mark.asyncio
async def test_document_lifecycle(client: TestClient):
    # Create workspace
    workspace = await create_test_workspace(client)
    
    # Insert document
    doc = await insert_document(
        client, 
        workspace.id,
        content="Test content"
    )
    assert doc.id is not None
    
    # Search document
    results = await search_documents(
        client,
        workspace.id,
        query="test"
    )
    assert len(results) > 0
    assert results[0].id == doc.id
```

#### E2E Tests
```typescript
// tests/e2e/scenarios/rag-workflow.spec.ts
import { test, expect } from '@playwright/test';

test('complete RAG workflow', async ({ page }) => {
  // Setup workspace
  await createWorkspace(page, 'test-workspace');
  
  // Insert documents
  await insertDocuments(page, testDocuments);
  
  // Perform search
  const results = await searchDocuments(page, 'test query');
  
  // Verify results
  expect(results).toHaveLength(3);
  expect(results[0].score).toBeGreaterThan(0.8);
});
```

## Multi-Agent Collaboration

### Agent Responsibilities

| Agent | Files | Focus |
|-------|-------|-------|
| **Claude** | `src/nodes/AsembNode.node.ts`, `src/shared/` | Core logic, architecture |
| **Gemini** | `src/nodes/operations/`, properties | n8n integration, UI/UX |
| **Codex** | `api/`, LightRAG integration | Backend, API, storage |
| **DeepSeek** | `tests/`, `docs/` | Testing, documentation |

### Coordination Protocol

1. **Code Comments for Communication:**
```typescript
// TODO(Gemini): Add property validation for this field
// FIXME(Claude): Handle edge case when workspace is null
// NOTE(Codex): This matches API endpoint /api/v1/documents
// REVIEW(DeepSeek): Need test coverage for this function
```

2. **Interface Contracts:**
```typescript
// shared/types.ts - Maintained by Claude
export interface AsembApiRequest {
  workspace: string;
  operation: 'insert' | 'search' | 'delete';
  data: unknown;
}

// Both n8n node and API must honor this contract
```

3. **Git Workflow:**
```bash
# Feature branch per agent
git checkout -b claude/core-implementation
git checkout -b gemini/node-properties
git checkout -b codex/api-server
git checkout -b deepseek/testing

# Regular integration
git checkout develop
git merge claude/core-implementation
# Test integration
git merge gemini/node-properties
# Continue...
```

## LightRAG Integration

### Setup LightRAG
```python
# api/rag/lightrag_manager.py
from lightrag import LightRAG
from lightrag.llm import OpenAILLM

class LightRAGManager:
    def __init__(self, config: Config):
        self.config = config
        self.instances = {}
    
    async def get_instance(
        self, 
        workspace_id: str
    ) -> LightRAG:
        """Get or create LightRAG instance for workspace"""
        if workspace_id not in self.instances:
            self.instances[workspace_id] = LightRAG(
                working_dir=f"./workspaces/{workspace_id}",
                llm_model=OpenAILLM(
                    api_key=self.config.openai_api_key,
                    model_name="gpt-4"
                ),
                embed_model=OpenAIEmbed(
                    api_key=self.config.openai_api_key,
                    model_name="text-embedding-3-small"
                )
            )
        return self.instances[workspace_id]
```

### Multi-Tenant Isolation
```python
# Workspace isolation pattern
def get_workspace_key(workspace_id: str, key: str) -> str:
    """Generate isolated key for workspace"""
    return f"lsemb:{workspace_id}:{key}"

# Storage isolation
async def store_document(
    workspace_id: str,
    document: Document
):
    # PostgreSQL: Schema per workspace
    schema = f"workspace_{workspace_id}"
    
    # Redis: Prefixed keys
    redis_key = get_workspace_key(workspace_id, f"doc:{document.id}")
    
    # Neo4j: Labeled nodes
    neo4j_label = f"Workspace_{workspace_id}"
```

## Performance Optimization

### 1. Caching Strategy
```python
from functools import lru_cache
from redis import asyncio as aioredis

class CacheManager:
    def __init__(self, redis_client: aioredis.Redis):
        self.redis = redis_client
    
    async def get_or_compute(
        self,
        key: str,
        compute_fn: Callable,
        ttl: int = 3600
    ):
        # Check cache
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)
        
        # Compute and cache
        result = await compute_fn()
        await self.redis.setex(
            key, 
            ttl, 
            json.dumps(result)
        )
        return result
```

### 2. Batch Processing
```typescript
// Batch document insertion
async function batchInsert(
  documents: AsembDocument[],
  batchSize: number = 100
): Promise<BatchResult> {
  const batches = chunk(documents, batchSize);
  const results = await Promise.all(
    batches.map(batch => processBatch(batch))
  );
  return mergeBatchResults(results);
}
```

### 3. Connection Pooling
```python
# Database connection pool
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
    pool_recycle=3600
)
```

## Security Best Practices

### 1. Input Validation
```python
from pydantic import validator

class DocumentModel(BaseModel):
    content: str
    
    @validator('content')
    def validate_content(cls, v):
        if len(v) > 100000:
            raise ValueError('Content too large')
        # Sanitize HTML/scripts
        return sanitize_html(v)
```

### 2. Authentication
```python
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-LSEMB-API-Key")

async def verify_api_key(
    api_key: str = Security(api_key_header)
):
    if not await is_valid_api_key(api_key):
        raise HTTPException(401, "Invalid API key")
    return api_key
```

### 3. Rate Limiting
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100 per minute"]
)

@app.post("/api/v1/documents")
@limiter.limit("10 per minute")
async def create_document(...):
    pass
```

## Debugging

### 1. Debug Mode
```typescript
// Enable debug logging in n8n node
if (process.env.NODE_ENV === 'development') {
  console.log('LSEMB Debug:', {
    operation,
    workspace,
    input: JSON.stringify(items)
  });
}
```

### 2. API Debugging
```python
# Enable detailed logging
import logging
logging.basicConfig(level=logging.DEBUG)

@router.post("/debug/explain")
async def explain_search(query: str):
    """Explain search query processing"""
    return {
        "original": query,
        "processed": process_query(query),
        "embeddings": generate_embeddings(query),
        "graph": extract_graph_context(query)
    }
```

### 3. Performance Profiling
```python
from line_profiler import LineProfiler

profiler = LineProfiler()

@profiler
async def search_documents(...):
    # Function to profile
    pass

# View results
profiler.print_stats()
```

## Deployment

### Docker Build
```dockerfile
# Dockerfile for API
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
name: Deploy LSEMB

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm test
      - run: pytest tests/

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: docker build -t lsemb:latest .
      - run: docker push registry/lsemb:latest
```

## Monitoring

### Health Checks
```python
@app.get("/health")
async def health_check():
    checks = {
        "postgres": await check_postgres(),
        "redis": await check_redis(),
        "lightrag": await check_lightrag()
    }
    
    status = "healthy" if all(checks.values()) else "unhealthy"
    return {"status": status, "checks": checks}
```

### Metrics
```python
from prometheus_client import Counter, Histogram

request_count = Counter('lsemb_requests_total', 'Total requests')
request_duration = Histogram('lsemb_request_duration_seconds', 'Request duration')

@app.middleware("http")
async def track_metrics(request, call_next):
    request_count.inc()
    with request_duration.time():
        response = await call_next(request)
    return response
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Cannot connect to PostgreSQL" | Check `docker ps`, verify credentials |
| "LightRAG initialization failed" | Verify API keys, check working_dir permissions |
| "Workspace not found" | Ensure workspace created before operations |
| "Rate limit exceeded" | Implement exponential backoff |
| "Memory usage high" | Check workspace instance cleanup |

### Debug Commands
```bash
# Check service logs
docker-compose logs -f api

# Enter container
docker exec -it lsemb-api bash

# Test API endpoint
curl -X POST http://localhost:8000/api/v1/workspaces \
  -H "X-LSEMB-API-Key: your-key" \
  -d '{"id": "test_workspace"}'

# Check database
docker exec -it lsemb-postgres psql -U lsemb_user -d lsemb
```

## Resources

- [LightRAG Documentation](https://github.com/HKUDS/LightRAG)
- [n8n Node Development](https://docs.n8n.io/integrations/creating-nodes/)
- [FastAPI Best Practices](https://fastapi.tiangolo.com/tutorial/)
- [pgvector Guide](https://github.com/pgvector/pgvector)