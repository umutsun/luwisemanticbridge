/**
 * DevOps Dashboard Routes
 *
 * Proxy routes to Python microservice for:
 * - SSH management
 * - Security scanning
 * - Deployments
 * - Server monitoring
 */

import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';

const router = Router();

// Python service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002';
const DEVOPS_BASE = `${PYTHON_SERVICE_URL}/api/python/devops`;

// Helper function to proxy requests
async function proxyToPython(
  req: Request,
  res: Response,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'
) {
  try {
    const url = `${DEVOPS_BASE}${path}`;
    console.log(`[DevOps] Proxying ${method} ${url}`);

    const response = await axios({
      method,
      url,
      data: method !== 'GET' ? req.body : undefined,
      params: method === 'GET' ? req.query : undefined,
      timeout: 300000, // 5 minutes for long operations
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.INTERNAL_API_KEY || ''
      }
    });

    res.json(response.data);
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(`[DevOps] Proxy error:`, axiosError.message);

    if (axiosError.response) {
      res.status(axiosError.response.status).json(axiosError.response.data);
    } else if (axiosError.code === 'ECONNREFUSED') {
      res.status(503).json({
        success: false,
        error: 'Python service unavailable',
        message: 'DevOps service is not running. Please start the Python microservice.'
      });
    } else {
      res.status(500).json({
        success: false,
        error: axiosError.message
      });
    }
  }
}

// ==========================================
// System Status (Local - No SSH Required)
// ==========================================

/**
 * GET /api/v2/devops/status
 * Get local system status (git info, last deploy time)
 * This endpoint works without SSH configuration
 */
router.get('/status', async (req: Request, res: Response) => {
  const { execSync } = require('child_process');
  const path = require('path');

  try {
    // Get project root (backend/../)
    const projectRoot = path.resolve(__dirname, '../../..');

    // Get git info
    let branch = 'unknown';
    let commitHash = 'unknown';
    let gitStatus: 'uptodate' | 'behind' | 'ahead' | 'unknown' = 'unknown';

    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
      commitHash = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();

      // Try to determine if ahead/behind (requires fetch first, may fail without network)
      try {
        execSync('git fetch origin --dry-run 2>&1', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 });
        const status = execSync('git status -sb', { cwd: projectRoot, encoding: 'utf-8' });
        if (status.includes('[ahead')) {
          gitStatus = 'ahead';
        } else if (status.includes('[behind')) {
          gitStatus = 'behind';
        } else if (!status.includes('[')) {
          gitStatus = 'uptodate';
        }
      } catch {
        // Network unavailable or timeout, check local status
        const localStatus = execSync('git status -sb', { cwd: projectRoot, encoding: 'utf-8' });
        if (localStatus.includes('[ahead')) {
          gitStatus = 'ahead';
        } else if (localStatus.includes('[behind')) {
          gitStatus = 'behind';
        } else {
          gitStatus = 'uptodate'; // Assume up to date if no tracking info
        }
      }
    } catch (gitError) {
      console.error('[DevOps] Git status error:', gitError);
    }

    // Get last deploy time from deployment history (if available)
    let lastDeploy: string | null = null;
    try {
      // Try to get from Python service
      const tenantId = process.env.TENANT_ID || 'default';
      const response = await axios.get(`${DEVOPS_BASE}/deployments/${tenantId}?limit=1`, {
        timeout: 3000,
        headers: { 'X-API-Key': process.env.INTERNAL_API_KEY || '' }
      });
      if (response.data?.deployments?.length > 0) {
        lastDeploy = response.data.deployments[0].started_at || response.data.deployments[0].completed_at;
      }
    } catch {
      // Python service unavailable, use git commit time as fallback
      try {
        const commitTime = execSync('git log -1 --format=%ci', { cwd: projectRoot, encoding: 'utf-8' }).trim();
        lastDeploy = new Date(commitTime).toISOString();
      } catch {
        lastDeploy = null;
      }
    }

    res.json({
      success: true,
      branch,
      commitHash,
      gitStatus,
      lastDeploy,
      tenantId: process.env.TENANT_ID || 'lsemb'
    });
  } catch (error) {
    console.error('[DevOps] Status error:', error);
    res.json({
      success: false,
      branch: 'unknown',
      commitHash: 'unknown',
      gitStatus: 'unknown',
      lastDeploy: null,
      error: String(error)
    });
  }
});

