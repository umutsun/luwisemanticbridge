# n8n-nodes-luwi

**Luwi AI - Enterprise RAG & Semantic Search Platform for n8n**

Build intelligent chatbots, knowledge bases, and AI-powered search workflows with ease.

---

## Features

- **Semantic Search** - Find relevant content using AI-powered meaning-based search
- **Hybrid Search** - Combine vector similarity with keyword matching for optimal results
- **Document Processing** - Ingest PDFs, DOCX, CSV, and web pages automatically
- **RAG Pipelines** - Build retrieval-augmented generation workflows
- **Multi-Channel** - Connect to Telegram, WhatsApp, REST APIs, and more
- **Enterprise Ready** - Built for production with caching, batching, and error handling

---

## Nodes

| Node | Description |
|------|-------------|
| **Luwi RAG** | Main orchestrator - process content, search, manage knowledge base |
| **Vector Search** | Semantic similarity search with pgvector |
| **Hybrid Search** | Combined vector + keyword search |
| **Vector Store** | Store embeddings in PostgreSQL |
| **Web Scrape** | Fetch and extract content from web pages |
| **Text Chunk** | Split text into overlapping chunks |
| **Document Processor** | Process PDF, DOCX, CSV files |
| **Sitemap Fetch** | Parse XML sitemaps for URLs |
| **Redis Publish** | Publish events to Redis channels |

---

## Quick Start

### 1. Install the package

```bash
# Install globally
npm install -g n8n-nodes-luwi

# Or install in your n8n instance
cd ~/.n8n
npm install n8n-nodes-luwi
```

### 2. Configure credentials

In n8n, create credentials for:
- **PostgreSQL (pgvector)** - Your vector database
- **OpenAI API** - For generating embeddings
- **Redis** (optional) - For caching

### 3. Build your first workflow

1. Add **Luwi RAG** node
2. Configure "Process Content" operation
3. Connect your data source
4. Execute to generate embeddings!

---

## Requirements

- **n8n** v1.40.0+
- **PostgreSQL** with pgvector extension
- **OpenAI API** key
- **Node.js** 18+

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       n8n Workflow                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Web Scrape │  │  Document   │  │   Luwi RAG  │         │
│  │   (Input)   │─▶│  Processor  │─▶│  (Process)  │         │
│  └─────────────┘  └─────────────┘  └──────┬──────┘         │
└────────────────────────────────────────────┼───────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vector Database                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ PostgreSQL  │  │   OpenAI    │  │    Redis    │         │
│  │ (pgvector)  │  │ Embeddings  │  │   (cache)   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## Example Workflows

### RAG Chatbot

```
[Telegram Trigger] → [Luwi RAG (Search)] → [OpenAI Chat] → [Telegram Send]
```

### Document Ingestion

```
[Webhook] → [Document Processor] → [Text Chunk] → [Luwi RAG (Process)]
```

### Web Knowledge Base

```
[Sitemap Fetch] → [Web Scrape] → [Text Chunk] → [Luwi RAG (Process)]
```

---

## Development

```bash
# Clone repository
git clone https://github.com/luwi-software/n8n-nodes-luwi.git

# Install dependencies
npm install

# Build
npm run build

# Link for local development
npm link

# In your n8n installation
npm link n8n-nodes-luwi
```

---

## Support

- **Documentation**: https://luwi.dev/docs
- **Issues**: https://github.com/luwi-software/n8n-nodes-luwi/issues
- **Email**: support@luwi.dev

---

## License

MIT License - see [LICENSE](LICENSE) file.

---

**Built with by [Luwi Software](https://luwi.dev)**
