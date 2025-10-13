# LSEMB API Reference

## Base URL
```
http://localhost:8000/api/v1
```

## Authentication
All API requests require authentication using an API key in the header:
```
X-LSEMB-API-Key: your-api-key
```

## Endpoints

### Workspaces

#### Create Workspace
```http
POST /workspaces
```

**Request Body:**
```json
{
  "id": "lsemb_customer1_prod",
  "name": "Customer 1 Production",
  "config": {
    "llm_provider": "openai",
    "embedding_model": "text-embedding-3-small",
    "max_documents": 10000,
    "retention_days": 365
  }
}
```

**Response (201):**
```json
{
  "id": "lsemb_customer1_prod",
  "name": "Customer 1 Production",
  "created_at": "2024-01-01T00:00:00Z",
  "status": "active",
  "stats": {
    "documents": 0,
    "storage_used": 0
  }
}
```

#### List Workspaces
```http
GET /workspaces
```

**Query Parameters:**
- `limit` (integer, default: 10): Number of results
- `offset` (integer, default: 0): Skip results
- `status` (string): Filter by status (active, archived)

**Response (200):**
```json
{
  "workspaces": [
    {
      "id": "lsemb_customer1_prod",
      "name": "Customer 1 Production",
      "created_at": "2024-01-01T00:00:00Z",
      "status": "active"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

#### Get Workspace
```http
GET /workspaces/{workspace_id}
```

**Response (200):**
```json
{
  "id": "lsemb_customer1_prod",
  "name": "Customer 1 Production",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-02T00:00:00Z",
  "status": "active",
  "config": {
    "llm_provider": "openai",
    "embedding_model": "text-embedding-3-small",
    "max_documents": 10000,
    "retention_days": 365
  },
  "stats": {
    "documents": 150,
    "storage_used": 1048576,
    "queries_today": 45,
    "last_query": "2024-01-02T12:00:00Z"
  }
}
```

#### Delete Workspace
```http
DELETE /workspaces/{workspace_id}
```

**Response (204):** No content

### Documents

#### Insert Document
```http
POST /workspaces/{workspace_id}/documents
```

**Request Body:**
```json
{
  "content": "Document content here",
  "metadata": {
    "title": "Document Title",
    "source": "api",
    "tags": ["tag1", "tag2"],
    "custom_field": "value"
  }
}
```

**Response (201):**
```json
{
  "id": "doc_abc123",
  "workspace_id": "lsemb_customer1_prod",
  "content": "Document content here",
  "metadata": {
    "title": "Document Title",
    "source": "api",
    "tags": ["tag1", "tag2"]
  },
  "created_at": "2024-01-01T00:00:00Z",
  "embedding_status": "completed",
  "chunk_count": 3
}
```

#### Batch Insert Documents
```http
POST /workspaces/{workspace_id}/documents/batch
```

**Request Body:**
```json
{
  "documents": [
    {
      "content": "First document",
      "metadata": {"type": "article"}
    },
    {
      "content": "Second document",
      "metadata": {"type": "guide"}
    }
  ],
  "options": {
    "chunk_size": 1024,
    "chunk_overlap": 128
  }
}
```

**Response (202):**
```json
{
  "batch_id": "batch_xyz789",
  "status": "processing",
  "total": 2,
  "processed": 0,
  "webhook_url": "/webhooks/batch/batch_xyz789"
}
```

#### Update Document
```http
PUT /workspaces/{workspace_id}/documents/{document_id}
```

**Request Body:**
```json
{
  "content": "Updated content",
  "metadata": {
    "updated": true,
    "version": 2
  }
}
```

**Response (200):** Updated document

#### Delete Document
```http
DELETE /workspaces/{workspace_id}/documents/{document_id}
```

**Response (204):** No content

#### Get Document
```http
GET /workspaces/{workspace_id}/documents/{document_id}
```

**Response (200):** Document details

### Search

#### Semantic Search
```http
POST /workspaces/{workspace_id}/search
```

**Request Body:**
```json
{
  "query": "How to configure authentication?",
  "mode": "hybrid",
  "limit": 10,
  "filters": {
    "metadata.source": "documentation",
    "created_after": "2024-01-01"
  },
  "options": {
    "include_chunks": true,
    "include_graph": false,
    "rerank": true
  }
}
```

**Response (200):**
```json
{
  "query": "How to configure authentication?",
  "results": [
    {
      "document_id": "doc_123",
      "score": 0.95,
      "content": "Authentication configuration...",
      "metadata": {
        "title": "Auth Guide",
        "source": "documentation"
      },
      "chunks": [
        {
          "text": "To configure authentication...",
          "score": 0.97,
          "position": 0
        }
      ]
    }
  ],
  "total_results": 5,
  "search_time_ms": 145,
  "mode": "hybrid"
}
```

#### Local Search
```http
POST /workspaces/{workspace_id}/search/local
```

Searches only within the specified workspace with graph context.

**Request Body:**
```json
{
  "query": "authentication setup",
  "depth": 2,
  "limit": 5
}
```

#### Global Search
```http
POST /workspaces/{workspace_id}/search/global
```

Searches with broader context using LightRAG's global search.

**Request Body:**
```json
{
  "query": "best practices for API security",
  "include_external": true,
  "limit": 10
}
```

### Analytics

#### Workspace Analytics
```http
GET /workspaces/{workspace_id}/analytics
```

**Query Parameters:**
- `start_date` (ISO 8601): Start of period
- `end_date` (ISO 8601): End of period
- `metrics` (comma-separated): Specific metrics to include

**Response (200):**
```json
{
  "workspace_id": "lsemb_customer1_prod",
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "metrics": {
    "total_documents": 1500,
    "total_queries": 4500,
    "avg_query_time_ms": 234,
    "storage_used_mb": 45.2,
    "top_queries": [
      {
        "query": "authentication",
        "count": 120
      }
    ],
    "daily_activity": [
      {
        "date": "2024-01-01",
        "documents_added": 50,
        "queries": 150
      }
    ]
  }
}
```

### Health & Status

#### Health Check
```http
GET /health
```

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "postgres": "healthy",
    "redis": "healthy",
    "neo4j": "healthy",
    "lightrag": "healthy"
  }
}
```

