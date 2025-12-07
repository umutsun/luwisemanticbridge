/**
 * Import Job Service
 * Manages background import jobs with progress tracking and WebSocket updates
 */

import pool from '../config/database';
import { Server as SocketServer } from 'socket.io';

export interface ImportJob {
  id: number;
  user_id?: string;
  job_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total_files: number;
  processed_files: number;
  successful_files: number;
  failed_files: number;
  metadata: any;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  updated_at: Date;
}

class ImportJobService {
  private io: SocketServer | null = null;

  /**
   * Set Socket.IO instance for real-time updates
   */
  setSocketIO(io: SocketServer) {
    this.io = io;
    console.log('[ImportJob] Socket.IO instance set for real-time updates');
  }

  /**
   * Create a new import job
   */
  async createJob(data: {
    userId?: string;
    jobType: string;
    totalFiles: number;
    metadata?: any;
  }): Promise<ImportJob> {
    const result = await pool.query(
      `INSERT INTO import_jobs (user_id, job_type, total_files, metadata, status, progress)
       VALUES ($1, $2, $3, $4, 'pending', 0)
       RETURNING *`,
      [data.userId, data.jobType, data.totalFiles, JSON.stringify(data.metadata || {})]
    );

    const job = this.mapToImportJob(result.rows[0]);
    console.log(`[ImportJob] Created job ${job.id}: ${job.job_type} with ${job.total_files} files`);

    // Emit to user's room
    if (this.io && data.userId) {
      this.io.to(`user:${data.userId}`).emit('import:job:created', job);
    }

    return job;
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: number,
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  ): Promise<void> {
    const timestampField = status === 'in_progress' ? 'started_at' :
                          (status === 'completed' || status === 'failed' ? 'completed_at' : null);

    if (timestampField) {
      await pool.query(
        `UPDATE import_jobs
         SET status = $1, ${timestampField} = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [status, jobId]
      );
    } else {
      await pool.query(
        `UPDATE import_jobs SET status = $1 WHERE id = $2`,
        [status, jobId]
      );
    }

    const job = await this.getJob(jobId);
    if (job && this.io && job.user_id) {
      this.io.to(`user:${job.user_id}`).emit('import:job:status', {
        jobId: job.id,
        status: job.status,
        timestamp: new Date()
      });
    }
  }

  /**
   * Update job progress
   */
  async updateProgress(data: {
    jobId: number;
    processedFiles: number;
    successfulFiles: number;
    failedFiles: number;
    currentFile?: string;
    currentError?: string;
  }): Promise<void> {
    const job = await this.getJob(data.jobId);
    if (!job) return;

    const progress = Math.min(100, Math.floor((data.processedFiles / job.total_files) * 100));

    // Update metadata with current file info
    const metadata = job.metadata || {};
    if (data.currentFile) {
      metadata.currentFile = data.currentFile;
    }
    if (data.currentError) {
      if (!metadata.errors) metadata.errors = [];
      metadata.errors.push({
        file: data.currentFile,
        error: data.currentError,
        timestamp: new Date()
      });
    }

    await pool.query(
      `UPDATE import_jobs
       SET progress = $1,
           processed_files = $2,
           successful_files = $3,
           failed_files = $4,
           metadata = $5
       WHERE id = $6`,
      [
        progress,
        data.processedFiles,
        data.successfulFiles,
        data.failedFiles,
        JSON.stringify(metadata),
        data.jobId
      ]
    );

    // Emit progress to user
    if (this.io && job.user_id) {
      this.io.to(`user:${job.user_id}`).emit('import:job:progress', {
        jobId: job.id,
        progress,
        processedFiles: data.processedFiles,
        successfulFiles: data.successfulFiles,
        failedFiles: data.failedFiles,
        totalFiles: job.total_files,
        currentFile: data.currentFile,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: number): Promise<ImportJob | null> {
    const result = await pool.query(
      'SELECT * FROM import_jobs WHERE id = $1',
      [jobId]
    );

    if (result.rows.length === 0) return null;
    return this.mapToImportJob(result.rows[0]);
  }

  /**
   * Get all jobs for a user
   */
  async getUserJobs(userId: string, limit: number = 20): Promise<ImportJob[]> {
    const result = await pool.query(
      `SELECT * FROM import_jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => this.mapToImportJob(row));
  }

  /**
   * Get active jobs (pending or in_progress)
   */
  async getActiveJobs(userId?: string): Promise<ImportJob[]> {
    const query = userId
      ? `SELECT * FROM import_jobs
         WHERE user_id = $1 AND status IN ('pending', 'in_progress')
         ORDER BY created_at DESC`
      : `SELECT * FROM import_jobs
         WHERE status IN ('pending', 'in_progress')
         ORDER BY created_at DESC`;

    const result = userId
      ? await pool.query(query, [userId])
      : await pool.query(query);

    return result.rows.map(row => this.mapToImportJob(row));
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: number): Promise<void> {
    await this.updateJobStatus(jobId, 'cancelled');
    console.log(`[ImportJob] Job ${jobId} cancelled`);
  }

  /**
   * Delete old completed jobs (cleanup)
   */
  async cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
    const result = await pool.query(
      `DELETE FROM import_jobs
       WHERE status IN ('completed', 'failed', 'cancelled')
       AND created_at < NOW() - INTERVAL '${olderThanDays} days'
       RETURNING id`
    );

    console.log(`[ImportJob] Cleaned up ${result.rowCount} old jobs`);
    return result.rowCount || 0;
  }

  /**
   * Recover stale jobs (in_progress jobs left behind after restart)
   * Should be called on server startup
   */
  async recoverStaleJobs(): Promise<number> {
    const result = await pool.query(
      `UPDATE import_jobs
       SET status = 'failed',
           metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{error}',
             '"Job interrupted by server restart"'::jsonb
           ),
           completed_at = CURRENT_TIMESTAMP
       WHERE status IN ('pending', 'in_progress')
       RETURNING id`
    );

    if (result.rowCount && result.rowCount > 0) {
      console.log(`[ImportJob] Recovered ${result.rowCount} stale jobs (marked as failed)`);
    }
    return result.rowCount || 0;
  }

  /**
   * Map database row to ImportJob
   */
  private mapToImportJob(row: any): ImportJob {
    return {
      id: row.id,
      user_id: row.user_id,
      job_type: row.job_type,
      status: row.status,
      progress: row.progress,
      total_files: row.total_files,
      processed_files: row.processed_files,
      successful_files: row.successful_files,
      failed_files: row.failed_files,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      updated_at: row.updated_at
    };
  }
}

export const importJobService = new ImportJobService();
export default importJobService;