// ==========================================
// Health Check
// ==========================================

/**
 * GET /api/v2/devops/health
 * DevOps service health check - checks both local and Python service
 */
router.get('/health', async (req: Request, res: Response) => {
  const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8003';

  let pythonHealthy = false;
  try {
    const pythonRes = await axios.get(`${pythonUrl}/health`, { timeout: 3000 });
    pythonHealthy = pythonRes.status === 200;
  } catch {
    pythonHealthy = false;
  }

  res.json({
    status: 'ok',
    python_service: pythonHealthy ? 'online' : 'offline',
    python_url: pythonUrl,
    tenant_id: process.env.TENANT_ID || 'lsemb',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// SSH Key Management
// ==========================================

/**
 * POST /api/v2/devops/ssh/encrypt-key
 * Encrypt an SSH private key for storage
 */
router.post('/ssh/encrypt-key', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/ssh/encrypt-key', 'POST');
});

/**
 * POST /api/v2/devops/ssh/decrypt-key
 * Decrypt an SSH private key
 */
router.post('/ssh/decrypt-key', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/ssh/decrypt-key', 'POST');
});

/**
 * POST /api/v2/devops/ssh/fingerprint
 * Get SSH key fingerprint
 */
router.post('/ssh/fingerprint', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/ssh/fingerprint', 'POST');
});

// ==========================================
// SSH Connection
// ==========================================

/**
 * POST /api/v2/devops/ssh/test
 * Test SSH connection to a server
 */
router.post('/ssh/test', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/ssh/test', 'POST');
});

/**
 * POST /api/v2/devops/ssh/execute
 * Execute command on remote server
 * Falls back to local shell execution when Python service unavailable
 */
