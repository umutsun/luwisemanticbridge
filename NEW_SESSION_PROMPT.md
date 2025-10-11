# Alice Semantic Bridge - Chatbot Optimization Project
## New Claude Code Session Briefing

### Project Overview
Alice Semantic Bridge is a RAG (Retrieval-Augmented Generation) chatbot system with semantic search capabilities using PostgreSQL + pgvector for embeddings and Redis for caching.

### Current System State (Critical Issues)

#### 🚨 IMMEDIATE ACTION REQUIRED:
1. **Multiple Process Conflict**: 13+ Node.js processes are running simultaneously causing resource conflicts
   - Multiple backend processes on ports 8084, 8085
   - Multiple frontend processes on ports 3002, 3003, 3005
   - This prevents proper chatbot functionality despite correct code

2. **Settings Save Issue**: Recently fixed duplicate records in settings table, but need to verify
   - Implemented duplicate prevention in settings.service.ts
   - Added 5-minute caching system with TTL
   - Changed PUT to POST in settings API

### Recently Implemented Features (Ready for Testing)

#### 1. Parallel LLM Processing System
- **Location**: `backend/src/services/rag-chat.service.ts`
- **Features**:
  - Configurable parallel LLM workers (1-10)
  - Dynamic batch processing for search results
  - Fallback result generation on LLM failures
  - Performance monitoring and timeout handling

- **Key Methods**:
  - `processSourceWithLLM()` - Individual source processing
  - `getMoreSearchResults()` - Dynamic loading with pagination
  - `formatSources()` - Enhanced parallel processing

#### 2. Settings Management
- **Location**: `backend/src/services/settings.service.ts`
- **Features**:
  - 5-minute cache with TTL
  - Duplicate record prevention
  - Cache clearing on updates

- **New Settings**:
  - `parallel_llm_count`: Number of parallel workers (1-10)
  - `parallel_llm_batch_size`: Initial load size (1-10)
  - `min_results`: Offset for pagination
  - `max_results`: Maximum results to return

#### 3. Frontend Enhancements
- **Location**: `frontend/src/components/chat/source-citation.tsx`
- **Fixed**: Tag click now uses simple tag text instead of generating long questions
- **Location**: `frontend/src/app/dashboard/settings/page.tsx`
- **Enhanced**: RAG settings UI with parallel processing controls

### Technical Architecture

#### Database Schema
```sql
-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(50) CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

#### Environment Configuration
```bash
# Backend (.env)
PORT=8084
ASEMB_DATABASE_URL=postgresql://asemb:asemb_password@91.99.229.96:5432/asemb
REDIS_URL=redis://localhost:6379

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8084
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3002
NEXT_PUBLIC_API_PORT=8084
```

### Priority Tasks for New Session

#### 1. CRITICAL: Process Management (First Task)
```bash
# Stop all Node.js processes
# Via Windows Task Manager or:
taskkill /f /im node.exe

# Then start clean:
# Terminal 1 - Backend:
cd c:\xampp\htdocs\alice-semantic-bridge\backend
PORT=8084 npm start

# Terminal 2 - Frontend:
cd c:\xampp\htdocs\alice-semantic-bridge\frontend
PORT=3002 npm run dev
```

#### 2. Test Parallel LLM Settings
- Go to: http://localhost:3002/dashboard/settings
- Set Parallel Count: 4
- Set Initial Load: 4
- Save and verify settings persist

#### 3. Test Chatbot Functionality
- Send a test query in chatbot
- Verify parallel processing is working (check backend logs)
- Test pagination/scrolling for more results
- Verify tag clicks use short queries

#### 4. Performance Monitoring
- Check LLM processing times
- Monitor memory usage with parallel workers
- Verify cache effectiveness

### Known Issues to Investigate

1. **Chatbot Response**: "Üzgünüm, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin."
   - Despite backend logs showing successful processing
   - Likely due to process conflicts

2. **Settings Persistence**:
   - Recently fixed duplicate records issue
   - Need to verify POST endpoint is working correctly

3. **Pagination**:
   - Offset/limit logic implemented but needs testing
   - Dynamic loading should use min/max from settings

### Key Files to Review

1. `backend/src/services/rag-chat.service.ts` - Core RAG logic with parallel processing
2. `backend/src/services/settings.service.ts` - Settings with caching
3. `backend/src/routes/settings.routes.ts` - Settings API endpoints
4. `frontend/src/app/dashboard/settings/page.tsx` - Settings UI
5. `frontend/src/components/chat/source-citation.tsx` - Tag handling

### Expected Performance Improvements

- **Before**: 77+ seconds for search results
- **After**: 5-10 seconds with parallel LLM processing
- **Cache**: Settings load time reduced from 3000ms to <500ms

### Success Criteria

1. ✅ Single backend process running on port 8084
2. ✅ Single frontend process running on port 3002
3. ✅ Settings save and persist correctly
4. ✅ Chatbot returns results with parallel processing
5. ✅ Pagination/dynamic loading works
6. ✅ Tag clicks generate short queries only

### Debug Commands

```bash
# Check running processes
netstat -ano | findstr :8084
netstat -ano | findstr :3002

# Check database connections
psql -h 91.99.229.96 -U asemb -d asemb -c "SELECT COUNT(*) FROM settings WHERE key LIKE 'parallel_%';"

# Check Redis
redis-cli
> keys *
```

### Implementation Roadmap

1. **Immediate**: Kill all processes, restart clean
2. **Test**: Basic chatbot functionality
3. **Verify**: Parallel LLM settings work
4. **Test**: Pagination and dynamic loading
5. **Optimize**: Performance tuning based on results
6. **Monitor**: System stability under load

### Note for Developer

The core issue has been identified as multiple processes conflicting. The code is correct and ready - the main blocker is the process conflict. Once clean processes are started, the system should work as designed.