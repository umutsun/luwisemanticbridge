# LSEMB Node Deployment Information

## Version: 1.0.0
## Build Date: 2025-08-29T10:54:18.223Z

## Included Nodes:
1. LSEMBWorkflow - All-in-one workflow operations
2. AliceSemanticBridgeV2 - Advanced semantic operations with error handling
3. PgHybridQuery - Hybrid search (vector + keyword)
4. WebScrapeEnhanced - Advanced web scraping
5. TextChunk - Intelligent text chunking
6. DocumentProcessor - Multi-format document processing
7. SitemapFetch - Bulk website ingestion

## Credentials Required:
1. PostgresDb - PostgreSQL with pgvector
2. OpenAiApi - For embeddings generation
3. RedisApi - Optional, for caching

## Database Setup:
```sql
CREATE DATABASE lsemb;
CREATE EXTENSION vector;
CREATE EXTENSION pg_trgm;
```

## Quick Test:
1. Install in n8n
2. Create credentials
3. Import example workflow
4. Test with a simple URL

## Support:
- GitHub: https://github.com/yourusername/alice-semantic-bridge
- Issues: https://github.com/yourusername/alice-semantic-bridge/issues
