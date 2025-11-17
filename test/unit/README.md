# Unit Tests

This directory contains unit tests for the project's core functionality.

## Structure

```
test/unit/
├── nodes/           # N8N node unit tests
├── shared/          # Shared utilities unit tests
└── integration/     # Component integration tests
```

## Running Unit Tests

```bash
npm test -- test/unit
```

## Node Tests

Node tests verify individual N8N node functionality:

- **PgvectorQuery**: Tests for PostgreSQL vector query operations
- **PgvectorUpsert**: Tests for PostgreSQL vector upsert operations
- **RedisPublish**: Tests for Redis publish operations
- **TextChunk**: Tests for text chunking functionality
- **WebScrape**: Tests for web scraping operations
- **SitemapFetch**: Tests for sitemap fetching
- **PgHybridQuery**: Tests for hybrid query operations

## Shared Tests

Shared tests verify utility functions:

- **cache-manager**: Cache management functionality
- **chunk**: Text chunking utilities
- **db**: Database operations
- **embedding**: Embedding generation
- **error-handler**: Error handling utilities
- **robots**: robots.txt parsing

## Integration Tests

Integration tests verify component interactions:

- **api.health**: API health check functionality
- **redis-pubsub**: Redis pub/sub integration
- **workflow-execution**: Workflow execution integration