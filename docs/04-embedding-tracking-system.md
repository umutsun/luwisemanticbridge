# Embedding Tracking System

## Overview
This document describes the embedding tracking system implemented to monitor model usage, token consumption, and embedding generation across the ASB platform.

## Features

### 1. Model Usage Tracking
- Track which embedding model was used for each document
- Monitor token consumption per document and per operation
- Aggregate statistics for cost analysis

### 2. Token Management
- Count tokens used for each embedding operation
- Track search query token usage
- Calculate total costs based on model pricing

### 3. Analytics & Reporting
- Time-series analysis of token usage
- Model performance metrics
- Usage pattern identification

## Database Schema

### document_embeddings Table Updates
```sql
-- New columns added to track embeddings
ALTER TABLE document_embeddings
ADD COLUMN IF NOT EXISTS model_name VARCHAR(100) DEFAULT 'text-embedding-ada-002',
ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER DEFAULT 1536;
```

### embedding_model_usage Table
```sql
CREATE TABLE IF NOT EXISTS embedding_model_usage (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    total_tokens_used INTEGER DEFAULT 0,
    total_embeddings INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0.000000,
    avg_tokens_per_embedding DECIMAL(10, 2),
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (model_name)
);
```

### embedding_stats View
```sql
CREATE OR REPLACE VIEW embedding_stats AS
SELECT
    model_name,
    COUNT(*) as total_embeddings,
    SUM(tokens_used) as total_tokens,
    AVG(tokens_used) as avg_tokens_per_embedding,
    MIN(tokens_used) as min_tokens,
    MAX(tokens_used) as max_tokens,
    embedding_dimension,
    DATE(created_at) as date
FROM document_embeddings
GROUP BY model_name, embedding_dimension, DATE(created_at)
ORDER BY date DESC;
```

## Implementation Details

### 1. Enhanced Embedding Service

#### createEmbeddings Method (`backend/src/services/document-processor.service.ts`)
```typescript
async createEmbeddings(text: string): Promise<{embedding: number[], tokens: number, model: string}> {
  try {
    const openaiClient = await this.getOpenAIClient();

    if (!openaiClient) {
      return {embedding: [], tokens: 0, model: 'text-embedding-ada-002'};
    }

    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
    const response = await openaiClient.embeddings.create({
      model: model,
      input: text
    });

    return {
      embedding: response.data[0].embedding,
      tokens: response.usage.total_tokens,
      model: model
    };
  } catch (error) {
    return {embedding: [], tokens: 0, model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002'};
  }
}
```

#### Document Processing with Tracking
```typescript
async processAndEmbedDocument(documentId: number, content: string, title: string): Promise<void> {
  const chunks = this.createChunks(content, metadata.type);
  let totalTokensUsed = 0;
  let modelName = 'text-embedding-ada-002';
  let embeddingDimension = 1536;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const result = await this.createEmbeddings(chunk);

    totalTokensUsed += result.tokens;
    modelName = result.model;
    embeddingDimension = result.embedding.length;

    // Store with tracking data
    await pool.query(
      `INSERT INTO document_embeddings
       (document_id, chunk_text, embedding, metadata, model_name, tokens_used, embedding_dimension)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        documentId,
        chunk,
        `[${result.embedding.join(',')}]`,
        JSON.stringify({
          ...metadata,
          model_used: modelName,
          tokens_used: result.tokens
        }),
        modelName,
        result.tokens,
        embeddingDimension
      ]
    );
  }

  // Update model usage tracking
  await pool.query(
    `INSERT INTO embedding_model_usage
       (model_name, total_tokens_used, total_embeddings, avg_tokens_per_embedding)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (model_name)
     DO UPDATE SET
       total_tokens_used = embedding_model_usage.total_tokens_used + EXCLUDED.total_tokens_used,
       total_embeddings = embedding_model_usage.total_embeddings + EXCLUDED.total_embeddings,
       avg_tokens_per_embedding =
         (embedding_model_usage.total_tokens_used + EXCLUDED.total_tokens_used) /
         (embedding_model_usage.total_embeddings + EXCLUDED.total_embeddings),
       last_used_at = CURRENT_TIMESTAMP`,
    [modelName, totalTokensUsed, chunks.length, totalTokensUsed / chunks.length]
  );
}
```

### 2. API Endpoints

#### Enhanced Document List (`/api/documents`)
```typescript
const result = await lsembPool.query(`
  SELECT d.*,
         COALESCE(emb_stats.model_name, 'None') as embedding_model,
         COALESCE(emb_stats.total_tokens, 0) as total_tokens_used,
         COALESCE(emb_stats.chunk_count, 0) as chunk_count,
         CASE
           WHEN EXISTS(SELECT 1 FROM document_embeddings de WHERE de.document_id = d.id)
           THEN true
           ELSE false
         END as has_embeddings
  FROM documents d
  LEFT JOIN (
    SELECT
      document_id,
      model_name,
      SUM(tokens_used) as total_tokens,
      COUNT(*) as chunk_count
    FROM document_embeddings
    GROUP BY document_id, model_name
  ) emb_stats ON d.id = emb_stats.document_id
  ORDER BY d.created_at DESC
`);
```

#### Embedding Statistics (`/api/documents/embeddings/stats`)
```typescript
// Model-specific stats
const modelStats = await lsembPool.query(`
  SELECT
    model_name,
    COUNT(*) as total_embeddings,
    SUM(tokens_used) as total_tokens,
    AVG(tokens_used) as avg_tokens_per_embedding,
    MIN(tokens_used) as min_tokens,
    MAX(tokens_used) as max_tokens,
    COUNT(DISTINCT document_id) as unique_documents,
    embedding_dimension
  FROM document_embeddings
  WHERE model_name IS NOT NULL
  GROUP BY model_name, embedding_dimension
  ORDER BY total_tokens DESC
`);

