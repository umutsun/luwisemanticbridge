# RAG Pipeline Architecture - End-to-End Flow

> **Version:** v12.44 | **Date:** 2025-02-10 | **Status:** Production
> **Files:** `semantic_search_service.py`, `rerank_service.py`, `rag-chat.service.ts`, `citation-utils.ts`, `ZenMessage.tsx`

## Overview Diagram

```
User Query
  |
  v
[1. PYTHON] Query Analysis + Embedding + Vector Search + Scoring
  |
  v
[2. PYTHON] Jina Reranking (optional, semantic re-scoring)
  |
  v
[3. NODE.JS] Post-Processing (boost, filter, format, domain routing)
  |
  v
[4. NODE.JS] Evidence Gate + LLM Call
  |
  v
[5. NODE.JS] Citation Remap + Cleanup + Sanitizer
  |
  v
[6. NODE.JS] Citation Reorder by Usage (citation-utils.ts)
  |
  v
[7. FRONTEND] WebSocket -> Zustand -> ZenMessage + SourceCitation
```

**Total Pipeline:** ~3-6s (Embedding ~100ms + Search ~200ms + Jina ~300ms + LLM ~2-5s)

---

## Stage 1: Semantic Search (Python Service)

**File:** `python-services/services/semantic_search_service.py` (4124 lines)
**Endpoint:** `POST /api/python/semantic-search/search`

### 1.1 Query Analysis

```
User Query
  |
  +-> Article Detection (_detect_article_query)
  |     "VUK 114" -> { law_code: "VUK", article_number: 114, intent: "..." }
  |     Supports: VUK, GVK, KVK, KDVK, OTVK, MTV, DVK, VIVK, AATUHK, HK, BGK, TTK
  |
  +-> Rate Question Detection (_detect_rate_question) [v12.47]
  |     "KVK orani kactir?" -> { is_rate: true, law_code: "KVK" }
  |
  +-> Redis Cache Check (TTL: 10 min)
        cache key: "search:v2:{md5(query+limit)}"
```

### 1.2 Embedding Generation

```
Query Text
  |
  +-> Redis L2 Cache (TTL: 24h, key: "embedding:v2:{text_hash}")
  |     HIT -> return cached embedding
  |     MISS:
  |
  +-> Provider Selection
  |     OpenAI:  text-embedding-3-small (1536 dims)
  |     Gemini:  text-embedding-004 (768 dims -> scaled to 1536)
  |
  +-> Cache result + return
```

**Typical time:** 100-200ms (fresh) | <5ms (cached)

### 1.3 Multi-Source Vector Search

4 tables queried **sequentially** (optimization opportunity: parallelize):

| # | Source | Table | Limit | Priority |
|---|--------|-------|-------|----------|
| 1 | Database | `unified_embeddings` | max(50, limit*2) | 0.8 |
| 2 | Documents | `document_embeddings` | max(15, limit) | 0.5 |
| 3 | Web Scrapes | `scrape_embeddings` | limit/2 + 5 | 0.4 |
| 4 | Chat Messages | `message_embeddings` | limit/4 + 3 | 0.3 |

```sql
SELECT id, content, title, metadata, source_table,
       1 - (embedding <=> $1) AS similarity_score
FROM unified_embeddings
WHERE 1 - (embedding <=> $1) >= $2
ORDER BY embedding <=> $1
LIMIT $3
```

**Deduplication:** `seen_ids` set prevents cross-table duplicates.

### 1.4 Hybrid Search Augmentation

When `enable_hybrid_search = true`:

```
Keyword fallback via ILIKE:
  content match -> score 0.90
  table match   -> score 0.70
  other         -> score 0.50
```

### 1.5 Article & Rate Injection

```
If article detected + not in results:
  _inject_target_article() -> Force-include target article text

If rate question detected [v12.48]:
  _inject_rate_article() -> Force-include rate-defining article (e.g., KVK m.32)
```

### 1.6 Scoring Pipeline

Each result receives **8 scoring signals** (additive):

```
final_score = max(0,
    weighted_similarity        # similarity * source_priority * table_weight
  + keyword_boost              # n-gram matching (cap: 0.50)
  + metadata_boost             # metadata quality signal
  + article_boost              # +0.30 exact / -0.40 wrong article
  + direct_answer_boost        # +0.15 definitive / +0.08 mention [v12.47]
  + rate_article_boost         # schema-configured boost [v12.48]
  + retrieval_penalty          # temporal mismatch / TOC penalty (negative)
  + priority_boost             # +0.25 for weight >= 1.0 tables
)
```