router.post('/ssh/execute', async (req: Request, res: Response) => {
  const { execSync } = require('child_process');
  const os = require('os');
  const { command } = req.body;

  console.log(`[DevOps] SSH Execute request - Command: ${command?.substring(0, 100)}...`);

  if (!command) {
    console.log('[DevOps] SSH Execute - No command provided');
    return res.status(400).json({ success: false, error: 'Command is required' });
  }

  // Whitelist: Safe commands that should always be allowed
  const safeCommandPatterns = [
    /^tail\s+-n\s+\d+\s+\/root\/\.pm2\/logs\//,  // PM2 log reading
    /^cat\s+\/root\/\.pm2\/logs\//,              // PM2 log cat
    /^pm2\s+(list|jlist|status|logs)/,           // PM2 status commands
    /^git\s+(status|log|branch|pull)/,           // Git read commands
    /^df\s+-h/,                                   // Disk usage
    /^free\s+-/,                                  // Memory usage
    /^uptime/,                                    // Uptime
    /^systemctl\s+status/,                        // Service status
    /^nginx\s+-t/,                                // Nginx test config
  ];

  // Check if command matches safe patterns (skip security check)
  const isSafeCommand = safeCommandPatterns.some(pattern => pattern.test(command));

  if (isSafeCommand) {
    console.log('[DevOps] SSH Execute - Command whitelisted as safe');
  } else {
    // Security: Block dangerous commands (only for non-whitelisted commands)
    const dangerousPatterns = [
      /rm\s+-rf\s+\/(?!var\/www)/,  // rm -rf / (except /var/www)
      /mkfs/,
      /dd\s+if=/,
      />\s*\/dev\//,
      /chmod\s+777\s+\//,
      /wget.*\|\s*sh/,
      /curl.*\|\s*sh/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        console.log(`[DevOps] SSH Execute - Command BLOCKED by pattern: ${pattern}`);
        return res.status(403).json({
          success: false,
          error: 'Command blocked for security reasons'
        });
      }
    }
  }

  try {
    // First try Python service (for production/SSH)
    console.log(`[DevOps] Trying Python service at ${DEVOPS_BASE}/ssh/execute`);
    const response = await axios.post(`${DEVOPS_BASE}/ssh/execute`, { command }, {
      timeout: 60000,
      headers: { 'X-API-Key': process.env.INTERNAL_API_KEY || '' }
    });
    console.log('[DevOps] Python service responded successfully');
    res.json(response.data);
  } catch (proxyError: any) {
    // Log the error from Python service
    console.log(`[DevOps] Python service error: ${proxyError.code || proxyError.message}`);
    if (proxyError.response) {
      console.log(`[DevOps] Python response status: ${proxyError.response.status}`);
    }

    // Fallback: Local execution (works in both dev and production)
    // This allows basic commands to work even without Python service
    const isWindows = os.platform() === 'win32';
    console.log(`[DevOps] Falling back to local execution (platform: ${isWindows ? 'Windows' : 'Linux'})`);

    // Adapt command for platform
    let adaptedCommand = command;
    if (isWindows) {
      // Convert Linux pipe commands to Windows-compatible versions
      // Remove Linux-specific redirections that don't work on Windows
      adaptedCommand = command
        .replace(/\s+2>&1\s*/g, ' ')      // Remove stderr redirect
        .replace(/\|\s*tail\s+-\d+/g, '')  // Remove tail pipe
        .replace(/\|\s*head\s+-\d+/g, '')  // Remove head pipe
        .replace(/--nostream\s*/g, '');    // Remove pm2 nostream (not needed locally)
    }

    try {
      // Execute locally as fallback
      console.log(`[DevOps] Executing locally: ${adaptedCommand.substring(0, 80)}...`);

      const execOptions: any = {
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        cwd: process.env.PROJECT_ROOT || process.cwd()
      };

      // Use shell for Linux commands
      if (!isWindows) {
        execOptions.shell = '/bin/bash';
      } else {
        execOptions.shell = true;
      }

      const output = execSync(adaptedCommand, execOptions);

      console.log(`[DevOps] Local execution successful, output length: ${output?.length || 0}`);
      res.json({
        success: true,
        output: output || '(no output)',
        source: 'local',
        warning: 'Executed locally. Python DevOps service is not running.'
      });
    } catch (execError: any) {
      // Command failed but executed
      console.log(`[DevOps] Local execution failed: ${execError.message}`);
      res.json({
        success: false,
        output: execError.stdout || '',
        error: execError.stderr || execError.message,
        exitCode: execError.status,
        source: 'local'
      });
    }
  }
});

// ==========================================
// Security Scanner
// ==========================================

/**
 * POST /api/v2/devops/security/scan
 * Run security scan on server
 */
router.post('/security/scan', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/security/scan', 'POST');
});

/**
 * POST /api/v2/devops/security/auto-fix
 * Apply auto-fix for a security finding
 */
router.post('/security/auto-fix', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/security/auto-fix', 'POST');
});

/**
 * GET /api/v2/devops/security/playbooks
 * List available auto-fix playbooks
 */
router.get('/security/playbooks', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/security/playbooks', 'GET');
});

/**
 * GET /api/v2/devops/security/bruteforce
 * Get brute force detection statistics
 */
router.get('/security/bruteforce', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/security/bruteforce', 'GET');
});

/**
 * POST /api/v2/devops/security/bruteforce/check
 * Parse SSH logs for brute force attempts
 */
router.post('/security/bruteforce/check', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/security/bruteforce/check', 'POST');
});

// ==========================================
// Deployment
// ==========================================

/**
 * POST /api/v2/devops/deploy
 * Deploy updates to a tenant
 */
router.post('/deploy', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/deploy', 'POST');
});

/**
 * POST /api/v2/devops/deploy/clear-cache
 * Clear Next.js cache for a tenant
 */
router.post('/deploy/clear-cache', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/deploy/clear-cache', 'POST');
});

/**
 * POST /api/v2/devops/deploy/git-status
 * Get git status for a tenant
 */
router.post('/deploy/git-status', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/deploy/git-status', 'POST');
});

/**
 * POST /api/v2/devops/deploy/pm2-status
 * Get PM2 service status
 */
router.post('/deploy/pm2-status', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/deploy/pm2-status', 'POST');
});

