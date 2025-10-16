# Alice Semantic Bridge - Test Suite

🏗️ **CTO-Approved Comprehensive Testing Framework**

This test suite provides complete coverage for all 4 systems (Settings, Chatbot, Scraper, Documents) with integration testing, performance benchmarks, and security validation.

## 📋 Test Categories

### 1. **Comprehensive Tests** (`comprehensive-tests.js`)
- ✅ Settings system functionality and caching
- ✅ Chatbot authentication and RAG pipeline
- ✅ Scraper performance and Redis integration
- ✅ Documents security and translation features
- ✅ Security validation (SQL injection, XSS, rate limiting)
- ✅ Performance benchmarks and metrics

### 2. **Integration Tests** (`integration-tests.js`)
- 🔗 Settings ↔ Chatbot integration
- 🕷️ Scraper → Document processing flow
- 🌐 Translation ↔ Document pipeline
- ⚡ Real-time updates across systems
- 💥 Error propagation handling
- 💾 Database transaction consistency
- 🗄️ Cache invalidation strategies
- 🚀 Concurrent operations support

### 3. **Load Tests** (`load-tests.js`) *[Optional]*
- Concurrent user simulations
- API stress testing
- Database connection pooling
- Redis memory pressure testing

### 4. **Security Tests** (`security-tests.js`) *[Optional]*
- OWASP Top 10 validation
- Authentication bypass attempts
- Data leakage detection
- Input fuzzing

## 🚀 Quick Start

### Install Dependencies
```bash
cd test-suite
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
# Comprehensive system tests
npm run test:comprehensive

# Integration tests only
npm run test:integration

# With custom options
node run-tests.js --suite comprehensive-tests.js
```

### Continuous Integration Mode
```bash
npm run test:ci
```

## 📊 Test Results

Test results are saved to:
- JSON: `test-suite/reports/test-report-<timestamp>.json`
- Latest: `test-suite/reports/latest.json`

### Report Structure
```json
{
  "timestamp": "2025-01-16T...",
  "summary": {
    "total": 45,
    "passed": 42,
    "failed": 3,
    "successRate": "93.3%"
  },
  "suites": {
    "Comprehensive Tests": { ... },
    "Integration Tests": { ... }
  }
}
```

## 🎯 System Requirements

### Required Services
- ✅ Backend Server (Port 8083)
- ✅ Frontend Server (Port 3002)
- ✅ PostgreSQL Database (Port 5432)
- ⚠️ Redis (Port 6379) - Optional but recommended

### Node.js Dependencies
- `axios` - HTTP client
- `ws` - WebSocket client
- `pg` - PostgreSQL client
- `redis` - Redis client
- `perf_hooks` - Performance measurement

## 📈 Test Coverage

### Settings System (15 tests)
- Category filtering
- Cache performance
- Real-time updates
- Input validation
- API security

### Chatbot System (12 tests)
- Authentication flow
- Message embeddings
- RAG search
- WebSocket connections
- Analytics dashboard

### Scraper System (10 tests)
- Basic scraping
- Enhanced scraping with LLM
- Redis caching
- Concurrent operations
- Rate limiting

### Documents System (10 tests)
- Translation pipeline
- Security validation
- Document processing
- Preview generation
- Batch operations

### Security (8 tests)
- SQL injection prevention
- XSS protection
- CORS configuration
- Rate limiting
- Security headers

### Performance (6 tests)
- Response time baselines
- Database connection pooling
- Memory usage
- Concurrent request handling

## 🔧 Configuration

### Environment Variables
```bash
# Override default URLs
BACKEND_URL=http://localhost:8083
FRONTEND_URL=http://localhost:3002

# Test configuration
TEST_TIMEOUT=30000
TEST_RETRIES=3
```

### Test Data
Tests use safe, non-destructive operations:
- Test data is prefixed with `test-` or `integration-`
- Clean up is automatic
- Production data is never touched

## 🚨 CI/CD Integration

### GitHub Actions Example
```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: |
          cd test-suite
          npm install
          npm run test:ci
```

### Exit Codes
- `0`: All tests passed
- `1`: Critical test failures detected

## 📝 Writing New Tests

### Test Structure
```javascript
{
  name: 'Test Name',
  test: async () => {
    // Test logic here
    return {
      success: true, // or false
      details: { ... }
    };
  }
}
```

### Best Practices
1. Use descriptive test names
2. Include timing information
3. Test both success and failure cases
4. Clean up test data
5. Document assumptions

## 🐛 Troubleshooting

### Common Issues

**Tests fail with connection errors**
```bash
# Check if services are running
node run-tests.js --help
```

**Redis connection refused**
- Redis is optional for basic tests
- Start Redis: `redis-server`
- Or skip Redis-dependent tests

**Permission errors**
```bash
# Fix permissions
chmod +x run-tests.js
```

**Memory issues with large test suites**
- Run suites individually
- Increase Node.js memory: `node --max-old-space-size=4096 run-tests.js`

### Debug Mode
```bash
# Verbose output
DEBUG=* node run-tests.js

# Run single test
node -e "require('./comprehensive-tests').testSettingsSystem()"
```

## 📞 Support

For test-related issues:
1. Check service availability
2. Review error logs
3. Run individual test suites
4. Check recent code changes

## 🎯 Success Metrics

### Production Readiness Checklist
- [ ] All critical tests passing (>95%)
- [ ] Integration tests complete
- [ ] Security validation passed
- [ ] Performance benchmarks met
- [ ] No memory leaks detected
- [ ] Error handling verified

### Performance Targets
- API Response: <500ms (95th percentile)
- Database Query: <100ms average
- Cache Hit Ratio: >80%
- Concurrent Users: 100+
- Memory Usage: <512MB per process

---

**Maintained by CTO Office | Last Updated: 2025-01-16**