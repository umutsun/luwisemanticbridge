# 🌟 LSEMB - Luwi Semantic Bridge

**Advanced AI-Powered Semantic Search & Knowledge Management Platform**

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/umutsun/lsemb)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-green)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/redis-7.0-red)](https://redis.io)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 📋 İçindekiler

- [Genel Bakış](#-genel-bakış)
- [Mimari](#-mimari)
- [Teknoloji Stack](#-teknoloji-stack)
- [Özellikler](#-özellikler)
- [Kurulum](#-kurulum)
- [Yapılandırma](#-yapılandırma)
- [API Dokümantasyonu](#-api-dokümantasyonu)
- [Deployment](#-deployment)
- [Multi-Tenant Mimari](#-multi-tenant-mimari)
- [Güvenlik](#-güvenlik)

## 🚀 Genel Bakış

LSEMB (Luwi Semantic Bridge), modern AI teknolojilerini kullanarak kurumsal düzeyde semantik arama ve bilgi yönetimi sağlayan kapsamlı bir platformdur. RAG (Retrieval Augmented Generation) mimarisi üzerine kurulu sistem, doküman işleme, vektör embeddings, ve gelişmiş sohbet yetenekleri sunar.

### Temel Yetenekler

- **🔍 Gelişmiş Semantik Arama**: PgVector ve OpenAI/Google embeddings ile yüksek hassasiyetli arama
- **💬 RAG-Tabanlı Sohbet**: Contextual AI sohbet sistemi
- **🌐 Çok Dilli Destek**: Türkçe ve İngilizce tam destek
- **📊 Veri İşleme Pipeline**: Otomatik doküman işleme ve embedding oluşturma
- **🔄 Gerçek Zamanlı Senkronizasyon**: WebSocket ile canlı veri akışı
- **🏢 Multi-Tenant Mimari**: Tek kod tabanından birden fazla uygulama servisi

## 🏗 Mimari

### Sistem Bileşenleri

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js 15)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │   React  │ │ TanStack │ │  Tailwind│ │  GraphQL │          │
│  │   19.1   │ │   Query  │ │    CSS   │ │  Client  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js/TypeScript)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Express │ │ GraphQL  │ │WebSocket │ │   REST   │          │
│  │    API   │ │   Yoga   │ │ Socket.io│ │   API    │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │              CORE SERVICES                        │          │
│  │  • RAG Chat Service      • Semantic Search       │          │
│  │  • Document Processor    • Embedding Service     │          │
│  │  • Scraper Service       • LLM Manager          │          │
│  │  • Cache Service         • Queue Processor       │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴──────────┐
                    ▼                      ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   PYTHON MICROSERVICES   │  │      DATA STORAGE        │
│  ┌──────────────────┐    │  │  ┌──────────────────┐   │
│  │    Crawl4AI      │    │  │  │   PostgreSQL 16   │   │
│  │  Web Scraping    │    │  │  │    + PgVector     │   │
│  └──────────────────┘    │  │  │  + PgVectorScale  │   │
│  ┌──────────────────┐    │  │  └──────────────────┘   │
│  │   Whisper API    │    │  │  ┌──────────────────┐   │
│  │ Speech-to-Text   │    │  │  │     Redis 7.0     │   │
│  └──────────────────┘    │  │  │   Cache & Queue    │   │
│  ┌──────────────────┐    │  │  └──────────────────┘   │
│  │      PgAI        │    │  │                          │
│  │ Auto Embeddings  │    │  │                          │
│  └──────────────────┘    │  │                          │
└──────────────────────────┘  └──────────────────────────┘
```

## 💻 Teknoloji Stack

### Frontend
- **Framework**: Next.js 15.5.2 (App Router)
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS + Radix UI Components
- **State Management**: Zustand 5.0.8
- **Data Fetching**: TanStack Query + GraphQL Request
- **Real-time**: Socket.io Client
- **Charts**: Recharts + D3.js
- **Markdown**: React Markdown + Syntax Highlighter

### Backend
- **Runtime**: Node.js 16+ with TypeScript 5.9.2
- **Framework**: Express.js 4.21
- **API Layer**:
  - GraphQL (Yoga 5.16)
  - REST API (Express + Swagger)
  - WebSocket (Socket.io)
- **Database**:
  - PostgreSQL 16 (Ana veritabanı)
  - PgVector 0.7.0 (Vektör aramaları)
  - Redis 7.0 (Cache & Queue)
- **AI/ML Entegrasyonları**:
  - OpenAI GPT-4o
  - Anthropic Claude 3.5
  - Google Gemini Pro
  - Groq LLaMA
  - DeepSeek
  - OpenRouter (70+ model)
- **Embedding Providers**:
  - OpenAI text-embedding-3-large
  - Google text-embedding-004
  - Cohere embed-v3
  - Voyage AI

### Python Microservices
- **Framework**: FastAPI
- **Web Scraping**: Crawl4AI (AI-powered scraping)
- **Speech-to-Text**: OpenAI Whisper
- **Embeddings**: PgAI (Otomatik embedding yönetimi)
- **Async Support**: asyncio + aiohttp

## ✨ Özellikler

### 1. Semantik Arama ve RAG
- **Hibrit Arama**: Keyword + Vector + Reranking
- **Multi-Modal Embeddings**: Text, Image, Audio desteği
- **Contextual Chat**: Doküman tabanlı AI sohbet
- **Smart Chunking**: Akıllı metin parçalama algoritmaları
- **Cross-lingual Search**: Diller arası arama

### 2. Doküman İşleme
- **Formatlar**: PDF, Word, Excel, CSV, JSON, HTML, Markdown
- **OCR Desteği**: Tesseract.js ile görüntüden metin çıkarma
- **Metadata Extraction**: Otomatik metadata ve entity çıkarma
- **Duplicate Detection**: Content hash ile dublike önleme
- **Batch Processing**: Toplu doküman yükleme

### 3. Web Scraping
- **AI-Powered**: Crawl4AI ile akıllı içerik çıkarma
- **Dynamic Sites**: Puppeteer ile JavaScript rendering
- **Schema Support**: Yapılandırılmış veri çıkarma
- **Rate Limiting**: Akıllı hız sınırlama
- **Site Monitoring**: Periyodik içerik güncelleme

### 4. Gerçek Zamanlı Özellikler
- **Live Updates**: WebSocket ile anlık güncelleme
- **Collaborative Editing**: Çoklu kullanıcı desteği
- **Push Notifications**: Sistem bildirimleri
- **Activity Streams**: Kullanıcı aktivite takibi

### 5. Enterprise Özellikler
- **RBAC**: Role-Based Access Control
- **Audit Logging**: Detaylı denetim kayıtları
- **Multi-tenancy**: Çoklu kiracı desteği
- **API Rate Limiting**: API kullanım sınırları
- **Custom Workflows**: N8n entegrasyonu

## 📦 Kurulum

### Ön Gereksinimler

- Node.js 16+ ve npm 8+
- PostgreSQL 16 (pgvector extension ile)
- Redis 7.0+
- Python 3.10+ (Python servisler için)
- Git

### 1. Repository'yi Klonlama

```bash
git clone https://github.com/umutsun/lsemb.git
cd lsemb
```

### 2. Backend Kurulumu

```bash
cd backend

# Bağımlılıkları yükle
npm install

# Environment dosyasını oluştur
cp .env.example .env

# TypeScript build
npm run build

# Veritabanı migration
npm run migrate

# Development modda başlat
npm run dev
```

### 3. Frontend Kurulumu

```bash
cd ../frontend

# Bağımlılıkları yükle
npm install

# Environment dosyasını oluştur
cp .env.example .env.local

# Development modda başlat
npm run dev
```

### 4. Python Servisleri (Opsiyonel)

```bash
cd ../backend/python-services

# Virtual environment oluştur
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# Bağımlılıkları yükle
pip install -r requirements.txt

# Servisi başlat
python main.py
```

### 5. PostgreSQL Ayarları

```sql
-- pgvector extension'ı etkinleştir
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Gerekli tabloları oluştur
-- (Migration scriptleri otomatik yapar)
```

## ⚙️ Yapılandırma

### Backend Environment (.env)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/lsemb
DB_POOL_SIZE=30
DB_POOL_IDLE_TIMEOUT=60000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=yourpassword
REDIS_DB=2

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...

# Security
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=32-char-encryption-key

# Server
PORT=8083
NODE_ENV=development
CORS_ORIGIN=http://localhost:3002

# Python Services
PYTHON_SERVICE_URL=http://localhost:8001
INTERNAL_API_KEY=internal-secret-key

# File Upload
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads
```

### Frontend Environment (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8083
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_WS_URL=ws://localhost:8083
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:8083/graphql
```

## 📚 API Dokümantasyonu

### REST API Endpoints

#### Authentication
- `POST /api/v2/auth/login` - Kullanıcı girişi
- `POST /api/v2/auth/register` - Yeni kullanıcı kaydı
- `POST /api/v2/auth/refresh` - Token yenileme
- `GET /api/v2/auth/verify` - Token doğrulama

#### RAG & Chat
- `POST /api/v2/chat` - RAG tabanlı sohbet
- `GET /api/v2/chat/history` - Sohbet geçmişi
- `POST /api/v2/chat/feedback` - Geri bildirim

#### Semantic Search
- `POST /api/v2/search` - Semantik arama
- `POST /api/v2/search/hybrid` - Hibrit arama
- `POST /api/v2/search/rerank` - Sonuç sıralama

#### Document Management
- `POST /api/v2/documents/upload` - Doküman yükleme
- `GET /api/v2/documents` - Doküman listesi
- `DELETE /api/v2/documents/:id` - Doküman silme
- `POST /api/v2/documents/process` - Doküman işleme

#### Scraping
- `POST /api/v2/scrape` - Web scraping başlat
- `GET /api/v2/scrape/status/:id` - Scraping durumu
- `POST /api/v2/scrape/schedule` - Periyodik scraping

### GraphQL Schema

```graphql
type Query {
  # Search Operations
  semanticSearch(query: String!, limit: Int): [SearchResult!]!
  hybridSearch(query: String!, options: SearchOptions): [SearchResult!]!

  # Chat Operations
  chatHistory(conversationId: String): [Message!]!
  suggestions(context: String): [String!]!

  # Document Operations
  documents(filter: DocumentFilter): [Document!]!
  documentStats: DocumentStatistics!
}

type Mutation {
  # Chat Operations
  sendMessage(input: ChatInput!): ChatResponse!

  # Document Operations
  uploadDocument(file: Upload!): Document!
  processDocument(id: String!): ProcessingResult!

  # Settings
  updateSettings(category: String!, settings: JSON!): Settings!
}

type Subscription {
  # Real-time Updates
  messageReceived(conversationId: String!): Message!
  documentProcessed: Document!
  scraperProgress(taskId: String!): ScraperStatus!
}
```

## 🚀 Deployment

### PM2 ile Production Deployment

```bash
# PM2 kurulumu
npm install -g pm2

# Ecosystem config ile başlat
pm2 start ecosystem.config.js --env production

# Servisleri kontrol et
pm2 list
pm2 logs
pm2 monit

# Auto-restart ayarla
pm2 startup
pm2 save
```

### Docker Deployment

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name lsemb.luwi.dev;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name lsemb.luwi.dev;

    ssl_certificate /etc/letsencrypt/live/lsemb.luwi.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lsemb.luwi.dev/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }

    # GraphQL
    location /graphql {
        proxy_pass http://localhost:8083/graphql;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

## 🏢 Multi-Tenant Mimari

LSEMB, tek kod tabanından birden fazla bağımsız uygulama sunabilir:

### Tenant Konfigürasyonu

```javascript
// ecosystem.emlakai.config.js
{
  name: 'emlakai-backend',
  env: {
    DATABASE_URL: 'postgresql://user:pass@host/emlakai_db',
    REDIS_DB: 1,
    PORT: 8084,
    TENANT_NAME: 'emlakai'
  }
}

// ecosystem.bookie.config.js
{
  name: 'bookie-backend',
  env: {
    DATABASE_URL: 'postgresql://user:pass@host/bookie_db',
    REDIS_DB: 3,
    PORT: 8085,
    TENANT_NAME: 'bookie'
  }
}
```

### Tenant İzolasyonu

- **Database**: Her tenant ayrı PostgreSQL database
- **Redis**: Her tenant ayrı Redis DB (0-15)
- **Ports**: Her tenant ayrı port
- **Domains**: Subdomain veya ayrı domain
- **Storage**: İzole dosya depolama alanları

## 🔒 Güvenlik

### Güvenlik Önlemleri

- **JWT Authentication**: RS256 algoritması
- **Rate Limiting**: Express-rate-limit
- **Input Validation**: Joi & Express-validator
- **SQL Injection Protection**: Parameterized queries
- **XSS Protection**: DOMPurify
- **CORS**: Whitelist tabanlı
- **Helmet.js**: HTTP güvenlik başlıkları
- **Encryption**: AES-256-GCM (hassas veriler)

### API Güvenliği

```javascript
// Rate limiting örneği
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // maksimum istek
  message: 'Too many requests'
});

// API key doğrulama
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !isValidApiKey(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

## 📊 Monitoring & Logging

### Logging
- **Winston**: Structured logging
- **Pino**: High-performance logger
- **Morgan**: HTTP request logging

### Monitoring
- **PM2 Plus**: Application monitoring
- **Custom Metrics**: Prometheus formatında
- **Health Checks**: `/api/v2/health` endpoint

## 🤝 Katkıda Bulunma

Projeye katkıda bulunmak için:

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/AmazingFeature`)
3. Değişiklerinizi commit edin (`git commit -m 'Add some AmazingFeature'`)
4. Branch'e push yapın (`git push origin feature/AmazingFeature`)
5. Pull Request açın

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakınız.

## 👥 Takım

**Luwi Development Team**
- Lead Developer: Umut Sun
- Architecture: LSEMB Core Team
- DevOps: Infrastructure Team

## 📞 İletişim

- **Website**: [https://luwi.dev](https://luwi.dev)
- **Email**: info@luwi.dev
- **GitHub**: [https://github.com/umutsun/lsemb](https://github.com/umutsun/lsemb)

---

<div align="center">
  <b>Built with ❤️ by Luwi Team</b>
  <br>
  <sub>© 2025 Luwi Semantic Bridge. All rights reserved.</sub>
</div>