**Keyword Boost Breakdown:**

| Match Type | Boost |
|-----------|-------|
| Exact phrase | +0.35 |
| 3-word trigram | +0.20 |
| 2-word bigram | +0.15 |
| 80%+ words | +0.20 |
| 60-80% words | +0.15 |
| Title exact phrase | +0.25 |
| Title 50%+ words | +0.15 |

---

## Stage 2: Jina Reranking (Python Service)

**File:** `python-services/services/rerank_service.py` (343 lines)
**API:** `https://api.jina.ai/v1/rerank`
**Model:** `jina-reranker-v2-base-multilingual`

### Flow

```
Scored Results (25 sources)
  |
  +-> Config check (ragSettings.rerankEnabled)
  |     OFF -> skip, use Stage 1 scores
  |
  +-> Redis cache (TTL: 1h, key: "rerank:jina:{md5(query+ids)}")
  |
  +-> Jina API Call
  |     - Documents truncated to 4000 chars each
  |     - Timeout: 10 seconds
  |     - Returns: [{ index, relevance_score (0-1) }, ...]
  |
  +-> Score Integration:
  |     rerank_score = jina_score * 100
  |     priority_weighted = rerank_score * source_priority * table_weight
  |     final_score = priority_weighted + rate_boost + direct_answer_boost
  |
  +-> Re-sort by final_score (descending)
  |
  +-> Graceful fallback: if API fails, keep original order
```

**Typical time:** 200-400ms

---

## Stage 3: Node.js Post-Processing

**File:** `backend/src/services/rag-chat.service.ts` (12900+ lines)

### 3.1 Pre-Retrieval Guards

```
Query
  |
  +-> Follow-up Detection (detectFollowUp + detectFollowUpQuestion)
  |     Topic change detection (v12.41)
  |     Law code context carry-over
  |     Max depth control (v12.33)
  |
  +-> Query Sanitization (sanitizeSearchQuery)
  |     Remove numbering, meta-instructions
  |
  +-> Query Rewriting (rewriteQuery)
  |     Short query expansion with domain synsets
  |
  +-> Early Exit Guards:
        NEEDS_CLARIFICATION -> ambiguous queries ("ne?", just numbers)
        OUT_OF_SCOPE -> non-tax queries (weather, sports, etc.)
```

### 3.2 Search Result Enhancement

```
Python Search Results
  |
  +-> Keyword Boost (Node.js layer)
  |     Title match: +15%
  |     Content match: +3%
  |     Ozelge boost: +10%
  |
  +-> Follow-up Law Code Filter [v12.39]
  |     "KDVK hakkinda daha fazla bilgi" -> filter non-KDVK sources
  |
  +-> Domain Routing [v12.44 - P0]
  |     detectQueryDomain() -> filterSourcesByDomain()
  |     "Veraset vergisi..." -> exclude KDV/GVK sources
  |
  +-> Intent-Based Article Boost
  |     beyanname -> madde 41 boost (+25%)
  |     odeme     -> madde 46 boost (+25%)
  |
  +-> Wrong Article Prevention
  |     Same law, different article -> -30% penalty
  |
  +-> Source Type Priority Sort
        ozelge > kanun > teblig > sorucevap > danistay > makale > document
```

### 3.3 Source Formatting (formatSources)

```
Raw search results
  |
  STEP 1: Metadata extraction, OCR detection, smart snippet
  STEP 2: Batch LLM summarization (optional, configurable)
  STEP 3: LLM OCR normalization (excerpt + title + baslik)
  STEP 4: Final formatted results with category badges
```

### 3.4 Hierarchy Scoring & Filtering

```
Formatted Sources
  |
  +-> Combined Score = (hierarchyWeight/100 * 0.7) + (similarityScore * 0.3)
  |     70% authority weight + 30% semantic similarity
  |
  +-> Cross-Law Downranking (specific law query -> penalize other laws)
  |
  +-> Quality Threshold Filter (default: 0.15 similarity)
  |     Above threshold: keep all
  |     No quality sources: top 3 fallback
  |
  +-> Source Diversification [v12.42]
  |     Tier 1 (High): similarity >= 0.40
  |     Tier 2 (Medium): 0.25 - 0.40
  |     Tier 3 (Lower): 0.15 - 0.25
  |     Tier 4 (Marginal): < 0.15
  |     Round-robin by source type within each tier
  |
  +-> Murat Hierarchy (deadline queries -> law article to Top-1)
  |
  +-> limitedSources = rankedSources (final display set)
```

