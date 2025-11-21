/**
 * PDF Progress WebSocket Service
 * Real-time progress updates for PDF processing
 */

import { Server as SocketIOServer } from 'socket.io';
import { Redis } from 'ioredis';

export interface ProgressUpdate {
  jobId: string;
  type: 'ocr' | 'metadata' | 'transform' | 'batch-metadata-transform';
  status: 'processing' | 'completed' | 'error';
  current?: number;
  total?: number;
  percentage?: number;
  currentFile?: string;
  message?: string;
  currentDocument?: string;
  timestamp: string;
}

class PDFProgressWSService {
  private io: SocketIOServer;
  private redis: Redis;
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;

    // Initialize Redis
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 1, // Use different DB for progress updates
      retryStrategy: () => null
    });

    // Test Redis connection
    this.redis.on('connect', () => {
      console.log('[PDF Progress WS] Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      console.error('[PDF Progress WS] Redis connection error:', error);
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle client connections
    this.io.on('connection', (socket) => {
      console.log(`[PDF Progress WS] Client connected: ${socket.id}`);

      // Subscribe to job updates
      socket.on('subscribe-job', (jobId: string) => {
        console.log(`[PDF Progress WS] Client ${socket.id} subscribed to job ${jobId}`);
        socket.join(`job-${jobId}`);

        // Send current progress if exists
        this.sendCurrentProgress(socket, jobId);
      });

      socket.on('unsubscribe-job', (jobId: string) => {
        console.log(`[PDF Progress WS] Client ${socket.id} unsubscribed from job ${jobId}`);
        socket.leave(`job-${jobId}`);
      });

      socket.on('disconnect', () => {
        console.log(`[PDF Progress WS] Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Send progress update to clients
   */
  async updateProgress(jobId: string, progress: Omit<ProgressUpdate, 'timestamp'>): Promise<void> {
    const update: ProgressUpdate = {
      jobId,
      ...progress,
      timestamp: new Date().toISOString()
    };

    // Store in Redis
    await this.redis.setex(
      `pdf-progress:${jobId}`,
      3600, // 1 hour TTL
      JSON.stringify(update)
    );

    // Emit to subscribed clients
    this.io.to(`job-${jobId}`).emit('progress-update', update);

    console.log(`[PDF Progress WS] Updated job ${jobId}: ${update.message || update.currentFile}`);
  }

  /**
   * Send current progress to a newly connected client
   */
  private async sendCurrentProgress(socket: any, jobId: string): Promise<void> {
    try {
      const progressData = await this.redis.get(`pdf-progress:${jobId}`);
      if (progressData) {
        const progress = JSON.parse(progressData);
        socket.emit('progress-update', progress);
      }
    } catch (error) {
      console.error('[PDF Progress WS] Error getting current progress:', error);
    }
  }

  /**
   * Complete a job
   */
  async completeJob(jobId: string, result?: any): Promise<void> {
  await this.updateProgress(jobId, {
    type: 'batch-metadata-transform',
    status: 'completed',
    message: result ? `Completed: ${result.message}` : 'Processing completed successfully',
    percentage: 100
  });

    // Clean up after 5 seconds
    setTimeout(() => {
      this.redis.del(`pdf-progress:${jobId}`);
    }, 5000);
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId: string, error: string): Promise<void> {
    await this.updateProgress(jobId, {
      type: 'batch-metadata-transform',
      status: 'error',
      message: `Error: ${error}`,
      percentage: 0
    });
  }

  /**
   * Get all active jobs
   */
  async getActiveJobs(): Promise<ProgressUpdate[]> {
    try {
      const keys = await this.redis.keys('pdf-progress:*');
      const jobs: ProgressUpdate[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          jobs.push(JSON.parse(data));
        }
      }

      return jobs;
    } catch (error) {
      console.error('[PDF Progress WS] Error getting active jobs:', error);
      return [];
    }
  }
}

// Singleton instance
let pdfProgressWSService: PDFProgressWSService | null = null;

export const initPDFProgressWS = (io: SocketIOServer): PDFProgressWSService => {
  if (!pdfProgressWSService) {
    pdfProgressWSService = new PDFProgressWSService(io);
  }
  return pdfProgressWSService;
};

export default pdfProgressWSService;