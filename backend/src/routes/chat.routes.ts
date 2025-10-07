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

export default router;