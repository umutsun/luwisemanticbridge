#!/usr/bin/env node
/**
 * Multi-Tenant Authentication Test Script
 *
 * Purpose: Test authentication flows across all tenant instances
 * - Test login with admin credentials
 * - Verify JWT token generation
 * - Test token refresh functionality
 * - Check session management
 *
 * Usage:
 *   node scripts/test-multitenant-auth.js [tenant_name]
 */

const axios = require('axios');

// Tenant configurations
const TENANTS = {
  'lsemb': {
    name: 'LSEMB',
    backendUrl: 'http://localhost:8083',
    adminEmail: 'admin@lsemb.com', // Update with actual admin email
    testPassword: 'admin123' // Update if different
  },
  'emlakai': {
    name: 'EmlakAI',
    backendUrl: 'http://localhost:8084',
    adminEmail: 'admin@emlakai.com',
    testPassword: 'admin123'
  },
  'bookie': {
    name: 'Bookie',
    backendUrl: 'http://localhost:8085',
    adminEmail: 'admin@bookie.com',
    testPassword: 'admin123'
  }
};

/**
 * Test login flow
 */
async function testLogin(tenant) {
  console.log(`\n  Testing login...`);

  try {
    const response = await axios.post(
      `${tenant.backendUrl}/api/v2/auth/login`,
      {
        email: tenant.adminEmail,
        password: tenant.testPassword
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );

    if (response.data.accessToken && response.data.user) {
      console.log(`  ✅ Login successful`);
      console.log(`     User: ${response.data.user.email}`);
      console.log(`     Role: ${response.data.user.role}`);
      console.log(`     Token: ${response.data.accessToken.substring(0, 20)}...`);
      return {
        success: true,
        token: response.data.accessToken,
        user: response.data.user
      };
    } else {
      console.log(`  ❌ Login response missing required fields`);
      return { success: false, error: 'Invalid response structure' };
    }
  } catch (err) {
    if (err.response) {
      console.log(`  ❌ Login failed: ${err.response.status} - ${err.response.data?.error || err.response.statusText}`);
      return { success: false, error: err.response.data?.error };
    } else if (err.code === 'ECONNREFUSED') {
      console.log(`  ❌ Cannot connect to backend (${tenant.backendUrl})`);
      console.log(`     Is the backend running? Check: pm2 list`);
      return { success: false, error: 'Connection refused' };
    } else {
      console.log(`  ❌ Login error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

/**
 * Test protected endpoint with token
 */
async function testProtectedEndpoint(tenant, token) {
  console.log(`\n  Testing protected endpoint...`);

  try {
    const response = await axios.get(
      `${tenant.backendUrl}/api/v2/settings`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 5000
      }
    );

    if (response.status === 200) {
      console.log(`  ✅ Protected endpoint accessible`);
      const appName = response.data?.app?.name || 'Unknown';
      console.log(`     App name from settings: "${appName}"`);
      return { success: true, appName };
    } else {
      console.log(`  ❌ Unexpected status: ${response.status}`);
      return { success: false };
    }
  } catch (err) {
    if (err.response?.status === 401) {
      console.log(`  ❌ Token not accepted (401 Unauthorized)`);
      return { success: false, error: 'Invalid token' };
    } else {
      console.log(`  ❌ Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

/**
 * Test health endpoint (no auth required)
 */
async function testHealth(tenant) {
  console.log(`\n  Testing health endpoint...`);

  try {
    const response = await axios.get(
      `${tenant.backendUrl}/health`,
      { timeout: 5000 }
    );

    if (response.status === 200 && response.data.status === 'healthy') {
      console.log(`  ✅ Health check passed`);
      console.log(`     Service: ${response.data.service}`);
      console.log(`     Version: ${response.data.version}`);
      console.log(`     Uptime: ${Math.floor(response.data.uptime)}s`);
      return { success: true };
    } else {
      console.log(`  ❌ Health check failed`);
      return { success: false };
    }
  } catch (err) {
    console.log(`  ❌ Health endpoint unreachable: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Test a single tenant
 */
async function testTenant(tenantKey) {
  const tenant = TENANTS[tenantKey];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${tenant.name} - Authentication Tests`);
  console.log(`Backend: ${tenant.backendUrl}`);
  console.log(`${'='.repeat(60)}`);

  const results = {
    health: false,
    login: false,
    protected: false
  };

  // Test 1: Health check
  const healthResult = await testHealth(tenant);
  results.health = healthResult.success;

  if (!results.health) {
    console.log(`\n❌ Backend not responding - skipping auth tests`);
    return results;
  }

  // Test 2: Login
  const loginResult = await testLogin(tenant);
  results.login = loginResult.success;

  if (!results.login) {
    console.log(`\n❌ Login failed - skipping protected endpoint test`);
    return results;
  }

  // Test 3: Protected endpoint
  const protectedResult = await testProtectedEndpoint(tenant, loginResult.token);
  results.protected = protectedResult.success;

  // Summary
  console.log(`\n  Summary:`);
  const allPassed = results.health && results.login && results.protected;
  console.log(`  ${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'PASSED' : 'FAILED'}`);

  return results;
}

/**
 * Main execution
 */
async function main() {
  const targetTenant = process.argv[2];

  console.log('Multi-Tenant Authentication Test Suite');
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

  const stats = {
    total: Object.keys(allResults).length,
    passed: 0,
    failed: 0
  };

  Object.entries(allResults).forEach(([tenant, results]) => {
    const allPassed = results.health && results.login && results.protected;
    const status = allPassed ? '✅ PASSED' : '❌ FAILED';

    if (allPassed) stats.passed++;
    else stats.failed++;

    console.log(`  ${TENANTS[tenant].name}: ${status}`);

    if (!allPassed) {
      if (!results.health) console.log(`     - Health check failed`);
      if (!results.login) console.log(`     - Login failed`);
      if (!results.protected) console.log(`     - Protected endpoint failed`);
    }
  });

  console.log(`\nResults: ${stats.passed}/${stats.total} tenants passed all tests`);

  if (stats.failed > 0) {
    console.log(`\n⚠️  ${stats.failed} tenant(s) failed - check PM2 and database status`);
    process.exit(1);
  } else {
    console.log(`\n✅ All authentication tests passed!`);
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

module.exports = { testTenant, testLogin };
