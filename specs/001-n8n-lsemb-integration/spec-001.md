# Specification: n8n-LSEMB Integration

**Spec ID**: 001
**Feature**: n8n Community Nodes for LSEMB Chatbot Automation
**Status**: DRAFT
**Created**: 2025-12-17
**Author**: Claude Code AI

---

## 1. Overview

### 1.1 Problem Statement
LSEMB sisteminde scraped/crawled data'yı manuel olarak işliyoruz. Bu veriyi otomatik olarak chatbot-ready formata dönüştürecek ve multi-channel (Telegram, WhatsApp, REST API) üzerinden erişilebilir kılacak bir automation pipeline'a ihtiyacımız var.

### 1.2 Proposed Solution
n8n workflow automation platformunu kullanarak:
1. Web scraping → Text chunking → Vector embeddings → PostgreSQL pipeline
2. RAG-based chatbot responses
3. Multi-channel distribution (Telegram, WhatsApp, REST API)

### 1.3 Success Criteria
- [ ] n8n community nodes sunucuya kuruldu
- [ ] Web scraping pipeline otomatik çalışıyor
- [ ] Chatbot RAG responses doğru çalışıyor
- [ ] En az bir channel (Telegram/API) entegre edildi

---

## 2. Requirements

### 2.1 Functional Requirements

#### FR-1: Data Processing Pipeline
- Web URL'lerden içerik scrape edilebilmeli
- PDF/DOCX/CSV dosyaları işlenebilmeli
- Text chunking (configurable chunk size)
- OpenAI embeddings generation
- PostgreSQL pgvector storage

