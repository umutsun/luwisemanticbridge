# DeepSeek Agent - LSEMB Project Instructions

## Your Role: Testing, Documentation & Quality Assurance

You are responsible for comprehensive testing, documentation, CI/CD, and ensuring production readiness.

## Primary Responsibilities

### 1. Testing Framework
- **Location**: `tests/`
- Unit tests for all components
- Integration tests for workflows
- End-to-end testing
- Performance benchmarking

### 2. Documentation
- **Location**: `docs/`
- API documentation
- User guides
- Developer documentation
- Architecture diagrams

### 3. CI/CD Pipeline
- **Location**: `.github/workflows/`
- Automated testing
- Build pipelines
- Release management
- Quality gates

## Files You Own

```
tests/
├── unit/
│   ├── nodes/               # n8n node tests
│   ├── api/                 # API tests
│   └── shared/              # Utility tests
├── integration/
│   ├── workflows/           # n8n workflow tests
│   ├── api/                 # API integration tests
│   └── rag/                 # LightRAG tests
├── e2e/
│   ├── scenarios/           # End-to-end scenarios
│   └── performance/         # Performance tests
└── fixtures/
    ├── documents.json       # Test documents
    ├── workflows.json       # Test workflows
    └── responses.json       # Mock responses

docs/
├── README.md                # Main documentation
├── INSTALLATION.md          # Installation guide
├── CONFIGURATION.md         # Configuration guide
├── API.md                   # API documentation
├── DEVELOPMENT.md           # Developer guide
├── TROUBLESHOOTING.md       # Common issues
└── examples/
    ├── basic-usage.md       # Basic examples
    └── advanced-usage.md    # Advanced scenarios

.github/
├── workflows/
│   ├── test.yml            # Test pipeline
│   ├── build.yml           # Build pipeline
│   ├── release.yml         # Release pipeline
│   └── security.yml        # Security scanning
├── ISSUE_TEMPLATE/         # Issue templates
└── pull_request_template.md # PR template
```

## Testing Guidelines

### Unit Tests
```typescript
// tests/unit/nodes/AsembNode.test.ts
import { AsembNode } from '../../../src/nodes/AsembNode.node';
import { createMockExecuteFunctions } from '../../helpers/mocks';

describe('AsembNode', () => {
  let node: AsembNode;
  let mockContext: IExecuteFunctions;

  beforeEach(() => {
    node = new AsembNode();
    mockContext = createMockExecuteFunctions();
  });

  describe('Document Operations', () => {
    it('should insert document with correct workspace ID', async () => {
      // Arrange
      const inputData = createDocumentInput();
      mockContext.getInputData.mockReturnValue(inputData);
      
      // Act
      const result = await node.execute.call(mockContext);
      
      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].json).toHaveProperty('id');
      expect(result[0].json.workspace).toBe('lsemb_test_dev');
    });

    it('should handle missing required fields', async () => {
      // Test error handling
    });
  });
});
```

### Integration Tests
```python
# tests/integration/api/test_documents.py
import pytest
from fastapi.testclient import TestClient
from api.main import app

class TestDocumentAPI:
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    @pytest.fixture
    def workspace_id(self):
        return "lsemb_test_integration"
    
    async def test_document_lifecycle(self, client, workspace_id):
        """Test complete document lifecycle"""
        # 1. Create workspace
        workspace_response = client.post(
            f"/api/v1/workspaces",
            json={"id": workspace_id, "name": "Test Workspace"}
        )
        assert workspace_response.status_code == 201
        
        # 2. Insert document
        document = {
            "content": "Test document content",
            "metadata": {"type": "test"}
        }
        insert_response = client.post(
            f"/api/v1/workspaces/{workspace_id}/documents",
            json=document
        )
        assert insert_response.status_code == 201
        doc_id = insert_response.json()["id"]
        
        # 3. Search document
        search_response = client.post(
            f"/api/v1/workspaces/{workspace_id}/search",
            json={"query": "test content"}
        )
        assert search_response.status_code == 200
        assert len(search_response.json()["results"]) > 0
```

