# Gemini Backend API Routes

## Authentication
POST   /api/v2/auth/register
POST   /api/v2/auth/login
POST   /api/v2/auth/refresh
POST   /api/v2/auth/logout
GET    /api/v2/auth/profile

## Dashboard
GET    /api/v2/dashboard/stats
GET    /api/v2/dashboard/metrics
GET    /api/v2/dashboard/activities
WS     /dashboard (WebSocket namespace)

## Nodes Management
GET    /api/v2/nodes
GET    /api/v2/nodes/:id
POST   /api/v2/nodes
PUT    /api/v2/nodes/:id
DELETE /api/v2/nodes/:id
GET    /api/v2/nodes/:id/executions

## Workflows
GET    /api/v2/workflows
GET    /api/v2/workflows/:id
POST   /api/v2/workflows
PUT    /api/v2/workflows/:id
DELETE /api/v2/workflows/:id
POST   /api/v2/workflows/:id/execute
GET    /api/v2/workflows/:id/status
WS     /workflows (WebSocket namespace)

## Semantic Search
POST   /api/v2/search
POST   /api/v2/search/semantic
POST   /api/v2/search/hybrid
GET    /api/v2/search/suggestions

## Embeddings & Vector Operations
POST   /api/v2/embeddings/generate
POST   /api/v2/embeddings/batch
GET    /api/v2/embeddings/:id
DELETE /api/v2/embeddings/:id

## Web Scraping
POST   /api/v2/webscrape
GET    /api/v2/webscrape/:jobId
POST   /api/v2/webscrape/sitemap
GET    /api/v2/webscrape/status/:jobId

## Agents Communication
GET    /api/v2/agents
GET    /api/v2/agents/:agentId
POST   /api/v2/agents/register
PUT    /api/v2/agents/:agentId
POST   /api/v2/agents/communicate
WS     /agents (WebSocket namespace)

## File Management
POST   /api/v2/files/upload
GET    /api/v2/files/:id
DELETE /api/v2/files/:id
GET    /api/v2/files/:id/download

## System
GET    /api/v2/health
GET    /api/v2/metrics
GET    /api/v2/docs
GET    /api/v2/version
