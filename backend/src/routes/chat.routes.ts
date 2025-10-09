import { Router, Request, Response } from 'express';
import { ragChat } from '../services/rag-chat.service';
import { authenticateToken, checkQueryLimits, AuthenticatedRequest } from '../middleware/auth.middleware';
import { SubscriptionService } from '../services/subscription.service';

const router = Router();
const subscriptionService = new SubscriptionService();

/**
 * Send a chat message - requires authentication and subscription
 */
router.post('/api/v2/chat', authenticateToken, checkQueryLimits, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('Chat request received:', {
      body: req.body,
      headers: req.headers['content-type']
    });
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      message,
      conversationId,
      temperature = 0.1,
      model,
      systemPrompt,
      ragWeight,
      useLocalDb,
      language,
      responseStyle,
      enableSemanticAnalysis = false,
      trackUserInsights = false
    } = req.body;

    const userId = req.user.userId;
    
    if (!message || message.trim() === '') {
      console.log('Message validation failed:', { message });
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('Processing message:', { message, conversationId, userId, temperature });
    
    // Pass all options to processMessage
    const result = await ragChat.processMessage(message, conversationId, userId, {
      temperature,
      model,
      systemPrompt,
      ragWeight,
      useLocalDb,
      language,
      responseStyle,
      enableSemanticAnalysis,
      trackUserInsights
    });
    
    console.log('Chat response:', {
      hasResponse: !!result.response,
      sourcesCount: result.sources?.length || 0
    });

    // Track user usage with semantic insights
    try {
      const trackingData: any = {
        message,
        responseLength: result.response?.length || 0,
        sourcesCount: result.sources?.length || 0,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      };

      // Add semantic analysis if enabled
      if (enableSemanticAnalysis || trackUserInsights) {
        trackingData.semanticAnalysis = {
          intent: result.intent || 'informational',
          topics: result.topics || [],
          keywords: result.keywords || [],
          sentiment: result.sentiment || 'neutral',
          complexity: result.complexity || 'medium'
        };
        trackingData.userInsights = trackUserInsights;
      }

      await subscriptionService.trackUserUsage(userId, 'chat_query', trackingData);
    } catch (trackingError) {
      console.error('Usage tracking error:', trackingError);
      // Don't fail the request if tracking fails
    }

    res.json(result);
  } catch (error: any) {
    console.error('Chat error details:', error);
    res.status(500).json({ 
      error: 'Chat processing failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Get user conversations - requires authentication
 */
router.get('/api/v2/chat/conversations', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.userId;

    const conversations = await ragChat.getUserConversations(userId);
    
    res.json({
      conversations,
      count: conversations.length
    });
  } catch (error: any) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

/**
 * Get specific conversation
 */
router.get('/api/v2/chat/conversation/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const conversation = await ragChat.getConversation(id);
    
    res.json(conversation);
  } catch (error: any) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * Get popular/suggested questions
 */
router.get('/api/v2/chat/suggestions', async (req: Request, res: Response) => {
  try {
    const suggestions = await ragChat.getPopularQuestions();
    res.json({ suggestions });
  } catch (error: any) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * Get more related results with pagination
 */
router.post('/api/v2/chat/related', async (req: Request, res: Response) => {
  try {
    const {
      query,
      excludeIds = [],
      offset = 0,
      limit = 7
    } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`Getting related results: query="${query}", offset=${offset}, limit=${limit}, exclude=${excludeIds.length} items`);

    const results = await ragChat.getRelatedTopicsPaginated(query, excludeIds, offset, limit);

    res.json({
      results,
      hasMore: results.length === limit,
      offset: offset + results.length
    });
  } catch (error: any) {
    console.error('Get related results error:', error);
    res.status(500).json({ error: 'Failed to get related results' });
  }
});

/**
 * Get chat statistics - requires authentication
 */
router.get('/api/v2/chat/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.userId;
    console.log(`Getting chat stats for user: ${userId}`);

    // Get database pool from ASEMB database connection
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.ASEMB_DATABASE_URL || 'postgresql://asemb:asemb_password@91.99.229.96:5432/asemb'
    });

    // Get basic chat statistics
    const [
      conversationsResult,
      messagesResult,
      recentActivityResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as total_conversations FROM conversations WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as total_messages FROM messages WHERE user_id = $1', [userId]),
      pool.query(`
        SELECT COUNT(*) as recent_messages
        FROM messages
        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      `, [userId])
    ]);

    const stats = {
      totalConversations: parseInt(conversationsResult.rows[0].total_conversations),
      totalMessages: parseInt(messagesResult.rows[0].total_messages),
      recentMessages: parseInt(recentActivityResult.rows[0].recent_messages),
      avgMessagesPerConversation: conversationsResult.rows[0].total_conversations > 0
        ? Math.round(parseInt(messagesResult.rows[0].total_messages) / parseInt(conversationsResult.rows[0].total_conversations))
        : 0,
      lastUpdated: new Date().toISOString()
    };

    console.log('Chat stats calculated:', stats);
    res.json(stats);

  } catch (error: any) {
    console.error('Get chat stats error:', error);
    res.status(500).json({
      error: 'Failed to get chat statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get more sources for a conversation (progressive loading)
 */
router.post('/api/v2/chat/more-sources', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { conversationId, currentSourceCount, maxResults = 14 } = req.body;
    const userId = req.user.userId;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Get conversation messages from database
    const pool = await import('pg').then(pg => new pg.Pool({
      connectionString: process.env.ASEMB_DATABASE_URL || 'postgresql://asemb:asemb_password@91.99.229.96:5432/asemb'
    }));

    const conversationResult = await pool.query(
      'SELECT sources FROM messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1',
      [conversationId, userId]
    );

    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const sources = conversationResult.rows[0].sources || [];

    // Return additional sources
    const additionalSources = sources.slice(currentSourceCount, currentSourceCount + 5);

    res.json({
      sources: additionalSources,
      hasMore: sources.length > currentSourceCount + additionalSources.length,
      totalSources: sources.length
    });

  } catch (error: any) {
    console.error('Get more sources error:', error);
    res.status(500).json({
      error: 'Failed to get more sources',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;