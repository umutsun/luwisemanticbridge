#!/usr/bin/env node
/**
 * Multi-Tenant API Endpoint Test Script
 *
 * Purpose: Test critical API endpoints across all tenant instances
 * - Health endpoints
 * - Settings API
 * - Dashboard stats
 * - Database stats
 * - Redis stats
 *
 * Usage:
 *   node scripts/test-multitenant-apis.js [tenant_name]
 */

const axios = require('axios');

// Tenant configurations
const TENANTS = {
  'lsemb': {
    name: 'LSEMB',
    backendUrl: 'http://localhost:8083',
    frontendPort: 3002
  },
  'emlakai': {
    name: 'EmlakAI',
    backendUrl: 'http://localhost:8084',
    frontendPort: 3003
  },
  'bookie': {
    name: 'Bookie',
    backendUrl: 'http://localhost:8085',
    frontendPort: 3004
  }
};

// Test endpoints (no authentication required)
const PUBLIC_ENDPOINTS = [
  { path: '/health', name: 'Health Check' },
  { path: '/api/v2', name: 'API Docs' }
];

// Test endpoints (authentication required - skip or test with token)
const PROTECTED_ENDPOINTS = [
  { path: '/api/v2/settings', name: 'Settings' },
  { path: '/api/v2/dashboard/stats', name: 'Dashboard Stats' },
  { path: '/api/v2/database/stats', name: 'Database Stats' },
  { path: '/api/v2/redis/stats', name: 'Redis Stats' },
  { path: '/api/v2/health/system', name: 'System Health' }
];

/**
 * Test a single endpoint
 */
async function testEndpoint(baseUrl, endpoint, token = null) {
  const url = `${baseUrl}${endpoint.path}`;
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  try {
    const response = await axios.get(url, {
      headers,
      timeout: 5000,
      validateStatus: () => true // Don't throw on any status
    });

    if (response.status === 200) {
      return {
        success: true,
        status: 200,
        message: 'OK',
        data: response.data
      };
    } else if (response.status === 401 && !token) {
      return {
        success: true, // Expected for protected endpoints without token
        status: 401,
        message: 'Requires authentication (expected)'
      };
    } else {
      return {
        success: false,
        status: response.status,
        message: response.statusText || 'Error',
        error: response.data?.error
      };
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return {
        success: false,
        status: 0,
        message: 'Connection refused',
        error: 'Backend not running'
      };
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return {
        success: false,
        status: 0,
        message: 'Timeout',
        error: 'Request timeout'
      };
    } else {
      return {
        success: false,
        status: 0,
        message: err.message,
        error: err.code
      };
    }
  }
}

/**
 * Test frontend availability
 */
async function testFrontend(port) {
  try {
    const response = await axios.get(`http://localhost:${port}`, {
      timeout: 3000,
      validateStatus: () => true,
      maxRedirects: 0 // Don't follow redirects
    });

    // Next.js typically returns 307 redirect for /
    if (response.status === 307 || response.status === 200 || response.status === 404) {
      return { success: true, status: response.status };
    } else {
      return { success: false, status: response.status };
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return { success: false, error: 'Not running' };
    } else {
      return { success: false, error: err.message };
    }
  }
}

/**
 * Test a single tenant
 */
