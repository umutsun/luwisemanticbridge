# Next Session Prompt

Copy and paste this at the start of your new Claude Code session:

---

## Context

LSEMB is a RAG (Retrieval-Augmented Generation) platform with 3 deployments:
- **Bookie** (Yeditepe University) - bookie.yeditepeuniversity.com
- **emlakai** (Real Estate AI) - emlakai.com
- **vergilex** (Tax Law AI) - vergilex.com

Server: 91.99.229.96

## Recent Work (28 Nov 2024)

All deployments now use:
- **OpenAI text-embedding-3-small (1536 dim)** - standardized
- **Performance fix applied** - search now 1-5s instead of 30-90s
- **Dimension display** added to migrations page

See `/docs/SYSTEM_STATUS_2024_11_28.md` for full details.

## Pending Tasks

### 1. Suggestion Question Quality (Priority: High)
**Problem:** Generated suggestion questions are sometimes meaningless.
Example: "100 TL içinde yapılması gereken işlemler nelerdir?"

**Location:** `backend/src/services/rag-chat.service.ts`
- Function: `generateDynamicQuestion()` at line 934
- Function: `generateBatchContentAndQuestions()` at line 988

**Fix needed:**
- Questions should be complete, meaningful sentences
- Questions should relate to actual content
- Different templates for different content types (bookie=university, vergilex=tax, emlakai=real estate)

### 2. Pre-computed Summaries (Priority: Low)
**Enhancement:** Instead of using raw excerpt, store LLM-generated summaries.

**Schema already added:**
```sql
ALTER TABLE unified_embeddings ADD COLUMN summary TEXT;
ALTER TABLE unified_embeddings ADD COLUMN processed_at TIMESTAMP;
```

**Script ready:** `/tmp/generate_summaries.py` (needs to be recreated)

**Approach:**
1. Background job to generate summaries for all records
2. Use summary in search results instead of raw excerpt
3. Improves quality without runtime LLM calls

### 3. Additional Improvements to Consider
- Response streaming for perceived faster responses
- Smart caching of frequent queries in Redis
- A/B testing different LLM providers for quality

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/rag-chat.service.ts` | Chat flow, suggestions |
| `backend/src/services/semantic-search.service.ts` | Vector search |
| `backend/src/services/llm-manager.service.ts` | Multi-LLM orchestration |
| `backend/src/routes/embeddings-v2.routes.ts` | Embedding endpoints |
| `frontend/src/components/TemplateChatInterface.tsx` | Chat UI |

## Useful Commands

```bash
# Deploy all backends
ssh root@91.99.229.96 "cd /var/www/emlakai && git pull && pm2 restart emlakai-backend && cd /var/www/bookie && git pull && pm2 restart bookie-backend && cd /var/www/vergilex && git pull && pm2 restart vergilex-backend"

# Check embedding dimensions
ssh root@91.99.229.96 'cd /var/www/bookie/backend && source .env && psql "$DATABASE_URL" -c "SELECT vector_dims(embedding) as dim, COUNT(*) FROM unified_embeddings WHERE embedding IS NOT NULL GROUP BY 1;"'

# View logs
ssh root@91.99.229.96 "pm2 logs bookie-backend --lines 50 --nostream"
```

## User Context

- User is preparing for presentations (bookie, emlakai)
- ChatInterface is the "vitrin" (showcase) - must work perfectly
- Performance and response quality are critical
- Turkish language content primarily

---

Start by reading `/docs/SYSTEM_STATUS_2024_11_28.md` and `/docs/TECHNICAL_SPECS.md` for full context.
