/**
 * Metrics WebSocket Service
 * Real-time system metrics streaming over WebSocket
 * Provides live CPU, memory, disk, and network stats with history for sparklines
 */

import { WebSocket, WebSocketServer } from 'ws';
import { Pool } from 'pg';
import SystemMetricsService from './system-metrics.service';

interface MetricsHistory {
  cpu: number[];
  memory: number[];
  disk: number[];
  networkIn: number[];
  networkOut: number[];
  timestamps: number[];
}

interface MetricsClient {
  ws: WebSocket;
  interval: NodeJS.Timeout | null;
  updateRate: number; // ms between updates
}

export class MetricsWebSocketService {
  private wss: WebSocketServer;
  private metricsService: SystemMetricsService;
  private clients: Set<MetricsClient> = new Set();
  private history: MetricsHistory = {
    cpu: [],
    memory: [],
    disk: [],
    networkIn: [],
    networkOut: [],
    timestamps: []
  };
  private readonly MAX_HISTORY = 60; // Keep 60 data points (1 minute at 1s intervals)
  private globalInterval: NodeJS.Timeout | null = null;
  private redis: any;

  constructor(wss: WebSocketServer, pool: Pool, redis?: any) {
    this.wss = wss;
    this.redis = redis;
    this.metricsService = new SystemMetricsService(pool, redis);
    this.setupWebSocket();
    this.startGlobalMetricsCollection();
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[MetricsWS] Client connected');

      const client: MetricsClient = {
        ws,
        interval: null,
        updateRate: 1000 // Default 1 second
      };
      this.clients.add(client);

      // Send initial data with history
      this.sendInitialData(client);

      // Handle client messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch (err) {
          console.error('[MetricsWS] Invalid message:', err);
        }
      });

      // Handle disconnect
      ws.on('close', () => {
        console.log('[MetricsWS] Client disconnected');
        if (client.interval) {
          clearInterval(client.interval);
        }
        this.clients.delete(client);
      });

      // Handle errors
      ws.on('error', (err) => {
        console.error('[MetricsWS] Error:', err);
        this.clients.delete(client);
      });

      // Start streaming to this client
      this.startClientStream(client);
    });
  }

  private handleClientMessage(client: MetricsClient, message: any) {
    switch (message.type) {
      case 'ping':
        client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      case 'setUpdateRate':
        // Allow client to set update rate (min 500ms, max 5000ms)
        const rate = Math.max(500, Math.min(5000, message.rate || 1000));
        client.updateRate = rate;
        // Restart client stream with new rate
        if (client.interval) {
          clearInterval(client.interval);
        }
        this.startClientStream(client);
        break;
      case 'getHistory':
        // Send full history
        client.ws.send(JSON.stringify({
          type: 'history',
          data: this.history,
          timestamp: Date.now()
        }));
        break;
    }
  }

  private async sendInitialData(client: MetricsClient) {
    try {
      const metrics = await this.metricsService.getAllMetrics();

      client.ws.send(JSON.stringify({
        type: 'initial',
        data: {
          current: {
            cpu: {
              usage: metrics.cpu.usage,
              model: metrics.cpu.model,
              cores: metrics.cpu.cores,
              speed: metrics.cpu.speed,
              loadAvg: metrics.cpu.loadAvg
            },
            memory: {
              percentage: metrics.memory.percentage,
              used: metrics.memory.used,
              total: metrics.memory.total,
              free: metrics.memory.free,
              heapUsed: metrics.memory.heapUsed,
              heapTotal: metrics.memory.heapTotal
            },
            disk: {
              percentage: metrics.disk.percentage,
              used: metrics.disk.used,
              total: metrics.disk.total,
              free: metrics.disk.free,
              mountPoint: metrics.disk.mountPoint,
              filesystem: metrics.disk.filesystem
            },
            network: metrics.network,
            process: metrics.process,
            services: metrics.services,
            pipelines: metrics.pipelines,
            database: metrics.database,
            redis: metrics.redis,
            performance: metrics.performance
          },
          history: this.history
        },
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('[MetricsWS] Error sending initial data:', err);
    }
  }

  private startClientStream(client: MetricsClient) {
    client.interval = setInterval(async () => {
      if (client.ws.readyState !== WebSocket.OPEN) {
        if (client.interval) clearInterval(client.interval);
        return;
      }

      try {
        const metrics = await this.metricsService.getAllMetrics();

        client.ws.send(JSON.stringify({
          type: 'update',
          data: {
            cpu: {
              usage: metrics.cpu.usage,
              loadAvg: metrics.cpu.loadAvg
            },
            memory: {
              percentage: metrics.memory.percentage,
              used: metrics.memory.used,
              free: metrics.memory.free
            },
            disk: {
              percentage: metrics.disk.percentage,
              used: metrics.disk.used,
              free: metrics.disk.free
            },
            network: {
              bytesInPerSec: metrics.network.bytesInPerSec,
              bytesOutPerSec: metrics.network.bytesOutPerSec,
              bytesIn: metrics.network.bytesIn,
              bytesOut: metrics.network.bytesOut
            },
            services: metrics.services,
            pipelines: metrics.pipelines,
            performance: metrics.performance
          },
          timestamp: Date.now()
        }));
      } catch (err) {
        console.error('[MetricsWS] Error streaming metrics:', err);
      }
    }, client.updateRate);
  }

  private startGlobalMetricsCollection() {
    // Collect metrics every second for history
    this.globalInterval = setInterval(async () => {
      try {
        const metrics = await this.metricsService.getAllMetrics();

        // Add to history
        this.history.cpu.push(metrics.cpu.usage);
        this.history.memory.push(metrics.memory.percentage);
        this.history.disk.push(metrics.disk.percentage);
        this.history.networkIn.push(metrics.network.bytesInPerSec);
        this.history.networkOut.push(metrics.network.bytesOutPerSec);
        this.history.timestamps.push(Date.now());

        // Keep only last MAX_HISTORY entries
        if (this.history.cpu.length > this.MAX_HISTORY) {
          this.history.cpu.shift();
          this.history.memory.shift();
          this.history.disk.shift();
          this.history.networkIn.shift();
          this.history.networkOut.shift();
          this.history.timestamps.shift();
        }

        // Store in Redis for persistence across restarts (optional)
        if (this.redis && this.redis.status === 'ready') {
          await this.redis.set(
            'metrics:history',
            JSON.stringify(this.history),
            'EX',
            300 // 5 minute TTL
          );
        }
      } catch (err) {
        // Silently continue on error
      }
    }, 1000);
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcast(message: any) {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  /**
   * Get number of connected clients
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Cleanup on shutdown
   */
  public shutdown() {
    if (this.globalInterval) {
      clearInterval(this.globalInterval);
    }
    this.clients.forEach(client => {
      if (client.interval) {
        clearInterval(client.interval);
      }
      client.ws.close();
    });
    this.clients.clear();
  }

  /**
   * Set Redis instance (for late initialization)
   */
  public setRedis(redis: any) {
    this.redis = redis;
    this.metricsService.setRedis(redis);
  }
}

// Singleton instance
let metricsWebSocketService: MetricsWebSocketService | null = null;

export function initializeMetricsWebSocket(wss: WebSocketServer, pool: Pool, redis?: any): MetricsWebSocketService {
  if (!metricsWebSocketService) {
    metricsWebSocketService = new MetricsWebSocketService(wss, pool, redis);
    console.log('[MetricsWS] Service initialized');
  }
  return metricsWebSocketService;
}

export function getMetricsWebSocketService(): MetricsWebSocketService | null {
  return metricsWebSocketService;
}

export default MetricsWebSocketService;