---

## Stage 4: Evidence Gate + LLM Call

### 4.1 Evidence Gate

```
limitedSources
  |
  +-> Quality check:
  |     bestScore >= evidenceGateMinScore (default: 0.15)
  |     qualityChunks >= evidenceGateMinChunks (default: 2)
  |
  +-> PASS -> proceed to LLM
  |   FAIL -> return refusal response (no LLM call)
```

### 4.2 LLM Call

```
System Prompt (from chatbot_settings)
  + Context (formatted sources as [1] Author - Title)
  + Strict Mode Instruction (configurable level: low/medium/high)
  + User Question
  |
  +-> Active Model (from settings, e.g., claude-sonnet-4-5)
  |
  +-> Response: "...VUK 114'e gore [1] zamanasimi suresi... [2] ..."
```

**Special cases:**
- Deadline queries may use hardcoded responses (bypass LLM)
- PDF mode uses separate `processPdfMessage()` flow
- Strict mode levels affect prompt strictness

---

## Stage 5: Post-LLM Processing

**Order is critical - each step depends on previous output.**

```
LLM Response
  |
  +-> Citation Remap (originalIndex -> newPosition)
  |     [5]->[1], [2]->[2], [7]->[3] based on source resorting
  |     Deadline hardcoded: special handling (v12.38)
  |
  +-> fixMarkdownAndCitations()
  |     Remove hallucinated citations [N > sourceCount]
  |     Fix numbered lists, bold markers
  |
  +-> autoFixDateCitations() [v12]
  |     Add citations to date claims missing them
  |
  +-> sanitizeProsedurClaims()
  |     Remove unsupported modal/normative claims
  |     Schema-configured patterns (forbiddenPatterns)
  |     Grounding check against cited sources
  |
  +-> Escape Pattern Detection [v12.44 - P1]
  |     "acik duzenleme yok" + "yapilmalidir" -> add uncertainty warning
  |
  +-> Citation Validation [v12.44 - P2]
  |     [N] > sourceCount -> replace with [1]
  |
  +-> Summary Citation Enforcement [v12.44 - P3]
  |     Summary section without citation -> add [1]
  |
  +-> Refusal Detection
        "bulunamadi" pattern -> clear sources, clean response
```

---

## Stage 6: Citation Reorder by Usage

**File:** `backend/src/utils/citation-utils.ts`
**Called from:** `backend/src/routes/chat.routes.ts`

This runs **AFTER** RAG service returns, in the route handler.

```
Final Response + Sources
  |
  +-> countCitationUsage()
  |     [1] -> 3 times, [2] -> 1 time, [5] -> 2 times
  |
  +-> Sort by 5-signal priority:
  |     1. citation_usage    (descending) - Most cited first
  |     2. rerank_score      (descending) - Jina semantic score
  |     3. table_weight      (descending) - Kanun > Teblig > Ozelge
  |     4. similarity_score  (descending) - Vector similarity
  |     5. original_order    (ascending)  - Stable sort tiebreaker
  |
  +-> Remove unused sources (removeUnused=true, default)
  |     Safety net: if ALL would be removed, keep all
  |
  +-> Citation Remap with placeholder strategy:
  |     Phase 1: [5] -> __CITE_1__  (avoid collision)
  |     Phase 2: __CITE_1__ -> [1]  (final replacement)
  |
  +-> Return reordered response + sources
```

---

## Stage 7: Frontend Rendering

**Files:** `ZenMessage.tsx`, `use-chat-stream.ts`, `chat-store.ts`

### 7.1 Data Arrival

```
Backend Response
  |
  +-> WebSocket Events:
  |     'status'   -> message.status = 'searching' | 'generating'
  |     'sources'  -> message.sources = [...]
  |     'complete' -> message.content = "...", final sources, articleQuery
  |     'error'    -> error handling
  |
  +-> Zustand Store:
        addMessage() -> new message entry
        updateMessage() -> patch content, sources, status
```

### 7.2 Content Processing

