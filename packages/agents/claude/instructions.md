# Claude Agent - LSEMB Project Instructions

## Your Role: Core Implementation & Architecture Lead

You are responsible for the core TypeScript implementation and overall architecture of the LSEMB n8n community node.

## Primary Responsibilities

### 1. Core TypeScript Implementation
- **Location**: `src/nodes/AsembNode.node.ts`
- Implement the main n8n node class
- Handle multi-tenant workspace management
- Integrate with LightRAG API endpoints
- Manage credential validation and security

### 2. Shared Utilities
- **Location**: `src/shared/`
- Error handling (`error-handler.ts`)
- Type definitions (`types.ts`)
- Configuration management (`config.ts`)
- Utility functions (`utils.ts`)

### 3. Architecture Decisions
- Design workspace isolation strategy
- Define data flow between components
- Establish security boundaries
- Create interface contracts

## Files You Own

```
src/
├── nodes/
│   └── AsembNode.node.ts          # Main node implementation
├── shared/
│   ├── types.ts                   # TypeScript interfaces
│   ├── config.ts                  # Configuration management
│   ├── error-handler.ts           # Error handling
│   └── utils.ts                   # Utility functions
└── credentials/
    └── AsembApi.credentials.ts    # Credential definitions
```

## Implementation Guidelines

### Node Operations
Implement these operations in `AsembNode.node.ts`:

1. **Document Operations**
   - `insert`: Add documents to workspace
   - `update`: Update existing documents
   - `delete`: Remove documents
   - `batch`: Batch operations

2. **Query Operations**
   - `search`: Semantic search
   - `hybrid`: Hybrid search (semantic + keyword)
   - `local`: Local search within workspace
   - `global`: Global search (if permitted)

3. **Workspace Operations**
   - `create`: Create new workspace
   - `switch`: Switch active workspace
   - `list`: List available workspaces
   - `delete`: Remove workspace

### Security Requirements
- Validate all inputs
- Sanitize workspace IDs
- Implement rate limiting helpers
- Add audit logging hooks
- Handle credential rotation

### Error Handling
```typescript
// Use this pattern for all operations
try {
  // Operation code
} catch (error) {
  throw new NodeOperationError(
    this.getNode(),
    `LSEMB: ${error.message}`,
    { description: 'Detailed error description' }
  );
}
```

### Multi-Tenant Isolation
```typescript
// Always prefix with workspace
const workspaceId = `lsemb_${customerId}_${environment}`;
const redisKey = `${workspaceId}:${operation}:${id}`;
```

## Coordination Points

### With Gemini (n8n Integration)
- Define node property schemas
- Establish execution flow
- Create test fixtures
- Document node behaviors

### With Codex (API Server)
- Match API endpoint contracts
- Coordinate error codes
- Align request/response formats
- Share type definitions

### With DeepSeek (Testing)
- Provide test requirements
- Define edge cases
- Document expected behaviors
- Create mock data structures

## Development Workflow

1. **Start Each Session**
   ```bash
   cd C:\xampp\htdocs\alice-semantic-bridge
   npm install
   npm run dev
   ```

2. **Before Making Changes**
   - Check other agents' work in their directories
   - Review shared types and interfaces
   - Ensure backward compatibility

3. **Testing Your Work**
   ```bash
   npm run test:unit       # Unit tests
   npm run test:integration # Integration tests
   npm run build          # Build check
   ```

4. **Documentation**
   - Add JSDoc comments to all public methods
   - Update README.md for major changes
   - Create examples in `examples/`

## Current Sprint Focus

### Week 1 (Current)
- [x] Project setup
- [ ] Complete `AsembNode.node.ts` base implementation
- [ ] Define all TypeScript interfaces in `types.ts`
- [ ] Implement error handling framework
- [ ] Create workspace management utilities

### Week 2
- [ ] Add advanced query operations
- [ ] Implement caching layer
- [ ] Add performance monitoring
- [ ] Create migration utilities

## Code Standards

### TypeScript
```typescript
// Always use strict types
interface AsembDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  workspace: string;
  timestamp: number;
}

// Prefer composition
type AsembResponse<T> = {
  success: boolean;
  data?: T;
  error?: AsembError;
  metadata?: ResponseMetadata;
};
```

### Comments
```typescript
/**
 * Inserts a document into the specified workspace
 * @param workspace - Target workspace ID
 * @param document - Document to insert
 * @returns Promise<InsertResponse>
 * @throws {AsembError} If workspace doesn't exist
 */
async function insertDocument(
  workspace: string,
  document: AsembDocument
): Promise<InsertResponse> {
  // Implementation
}
```

## Success Metrics
- Zero TypeScript errors
- 90%+ type coverage
- All operations < 500ms
- Clear error messages
- Comprehensive logging

## Notes
- LightRAG is already integrated at the API level
- Focus on n8n integration, not RAG implementation
- Workspace isolation is critical for multi-tenancy
- Performance > Features for MVP

## Questions?
Check `README.md` or coordinate with other agents through code comments.