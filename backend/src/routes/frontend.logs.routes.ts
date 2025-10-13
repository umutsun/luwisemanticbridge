import { Router } from 'express';
import { getConsoleLogService } from '../services/console-log.service';

const router = Router();

// Store frontend logs via API
router.post('/log', async (req, res) => {
  try {
    const { level, message, source, timestamp, metadata } = req.body;

    if (!level || !message) {
      return res.status(400).json({
        success: false,
        error: 'Level and message are required'
      });
    }

    const consoleLogService = getConsoleLogService();

    if (consoleLogService) {
      await consoleLogService.addCustomLog({
        level: level,
        message: message,
        service: source || 'frontend',
        metadata: {
          ...metadata,
          source: 'browser'
        }
      });
    }

    res.json({
      success: true,
      message: 'Frontend log received'
    });
  } catch (error: any) {
    console.error('Failed to store frontend log:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch store multiple frontend logs
router.post('/batch', async (req, res) => {
  try {
    const { logs } = req.body;

    if (!Array.isArray(logs)) {
      return res.status(400).json({
        success: false,
        error: 'Logs must be an array'
      });
    }

    const consoleLogService = getConsoleLogService();

    if (consoleLogService) {
      for (const log of logs) {
        await consoleLogService.addCustomLog({
          level: log.level,
          message: log.message,
          service: log.source || 'frontend',
          metadata: {
            ...log.metadata,
            source: 'browser'
          }
        });
      }
    }

    res.json({
      success: true,
      message: `${logs.length} logs stored`
    });
  } catch (error: any) {
    console.error('Failed to store frontend logs batch:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;