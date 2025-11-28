# LSEMB System Status - 28 November 2024

## Deployment Overview

| Deployment | URL | Database | Status |
|------------|-----|----------|--------|
| **Bookie** | bookie.yeditepeuniversity.com | bookie_lsemb | Production Ready |
| **emlakai** | emlakai.com | emlak_lsemb | Production Ready |
| **vergilex** | vergilex.com | lsemb | Production Ready |

## Embedding Status

All deployments standardized to **OpenAI text-embedding-3-small (1536 dimensions)**:

| Deployment | Records | Dimension | Provider | Last Updated |
|------------|---------|-----------|----------|--------------|
| Bookie | 5,575 | 1536 | OpenAI | 2024-11-28 |
| emlakai | 2,153 | 1536 | OpenAI | 2024-11-28 |
| vergilex | 19,054 | 1536 | OpenAI | 2024-11-28 |

**Total Vectors:** 26,782

## Recent Fixes (This Session)

### 1. Performance Optimization
- **Problem:** Search taking 30-90 seconds
- **Root Cause:** 25+ LLM calls per search for source summaries
- **Solution:** Removed per-source LLM summary generation
- **Result:** Search now 1-5 seconds
- **File:** `backend/src/services/semantic-search.service.ts:1139-1147`

### 2. Vector Dimension Mismatch
- **Problem:** `different vector dimensions 768 and 1536` error
- **Root Cause:** Database had Gemini embeddings (768 dim), search used OpenAI (1536 dim)
- **Solution:** Re-embedded all data with OpenAI text-embedding-3-small
- **Affected:** All 3 deployments

### 3. LLM Fallback Bug
- **Problem:** Claude fallback using wrong model name (gemini model instead of claude)
- **Solution:** Fixed in `backend/src/services/llm-manager.service.ts`
- **Commit:** `606b1ff`

### 4. Pool Variable Error
- **Problem:** `ReferenceError: pool is not defined` in settings routes
- **Solution:** Changed `pool` to `lsembPool` in `backend/src/routes/settings.routes.ts`
- **Commit:** `90ba028`

### 5. Suggestion Card Count
- **Problem:** Only 3 suggestions instead of 4
- **Solution:** Increased sample size from 20 to 50, added TARGET_QUESTIONS = 8
- **File:** `backend/src/services/rag-chat.service.ts`

### 6. Data Cleanup (Bookie)
- **Problem:** Junk content like "Paylaş :" in embeddings
- **Solution:** SQL cleanup, removed 19 invalid records
- **Result:** 5,575 clean records

### 7. Dimension Display in Migrations
- **Feature:** Shows embedding dimensions in Settings → Embeddings Management
- **Files:**
  - `backend/src/routes/embeddings-v2.routes.ts` (stats endpoint)
  - `frontend/src/app/dashboard/settings/embeddings-management.tsx`

## Known Issues / Pending Tasks

### 1. Suggestion Question Quality
- **Issue:** Generated questions sometimes meaningless (e.g., "100 TL içinde yapılması gereken işlemler nelerdir?")
- **Location:** `backend/src/services/rag-chat.service.ts:generateDynamicQuestion()`
- **Priority:** Medium

### 2. Pre-computed Summaries
- **Enhancement:** Store LLM-generated summaries in database
- **Benefit:** Better quality excerpts without runtime LLM calls
- **Schema:** `unified_embeddings.summary` column already added
- **Priority:** Low (current excerpt-based approach works)

## API Keys Status

| Provider | Bookie | emlakai | vergilex |
|----------|--------|---------|----------|
| OpenAI | Active | null (uses shared) | Active |
| Gemini | Active (rate limited) | Active | Active |
| Claude | Active | null | - |

## Server Details

- **IP:** 91.99.229.96
- **PM2 Processes:** 10 (3 backends, 3 frontends, 3 python, 1 luwi-dev)
- **PostgreSQL:** Running locally on port 5432
- **Redis:** Running on port 6379

## File Structure

```
/var/www/
├── bookie/          # Yeditepe University
│   ├── backend/     # Port 8085
│   └── frontend/    # Port 3004
├── emlakai/         # Real Estate AI
│   ├── backend/     # Port 8080
│   └── frontend/    # Port 3001
└── vergilex/        # Tax Law AI
    ├── backend/     # Port 8080
    └── frontend/    # Port 3000
```

## Git Commits (This Session)

1. `606b1ff` - fix(llm): Fix fallback provider using wrong model name
2. `b6ca13a` - cleanup: Remove debug logging from chatbot settings
3. `7b596a7` - fix(suggestions): Increase sample size from 20 to 50
4. `90ba028` - fix(settings): Use lsembPool instead of undefined pool variable
5. `54c2dcd` - perf: Remove per-source LLM summary calls for 10x faster search
6. `66778c0` - feat: Show embedding dimensions in migrations page