#### API Status
```http
GET /status
```

**Response (200):**
```json
{
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "total_requests": 10000,
  "active_workspaces": 25,
  "system": {
    "cpu_percent": 45.2,
    "memory_used_mb": 512,
    "disk_used_gb": 10.5
  }
}
```

## Error Responses

All errors follow this format:
```json
{
  "error_code": "WORKSPACE_NOT_FOUND",
  "message": "The specified workspace does not exist",
  "details": {
    "workspace_id": "lsemb_invalid",
    "suggestion": "Check workspace ID or create a new workspace"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| `INVALID_REQUEST` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | Access denied to resource |
| `NOT_FOUND` | 404 | Resource not found |
| `WORKSPACE_NOT_FOUND` | 404 | Workspace doesn't exist |
| `DOCUMENT_NOT_FOUND` | 404 | Document doesn't exist |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down |

## Rate Limiting

Default limits:
- 100 requests per minute per API key
- 1000 documents per day per workspace
- 10 concurrent batch operations

Headers in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

## Webhooks

Configure webhooks for async operations:

```json
{
  "url": "https://your-domain.com/webhook",
  "events": ["document.created", "batch.completed", "workspace.deleted"],
  "secret": "your-webhook-secret"
}
```

## SDKs

### Python
```python
from lsemb import AsembClient

client = AsembClient(api_key="your-key")
workspace = client.workspaces.create(id="lsemb_test")
doc = workspace.documents.insert(content="Hello")
results = workspace.search(query="Hello")
```

### JavaScript/TypeScript
```typescript
import { AsembClient } from '@lsemb/client';

const client = new AsembClient({ apiKey: 'your-key' });
const workspace = await client.workspaces.create({ id: 'lsemb_test' });
const doc = await workspace.documents.insert({ content: 'Hello' });
const results = await workspace.search({ query: 'Hello' });
```

## Postman Collection
Download: [LSEMB.postman_collection.json](../examples/LSEMB.postman_collection.json)