// Token usage over time (last 7 days)
const timeStats = await lsembPool.query(`
  SELECT
    DATE(created_at) as date,
    COUNT(*) as embeddings,
    SUM(tokens_used) as tokens
  FROM document_embeddings
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY date DESC
`);
```

### 3. Frontend Integration

#### Document Metadata Display
```typescript
// In frontend/src/app/dashboard/documents/page.tsx
interface Document {
  id: string;
  title: string;
  content: string;
  type: string;
  size: number;
  hasEmbeddings: boolean;
  metadata: {
    embedding_model?: string;
    total_tokens_used?: number;
    chunks?: number;
    created_at: string;
  };
}
```

#### Token Usage Display
```jsx
{selectedDoc.metadata?.total_tokens_used && (
  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
    <div className="flex items-center gap-2">
      <Brain className="w-5 h-5 text-blue-600" />
      <span className="text-sm font-medium">Embedding Info</span>
    </div>
    <div className="mt-2 space-y-1">
      <p className="text-sm text-gray-600">
        Model: <span className="font-medium">{selectedDoc.metadata.embedding_model}</span>
      </p>
      <p className="text-sm text-gray-600">
        Tokens Used: <span className="font-medium">{selectedDoc.metadata.total_tokens_used.toLocaleString()}</span>
      </p>
    </div>
  </div>
)}
```

## Token Pricing

### OpenAI Pricing (as of 2024)
| Model | Cost per 1K tokens | Dimensions |
|-------|-------------------|------------|
| text-embedding-ada-002 | $0.0001 | 1536 |
| text-embedding-3-small | $0.00002 | 1536 |
| text-embedding-3-large | $0.00013 | 3072 |

### Cost Calculation
```typescript
function calculateEmbeddingCost(tokens: number, model: string): number {
  const pricing = {
    'text-embedding-ada-002': 0.0001 / 1000,
    'text-embedding-3-small': 0.00002 / 1000,
    'text-embedding-3-large': 0.00013 / 1000
  };

  return tokens * (pricing[model] || pricing['text-embedding-ada-002']);
}
```

## Migration Scripts

### Database Migration (`backend/src/scripts/update-embeddings-schema.sql`)
```sql
-- Add tracking columns
ALTER TABLE document_embeddings
ADD COLUMN IF NOT EXISTS model_name VARCHAR(100) DEFAULT 'text-embedding-ada-002',
ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER DEFAULT 1536;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_document_embeddings_model_name
ON document_embeddings(model_name);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_tokens_used
ON document_embeddings(tokens_used);

-- Update existing records
UPDATE document_embeddings
SET model_name = 'text-embedding-ada-002',
    tokens_used = 0,
    embedding_dimension = 1536
