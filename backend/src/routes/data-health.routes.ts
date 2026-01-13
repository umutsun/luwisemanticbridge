/**
 * Data Health Routes - Veri Sağlığı API
 * Python data-health servisine proxy yapar
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

const router = Router();

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8003';

/**
 * GET /api/data-health/report
 * Veri sağlığı raporu al
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/api/python/data-health/report`, {
      timeout: 60000,
    });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health report error:', error.message);
    res.status(500).json({
      error: error.message || 'Python service unreachable',
      details: error.response?.data,
    });
  }
});

/**
 * GET /api/data-health/tables
 * Embedded tablo listesi
 */
router.get('/tables', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/api/python/data-health/tables`, {
      timeout: 30000,
    });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health tables error:', error.message);
    res.status(500).json({
      error: error.message || 'Python service unreachable',
    });
  }
});

/**
 * GET /api/data-health/table/:tableName/stats
 * Tek tablo istatistikleri
 */
router.get('/table/:tableName/stats', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const response = await axios.get(
      `${PYTHON_SERVICE_URL}/api/python/data-health/table/${tableName}/stats`,
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health table stats error:', error.message);
    res.status(500).json({
      error: error.message || 'Python service unreachable',
    });
  }
});

/**
 * POST /api/data-health/quick-fix/:tableName
 * Hızlı düzeltme: orphans + duplicates + metadata
 */
router.post('/quick-fix/:tableName', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    const dryRun = req.query.dry_run !== 'false';

    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/data-health/quick-fix/${tableName}?dry_run=${dryRun}`,
      {},
      { timeout: 120000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health quick-fix error:', error.message);
    res.status(500).json({
      error: error.message || 'Operation failed',
    });
  }
});

/**
 * POST /api/data-health/fix-metadata
 * Eksik metadata düzelt
 */
router.post('/fix-metadata', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/data-health/fix-metadata`,
      req.body,
      { timeout: 120000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health fix-metadata error:', error.message);
    res.status(500).json({
      error: error.message || 'Operation failed',
    });
  }
});

/**
 * POST /api/data-health/delete-orphans
 * Orphan kayıtları sil
 */
router.post('/delete-orphans', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/data-health/delete-orphans`,
      req.body,
      { timeout: 120000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health delete-orphans error:', error.message);
    res.status(500).json({
      error: error.message || 'Operation failed',
    });
  }
});

/**
 * POST /api/data-health/delete-duplicates
 * Duplicate kayıtları sil
 */
router.post('/delete-duplicates', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/data-health/delete-duplicates`,
      req.body,
      { timeout: 120000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health delete-duplicates error:', error.message);
    res.status(500).json({
      error: error.message || 'Operation failed',
    });
  }
});

/**
 * GET /api/data-health/pending-embeddings
 * Henüz embed edilmemiş kayıtları bul
 */
router.get('/pending-embeddings', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${PYTHON_SERVICE_URL}/api/python/data-health/pending-embeddings`,
      { timeout: 60000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health pending-embeddings error:', error.message);
    res.status(500).json({
      error: error.message || 'Python service unreachable',
    });
  }
});

/**
 * GET /api/data-health/queue-status
 * Embedding kuyruk durumu
 */
router.get('/queue-status', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${PYTHON_SERVICE_URL}/api/python/data-health/queue-status`,
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health queue-status error:', error.message);
    res.status(500).json({
      error: error.message || 'Python service unreachable',
    });
  }
});

/**
 * POST /api/data-health/reset-stuck
 * Takılmış işleri resetle
 */
router.post('/reset-stuck', async (req: Request, res: Response) => {
  try {
    const dryRun = req.query.dry_run !== 'false';
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/data-health/reset-stuck?dry_run=${dryRun}`,
      {},
      { timeout: 60000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health reset-stuck error:', error.message);
    res.status(500).json({
      error: error.message || 'Operation failed',
    });
  }
});

/**
 * POST /api/data-health/optimize
 * Tek tıkla veri optimizasyonu
 */
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    const dryRun = req.query.dry_run !== 'false';
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/data-health/optimize?dry_run=${dryRun}`,
      {},
      { timeout: 300000 } // 5 dakika timeout
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Data health optimize error:', error.message);
    res.status(500).json({
      error: error.message || 'Operation failed',
    });
  }
});

export default router;
