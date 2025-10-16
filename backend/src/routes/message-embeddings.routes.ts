import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { lsembPool } from '../config/database.config';
import { semanticSearch } from '../services/semantic-search.service';

const router = Router();

/**
 * Search in message embeddings
 */
router.post('/api/v2/messages/search', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Perform semantic search limited to message_embeddings
    const searchResults = await semanticSearch.semanticSearch(query, limit);

    // Filter only message_embeddings results
    const messageResults = searchResults
      .filter(result => result.source_table === 'message_embeddings')
      .map(result => ({
        id: result.id,
        title: result.title,
        content: result.excerpt,
        sessionId: result.metadata?.session_id,
        messageType: result.metadata?.message_type,
        timestamp: result.created_at,
        score: result.score,
        sourceType: 'Mesajlar'
      }));

    res.json({
      results: messageResults,
      count: messageResults.length
    });
  } catch (error: any) {
    console.error('Message search error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

/**
 * Get user's message history
 */
router.get('/api/v2/messages/history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { limit = 50, sessionId } = req.query;

    let query = `
      SELECT
        session_id,
        message_type,
        content,
        metadata,
        created_at
      FROM message_embeddings
      WHERE user_id = $1
    `;

    const params: any[] = [userId];
    let paramIndex = 2;

    if (sessionId) {
      query += ` AND session_id = $${paramIndex++}`;
      params.push(sessionId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await lsembPool?.query(query, params);

    res.json({
      messages: result?.rows || [],
      count: result?.rows.length || 0
    });
  } catch (error: any) {
    console.error('Get message history error:', error);
    res.status(500).json({
      error: 'Failed to get message history',
      details: error.message
    });
  }
});

/**
 * Get message statistics
 */
router.get('/api/v2/messages/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const queries = {
      totalMessages: `
        SELECT COUNT(*) as count
        FROM message_embeddings
        WHERE user_id = $1
      `,
      totalSessions: `
        SELECT COUNT(DISTINCT session_id) as count
        FROM message_embeddings
        WHERE user_id = $1
      `,
      questionsVsAnswers: `
        SELECT
          message_type,
          COUNT(*) as count
        FROM message_embeddings
        WHERE user_id = $1
        GROUP BY message_type
      `,
      recentActivity: `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as message_count
        FROM message_embeddings
        WHERE user_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `
    };

    const stats: any = {};

    for (const [key, query] of Object.entries(queries)) {
      const result = await lsembPool?.query(query, [userId]);
      stats[key] = result?.rows || [];
    }

    res.json(stats);
  } catch (error: any) {
    console.error('Get message stats error:', error);
    res.status(500).json({
      error: 'Failed to get message statistics',
      details: error.message
    });
  }
});

/**
 * Delete session messages (GDPR)
 */
router.delete('/api/v2/messages/session/:sessionId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    // First verify the session belongs to the user
    const checkQuery = `
      SELECT COUNT(*) as count
      FROM message_embeddings
      WHERE session_id = $1 AND user_id = $2
    `;
    const checkResult = await lsembPool?.query(checkQuery, [sessionId, userId]);

    if (!checkResult?.rows[0]?.count) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete all messages from this session
    const deleteQuery = `
      DELETE FROM message_embeddings
      WHERE session_id = $1 AND user_id = $2
    `;
    await lsembPool?.query(deleteQuery, [sessionId, userId]);

    res.json({ success: true, message: 'Session messages deleted' });
  } catch (error: any) {
    console.error('Delete session messages error:', error);
    res.status(500).json({
      error: 'Failed to delete session messages',
      details: error.message
    });
  }
});

/**
 * Generate embeddings for user messages
 */
router.post('/api/v2/messages/embeddings/generate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Start the embedding generation process
    const embeddingService = require('../services/message-embeddings.service');
    const jobId = await embeddingService.generateUserMessageEmbeddings(userId);

    res.json({
      success: true,
      message: 'Message embedding generation started',
      jobId: jobId
    });
  } catch (error: any) {
    console.error('Generate message embeddings error:', error);
    res.status(500).json({
      error: 'Failed to start message embedding generation',
      details: error.message
    });
  }
});

export default router;