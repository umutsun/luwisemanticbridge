import * as cron from 'node-cron';
import { MessageStorageService } from './message-storage.service';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { pool } from '../config/database.config';

export class MessageCleanupService {
  private static instance: MessageCleanupService;
  private cleanupTask: cron.ScheduledTask;
  private flushTask: cron.ScheduledTask;

  private constructor() {
    // Schedule cleanup job - runs every day at 2 AM
    this.cleanupTask = cron.schedule('0 2 * * *', async () => {
      logger.info('Running daily message cleanup...');
      await this.performCleanup();
    }, {
      scheduled: true
    });

    // Schedule flush job - runs every 30 minutes
    this.flushTask = cron.schedule('*/30 * * * *', async () => {
      logger.info('Running message flush check...');
      await this.performFlush();
    }, {
      scheduled: true
    });

    logger.info('Message cleanup service initialized');
  }

  public static getInstance(): MessageCleanupService {
    if (!MessageCleanupService.instance) {
      MessageCleanupService.instance = new MessageCleanupService();
    }
    return MessageCleanupService.instance;
  }

  /**
   * Perform daily cleanup of old messages
   */
  private async performCleanup(): Promise<void> {
    try {
      let cleanedCount = 0;

      // Check if Redis client is available
      if (!redisClient || redisClient.status !== 'ready') {
        logger.warn('Redis client not available for cleanup, skipping Redis cleanup');
      } else {
        // Clean up Redis messages older than 7 days (should auto-expire anyway)
        const keys = await redisClient.keys('messages:*');

        for (const key of keys) {
          const ttl = await redisClient.ttl(key);
          if (ttl === -1) { // No expiry set - set it
            await redisClient.expire(key, 7 * 24 * 60 * 60);
            cleanedCount++;
          }
        }
      }

      // Clean up database messages older than 90 days
      const deleteResult = await pool.query(`
        DELETE FROM message_embeddings
        WHERE created_at < CURRENT_DATE - INTERVAL '90 days'
          AND user_id IS NOT NULL
      `);

      logger.info(`Cleanup completed: ${cleanedCount} Redis keys updated, ${deleteResult.rowCount} DB records deleted`);

      // Update statistics
      await this.updateCleanupStats(cleanedCount, deleteResult.rowCount);

    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  /**
   * Flush Redis messages to embeddings if threshold reached
   */
  private async performFlush(): Promise<void> {
    try {
      // Check if Redis client is available
      if (!redisClient || redisClient.status !== 'ready') {
        logger.warn('Redis client not available for flush, skipping');
        return;
      }

      const keys = await redisClient.keys('messages:*');
      let flushedSessions = 0;

      for (const key of keys) {
        const messageCount = await redisClient.llen(key);
        if (messageCount >= 50) { // FLUSH_THRESHOLD
          // Extract session ID and user ID from key
          const keyParts = key.split(':');
          const sessionId = keyParts[1];
          const userId = keyParts[2] === 'anonymous' ? undefined : keyParts[2];

          await MessageStorageService.flushSessionToEmbeddings(sessionId, userId);
          flushedSessions++;
        }
      }

      if (flushedSessions > 0) {
        logger.info(`Flushed ${flushedSessions} sessions to embeddings`);
      }

    } catch (error) {
      logger.error('Error during flush:', error);
    }
  }

  /**
   * Update cleanup statistics
   */
  private async updateCleanupStats(redisCleaned: number, dbDeleted: number): Promise<void> {
    try {
      const stats = {
        lastCleanup: new Date().toISOString(),
        redisCleaned,
        dbDeleted,
        totalCleaned: redisCleaned + dbDeleted
      };

      await redisClient.hset('cleanup_stats', stats);
      await redisClient.expire('cleanup_stats', 30 * 24 * 60 * 60); // 30 days

    } catch (error) {
      logger.error('Error updating cleanup stats:', error);
    }
  }

  /**
   * Get cleanup statistics
   */
  public async getCleanupStats(): Promise<any> {
    try {
      const stats = await redisClient.hgetall('cleanup_stats');
      return stats || {
        lastCleanup: 'Never',
        redisCleaned: 0,
        dbDeleted: 0,
        totalCleaned: 0
      };
    } catch (error) {
      logger.error('Error getting cleanup stats:', error);
      return {};
    }
  }

  /**
   * Manually trigger cleanup
   */
  public async triggerCleanup(): Promise<void> {
    logger.info('Manual cleanup triggered...');
    await this.performCleanup();
  }

  /**
   * Manually trigger flush
   */
  public async triggerFlush(): Promise<void> {
    logger.info('Manual flush triggered...');
    await this.performFlush();
  }

  /**
   * Stop all jobs
   */
  public stop(): void {
    this.cleanupTask.stop();
    this.flushTask.stop();
    logger.info('Message cleanup service stopped');
  }
}