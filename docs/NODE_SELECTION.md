# 🎯 ASEMB n8n Node Selection Strategy

## Core Nodes to Deploy (Priority 1)

### 1. **ASEMBWorkflow** (NEW - All-in-one)
- Combines all operations in single node
- Easy to use for beginners
- Supports all workflows

### 2. **AliceSemanticBridgeV2** 
- Full featured semantic operations
- Manage operations (delete, stats, cleanup)
- Error handling with circuit breaker

### 3. **PgHybridQuery**
- Advanced hybrid search (vector + keyword)
- Best performance for search

### 4. **WebScrapeEnhanced**
- Advanced web scraping with robots.txt
- CSS selectors and cleaning

### 5. **TextChunk**
- Smart text chunking
- Overlap support for context

### 6. **DocumentProcessor**
- Handle PDFs, DOCX, etc.
- Metadata extraction

## Optional Nodes (Priority 2)

### 7. **SitemapFetch**
- For bulk website ingestion
- Automatic URL discovery

### 8. **RedisPublish** (if using Redis)
- For real-time updates
- Agent communication

## Deprecated Nodes (Don't Deploy)
- AliceSemanticBridge (old v1)
- AliceSemanticBridgeEnhanced (replaced by V2)
- PgvectorUpsert (integrated into V2)
- PgvectorQuery (use PgHybridQuery)
- WebScrape (use Enhanced version)

## Credentials Required

### 1. **PostgresDb** (NEW)
```json
{
  "host": "localhost",
  "database": "asemb",
  "user": "asemb_user",
  "password": "your_password",
  "port": 5432,
  "ssl": "disable"
}
```

### 2. **OpenAiApi**
```json
{
  "apiKey": "sk-...",
  "organizationId": "org-..." // optional
}
```

### 3. **RedisApi** (Optional)
```json
{
  "host": "localhost",
  "port": 6379,
  "database": 0,
  "password": "" // if required
}
```

## Example Workflows

### 1. Simple Web to Search
```
[Web Scrape Enhanced] → [Text Chunk] → [ASEMB Workflow (webToVector)]
                                          ↓
                                    [ASEMB Workflow (semanticSearch)]
```

### 2. Document Processing
```
[HTTP Request (PDF)] → [Document Processor] → [ASEMB Workflow (documentToVector)]
```

### 3. Hybrid Search API
```
[Webhook] → [ASEMB Workflow (hybridSearch)] → [HTTP Response]
```

### 4. Workspace Management
```
[Schedule Trigger] → [ASEMB Workflow (getStats)] → [Email Report]
```

## Deployment Package Structure
```
dist/
├── nodes/
│   ├── ASEMBWorkflow.node.js         ✅
│   ├── AliceSemanticBridgeV2.node.js ✅
│   ├── PgHybridQuery.node.js         ✅
│   ├── WebScrapeEnhanced.node.js     ✅
│   ├── TextChunk.node.js             ✅
│   ├── DocumentProcessor.node.js     ✅
│   └── SitemapFetch.node.js          ✅
├── credentials/
│   ├── PostgresDb.credentials.js     ✅
│   ├── OpenAiApi.credentials.js      ✅
│   └── RedisApi.credentials.js       ✅
└── shared/
    ├── db.js
    ├── embedding-service.js
    ├── hybrid-search.js
    ├── cache-manager.js
    └── error-handler.js
```