#### FR-2: Chatbot Output
- User query'lere RAG-based response
- Source citation (hangi chunk'tan geldi)
- Conversation history tracking
- Response time < 2 saniye

#### FR-3: Multi-Channel Support
[NEEDS CLARIFICATION: Hangi channel'lar öncelikli? (Telegram, WhatsApp, REST API, Discord, Slack)]

#### FR-4: Scheduling & Automation
[NEEDS CLARIFICATION: Data scraping ne sıklıkla çalışmalı? (Saatlik, Günlük, Haftalık, Manuel)]

### 2.2 Non-Functional Requirements

#### NFR-1: Performance
- Response time: [NEEDS CLARIFICATION: Max kabul edilebilir response süresi? (1s, 2s, 5s)]
- Concurrent users: [NEEDS CLARIFICATION: Kaç concurrent user desteklenmeli? (10, 50, 100, 500)]

#### NFR-2: Security
- API authentication required
- Rate limiting: [NEEDS CLARIFICATION: Request limit per user? (10/min, 100/hour, unlimited)]

#### NFR-3: Scalability
- Horizontal scaling support
- Redis caching for embeddings

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        n8n Server                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Scraping   │  │  Document   │  │   Chatbot   │         │
│  │  Workflow   │  │  Processor  │  │  Workflow   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
          v                v                v
┌─────────────────────────────────────────────────────────────┐
│                    LSEMB Backend API                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Embeddings  │  │    RAG      │  │    Chat     │         │
│  │   Service   │  │   Service   │  │   Service   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
          v                v                v
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ PostgreSQL  │  │    Redis    │  │   OpenAI    │         │
│  │  (pgvector) │  │   (cache)   │  │    API      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 n8n Community Nodes

Mevcut node'lar (`luwi-semantic-bridge/n8n-community-node`):

| Node | Purpose | Status |
|------|---------|--------|
| AliceSemanticBridge | Main LSEMB integration | Ready |
| PgvectorQuery | Vector search | Ready |
| PgvectorUpsert | Vector storage | Ready |
| PgHybridQuery | Hybrid search | Ready |
| WebScrape | Web scraping | Ready |
| TextChunk | Text chunking | Ready |
| DocumentProcessor | PDF/DOCX/CSV | Ready |
| RedisPublish | Cache invalidation | Ready |

### 3.3 Database Schema

[NEEDS CLARIFICATION: Yeni tablo gerekiyor mu yoksa mevcut embeddings tablosu yeterli mi?]

Mevcut tablolar:
- `embeddings` - Vector storage
- `documents` - Document metadata
- `conversations` - Chat history
- `messages` - Individual messages

### 3.4 API Endpoints

#### Existing (LSEMB Backend):
- `POST /api/v2/chat` - RAG chat
- `GET /api/v2/embeddings/*` - Embedding management
- `POST /api/v2/search/*` - Semantic search

#### New (n8n Webhooks):
- `POST /webhook/chat` - Chatbot webhook
- `POST /webhook/ingest` - Document ingestion webhook

---

## 4. Implementation Plan

### Phase 1: n8n Nodes Installation (Week 1-2)
1. Build community nodes locally
2. Package and deploy to server
3. Configure credentials
4. Test basic connectivity

### Phase 2: Data Processing Pipeline (Week 3-4)
1. Web scraping workflow
2. Document processing workflow
3. Embedding generation
4. Storage pipeline

### Phase 3: Chatbot Integration (Week 5-6)
1. REST API chatbot workflow
2. Channel integration (Telegram/WhatsApp)
3. Conversation tracking
4. Response formatting

### Phase 4: Advanced Features (Week 7-8)
1. Multi-language support
2. Response style customization
3. Analytics dashboard
4. Performance optimization

---

## 5. Configuration

### 5.1 Environment Variables

```env
# n8n Server
N8N_HOST=n8n.luwi.dev
N8N_PORT=5678

# LSEMB Backend
LSEMB_API_URL=https://[INSTANCE].luwi.dev/api/v2
LSEMB_API_KEY=[NEEDS CLARIFICATION: API key management - per-user veya global?]

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=[NEEDS CLARIFICATION: text-embedding-3-small veya text-embedding-3-large?]

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_DB=[INSTANCE]_db
POSTGRES_USER=postgres

# Redis
REDIS_URL=redis://localhost:6379/[DB_NUMBER]
```

### 5.2 Chunk Configuration

[NEEDS CLARIFICATION: Varsayılan chunk ayarları ne olmalı?]
- Chunk size: ??? tokens (önerilen: 512)
- Chunk overlap: ??? tokens (önerilen: 64)
- Separators: ["\n\n", "\n", " "]

---

## 6. Testing Strategy

### 6.1 Unit Tests
- Individual node functionality
- Embedding generation accuracy
- Search relevance scoring

### 6.2 Integration Tests
- End-to-end pipeline (URL → Embedding → Search)
- Chatbot response flow
- Multi-channel delivery

### 6.3 Performance Tests
- Load testing (100+ concurrent users)
- Response time benchmarks
- Memory/CPU profiling

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI API rate limits | High | Implement caching, queue system |
| Large document processing | Medium | Chunk in batches, progress tracking |
| n8n server overload | High | Resource limits, workflow optimization |
| Database connection exhaustion | Medium | Connection pooling, timeout management |

---

## 8. Open Questions

1. [NEEDS CLARIFICATION: Bu integration sadece EmlakAI için mi yoksa tüm instance'lar (Vergilex, Bookie) için mi?]

2. [NEEDS CLARIFICATION: Chatbot responses hangi dillerde olmalı? (Türkçe, İngilizce, Arapça)]

3. [NEEDS CLARIFICATION: User authentication n8n webhooks için nasıl yapılacak? (JWT, API Key, Basic Auth)]

4. [NEEDS CLARIFICATION: Mevcut LSEMB chat sistemi ile n8n chatbot nasıl entegre olacak? (Paralel, Replace, Hybrid)]

---

## 9. Appendix

### A. Related Documents
- [N8N_LSEMB_INTEGRATION_PLAN.md](../../docs/reports/N8N_LSEMB_INTEGRATION_PLAN.md)
- [CLAUDE.md](../../.claude/CLAUDE.md)

### B. External References
- [n8n Documentation](https://docs.n8n.io/)
- [pgvector](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-17
**Next Review**: After clarifications resolved
