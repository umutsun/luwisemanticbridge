import { Router, Request, Response } from 'express';
import { ragChat } from '../services/rag-chat.service';
import { authenticateToken, checkQueryLimits, AuthenticatedRequest } from '../middleware/auth.middleware';
import { SubscriptionService } from '../services/subscription.service';
import { lsembPool } from '../config/database.config';
import dbConfig from '../config/database';
import { chatWss, chatConnections } from '../server';
import { MessageStorageService } from '../services/message-storage.service';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const subscriptionService = new SubscriptionService();

/**
 * Send a chat message - requires authentication and subscription
 */
router.post('/api/v2/chat', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
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
      temperature: requestTemperature,
      model,
      systemPrompt,
      ragWeight,
      useLocalDb,
      language,
      responseStyle,
      enableSemanticAnalysis = false,
      trackUserInsights = false,
      stream = false,
      clientId
    } = req.body;

    const userId = req.user.userId;

    // Get temperature from settings if not provided in request
    let temperature = requestTemperature;
    if (temperature === undefined || temperature === null) {
      try {
        const tempSetting = await dbConfig.query(`
          SELECT value FROM settings
          WHERE key IN ('llmSettings.temperature', 'temperature', 'content_generation_temperature')
          ORDER BY CASE key
            WHEN 'llmSettings.temperature' THEN 1
            WHEN 'temperature' THEN 2
            ELSE 3
          END
          LIMIT 1
        `);

        if (tempSetting.rows.length > 0) {
          const parsed = parseFloat(tempSetting.rows[0].value);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
            temperature = parsed;
            console.log(`️  Using temperature from settings: ${temperature}`);
          }
        }
      } catch (error) {
        console.warn('Failed to get temperature from settings, using default:', error);
      }

      // Final fallback
      if (temperature === undefined || temperature === null) {
        temperature = 0.7; // Balanced default
        console.log(`️  Using default temperature: ${temperature}`);
      }
    }

    if (!message || message.trim() === '') {
      console.log('Message validation failed:', { message });
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(' [CHAT] Processing message:', {
      message: message.substring(0, 50),
      conversationId,
      userId,
      temperature,
      model: model || 'NOT PROVIDED',
      stream
    });

    // Check if WebSocket streaming is requested
    if (stream && clientId && chatWss) {
      const wsConnection = chatConnections.get(clientId);
      if (wsConnection) {
        // Start streaming response
        streamChatResponse(wsConnection, {
          message,
          conversationId,
          userId,
          temperature,
          model,
          systemPrompt,
          ragWeight,
          useLocalDb,
          language,
          responseStyle,
          enableSemanticAnalysis,
          trackUserInsights,
          req
        });
        res.json({ streaming: true, clientId });
        return;
      }
    }

    // Non-streaming response (fallback)
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

    // Save enhanced chat interaction with search results and sources
    // This is done asynchronously to not block the response
    if (result.response && result.response.trim() !== '') {
      setImmediate(async () => {
        try {
          // Save with enhanced storage (includes search results and sources)
          await MessageStorageService.saveChatInteraction(
            conversationId || uuidv4(),
            userId,
            message,
            result.response,
            (result as any).searchResults || [],
            result.sources || [],
            {
              model: model || 'default',
              processingTime: (result as any).processingTime,
              confidence: (result as any).confidence,
              ragWeight: ragWeight,
              temperature: temperature
            }
          );

          // Also save to basic storage for backward compatibility
          await MessageStorageService.saveQAPair(
            conversationId || uuidv4(),
            message,
            result.response,
            userId,
            {
              model: model || 'default',
              sourcesCount: result.sources?.length || 0,
              processingTime: (result as any).processingTime,
              confidence: (result as any).confidence
            }
          );

          console.log('Enhanced message interaction saved:', { conversationId, userId });
        } catch (saveError) {
          console.error('Failed to save message interaction:', saveError);
        }
      });
    }

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
          intent: (result as any).intent || 'informational',
          topics: (result as any).topics || [],
          keywords: (result as any).keywords || [],
          sentiment: (result as any).sentiment || 'neutral',
          complexity: (result as any).complexity || 'medium'
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
 * Get popular/suggested questions - Schema-aware suggestions
 */
router.get('/api/v2/chat/suggestions', async (req: Request, res: Response) => {
  try {
    let suggestions: string[] = [];

    // Try to get user ID from token (if authenticated)
    // Parse Authorization header if present
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userId = payload.userId || payload.id;
      } catch (error) {
        // Not a valid token, proceed without user context
      }
    }

    // If user is authenticated, get schema-aware suggestions
    if (userId) {
      try {
        const { DataSchemaService } = await import('../services/data-schema.service');
        const dataSchemaService = new DataSchemaService();

        const activeSchema = await dataSchemaService.getActiveSchemaForUser(userId);

        if (activeSchema?.templates) {
          // First priority: Use example_questions (static, no placeholders)
          const exampleQuestions = (activeSchema.templates as any).example_questions;
          if (exampleQuestions && Array.isArray(exampleQuestions) && exampleQuestions.length > 0) {
            suggestions = [...exampleQuestions];
            console.log(`[Suggestions] Using example_questions for schema: ${activeSchema.name}`);
          }
          // Second priority: Use question templates that don't have placeholders
          else if (activeSchema.templates.questions && activeSchema.templates.questions.length > 0) {
            // Filter out templates with {{placeholders}} - only use static questions
            const staticQuestions = activeSchema.templates.questions.filter(
              (q: string) => !q.includes('{{') && !q.includes('}}')
            );
            if (staticQuestions.length > 0) {
              suggestions = [...staticQuestions];
              console.log(`[Suggestions] Using static questions from schema: ${activeSchema.name}`);
            }
          }

          if (suggestions.length > 0) {
            // Shuffle for variety
            suggestions = suggestions.sort(() => Math.random() - 0.5);
            // Limit to 4 suggestions
            suggestions = suggestions.slice(0, 4);
          }
        }
      } catch (schemaError) {
        console.error('[Suggestions] Failed to get schema-aware suggestions:', schemaError);
      }
    }

    // Fallback: use default schema example_questions or chatbot settings
    if (suggestions.length === 0) {
      try {
        // First try: Get default schema's example questions (genel_dokuman)
        const { DataSchemaService } = await import('../services/data-schema.service');
        const dataSchemaService = new DataSchemaService();

        // Get default preset (genel_dokuman or first active preset) - use 'enterprise' to bypass tier filter
        const presets = await dataSchemaService.getIndustryPresets(undefined, 'enterprise');
        console.log(`[Suggestions] Found ${presets.length} presets, names: ${presets.map(p => p.schema_name).join(', ')}`);

        const defaultPreset = presets.find(p => p.schema_name === 'genel_dokuman') || presets[0];

        if (defaultPreset?.templates) {
          const exampleQuestions = (defaultPreset.templates as any).example_questions;
          console.log(`[Suggestions] Preset ${defaultPreset.schema_name} has example_questions:`, exampleQuestions ? 'YES' : 'NO');
          if (exampleQuestions && Array.isArray(exampleQuestions) && exampleQuestions.length > 0) {
            suggestions = [...exampleQuestions];
            console.log(`[Suggestions] Using default preset example_questions: ${defaultPreset.schema_name} (${suggestions.length} questions)`);
          }
        }
      } catch (presetError) {
        console.error('[Suggestions] Failed to get preset questions:', presetError);
      }
    }

    // Final fallback: chatbot settings or popular questions (only if still empty)
    if (suggestions.length === 0) {
      const settingsResult = await dbConfig.query(`
        SELECT value FROM settings WHERE key = 'chatbot'
      `);

      if (settingsResult.rows.length > 0) {
        const rawValue = settingsResult.rows[0].value;
        const chatbotData = typeof rawValue === 'string' ? JSON.parse(rawValue) : (rawValue || {});

        // Only use auto-generated questions if explicitly enabled
        const autoGenerate = chatbotData.autoGenerateSuggestions !== undefined
          ? chatbotData.autoGenerateSuggestions
          : false;  // Changed default to false - prefer schema questions

        if (autoGenerate) {
          suggestions = await ragChat.getPopularQuestions();
        } else {
          suggestions = chatbotData.suggestionQuestions || [];
        }
      }
    }

    // Final shuffle and limit
    if (suggestions.length > 0) {
      suggestions = suggestions.sort(() => Math.random() - 0.5).slice(0, 4);
    }

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

    // Use existing database connection pool
    const pool = lsembPool;

    // Get basic chat statistics
    const [
      conversationsResult,
      messagesResult,
      recentActivityResult
    ] = await Promise.all([
      lsembPool.query('SELECT COUNT(*) as total_conversations FROM conversations WHERE user_id = $1', [userId]),
      lsembPool.query(`
        SELECT COUNT(*) as total_messages
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.user_id = $1
      `, [userId]),
      lsembPool.query(`
        SELECT COUNT(*) as recent_messages
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.user_id = $1 AND m.created_at > NOW() - INTERVAL '24 hours'
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

    // Return default values on error to prevent frontend crashes
    const defaultStats = {
      totalConversations: 0,
      totalMessages: 0,
      recentMessages: 0,
      avgMessagesPerConversation: 0,
      lastUpdated: new Date().toISOString()
    };

    res.json(defaultStats);
  }
});

/**
 * Get dashboard statistics for admins - requires authentication
 */
router.get('/api/v2/chat/dashboard-stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('Getting dashboard stats for admin user');

    // Import pool if lsembPool is undefined
    const pool = lsembPool;

    // Get global chat statistics
    const [
      totalConversationsResult,
      totalMessagesResult,
      recentMessagesResult,
      totalUsersResult,
      activeUsersTodayResult,
      avgMessagesResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as total_conversations FROM conversations'),
      pool.query('SELECT COUNT(*) as total_messages FROM messages'),
      pool.query(`
        SELECT COUNT(*) as recent_messages
        FROM messages
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `),
      pool.query('SELECT COUNT(*) as total_users FROM users WHERE role = $1', ['user']),
      pool.query(`
        SELECT COUNT(DISTINCT c.user_id) as active_users_today
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE m.created_at > NOW() - INTERVAL '24 hours'
      `),
      pool.query(`
        SELECT AVG(message_count) as avg_messages
        FROM (
          SELECT COUNT(*) as message_count
          FROM messages
          GROUP BY conversation_id
        ) AS conversation_stats
      `)
    ]);

    const totalConversations = parseInt(totalConversationsResult.rows[0].total_conversations);
    const totalMessages = parseInt(totalMessagesResult.rows[0].total_messages);
    const recentMessages = parseInt(recentMessagesResult.rows[0].recent_messages);
    const totalUsers = parseInt(totalUsersResult.rows[0].total_users);
    const activeUsersToday = parseInt(activeUsersTodayResult.rows[0].active_users_today);
    const avgMessagesPerConversation = avgMessagesResult.rows[0].avg_messages
      ? Math.round(parseFloat(avgMessagesResult.rows[0].avg_messages))
      : 0;

    const stats = {
      overview: {
        total_conversations: totalConversations,
        total_messages: totalMessages,
        total_users: totalUsers
      },
      recentMessages: recentMessages,
      avgMessagesPerConversation: avgMessagesPerConversation,
      daily_activity: [{
        date: new Date().toISOString().split('T')[0],
        active_users: activeUsersToday,
        conversations: totalConversations,
        messages: recentMessages
      }],
      lastUpdated: new Date().toISOString()
    };

    console.log('Dashboard stats calculated:', stats);
    res.json(stats);

  } catch (error: any) {
    console.error('Get dashboard stats error:', error);

    // Return default values on error to prevent frontend crashes
    const defaultStats = {
      overview: {
        total_conversations: 0,
        total_messages: 0,
        total_users: 0
      },
      recentMessages: 0,
      avgMessagesPerConversation: 0,
      daily_activity: [{
        date: new Date().toISOString().split('T')[0],
        active_users: 0,
        conversations: 0,
        messages: 0
      }],
      lastUpdated: new Date().toISOString()
    };

    res.json(defaultStats);
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
      connectionString: process.env.ASEMB_DATABASE_URL || 'postgresql://lsemb:lsemb_password@91.99.229.96:5432/lsemb'
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

/**
 * Load more search results with dynamic loading (NEW)
 * This endpoint enables scroll-to-load functionality for chat search results
 */
router.post('/api/v2/chat/load-more-results', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { query, offset = 0, conversationId } = req.body;
    const userId = req.user.userId;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(` Loading more results for user ${userId}: query="${query}", offset=${offset}`);

    // Get more search results using the new method
    const result = await ragChat.getMoreSearchResults(query, offset, conversationId);

    // Track usage for analytics
    try {
      await subscriptionService.trackUserUsage(userId, 'load_more_results', {
        query,
        offset,
        resultsCount: result.sources.length,
        hasMore: result.hasMore
      });
    } catch (trackingError) {
      console.error('Usage tracking error:', trackingError);
    }

    res.json({
      success: true,
      sources: result.sources,
      hasMore: result.hasMore,
      nextOffset: result.nextOffset,
      loadedCount: result.sources.length
    });

  } catch (error: any) {
    console.error('Load more results error:', error);
    res.status(500).json({
      error: 'Failed to load more results',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Streaming chat response via WebSocket
 */
async function streamChatResponse(
  ws: any,
  options: {
    message: string;
    conversationId?: string;
    userId: string;
    temperature?: number;
    model?: string;
    systemPrompt?: string;
    ragWeight?: number;
    useLocalDb?: boolean;
    language?: string;
    responseStyle?: string;
    enableSemanticAnalysis?: boolean;
    trackUserInsights?: boolean;
    req: any;
  }
) {
  const { message, conversationId, userId, req } = options;

  try {
    // Send initial status
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'status',
        status: 'searching',
        message: 'Aramalar yapılıyor...'
      }));
    }

    // Perform search directly using semantic search
    const { semanticSearch } = await import('../services/semantic-search.service');
    const ragChatModule = await import('../services/rag-chat.service');

    // Create a simple settings service
    const settingsService = {
      async getSetting(key: string): Promise<string | null> {
        try {
          const { default: pool } = await import('../config/database');
          const result = await pool.query(
            'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
            [key]
          );
          return result.rows[0]?.setting_value || null;
        } catch (error) {
          console.error('Error fetching setting:', error);
          return null;
        }
      }
    };

    // Get search settings
    const maxResults = parseInt(await settingsService.getSetting('ragSettings.maxResults') || '7');
    const minResults = parseInt(await settingsService.getSetting('ragSettings.minResults') || '5');
    const minThreshold = parseFloat(await settingsService.getSetting('ragSettings.similarityThreshold') || '0.014');

    // Check if citations are disabled (both min and max results are 0) = FAST MODE
    const citationsDisabled = maxResults === 0 && minResults === 0;
    let formattedSources: any[] = [];
    let searchResults: any[] = [];

    if (citationsDisabled) {
      // ⚡ FAST MODE: Send empty sources immediately
      console.log('⚡ FAST MODE (WebSocket): Citations disabled - skipping source formatting');
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'sources',
          sources: [],
          hasMore: false,
          fastMode: true // Flag for frontend
        }));
      }
    } else {
      // Normal mode: Perform semantic search and format sources
      let allResults = [];
      let useUnifiedEmbeddings = process.env.USE_UNIFIED_EMBEDDINGS === 'true';

      if (process.env.USE_UNIFIED_EMBEDDINGS === undefined) {
        try {
          const pool = await import('../config/database').then(m => m.default);
          const result = await pool.query(
            "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'use_unified_embeddings'"
          );
          useUnifiedEmbeddings = result.rows[0]?.setting_value === 'true';
        } catch (error) {
          // Use default
        }
      }

      if (useUnifiedEmbeddings) {
        allResults = await semanticSearch.unifiedSemanticSearch(message, maxResults);
      } else {
        allResults = await semanticSearch.hybridSearch(message, maxResults);
      }

      // Filter and sort results
      searchResults = allResults
        .filter(result => {
          const score = result.score || (result.similarity_score * 100) || 0;
          return score >= minThreshold;
        })
        .sort((a, b) => {
          const scoreA = a.score || (a.similarity_score * 100) || 0;
          const scoreB = b.score || (b.similarity_score * 100) || 0;
          return scoreB - scoreA;
        });

      // Limit initial sources to minResults for streaming
      const initialResults = searchResults.slice(0, minResults);

      // Format sources
      // Access private method through type assertion
      formattedSources = await (ragChat as any).formatSources(initialResults);

      // Send search results
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'sources',
          sources: formattedSources,
          hasMore: searchResults.length > minResults,
          fastMode: false
        }));
      }
    }

    // Send generating status
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'status',
        status: 'generating',
        message: 'Yanıt oluşturuluyor...'
      }));
    }

    // Generate the full response
    const result = await ragChat.processMessage(message, conversationId, userId, options);

    // Send final response
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'complete',
        response: result.response,
        sources: result.sources,
        conversationId: result.conversationId,
        followUpQuestions: (result as any).followUpQuestions,
        relatedTopics: result.relatedTopics,
        fastMode: (result as any).fastMode || false // Pass fastMode flag to frontend
      }));
    }

    // Track user usage
    try {
      const trackingData: any = {
        message,
        responseLength: result.response?.length || 0,
        sourcesCount: result.sources?.length || 0,
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        streamed: true
      };

      if (options.enableSemanticAnalysis || options.trackUserInsights) {
        trackingData.semanticAnalysis = {
          intent: (result as any).intent || 'informational',
          topics: (result as any).topics || [],
          keywords: (result as any).keywords || [],
          sentiment: (result as any).sentiment || 'neutral',
          complexity: (result as any).complexity || 'medium'
        };
        trackingData.userInsights = options.trackUserInsights;
      }

      await subscriptionService.trackUserUsage(userId, 'chat_query', trackingData);
    } catch (trackingError) {
      console.error('Usage tracking error:', trackingError);
    }

  } catch (error: any) {
    console.error('Streaming chat error:', error);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Chat processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }
}

/**
 * Chat service health check
 */
router.get('/api/v2/chat/health', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Check RAG chat service
    const ragChatStatus = ragChat ? 'initialized' : 'not initialized';

    // Check WebSocket connections
    const activeConnections = chatConnections ? chatConnections.size : 0;

    // Check database connectivity
    let dbStatus = 'disconnected';
    try {
      const testClient = await lsembPool.connect();
      await testClient.query('SELECT 1');
      testClient.release();
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
    }

    const responseTime = Date.now() - startTime;

    res.json({
      status: 'healthy',
      service: 'Chat',
      responseTime: `${responseTime}ms`,
      components: {
        ragChat: ragChatStatus,
        database: dbStatus,
        websockets: {
          active: activeConnections,
          status: activeConnections >= 0 ? 'active' : 'inactive'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'Chat',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;