```
Raw LLM Content
  |
  +-> cleanLLMResponse()
  |     Remove: KONU:, ANAHTAR_TERIMLER:, DAYANAKLAR:, Dipnotlar
  |     Remove: Standalone reference lists [1] [2] at end
  |
  +-> preprocessMarkdown()
  |     Fix: Single newlines -> paragraph breaks (before uppercase)
  |     Fix: Inline numbered lists -> proper line breaks
  |     Fix: Orphaned numbered items
  |     Add: Breaks before section headers
  |
  +-> extractKeywords() (from user query)
        Top 8 keywords (min 3 chars, exclude stopwords)
```

### 7.3 Rendering

```
Processed Markdown
  |
  +-> SchemaRenderer (if responseSchemaId)
  |     Structured sections: KONU, DEGERLENDIRME, etc.
  |
  +-> ReactMarkdown (default)
        Custom paragraph renderer:
        |
        +-> Citation extraction: [1], [Kaynak 1], [Source 1]
        |     -> Clickable <sup> with scrollIntoView()
        |     -> Target: id="citation-{messageId}-{citationNum}"
        |
        +-> Keyword highlighting
              -> Colored spans (yellow, green, pink, blue)
              -> Turkish word boundaries
```

### 7.4 Source Display

```
Sources Array (already reordered by backend)
  |
  +-> getSourceTypeInfo(sourceTable, metadata)
  |     -> Badge + Color (Kanun=purple, Teblig=blue, Ozelge=pink, etc.)
  |
  +-> cleanCitationTitle()
  |     "T.C.D A N I S T A Y" -> "T.C. DANISTAY"
  |     "DAIREEsas" -> "DAIRE Esas"
  |
  +-> Smart metadata extraction (karar no, daire, tarih)
  |
  +-> Show first {minSourcesToShow} sources
  |   "X kaynak daha goster" button for rest
  |
  +-> Each source has anchor: id="citation-{messageId}-{index+1}"
        Matches clickable [N] in content
```

---

## Configuration Sources

| Config | Location | Cache TTL |
|--------|----------|-----------|
| RAG Settings | `settings` table (DB) | 5s (Python), per-request (Node) |
| Law Code Config | `user_schema_settings.llm_config` (DB) | 60s |
| System Prompt | `chatbot_settings` or `settings.chatbot` (DB) | per-request |
| Embedding Config | DB or env vars | per-request |
| Rerank Config | `settings` table (DB) | 60s |
| Source Table Weights | `settings` table (DB) | 5s |
| Sanitizer Patterns | `data-schemas.json` via schema | per-request |

---

## Key Scoring Formulas

### Python Layer
```
weighted_similarity = similarity * source_priority * table_weight + priority_boost
final_score = weighted_similarity + keyword_boost + metadata_boost + article_boost
              + direct_answer_boost + rate_article_boost + retrieval_penalty
```

### Jina Layer
```
rerank_final = (jina_score * 100) * source_priority * table_weight
               + rate_boost + direct_answer_boost
```

### Node.js Layer
```
combinedScore = (hierarchyWeight/100 * 0.7) + (similarityScore * 0.3)
```

### Route Layer (Citation Reorder)
```
sort_key = (citation_usage DESC, rerank_score DESC,
            table_weight DESC, similarity_score DESC, original_order ASC)
```

---

## Performance Benchmarks

| Stage | Component | Typical Time |
|-------|-----------|-------------|
| 1 | Embedding generation | 100-200ms (fresh), <5ms (cached) |
| 1 | Vector search (4 tables) | 200-400ms |
| 1 | Scoring pipeline | 100-300ms |
| 2 | Jina reranking | 200-400ms |
| 3 | Node.js post-processing | 50-100ms |
| 3 | formatSources (with LLM) | 500-2000ms |
| 4 | LLM call | 2000-5000ms |
| 5 | Post-LLM processing | 20-50ms |
| 6 | Citation reorder | <10ms |
| 7 | Frontend render | <100ms |
| **Total** | **End-to-end** | **3-6 seconds** |

---

## Known Issues & Improvement Opportunities

### Double Processing
- **Keyword boost** calculated in both Python AND Node.js
- **Citation remap** applied twice (RAG service + Routes)

### Performance
- Multi-source vector search is **sequential** (could be parallelized with asyncio.gather)
- Evidence Gate runs **after** formatSources (could run before to save LLM summary cost)

### Architecture
- `rag-chat.service.ts` is 12,900+ lines monolith
- Domain routing in Node.js should move to Python (SQL WHERE clause more efficient)
- 12+ scoring signals may cause unpredictable interactions
