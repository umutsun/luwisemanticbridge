import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { MessageStorageService } from '../services/message-storage.service';
import { pool } from '../config/database.config';

const router = Router();

/**
 * Get message analytics
 */
router.get('/api/v2/messages/analytics', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { timeRange = 30 } = req.query;

    // Get basic stats
    const stats = await MessageStorageService.getMessageStats(userId);

    // Get user patterns
    const patterns = await MessageStorageService.analyzeUserPatterns(
      userId,
      parseInt(timeRange as string)
    );

    // Get popular topics
    const topics = await MessageStorageService.getPopularTopics(20);

    res.json({
      stats,
      patterns,
      topics,
      userRole: req.user?.role,
      timeRange: parseInt(timeRange as string)
    });
  } catch (error: any) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Failed to get analytics',
      details: error.message
    });
  }
});

/**
 * Get session details with full context
 */
router.get('/api/v2/messages/sessions/:sessionId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    const messages = await MessageStorageService.getSessionMessages(sessionId, userId);

    // Group messages by interaction
    const interactions = messages.reduce((acc: any, message: any) => {
      const interactionId = message.metadata?.interactionId || 'default';
      if (!acc[interactionId]) {
        acc[interactionId] = {
          id: interactionId,
          timestamp: message.timestamp || message.created_at,
          messages: []
        };
      }
      acc[interactionId].messages.push(message);
      return acc;
    }, {});

    res.json({
      sessionId,
      interactions: Object.values(interactions),
      totalMessages: messages.length
    });
  } catch (error: any) {
    console.error('Get session details error:', error);
    res.status(500).json({
      error: 'Failed to get session details',
      details: error.message
    });
  }
});

/**
 * Flush session to embeddings manually
 */
router.post('/api/v2/messages/sessions/:sessionId/flush', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    await MessageStorageService.flushSessionToEmbeddings(sessionId, userId);

    res.json({
      success: true,
      message: 'Session flushed to embeddings successfully'
    });
  } catch (error: any) {
    console.error('Flush session error:', error);
    res.status(500).json({
      error: 'Failed to flush session',
      details: error.message
    });
  }
});

/**
 * Get user sessions list
 */
router.get('/api/v2/messages/sessions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { limit = 20, offset = 0 } = req.query;

    const query = `
      SELECT DISTINCT
        session_id,
        MIN(created_at) as started_at,
        MAX(created_at) as last_activity,
        COUNT(*) as message_count,
        COUNT(DISTINCT message_type) as message_types,
        json_agg(
          json_build_object(
            'type', message_type,
            'content', LEFT(content, 100),
            'timestamp', created_at
          ) ORDER BY created_at ASC
        ) FILTER (WHERE message_type = 'question') as questions
      FROM message_embeddings
      WHERE user_id = $1
      GROUP BY session_id
      ORDER BY MAX(created_at) DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool?.query(query, [userId, limit, offset]);

    res.json({
      sessions: result?.rows || [],
      total: result?.rows.length || 0
    });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      error: 'Failed to get sessions',
      details: error.message
    });
  }
});

/**
 * Search in user's message embeddings
 */
router.post('/api/v2/messages/search', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { query, limit = 10, includeSources = false } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Search in message_embeddings with user filter
    const searchQuery = `
      SELECT
        me.id,
        me.session_id,
        me.message_type,
        me.content,
        me.created_at,
        me.metadata,
        1 - (me.embedding <=> ai.generate_embedding($1)) as similarity
      FROM message_embeddings me, ai.generate_embedding($1) embedding
      WHERE me.user_id = $2
        AND me.embedding IS NOT NULL
        AND (1 - (me.embedding <=> embedding)) >= 0.3
      ORDER BY similarity DESC
      LIMIT $3
    `;

    const result = await pool?.query(searchQuery, [query, userId, limit]);

    const messages = result?.rows.map(row => ({
      ...row,
      sources: includeSources ? row.metadata?.sources || [] : [],
      contentPreview: row.content.substring(0, 200) + (row.content.length > 200 ? '...' : '')
    })) || [];

    res.json({
      messages,
      count: messages.length,
      query
    });
  } catch (error: any) {
    console.error('Search messages error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

/**
 * Export user messages (GDPR)
 */
router.get('/api/v2/messages/export', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { format = 'json' } = req.query;

    const query = `
      SELECT
        session_id,
        message_type,
        content,
        metadata,
        created_at
      FROM message_embeddings
      WHERE user_id = $1
      ORDER BY session_id, created_at ASC
    `;

    const result = await pool?.query(query, [userId]);

    if (format === 'csv') {
      // Generate CSV
      const csv = [
        'Session ID,Type,Content,Created At',
        ...result?.rows.map(row =>
          `"${row.session_id}","${row.message_type}","${row.content.replace(/"/g, '""')}","${row.created_at}"`
        ) || []
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="messages-${userId}.csv"`);
      res.send(csv);
    } else {
      // Return JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="messages-${userId}.json"`);
      res.json({
        userId,
        exportedAt: new Date().toISOString(),
        messages: result?.rows || []
      });
    }
  } catch (error: any) {
    console.error('Export messages error:', error);
    res.status(500).json({
      error: 'Export failed',
      details: error.message
    });
  }
});

/**
 * Clean up old messages (Admin only)
 */
router.post('/api/v2/messages/cleanup', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { daysToKeep = 90 } = req.body;

    await MessageStorageService.cleanupOldMessages(daysToKeep);

    res.json({
      success: true,
      message: `Cleaned up messages older than ${daysToKeep} days`
    });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

export default router;