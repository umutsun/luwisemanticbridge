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
// Health Check
// ==========================================

/**
 * GET /api/v2/devops/health
 * DevOps service health check
 */
router.get('/health', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/health', 'GET');
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
 */
router.post('/ssh/execute', async (req: Request, res: Response) => {
  await proxyToPython(req, res, '/ssh/execute', 'POST');
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

export default router;
