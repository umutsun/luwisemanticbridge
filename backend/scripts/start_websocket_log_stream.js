#!/usr/bin/env node

/**
 * WebSocket Log Stream Startup Script
 * 
 * This script starts the WebSocket log stream service
 * and initializes it with the main server.
 */

const { WebSocketServer } = require('ws');
const http = require('http');

const WS_PORT = 8084;
const HTTP_PORT = 8083;

// Import the service
let WebSocketLogStreamService;
try {
    WebSocketLogStreamService = require('../src/services/websocket-log-stream.service.js').getWebSocketLogStreamService;
} catch (error) {
    console.error('Failed to import WebSocketLogStreamService:', error);
    process.exit(1);
}

// Import ConsoleLogService
let ConsoleLogService;
let consoleLogService;
try {
    ConsoleLogService = require('../src/services/console-log.service.js').ConsoleLogService;
    consoleLogService = new ConsoleLogService();
} catch (error) {
    console.error('Failed to import ConsoleLogService:', error);
    process.exit(1);
}

// Initialize logStreamService
let logStreamService;
try {
    logStreamService = WebSocketLogStreamService();
} catch (error) {
    console.error('Failed to initialize WebSocketLogStreamService:', error);
    process.exit(1);
}

function startWebSocketLogStream() {
    console.log('🚀 Starting WebSocket Log Stream Service...');
    console.log(`📡 WebSocket Port: ${WS_PORT}`);
    console.log(`🌐 HTTP Server Port: ${HTTP_PORT}`);

    // Create HTTP server for health checks
    const server = http.createServer((req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
        const pathname = url.pathname;

        // Handle API routes
        if (pathname.startsWith('/api/v2/websocket-log-stream/')) {
            const pathParts = pathname.split('/');
            const action = pathParts[pathParts.length - 1];

            if (req.method === 'GET') {
                if (action === 'status') {
                    const stats = logStreamService?.getStats();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'running',
                        port: WS_PORT,
                        clients: stats?.connectedClients || 0,
                        uptime: process.uptime(),
                        timestamp: new Date().toISOString()
                    }));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            } else if (req.method === 'POST') {
                if (action === 'start') {
                    try {
                        // Create WebSocket server
                        const wss = new WebSocketServer({
                            port: WS_PORT,
                            perMessageDeflate: false,
                            maxPayload: 1024 * 1024 // 1MB
                        });

                        // Initialize the service
                        if (logStreamService && typeof logStreamService.initialize === 'function') {
                            logStreamService.initialize(wss, consoleLogService);
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'started',
                            port: WS_PORT,
                            message: 'WebSocket Log Stream Service started successfully'
                        }));
                    } catch (error) {
                        console.error('Failed to start WebSocket server:', error);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'error',
                            error: error.message
                        }));
                    }
                } else if (action === 'stop') {
                    try {
                        if (logStreamService && typeof logStreamService.shutdown === 'function') {
                            logStreamService.shutdown();
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'stopped',
                            message: 'WebSocket Log Stream Service stopped'
                        }));
                    } catch (error) {
                        console.error('Failed to stop WebSocket server:', error);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'error',
                            error: error.message
                        }));
                    }
                } else if (action === 'broadcast') {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });

                    req.on('end', () => {
                        try {
                            const { level, message, source } = JSON.parse(body);

                            if (logStreamService && typeof logStreamService.broadcastToAll === 'function') {
                                logStreamService.broadcastToAll({
                                    type: 'log',
                                    data: {
                                        level: level || 'info',
                                        message: message || 'Test broadcast',
                                        source: source || 'system',
                                        timestamp: new Date().toISOString()
                                    }
                                });
                            }

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                status: 'broadcasted',
                                message: 'Log broadcasted successfully'
                            }));
                        } catch (error) {
                            console.error('Failed to broadcast log:', error);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                status: 'error',
                                error: error.message
                            }));
                        }
                    });
                } else {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        message: 'Method not allowed'
                    }));
                }
            } else {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'error',
                    message: 'Method not allowed'
                }));
            }
        } else {
            // Serve a simple status page
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WebSocket Log Stream Service</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        .status { background: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0; }
                        .online { color: #4CAF50; }
                        .offline { color: #F44336; }
                    </style>
                </head>
                <body>
                    <h1>WebSocket Log Stream Service</h1>
                    <div class="status">
                        <p>WebSocket Server: <span class="${server.listening ? 'online' : 'offline'}">${server.listening ? 'Running' : 'Stopped'}</span> (Port ${WS_PORT})</p>
                        <p>HTTP Server: <span class="online">Running</span> (Port ${HTTP_PORT})</p>
                    </div>
                    <div>
                        <h2>API Endpoints:</h2>
                        <ul>
                            <li>GET /api/v2/websocket-log-stream/status - Get service status</li>
                            <li>POST /api/v2/websocket-log-stream/start - Start WebSocket service</li>
                            <li>POST /api/v2/websocket-log-stream/stop - Stop WebSocket service</li>
                            <li>POST /api/v2/websocket-log-stream/broadcast - Broadcast test log</li>
                        </ul>
                    </div>
                </body>
                </html>
            `);
        }
    });

    // Start the HTTP server
    server.listen(HTTP_PORT, () => {
        console.log(`🌐 HTTP Server listening on port ${HTTP_PORT}`);

        // Auto-start the WebSocket service
        setTimeout(() => {
            console.log('🚀 Auto-starting WebSocket Log Stream Service...');
            startWebSocketService();
        }, 1000);
    });

    // Handle server errors
    server.on('error', (error) => {
        console.error('HTTP Server error:', error);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        if (logStreamService && typeof logStreamService.shutdown === 'function') {
            logStreamService.shutdown();
        }
        server.close(() => {
            console.log('HTTP Server closed');
            process.exit(0);
        });
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        if (logStreamService && typeof logStreamService.shutdown === 'function') {
            logStreamService.shutdown();
        }
        server.close(() => {
            console.log('HTTP Server closed');
            process.exit(0);
        });
    });
}

function startWebSocketService() {
    try {
        // Create WebSocket server
        const wss = new WebSocketServer({
            port: WS_PORT,
            perMessageDeflate: false,
            maxPayload: 1024 * 1024 // 1MB
        });

        // Initialize the service
        if (logStreamService && typeof logStreamService.initialize === 'function') {
            logStreamService.initialize(wss, consoleLogService);
        }

        console.log(`✅ WebSocket Log Stream Service started on port ${WS_PORT}`);

        // Add some test logs
        setTimeout(() => {
            if (logStreamService && typeof logStreamService.broadcastToAll === 'function') {
                logStreamService.broadcastToAll({
                    type: 'log',
                    data: {
                        level: 'info',
                        message: 'WebSocket Log Stream Service initialized successfully',
                        source: 'system',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }, 2000);

        setTimeout(() => {
            if (logStreamService && typeof logStreamService.broadcastToAll === 'function') {
                logStreamService.broadcastToAll({
                    type: 'log',
                    data: {
                        level: 'success',
                        message: 'Ready to accept client connections',
                        source: 'system',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }, 3000);

    } catch (error) {
        console.error('Failed to start WebSocket server:', error);
    }
}

// Start the service
if (require.main === module) {
    startWebSocketLogStream();
}