/**
 * GET /api/v2/devops/deployments/:tenantId
 * Get deployment history for a tenant
 */
router.get('/deployments/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  await proxyToPython(req, res, `/deployments/${tenantId}`, 'GET');
});

/**
 * GET /api/v2/devops/deployments/status/:deployId
 * Get status of a specific deployment
 */
router.get('/deployments/status/:deployId', async (req: Request, res: Response) => {
  const { deployId } = req.params;
  await proxyToPython(req, res, `/deployments/status/${deployId}`, 'GET');
});

// ==========================================
// Monitoring & Metrics
// ==========================================

/**
 * POST /api/v2/devops/monitor/metrics
 * Collect server metrics
 */
router.post('/monitor/metrics', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/monitor/metrics', 'POST');
});

/**
 * GET /api/v2/devops/monitor/metrics/:serverId
 * Get stored metrics for a server
 */
router.get('/monitor/metrics/:serverId', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  await proxyToPython(req, res, `/monitor/metrics/${serverId}`, 'GET');
});

/**
 * POST /api/v2/devops/monitor/services
 * Collect PM2 service status
 */
router.post('/monitor/services', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/monitor/services', 'POST');
});

/**
 * GET /api/v2/devops/monitor/services/:serverId
 * Get stored service status
 */
router.get('/monitor/services/:serverId', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  await proxyToPython(req, res, `/monitor/services/${serverId}`, 'GET');
});

// ==========================================
// Alerts
// ==========================================

/**
 * GET /api/v2/devops/alerts
 * Get all active alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/alerts', 'GET');
});

/**
 * POST /api/v2/devops/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  const { alertId } = req.params;
  await proxyToPython(req, res, `/alerts/${alertId}/acknowledge`, 'POST');
});

// ==========================================
// Self-Management (Tenant Isolation Mode)
// ==========================================

/**
 * GET /api/v2/devops/config
 * Get current tenant configuration from environment
 * Returns local config, doesn't require Python service
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const tenantId = process.env.TENANT_ID || 'lsemb';
    const appName = process.env.APP_NAME || process.env.NEXT_PUBLIC_APP_NAME || tenantId;

    // Build service names based on tenant ID
    const services = {
      backend: `${tenantId}-backend`,
      frontend: `${tenantId}-frontend`,
      python: `${tenantId}-python`
    };

    // Get ports from env or use defaults
    const ports = {
      backend: parseInt(process.env.PORT || '8087'),
      frontend: parseInt(process.env.FRONTEND_PORT || '4003'),
      python: parseInt(process.env.PYTHON_SERVICE_URL?.split(':').pop() || '8003')
    };

    // Build paths
    const basePath = process.env.APP_PATH || `/var/www/${tenantId}`;
    const paths = {
      root: basePath,
      backend: `${basePath}/backend`,
      frontend: `${basePath}/frontend`,
      python: `${basePath}/backend/python-services`,
      logs: `/root/.pm2/logs`
    };

    // Get URLs
    const domain = process.env.DOMAIN || process.env.NEXT_PUBLIC_API_URL?.replace(/https?:\/\//, '').replace(/\/.*$/, '') || `${tenantId}.luwi.dev`;
    const urls = {
      frontend: `https://${domain}`,
      backend: `https://${domain}/api`,
      api: process.env.NEXT_PUBLIC_API_URL || `https://${domain}`
    };

    res.json({
      success: true,
      config: {
        tenantId,
        appName,
        services,
        ports,
        paths,
        urls,
        environment: process.env.NODE_ENV || 'development',
        redisDb: parseInt(process.env.REDIS_DB || '0'),
        pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:8003'
      }
    });
  } catch (error) {
    console.error('[DevOps] Config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration',
      message: String(error)
    });
  }
});

/**
 * POST /api/v2/devops/self/deploy
 * Deploy this tenant (self-service)
 */
router.post('/self/deploy', async (req: Request, res: Response) => {
  const deployType = req.query.deploy_type || 'full';
  await proxyToPython(req, res, `/self/deploy?deploy_type=${deployType}`, 'POST');
});

