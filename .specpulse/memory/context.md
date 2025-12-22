# Project Context

## Project: lsemb (LUWI Software Engineering Multi-Backend)
- **Created**: 2025-11-09
- **SpecPulse Version**: 2.6.0
- **Last Updated**: 2025-12-22

## Production Instances
- **GeoLex** (geolex.luwi.dev) - Real estate AI platform
- **Vergilex** (vergilex.luwi.dev) - Tax/legal document platform
- **Bookie** (bookie.luwi.dev) - Bookkeeping platform

---

## Active Feature: None (Maintenance Mode)

Currently in maintenance/enhancement mode - no major feature development active.

---

## Recent Activity (December 2025)

### 2025-12-22 - Documents Page & Embedding Improvements
- **Filter Logic Fix**: "Analiz Edildi" now shows only analyzed docs NOT yet embedded
- **Gemini Embedding Update**: Switched to `gemini-embedding-001` model (stable)
  - Supports 1536 dimensions via `outputDimensionality` parameter
  - Replaced deprecated `gemini-embedding-exp-03-07`
- **Table Layout**: Fixed padding alignment between left/right tables
- **Height Adjustment**: Increased right table height from 500px to 650px

### 2025-12-21 - Settings API & Document Display
- Added Voyage AI and Cohere embedding providers to Settings
- Fixed document file_type/file_size display (was showing 0 KB, TEXT)
- Added provider type badges (LLM, Embedding, Translation)
- Cleaned up embedding model list (1024+ dimensions only)

### 2025-12-19 - OCR & Migration System
- Implemented document migration with progress tracking
- Fixed Redis DB allocation for embedding workers
- Added SSE → polling fallback for migration progress

---

## Tracked Features

### 001-schema-data-prompt-redesign
- **Status**: Paused
- **Started**: 2025-12-12
- **Files**: Directory created, no spec/plan/task files
- **Notes**: Initial planning phase, paused for other priorities

### 002-backend-admin-console
- **Status**: Draft
- **Started**: 2025-12-13
- **Files**:
  - `specs/002-backend-admin-console/spec-001.md` (Complete specification)
- **Description**: Web-based server management console
  - PM2 service management
  - System monitoring (CPU, RAM, Disk)
  - Log streaming
  - Web terminal
  - Alert system
- **Notes**: Specification complete, awaiting implementation

---

## Tech Stack Summary

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 + React + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Python Services | FastAPI (OCR, RAG, Crawlers) |
| Database | PostgreSQL 15 + pgvector |
| Cache | Redis |
| Process Manager | PM2 |
| Server | Hetzner VPS (91.99.229.96) |

---

## Key Configuration

### Embedding Models (Current)
- **OpenAI**: text-embedding-3-small (1536 dims)
- **Google**: gemini-embedding-001 (1536 dims with outputDimensionality)
- **Voyage**: voyage-3 (1024 dims)
- **Cohere**: embed-multilingual-v3.0 (1024 dims)

### Database Schema
- System DB: `{instance}_lsemb` (users, settings, embeddings, etc.)
- Source DB: `{instance}_db` (csv_* data tables only)

---

*This file is automatically maintained by SpecPulse*
