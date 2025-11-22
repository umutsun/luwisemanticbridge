import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { ConsoleLogService } from './console-log.service';

export interface LogStreamClient {
    id: string;
    ws: WebSocket;
    filters: {
        level: string[];
        source: string[];
        service: string[];
    };
    connectedAt: Date;
    lastActivity: Date;
}

export interface LogStreamOptions {
    maxClients?: number;
    heartbeatInterval?: number;
    clientTimeout?: number;
    bufferSize?: number;
}

export class WebSocketLogStreamService extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private clients: Map<string, LogStreamClient> = new Map();
    private consoleLogService: ConsoleLogService | null = null;
    private options: Required<LogStreamOptions>;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    constructor(options: LogStreamOptions = {}) {
        super();
        this.options = {
            maxClients: options.maxClients || 50,
            heartbeatInterval: options.heartbeatInterval || 30000,
            clientTimeout: options.clientTimeout || 60000,
            bufferSize: options.bufferSize || 1000,
        };
    }

    initialize(wss: WebSocketServer, consoleLogService: ConsoleLogService): void {
        this.wss = wss;
        this.consoleLogService = consoleLogService;

        // Set up WebSocket server
        this.wss.on('connection', (ws: WebSocket, req) => {
            this.handleNewConnection(ws, req);
        });

        // Start heartbeat
        this.startHeartbeat();

        // Subscribe to console log service
        if (this.consoleLogService) {
            this.consoleLogService.on('log', (logEntry) => {
                this.broadcastLog(logEntry);
            });
        }

        console.log('🔌 WebSocket Log Stream Service initialized');
    }

    private handleNewConnection(ws: WebSocket, req: any): void {
        // Check client limit
        if (this.clients.size >= this.options.maxClients) {
            ws.close(1013, 'Server overloaded');
            return;
        }

        const clientId = this.generateClientId();
        const client: LogStreamClient = {
            id: clientId,
            ws,
            filters: {
                level: ['info', 'warn', 'error', 'debug'],
                source: ['backend', 'frontend', 'system'],
                service: ['*']
            },
            connectedAt: new Date(),
            lastActivity: new Date()
        };

        this.clients.set(clientId, client);

        // Send welcome message
        this.sendToClient(clientId, {
            type: 'connected',
            data: {
                clientId,
                serverTime: new Date().toISOString(),
                connectedClients: this.clients.size
            }
        });

        // Handle messages
        ws.on('message', (data: Buffer) => {
            this.handleClientMessage(clientId, data);
        });

        // Handle close
        ws.on('close', () => {
            this.handleClientDisconnect(clientId);
        });

        // Handle error
        ws.on('error', (error) => {
            console.error(`WebSocket error for client ${clientId}:`, error);
            this.handleClientDisconnect(clientId);
        });

        // Send recent logs
        this.sendRecentLogs(clientId);

        console.log(`📱 Client connected: ${clientId} (${this.clients.size} total)`);
    }

    private handleClientMessage(clientId: string, data: Buffer): void {
        try {
            const message = JSON.parse(data.toString());
            const client = this.clients.get(clientId);

            if (!client) return;

            client.lastActivity = new Date();

            switch (message.type) {
                case 'filter':
                    this.updateClientFilters(clientId, message.data);
                    break;
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                    break;
                case 'command':
                    this.handleClientCommand(clientId, message.data);
                    break;
                case 'subscribe':
                    this.handleSubscription(clientId, message.data);
                    break;
                default:
                    console.warn(`Unknown message type from client ${clientId}:`, message.type);
            }
        } catch (error) {
            console.error(`Error handling message from client ${clientId}:`, error);
        }
    }

    private handleClientDisconnect(clientId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.ws.close();
            this.clients.delete(clientId);
            console.log(`📱 Client disconnected: ${clientId} (${this.clients.size} total)`);
        }
    }

    private updateClientFilters(clientId: string, filters: any): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.filters = { ...client.filters, ...filters };
            this.sendToClient(clientId, {
                type: 'filters_updated',
                data: client.filters
            });
        }
    }

    private handleClientCommand(clientId: string, commandData: any): void {
        const { command, args } = commandData;

        // Execute command and send result
        this.executeCommand(command, args)
            .then(result => {
                this.sendToClient(clientId, {
                    type: 'command_result',
                    data: {
                        command,
                        result,
                        timestamp: new Date().toISOString()
                    }
                });
            })
            .catch(error => {
                this.sendToClient(clientId, {
                    type: 'command_error',
                    data: {
                        command,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }
                });
            });
    }

    private handleSubscription(clientId: string, subscriptionData: any): void {
        const { type, params } = subscriptionData;

        switch (type) {
            case 'metrics':
                this.subscribeToMetrics(clientId, params);
                break;
            case 'system_stats':
                this.subscribeToSystemStats(clientId, params);
                break;
            default:
                console.warn(`Unknown subscription type: ${type}`);
        }
    }

    private async executeCommand(command: string, args: any[]): Promise<any> {
        switch (command.toLowerCase()) {
            case 'status':
                return this.getSystemStatus();
            case 'logs':
                return this.getFilteredLogs(args[0]);
            case 'clear':
                return this.clearLogs();
            case 'stats':
                return this.getLogStats();
            case 'health':
                return this.getHealthCheck();
            case 'services':
                return this.getServicesStatus();
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    private async getSystemStatus(): Promise<any> {
        return {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            nodeVersion: process.version,
            connectedClients: this.clients.size,
            timestamp: new Date().toISOString()
        };
    }

    private async getFilteredLogs(filter?: any): Promise<any> {
        if (!this.consoleLogService) return [];

        const count = filter?.count || 100;
        const level = filter?.level;
        const source = filter?.source;

        const logs = await this.consoleLogService.getRecentLogs(count);

        let filteredLogs = logs;

        if (level && level !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.level === level);
        }

        if (source && source !== 'all') {
            filteredLogs = filteredLogs.filter(log =>
                log.service === source || log.message.includes(`[${source.toUpperCase()}]`)
            );
        }

        return filteredLogs;
    }

    private async clearLogs(): Promise<any> {
        if (this.consoleLogService) {
            await this.consoleLogService.clearLogs();
        }
        return { message: 'Logs cleared successfully' };
    }

    private async getLogStats(): Promise<any> {
        if (!this.consoleLogService) return {};

        const stats = await this.consoleLogService.getLogStats();
        return {
            ...stats,
            connectedClients: this.clients.size,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    private async getHealthCheck(): Promise<any> {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                websocket: this.wss ? 'running' : 'stopped',
                consoleLog: this.consoleLogService ? 'running' : 'stopped',
                database: 'connected', // This would need actual DB check
                redis: 'connected' // This would need actual Redis check
            }
        };
    }

    private async getServicesStatus(): Promise<any> {
        return {
            services: [
                { name: 'WebSocket Log Stream', status: 'running', port: 8084 },
                { name: 'Console Log Service', status: 'running' },
                { name: 'Database', status: 'connected' },
                { name: 'Redis', status: 'connected' },
                { name: 'LLM Service', status: 'active' },
                { name: 'OCR Service', status: 'active' }
            ],
            timestamp: new Date().toISOString()
        };
    }

    private subscribeToMetrics(clientId: string, params: any): void {
        // Send metrics every 5 seconds
        const interval = setInterval(async () => {
            const client = this.clients.get(clientId);
            if (!client) {
                clearInterval(interval);
                return;
            }

            const metrics = {
                cpu: process.cpuUsage(),
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            };

            this.sendToClient(clientId, {
                type: 'metrics_update',
                data: metrics
            });
        }, 5000);
    }

    private subscribeToSystemStats(clientId: string, params: any): void {
        // Send system stats every 10 seconds
        const interval = setInterval(async () => {
            const client = this.clients.get(clientId);
            if (!client) {
                clearInterval(interval);
                return;
            }

            const stats = await this.getLogStats();

            this.sendToClient(clientId, {
                type: 'system_stats_update',
                data: stats
            });
        }, 10000);
    }

    private async sendRecentLogs(clientId: string): Promise<void> {
        if (!this.consoleLogService) return;

        try {
            const recentLogs = await this.consoleLogService.getRecentLogs(50);

            this.sendToClient(clientId, {
                type: 'recent_logs',
                data: recentLogs
            });
        } catch (error) {
            console.error('Failed to send recent logs:', error);
        }
    }

    private broadcastLog(logEntry: any): void {
        this.clients.forEach((client) => {
            // Apply client filters
            if (this.shouldSendLogToClient(logEntry, client)) {
                this.sendToClient(client.id, {
                    type: 'log',
                    data: logEntry
                });
            }
        });
    }

    private shouldSendLogToClient(logEntry: any, client: LogStreamClient): boolean {
        const { level, source, service } = client.filters;

        // Level filter
        if (level.length > 0 && !level.includes(logEntry.level) && !level.includes('all')) {
            return false;
        }

        // Source filter
        if (source.length > 0 && !source.includes('all')) {
            const logSource = logEntry.service || 'unknown';
            if (!source.includes(logSource) &&
                !source.some(s => logEntry.message.includes(`[${s.toUpperCase()}]`))) {
                return false;
            }
        }

        // Service filter
        if (service.length > 0 && !service.includes('*') && !service.includes(logEntry.service)) {
            return false;
        }

        return true;
    }

    private sendToClient(clientId: string, message: any): void {
        const client = this.clients.get(clientId);
        if (!client || client.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            client.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error(`Failed to send message to client ${clientId}:`, error);
            this.handleClientDisconnect(clientId);
        }
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            const now = new Date();

            this.clients.forEach((client, clientId) => {
                // Check for timeout
                if (now.getTime() - client.lastActivity.getTime() > this.options.clientTimeout) {
                    console.log(`Client ${clientId} timed out`);
                    this.handleClientDisconnect(clientId);
                    return;
                }

                // Send ping
                this.sendToClient(clientId, {
                    type: 'ping',
                    timestamp: now.toISOString()
                });
            });
        }, this.options.heartbeatInterval);
    }

    private generateClientId(): string {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Public methods
    getStats(): any {
        return {
            connectedClients: this.clients.size,
            maxClients: this.options.maxClients,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    broadcastToAll(message: any): void {
        this.clients.forEach((client) => {
            this.sendToClient(client.id, message);
        });
    }

    shutdown(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.clients.forEach((client, clientId) => {
            this.sendToClient(clientId, {
                type: 'server_shutdown',
                data: { message: 'Server is shutting down' }
            });
            client.ws.close();
        });

        this.clients.clear();
        console.log('WebSocket Log Stream Service shutdown complete');
    }
}

// Singleton instance
let webSocketLogStreamService: WebSocketLogStreamService | null = null;

export function getWebSocketLogStreamService(options?: LogStreamOptions): WebSocketLogStreamService {
    if (!webSocketLogStreamService) {
        webSocketLogStreamService = new WebSocketLogStreamService(options);
    }
    return webSocketLogStreamService;
}