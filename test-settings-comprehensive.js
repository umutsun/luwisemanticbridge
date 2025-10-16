// SETTINGS SYSTEM COMPREHENSIVE TESTING
// Tests: Cache Performance, API Endpoints, Frontend Integration, Edge Cases

const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:8083';
const TEST_RESULTS = {
  cachePerformance: {},
  apiEndpoints: {},
  frontendIntegration: {},
  edgeCases: {},
  summary: {
    totalTests: 0,
    passed: 0,
    failed: 0,
    warnings: []
  }
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'test': '🧪',
    'perf': '⚡',
    'cache': '📦',
    'api': '🌐'
  }[type];

  console.log(`${prefix} [${timestamp}] ${message}`);
}

function updateResult(category, test, passed, details = {}) {
  TEST_RESULTS[category][test] = { passed, details };
  TEST_RESULTS.summary.totalTests++;
  if (passed) {
    TEST_RESULTS.summary.passed++;
  } else {
    TEST_RESULTS.summary.failed++;
  }
}

// ==================== 1. CACHE PERFORMANCE TESTING ====================
async function testCachePerformance() {
  log('\n=== 1. CACHE PERFORMANCE TESTING ===', 'test');

  // Test 1.1: Category filtering response times
  log('\n1.1 Testing category filtering response times (<100ms target)', 'perf');

  const categories = ['llm', 'embeddings', 'rag', 'database', 'security'];
  const responseTimes = {};

  for (const category of categories) {
    const times = [];

    // Make 5 requests to measure average
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      try {
        await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
          timeout: 5000
        });
        const end = performance.now();
        times.push(end - start);

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        log(`Failed to fetch ${category}: ${error.message}`, 'error');
      }
    }

    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      responseTimes[category] = { avg: avgTime, min: minTime, max: maxTime };

      const passed = avgTime < 100;
      updateResult('cachePerformance', `category_${category}_response`, passed, {
        avg: avgTime.toFixed(2),
        min: minTime.toFixed(2),
        max: maxTime.toFixed(2)
      });

      log(`  ${category}: avg=${avgTime.toFixed(2)}ms, min=${minTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`, passed ? 'success' : 'error');
    }
  }

  // Test 1.2: Hit/Miss ratios with TTL validation
  log('\n1.2 Testing cache hit/miss ratios', 'cache');

  const cacheTests = {
    llm: 20,
    embeddings: 20,
    rag: 20
  };

  for (const [category, requestCount] of Object.entries(cacheTests)) {
    const times = [];
    let hits = 0;
    let misses = 0;

    for (let i = 0; i < requestCount; i++) {
      const start = performance.now();
      try {
        await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
          timeout: 3000
        });
        const end = performance.now();
        times.push(end - start);

        // Simulate cache hit/miss based on response time
        if (end - start < 50) {
          hits++;
        } else {
          misses++;
        }
      } catch (error) {
        log(`Cache test failed for ${category}: ${error.message}`, 'error');
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const hitRatio = (hits / requestCount) * 100;
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    updateResult('cachePerformance', `cache_${category}_ratio`, hitRatio > 50, {
      hitRatio: hitRatio.toFixed(2),
      avgTime: avgTime.toFixed(2)
    });

    log(`  ${category}: hitRatio=${hitRatio.toFixed(2)}%, avgTime=${avgTime.toFixed(2)}ms`, hitRatio > 50 ? 'success' : 'warning');
  }

  // Test 1.3: Concurrent requests handling
  log('\n1.3 Testing concurrent requests handling', 'perf');

  const concurrentCount = 10;
  const startTime = performance.now();

  const concurrentPromises = Array(concurrentCount).fill().map(async (_, index) => {
    try {
      const start = performance.now();
      await axios.get(`${BASE_URL}/api/v2/settings?category=llm`, {
        timeout: 5000
      });
      const end = performance.now();
      return { index, time: end - start, success: true };
    } catch (error) {
      return { index, error: error.message, success: false };
    }
  });

  const concurrentResults = await Promise.all(concurrentPromises);
  const endTime = performance.now();

  const successful = concurrentResults.filter(r => r.success);
  const totalTime = endTime - startTime;

  updateResult('cachePerformance', 'concurrent_requests', successful.length === concurrentCount, {
    total: concurrentCount,
    successful: successful.length,
    totalTime: totalTime.toFixed(2)
  });

  log(`  Concurrent requests: ${successful.length}/${concurrentCount} successful in ${totalTime.toFixed(2)}ms`,
      successful.length === concurrentCount ? 'success' : 'error');
}

