/**
 * Scheduler Routes - Proxy to Python FastAPI Scheduler Service
 *
 * This router proxies all scheduler requests to the Python service
 * which handles APScheduler-based job scheduling.
 */

import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';

const router = Router();

// Python service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_API_URL || 'http://localhost:8089';

/**
 * Proxy helper function
 */
async function proxyToPython(req: Request, res: Response, path: string) {
    try {
        const url = `${PYTHON_SERVICE_URL}/api/python/scheduler${path}`;

        logger.debug(`Proxying ${req.method} ${path} to ${url}`);

        const response = await axios({
            method: req.method as any,
            url,
            data: req.body,
            params: req.query,
            headers: {
                'Content-Type': 'application/json',
                // Forward auth headers if present
                ...(req.headers.authorization && { Authorization: req.headers.authorization }),
            },
            timeout: 30000, // 30 second timeout
        });

        res.status(response.status).json(response.data);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            if (axiosError.response) {
                res.status(axiosError.response.status).json(axiosError.response.data);
            } else if (axiosError.code === 'ECONNREFUSED') {
                logger.error('Python scheduler service unavailable');
                res.status(503).json({
                    error: 'Scheduler service unavailable',
                    detail: 'Python scheduler service is not running',
                });
            } else {
                logger.error('Scheduler proxy error:', axiosError.message);
                res.status(500).json({
                    error: 'Scheduler proxy error',
                    detail: axiosError.message,
                });
            }
        } else {
            logger.error('Unknown scheduler error:', error);
            res.status(500).json({
                error: 'Internal server error',
            });
        }
    }
}

// =====================================================
// Health & Stats
// =====================================================

/**
 * GET /api/v2/scheduler/health
 * Check scheduler service health
 */
router.get('/health', (req, res) => proxyToPython(req, res, '/health'));

/**
 * GET /api/v2/scheduler/stats
 * Get scheduler statistics
 */
router.get('/stats', (req, res) => proxyToPython(req, res, '/stats'));

// =====================================================
// Job CRUD
// =====================================================

/**
 * GET /api/v2/scheduler/jobs
 * List all scheduled jobs
 */
router.get('/jobs', (req, res) => proxyToPython(req, res, '/jobs'));

/**
 * POST /api/v2/scheduler/jobs
 * Create a new scheduled job
 */
router.post('/jobs', (req, res) => proxyToPython(req, res, '/jobs'));

/**
 * GET /api/v2/scheduler/jobs/:jobId
 * Get a specific scheduled job
 */
router.get('/jobs/:jobId', (req, res) => proxyToPython(req, res, `/jobs/${req.params.jobId}`));

/**
 * PATCH /api/v2/scheduler/jobs/:jobId
 * Update a scheduled job
 */
router.patch('/jobs/:jobId', (req, res) => proxyToPython(req, res, `/jobs/${req.params.jobId}`));

/**
 * DELETE /api/v2/scheduler/jobs/:jobId
 * Delete a scheduled job
 */
router.delete('/jobs/:jobId', (req, res) => proxyToPython(req, res, `/jobs/${req.params.jobId}`));

// =====================================================
// Job Actions
// =====================================================

/**
 * POST /api/v2/scheduler/jobs/:jobId/toggle
 * Enable/disable a job
 */
router.post('/jobs/:jobId/toggle', (req, res) => proxyToPython(req, res, `/jobs/${req.params.jobId}/toggle`));

/**
 * POST /api/v2/scheduler/jobs/:jobId/run-now
 * Trigger immediate job execution
 */
router.post('/jobs/:jobId/run-now', (req, res) => proxyToPython(req, res, `/jobs/${req.params.jobId}/run-now`));

/**
 * GET /api/v2/scheduler/jobs/:jobId/logs
 * Get execution logs for a job
 */
router.get('/jobs/:jobId/logs', (req, res) => proxyToPython(req, res, `/jobs/${req.params.jobId}/logs`));

// =====================================================
// Quick Create Endpoints
// =====================================================

/**
 * POST /api/v2/scheduler/quick/crawler
 * Quick create a crawler scheduled job
 */
router.post('/quick/crawler', (req, res) => proxyToPython(req, res, '/quick/crawler'));

/**
 * POST /api/v2/scheduler/quick/cleanup
 * Quick create a cleanup scheduled job
 */
router.post('/quick/cleanup', (req, res) => proxyToPython(req, res, '/quick/cleanup'));

/**
 * POST /api/v2/scheduler/quick/embedding-sync
 * Quick create an embedding sync scheduled job
 */
router.post('/quick/embedding-sync', (req, res) => proxyToPython(req, res, '/quick/embedding-sync'));

// =====================================================
// Cron Helpers
// =====================================================

/**
 * GET /api/v2/scheduler/cron-examples
 * Get common cron expression examples
 */
router.get('/cron-examples', (req, res) => proxyToPython(req, res, '/cron-examples'));

/**
 * POST /api/v2/scheduler/cron-validate
 * Validate a cron expression
 */
router.post('/cron-validate', (req, res) => proxyToPython(req, res, '/cron-validate'));

export default router;
