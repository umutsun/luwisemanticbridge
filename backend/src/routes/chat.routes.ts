import { Router, Request, Response } from 'express';
import { ragChat } from '../services/rag-chat.service';
import { authenticateToken, checkQueryLimits, AuthenticatedRequest } from '../middleware/auth.middleware';
import { SubscriptionService } from '../services/subscription.service';
import { lsembPool } from '../config/database.config';
import dbConfig from '../config/database';
import { chatWss, chatConnections } from '../server';
import { MessageStorageService } from '../services/message-storage.service';
import { v4 as uuidv4 } from 'uuid';
import { questionGenerationService } from '../services/question-generation.service';
import multer from 'multer';
import { ocrRouterService } from '../services/ocr/ocr-router.service';
import { settingsService } from '../services/settings.service';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const subscriptionService = new SubscriptionService();

// PDF upload multer configuration - memory storage for processing
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // Hard limit 50MB (actual limit from settings)
  },
  fileFilter: (req, file, cb) => {
    // Only accept PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Sadece PDF dosyaları desteklenir'));
    }
  }
});

/**
 * Send a chat message - requires authentication and subscription
 */
router.post('/api/v2/chat', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('Chat request received:', {
      body: req.body,
      headers: req.headers['content-type']
    });

    // 🔧 NEW: Check for cache bypass header (for testing)
    const bypassCache = req.headers['x-bypass-cache'] === 'true' ||
                        req.headers['x-bypass-cache'] === '1';
    if (bypassCache) {
      console.log('⚠️ [CHAT] Cache bypass requested - invalidating settings cache');
      settingsService.forceInvalidateCache();
    }

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
          // Now includes token usage for dashboard live stats
          await MessageStorageService.saveQAPair(
            conversationId || uuidv4(),
            message,
            result.response,
            userId,
            {
              model: model || 'default',
              sourcesCount: result.sources?.length || 0,
              processingTime: (result as any).processingTime,
              confidence: (result as any).confidence,
              usage: (result as any).usage // Token usage from LLM response
            }
          );

          console.log('Enhanced message interaction saved:', { conversationId, userId });

          // Capture quality user questions for suggestion pool
          // Only if response was successful (has sources or meaningful content)
          if ((result.sources?.length > 0 || result.response.length > 100) && message.includes('?')) {
            questionGenerationService.addToUserQuestionPool(message, 'user_chat').catch(err => {
              console.error('[QuestionPool] Failed to add question:', err);
            });
          }
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
 * Delete a conversation and its messages
 */
router.delete('/api/v2/chat/conversation/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const userId = req.user.userId;

    // Verify ownership
    const checkQuery = 'SELECT user_id FROM conversations WHERE id = $1';
    const checkResult = await dbConfig.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (checkResult.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this conversation' });
    }

    // Delete messages first (foreign key constraint)
    await dbConfig.query('DELETE FROM messages WHERE conversation_id = $1', [id]);

    // Delete conversation
    await dbConfig.query('DELETE FROM conversations WHERE id = $1', [id]);

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * Get suggested questions - simplified 2-tier system
 * Tier 1: Schema example questions (from active schema config)
 * Tier 2: User pool questions (quality user questions from chat history)
 *
 * Uses Redis caching (1 hour) to reduce database calls
 */
router.get('/api/v2/chat/suggestions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { questionGenerationService } = await import('../services/question-generation.service');

    // Get suggestion count from settings (default: 4)
    let suggestionCount = 4;
    try {
      const settingsResult = await dbConfig.query(`
        SELECT value FROM settings WHERE key = 'chatbot'
      `);
      if (settingsResult.rows.length > 0) {
        const rawValue = settingsResult.rows[0].value;
        const chatbotData = typeof rawValue === 'string' ? JSON.parse(rawValue) : (rawValue || {});
        // Support both maxSuggestionCards (UI) and suggestionCount (legacy)
        suggestionCount = chatbotData.maxSuggestionCards || chatbotData.suggestionCount || 4;
      }
    } catch (e) {
      // Use default
    }

    // Get userId for schema context (now properly authenticated)
    const userId = req.user?.userId;
    let schemaName = 'default';

    // Try to get active schema for user
    if (userId) {
      try {
        const { dataSchemaService } = await import('../services/data-schema.service');
        const activeSchema = await dataSchemaService.getActiveSchemaForUser(userId);
        if (activeSchema?.name) {
          schemaName = activeSchema.name;
        }
      } catch (e) {
        // Use default schema
      }
    }

    // Generate suggestions using simplified 2-tier system
    const suggestions = await questionGenerationService.generateSimpleSuggestions(schemaName, suggestionCount);

    console.log(`[Suggestions] Returning ${suggestions.length} suggestions for schema: ${schemaName}`);
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

    // Capture quality user questions for suggestion pool (WebSocket)
    if ((result.sources?.length > 0 || result.response?.length > 100) && message.includes('?')) {
      questionGenerationService.addToUserQuestionPool(message, 'user_chat').catch(err => {
        console.error('[QuestionPool] Failed to add question:', err);
      });
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
 * Chat with PDF - Upload PDF, extract text via OCR, and get AI response
 * Requires ragSettings.enablePdfUpload to be 'true'
 */
router.post('/api/v2/chat/with-pdf',
  authenticateToken,
  pdfUpload.single('pdf'),
  async (req: AuthenticatedRequest, res: Response) => {
    let tempFilePath: string | null = null;

    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = req.user.userId;
      const { message, conversationId, temperature, model } = req.body;

      // Check if PDF upload feature is enabled
      const pdfEnabled = await settingsService.getSetting('ragSettings.enablePdfUpload');
      if (pdfEnabled !== 'true') {
        return res.status(403).json({ error: 'PDF upload feature is not enabled' });
      }

      // Validate message
      if (!message || message.trim() === '') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Validate PDF file
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }

      const file = req.file;

      // Check magic bytes for PDF
      const header = file.buffer.slice(0, 5).toString();
      if (!header.startsWith('%PDF-')) {
        return res.status(400).json({ error: 'Invalid PDF file' });
      }

      // Get size limits from settings
      const maxSizeMB = parseInt(await settingsService.getSetting('ragSettings.maxPdfSizeMB') || '10');
      const maxPages = parseInt(await settingsService.getSetting('ragSettings.maxPdfPages') || '30');

      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxSizeMB) {
        return res.status(413).json({
          error: `Dosya boyutu ${maxSizeMB} MB'i gecemez`,
          maxSize: maxSizeMB,
          actualSize: fileSizeMB.toFixed(2)
        });
      }

      console.log(`[PDF Chat] Processing: ${file.originalname} (${fileSizeMB.toFixed(2)} MB) for user ${userId}`);

      // Generate file hash for caching
      const fileHash = crypto.createHash('md5').update(file.buffer).digest('hex');

      // Save temp file for OCR processing
      const tempDir = path.join(process.cwd(), 'uploads', 'temp-pdf-chat');
      await fs.mkdir(tempDir, { recursive: true });
      tempFilePath = path.join(tempDir, `${fileHash}.pdf`);
      await fs.writeFile(tempFilePath, file.buffer);

      // Process OCR (skipCache: true - no Redis storage for chat PDFs)
      console.log(`[PDF Chat] Starting OCR for: ${file.originalname}`);
      const startTime = Date.now();

      let ocrResult;
      try {
        ocrResult = await ocrRouterService.processDocument(tempFilePath, {
          provider: 'auto',
          language: 'tur',
          maxPages: maxPages,
          skipCache: true // Don't cache chat PDF content - ephemeral processing only
        });
      } catch (ocrError: any) {
        console.error('[PDF Chat] OCR failed:', ocrError);
        return res.status(500).json({
          error: 'Dosya okunamadi, lutfen tekrar deneyin',
          details: ocrError.message
        });
      }

      const ocrTime = Date.now() - startTime;
      console.log(`[PDF Chat] OCR completed in ${ocrTime}ms, extracted ${ocrResult.text?.length || 0} chars`);

      // Clean up temp file
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => {});
        tempFilePath = null;
      }

      // Prepare PDF context for LLM
      const pdfContext = {
        filename: file.originalname,
        extractedText: ocrResult.text || '',
        pageCount: ocrResult.metadata?.pages || 1,
        confidence: ocrResult.confidence || 0
      };

      // Process message with PDF context
      const result = await ragChat.processMessage(message, conversationId, userId, {
        temperature: temperature ? parseFloat(temperature) : undefined,
        model,
        pdfContext // Pass PDF context to RAG chat
      });

      // Build response with PDF metadata (no cacheKey - ephemeral processing)
      const response = {
        ...result,
        pdfAttachment: {
          filename: file.originalname,
          size: file.size,
          pageCount: pdfContext.pageCount
        }
      };

      console.log(`[PDF Chat] Response generated for: ${file.originalname}`);

      // Save chat interaction
      setImmediate(async () => {
        try {
          await MessageStorageService.saveChatInteraction(
            result.conversationId || uuidv4(),
            userId,
            message,
            result.response,
            [],
            result.sources || [],
            {
              model: model || 'default',
              pdfAttachment: {
                filename: file.originalname,
                size: file.size,
                pageCount: pdfContext.pageCount
              }
            }
          );
        } catch (saveError) {
          console.error('[PDF Chat] Failed to save interaction:', saveError);
        }
      });

      res.json(response);

    } catch (error: any) {
      console.error('[PDF Chat] Error:', error);

      // Clean up temp file on error
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => {});
      }

      res.status(500).json({
        error: 'PDF processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get PDF upload settings - reads from chatbot settings
 */
router.get('/api/v2/chat/pdf-settings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check multiple sources for PDF settings:
    // 1. ragSettings.enablePdfUpload (RAG Settings tab)
    // 2. chatbot.enablePdfUpload (legacy/chatbot JSON)
    const ragSettingEnabled = await settingsService.getSetting('ragSettings.enablePdfUpload');

    let chatbotEnabled = false;
    const chatbotSettingsRaw = await settingsService.getSetting('chatbot');
    if (chatbotSettingsRaw) {
      try {
        const chatbotSettings = typeof chatbotSettingsRaw === 'string'
          ? JSON.parse(chatbotSettingsRaw)
          : chatbotSettingsRaw;
        chatbotEnabled = chatbotSettings?.enablePdfUpload === true;
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Enable if EITHER source says true
    const enabled = ragSettingEnabled === 'true' || ragSettingEnabled === true || chatbotEnabled;
    const maxSizeMB = parseInt(await settingsService.getSetting('ragSettings.maxPdfSizeMB') || '10');
    const maxPages = parseInt(await settingsService.getSetting('ragSettings.maxPdfPages') || '30');

    console.log('[PDF Settings] Loaded:', { enabled, ragSettingEnabled, chatbotEnabled, maxSizeMB, maxPages });

    res.json({
      enabled,
      maxSizeMB,
      maxPages
    });
  } catch (error: any) {
    console.error('[PDF Settings] Error:', error);
    res.status(500).json({ error: 'Failed to get PDF settings' });
  }
});

/**
 * Get Voice Settings (TTS & STT) - reads from multiple sources
 */
router.get('/api/v2/chat/voice-settings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check multiple sources for voice settings:
    // 1. ragSettings.enableVoiceInput/Output (RAG Settings tab)
    // 2. voiceSettings.enableVoiceInput/Output (Voice Settings tab)
    // 3. chatbot.enableVoiceInput/Output (legacy/chatbot JSON)
    const ragVoiceInput = await settingsService.getSetting('ragSettings.enableVoiceInput');
    const ragVoiceOutput = await settingsService.getSetting('ragSettings.enableVoiceOutput');
    const voiceVoiceInput = await settingsService.getSetting('voiceSettings.enableVoiceInput');
    const voiceVoiceOutput = await settingsService.getSetting('voiceSettings.enableVoiceOutput');

    let chatbotVoiceInput = false;
    let chatbotVoiceOutput = false;
    const chatbotSettingsRaw = await settingsService.getSetting('chatbot');
    if (chatbotSettingsRaw) {
      try {
        const chatbotSettings = typeof chatbotSettingsRaw === 'string'
          ? JSON.parse(chatbotSettingsRaw)
          : chatbotSettingsRaw;
        chatbotVoiceInput = chatbotSettings?.enableVoiceInput === true;
        chatbotVoiceOutput = chatbotSettings?.enableVoiceOutput === true;
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Enable if ANY source says true
    const enableVoiceInput = ragVoiceInput === 'true' || ragVoiceInput === true ||
                            voiceVoiceInput === 'true' || voiceVoiceInput === true ||
                            chatbotVoiceInput;
    const enableVoiceOutput = ragVoiceOutput === 'true' || ragVoiceOutput === true ||
                             voiceVoiceOutput === 'true' || voiceVoiceOutput === true ||
                             chatbotVoiceOutput;

    // Get additional voice settings from voiceSettings prefix
    const ttsProvider = await settingsService.getSetting('voiceSettings.ttsProvider') || 'openai';
    const ttsVoice = await settingsService.getSetting('voiceSettings.ttsVoice') || 'alloy';
    const ttsSpeed = parseFloat(await settingsService.getSetting('voiceSettings.ttsSpeed') || '1.0');
    const maxRecordingSeconds = parseInt(await settingsService.getSetting('voiceSettings.maxRecordingSeconds') || '60');

    console.log('[Voice Settings] Loaded:', { enableVoiceInput, enableVoiceOutput, ragVoiceInput, voiceVoiceInput });

    res.json({
      enableVoiceInput,
      enableVoiceOutput,
      ttsProvider,
      ttsVoice,
      ttsSpeed,
      maxRecordingSeconds
    });
  } catch (error: any) {
    console.error('[Voice Settings] Error:', error);
    res.status(500).json({ error: 'Failed to get voice settings' });
  }
});

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