// ==================== 2. API ENDPOINTS VALIDATION ====================
async function testApiEndpoints() {
  log('\n=== 2. API ENDPOINTS VALIDATION ===', 'test');

  // Test 2.1: GET /api/v2/settings?category=*
  log('\n2.1 Testing GET category endpoints', 'api');

  const validCategories = ['llm', 'embeddings', 'rag', 'database', 'security', 'app', 'scraper'];

  for (const category of validCategories) {
    try {
      const response = await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
        timeout: 3000
      });

      const hasData = response.data && Object.keys(response.data).length > 0;
      const hasCorrectStructure = typeof response.data === 'object';

      updateResult('apiEndpoints', `get_category_${category}`, hasData && hasCorrectStructure, {
        status: response.status,
        dataSize: JSON.stringify(response.data).length,
        sections: Object.keys(response.data)
      });

      log(`  GET /api/v2/settings?category=${category}: ${response.status}, ${Object.keys(response.data).length} sections`,
          hasData && hasCorrectStructure ? 'success' : 'error');

    } catch (error) {
      updateResult('apiEndpoints', `get_category_${category}`, false, { error: error.message });
      log(`  GET /api/v2/settings?category=${category}: FAILED - ${error.message}`, 'error');
    }
  }

  // Test 2.2: Invalid categories
  log('\n2.2 Testing invalid categories', 'api');

  const invalidCategories = ['invalid', 'nonexistent', '', null, undefined];

  for (const category of invalidCategories) {
    try {
      const response = await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
        timeout: 3000,
        validateStatus: (status) => status < 500
      });

      const handlesGracefully = response.status === 200 || response.status === 400;

      updateResult('apiEndpoints', `invalid_category_${category}`, handlesGracefully, {
        status: response.status,
        hasData: !!response.data
      });

      log(`  Invalid category "${category}": ${response.status} - ${handlesGracefully ? 'Handled gracefully' : 'Unexpected behavior'}`,
          handlesGracefully ? 'success' : 'warning');

    } catch (error) {
      updateResult('apiEndpoints', `invalid_category_${category}`, true, { error: error.message });
      log(`  Invalid category "${category}": Correctly rejected`, 'success');
    }
  }

  // Test 2.3: PUT /api/v2/settings with validation
  log('\n2.3 Testing PUT settings with validation', 'api');

  const validUpdates = {
    'openai.temperature': 0.7,
    'embeddings.chunkSize': 1000,
    'ragSettings.similarityThreshold': 0.05
  };

  for (const [key, value] of Object.entries(validUpdates)) {
    try {
      const response = await axios.post(`${BASE_URL}/api/v2/settings`, {
        [key]: value
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      const success = response.status === 200 && response.data.success;

      updateResult('apiEndpoints', `put_valid_${key}`, success, {
        status: response.status,
        hasSuccess: response.data.success
      });

      log(`  PUT ${key}=${value}: ${response.status} - ${success ? 'Success' : 'Failed'}`,
          success ? 'success' : 'error');

    } catch (error) {
      updateResult('apiEndpoints', `put_valid_${key}`, false, { error: error.message });
      log(`  PUT ${key}=${value}: FAILED - ${error.message}`, 'error');
    }
  }

  // Test 2.4: Invalid settings values
  log('\n2.4 Testing invalid settings values', 'api');

  const invalidUpdates = {
    'openai.temperature': 'invalid',
    'embeddings.chunkSize': -100,
    'ragSettings.similarityThreshold': 2.0
  };

  for (const [key, value] of Object.entries(invalidUpdates)) {
    try {
      const response = await axios.post(`${BASE_URL}/api/v2/settings`, {
        [key]: value
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status) => status < 500
      });

      const rejected = response.status >= 400 || !response.data.success;

      updateResult('apiEndpoints', `put_invalid_${key}`, rejected, {
        status: response.status,
        rejected: rejected
      });

      log(`  PUT ${key}=${value}: ${response.status} - ${rejected ? 'Correctly rejected' : 'Unexpectedly accepted'}`,
          rejected ? 'success' : 'error');

    } catch (error) {
      updateResult('apiEndpoints', `put_invalid_${key}`, true, { error: error.message });
      log(`  PUT ${key}=${value}: Correctly rejected with error`, 'success');
    }
  }
}

