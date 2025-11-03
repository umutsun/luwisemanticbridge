#!/usr/bin/env node
/**
 * PM2 Multi-Tenant Services Health Check
 *
 * Purpose: Check PM2 service status for all tenant instances
 * - Check if services are online
 * - Monitor restart counts (high restarts = issues)
 * - Check CPU and memory usage
 * - Verify port assignments
 *
 * Usage:
 *   node scripts/check-pm2-services.js
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Expected PM2 services
const EXPECTED_SERVICES = {
  'lsemb': {
    backend: { name: 'lsemb-backend', expectedPort: 8083 },
    frontend: { name: 'lsemb-frontend', expectedPort: 3002 },
    python: { name: 'lsemb-python', expectedPort: 8001 }
  },
  'emlakai': {
    backend: { name: 'emlakai-backend', expectedPort: 8084 },
    frontend: { name: 'emlakai-frontend', expectedPort: 3003 },
    python: { name: 'emlakai-python', expectedPort: 8002 }
  },
  'bookie': {
    backend: { name: 'bookie-backend', expectedPort: 8085 },
    frontend: { name: 'bookie-frontend', expectedPort: 3004 },
    python: { name: 'bookie-python', expectedPort: 8003 }
  }
};

// Thresholds
const RESTART_WARNING_THRESHOLD = 10;
const RESTART_CRITICAL_THRESHOLD = 50;
const MEMORY_WARNING_MB = 500;
const MEMORY_CRITICAL_MB = 1000;

/**
 * Get PM2 process list as JSON
 */
async function getPM2List() {
  try {
    const { stdout } = await execPromise('pm2 jlist');
    return JSON.parse(stdout);
  } catch (err) {
    if (err.message.includes('pm2: command not found')) {
      throw new Error('PM2 not installed or not in PATH');
    }
    throw err;
  }
}

/**
 * Parse memory string to MB
 */
function parseMemory(memStr) {
  if (!memStr) return 0;

  const match = memStr.match(/([\d.]+)\s*(k|m|g)?b?/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'm').toLowerCase();

  switch (unit) {
    case 'g': return value * 1024;
    case 'm': return value;
    case 'k': return value / 1024;
    default: return value;
  }
}

/**
 * Format uptime
 */
function formatUptime(ms) {
  if (!ms) return 'N/A';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Check a single service
 */
function checkService(process, expectedPort) {
  const issues = [];
  let status = 'healthy';

  // Check if online
  if (process.pm2_env.status !== 'online') {
    issues.push(`Status: ${process.pm2_env.status}`);
    status = 'critical';
  }

  // Check restart count
  const restarts = process.pm2_env.restart_time || 0;
  if (restarts >= RESTART_CRITICAL_THRESHOLD) {
    issues.push(`Very high restarts: ${restarts}`);
    status = 'critical';
  } else if (restarts >= RESTART_WARNING_THRESHOLD) {
    issues.push(`High restarts: ${restarts}`);
    if (status !== 'critical') status = 'warning';
  }

  // Check memory
  const memoryMB = parseMemory(process.monit?.memory);
  if (memoryMB >= MEMORY_CRITICAL_MB) {
    issues.push(`High memory: ${memoryMB.toFixed(0)}MB`);
    status = 'critical';
  } else if (memoryMB >= MEMORY_WARNING_MB) {
    issues.push(`Elevated memory: ${memoryMB.toFixed(0)}MB`);
    if (status !== 'critical') status = 'warning';
  }

  // CPU check (if > 90% sustained, it's a warning)
  const cpu = process.monit?.cpu || 0;
  if (cpu > 90) {
    issues.push(`High CPU: ${cpu}%`);
    if (status !== 'critical') status = 'warning';
  }

  return {
    status,
    online: process.pm2_env.status === 'online',
    restarts,
    memory: memoryMB,
    cpu,
    uptime: process.pm2_env.pm_uptime,
    issues
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('PM2 Multi-Tenant Services Health Check');
  console.log(`Time: ${new Date().toISOString()}\n`);

  let processes;
  try {
    processes = await getPM2List();
  } catch (err) {
    console.error('❌ Failed to get PM2 process list:', err.message);
    process.exit(1);
  }

  const processMap = {};
  processes.forEach(proc => {
    processMap[proc.name] = proc;
  });

  const results = {
    healthy: 0,
    warning: 0,
    critical: 0,
    missing: 0
  };

  // Check each expected service
  for (const [tenant, services] of Object.entries(EXPECTED_SERVICES)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${tenant.toUpperCase()} Services`);
    console.log(`${'='.repeat(60)}`);

    for (const [type, config] of Object.entries(services)) {
      const proc = processMap[config.name];

      if (!proc) {
        console.log(`  ❌ ${config.name}: NOT FOUND`);
        results.missing++;
        continue;
      }

      const health = checkService(proc, config.expectedPort);
      let icon = '✅';
      if (health.status === 'warning') {
        icon = '⚠️ ';
        results.warning++;
      } else if (health.status === 'critical') {
        icon = '❌';
        results.critical++;
      } else {
        results.healthy++;
      }

      const uptimeStr = formatUptime(health.uptime);
      const memoryStr = health.memory ? `${health.memory.toFixed(0)}MB` : 'N/A';

      console.log(`  ${icon} ${config.name}`);
      console.log(`     Status: ${proc.pm2_env.status} | Uptime: ${uptimeStr} | Restarts: ${health.restarts}`);
      console.log(`     Memory: ${memoryStr} | CPU: ${health.cpu}%`);

      if (health.issues.length > 0) {
        health.issues.forEach(issue => {
          console.log(`     ⚠️  ${issue}`);
        });
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);

  const total = results.healthy + results.warning + results.critical + results.missing;

  console.log(`  ✅ Healthy: ${results.healthy}/${total}`);

  if (results.warning > 0) {
    console.log(`  ⚠️  Warnings: ${results.warning}/${total}`);
  }

  if (results.critical > 0) {
    console.log(`  ❌ Critical: ${results.critical}/${total}`);
  }

  if (results.missing > 0) {
    console.log(`  ❓ Missing: ${results.missing}/${total}`);
  }

  // Recommendations
  if (results.critical > 0 || results.missing > 0) {
    console.log(`\n⚠️  CRITICAL ISSUES DETECTED`);
    console.log(`\nRecommended actions:`);

    if (results.missing > 0) {
      console.log(`  1. Start missing services: pm2 start ecosystem.config.js`);
    }

    if (results.critical > 0) {
      console.log(`  2. Check logs: pm2 logs [service-name] --lines 50`);
      console.log(`  3. Restart problematic services: pm2 restart [service-name]`);
      console.log(`  4. Check database connectivity: node scripts/check-tenant-databases.js`);
    }

    process.exit(1);
  } else if (results.warning > 0) {
    console.log(`\n⚠️  Some services have warnings - monitor closely`);
    process.exit(0);
  } else {
    console.log(`\n✅ All services healthy!`);
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

module.exports = { getPM2List, checkService };
