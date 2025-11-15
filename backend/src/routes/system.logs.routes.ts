import { Router } from 'express';
import { getConsoleLogService, ConsoleLogEntry } from '../services/console-log.service';

const router = Router();
const clients = new Map<string, any>(); // Store SSE connections

// Get console log service instance
let consoleLogService = getConsoleLogService();

// System log streaming endpoint (SSE)
router.get('/stream', (req, res) => {
  const clientId = Date.now().toString();

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Connected to system logs'
  })}\n\n`);

  // Store client connection
  clients.set(clientId, res);

  // Set up console log service listener
  if (consoleLogService) {
    const onLog = (logEntry: ConsoleLogEntry) => {
      if (clients.has(clientId)) {
        res.write(`data: ${JSON.stringify({
          type: logEntry.level,
          timestamp: logEntry.timestamp,
          message: logEntry.message,
          service: logEntry.service
        })}\n\n`);
      }
    };

    consoleLogService.on('log', onLog);

    // Clean up on disconnect
    req.on('close', () => {
      clients.delete(clientId);
      consoleLogService?.off('log', onLog);
      console.log(' System log client disconnected');
    });

    // Send some initial logs
    (async () => {
      if (consoleLogService) {
        const recentLogs = await consoleLogService.getRecentLogs(20);
        recentLogs.forEach(log => {
          res.write(`data: ${JSON.stringify({
            type: log.level,
            timestamp: log.timestamp,
            message: log.message,
            service: log.service
          })}\n\n`);
        });
      }
    })();
  } else {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: 'Console log service not initialized'
    })}\n\n`);
  }

  // Ping every 30 seconds to keep connection alive
  const pingInterval = setInterval(() => {
    if (clients.has(clientId)) {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\n\n`);
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
});

// Get recent logs
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string;

    let logs: ConsoleLogEntry[] = [];

    if (consoleLogService) {
      logs = await consoleLogService.getRecentLogs(limit);

      // Filter by level if specified
      if (level) {
        logs = logs.filter(log => log.level === level);
      }
    }

    res.json({
      success: true,
      data: logs,
      total: logs.length
    });
  } catch (error: any) {
    console.error('Failed to get recent logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get log statistics
router.get('/stats', async (req, res) => {
  try {
    if (!consoleLogService) {
      return res.json({
        success: true,
        data: {
          total: 0,
          byLevel: { info: 0, warn: 0, error: 0, debug: 0 },
          recentByHour: {}
        }
      });
    }

    const stats = await consoleLogService.getLogStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Failed to get log stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear logs
router.delete('/clear', async (req, res) => {
  try {
    if (!consoleLogService) {
      return res.status(503).json({
        success: false,
        error: 'Console log service not available'
      });
    }

    await consoleLogService.clearLogs();

    res.json({
      success: true,
      message: 'Logs cleared successfully'
    });
  } catch (error: any) {
    console.error('Failed to clear logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add custom log
router.post('/add', async (req, res) => {
  try {
    const { level, message, service = 'user' } = req.body;

    if (!level || !message) {
      return res.status(400).json({
        success: false,
        error: 'Level and message are required'
      });
    }

    if (!consoleLogService) {
      return res.status(503).json({
        success: false,
        error: 'Console log service not available'
      });
    }

    await consoleLogService.addCustomLog({
      level,
      message,
      service
    });

    res.json({
      success: true,
      message: 'Log added successfully'
    });
  } catch (error: any) {
    console.error('Failed to add custom log:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Backend health check with logs
router.get('/health', async (req, res) => {
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    logs: {
      streaming: true,
      connectedClients: clients.size,
      serviceInitialized: !!consoleLogService
    }
  };

  res.json(healthData);
});

export default router;