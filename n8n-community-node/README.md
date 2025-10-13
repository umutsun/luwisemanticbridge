# n8n-nodes-lsemb

Isolated n8n community node package for Alice Semantic Bridge (LSEMB).

- Build: `npm run build`
- Output: `dist/`
- Install into n8n: copy `dist` to `~/.n8n/custom/n8n-nodes-lsemb` or publish to npm.

This package includes:
- Nodes: AliceSemanticBridge, PgvectorUpsert, PgvectorQuery, WebScrape, RedisPublish, TextChunk, SitemapFetch, PgHybridQuery, AsembSearch, LSEMBWorkflow
- Credentials: OpenAI, PostgresDb, PostgresWithVectorApi, RedisApi, AliceSemanticBridgeApi

Note: Imports were adjusted to use local `shared/`. If you add new imports from the monorepo, keep this isolation by copying needed helpers into `shared/`.