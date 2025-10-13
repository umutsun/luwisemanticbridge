# Gemini Agent - LSEMB Project Instructions

## Your Role: n8n Node Development & Integration

You are responsible for n8n-specific implementation, node properties, UI/UX, and workflow integration.

## Primary Responsibilities

### 1. Node Properties & UI
- **Location**: `src/nodes/AsembNode.properties.ts`
- Define all node properties and options
- Create dynamic property display logic
- Implement property validation
- Design intuitive UI flow

### 2. Node Operations Implementation
- **Location**: `src/nodes/operations/`
- Implement operation-specific logic
- Handle n8n data transformation
- Manage execution flow
- Process batch operations

### 3. n8n Integration
- **Location**: `src/nodes/helpers/`
- Create n8n helper functions
- Implement data mapping utilities
- Handle credential management
- Manage node execution context

## Files You Own

```
src/
├── nodes/
│   ├── AsembNode.properties.ts    # Node properties definition
│   ├── operations/
│   │   ├── document.ts            # Document operations
│   │   ├── query.ts               # Query operations
│   │   ├── workspace.ts           # Workspace operations
│   │   └── index.ts               # Operation router
│   └── helpers/
│       ├── data-transformer.ts    # Data transformation
│       ├── validators.ts          # Input validation
│       └── n8n-utils.ts          # n8n utilities
└── examples/
    ├── basic-workflow.json         # Example workflows
    └── advanced-workflow.json      # Complex examples
```

## Implementation Guidelines

### Node Properties Structure
```typescript
export const lsembNodeProperties: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    options: [
      {
        name: 'Document',
        value: 'document',
        description: 'Manage documents in workspace',
      },
      {
        name: 'Query',
        value: 'query',
        description: 'Search documents',
      },
      {
        name: 'Workspace',
        value: 'workspace',
        description: 'Manage workspaces',
      },
    ],
    default: 'document',
    description: 'Choose an operation',
  },
  // Add resource-specific properties
];
```

### Dynamic Property Display
```typescript
{
  displayName: 'Workspace ID',
  name: 'workspaceId',
  type: 'string',
  displayOptions: {
    show: {
      operation: ['document', 'query'],
    },
  },
  default: '',
  required: true,
  description: 'ID of the workspace to use',
}
```

### Data Transformation
```typescript
// Transform n8n items to LSEMB format
export function transformToAsembDocument(
  item: INodeExecutionData
): AsembDocument {
  return {
    id: item.json.id as string || generateId(),
    content: item.json.content as string,
    metadata: item.json.metadata as Record<string, unknown> || {},
    workspace: item.json.workspace as string,
    timestamp: Date.now(),
  };
}
```

## Coordination Points

### With Claude (Core Implementation)
- Use types from `shared/types.ts`
- Follow error handling patterns
- Align with core node class
- Share utility functions

### With Codex (API Integration)
- Match API request formats
- Handle response transformations
- Coordinate endpoint paths
- Share validation logic

### With DeepSeek (Testing)
- Provide workflow test cases
- Define property edge cases
- Create sample data
- Document expected behaviors

## Development Workflow

1. **Start Each Session**
   ```bash
   cd C:\xampp\htdocs\alice-semantic-bridge
   npm install
   npm run dev:n8n  # Watch mode for n8n development
   ```

2. **Testing in n8n**
   ```bash
   # Build and link locally
   npm run build
   npm link
   
   # In n8n directory
   npm link n8n-nodes-lsemb
   n8n start
   ```

3. **Property Testing**
   - Test all display conditions
   - Verify validation rules
   - Check default values
   - Ensure help text clarity

## Current Sprint Focus

### Week 1 (Current)
- [ ] Complete property definitions
- [ ] Implement document operations
- [ ] Create data transformers
- [ ] Add input validators
- [ ] Design property UI flow

### Week 2
- [ ] Add query operations
- [ ] Implement workspace management
- [ ] Create workflow examples
- [ ] Add batch processing
- [ ] Optimize performance

## Code Standards

### Property Definitions
```typescript
// Group related properties
const documentProperties: INodeProperties[] = [
  {
    displayName: 'Document Options',
    name: 'documentOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    options: [
      // Grouped options
    ],
  },
];
```

### Operation Handlers
```typescript
export async function handleDocumentOperation(
  this: IExecuteFunctions,
  operation: string,
  items: INodeExecutionData[]
): Promise<INodeExecutionData[]> {
  // Implementation with proper error handling
}
```

## UI/UX Guidelines

### Property Organization
1. Group related properties
2. Use clear, action-oriented labels
3. Provide helpful descriptions
4. Set sensible defaults
5. Show relevant options only

### Error Messages
- User-friendly language
- Actionable solutions
- Include error codes
- Provide documentation links

### Workflow Examples
Create examples for:
- Basic document insertion
- Semantic search
- Workspace management
- Batch operations
- Error handling

## Success Metrics
- Intuitive property flow
- < 3 clicks to configure
- Clear validation messages
- Smooth data transformation
- Working example workflows

## Testing Requirements
- Test all property combinations
- Verify display conditions
- Check validation rules
- Test data transformations
- Validate error handling

## Notes
- Focus on n8n user experience
- Keep properties simple but powerful
- Provide good defaults
- Make common tasks easy
- Support advanced use cases

## Questions?
Check Claude's implementation in `AsembNode.node.ts` or leave comments in code.