async function testTenant(tenantKey) {
  const tenant = TENANTS[tenantKey];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${tenant.name} - API Endpoint Tests`);
  console.log(`Backend: ${tenant.backendUrl}`);
  console.log(`Frontend: http://localhost:${tenant.frontendPort}`);
  console.log(`${'='.repeat(60)}`);

  const results = {
    frontend: null,
    public: [],
    protected: [],
    stats: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };

  // Test frontend
  console.log(`\nFrontend:`);
  const frontendResult = await testFrontend(tenant.frontendPort);
  results.frontend = frontendResult.success;

  if (frontendResult.success) {
    console.log(`  ✅ Frontend responding (${frontendResult.status})`);
  } else {
    console.log(`  ❌ Frontend not accessible: ${frontendResult.error || 'Unknown error'}`);
  }

  // Test public endpoints
  console.log(`\nPublic Endpoints:`);
  for (const endpoint of PUBLIC_ENDPOINTS) {
    const result = await testEndpoint(tenant.backendUrl, endpoint);
    results.public.push({ endpoint: endpoint.name, ...result });
    results.stats.total++;

    if (result.success) {
      results.stats.passed++;
      console.log(`  ✅ ${endpoint.name} (${result.status})`);
    } else {
      results.stats.failed++;
      console.log(`  ❌ ${endpoint.name} (${result.status}): ${result.message}`);
    }
  }

  // Test protected endpoints (without token - should return 401 or work if auth disabled)
  console.log(`\nProtected Endpoints (no auth):`);
  for (const endpoint of PROTECTED_ENDPOINTS) {
    const result = await testEndpoint(tenant.backendUrl, endpoint);
    results.protected.push({ endpoint: endpoint.name, ...result });
    results.stats.total++;

    if (result.success) {
      results.stats.passed++;
      const msg = result.status === 401 ? 'Auth required' : 'OK';
      console.log(`  ✅ ${endpoint.name} (${result.status}${result.status === 401 ? ' - Auth required' : ''})`);
    } else {
      results.stats.failed++;
      console.log(`  ❌ ${endpoint.name} (${result.status}): ${result.message}`);
    }
  }

  // Check settings API response if accessible
  const settingsEndpoint = results.protected.find(r => r.endpoint === 'Settings');
  if (settingsEndpoint && settingsEndpoint.status === 200 && settingsEndpoint.data) {
    const appName = settingsEndpoint.data?.app?.name;
    const chatModel = settingsEndpoint.data?.llmSettings?.activeChatModel;

    console.log(`\nSettings Preview:`);
    console.log(`  App Name: ${appName || 'Not set'}`);
    console.log(`  Chat Model: ${chatModel || 'Not set'}`);
  }

  // Summary
  console.log(`\nSummary:`);
  console.log(`  Passed: ${results.stats.passed}/${results.stats.total}`);
  console.log(`  Failed: ${results.stats.failed}/${results.stats.total}`);

  const overallStatus = results.stats.failed === 0 ? '✅ PASSED' : '❌ FAILED';
  console.log(`  Overall: ${overallStatus}`);

  return results;
}

/**
 * Main execution
 */
async function main() {
  const targetTenant = process.argv[2];

  console.log('Multi-Tenant API Endpoint Test Suite');
  console.log(`Time: ${new Date().toISOString()}\n`);

  const allResults = {};

  if (targetTenant) {
    // Test specific tenant
    if (!TENANTS[targetTenant]) {
      console.log(`❌ Unknown tenant: ${targetTenant}`);
      console.log(`Available: ${Object.keys(TENANTS).join(', ')}`);
      process.exit(1);
    }
    allResults[targetTenant] = await testTenant(targetTenant);
  } else {
    // Test all tenants
    for (const tenantKey of Object.keys(TENANTS)) {
      allResults[tenantKey] = await testTenant(tenantKey);
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL SUMMARY');
  console.log(`${'='.repeat(60)}`);

  const overallStats = {
    total: 0,
    passed: 0,
    failed: 0,
    tenantsFailed: 0
  };

  Object.entries(allResults).forEach(([tenant, results]) => {
    overallStats.total += results.stats.total;
    overallStats.passed += results.stats.passed;
    overallStats.failed += results.stats.failed;

    if (results.stats.failed > 0) {
      overallStats.tenantsFailed++;
    }

    const status = results.stats.failed === 0 ? '✅' : '❌';
    console.log(`  ${status} ${TENANTS[tenant].name}: ${results.stats.passed}/${results.stats.total} passed`);
  });

  console.log(`\nOverall: ${overallStats.passed}/${overallStats.total} tests passed`);

  if (overallStats.tenantsFailed > 0) {
    console.log(`\n⚠️  ${overallStats.tenantsFailed} tenant(s) have failing tests`);
    process.exit(1);
  } else {
    console.log(`\n✅ All API tests passed!`);
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { testTenant, testEndpoint };
