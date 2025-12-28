/**
 * Message Cleanup Service
 *
 * SECURITY NOTE: node-cron removed for security reasons.
 * All scheduling now handled by Python APScheduler service.
 *
 * This service provides on-demand cleanup and flush functions
 * that can be called via API or scheduled jobs.
 */

import { MessageStorageService } from './message-storage.service';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { pool } from '../config/database.config';

export class MessageCleanupService {
  private static instance: MessageCleanupService;

  private constructor() {
    // No automatic scheduling - handled by Python scheduler
    logger.info('Message cleanup service initialized (on-demand mode)');
  }

  public static getInstance(): MessageCleanupService {
    if (!MessageCleanupService.instance) {
      MessageCleanupService.instance = new MessageCleanupService();
    }
    return MessageCleanupService.instance;
  }

  /**
   * Perform cleanup of old messages
   * Called by scheduler or manually via API
   *
   * @param retentionDays - Number of days to retain (default: 90)
   */
  public async performCleanup(retentionDays: number = 90): Promise<{
    redisCleaned: number;
    dbDeleted: number;
  }> {
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

      // Clean up database messages older than retention period
      const deleteResult = await pool.query(`
        DELETE FROM message_embeddings
        WHERE created_at < CURRENT_DATE - INTERVAL '${retentionDays} days'
          AND user_id IS NOT NULL
      `);

      const dbDeleted = deleteResult.rowCount || 0;

      logger.info(`Cleanup completed: ${cleanedCount} Redis keys updated, ${dbDeleted} DB records deleted`);

      // Update statistics
      await this.updateCleanupStats(cleanedCount, dbDeleted);

      return {
        redisCleaned: cleanedCount,
        dbDeleted,
      };

    } catch (error) {
      logger.error('Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Flush Redis messages to embeddings if threshold reached
   * Called by scheduler or manually via API
   *
   * @param threshold - Message count threshold (default: 50)
   */
  public async performFlush(threshold: number = 50): Promise<{
    flushedSessions: number;
  }> {
    try {
      // Check if Redis client is available
      if (!redisClient || redisClient.status !== 'ready') {
        logger.warn('Redis client not available for flush, skipping');
        return { flushedSessions: 0 };
      }

      const keys = await redisClient.keys('messages:*');
      let flushedSessions = 0;

      for (const key of keys) {
        const messageCount = await redisClient.llen(key);
        if (messageCount >= threshold) {
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

      return { flushedSessions };

    } catch (error) {
      logger.error('Error during flush:', error);
      throw error;
    }
  }

  /**
   * Update cleanup statistics in Redis
   */
  private async updateCleanupStats(redisCleaned: number, dbDeleted: number): Promise<void> {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return;
      }

      const stats = {
        lastCleanup: new Date().toISOString(),
        redisCleaned: redisCleaned.toString(),
        dbDeleted: dbDeleted.toString(),
        totalCleaned: (redisCleaned + dbDeleted).toString()
      };

      await redisClient.hset('cleanup_stats', stats);
      await redisClient.expire('cleanup_stats', 30 * 24 * 60 * 60); // 30 days

    } catch (error) {
      logger.error('Error updating cleanup stats:', error);
    }
  }

  /**
   * Get cleanup statistics from Redis
   */
  public async getCleanupStats(): Promise<{
    lastCleanup: string;
    redisCleaned: number;
    dbDeleted: number;
    totalCleaned: number;
  }> {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return {
          lastCleanup: 'Never',
          redisCleaned: 0,
          dbDeleted: 0,
          totalCleaned: 0
        };
      }

      const stats = await redisClient.hgetall('cleanup_stats');
      if (!stats || Object.keys(stats).length === 0) {
        return {
          lastCleanup: 'Never',
          redisCleaned: 0,
          dbDeleted: 0,
          totalCleaned: 0
        };
      }

      return {
        lastCleanup: stats.lastCleanup || 'Never',
        redisCleaned: parseInt(stats.redisCleaned || '0', 10),
        dbDeleted: parseInt(stats.dbDeleted || '0', 10),
        totalCleaned: parseInt(stats.totalCleaned || '0', 10)
      };
    } catch (error) {
      logger.error('Error getting cleanup stats:', error);
      return {
        lastCleanup: 'Error',
        redisCleaned: 0,
        dbDeleted: 0,
        totalCleaned: 0
      };
    }
  }

  /**
   * Manually trigger cleanup (backward compatibility)
   * @deprecated Use performCleanup() directly
   */
  public async triggerCleanup(): Promise<void> {
    logger.info('Manual cleanup triggered...');
    await this.performCleanup();
  }

  /**
   * Manually trigger flush (backward compatibility)
   * @deprecated Use performFlush() directly
   */
  public async triggerFlush(): Promise<void> {
    logger.info('Manual flush triggered...');
    await this.performFlush();
  }

  /**
   * Stop method - no-op since no internal scheduling
   * Kept for backward compatibility
   */
  public stop(): void {
    logger.info('Message cleanup service stop called (no-op in on-demand mode)');
  }
}
