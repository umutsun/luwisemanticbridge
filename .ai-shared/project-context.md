# LSEMB Project Context
## Shared Context for Claude, Gemini, and Zai

**Last Updated:** 2025-12-10
**Version:** 1.0

---

## 🎯 Project Overview

### What is LSEMB?
**LSEMB (Luwi Semantic Bridge)** is the **local development** codebase for three production SaaS platforms:
- **EmlakAI** - Real estate AI platform
- **Vergilex** - Tax/legal document intelligence
- **Bookie** - Bookkeeping/accounting automation

### Key Principle
🚨 **CRITICAL:** LSEMB is NOT production. It's the development/testing environment. All code is tested here first, then deployed to production instances.

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React 18
- Vite
- TypeScript
- Tailwind CSS
- GraphQL Client (Apollo)

**Backend:**
- Node.js 20.x
- Express
- TypeScript
- PostgreSQL 15 (with pgvector)
- Redis
- GraphQL (Apollo Server)

**Python Services:**
- FastAPI
- Python 3.12
- Crawlers (Patchright)
- AI/ML (OpenAI, Anthropic, Google)
- OCR (Tesseract, Vision APIs)
- Whisper STT

---

## 🌐 Multi-Instance Architecture

### Production Server
- **Host:** `root@91.99.229.96` (Hetzner VPS)
- **OS:** Linux
- **Disk:** /dev/sda3 (38GB) + /dev/sdb (98GB mounted at /mnt/volume-nbg1-1)

### Production Instances

| Instance | Ports | Redis DB | Location |
|----------|-------|----------|----------|
| EmlakAI | 8084/4001 | 1 | /var/www/emlakai |
| Vergilex | 8087/4003 | 2 | /var/www/vergilex |
| Bookie | 8085/4002 | 3 | /var/www/bookie |

**PM2 Services per Instance:**
- `{instance}-backend` - Node.js API (Port: 808X)
- `{instance}-frontend` - Vite dev server (Port: 400X)
- `{instance}-python` - FastAPI services (Port: 800X)

---

## 🗄️ Database Architecture

### Local Development
- **Database:** `lsemb` (PostgreSQL)
- **Purpose:** Testing all features before production

### Production Databases
- **emlakai_db** - EmlakAI data
- **vergilex_db** - Vergilex data
- **bookie_db** - Bookie data

### Schema Synchronization
🚨 **CRITICAL:** All instances MUST have synchronized schemas.
- Use Knex migrations
- Test locally first
- Deploy to all instances in order: emlakai → vergilex → bookie

---

## 📦 Core Systems

### 1. RAG & Semantic Search
- Document understanding and querying
- Vector embeddings (pgvector)
- Hybrid search (semantic + keyword)
- LightRAG integration (planned)

### 2. Document Processing
- PDF extraction (Gemini PDF API, Tesseract OCR)
- CSV/Excel transformation
- Embedding generation
- Duplicate prevention

### 3. Web Scraping
- **Sahibinden Scraper** - Real estate listings
- **GIB Scraper** - Tax documents
- **Dynamic Scraper** - Configurable scraping
- Technology: Patchright (Playwright fork for Cloudflare bypass)

### 4. AI Integrations
- **Claude** - Code generation, analysis
- **Gemini** - PDF processing, planning
- **DeepSeek** - Cost-effective reasoning
- **Whisper** - Speech-to-text
- **Vision APIs** - OCR, image analysis

### 5. Multi-Tenant System
- Shared codebase
- Instance-specific configurations
- Isolated databases
- Tenant-specific Redis DBs

---

## 📂 Project Structure

```
lsemb/
├── frontend/                   # React + Vite + TypeScript
│   ├── src/
│   │   ├── app/               # Next.js-style routing
│   │   │   └── dashboard/     # 48+ pages
│   │   ├── components/        # Reusable components
│   │   ├── services/          # API services
│   │   └── types/             # TypeScript types
│   └── package.json
│
├── backend/                    # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── routes/            # API routes
│   │   │   └── api/v2/        # API v2 endpoints
│   │   ├── services/          # 80+ business logic services
│   │   ├── types/             # TypeScript types
│   │   └── config/            # Configuration
│   ├── migrations/            # Knex database migrations
│   └── package.json
│
├── backend/python-services/    # FastAPI microservices
│   ├── crawlers/              # Web scrapers
│   ├── rag/                   # RAG system
│   ├── whisper/               # STT service
│   ├── ocr/                   # OCR service
│   └── requirements.txt
│
├── docs/                       # Documentation (NEW STRUCTURE)
│   ├── architecture/          # System architecture
│   ├── features/              # Feature docs
│   ├── guides/                # User & dev guides
│   ├── api/                   # API documentation
│   └── technical/             # Technical deep dives
│
├── .specpulse/                # SpecPulse framework
├── .ai-shared/                # Shared AI context
├── .claude/                   # Claude Code config
├── .gemini/                   # Gemini config
└── .zai/                      # Zai config
```

