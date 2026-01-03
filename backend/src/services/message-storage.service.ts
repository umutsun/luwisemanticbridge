import { pool, lsembPool } from '../config/database.config';
import { LLMManager } from './llm-manager.service';
import { redisClient } from '../config/redis';
import { initializeRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Get the actual Redis client instance
const getRedisClient = () => {
  const client = redisClient();
  if (!client) {
    throw new Error('Redis client not initialized');
  }
  return client;
};

interface EnhancedMessageData {
  sessionId: string;
  userId?: string;
  type: 'question' | 'answer' | 'search_result' | 'source_context';
  content: string;
  metadata?: {
    model?: string;
    tokens?: number;
    confidence?: number;
    sources?: any[];
    searchResults?: any[];
    query?: string;
    processingTime?: number;
    relevanceScore?: number;
    sessionPosition?: number;
    [key: string]: any;
  };
}

interface MessageBatch {
  sessionId: string;
  userId: string;
  messages: EnhancedMessageData[];
  createdAt: Date;
}

export class MessageStorageService {
  private readonly REDIS_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
  private readonly MAX_MESSAGES_PER_SESSION = 100;
  private readonly FLUSH_THRESHOLD = 50; // Embed after 50 messages
  private readonly FLUSH_INTERVAL = 30 * 60 * 1000; // 30 minutes

  /**
   * Store message in Redis temporarily
   */
  static async storeMessageInRedis(data: EnhancedMessageData): Promise<void> {
    try {
      const redisKey = `messages:${data.sessionId}:${data.userId || 'anonymous'}`;
      const messageId = uuidv4();

      const messageWithId = {
        id: messageId,
        ...data,
        timestamp: new Date().toISOString()
      };

      // Store in Redis list
      const redis = getRedisClient();
      await redis.lpush(redisKey, JSON.stringify(messageWithId));
      await redis.expire(redisKey, 7 * 24 * 60 * 60); // 7 days TTL

      // Check if we should flush to embeddings
      const messageCount = await redis.llen(redisKey);
      if (messageCount >= this.FLUSH_THRESHOLD) {
        await this.flushSessionToEmbeddings(data.sessionId, data.userId);
      }

      logger.info(`Message stored in Redis: ${data.type} for session ${data.sessionId}`);
    } catch (error) {
      logger.error('Error storing message in Redis:', error);
    }
  }

  /**
   * Enhanced save with search results and sources
   */
  static async saveEnhancedMessage(data: EnhancedMessageData): Promise<void> {
    const { sessionId, userId, type, content, metadata = {} } = data;

    try {
      // Store in Redis first
      await this.storeMessageInRedis(data);

      // Also generate embedding immediately for important messages (if table exists)
      if (type === 'answer' || type === 'search_result') {
        // Check if table exists first
        const tableCheck = await lsembPool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'message_embeddings'
          );
        `);

        if (tableCheck.rows[0].exists) {
          const embedding = await LLMManager.generateEmbedding(content);

          // Store in message_embeddings with full context
          const query = `
            INSERT INTO message_embeddings (session_id, user_id, message_type, content, embedding, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
            RETURNING id
          `;

          await lsembPool.query(query, [sessionId, userId, type, content, embedding, {
            ...metadata,
            sourceType: 'message_embeddings',
            isEmbedded: true,
            embeddedAt: new Date().toISOString()
          }]);
        }
      }
    } catch (error) {
      logger.error('Error saving enhanced message:', error);
    }
  }

  /**
   * Save complete chat interaction with context
   */
  static async saveChatInteraction(
    sessionId: string,
    userId: string,
    question: string,
    answer: string,
    searchResults: any[] = [],
    sources: any[] = [],
    metadata: any = {}
  ): Promise<void> {
    const interactionId = uuidv4();
    const timestamp = new Date().toISOString();

    // Save question
    await this.saveEnhancedMessage({
      sessionId,
      userId,
      type: 'question',
      content: question,
      metadata: {
        ...metadata,
        interactionId,
        position: 1,
        timestamp
      }
    });

    // Save search results if available
    if (searchResults.length > 0) {
      await this.saveEnhancedMessage({
        sessionId,
        userId,
        type: 'search_result',
        content: `Search results for: ${question}`,
        metadata: {
          ...metadata,
          interactionId,
          searchResults,
          resultCount: searchResults.length,
          position: 2,
          timestamp
        }
      });
    }

    // Save answer with sources
    await this.saveEnhancedMessage({
      sessionId,
      userId,
      type: 'answer',
      content: answer,
      metadata: {
        ...metadata,
        interactionId,
        sources,
        sourceCount: sources.length,
        position: 3,
        timestamp
      }
    });

    // Update session activity
    await this.updateSessionActivity(sessionId, userId);
  }

  /**
   * Flush Redis messages to embeddings table
   */
  static async flushSessionToEmbeddings(sessionId: string, userId?: string): Promise<void> {
    try {
      const redisKey = `messages:${sessionId}:${userId || 'anonymous'}`;
      const redis = getRedisClient();
      const messages = await redis.lrange(redisKey, 0, -1);

      if (messages.length === 0) return;

      const batchMessages: MessageBatch = {
        sessionId,
        userId: userId || 'anonymous',
        messages: messages.map(m => JSON.parse(m)),
        createdAt: new Date()
      };

      // Process messages in batch
      for (const message of batchMessages.messages) {
        if (message.type === 'search_result' || message.type === 'source_context') {
          const embedding = await LLMManager.generateEmbedding(message.content);

          await lsembPool.query(`
            INSERT INTO message_embeddings (session_id, user_id, message_type, content, embedding, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `, [
            sessionId,
            userId,
            message.type,
            message.content,
            embedding,
            {
              ...message.metadata,
              batchProcessed: true,
              batchId: batchMessages.sessionId,
              flushedAt: new Date().toISOString()
            }
          ]);
        }
      }

      // Clear Redis after successful flush
      await redis.del(redisKey);
      logger.info(`Flushed ${messages.length} messages to embeddings for session ${sessionId}`);
    } catch (error) {
      logger.error('Error flushing session to embeddings:', error);
    }
  }

  /**
   * Get session messages from Redis or database
   */
  static async getSessionMessages(sessionId: string, userId?: string): Promise<any[]> {
    const redisKey = `messages:${sessionId}:${userId || 'anonymous'}`;

    try {
      // Try Redis first
      const redis = getRedisClient();
      const redisMessages = await redis.lrange(redisKey, 0, -1);
      if (redisMessages.length > 0) {
        return redisMessages.map(m => JSON.parse(m));
      }

      // Fallback to database
      const query = `
        SELECT message_type, content, metadata, created_at
        FROM message_embeddings
        WHERE session_id = $1
        ORDER BY created_at ASC
        LIMIT 100
      `;

      const result = await lsembPool.query(query, [sessionId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting session messages:', error);
      return [];
    }
  }

  /**
   * Analyze cross-session patterns
   */
  static async analyzeUserPatterns(userId: string, timeRange: number = 30): Promise<any> {
    const query = `
      WITH session_analysis AS (
        SELECT
          session_id,
          COUNT(*) as message_count,
          MIN(created_at) as session_start,
          MAX(created_at) as session_end,
          COUNT(DISTINCT message_type) as message_types
        FROM message_embeddings
        WHERE user_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '${timeRange} days'
        GROUP BY session_id
      ),
      topic_analysis AS (
        SELECT
          COUNT(*) as frequency,
          ts_rank_cd(to_tsvector('turkish', content), query) as relevance
        FROM message_embeddings, plainto_tsquery('turkish', 'vergi|kdv|gelir|kurumlar') query
        WHERE user_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '${timeRange} days'
          AND to_tsvector @@ query
        GROUP BY message_type, query
      )
      SELECT
        COUNT(DISTINCT session_id) as total_sessions,
        SUM(message_count) as total_messages,
        AVG(message_count) as avg_messages_per_session,
        AVG(session_end - session_start) as avg_session_duration,
        (SELECT json_agg(json_build_object('frequency', frequency, 'relevance', relevance)) FROM topic_analysis) as topics
      FROM session_analysis
    `;

    try {
      const result = await lsembPool.query(query, [userId]);
      return result.rows[0] || {};
    } catch (error) {
      logger.error('Error analyzing user patterns:', error);
      return {};
    }
  }

  /**
   * Get popular topics from all user messages
   */
  static async getPopularTopics(limit: number = 20): Promise<any[]> {
    const query = `
      SELECT
        word,
        COUNT(*) as frequency,
        AVG(CASE WHEN message_type = 'answer' THEN 1 ELSE 0 END) as answer_ratio
      FROM (
        SELECT
          unnest(regexp_split_to_array(lower(content), '\\s+')) as word,
          message_type
        FROM message_embeddings
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      ) words
      WHERE length(word) > 3
        AND word NOT IN ('ve', 'ile', 'için', 'göre', 'bir', 'bu', 'olarak', 'daha', 'kadar', 'sonra')
      GROUP BY word
      HAVING COUNT(*) > 5
      ORDER BY frequency DESC
      LIMIT $1
    `;

    try {
      const result = await lsembPool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting popular topics:', error);
      return [];
    }
  }

  /**
   * Clean up old messages from Redis and database
   */
  static async cleanupOldMessages(daysToKeep: number = 90): Promise<void> {
    try {
      // Clean up old Redis messages (should auto-expire, but just in case)
      const redis = getRedisClient();
      const keys = await redis.keys('messages:*');
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) { // No expiry set
          await redis.expire(key, this.REDIS_TTL);
        }
      }

      // Clean up old database messages
      await lsembPool.query(`
        DELETE FROM message_embeddings
        WHERE created_at < CURRENT_DATE - INTERVAL '${daysToKeep} days'
          AND user_id IS NOT NULL
      `);

      logger.info(`Cleaned up messages older than ${daysToKeep} days`);
    } catch (error) {
      logger.error('Error cleaning up old messages:', error);
    }
  }

  /**
   * Update session activity tracking
   */
  private static async updateSessionActivity(sessionId: string, userId: string): Promise<void> {
    try {
      const activityKey = `session_activity:${userId}`;
      const redis = getRedisClient();
      await redis.hset(activityKey, sessionId, new Date().toISOString());
      await redis.expire(activityKey, 24 * 60 * 60); // 24 hours
    } catch (error) {
      logger.error('Error updating session activity:', error);
    }
  }

  /**
   * Save basic Q&A pair for backward compatibility
   */
  static async saveQAPair(
    sessionId: string,
    question: string,
    answer: string,
    userId: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      // Ensure conversation exists first
      await lsembPool.query(`
        INSERT INTO conversations (id, user_id, title, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [sessionId, userId, question.substring(0, 100)]);

      // Note: messages table doesn't have user_id column, it uses conversation_id instead
      // user_id is stored in the conversations table
      // Token columns: prompt_tokens, completion_tokens, total_tokens, cost_usd
      const userQuery = `
        INSERT INTO messages (conversation_id, content, role, metadata, created_at, prompt_tokens, completion_tokens, total_tokens, cost_usd)
        VALUES ($1, $2, $3, $4, NOW(), 0, 0, 0, 0)
      `;

      // Extract token usage from metadata if available
      const usage = metadata.usage || {};
      const promptTokens = usage.promptTokens || 0;
      const completionTokens = usage.completionTokens || 0;
      const totalTokens = usage.totalTokens || (promptTokens + completionTokens);

      // Calculate cost (approximate: $0.002 per 1K tokens for average models)
      const costUsd = metadata.costUsd || (totalTokens * 0.000002);

      const assistantQuery = `
        INSERT INTO messages (conversation_id, content, role, metadata, created_at, prompt_tokens, completion_tokens, total_tokens, cost_usd)
        VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
      `;

      await lsembPool.query(userQuery, [
        sessionId,
        question,
        'user',
        { ...metadata, userId, timestamp: new Date().toISOString() }
      ]);

      await lsembPool.query(assistantQuery, [
        sessionId,
        answer,
        'assistant',
        { ...metadata, userId, timestamp: new Date().toISOString() },
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd
      ]);

      if (totalTokens > 0) {
        logger.info(`Q&A pair saved with tokens: ${totalTokens} (prompt: ${promptTokens}, completion: ${completionTokens}, cost: $${costUsd.toFixed(6)})`);
      } else {
        logger.info(`Basic Q&A pair saved for session: ${sessionId}`);
      }
    } catch (error) {
      logger.error('Error saving Q&A pair:', error);
      throw error;
    }
  }

  /**
   * Save quality feedback for a message
   */
  static async saveQualityFeedback(
    userId: string,
    messageId: string,
    rating: number,
    comment?: string
  ): Promise<void> {
    try {
      // Store feedback in database
      await lsembPool.query(`
        INSERT INTO message_feedback (user_id, message_id, rating, comment, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, message_id)
        DO UPDATE SET rating = $3, comment = $4, updated_at = NOW()
      `, [userId, messageId, rating, comment]);

      logger.info(`Quality feedback saved for message ${messageId} by user ${userId}`);
    } catch (error) {
      logger.error('Error saving quality feedback:', error);
      // Don't throw - feedback is not critical
    }
  }

  /**
   * Get message statistics for dashboard
   */
  static async getMessageStats(userId?: string): Promise<any> {
    const userFilter = userId ? 'WHERE user_id = $1' : '';
    const params = userId ? [userId] : [];

    const queries = {
      totalMessages: `SELECT COUNT(*) as count FROM message_embeddings ${userFilter}`,
      totalSessions: `SELECT COUNT(DISTINCT session_id) as count FROM message_embeddings ${userFilter}`,
      messageTypes: `
        SELECT message_type, COUNT(*) as count
        FROM message_embeddings ${userFilter}
        GROUP BY message_type
      `,
      dailyActivity: `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as messages,
          COUNT(DISTINCT session_id) as sessions
        FROM message_embeddings ${userFilter}
          AND created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `,
      topQueries: `
        SELECT
          content,
          COUNT(*) as frequency
        FROM message_embeddings ${userFilter}
          AND message_type = 'question'
          AND created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY content
        ORDER BY frequency DESC
        LIMIT 10
      `
    };

    const stats: any = {};

    for (const [key, query] of Object.entries(queries)) {
      try {
        const result = await lsembPool.query(query, params);
        stats[key] = result.rows;
      } catch (error) {
        stats[key] = [];
        logger.error(`Error in ${key} query:`, error);
      }
    }

    return stats;
  }
}