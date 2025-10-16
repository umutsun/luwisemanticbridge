const axios = require('axios');
const { performance } = require('perf_hooks');

// API base configuration
const API_BASE = 'http://localhost:8083';
const API_VERSION = '/api/v2';

// Test endpoints
const endpoints = [
  // Health check
  { method: 'GET', path: '/health', expected: 200 },
  { method: 'GET', path: '/api/health', expected: 200 },

  // Settings endpoints
  { method: 'GET', path: `${API_VERSION}/settings/`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/settings/health`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/settings/category/llm`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/settings/category/embeddings`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/settings/category/database`, expected: 200 },

  // Database endpoints
  { method: 'GET', path: `${API_VERSION}/database/health`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/database/tables`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/database/stats`, expected: 200 },

  // Redis endpoints
  { method: 'GET', path: `${API_VERSION}/redis/health`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/redis/info`, expected: 200 },

  // Document endpoints
  { method: 'GET', path: `${API_VERSION}/documents/`, expected: 401 }, // Should require auth
  { method: 'GET', path: `${API_VERSION}/documents/stats`, expected: 401 }, // Should require auth

  // Chat endpoints
  { method: 'GET', path: `${API_VERSION}/chat/health`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/chat/stats`, expected: 401 }, // Should require auth

  // Scraper endpoints
  { method: 'GET', path: `${API_VERSION}/scraper/health`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/scraper/status`, expected: 401 }, // Should require auth

  // Embeddings endpoints
  { method: 'GET', path: `${API_VERSION}/embeddings/health`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/embeddings/stats`, expected: 200 },

  // Translation endpoints
  { method: 'GET', path: `${API_VERSION}/translate/health`, expected: 200 },
  { method: 'GET', path: `${API_VERSION}/translate/languages`, expected: 200 },
];

async function testEndpoint(endpoint) {
  const startTime = performance.now();

  try {
    const response = await axios({
      method: endpoint.method,
      url: `${API_BASE}${endpoint.path}`,
      timeout: 5000,
      validateStatus: () => true // Don't throw on any status code
    });

    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);

    const statusMatch = response.status === endpoint.expected;
    const success = statusMatch && response.status < 500;

    return {
      path: endpoint.path,
      method: endpoint.method,
      expected: endpoint.expected,
      actual: response.status,
      responseTime,
      success,
      statusMatch,
      data: response.data ? (typeof response.data === 'object' ? JSON.stringify(response.data).substring(0, 100) : response.data.substring(0, 100)) : null
    };
  } catch (error) {
    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);

    return {
      path: endpoint.path,
      method: endpoint.method,
      expected: endpoint.expected,
      actual: 'ERROR',
      responseTime,
      success: false,
      statusMatch: false,
      error: error.code || error.message
    };
  }
}

async function runComprehensiveTest() {
  console.log('🔍 COMPREHENSIVE API ENDPOINT FUNCTIONALITY TEST');
  console.log('='.repeat(60));
  console.log(`Testing ${endpoints.length} endpoints...\n`);

  const results = [];
  let passed = 0;
  let failed = 0;
  let totalResponseTime = 0;

  // Run all tests
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);

    if (result.success) {
      passed++;
      console.log(`✅ ${endpoint.method} ${endpoint.path} - ${result.actual} (${result.responseTime}ms)`);
    } else {
      failed++;
      console.log(`❌ ${endpoint.method} ${endpoint.path} - Expected ${endpoint.expected}, got ${result.actual} (${result.responseTime}ms)`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }

    totalResponseTime += result.responseTime;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Endpoints: ${endpoints.length}`);
  console.log(`Passed: ${passed} (${((passed/endpoints.length)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${((failed/endpoints.length)*100).toFixed(1)}%)`);
  console.log(`Average Response Time: ${Math.round(totalResponseTime/endpoints.length)}ms`);

  // Categorize failures
  const criticalFailures = results.filter(r => r.actual === 'ERROR' || r.actual >= 500);
  const authRequired = results.filter(r => r.actual === 401);
  const notFound = results.filter(r => r.actual === 404);
  const statusMismatches = results.filter(r => !r.statusMatch && r.actual !== 'ERROR');

  console.log('\n🚨 CRITICAL ISSUES (500+ errors or connection failures):');
  if (criticalFailures.length > 0) {
    criticalFailures.forEach(f => {
      console.log(`   - ${f.method} ${f.path}: ${f.actual} ${f.error ? `(${f.error})` : ''}`);
    });
  } else {
    console.log('   ✅ None detected');
  }

  console.log('\n🔐 AUTHENTICATION REQUIRED (401 - Expected):');
  if (authRequired.length > 0) {
    authRequired.forEach(a => {
      console.log(`   - ${a.method} ${a.path}: ${a.actual} (correctly protected)`);
    });
  } else {
    console.log('   ℹ️  No protected endpoints found');
  }

  console.log('\n🔍 MISSING ENDPOINTS (404):');
  if (notFound.length > 0) {
    notFound.forEach(n => {
      console.log(`   - ${n.method} ${n.path}: ${n.actual} (endpoint not implemented)`);
    });
  } else {
    console.log('   ✅ All endpoints implemented');
  }

  console.log('\n⚠️  STATUS MISMATCHES (unexpected status codes):');
  if (statusMismatches.length > 0) {
    statusMismatches.forEach(s => {
      console.log(`   - ${s.method} ${s.path}: Expected ${s.expected}, got ${s.actual}`);
    });
  } else {
    console.log('   ✅ All endpoints returned expected status codes');
  }

  // Overall assessment
  const successRate = (passed / endpoints.length) * 100;
  console.log('\n🎯 OVERALL ASSESSMENT:');

  if (successRate >= 90) {
    console.log('   ✅ EXCELLENT: System is highly functional');
  } else if (successRate >= 75) {
    console.log('   ✅ GOOD: System is mostly functional');
  } else if (successRate >= 50) {
    console.log('   ⚠️  MODERATE: System has significant issues');
  } else {
    console.log('   ❌ POOR: System has major problems');
  }

  console.log(`   Success Rate: ${successRate.toFixed(1)}%`);

  return results;
}

// Run the test
if (require.main === module) {
  runComprehensiveTest().catch(console.error);
}

module.exports = { runComprehensiveTest, testEndpoint };