### End-to-End Tests
```typescript
// tests/e2e/scenarios/multi-tenant.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Multi-Tenant Workflow', () => {
  test('should isolate workspaces between customers', async ({ page }) => {
    // Create workspace for Customer A
    await page.goto('/n8n');
    await createWorkflow(page, 'Customer A Workflow');
    await addAsembNode(page, {
      workspace: 'lsemb_customerA_prod',
      operation: 'insert'
    });
    
    // Insert document for Customer A
    await executeWorkflow(page);
    
    // Create workspace for Customer B
    await createWorkflow(page, 'Customer B Workflow');
    await addAsembNode(page, {
      workspace: 'lsemb_customerB_prod',
      operation: 'search'
    });
    
    // Verify Customer B cannot see Customer A's data
    const results = await executeWorkflow(page);
    expect(results).toHaveLength(0);
  });
});
```

## Documentation Standards

### API Documentation
```markdown
## POST /api/v1/workspaces/{workspace_id}/documents

Insert a document into the specified workspace.

### Request

**Headers:**
- `Authorization: Bearer {api_key}`
- `Content-Type: application/json`

**Path Parameters:**
- `workspace_id` (string, required): Target workspace identifier

**Body:**
```json
{
  "content": "string",
  "metadata": {
    "key": "value"
  }
}
```

### Response

**Success (201):**
```json
{
  "id": "doc_123456",
  "workspace_id": "lsemb_customer1_prod",
  "created_at": "2024-01-01T00:00:00Z",
  "status": "processed"
}
```

**Errors:**
- `400`: Invalid request body
- `401`: Unauthorized
- `404`: Workspace not found
- `429`: Rate limit exceeded
```

### User Guide Structure
```markdown
# LSEMB User Guide

## Quick Start
1. Install the node
2. Configure credentials
3. Create your first workflow

## Basic Operations

### Inserting Documents
[Step-by-step guide with screenshots]

### Searching Documents
[Examples with different search types]

## Advanced Features

### Multi-Tenant Setup
[Configuration for multiple customers]

### Performance Optimization
[Best practices and tips]
```

## CI/CD Configuration

### Test Pipeline
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx playwright install
      - run: npm run test:e2e
```

## Coordination Points

### With Claude (Core Implementation)
- Test core functions thoroughly
- Document type interfaces
- Verify error handling
- Check edge cases

### With Gemini (n8n Integration)
- Test all node properties
- Verify workflow execution
- Document node usage
- Create example workflows

### With Codex (API Server)
- Test all endpoints
- Verify response formats
- Document API usage
- Check performance

## Development Workflow

1. **Start Each Session**
   ```bash
   cd C:\xampp\htdocs\alice-semantic-bridge
   npm install
   npm run test:watch  # Run tests in watch mode
   ```

2. **Writing Tests**
   - Write test first (TDD)
   - Cover happy path
   - Test error cases
   - Add edge cases
   - Check performance

3. **Documentation Updates**
   - Update after feature completion
   - Include code examples
   - Add diagrams where helpful
   - Keep changelog updated

## Current Sprint Focus

### Week 1 (Current)
- [ ] Setup test framework
- [ ] Write unit tests for existing code
- [ ] Create integration test suite
- [ ] Setup CI/CD pipelines
- [ ] Draft initial documentation

### Week 2
- [ ] Add e2e tests
- [ ] Performance benchmarking
- [ ] Complete API documentation
- [ ] Create user guides
- [ ] Setup monitoring

## Quality Standards

### Test Coverage
- Unit tests: 90%+
- Integration tests: 80%+
- E2E tests: Critical paths
- Performance: All operations

### Documentation Coverage
- All public APIs documented
- User guide for all features
- Developer setup guide
- Troubleshooting guide
- Architecture diagrams

### Performance Benchmarks
```typescript
describe('Performance', () => {
  it('should insert document in < 200ms', async () => {
    const start = Date.now();
    await insertDocument(testDocument);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200);
  });

  it('should search 1000 documents in < 500ms', async () => {
    // Performance test
  });
});
```

## Success Metrics
- 90%+ code coverage
- All tests passing
- Documentation complete
- Performance targets met
- Zero security issues

## Testing Checklist

### For Each Feature
- [ ] Unit tests written
- [ ] Integration tests added
- [ ] E2E scenario covered
- [ ] Performance tested
- [ ] Documentation updated
- [ ] Examples created

### Before Release
- [ ] All tests passing
- [ ] Coverage targets met
- [ ] Documentation reviewed
- [ ] Security scan clean
- [ ] Performance validated
- [ ] Changelog updated

## Notes
- Focus on test reliability
- Document as you test
- Automate everything possible
- Monitor performance trends
- Keep tests maintainable

## Questions?
Review implementation code or leave comments in test files.