/**
 * POST /api/v2/devops/self/nginx/reload
 * Reload Nginx configuration
 */
router.post('/self/nginx/reload', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/self/nginx/reload', 'POST');
});

/**
 * POST /api/v2/devops/self/nginx/test
 * Test Nginx configuration
 */
router.post('/self/nginx/test', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/self/nginx/test', 'POST');
});

/**
 * GET /api/v2/devops/self/pm2/status
 * Get PM2 status for this tenant
 * Falls back to local execution if Python service unavailable
 */
router.get('/self/pm2/status', async (req: Request, res: Response) => {
  const { execSync } = require('child_process');
  const os = require('os');

  try {
    // First try Python service
    const response = await axios.get(`${DEVOPS_BASE}/self/pm2/status`, {
      timeout: 5000,
      headers: { 'X-API-Key': process.env.INTERNAL_API_KEY || '' }
    });
    res.json(response.data);
  } catch (proxyError) {
    // Fallback: Try local PM2 execution
    const isWindows = os.platform() === 'win32';

    try {
      // Platform-specific PM2 command
      const pm2Command = isWindows ? 'pm2 jlist' : 'pm2 jlist 2>/dev/null || echo "[]"';
      const pm2Output = execSync(pm2Command, {
        encoding: 'utf-8',
        timeout: 10000,
        shell: isWindows ? true : undefined
      });

      const processes = JSON.parse(pm2Output || '[]');
      const services = processes.map((proc: any) => ({
        name: proc.name,
        status: proc.pm2_env?.status || 'unknown',
        cpu: proc.monit?.cpu || 0,
        memory: proc.monit?.memory || 0,
        restarts: proc.pm2_env?.restart_time || 0,
        uptime: proc.pm2_env?.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0
      }));

      res.json({ success: true, services, source: 'local' });
    } catch (localError) {
      // PM2 not available or not running
      res.json({
        success: false,
        services: [],
        error: 'PM2 not available. Python service is not running and local PM2 is not accessible.',
        hint: 'Start Python service with: cd backend/python-services && python main.py'
      });
    }
  }
});

/**
 * POST /api/v2/devops/self/pm2/restart/:service
 * Restart PM2 service (backend, frontend, python, or all)
 */
router.post('/self/pm2/restart/:service', async (req: Request, res: Response) => {
  const { service } = req.params;
  await proxyToPython(req, res, `/self/pm2/restart/${service}`, 'POST');
});

/**
 * GET /api/v2/devops/self/metrics
 * Get server metrics for this tenant
 * Falls back to local Node.js metrics if Python service unavailable
 */
router.get('/self/metrics', async (req: Request, res: Response) => {
  const os = require('os');

  try {
    // First try Python service
    const response = await axios.get(`${DEVOPS_BASE}/self/metrics`, {
      timeout: 5000,
      headers: { 'X-API-Key': process.env.INTERNAL_API_KEY || '' }
    });
    res.json(response.data);
  } catch (proxyError) {
    // Fallback: Use Node.js os module for basic metrics
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const loadAvg = os.loadavg();
      const uptime = os.uptime();

      // Calculate CPU usage (approximate)
      const cpuUsage = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total) * 100;
      }, 0) / cpus.length;

      const metrics = {
        cpu: `${cpuUsage.toFixed(1)}%`,
        ram: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB (${((usedMem / totalMem) * 100).toFixed(1)}%)`,
        disk: 'N/A (local mode)',
        load: loadAvg.map(l => l.toFixed(2)).join(', '),
        uptime: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        platform: `${os.platform()} ${os.release()}`,
        hostname: os.hostname()
      };

      res.json({ success: true, metrics, source: 'local' });
    } catch (localError) {
      res.status(500).json({
        success: false,
        error: 'Failed to get metrics',
        message: String(localError)
      });
    }
  }
});

/**
 * POST /api/v2/devops/self/security/scan
 * Run security scan on this tenant
 */
router.post('/self/security/scan', async (req: Request, res: Response) => {
  const scanType = req.query.scan_type || 'quick';
  await proxyToPython(req, res, `/self/security/scan?scan_type=${scanType}`, 'POST');
});

export default router;
