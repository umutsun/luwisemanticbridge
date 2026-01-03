# Luwi Semantic Bridge - n8n Community Node

Store and search semantic embeddings with PostgreSQL + pgvector.

## Features

- **Embed and Store**: Generate OpenAI embeddings and store them in PostgreSQL with pgvector
- **Semantic Search**: Find similar documents using cosine similarity

## Requirements

- PostgreSQL with pgvector extension enabled
- OpenAI API key for embedding generation

## Installation

### From npm (when published)
```bash
npm install n8n-nodes-luwi-semantic-bridge
```

### Manual Installation
1. Navigate to your n8n custom nodes directory:
   ```bash
   cd ~/.n8n/custom
   ```

2. Install the package:
   ```bash
   npm install /path/to/n8n-nodes-luwi-semantic-bridge-1.0.0.tgz
   ```

3. Restart n8n:
   ```bash
   pm2 restart n8n
   ```

## Configuration

### Credentials

The node requires the following credentials:

| Field | Description |
|-------|-------------|
| PostgreSQL Host | Database server hostname |
| PostgreSQL Port | Database server port (default: 5432) |
| PostgreSQL Database | Database name |
| PostgreSQL User | Database username |
| PostgreSQL Password | Database password |
| PostgreSQL SSL | Enable SSL connection |
| OpenAI API Key | Your OpenAI API key for embeddings |

### Operations

#### Embed and Store
Generate an embedding for text and store it in the database.

| Parameter | Description |
|-----------|-------------|
| Text | The text content to embed |
| Document ID | Unique identifier for the document |
| Metadata | Additional JSON metadata to store |

#### Search
Find similar documents using semantic search.

| Parameter | Description |
|-----------|-------------|
| Text | The search query |
| Limit | Maximum number of results (default: 10) |

## Database Setup

The node automatically creates the required table:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  text TEXT,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Make sure pgvector extension is enabled:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Example Workflow

See `examples/semantic-search-workflow.json` for a complete demo workflow.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Pack for distribution
npm pack
```

## License

MIT

## Author

Luwi - https://luwi.dev
