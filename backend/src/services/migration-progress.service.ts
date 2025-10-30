/**
 * Migration Progress Service with Real-time Updates
 * Provides WebSocket/SSE for live progress tracking
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { logger } from '../utils/logger';

interface ProgressData {
  migrationId: string;
  tableName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'stopped';
  progress: number; // 0-100
  currentRow: number;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  speed: number; // rows per second
  remainingTime: number; // seconds
  message: string;
  details?: any;
  timestamp: Date;
}

interface MigrationMetrics {
  startTime: Date;
  endTime?: Date;
  tokensUsed: number;
  estimatedCost: number;
  averageSpeed: number;
  peakSpeed: number;
  errors: string[];
}

export class MigrationProgressService extends EventEmitter {
  private static instance: MigrationProgressService;
  private progressMap: Map<string, ProgressData> = new Map();
  private metricsMap: Map<string, MigrationMetrics> = new Map();
  private wsClients: Map<string, Set<WebSocket>> = new Map();
  private sseClients: Map<string, Set<any>> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.startUpdateLoop();
  }

  static getInstance(): MigrationProgressService {
    if (!MigrationProgressService.instance) {
      MigrationProgressService.instance = new MigrationProgressService();
    }
    return MigrationProgressService.instance;
  }

  /**
   * Start a new migration tracking
   */
  startMigration(migrationId: string, tableName: string, totalRows: number): void {
    const progressData: ProgressData = {
      migrationId,
      tableName,
      status: 'processing',
      progress: 0,
      currentRow: 0,
      totalRows,
      processedRows: 0,
      failedRows: 0,
      speed: 0,
      remainingTime: 0,
      message: 'Migration started',
      timestamp: new Date()
    };

    const metrics: MigrationMetrics = {
      startTime: new Date(),
      tokensUsed: 0,
      estimatedCost: 0,
      averageSpeed: 0,
      peakSpeed: 0,
      errors: []
    };

    this.progressMap.set(migrationId, progressData);
    this.metricsMap.set(migrationId, metrics);

    this.broadcastUpdate(migrationId, progressData);
    logger.info(`Migration ${migrationId} started for table ${tableName}`);
  }

  /**
   * Update migration progress
   */
  updateProgress(
    migrationId: string,
    update: Partial<ProgressData>
  ): void {
    const current = this.progressMap.get(migrationId);
    if (!current) {
      logger.warn(`Migration ${migrationId} not found for update`);
      return;
    }

    const metrics = this.metricsMap.get(migrationId);
    if (!metrics) return;

    // Calculate speed and remaining time
    const elapsedSeconds = (Date.now() - metrics.startTime.getTime()) / 1000;
    const processedRows = update.processedRows || current.processedRows;

    if (elapsedSeconds > 0 && processedRows > 0) {
      const currentSpeed = processedRows / elapsedSeconds;
      metrics.averageSpeed = currentSpeed;

      if (currentSpeed > metrics.peakSpeed) {
        metrics.peakSpeed = currentSpeed;
      }

      const remainingRows = current.totalRows - processedRows;
      const remainingTime = remainingRows / currentSpeed;

      update.speed = Math.round(currentSpeed);
      update.remainingTime = Math.round(remainingTime);
    }

    // Calculate progress percentage
    if (current.totalRows > 0) {
      update.progress = Math.round((processedRows / current.totalRows) * 100);
    }

    // Merge updates
    const updated: ProgressData = {
      ...current,
      ...update,
      timestamp: new Date()
    };

    this.progressMap.set(migrationId, updated);

    // Broadcast to all clients
    this.broadcastUpdate(migrationId, updated);

    // Emit event for other services
    this.emit('progress', updated);

    // Log significant milestones
    if (updated.progress % 10 === 0 && updated.progress !== current.progress) {
      logger.info(`Migration ${migrationId}: ${updated.progress}% complete`);
    }
  }

  /**
   * Complete a migration
   */
  completeMigration(
    migrationId: string,
    success: boolean = true,
    message?: string
  ): void {
    const current = this.progressMap.get(migrationId);
    if (!current) return;

    const metrics = this.metricsMap.get(migrationId);
    if (metrics) {
      metrics.endTime = new Date();
    }

    const updated: ProgressData = {
      ...current,
      status: success ? 'completed' : 'failed',
      progress: success ? 100 : current.progress,
      message: message || (success ? 'Migration completed successfully' : 'Migration failed'),
      timestamp: new Date()
    };

    this.progressMap.set(migrationId, updated);
    this.broadcastUpdate(migrationId, updated);
    this.emit('complete', { migrationId, success, metrics });

    logger.info(`Migration ${migrationId} ${success ? 'completed' : 'failed'}`);

    // Clean up after 5 minutes
    setTimeout(() => {
      this.progressMap.delete(migrationId);
      this.metricsMap.delete(migrationId);
      this.wsClients.delete(migrationId);
      this.sseClients.delete(migrationId);
    }, 5 * 60 * 1000);
  }

  /**
   * Stop a migration
   */
  stopMigration(migrationId: string): void {
    const current = this.progressMap.get(migrationId);
    if (!current) return;

    const updated: ProgressData = {
      ...current,
      status: 'stopped',
      message: 'Migration stopped by user',
      timestamp: new Date()
    };

    this.progressMap.set(migrationId, updated);
    this.broadcastUpdate(migrationId, updated);
    this.emit('stopped', migrationId);

    logger.info(`Migration ${migrationId} stopped`);
  }

  /**
   * Get progress for a migration
   */
  getProgress(migrationId: string): ProgressData | undefined {
    return this.progressMap.get(migrationId);
  }

  /**
   * Get all active migrations
   */
  getAllActive(): ProgressData[] {
    return Array.from(this.progressMap.values()).filter(
      p => p.status === 'processing' || p.status === 'pending'
    );
  }

  /**
   * Get metrics for a migration
   */
  getMetrics(migrationId: string): MigrationMetrics | undefined {
    return this.metricsMap.get(migrationId);
  }

  /**
   * Register WebSocket client
   */
  registerWebSocket(migrationId: string, ws: WebSocket): void {
    if (!this.wsClients.has(migrationId)) {
      this.wsClients.set(migrationId, new Set());
    }
    this.wsClients.get(migrationId)!.add(ws);

    // Send current progress immediately
    const progress = this.progressMap.get(migrationId);
    if (progress) {
      ws.send(JSON.stringify({
        type: 'progress',
        data: progress
      }));
    }

    // Clean up on disconnect
    ws.on('close', () => {
      const clients = this.wsClients.get(migrationId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          this.wsClients.delete(migrationId);
        }
      }
    });
  }

  /**
   * Register SSE client
   */
  registerSSE(migrationId: string, res: any): void {
    if (!this.sseClients.has(migrationId)) {
      this.sseClients.set(migrationId, new Set());
    }
    this.sseClients.get(migrationId)!.add(res);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send current progress immediately
    const progress = this.progressMap.get(migrationId);
    if (progress) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }

    // Clean up on disconnect
    res.on('close', () => {
      const clients = this.sseClients.get(migrationId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          this.sseClients.delete(migrationId);
        }
      }
    });
  }

  /**
   * Broadcast update to all connected clients
   */
  private broadcastUpdate(migrationId: string, data: ProgressData): void {
    // WebSocket clients
    const wsClients = this.wsClients.get(migrationId);
    if (wsClients && wsClients.size > 0) {
      const message = JSON.stringify({
        type: 'progress',
        data
      });

      wsClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }

    // SSE clients
    const sseClients = this.sseClients.get(migrationId);
    if (sseClients && sseClients.size > 0) {
      const message = `data: ${JSON.stringify(data)}\n\n`;

      sseClients.forEach(res => {
        try {
          res.write(message);
        } catch (err) {
          // Client disconnected
          sseClients.delete(res);
        }
      });
    }

    // Broadcast to all clients (for dashboard)
    this.broadcastToAll({
      type: 'migration-update',
      migrationId,
      data
    });
  }

  /**
   * Broadcast to all connected clients
   */
  private broadcastToAll(message: any): void {
    const jsonMessage = JSON.stringify(message);

    // All WebSocket clients
    this.wsClients.forEach(clients => {
      clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(jsonMessage);
        }
      });
    });
  }

  /**
   * Start update loop for smooth progress animation
   */
  private startUpdateLoop(): void {
    this.updateInterval = setInterval(() => {
      // Update progress for all active migrations
      this.progressMap.forEach((progress, migrationId) => {
        if (progress.status === 'processing') {
          // Simulate smooth progress for UI
          const metrics = this.metricsMap.get(migrationId);
          if (metrics && metrics.averageSpeed > 0) {
            const increment = metrics.averageSpeed / 10; // Update every 100ms
            const newProcessed = Math.min(
              progress.processedRows + increment,
              progress.totalRows
            );

            this.updateProgress(migrationId, {
              processedRows: Math.floor(newProcessed),
              currentRow: Math.floor(newProcessed)
            });
          }
        }
      });
    }, 100); // Update every 100ms for smooth animation
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Close all WebSocket connections
    this.wsClients.forEach(clients => {
      clients.forEach(ws => ws.close());
    });

    // Close all SSE connections
    this.sseClients.forEach(clients => {
      clients.forEach(res => res.end());
    });

    this.progressMap.clear();
    this.metricsMap.clear();
    this.wsClients.clear();
    this.sseClients.clear();
  }
}

// Export singleton instance
export const migrationProgress = MigrationProgressService.getInstance();