import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { getWebSocketLogStreamService } from '../services/websocket-log-stream.service';
import { initializeConsoleLogService } from '../services/console-log.service';
import Redis from 'ioredis';

const router = Router();

// Store WebSocket server instance
let wss: WebSocketServer | null = null;
let server: any = null;

// Initialize WebSocket server
router.post('/start', async (req, res) => {
    try {
        if (wss) {
            return res.json({
                success: false,
                message: 'WebSocket server already running',
                port: process.env.WS_LOG_STREAM_PORT || 8084
            });
        }

        const port = process.env.WS_LOG_STREAM_PORT || 8084;

        // Create HTTP server for WebSocket
        server = createServer();
        wss = new WebSocketServer({
            server,
            path: '/ws/logs',
            perMessageDeflate: false
        });

        // Initialize Redis connection for console log service
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });

        // Initialize console log service
        const consoleLogService = initializeConsoleLogService(redis);

        // Initialize WebSocket log stream service
        const wsLogStreamService = getWebSocketLogStreamService({
            maxClients: 50,
            heartbeatInterval: 30000,
            clientTimeout: 60000,
            bufferSize: 1000
        });

        wsLogStreamService.initialize(wss, consoleLogService);

        // Start the server
        server.listen(port, () => {
            console.log(`🔌 WebSocket Log Stream Server started on port ${port}`);
            console.log(`📡 WebSocket endpoint: ws://localhost:${port}/ws/logs`);
        });

        // Handle server errors
        server.on('error', (error: any) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`Port ${port} is already in use`);
            } else {
                console.error('WebSocket server error:', error);
            }
        });

        res.json({
            success: true,
            message: 'WebSocket server started successfully',
            port,
            endpoint: `ws://localhost:${port}/ws/logs`
        });

    } catch (error) {
        console.error('Failed to start WebSocket server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start WebSocket server',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Stop WebSocket server
router.post('/stop', async (req, res) => {
    try {
        if (!wss) {
            return res.json({
                success: false,
                message: 'WebSocket server is not running'
            });
        }

        // Shutdown the service
        const wsLogStreamService = getWebSocketLogStreamService();
        wsLogStreamService.shutdown();

        // Close WebSocket server
        wss.close();

        // Close HTTP server
        if (server) {
            server.close();
        }

        wss = null;
        server = null;

        console.log('🔌 WebSocket Log Stream Server stopped');

        res.json({
            success: true,
            message: 'WebSocket server stopped successfully'
        });

    } catch (error) {
        console.error('Failed to stop WebSocket server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop WebSocket server',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Get WebSocket server status
router.get('/status', async (req, res) => {
    try {
        const wsLogStreamService = getWebSocketLogStreamService();
        const stats = wsLogStreamService.getStats();

        res.json({
            success: true,
            status: wss ? 'running' : 'stopped',
            port: process.env.WS_LOG_STREAM_PORT || 8084,
            endpoint: `ws://localhost:${process.env.WS_LOG_STREAM_PORT || 8084}/ws/logs`,
            stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Failed to get WebSocket server status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get WebSocket server status',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Broadcast message to all connected clients
router.post('/broadcast', async (req, res) => {
    try {
        const { message, type = 'custom' } = req.body;

        if (!wss) {
            return res.status(400).json({
                success: false,
                message: 'WebSocket server is not running'
            });
        }

        const wsLogStreamService = getWebSocketLogStreamService();
        wsLogStreamService.broadcastToAll({
            type,
            data: message,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Message broadcasted successfully',
            clientsCount: wsLogStreamService.getStats().connectedClients
        });

    } catch (error) {
        console.error('Failed to broadcast message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to broadcast message',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;