/**
 * Document Optimization Routes
 * Python doc-optimization servisine proxy yapar
 * OCR artifact cleanup in document_embeddings
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

const router = Router();

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8003';
const BASE = `${PYTHON_SERVICE_URL}/api/python/doc-optimization`;

/**
 * GET /api/doc-optimization/status
 * Get current operation status & progress
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${BASE}/status`, { timeout: 10000 });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Doc optimization status error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

/**
 * POST /api/doc-optimization/analyze/start
 * Start analysis scan
 */
router.post('/analyze/start', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${BASE}/analyze/start`, {}, { timeout: 30000 });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Doc optimization analyze error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.detail || error.message,
    });
  }
});

/**
 * POST /api/doc-optimization/optimize/start
 * Start OCR fix optimization
 */
router.post('/optimize/start', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${BASE}/optimize/start`, req.body, { timeout: 30000 });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Doc optimization optimize error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.detail || error.message,
    });
  }
});

/**
 * POST /api/doc-optimization/re-embed/start
 * Start re-embedding for records with NULL vectors
 */
router.post('/re-embed/start', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${BASE}/re-embed/start`, req.body, { timeout: 30000 });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Doc optimization re-embed error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.detail || error.message,
    });
  }
});

/**
 * POST /api/doc-optimization/pause
 */
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${BASE}/pause`, {}, { timeout: 10000 });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/doc-optimization/resume
 */
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${BASE}/resume`, {}, { timeout: 10000 });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/doc-optimization/stop
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${BASE}/stop`, {}, { timeout: 10000 });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
