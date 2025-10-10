import { Request, Response } from 'express';
import { loggerService } from './logger.service';

// Middleware to capture frontend logs sent via HTTP
export function frontendLogBridge(req: Request, res: Response) {
  try {
    const { logs } = req.body;

    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: 'Logs must be an array' });
    }

    // Process each log from frontend
    logs.forEach((log: any) => {
      const { level, message, source, service, metadata, stack } = log;

      // Create a unified log entry
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: level || 'info',
        message: message || '',
        source: source || 'frontend',
        service: service || 'browser',
        metadata: metadata,
        stack: stack
      };

      // Send to WebSocket clients
      const logWss = (req as any).logWss;
      if (logWss && logWss.clients) {
        logWss.clients.forEach((client: any) => {
          if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({
              type: 'log',
              ...logEntry
            }));
          }
        });
      }

      // Also log to backend logger
      switch (level) {
        case 'error':
          loggerService.error(`[Frontend] ${message}`, { ...metadata, source: 'frontend' });
          break;
        case 'warn':
          loggerService.warn(`[Frontend] ${message}`, { ...metadata, source: 'frontend' });
          break;
        case 'debug':
          loggerService.debug(`[Frontend] ${message}`, { ...metadata, source: 'frontend' });
          break;
        default:
          loggerService.info(`[Frontend] ${message}`, { ...metadata, source: 'frontend' });
      }
    });

    res.json({ success: true, message: 'Logs received' });
  } catch (error) {
    console.error('Error processing frontend logs:', error);
    res.status(500).json({ error: 'Failed to process logs' });
  }
}

// Create a route handler for frontend log submissions
export function createFrontendLogRoute() {
  return frontendLogBridge;
}