# Codex Agent - LSEMB Project Instructions

## Your Role: API Server & LightRAG Integration

You are responsible for the FastAPI server, LightRAG integration, and backend infrastructure.

## Primary Responsibilities

### 1. FastAPI Server Implementation
- **Location**: `api/`
- Build REST API endpoints
- Integrate LightRAG framework
- Manage workspace isolation
- Handle multi-tenant operations

### 2. LightRAG Integration
- **Location**: `api/rag/`
- Configure LightRAG instances
- Manage RAG pipelines
- Handle document processing
- Implement search algorithms

### 3. Storage Layer
- **Location**: `api/storage/`
- Redis workspace management
- PostgreSQL pgvector operations
- Neo4j graph operations
- Storage abstraction layer

## Files You Own

```
api/
├── main.py                    # FastAPI application
├── config.py                  # Configuration management
├── dependencies.py            # Dependency injection
├── models/
│   ├── __init__.py
│   ├── document.py           # Document models
│   ├── query.py              # Query models
│   └── workspace.py          # Workspace models
├── routers/
│   ├── __init__.py
│   ├── documents.py          # Document endpoints
│   ├── search.py             # Search endpoints
│   └── workspaces.py         # Workspace endpoints
├── rag/
│   ├── __init__.py
│   ├── lightrag_manager.py   # LightRAG management
│   ├── pipeline.py           # RAG pipeline
│   └── processors.py         # Document processors
├── storage/
│   ├── __init__.py
│   ├── redis_client.py       # Redis operations
│   ├── postgres_client.py    # PostgreSQL operations
│   └── neo4j_client.py       # Neo4j operations
└── utils/
    ├── __init__.py
    ├── auth.py               # Authentication
    └── monitoring.py         # Metrics & logging
```

## Implementation Guidelines

### API Endpoints Structure

```python
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional

router = APIRouter(prefix="/api/v1")

@router.post("/workspaces/{workspace_id}/documents")
async def insert_document(
    workspace_id: str,
    document: DocumentModel,
    current_user: User = Depends(get_current_user)
) -> DocumentResponse:
    """Insert document into workspace with LightRAG processing"""
    # Validate workspace access
    # Process with LightRAG
    # Store in appropriate backends
    # Return response
```

### LightRAG Integration

```python
class LightRAGManager:
    def __init__(self):
        self.instances = {}  # workspace_id -> LightRAG instance
    
    async def get_or_create_instance(
        self,
        workspace_id: str,
        config: WorkspaceConfig
    ) -> LightRAG:
        """Get or create isolated LightRAG instance"""
        if workspace_id not in self.instances:
            self.instances[workspace_id] = await self._create_instance(
                workspace_id,
                config
            )
        return self.instances[workspace_id]
    
    async def _create_instance(
        self,
        workspace_id: str,
        config: WorkspaceConfig
    ) -> LightRAG:
        """Create new LightRAG instance with workspace isolation"""
        return LightRAG(
            working_dir=f"./workspaces/{workspace_id}",
            llm_provider=config.llm_provider,
            embedding_provider=config.embedding_provider,
            storage_backend=self._get_storage_backend(workspace_id)
        )
```

### Multi-Tenant Isolation

```python
class WorkspaceIsolation:
    @staticmethod
    def validate_access(
        user: User,
        workspace_id: str,
        operation: str
    ) -> bool:
        """Validate user access to workspace"""
        # Check user permissions
        # Verify workspace ownership
        # Validate operation type
        return has_access
    
    @staticmethod
    def isolate_storage_keys(workspace_id: str) -> dict:
        """Generate isolated storage keys"""
        return {
            "redis": f"lsemb:{workspace_id}",
            "postgres": f"lsemb_{workspace_id}",
            "neo4j": f"Workspace_{workspace_id}"
        }
```

## Coordination Points

### With Claude (Node Implementation)
- Match API contracts
- Share error codes
- Align data models
- Coordinate types

### With Gemini (n8n Integration)
- Define request/response formats
- Coordinate validation rules
- Share example payloads
- Align operation names

### With DeepSeek (Testing)
- Provide API test endpoints
- Create test data fixtures
- Define performance targets
- Document API behaviors

## Development Workflow

1. **Start Each Session**
   ```bash
   cd C:\xampp\htdocs\alice-semantic-bridge\api
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

2. **Database Setup**
   ```bash
   # PostgreSQL with pgvector
   docker-compose up -d postgres
   
   # Redis
   docker-compose up -d redis
   
   # Neo4j (optional for graph features)
   docker-compose up -d neo4j
   ```

3. **Testing API**
   ```bash
   pytest tests/ -v
   pytest tests/integration/ -v --slow
   ```

## Current Sprint Focus

### Week 1 (Current)
- [ ] Complete FastAPI structure
- [ ] Integrate LightRAG
- [ ] Implement document endpoints
- [ ] Add workspace management
- [ ] Setup storage layers

### Week 2
- [ ] Add search endpoints
- [ ] Implement caching
- [ ] Add authentication
- [ ] Create monitoring
- [ ] Optimize performance

## Code Standards

### API Models
```python
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class DocumentModel(BaseModel):
    id: Optional[str] = Field(None, description="Document ID")
    content: str = Field(..., description="Document content")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    workspace_id: str = Field(..., description="Workspace ID")
    created_at: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "content": "Sample document content",
                "metadata": {"source": "api", "type": "text"},
                "workspace_id": "lsemb_customer1_prod"
            }
        }
```

### Error Handling
```python
class AsembException(HTTPException):
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        details: Optional[Dict] = None
    ):
        super().__init__(
            status_code=status_code,
            detail={
                "error_code": error_code,
                "message": message,
                "details": details or {}
            }
        )

# Usage
raise AsembException(
    status_code=404,
    error_code="WORKSPACE_NOT_FOUND",
    message="Workspace does not exist",
    details={"workspace_id": workspace_id}
)
```

### Storage Operations
```python
async def store_document(
    document: DocumentModel,
    workspace_id: str
) -> str:
    """Store document across all backends"""
    # Store in PostgreSQL for vector search
    await postgres_client.store_vector(
        workspace_id,
        document
    )
    
    # Store in Redis for fast retrieval
    await redis_client.set(
        f"lsemb:{workspace_id}:doc:{document.id}",
        document.json()
    )
    
    # Update Neo4j graph if enabled
    if config.neo4j_enabled:
        await neo4j_client.add_document_node(
            workspace_id,
            document
        )
    
    return document.id
```

## Performance Requirements
- API response time < 200ms (excluding LLM calls)
- Support 100+ concurrent workspaces
- Handle 1000+ documents per workspace
- Process 50+ queries per second
- Maintain < 100MB memory per workspace

## Security Requirements
- API key authentication
- Workspace-level access control
- Rate limiting per customer
- Input sanitization
- SQL injection prevention
- Audit logging

## Success Metrics
- All endpoints documented (OpenAPI)
- 95%+ test coverage
- Zero security vulnerabilities
- Sub-second response times
- Proper error handling

## Notes
- LightRAG handles the RAG logic
- Focus on API and multi-tenancy
- Workspace isolation is critical
- Performance monitoring essential
- Keep endpoints RESTful

## Questions?
Check n8n node implementation or coordinate through code comments.