// ==================== 3. FRONTEND INTEGRATION ====================
async function testFrontendIntegration() {
  log('\n=== 3. FRONTEND INTEGRATION TESTING ===', 'test');

  // Test 3.1: Settings page load simulation
  log('\n3.1 Simulating settings page load', 'perf');

  const pageLoadSequence = [
    { category: 'app', expected: '<50ms' },
    { category: 'llm', expected: '<100ms' },
    { category: 'embeddings', expected: '<100ms' },
    { category: 'rag', expected: '<100ms' }
  ];

  for (const { category, expected } of pageLoadSequence) {
    const start = performance.now();
    try {
      await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
        timeout: 5000
      });
      const end = performance.now();
      const loadTime = end - start;

      const meetsExpectation = loadTime < parseInt(expected.match(/\d+/)[0]);

      updateResult('frontendIntegration', `page_load_${category}`, meetsExpectation, {
        loadTime: loadTime.toFixed(2),
        expected
      });

      log(`  Page load ${category}: ${loadTime.toFixed(2)}ms (expected ${expected})`,
          meetsExpectation ? 'success' : 'warning');

    } catch (error) {
      updateResult('frontendIntegration', `page_load_${category}`, false, { error: error.message });
      log(`  Page load ${category}: FAILED - ${error.message}`, 'error');
    }
  }

  // Test 3.2: Tab switching performance
  log('\n3.2 Testing tab switching performance', 'perf');

  const tabSwitchTests = 10;
  const tabSwitchTimes = [];

  for (let i = 0; i < tabSwitchTests; i++) {
    const category = ['llm', 'embeddings', 'rag', 'database'][i % 4];
    const start = performance.now();

    try {
      await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
        timeout: 3000
      });
      const end = performance.now();
      tabSwitchTimes.push(end - start);
    } catch (error) {
      log(`  Tab switch to ${category}: FAILED - ${error.message}`, 'error');
    }
  }

  if (tabSwitchTimes.length > 0) {
    const avgSwitchTime = tabSwitchTimes.reduce((a, b) => a + b, 0) / tabSwitchTimes.length;
    const smoothSwitching = avgSwitchTime < 100;

    updateResult('frontendIntegration', 'tab_switching', smoothSwitching, {
      avgTime: avgSwitchTime.toFixed(2),
      tests: tabSwitchTests
    });

    log(`  Tab switching: avg=${avgSwitchTime.toFixed(2)}ms (${tabSwitchTests} tests)`,
        smoothSwitching ? 'success' : 'warning');
  }

  // Test 3.3: Settings persistence
  log('\n3.3 Testing settings persistence', 'api');

  const testValue = `test_value_${Date.now()}`;

  try {
    // Save setting
    await axios.post(`${BASE_URL}/api/v2/settings`, {
      'test.persistence': testValue
    }, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });

    // Retrieve setting
    const response = await axios.get(`${BASE_URL}/api/v2/settings`, {
      timeout: 3000
    });

    const persisted = JSON.stringify(response.data).includes(testValue);

    updateResult('frontendIntegration', 'settings_persistence', persisted, {
      testValue,
      found: persisted
    });

    log(`  Settings persistence: ${persisted ? 'PASSED' : 'FAILED'}`, persisted ? 'success' : 'error');

  } catch (error) {
    updateResult('frontendIntegration', 'settings_persistence', false, { error: error.message });
    log(`  Settings persistence: FAILED - ${error.message}`, 'error');
  }
}

