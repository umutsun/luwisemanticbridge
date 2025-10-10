import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { loggerService } from '../utils/logger.service';
import { frontendLogBridge } from '../utils/frontend-log-bridge';

const router = Router();

// WebSocket endpoint for real-time logs
let logWss: WebSocketServer | null = null;

export function initializeLogWebSocket(wss: WebSocketServer) {
  logWss = wss;
  loggerService.setWebSocketServer(wss);
}

// Get current logging configuration
router.get('/config', async (req, res) => {
  try {
    const config = loggerService.getConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Failed to get logging configuration:', error);
    res.status(500).json({
      error: 'Failed to get logging configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update logging configuration
router.put('/config', async (req, res) => {
  try {
    const { level, file, maxSize, maxFiles } = req.body;

    await loggerService.updateConfig({
      level: level || 'info',
      file: file || 'logs/asb.log',
      maxSize: maxSize || '10m',
      maxFiles: maxFiles || 5
    });

    const updatedConfig = loggerService.getConfig();

    res.json({
      success: true,
      message: 'Logging configuration updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    console.error('Failed to update logging configuration:', error);
    res.status(500).json({
      error: 'Failed to update logging configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test log endpoint
router.post('/test', async (req, res) => {
  try {
    const { level, message } = req.body;

    switch (level) {
      case 'error':
        loggerService.error(message || 'Test error message', { test: true });
        break;
      case 'warn':
        loggerService.warn(message || 'Test warning message', { test: true });
        break;
      case 'debug':
        loggerService.debug(message || 'Test debug message', { test: true });
        break;
      default:
        loggerService.info(message || 'Test info message', { test: true });
    }

    res.json({
      success: true,
      message: `Test log sent with level: ${level || 'info'}`
    });
  } catch (error) {
    console.error('Failed to send test log:', error);
    res.status(500).json({
      error: 'Failed to send test log',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Frontend log submission endpoint
router.post('/frontend', frontendLogBridge);

// Stream all logs endpoint
router.get('/stream', async (req, res) => {
  try {
    const { limit = 100, level, source } = req.query;

    // This would typically read from log files or database
    // For now, we'll return recent logs from memory
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write('data: {"type": "connected"}\n\n');

    // Store the response for streaming
    const clients = (req as any).streamClients || [];
    clients.push(res);
    (req as any).streamClients = clients;

    // Handle client disconnect
    req.on('close', () => {
      const index = clients.indexOf(res);
      if (index > -1) {
        clients.splice(index, 1);
      }
    });
  } catch (error) {
    console.error('Failed to set up log stream:', error);
    res.status(500).json({ error: 'Failed to set up log stream' });
  }
});

export default router;