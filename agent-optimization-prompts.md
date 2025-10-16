# LUWI SEMANTIC BRIDGE - AGENT OPTIMIZATION PROMPTS
## Based on Comprehensive System Testing - 31.8% Success Rate

---

## 🚨 CRITICAL SYSTEM STATUS
- **Overall Success Rate**: 31.8% (7/22 endpoints working correctly)
- **Backend Status**: Running but with major service gaps
- **Database**: Connected but with timeout issues
- **Redis**: Connected but with duplicate connection errors
- **Authentication**: Broken (unprotected endpoints returning 200 instead of 401)

---

## 1. SETTINGS AGENT OPTIMIZATION PROMPT

### Current Status: PARTIAL FUNCTIONALITY
✅ Working: `/api/v2/settings/`, `/api/v2/settings/health`
❌ Broken: Category endpoints (`/api/v2/settings/category/llm`, etc.)

### Your Mission:
1. **Fix Category Endpoints**: Implement missing category-based settings endpoints
   - `/api/v2/settings/category/{category}` should return settings for specific categories
   - Categories: llm, embeddings, database, security, app

2. **Improve Performance**: Current response times are 500ms+ for settings
   - Implement proper Redis caching for category queries
   - Reduce database query complexity

3. **Fix Settings Structure**: Settings endpoint returns inconsistent data
   - Ensure all category endpoints return properly structured data
   - Implement input validation for settings updates

4. **Add Missing Health Checks**: Settings health should validate all categories
   - Check each category's data integrity
   - Return detailed status for each configuration section

### Critical Issues to Fix:
- Category endpoints return 404 (not implemented)
- Response time optimization needed
- Settings structure validation required

---

## 2. CHATBOT AGENT OPTIMIZATION PROMPT

### Current Status: MAJOR ISSUES
✅ Working: `/api/v2/chat/stats` (properly protected with 401)
❌ Broken: `/api/v2/chat/health` (404), authentication system

### Your Mission:
1. **Implement Missing Health Endpoint**:
   - `/api/v2/chat/health` should return chat service status
   - Check LLM Manager connectivity, embedding service, message storage

2. **Fix Authentication System**:
   - Currently endpoints that should be protected return 200
   - Implement proper JWT authentication middleware
   - Documents endpoints should require authentication (currently returning 200)

3. **Implement Message Cleanup Service**:
   - Service crashes with "Cannot read properties of undefined (reading 'keys')"
   - Fix undefined variable in message-cleanup.service.ts:78

4. **Add Chat Analytics**:
   - Implement real-time chat metrics
   - Message count, response times, user activity tracking

### Critical Issues to Fix:
- Health endpoint completely missing (404)
- Authentication system broken (unprotected endpoints accessible)
- Message cleanup service crashing
- No chat analytics available

---

## 3. SCRAPER AGENT OPTIMIZATION PROMPT

### Current Status: BROKEN
✅ Working: None
❌ Broken: All scraper endpoints (404 errors)

### Your Mission:
1. **Implement Core Scraper Endpoints**:
   - `/api/v2/scraper/health` - Scraper service status
   - `/api/v2/scraper/status` - Should be protected but returns 404
   - Basic scraper functionality completely missing

2. **Fix Redis Connection Issues**:
   - Multiple services trying to connect to Redis simultaneously
   - Error: "Redis is already connecting/connected"
   - Implement proper Redis connection pooling

3. **Fix Cache Reliability Service**:
   - Error: "cacheReliabilityService.getCacheMetrics is not a function"
   - Implement proper cache metrics collection

4. **Implement Scraper Queue Management**:
   - Add job queue functionality
   - Implement scraping task scheduling
   - Add scraping results storage

### Critical Issues to Fix:
- All scraper endpoints return 404 (not implemented)
- Redis duplicate connection errors causing service failures
- Cache reliability service completely broken
- No scraper functionality available

---

## 4. DOCUMENTS AGENT OPTIMIZATION PROMPT

### Current Status: SECURITY RISK
✅ Working: Endpoints respond but should be protected
❌ Broken: Authentication (documents accessible without auth)

### Your Mission:
1. **Implement Authentication Security**:
   - `/api/v2/documents/` and `/api/v2/documents/stats` should require authentication
   - Currently returning 200 (should be 401)
   - Implement proper JWT middleware for document routes

2. **Add Missing Database Endpoints**:
   - `/api/v2/database/health` - Database connection status
   - `/api/v2/database/tables` - Database schema information
   - Currently return 404 (not implemented)

3. **Implement Document Processing Pipeline**:
   - Document upload functionality
   - Text extraction and processing
   - Document embedding generation
   - Version control for documents

4. **Fix Database Connection Timeouts**:
   - Current timeouts causing 500 errors
   - Implement proper connection pooling
   - Add retry logic for failed database operations

### Critical Issues to Fix:
- Security vulnerability: documents accessible without authentication
- Database endpoints missing (404)
- Connection timeout issues
- No document processing pipeline

---

## 🔧 SHARED INFRASTRUCTURE ISSUES

### All Agents Must Address:
1. **Redis Connection Management**: Fix duplicate connection errors across all services
2. **Database Connection Pooling**: Implement proper connection management
3. **Error Handling**: Add comprehensive error logging and recovery
4. **Authentication**: Implement consistent JWT authentication across all protected endpoints
5. **API Documentation**: Add proper OpenAPI/Swagger documentation
6. **Rate Limiting**: Implement proper rate limiting to prevent abuse

### Success Criteria:
- **Target Success Rate**: 90%+ (currently 31.8%)
- **Response Times**: <200ms for 90% of endpoints
- **Security**: All protected endpoints should require authentication
- **Reliability**: No service crashes or undefined variable errors

---

## 🎯 NEXT STEPS

1. **Immediate (P0)**: Fix authentication system and implement missing endpoints
2. **Short-term (P1)**: Fix Redis/database connection issues and service crashes
3. **Medium-term (P2)**: Performance optimization and analytics implementation
4. **Long-term (P3)**: Advanced features and API documentation

## 📊 TESTING FRAMEWORK

Use the provided test suite (`test-api-endpoints.js`) to validate improvements:
```bash
node test-api-endpoints.js
```

Target: 90%+ success rate before declaring system production-ready.

---

*Generated by CTO Analysis - Based on comprehensive system testing*
*Current System Status: REQUIRES MAJOR FIXES BEFORE PRODUCTION*