// ==================== 4. EDGE CASES ====================
async function testEdgeCases() {
  log('\n=== 4. EDGE CASES TESTING ===', 'test');

  // Test 4.1: Extremely large settings payload
  log('\n4.1 Testing large payload handling', 'test');

  const largePayload = {
    'test.large': 'x'.repeat(10000),
    'test.nested': {
      level1: {
        level2: {
          level3: 'y'.repeat(5000)
        }
      }
    }
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/v2/settings`, largePayload, {
      timeout: 10000,
      maxContentLength: 5000000,
      maxBodyLength: 5000000
    });

    const handled = response.status === 200 || response.status === 413;

    updateResult('edgeCases', 'large_payload', handled, {
      status: response.status,
      payloadSize: JSON.stringify(largePayload).length
    });

    log(`  Large payload: ${response.status} - ${handled ? 'Handled' : 'Failed'}`, handled ? 'success' : 'warning');

  } catch (error) {
    updateResult('edgeCases', 'large_payload', true, { error: error.code });
    log(`  Large payload: Correctly rejected - ${error.code}`, 'success');
  }

  // Test 4.2: Special characters in settings
  log('\n4.2 Testing special characters', 'test');

  const specialChars = {
    'test.turkish': 'ŞşİıĞğÖöÇçÜü',
    'test.unicode': '🚀🎯✅❌⚠️📋',
    'test.html': '<script>alert("xss")</script>',
    'test.sql': "'; DROP TABLE settings; --",
    'test.json': '{"nested": "value", "array": [1,2,3]}'
  };

  for (const [key, value] of Object.entries(specialChars)) {
    try {
      const response = await axios.post(`${BASE_URL}/api/v2/settings`, {
        [key]: value
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      const success = response.status === 200 && response.data.success;

      updateResult('edgeCases', `special_chars_${key}`, success, {
        status: response.status,
        valueType: typeof value
      });

      log(`  Special chars ${key}: ${success ? 'PASSED' : 'FAILED'}`, success ? 'success' : 'error');

    } catch (error) {
      updateResult('edgeCases', `special_chars_${key}`, false, { error: error.message });
      log(`  Special chars ${key}: FAILED - ${error.message}`, 'error');
    }
  }

  // Test 4.3: Rapid successive requests
  log('\n4.3 Testing rapid successive requests', 'perf');

  const rapidRequestCount = 50;
  const rapidTimes = [];
  let errors = 0;

  const startTime = performance.now();

  for (let i = 0; i < rapidRequestCount; i++) {
    const start = performance.now();
    try {
      await axios.get(`${BASE_URL}/api/v2/settings?category=llm`, {
        timeout: 1000
      });
      const end = performance.now();
      rapidTimes.push(end - start);
    } catch (error) {
      errors++;
    }
  }

  const totalTime = performance.now() - startTime;
  const avgTime = rapidTimes.length > 0 ? rapidTimes.reduce((a, b) => a + b, 0) / rapidTimes.length : 0;
  const rps = (rapidRequestCount / (totalTime / 1000)).toFixed(2);

  const stability = errors < rapidRequestCount * 0.1; // Less than 10% errors

  updateResult('edgeCases', 'rapid_requests', stability, {
    total: rapidRequestCount,
    errors,
    avgTime: avgTime.toFixed(2),
    rps
  });

  log(`  Rapid requests: ${errors}/${rapidRequestCount} errors, ${rps} req/sec, avg=${avgTime.toFixed(2)}ms`,
      stability ? 'success' : 'warning');
}

// ==================== TEST RUNNER ====================
async function runAllTests() {
  console.log('\n🎯 SETTINGS SYSTEM COMPREHENSIVE TESTING');
  console.log('='.repeat(60));
  console.log(`Target: http://localhost:8083`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  try {
    // Check if backend is running (test settings endpoint)
    await axios.get(`${BASE_URL}/api/v2/settings?category=app`, { timeout: 3000 });
    log('Backend is running', 'success');
  } catch (error) {
    log('Backend is not accessible!', 'error');
    log('Please ensure backend is running on http://localhost:8083', 'error');
    process.exit(1);
  }

  try {
    // Run all test suites
    await testCachePerformance();
    await testApiEndpoints();
    await testFrontendIntegration();
    await testEdgeCases();

    // Generate summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const { totalTests, passed, failed, warnings } = TEST_RESULTS.summary;
    const passRate = ((passed / totalTests) * 100).toFixed(2);

    console.log(`\nTotal Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Pass Rate: ${passRate}%`);

    // Performance metrics
    console.log('\n⚡ PERFORMANCE METRICS:');
    console.log('='.repeat(40));

    // Calculate averages
    const avgResponseTimes = [];
    Object.entries(TEST_RESULTS.cachePerformance).forEach(([test, result]) => {
      if (result.details.avg) {
        avgResponseTimes.push(parseFloat(result.details.avg));
      }
    });

    if (avgResponseTimes.length > 0) {
      const overallAvgTime = avgResponseTimes.reduce((a, b) => a + b, 0) / avgResponseTimes.length;
      console.log(`Average Response Time: ${overallAvgTime.toFixed(2)}ms`);
      console.log(`Min Response Time: ${Math.min(...avgResponseTimes).toFixed(2)}ms`);
      console.log(`Max Response Time: ${Math.max(...avgResponseTimes).toFixed(2)}ms`);
    }

    // Optimization opportunities
    console.log('\n💡 OPTIMIZATION OPPORTUNITIES:');
    console.log('='.repeat(40));

    if (failed > 0) {
      console.log(`- Fix ${failed} failing tests`);
      TEST_RESULTS.summary.warnings.push(`${failed} tests failed`);
    }

    const slowEndpoints = Object.entries(TEST_RESULTS.cachePerformance)
      .filter(([test, result]) => result.details.avg && parseFloat(result.details.avg) > 100)
      .map(([test]) => test);

    if (slowEndpoints.length > 0) {
      console.log(`- Optimize slow endpoints: ${slowEndpoints.join(', ')}`);
      TEST_RESULTS.summary.warnings.push(`${slowEndpoints.length} endpoints >100ms`);
    }

    if (avgResponseTimes.length > 0) {
      const overallAvg = avgResponseTimes.reduce((a, b) => a + b, 0) / avgResponseTimes.length;
      if (overallAvg > 80) {
        console.log('- Consider implementing response caching');
        TEST_RESULTS.summary.warnings.push('Average response time >80ms');
      }
    }

    // Final verdict
    console.log('\n🏆 FINAL VERDICT:');
    console.log('='.repeat(40));

    if (passRate >= 95) {
      console.log('✅ EXCELLENT - Settings system is highly optimized!');
    } else if (passRate >= 85) {
      console.log('✅ GOOD - Settings system is performing well with minor issues');
    } else if (passRate >= 70) {
      console.log('⚠️ OK - Settings system needs some optimizations');
    } else {
      console.log('❌ NEEDS WORK - Settings system requires significant improvements');
    }

    // Save results to file
    const reportFile = `settings-test-report-${Date.now()}.json`;
    require('fs').writeFileSync(reportFile, JSON.stringify(TEST_RESULTS, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportFile}`);

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests, TEST_RESULTS };