WHERE model_name IS NULL OR tokens_used IS NULL;
```

### Node.js Migration Runner (`backend/src/scripts/update-embeddings-schema.js`)
```bash
cd backend
node src/scripts/update-embeddings-schema.js
```

## Usage Examples

### 1. Create Embeddings with Tracking
```bash
curl -X POST http://localhost:8083/api/documents/123/embeddings
```

Response:
```json
{
  "success": true,
  "message": "Embeddings created successfully",
  "documentId": "123",
  "embeddingCount": 15,
  "modelUsed": "text-embedding-ada-002",
  "tokensUsed": 2450
}
```

### 2. Get Embedding Statistics
```bash
curl http://localhost:8083/api/documents/embeddings/stats
```

Response:
```json
{
  "stats": {
    "documentsWithEmbeddings": 25,
    "totalChunks": 375,
    "totalCharacters": 1250000,
    "modelBreakdown": [
      {
        "model_name": "text-embedding-ada-002",
        "total_embeddings": 375,
        "total_tokens": 61250,
        "avg_tokens_per_embedding": 163.33,
        "unique_documents": 25,
        "embedding_dimension": 1536
      }
    ],
    "timeSeries": [
      {
        "date": "2024-01-14",
        "embeddings": 50,
        "tokens": 8165
      }
    ]
  }
}
```

### 3. Search with Token Tracking
```javascript
const response = await fetch('/api/documents/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'machine learning', limit: 5 })
});

// Search also tracks token usage
console.log(`Search used ${response.tokensUsed} tokens`);
```

## Monitoring & Analytics

### 1. Real-time Monitoring
```typescript
// WebSocket stream for token usage
const ws = new WebSocket('ws://localhost:8083/api/embeddings/stream');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`Tokens used: ${data.tokens}`);
};
```

### 2. Dashboard Metrics
```typescript
// Daily token usage chart
const dailyUsage = await fetch('/api/embeddings/usage/daily');

// Model performance comparison
const modelComparison = await fetch('/api/embeddings/models/comparison');

// Cost analysis
const costAnalysis = await fetch('/api/embeddings/cost/analysis');
```

### 3. Alerting System
```typescript
// Alert when usage exceeds threshold
if (totalTokens > 1000000) {
  sendAlert('Monthly token limit exceeded');
}

// Alert on unusual usage patterns
if (hourlyTokens > average * 2) {
  sendAlert('Unusual spike in token usage');
}
```

## Performance Optimization

### 1. Batch Processing
```typescript
// Process multiple embeddings in parallel
const batchSize = 10;
for (let i = 0; i < chunks.length; i += batchSize) {
  const batch = chunks.slice(i, i + batchSize);
  await Promise.all(
    batch.map(chunk => createEmbeddings(chunk))
  );
}
```

### 2. Caching Strategy
```typescript
// Cache embedding results
const cache = new Map<string, {embedding: number[], model: string}>();

function getCachedEmbedding(text: string) {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  return cache.get(hash);
}
```

### 3. Rate Limiting
```typescript
// Implement rate limiting for API calls
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(userId: string, limit: number, window: number): boolean {
  const now = Date.now();
  const userRequests = rateLimiter.get(userId) || [];

  // Remove old requests outside window
  const validRequests = userRequests.filter(time => now - time < window);

  if (validRequests.length >= limit) {
    return false;
  }

  validRequests.push(now);
  rateLimiter.set(userId, validRequests);
  return true;
}
```

## Security Considerations

### 1. API Key Protection
```typescript
// Secure API key storage
const encryptedKey = process.env.OPENAI_API_KEY_ENCRYPTED;
const apiKey = decrypt(encryptedKey);
```

### 2. Usage Logging
```typescript
// Log all embedding operations
await pool.query(`
  INSERT INTO embedding_usage_logs
  (user_id, document_id, tokens_used, model_name, ip_address)
  VALUES ($1, $2, $3, $4, $5)
`, [userId, documentId, tokens, model, ipAddress]);
```

### 3. Cost Controls
```typescript
// Enforce per-user limits
const userLimit = await getUserTokenLimit(userId);
if (totalTokens + requestTokens > userLimit) {
  throw new Error('Token limit exceeded');
}
```

## Future Enhancements

### 1. Multi-Model Support
- Automatic model selection based on use case
- A/B testing for model performance
- Dynamic model switching based on cost

### 2. Token Optimization
- Text preprocessing to reduce tokens
- Smart chunking strategies
- Context window optimization

### 3. Advanced Analytics
- Predictive cost analysis
- Usage pattern recognition
- Budget forecasting

## Troubleshooting

### Common Issues

1. **Token Count Discrepancies**
   - Check if tiktoken is used for accurate counting
   - Verify model-specific tokenization rules

2. **Model Not Tracked**
   - Ensure metadata columns are properly populated
   - Check migration script execution

3. **Performance Issues**
   - Implement connection pooling
   - Use batch processing for bulk operations

## Related Files

- `backend/src/services/document-processor.service.ts` - Core embedding logic
- `backend/src/routes/documents.routes.ts` - API endpoints
- `backend/src/scripts/update-embeddings-schema.sql` - Migration script
- `frontend/src/app/dashboard/documents/page.tsx` - UI components
- `docs/api-endpoints.md` - API documentation