---

## 🔄 Development Workflow

### 1. Local Development (LSEMB)
```bash
# Frontend
cd frontend
npm install
npm run dev  # Runs on localhost:5173

# Backend
cd backend
npm install
npm run dev  # Runs on localhost:8080

# Python services
cd backend/python-services
pip install -r requirements.txt
uvicorn main:app --reload  # Runs on localhost:8000
```

### 2. Testing
- **Unit Tests:** Backend services, frontend components
- **Integration Tests:** API endpoints, database operations
- **E2E Tests:** User workflows (planned)

### 3. Deployment
```bash
# Step 1: Commit to git
git add .
git commit -m "feat: description"
git push

# Step 2: Deploy to EmlakAI
ssh root@91.99.229.96 "
  cd /var/www/emlakai
  git pull
  cd backend && npm run migrate:latest && npm install && pm2 restart emlakai-backend
  cd ../frontend && npm run build && pm2 restart emlakai-frontend
"

# Step 3: Repeat for Vergilex and Bookie
```

---

## 🎯 Development Priorities

### Current Focus
1. **RAG System Enhancement** - Improve context understanding
2. **Scraper Infrastructure** - Stability and performance
3. **Dashboard Modernization** - UI/UX improvements
4. **Multi-Instance Coordination** - Deployment automation

### Planned Features
1. **Real-time Collaboration** - Multi-user editing
2. **Advanced Analytics** - Usage insights
3. **Mobile App** - React Native
4. **API v3** - GraphQL-first

---

## ⚠️ Critical Rules

### NEVER
1. ❌ Edit files directly on production server via SSH
2. ❌ Delete `/var/www/*` (they're symlinks!)
3. ❌ Run `pm2 delete all`
4. ❌ Skip database migrations
5. ❌ Deploy without local testing

### ALWAYS
1. ✅ Test in `lsemb` database first
2. ✅ Use Knex migrations for schema changes
3. ✅ Deploy to instances in order (emlakai → vergilex → bookie)
4. ✅ Check PM2 logs after deployment
5. ✅ Document significant changes

---

## 📚 Key Documentation

### For Developers
- **Getting Started:** `docs/guides/developer/getting-started.md`
- **Architecture:** `docs/architecture/overview.md`
- **API Docs:** `docs/api/v2/README.md`
- **Deployment:** `docs/guides/deployment/production.md`

### For AI Assistants
- **Claude Instructions:** `.claude/CLAUDE.md`
- **Git Workflow:** `.claude/GIT_WORKFLOW.md`
- **SpecPulse Config:** `.specpulse/config.yaml`
- **Coding Standards:** `.ai-shared/coding-standards.md`

---

## 🔗 External Services

### APIs
- **OpenAI API** - GPT models
- **Anthropic API** - Claude models
- **Google AI** - Gemini models
- **DeepSeek API** - Reasoning models

### Infrastructure
- **Hetzner VPS** - Production server
- **Cloudflare** - CDN & DDoS protection
- **TR Mobile Proxy** - For scraping

---

## 📊 Metrics & Monitoring

### What We Track
- API response times
- Database query performance
- Scraping success rates
- Embedding generation times
- Error rates per instance

### Tools (Planned)
- Prometheus & Grafana
- PM2 monitoring
- PostgreSQL pg_stat_statements
- Custom analytics dashboard

---

## 🤝 Team Collaboration

### Multi-AI Coordination
- **Planning** → Gemini
- **Implementation** → Claude Code
- **Complex Problems** → Zai
- **Code Review** → Claude Code
- **Documentation** → Gemini

### Communication
- All AIs share this context
- Update context when making significant changes
- Document decisions in feature specs

---

## 🆘 Troubleshooting

### Common Issues

**"Migration already exists"**
- Solution: Check `knex_migrations` table, rollback if needed

**"PM2 service not responding"**
- Solution: `pm2 restart {service}` or `pm2 logs {service}`

**"Redis connection failed"**
- Solution: Check Redis DB number, verify Redis running

**"Build failed on production"**
- Solution: Check node_modules, run `npm install --legacy-peer-deps`

---

## 📅 Version History

- **v1.0** (2025-12-10) - Initial shared context creation
- Multi-AI setup (Claude, Gemini, Zai)
- New documentation structure

---

*This document is the source of truth for all AI assistants. Keep it updated!*
