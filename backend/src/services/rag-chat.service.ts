import { v4 as uuidv4 } from 'uuid';
import { semanticSearch, SemanticSearchService } from './semantic-search.service';
import { LLMManager } from './llm-manager.service';
import pool from '../config/database';
import dotenv from 'dotenv';
import { TIMEOUTS } from '../config';

// Settings service interface
interface SettingsService {
  getSetting(key: string): Promise<string | null>;
  getApiKey(keyName: string): Promise<string | null>;
}

// Settings service using the existing chatbot_settings table
class SettingsServiceImpl implements SettingsService {
  private pool = pool;

  async getSetting(key: string): Promise<string | null> {
    try {
      // Try new settings table first
      const newResult = await this.pool.query(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );

      if (newResult.rows[0]?.value) {
        return newResult.rows[0].value;
      }

      // Fallback to old chatbot_settings table for backward compatibility
      const oldResult = await this.pool.query(
        'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
        [key]
      );

      return oldResult.rows[0]?.setting_value || null;
    } catch (error) {
      console.error('Error fetching setting:', error);
      return null;
    }
  }

  async getApiKey(keyName: string): Promise<string | null> {
    try {
      // Try different key formats for API keys
      const keyMappings = {
        'google.apiKey': ['google_api_key', 'googleApiKey', 'GOOGLE_API_KEY'],
        'openai.apiKey': ['openai_api_key', 'openaiApiKey', 'OPENAI_API_KEY'],
        'claude.apiKey': ['claude_api_key', 'claudeApiKey', 'CLAUDE_API_KEY'],
        'deepseek.apiKey': ['deepseek_api_key', 'deepseekApiKey', 'DEEPSEEK_API_KEY']
      };

      const possibleKeys = keyMappings[keyName] || [keyName];

      // First try settings table
      for (const key of possibleKeys) {
        const result = await this.pool.query(
          'SELECT value FROM settings WHERE key = $1',
          [key]
        );

        if (result.rows[0]?.value) {
          const value = result.rows[0].value;
          // Check if it's a JSON object with apiKey property
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed.apiKey) {
              return parsed.apiKey;
            }
            return value;
          } catch {
            // Return as-is if not JSON
            return value;
          }
        }
      }

      // Fallback to chatbot_settings table
      for (const key of possibleKeys) {
        const result = await this.pool.query(
          'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
          [key]
        );

        if (result.rows[0]?.setting_value) {
          return result.rows[0].setting_value;
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching API key:', error);
      return null;
    }
  }

  async setSetting(key: string, value: string, category?: string, description?: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO chatbot_settings (setting_key, setting_value, description, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key)
         DO UPDATE SET
           setting_value = $2,
           description = COALESCE($3, chatbot_settings.description),
           updated_at = CURRENT_TIMESTAMP`,
        [key, value, description]
      );
    } catch (error) {
      console.error('Error saving setting:', error);
      throw error;
    }
  }
}

const settingsService = new SettingsServiceImpl();

dotenv.config();

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: any[];
}

interface ChatOptions {
  temperature?: number;
  model?: string;
  systemPrompt?: string;
  ragWeight?: number;
  useLocalDb?: boolean;
  language?: string;
  responseStyle?: string;
  maxTokens?: number;
}

export class RAGChatService {
  private pool = pool;
  private llmManager: LLMManager;

  constructor() {
    this.llmManager = LLMManager.getInstance();
    console.log('✅ RAG Chat Service initialized with LLM Manager');
  }

  
  /**
   * Get system prompt from database
   */
  private async getConversationTone(promptId?: string): Promise<string> {
    try {
      if (promptId) {
        // Try to get tone from specific prompt
        const result = await pool.query(
          "SELECT value FROM settings WHERE key = $1",
          [`prompts.${promptId}.conversationTone`]
        );

        if (result.rows.length > 0 && result.rows[0].value) {
          return result.rows[0].value;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch conversation tone:', error);
    }
    return 'professional';
  }

  private getToneInstruction(tone: string): string {
    const toneInstructions = {
      professional: 'TONE: Profesyonel, resmi ve iş dünyasına uygun bir dil kullan. Saygılı ve net ifadeler tercih et. Uzmanlık ile anlaşılırlığı dengele.',
      friendly: 'TONE: Sıcak, samimi ve arkadaşça bir üslup kullan. Yardımsever bir arkadaş gibi konuş. Kullanıcıyı rahat hissettir. "Şöyle düşünebilirsiniz", "size yardımcı olur" gibi ifadeler kullan.',
      formal: 'TONE: Resmi, kurumsal ve otoriter bir dil kullan. Nesnelliği koru. Kesin hukuki terminoloji ve yazılı dil kurallarına uy. Saygılı ve resmî ifadeler tercih et.',
      casual: 'TONE: Rahat, günlük ve sohbet tarzında yanıt ver. Biriyle sohbet eder gibi konuş. Samimi ama saygılı ol. Basit ve anlaşılır tut.',
      technical: 'TONE: Detaylı, kesin ve teknik açıklamalar yap. Terminolojiyi doğru kullan. Teknik detaylara gir.',
      empathetic: 'TONE: Anlayışlı, destekleyici ve empatik bir yaklaşım sergile. Kullanıcının duygularını dikkate al.',
      concise: 'TONE: Kısa, öz ve net yanıtlar ver. Gereksiz detaya girme. Doğrudan sonuca odaklan.',
      educational: 'TONE: Açıklayıcı, öğretici ve anlaşılır bir dil kullan. Adım adım anlat. Sanki birine öğretiyormuşsun gibi.'
    };
    return toneInstructions[tone.toLowerCase() as keyof typeof toneInstructions] || toneInstructions.professional;
  }

  private async getSystemPrompt(): Promise<string> {
    try {
      // First try to get active prompt from settings table
      const activePromptResult = await pool.query(
        "SELECT key, value FROM settings WHERE key LIKE 'prompts.%.active' AND value = 'true' LIMIT 1"
      );

      if (activePromptResult.rows.length > 0) {
        // Extract prompt ID from the key (e.g., 'prompts.abc123.active' -> 'abc123')
        const activeKey = activePromptResult.rows[0].key;
        const promptId = activeKey.split('.')[1];

        // Get conversation tone for this prompt
        const tone = await this.getConversationTone(promptId);
        const toneInstruction = this.getToneInstruction(tone);

        // Get the actual prompt content
        const promptResult = await pool.query(
          "SELECT value FROM settings WHERE key = $1",
          [`prompts.${promptId}.content`]
        );

        if (promptResult.rows.length > 0) {
          const content = typeof promptResult.rows[0].value === 'string'
            ? promptResult.rows[0].value
            : promptResult.rows[0].value;
          console.log(`✅ Using active prompt: ${promptId} with ${tone} tone`);
          return `${toneInstruction}\n\n${content}`;
        }
      }

      // Fallback: Try old chatbot_settings table
      const oldResult = await pool.query(
        "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'system_prompt'"
      );

      if (oldResult.rows[0]?.setting_value) {
        console.log('⚠️ Using system prompt from old chatbot_settings table');
        return oldResult.rows[0].setting_value;
      }
    } catch (error) {
      console.warn('Failed to fetch system prompt from database:', error);
    }

    // Generic default system prompt (multi-language, not domain-specific)
    console.log('⚠️ No active prompt found, using generic default');
    return `You are a helpful AI assistant. Answer questions based on the provided context information. Structure your response in clear paragraphs.`;
  }

  /**
   * Process a chat message with RAG
   */
  async processMessage(
    message: string,
    conversationId?: string,
    userId: string = 'demo-user',
    options: ChatOptions = {}
  ) {
    try {
      // 1. Create or get conversation
      const convId = conversationId || uuidv4();

      if (!conversationId) {
        await this.ensureConversation(convId, userId, message);
        // Log new conversation start
        await this.logActivity(userId, 'chat_start', { conversationId: convId, firstMessage: message });
      } else {
        // Log activity for existing conversation
        await this.logActivity(userId, 'chat_message', { conversationId: convId });
      }

      // Get system prompt from database or use default
      const systemPrompt = options.systemPrompt || await this.getSystemPrompt();
      console.log(`📝 System Prompt loaded (length: ${systemPrompt?.length || 0} chars)`);

      // 2. Search for relevant documents using configured source
      // Check environment variable first, then database setting
      let useUnifiedEmbeddings = process.env.USE_UNIFIED_EMBEDDINGS === 'true';

      // If not set in environment, check database
      if (process.env.USE_UNIFIED_EMBEDDINGS === undefined) {
        try {
          const result = await pool.query(
            "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'use_unified_embeddings'"
          );
          useUnifiedEmbeddings = result.rows[0]?.setting_value === 'true';
        } catch (error) {
          // Use default (false) if database check fails
        }
      }

      console.log(`Performing semantic search with pgvector...`);

      // PERFORMANCE OPTIMIZATION: Batch fetch all settings in ONE query
      const settingsKeys = [
        'ragSettings.maxResults', 'maxResults',
        'ragSettings.minResults', 'minResults',
        'parallel_llm_batch_size',
        'enable_parallel_llm',
        'parallel_llm_count',
        'ragSettings.similarityThreshold', 'similarityThreshold', 'semantic_search_threshold',
        'response_language',
        'llmSettings.activeChatModel'
      ];

      const settingsResult = await pool.query(
        `SELECT key, value FROM settings WHERE key = ANY($1)`,
        [settingsKeys]
      );

      const settingsMap = new Map(settingsResult.rows.map(r => [r.key, r.value]));

      // Get search settings with fallbacks
      const maxResults = parseInt(
        settingsMap.get('ragSettings.maxResults') ||
        settingsMap.get('maxResults') ||
        '7'
      );
      const minResults = parseInt(
        settingsMap.get('ragSettings.minResults') ||
        settingsMap.get('minResults') ||
        '3'
      );
      const batchSize = parseInt(settingsMap.get('parallel_llm_batch_size') || '2');
      const minThreshold = parseFloat(
        settingsMap.get('ragSettings.similarityThreshold') ||
        settingsMap.get('similarityThreshold') ||
        settingsMap.get('semantic_search_threshold') ||
        '0.02'
      );
      const responseLanguage = settingsMap.get('response_language') || 'tr';
      const activeModel = settingsMap.get('llmSettings.activeChatModel') || 'anthropic/claude-3-5-sonnet-20241022';

      console.log(`⚙️ RAG Settings: maxResults=${maxResults}, minResults=${minResults}, batchSize=${batchSize}, threshold=${minThreshold}`);

      // Use semantic search to find related content
      let allResults = [];
      if (useUnifiedEmbeddings) {
        allResults = await semanticSearch.unifiedSemanticSearch(message, maxResults);
      } else {
        allResults = await semanticSearch.hybridSearch(message, maxResults);
      }

      // Filter by threshold and sort by similarity score
      let searchResults = allResults
        .filter(result => {
          const score = result.score || (result.similarity_score * 100) || 0;
          return score >= minThreshold;
        })
        .sort((a, b) => {
          const scoreA = a.score || (a.similarity_score * 100) || 0;
          const scoreB = b.score || (b.similarity_score * 100) || 0;
          return scoreB - scoreA; // Highest similarity first
        });

      console.log(`Found ${searchResults.length} results with similarity >= ${minThreshold}%`);

      // For initial display, use minResults instead of batch size
      const initialDisplayCount = Math.min(minResults, searchResults.length);
      console.log(`📊 Displaying ${initialDisplayCount} initial results (minResults: ${minResults})`);

      // Ensure minimum results requirement (for backend processing, not display)
      if (searchResults.length < minResults && allResults.length > 0) {
        const additionalResults = allResults
          .filter(result => {
            const score = result.score || (result.similarity_score * 100) || 0;
            return score < minThreshold;
          })
          .slice(0, minResults - searchResults.length);

        searchResults = [...searchResults, ...additionalResults];
        console.log(`Added ${additionalResults.length} results to meet minimum requirement of ${minResults}`);
      }

      // If still no results, take top matches anyway
      if (searchResults.length === 0 && allResults.length > 0) {
        searchResults = allResults.slice(0, minResults);
        console.log('No results above threshold, showing top matches');
      }

      // 3. Get conversation history with retry
      let history = [];
      try {
        history = await this.getConversationHistory(convId, 5);
      } catch (dbError) {
        console.error('Failed to get conversation history:', dbError);
        // Continue without history if DB fails
        history = [];
      }

      // 4. Generate response using LLM Manager
      const llmManager = LLMManager.getInstance();

      // Create enhanced context with actual content for better response generation
      const enhancedContext = searchResults.slice(0, initialDisplayCount).map((r, idx) => {
        const score = Math.round(r.score || (r.similarity_score * 100) || 0);
        const title = r.title || `Kaynak ${idx + 1}`;
        const content = this.truncateExcerpt(r.excerpt || r.content || '', 300);
        return `${idx + 1}. %${score} - ${title}:\n${content}\n`;
      }).join('\n');

      // Check if best result has low confidence (< 40% similarity)
      const bestScore = searchResults.length > 0 ? (searchResults[0].score || 0) : 0;
      const hasLowConfidence = bestScore < 40;

      // If no relevant context found or all results have low confidence
      if (!enhancedContext || enhancedContext.trim().length === 0 || searchResults.length === 0 || hasLowConfidence) {
        const noResultsMessage = responseLanguage === 'en'
          ? "I couldn't find relevant information in the database for your question. Please try rephrasing your question or using different keywords."
          : "Bu konuda veritabanımda yeterli bilgi bulunamadı. Daha spesifik bir soru sorarak veya farklı anahtar kelimelerle tekrar deneyebilirsiniz.";

        console.log(`⚠️ No relevant context found for query: "${message}" (bestScore: ${bestScore}%, threshold: 40%)`);

        // Still show low-confidence results as reference (but with disclaimer)
        const processedSources = await this.formatSources(
          searchResults.slice(0, Math.min(searchResults.length, 5)),
          {} // No settings needed for low-confidence results
        );

        return {
          response: noResultsMessage,
          sources: processedSources, // Show them but with low scores
          relatedTopics: [],
          conversationId: convId,
          provider: 'system',
          model: 'no-context',
          providerDisplayName: 'System',
          language: options.language || 'tr',
          fallbackUsed: false,
          originalModel: activeModel || 'none',
          actualProvider: 'system',
          lowConfidence: true // Flag for frontend
        };
      }

      // Generate user message with context (NOT including system prompt - it goes separately)
      const contextLabel = responseLanguage === 'en' ? 'CONTEXT INFORMATION' : 'BAĞLAM BİLGİLERİ';
      const questionLabel = responseLanguage === 'en' ? 'QUESTION' : 'SORU';

      const userPrompt = `${contextLabel}:\n${enhancedContext}\n\n${questionLabel}: ${message}`;
      console.log(`🌡️ Sending temperature to LLM Manager: ${options.temperature} (type: ${typeof options.temperature})`);
      console.log(`📝 Context length: ${enhancedContext.length}, sources: ${initialDisplayCount}`);
      console.log(`📝 System prompt length: ${systemPrompt?.length || 0} chars`);
      console.log(`🌐 Response language: ${responseLanguage}`);

      // Extract provider from active model
      const providerFromModel = this.extractProviderFromModel(activeModel);
      console.log(`🤖 Active Chat Model: ${activeModel} (provider: ${providerFromModel})`);

      // PERFORMANCE: Pass extracted provider directly (already normalized by extractProviderFromModel)
      const response = await llmManager.generateChatResponse(
        userPrompt,  // User message with context (no system prompt here)
        {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          systemPrompt: systemPrompt,  // System prompt sent separately to LLM API
          preferredProvider: providerFromModel  // Pass normalized provider name (claude/openai/gemini/deepseek)
        }
      );

      // 5. Save messages to database with error handling
      try {
        await this.saveMessage(convId, 'user', message);
        await this.saveMessage(convId, 'assistant', response.content, searchResults, response.model);
      } catch (saveError) {
        console.error('Failed to save messages to database:', saveError);
        // Continue even if save fails
      }

      // Log if fallback was used
      if (response.fallbackUsed) {
        console.log(`⚠️ Fallback was used - active model ${providerFromModel} was not available`);
        await this.logActivity(userId, 'model_fallback', {
          activeModel: activeModel,
          actualProvider: response.provider,
          fallbackUsed: true
        });
      }

      // 6. Format sources for frontend with natural language summaries
      // PERFORMANCE: Pass settings to avoid re-querying database
      const formattedSources = await this.formatSources(searchResults, {
        enableParallelLLM: settingsMap.get('enable_parallel_llm') === 'true',
        parallelCount: Math.min(parseInt(settingsMap.get('parallel_llm_count') || '3'), 5),
        batchSize: batchSize
      });

      // 7. Get additional related topics (excluding already shown ones) - DISABLED FOR PERFORMANCE
      // const relatedResultsLimit = parseInt(await settingsService.getSetting('related_results_limit') || '20');
      // const shownIds = searchResults.slice(0, 3).map(s => s.id?.toString() || s.source_id?.toString());
      // const relatedTopics = await this.getRelatedTopics(message, searchResults.slice(0, 3), relatedResultsLimit);
      const relatedTopics = []; // Disable for now

      // Multilingual provider names
    const getProviderDisplayName = (provider: string, language: string = 'tr') => {
      const providerNames = {
        tr: {
          'Claude': 'Claude',
          'Gemini': 'Gemini',
          'OpenAI': 'OpenAI',
          'Demo': 'Demo'
        },
        en: {
          'Claude': 'Claude',
          'Gemini': 'Gemini',
          'OpenAI': 'OpenAI',
          'Demo': 'Demo'
        }
      };

      return providerNames[language]?.[provider] || provider;
    };

    // Log sources content for debugging
    console.log(`📦 Returning ${formattedSources.length} sources to frontend`);
    formattedSources.forEach((source, idx) => {
      console.log(`  Source ${idx + 1}: title="${source.title?.substring(0, 30)}...", content length=${source.content?.length || 0}, excerpt length=${source.excerpt?.length || 0}`);
    });

    return {
        response: response.content,
        sources: formattedSources,
        relatedTopics: relatedTopics,
        conversationId: convId,
        provider: response.provider,
        model: response.model || response.provider,
        providerDisplayName: getProviderDisplayName(response.provider || '', options.language || 'tr'),
        language: options.language || 'tr',
        fallbackUsed: response.fallbackUsed || false,
        originalModel: activeModel,
        actualProvider: response.provider
      };
    } catch (error) {
      console.error('RAG chat error:', error);
      throw error;
    }
  }

  /**
   * Prepare enhanced context with better categorization
   */
  private prepareEnhancedContext(searchResults: any[]): string {
    if (!searchResults.length) {
      console.log('No search results to prepare context from');
      return '';
    }

    // Sort sources by score (highest score first) - for context
    const sortedResults = [...searchResults].sort((a, b) => {
      const scoreA = a.score || (a.similarity_score * 100) || 0;
      const scoreB = b.score || (b.similarity_score * 100) || 0;
      return scoreB - scoreA;
    });

    let context = 'VERİTABANINDAN BULUNAN İLGİLİ BİLGİLER (en yüksek skor dan başlayarak):\n\n';

    // Create groups - prioritize high-scoring sources
    const highScoreSources = sortedResults.filter(r => (r.score || (r.similarity_score * 100) || 0) >= 75);
    const mediumScoreSources = sortedResults.filter(r => {
      const score = r.score || (r.similarity_score * 100) || 0;
      return score >= 50 && score < 75;
    });
    const lowScoreSources = sortedResults.filter(r => (r.score || (r.similarity_score * 100) || 0) < 50);

    // Add highest scoring sources first
    if (highScoreSources.length > 0) {
      context += '🎯 YÜSEK EŞLEŞME SONUÇLARI:\n';
      highScoreSources.forEach((result, idx) => {
        context += this.formatSourceForContext(result, idx + 1);
      });
      context += '\n';
    }

    // Add medium scoring sources
    if (mediumScoreSources.length > 0) {
      context += '📊 ORTA EŞLEŞME SONUÇLARI:\n';
      mediumScoreSources.forEach((result, idx) => {
        context += this.formatSourceForContext(result, idx + highScoreSources.length + 1);
      });
      context += '\n';
    }

    // Add low scoring sources at the end (only if few results)
    if (lowScoreSources.length > 0 && sortedResults.length < 10) {
      context += '📝 DİĞER İLGİLİ BİLGİLER:\n';
      lowScoreSources.forEach((result, idx) => {
        context += this.formatSourceForContext(result, idx + highScoreSources.length + mediumScoreSources.length + 1);
      });
    }

    console.log(`Context prepared with ${searchResults.length} sources (${highScoreSources.length} high, ${mediumScoreSources.length} medium, ${lowScoreSources.length} low), total length: ${context.length}`);
    return context;
  }

  /**
   * Format a single source for context
   */
  private formatSourceForContext(result: any, index: number): string {
    const score = result.score || (result.similarity_score * 100) || 0;
    const title = result.title || 'Belge';
    const excerpt = this.truncateExcerpt(result.excerpt || result.content || '', 400);

    // Add metadata info if available
    let metaInfo = '';
    if (result.metadata) {
      if (result.metadata.tarih) metaInfo += ` (Tarih: ${result.metadata.tarih})`;
      if (result.metadata.sayiNo) metaInfo += ` (Sayı: ${result.metadata.sayiNo})`;
      if (result.metadata.kararNo) metaInfo += ` (Karar No: ${result.metadata.kararNo})`;
    }

    // Skor bilgisini ekle
    const scoreInfo = `[Skor: ${score}%] `;

    return `${index}. ${scoreInfo}${title}${metaInfo}:\n${excerpt}\n\n`;
  }

  /**
   * Categorize source based on content
   */
  private categorizeSource(result: any): string {
    // Use source_table directly - it should already contain the table name
    const sourceTable = result.source_table;

    // Convert table name to a readable format (capitalize first letter)
    if (sourceTable) {
      return sourceTable.charAt(0).toUpperCase() + sourceTable.slice(1).toLowerCase();
    }

    // Default category if no source_table
    return 'Document';
  }

  /**
   * Extract provider name from model string
   */
  private extractProviderFromModel(model: string): string {
    if (model.includes('claude') || model.includes('anthropic')) return 'claude';
    if (model.includes('openai') || model.includes('gpt')) return 'openai';
    if (model.includes('gemini') || model.includes('google')) return 'gemini';
    if (model.includes('deepseek')) return 'deepseek';
    return 'claude'; // default
  }

  /**
   * Truncate excerpt intelligently
   */
  private truncateExcerpt(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    
    // Cut at sentence end
    const truncated = text.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > maxLength * 0.8) {
      return truncated.substring(0, lastPeriod + 1);
    }
    
    return truncated + '...';
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(text: string): string {
    if (!text) return '';
    // Remove HTML tags
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&lt;/g, '<') // Replace &lt;
      .replace(/&gt;/g, '>') // Replace &gt;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/&#39;/g, "'") // Replace &#39;
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .trim();
  }

  /**
   * Format sources for better UI display
   * Optimized with enhanced parallel LLM processing
   */
  private async formatSources(
    searchResults: any[],
    settings?: {
      enableParallelLLM?: boolean;
      parallelCount?: number;
      batchSize?: number;
    }
  ): Promise<any[]> {
    const formattedResults = [];
    // PERFORMANCE: Use passed settings or fetch if not provided
    const enableParallelLLM = settings?.enableParallelLLM ?? (await settingsService.getSetting('enable_parallel_llm') === 'true');
    const parallelCount = settings?.parallelCount ?? Math.min(
      parseInt(await settingsService.getSetting('parallel_llm_count') || '3'),
      5
    );
    const batchSize = settings?.batchSize ?? parseInt(await settingsService.getSetting('parallel_llm_batch_size') || '3');

    // Enable LLM generation for natural language summaries - controlled by settings
    // WARNING: LLM generation adds 10-30 seconds per search! Use sparingly.
    const enableLLMGenerationSetting = await settingsService.getSetting('ragSettings.enableLLMSummaries');
    const enableLLMGeneration = enableLLMGenerationSetting === 'true'; // Default: false (disabled for performance)

    console.log(`🚀 Formatting ${searchResults.length} sources (LLM Generation: ${enableLLMGeneration ? 'ENABLED' : 'DISABLED'} for natural summaries)`);

    if (enableParallelLLM && searchResults.length > 1) {
      // NOTE: Parallel mode is now deprecated in favor of batch LLM processing
      // Batch processing is much faster (1 call vs N calls) and simpler
      // Redirecting to sequential path which uses batch LLM optimization
      console.log('⚠️ Parallel LLM mode is deprecated - using optimized batch processing instead');
    }

    // Always use batch processing path (much faster than parallel individual calls)
    {
      // Optimized batch LLM processing - single API call for all sources
      console.log('🔄 Using optimized batch processing for all sources');

      // STEP 1: Prepare all results with metadata and categories
      const preparedResults = searchResults.map((r, idx) => {
        const category = this.categorizeSource(r);
        // Score is already 0-100 from semantic search service, use it directly
        // Only multiply by 100 if similarity_score is in 0-1 range (< 1)
        const score = r.score || (r.similarity_score && r.similarity_score < 1 ? Math.round(r.similarity_score * 100) : r.similarity_score) || 50;

        // Build proper citation
        let citation = `[Source ${idx + 1}]`;
        if (r.metadata) {
          const parts = [];
          Object.keys(r.metadata).forEach(key => {
            const value = r.metadata[key];
            if (value && typeof value === 'string' && value.trim()) {
              parts.push(`${key}: ${value}`);
            }
          });
          if (parts.length > 0) {
            citation = parts.join(' - ');
          }
        }

        // Clean HTML from title and excerpt
        const cleanTitle = this.stripHtml(r.title?.replace(/ \(Part \d+\/\d+\)/g, '') || citation);
        const cleanExcerpt = this.stripHtml(r.excerpt || r.content || '');

        return {
          originalResult: r,
          idx,
          category,
          score,
          citation,
          cleanTitle,
          cleanExcerpt
        };
      });

      // STEP 2: Batch LLM processing if enabled (10x faster than individual calls!)
      let batchLLMResults: Array<{ processedContent: string; generatedQuestion: string }> = [];

      if (enableLLMGeneration && preparedResults.length > 0) {
        try {
          console.time('⚡ Batch LLM processing for ALL results');
          console.log(`🚀 Processing ${preparedResults.length} sources in SINGLE batch LLM call...`);

          // Single batch call instead of N individual calls
          batchLLMResults = await this.generateBatchContentAndQuestions(
            preparedResults.map(p => ({
              title: p.cleanTitle,
              excerpt: p.cleanExcerpt,
              category: p.category
            }))
          );

          console.log(`✅ Batch LLM completed: ${batchLLMResults.length} results generated`);
          console.timeEnd('⚡ Batch LLM processing for ALL results');
        } catch (error) {
          console.error('❌ Batch LLM processing FAILED:', error);
          console.warn('Falling back to non-LLM content');
          batchLLMResults = []; // Will use fallback content below
        }
      }

      // STEP 3: Build final formatted results
      for (let i = 0; i < preparedResults.length; i++) {
        const prep = preparedResults[i];
        const r = prep.originalResult;

        // Use batch LLM result if available, otherwise use fallback
        let processedContent = prep.cleanExcerpt;
        let generatedQuestion = this.generateDynamicQuestion(prep.cleanTitle, prep.cleanExcerpt, prep.category);

        if (enableLLMGeneration && batchLLMResults[i]) {
          processedContent = batchLLMResults[i].processedContent || prep.cleanExcerpt;
          generatedQuestion = batchLLMResults[i].generatedQuestion || generatedQuestion;
        }

        formattedResults.push({
          id: r.id,
          title: prep.cleanTitle,
          excerpt: this.truncateExcerpt(prep.cleanExcerpt, 250),
          content: processedContent,
          question: generatedQuestion,
          category: prep.category,
          sourceTable: r.source_table || 'documents',
          citation: prep.citation,
          score: prep.score,
          relevance: prep.score,
          relevanceText: prep.score > 80 ? 'Yüksek' : prep.score > 60 ? 'Orta' : 'Düşük',
          databaseInfo: {
            table: r.source_table || 'documents',
            id: r.id,
            hasMetadata: !!r.metadata
          },
          index: prep.idx + 1,
          metadata: r.metadata || {},
          priority: prep.idx + 1,
          hasContent: !!(r.content || r.excerpt),
          contentLength: (r.content || r.excerpt || '').length,
          // Add flag indicating if LLM enrichment was applied
          enriched: enableLLMGeneration && !!batchLLMResults[i]
        });
      }
    }

    console.log(`✅ Formatted ${formattedResults.length} sources successfully`);
    return formattedResults;
  }

  /**
   * Generate dynamic question based on title, excerpt and category without LLM
   */
  private generateDynamicQuestion(title: string, excerpt: string, category: string): string {
    // Detect language
    const isTurkish = /[çğıöşüÇĞİÖŞÜ]/.test(excerpt) ||
                     /(\b(ve|ile|için|hakkında|nasıl|neden|ne|hangi)\b)/i.test(excerpt);

    // Extract keywords from title and excerpt
    const titleWords = title.toLowerCase().split(' ').filter(w => w.length > 3);
    const excerptWords = excerpt.toLowerCase().split(' ').filter(w => w.length > 4);

    // Smarter question generation based on content keywords
    let smartQuestion = '';

    if (isTurkish) {
      // Extract key tax/legal terms to create contextual questions
      const hasStopaj = /stopaj|tevkifat/i.test(excerpt);
      const hasKDV = /kdv|katma değer/i.test(excerpt);
      const hasGelir = /gelir vergisi/i.test(excerpt);
      const hasBeyanname = /beyanname/i.test(excerpt);
      const hasMuafiyet = /muafiyet|istisna/i.test(excerpt);
      const hasOran = /oran|yüzde|%/i.test(excerpt);
      const hasSure = /süre|tarih|son gün/i.test(excerpt);

      if (hasStopaj && hasOran) {
        smartQuestion = 'Stopaj oranları hangi durumlarda değişir?';
      } else if (hasStopaj) {
        smartQuestion = 'Bu stopaj uygulaması kimler için geçerlidir?';
      } else if (hasKDV && hasOran) {
        smartQuestion = 'KDV oranı bu işlem için ne kadardır?';
      } else if (hasBeyanname && hasSure) {
        smartQuestion = 'Beyanname verme süreleri ne zaman doluyor?';
      } else if (hasMuafiyet) {
        smartQuestion = 'Muafiyetten kimler yararlanabilir?';
      } else if (hasGelir) {
        smartQuestion = 'Gelir vergisi matrahı nasıl hesaplanır?';
      } else if (title.length > 10 && title.length < 100) {
        // Use title-based questions
        smartQuestion = `${title.substring(0, 60)} hakkında detaylar neler?`;
      } else {
        smartQuestion = 'Bu düzenleme hangi durumları kapsıyor?';
      }
    } else {
      // English fallback
      smartQuestion = `What are the key requirements for ${title.substring(0, 40)}?`;
    }

    // Return the contextually generated question
    return smartQuestion;
  }

  
  /**
   * BATCH: Generate LLM-processed content and questions for multiple results at once
   * This is 10x faster than processing individually!
   */
  private async generateBatchContentAndQuestions(
    results: Array<{ title: string; excerpt: string; category: string }>
  ): Promise<Array<{ processedContent: string; generatedQuestion: string }>> {
    try {
      console.log(`🚀 Batch processing ${results.length} results with LLM...`);
      console.time('Batch LLM processing');

      // Get settings once for all results
      const maxSummaryLength = parseInt(
        await settingsService.getSetting('ragSettings.summaryMaxLength') || '500'
      );
      const responseLanguage = await settingsService.getSetting('response_language') || 'tr';
      const conversationTone = await settingsService.getSetting('llmSettings.conversationTone')
        || await settingsService.getSetting('conversationTone')
        || 'professional';

      let temperature = 0.3;
      const tempSetting = await settingsService.getSetting('llmSettings.temperature')
        || await settingsService.getSetting('temperature');
      if (tempSetting) {
        const parsed = parseFloat(tempSetting);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
          temperature = parsed;
        }
      }

      // Clean all excerpts
      const cleanedResults = results.map(r => ({
        title: r.title,
        excerpt: r.excerpt
          .replace(/^(Cevap|Soru|Yanıt|Answer|Question):\s*/i, '')
          .trim(),
        category: r.category
      }));

      // Build batch prompt for all results
      const toneInstruction = responseLanguage === 'tr'
        ? 'Profesyonel ama anlaşılır bir üslup kullan. Doğal dilde yaz.'
        : 'Use a professional but accessible tone. Write naturally.';

      const batchPrompt = responseLanguage === 'en' ? `
You are a tax and legal expert. Process ALL items below in ONE response.

TONE: ${toneInstruction}

For EACH item, provide:
1. A natural explanation (max ${maxSummaryLength} chars) - INTERPRET, don't copy
2. A specific question (max 15 words)

RESPOND IN THIS EXACT FORMAT:

ITEM 1:
CONTENT: [Your natural explanation]
QUESTION: [Specific question]

ITEM 2:
CONTENT: [Your natural explanation]
QUESTION: [Specific question]

... continue for all items ...

${cleanedResults.map((r, i) => `
ITEM ${i + 1}:
Title: ${r.title}
Content: ${r.excerpt.substring(0, 1000)}
`).join('\n')}

CRITICAL: Process ALL ${results.length} items. INTERPRET each, don't copy. Be specific.
` : `
Sen vergi ve hukuk uzmanısın. Aşağıdaki TÜM kayıtları TEK yanıtta işle.

ÜSLUBİN: ${toneInstruction}

HER kayıt için ver:
1. Doğal açıklama (maks ${maxSummaryLength} karakter) - YORUMLA, kopyalama
2. Spesifik soru (maks 15 kelime)

TAM OLARAK BU FORMATTA YANITLA:

KAYIT 1:
İÇERİK: [Doğal açıklaman]
SORU: [Spesifik soru]

KAYIT 2:
İÇERİK: [Doğal açıklaman]
SORU: [Spesifik soru]

... tüm kayıtlar için devam et ...

${cleanedResults.map((r, i) => `
KAYIT ${i + 1}:
Başlık: ${r.title}
İçerik: ${r.excerpt.substring(0, 1000)}
`).join('\n')}

ÖNEMLİ: TÜM ${results.length} kaydı işle. Her birini YORUMLA, kopyalama. Spesifik ol.
`;

      // Single LLM call for all results
      const response = await this.llmManager.generateChatResponse(batchPrompt, {
        temperature: temperature,
        maxTokens: results.length * 300, // ~300 tokens per result
        systemPrompt: ''
      });

      if (!response || !response.content) {
        throw new Error('No response from LLM');
      }

      // Parse the batch response
      const parsed: Array<{ processedContent: string; generatedQuestion: string }> = [];
      const itemPattern = responseLanguage === 'en'
        ? /ITEM \d+:[\s\S]*?CONTENT:\s*(.*?)[\s\S]*?QUESTION:\s*(.*?)(?=ITEM \d+:|$)/gi
        : /KAYIT \d+:[\s\S]*?İÇERİK:\s*(.*?)[\s\S]*?SORU:\s*(.*?)(?=KAYIT \d+:|$)/gi;

      let match;
      while ((match = itemPattern.exec(response.content)) !== null) {
        parsed.push({
          processedContent: match[1].trim().replace(/^\*\*+|\*\*+$/g, '').substring(0, maxSummaryLength),
          generatedQuestion: match[2].trim().replace(/^\*\*+|\*\*+$/g, '')
        });
      }

      console.timeEnd('Batch LLM processing');
      console.log(`✅ Batch processed ${parsed.length}/${results.length} results`);

      // Fallback for missing results
      while (parsed.length < results.length) {
        const idx = parsed.length;
        parsed.push({
          processedContent: cleanedResults[idx].excerpt.substring(0, maxSummaryLength),
          generatedQuestion: this.generateDynamicQuestion(
            cleanedResults[idx].title,
            cleanedResults[idx].excerpt,
            cleanedResults[idx].category
          )
        });
      }

      return parsed;
    } catch (error) {
      console.error('❌ Batch LLM processing failed:', error);
      // Fallback: return original excerpts
      return results.map(r => ({
        processedContent: r.excerpt.substring(0, 500),
        generatedQuestion: this.generateDynamicQuestion(r.title, r.excerpt, r.category)
      }));
    }
  }

  /**
   * Generate LLM-processed content and question from excerpt (LEGACY - use batch instead)
   */
  private async generateContentAndQuestion(title: string, excerpt: string, category: string): Promise<{ processedContent: string; generatedQuestion: string }> {
    try {
      console.log(`🤖 Attempting to generate question for: ${title.substring(0, 30)}...`);
      console.time(`LLM processing for: ${title.substring(0, 30)}...`);

      // Clean the excerpt - remove all formatting artifacts
      let cleanExcerpt = excerpt
        .replace(/^Cevap:\s*/i, '')
        .replace(/^Soru:\s*/i, '')
        .replace(/^Yanıt:\s*/i, '')
        .replace(/^Answer:\s*/i, '')
        .replace(/^Question:\s*/i, '')
        .trim();

      // Get max length from settings
      const maxSummaryLength = parseInt(
        await settingsService.getSetting('ragSettings.summaryMaxLength') || '500'
      );

      // Get active system prompt from database
      const activeSystemPrompt = await this.getSystemPrompt();
      console.log(`📝 Using active system prompt for source summary (length: ${activeSystemPrompt?.length || 0})`);

      // Get language setting from database
      const responseLanguage = await settingsService.getSetting('response_language') || 'tr';

      // Get conversation tone from settings (friendly, formal, professional, casual)
      const conversationTone = await settingsService.getSetting('llmSettings.conversationTone')
        || await settingsService.getSetting('conversationTone')
        || await settingsService.getSetting('prompts.conversationTone')
        || 'professional';
      console.log(`🎭 Using conversation tone: ${conversationTone}`);

      // Get temperature from settings (check multiple possible keys)
      let temperature = 0.3; // Default fallback
      const tempSetting = await settingsService.getSetting('llmSettings.temperature')
        || await settingsService.getSetting('temperature')
        || await settingsService.getSetting('content_generation_temperature');

      if (tempSetting) {
        const parsed = parseFloat(tempSetting);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
          temperature = parsed;
          console.log(`🌡️  Using temperature from settings: ${temperature}`);
        }
      }

      // Define tone-specific instructions
      const toneInstructions = {
        friendly: responseLanguage === 'en'
          ? 'Use a warm, approachable tone. Speak like a helpful colleague. Use phrases like "you can", "this helps you", "simply put".'
          : 'Sıcak, samimi bir üslup kullan. Yardımsever bir arkadaş gibi konuş. "Şöyle düşünebilirsiniz", "basitçe", "size yardımcı olur" gibi ifadeler kullan.',
        formal: responseLanguage === 'en'
          ? 'Use a formal, professional tone. Maintain objectivity. Use precise legal terminology. Be respectful and authoritative.'
          : 'Resmi, profesyonel bir üslup kullan. Nesnelliği koru. Kesin hukuki terminoloji kullan. Saygılı ve otoriter ol.',
        professional: responseLanguage === 'en'
          ? 'Use a professional but accessible tone. Balance expertise with clarity. Be informative and trustworthy.'
          : 'Profesyonel ama anlaşılır bir üslup kullan. Uzmanlık ile açıklığı dengele. Bilgilendirici ve güvenilir ol.',
        casual: responseLanguage === 'en'
          ? 'Use a casual, conversational tone. Speak like chatting with someone. Keep it simple and easy to understand.'
          : 'Günlük, sohbet havasında bir üslup kullan. Biriyle sohbet eder gibi konuş. Basit ve anlaşılır tut.'
      };

      const toneInstruction = toneInstructions[conversationTone as keyof typeof toneInstructions] || toneInstructions.professional;

      // Create a powerful prompt that forces interpretation, not copying
      // Tone-aware and optimized for any LLM (OpenAI, Gemini, Claude, etc.)
      const prompt = responseLanguage === 'en' ? `
You are a tax and legal expert. Your job is to INTERPRET and explain content in YOUR OWN WORDS.

TONE: ${toneInstruction}

CRITICAL RULES:
❌ DO NOT copy the original text
❌ DO NOT start with "The document says..." or "This content discusses..."
❌ DO NOT preserve the original structure
✅ REWRITE in natural language matching the tone above
✅ EXPLAIN as if talking to someone who needs to understand quickly

TASK:
Read the content below and create:

1. A NATURAL EXPLANATION (max ${maxSummaryLength} characters):
   - What is the main point? (be specific: rates, deadlines, requirements)
   - Who does it affect? (taxpayers, companies, specific groups)
   - How does it work? (procedure, calculation, conditions)
   - Write in the ${conversationTone} tone specified above

2. A SPECIFIC QUESTION (max 15 words):
   - About the actual topic (use specific terms from content)
   - Natural conversation style matching the tone
   - Something someone would really ask

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

İYİLEŞTİRİLMİŞ İÇERİK:
[Your interpretation - completely rewritten in ${conversationTone} tone, NOT copied]

SORU:
[Natural question about the topic]

Title: ${title}
Content: ${cleanExcerpt}

REMEMBER: INTERPRET in ${conversationTone} tone, don't copy. Explain in YOUR OWN WORDS.
` : `
Sen vergi ve hukuk uzmanısın. Görevin içeriği YORUMLAMAK ve KENDI KELİMELERİNLE açıklamak.

ÜSLUBİN: ${toneInstruction}

KRİTİK KURALLAR:
❌ Orijinal metni KOPYALAMA
❌ "Bu belge şunu söylüyor..." diye BAŞLAMA
❌ Orijinal yapıyı KORUMA
✅ Yukarıdaki üsluba uygun doğal dilde YENİDEN YAZ
✅ Hızlıca anlaması gereken birine anlatır gibi AÇIKLA

GÖREV:
Aşağıdaki içeriği oku ve oluştur:

1. DOĞAL BİR AÇIKLAMA (maksimum ${maxSummaryLength} karakter):
   - Ana nokta ne? (spesifik ol: oranlar, süreler, gereksinimler)
   - Kimi etkiliyor? (mükellefler, şirketler, belirli gruplar)
   - Nasıl işliyor? (prosedür, hesaplama, koşullar)
   - Yukarıda belirtilen ${conversationTone} üslubunda yaz

2. SPESİFİK BİR SORU (maksimum 15 kelime):
   - Gerçek konu hakkında (içerikteki spesifik terimleri kullan)
   - Üsluba uygun doğal konuşma tarzı
   - Birinin gerçekten soracağı bir şey

YANITI TAM OLARAK BU FORMATTA VER:

İYİLEŞTİRİLMİŞ İÇERİK:
[Senin yorumun - ${conversationTone} üslubunda tamamen yeniden yazılmış, KOPYALANMAMIŞ]

SORU:
[Konu hakkında doğal soru]

Başlık: ${title}
İçerik: ${cleanExcerpt}

UNUT: ${conversationTone} üslubunda YORUMLA, kopyalama. KENDI KELİMELERİNLE açıkla.
`;

      // Use the LLM Manager with active system prompt and temperature from settings
      try {
        const response = await this.llmManager.generateChatResponse(prompt, {
          temperature: temperature,
          maxTokens: 500,
          systemPrompt: activeSystemPrompt || ''
        });

        if (response && response.content) {
          // Parse the response based on language
          const contentMatch = response.content.match(
            responseLanguage === 'en'
              ? /IMPROVED CONTENT:\s*(.*?)(?=\nQUESTION:|$)/s
              : /İYİLEŞTİRİLMİŞ İÇERİK:\s*(.*?)(?=\nSORU:|$)/s
          );
          const questionMatch = response.content.match(
            responseLanguage === 'en'
              ? /QUESTION:\s*(.*)/s
              : /SORU:\s*(.*)/s
          );

          // Clean the content
          let processedContent = contentMatch ? contentMatch[1].trim() : cleanExcerpt;
          processedContent = processedContent
            .replace(/^\*\*+/g, '')
            .replace(/\*\*+$/g, '')
            .replace(/\*\*\*/g, '')
            .replace(/^\[.*?\]/g, '') // Remove [Your interpretation...] if LLM copied the instruction
            .replace(/^Senin yorumun -/i, '')
            .replace(/^Your interpretation -/i, '')
            .trim();

          // Enforce max length from settings
          if (processedContent.length > maxSummaryLength) {
            processedContent = processedContent.substring(0, maxSummaryLength);
            // Try to cut at sentence boundary
            const lastPeriod = processedContent.lastIndexOf('.');
            if (lastPeriod > maxSummaryLength * 0.7) {
              processedContent = processedContent.substring(0, lastPeriod + 1);
            } else {
              processedContent += '...';
            }
          }

          // Clean the question
          let generatedQuestion = questionMatch ? questionMatch[1].trim() : `${title} hakkında bilgi verir misiniz?`;
          generatedQuestion = generatedQuestion
            .replace(/^\*\*+/g, '')
            .replace(/^Üretilmiş Soru:\s*/i, '')
            .replace(/^\[.*?\]/g, '') // Remove [Natural question...] if LLM copied the instruction
            .trim();

          return {
            processedContent,
            generatedQuestion
          };
        }
      } catch (error) {
        console.warn('Selected chat model failed, trying fallback:', error);
      }

      // Fallback to simple processing
      return {
        processedContent: cleanExcerpt.length > 100 ? cleanExcerpt : `${cleanExcerpt}. Expert consultation is recommended for this topic.`,
        generatedQuestion: cleanExcerpt.length > 50 ? `${title} ile ilgili detaylı bilgi alabilir miyim?` : `${title} hakkında bilgi verebilir misiniz?`
      };
    } catch (error) {
      console.timeEnd(`LLM processing for: ${title.substring(0, 30)}...`);
      console.error('Error generating content and question:', error);
      return {
        processedContent: excerpt,
        generatedQuestion: '' // Don't generate fallback questions
      };
    }
  }

  
  /**
   * Ensure conversation exists with better title
   */
  private async ensureConversation(conversationId: string, userId: string, firstMessage: string) {
    // Generate a better title from first message
    const title = firstMessage.length > 50 
      ? firstMessage.substring(0, 47) + '...'
      : firstMessage;

    const query = `
      INSERT INTO conversations (id, user_id, title, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `;

    await this.pool.query(query, [
      conversationId,
      userId,
      title
    ]);
  }

  /**
   * Save message to database
   */
  private async saveMessage(
    conversationId: string,
    role: string,
    content: string,
    sources?: any[],
    model?: string
  ) {
    const query = `
      INSERT INTO messages (id, conversation_id, role, content, sources, model, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    let lastError: Error | null = null;
    const maxRetries = 3;
    const retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.pool.query(query, [
          uuidv4(),
          conversationId,
          role,
          content,
          sources ? JSON.stringify(sources) : null,
          model || null
        ]);
        return; // Success, exit the function
      } catch (error) {
        lastError = error as Error;
        console.error(`saveMessage attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          console.log(`Retrying saveMessage in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // All retries failed, throw the last error
    throw lastError || new Error('Failed to save message after retries');
  }

  /**
   * Log activity for dashboard monitoring
   */
  private async logActivity(
    userId: string,
    activityType: 'model_change' | 'chat_start' | 'chat_message' | 'settings_change' | 'model_fallback',
    details: any
  ) {
    try {
      // Use user_activity_logs table instead of activity_log
      const query = `
        INSERT INTO user_activity_logs (user_id, action, details, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `;

      await this.pool.query(query, [
        userId,
        activityType,
        JSON.stringify(details)
      ]);
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }

  /**
   * Ensure database tables and columns exist
   */
  private async ensureTables() {
    try {
      const startTime = Date.now();

      // Check and add model column to messages table
      console.log('🔧 Checking messages table structure...');
      const modelColumnCheck = await this.pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'model'
      `);

      if (modelColumnCheck.rows.length === 0) {
        console.log('➕ Adding model column to messages table...');
        await this.pool.query(`ALTER TABLE messages ADD COLUMN model VARCHAR(255)`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model)`);
        console.log('✅ Added model column to messages table');
      } else {
        console.log('✅ Model column already exists in messages table');
      }

      // Create activity_log table if not exists
      console.log('🔧 Checking activity_log table...');

      // First check if table exists
      const tableCheck = await this.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'activity_log'
        )
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('➕ Creating activity_log table...');
        await this.pool.query(`
          CREATE TABLE activity_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR(255) NOT NULL,
            activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('model_change', 'chat_start', 'chat_message', 'settings_change')),
            details JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);

        // Create indexes
        await this.pool.query(`CREATE INDEX idx_activity_log_user_id ON activity_log(user_id)`);
        await this.pool.query(`CREATE INDEX idx_activity_log_activity_type ON activity_log(activity_type)`);
        await this.pool.query(`CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC)`);

        console.log('✅ Activity log table created successfully');
      } else {
        // Check if user_id column exists and has correct type
        const userIdColumnCheck = await this.pool.query(`
          SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = 'activity_log' AND column_name = 'user_id'
        `);

        if (userIdColumnCheck.rows.length > 0) {
          // Check if it's the wrong type (integer instead of varchar)
          const columnType = userIdColumnCheck.rows[0].data_type;
          if (columnType === 'integer' || columnType === 'int4') {
            console.log('⚠️ activity_log table has wrong user_id type, dropping and recreating...');
            await this.pool.query(`DROP TABLE activity_log`);
            console.log('✅ Dropped old activity_log table');

            // Recreate table with correct schema
            await this.pool.query(`
              CREATE TABLE activity_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL,
                activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('model_change', 'chat_start', 'chat_message', 'settings_change')),
                details JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
              )
            `);

            // Create indexes
            await this.pool.query(`CREATE INDEX idx_activity_log_user_id ON activity_log(user_id)`);
            await this.pool.query(`CREATE INDEX idx_activity_log_activity_type ON activity_log(activity_type)`);
            await this.pool.query(`CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC)`);

            console.log('✅ Activity log table recreated with correct schema');
          } else {
            console.log('✅ Activity log table already exists with proper columns');
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Database schema check completed in ${duration}ms`);
    } catch (error) {
      console.error('❌ Failed to ensure tables:', error);
      throw error; // Re-throw to see the full error
    }
  }

  /**
   * Get conversation history with retry logic
   */
  private async getConversationHistory(
    conversationId: string,
    limit: number = 10
  ): Promise<ChatMessage[]> {
    const query = `
      SELECT role, content
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    let lastError: Error | null = null;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.pool.query(query, [conversationId, limit]);
        return result.rows.reverse();
      } catch (error) {
        lastError = error as Error;
        console.error(`getConversationHistory attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          console.log(`Retrying getConversationHistory in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // All retries failed, throw the last error
    throw lastError || new Error('Failed to get conversation history after retries');
  }

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string) {
    const query = `
      SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id, c.title, c.created_at, c.updated_at
      ORDER BY c.updated_at DESC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get full conversation with messages
   */
  async getConversation(conversationId: string) {
    const conversationQuery = `
      SELECT * FROM conversations WHERE id = $1
    `;
    
    const messagesQuery = `
      SELECT * FROM messages 
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `;

    const [convResult, msgResult] = await Promise.all([
      this.pool.query(conversationQuery, [conversationId]),
      this.pool.query(messagesQuery, [conversationId])
    ]);

    if (!convResult.rows.length) {
      throw new Error('Conversation not found');
    }

    return {
      ...convResult.rows[0],
      messages: msgResult.rows
    };
  }

  /**
   * Get related topics based on user query, excluding sources used in response
   */
  async getRelatedTopics(query: string, usedSources: any[], limit: number = 7): Promise<any[]> {
    try {
      // Get relevance threshold from database
      const relevanceThreshold = parseFloat(await settingsService.getSetting('related_results_threshold') || '15');
      console.log(`🔍 Searching for related topics: "${query}" (limit: ${limit}, threshold: ${relevanceThreshold}%, excluding ${usedSources.length} sources)`);

      // Get IDs of sources already used in response to avoid duplicates
      const excludeIds = usedSources.map(source => source.id?.toString() || source.sourceId?.toString()).filter(Boolean);

      // Check if we should use unified embeddings or rag_data
      let useUnifiedEmbeddings = process.env.USE_UNIFIED_EMBEDDINGS === 'true';

      // Check database setting if not set in environment
      if (process.env.USE_UNIFIED_EMBEDDINGS === undefined) {
        try {
          const result = await pool.query(
            "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'use_unified_embeddings'"
          );
          useUnifiedEmbeddings = result.rows[0]?.setting_value === 'true';
        } catch (error) {
          // Default to false if setting not found
        }
      }

      let searchResults = [];
      if (useUnifiedEmbeddings) {
        searchResults = await semanticSearch.unifiedSemanticSearch(query, limit + 10); // Get more to filter
      } else {
        searchResults = await semanticSearch.hybridSearch(query, limit + 10); // Get more to filter
      }

      console.log(`Found ${searchResults.length} raw results for related topics`);

      // Filter out used sources and low-relevance results
      const filteredResults = searchResults.filter(result => {
        const score = result.score || (result.similarity_score * 100) || 0;
        const resultId = result.id || result.source_id;

        // Exclude used IDs and apply relevance threshold
        return score >= relevanceThreshold && !excludeIds.includes(resultId?.toString());
      });

      // Sort by relevance score and limit results
      const sortedResults = filteredResults
        .sort((a, b) => {
          const scoreA = a.score || (a.similarity_score * 100) || 0;
          const scoreB = b.score || (b.similarity_score * 100) || 0;
          return scoreB - scoreA;
        })
        .slice(0, limit);

      console.log(`Filtered to ${sortedResults.length} related topics (score >= 15%, excluded ${excludeIds.length} items)`);

      // Format results for frontend with LLM-generated summaries
      const formattedResults = [];

      for (let idx = 0; idx < sortedResults.length; idx++) {
        const result = sortedResults[idx];
        const score = result.score || (result.similarity_score * 100) || 0;
        const sourceTable = result.source_table || result.databaseInfo?.table || 'documents';

        // Use the source_table name directly as category - convert to readable format
        let category = 'Document';
        if (sourceTable) {
          category = sourceTable.charAt(0).toUpperCase() + sourceTable.slice(1).toLowerCase();
        }

        // Generate a meaningful title
        let title = result.title || `${category} - Source ${idx + 1}`;

        // Clean up title prefixes
        title = title
          .replace(/^sorucevap -\s*/i, '')
          .replace(/^ozelgeler -\s*/i, '')
          .replace(/^danistaykararlari -\s*/i, '')
          .replace(/^makaleler -\s*/i, '')
          .replace(/ - ID: \d+/g, '')
          .replace(/ \(Part \d+\/\d+\)/g, '')
          .trim();

        // Truncate long titles
        if (title.length > 80) {
          title = title.substring(0, 77) + '...';
        }

        const cleanExcerpt = this.stripHtml(result.excerpt || result.content || '');

        // Enable LLM generation for related topics
        let processedContent = cleanExcerpt;
        let generatedQuestion = '';

        try {
          console.log(`🤖 Processing related topic with LLM: ${title.substring(0, 30)}...`);
          const llmResult = await this.generateContentAndQuestion(title, cleanExcerpt, category);
          processedContent = llmResult.processedContent;
          generatedQuestion = llmResult.generatedQuestion;
        } catch (error) {
          console.warn('LLM processing for related topic failed, using fallback:', error);
          // Generate fallback question
          generatedQuestion = cleanExcerpt.length > 50 ? `${title} ile ilgili detaylı bilgi alabilir miyim?` : `${title} hakkında bilgi verebilir misiniz?`;
        }

        formattedResults.push({
          id: result.id || result.source_id || `related-${Date.now()}-${idx}`,
          title: title,
          excerpt: processedContent, // Use LLM-processed content
          category: category,
          sourceTable: sourceTable,
          score: Math.round(score),
          relevanceScore: score,
          sourceId: result.source_id,
          metadata: result.metadata || {},
          databaseInfo: {
            table: sourceTable,
            id: result.source_id,
            hasMetadata: !!result.metadata
          },
          priority: idx + 1,
          hasContent: !!(result.content || result.excerpt),
          contentLength: (result.content || result.excerpt || '').length,
          question: generatedQuestion, // Add generated question
          enriched: true // Mark as LLM-enriched
        });
      }

      return formattedResults;
    } catch (error) {
      console.error('Error getting related topics:', error);
      // Return empty array on error
      return [];
    }
  }

  /**
   * Get related topics with pagination for "Load More" functionality
   */
  async getRelatedTopicsPaginated(
    query: string,
    excludeIds: string[] = [],
    offset: number = 0,
    limit: number = 7
  ): Promise<any[]> {
    try {
      // Get relevance threshold from database
      const relevanceThreshold = parseFloat(await settingsService.getSetting('related_results_threshold') || '15');
      console.log(`🔍 Getting paginated related results: query="${query}", offset=${offset}, limit=${limit}, threshold=${relevanceThreshold}%`);

      // Check if we should use unified embeddings or rag_data
      let useUnifiedEmbeddings = process.env.USE_UNIFIED_EMBEDDINGS === 'true';

      // Check database setting if not set in environment
      if (process.env.USE_UNIFIED_EMBEDDINGS === undefined) {
        try {
          const result = await pool.query(
            "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'use_unified_embeddings'"
          );
          useUnifiedEmbeddings = result.rows[0]?.setting_value === 'true';
        } catch (error) {
          // Default to false if setting not found
        }
      }

      // Get more results to account for filtering
      const fetchLimit = limit + 20;
      let searchResults = [];

      if (useUnifiedEmbeddings) {
        searchResults = await semanticSearch.unifiedSemanticSearch(query, fetchLimit + offset);
      } else {
        searchResults = await semanticSearch.hybridSearch(query, fetchLimit + offset);
      }

      console.log(`Found ${searchResults.length} raw results for paginated related topics`);

      // Filter out excluded IDs and low-relevance results
      const filteredResults = searchResults.filter(result => {
        const score = result.score || (result.similarity_score * 100) || 0;
        const resultId = result.id || result.source_id;

        // Exclude used IDs and apply relevance threshold
        return score >= relevanceThreshold && !excludeIds.includes(resultId?.toString());
      });

      // Sort by relevance score
      const sortedResults = filteredResults
        .sort((a, b) => {
          const scoreA = a.score || (a.similarity_score * 100) || 0;
          const scoreB = b.score || (b.similarity_score * 100) || 0;
          return scoreB - scoreA;
        });

      // Apply pagination
      const paginatedResults = sortedResults.slice(offset, offset + limit);

      console.log(`Returning ${paginatedResults.length} paginated results (offset: ${offset})`);

      // Format results with LLM processing
      const formattedResults = [];

      for (let idx = 0; idx < paginatedResults.length; idx++) {
        const result = paginatedResults[idx];
        const score = result.score || (result.similarity_score * 100) || 0;
        const sourceTable = result.source_table || result.databaseInfo?.table || 'documents';

        // Use the source_table name directly as category - convert to readable format
        let category = 'Document';
        if (sourceTable) {
          category = sourceTable.charAt(0).toUpperCase() + sourceTable.slice(1).toLowerCase();
        }

        // Clean title
        let title = result.title || `${category} - Source ${offset + idx + 1}`;
        title = title
          .replace(/^sorucevap -\s*/i, '')
          .replace(/^ozelgeler -\s*/i, '')
          .replace(/^danistaykararlari -\s*/i, '')
          .replace(/^makaleler -\s*/i, '')
          .replace(/ - ID: \d+/g, '')
          .replace(/ \(Part \d+\/\d+\)/g, '')
          .trim();

        if (title.length > 80) {
          title = title.substring(0, 77) + '...';
        }

        const cleanExcerpt = this.stripHtml(result.excerpt || result.content || '');

        // Generate LLM-processed content and question
        let processedContent = cleanExcerpt;
        let generatedQuestion = '';

        try {
          console.log(`🤖 Processing paginated result with LLM: ${title.substring(0, 30)}...`);
          const llmResult = await this.generateContentAndQuestion(title, cleanExcerpt, category);
          processedContent = llmResult.processedContent;
          generatedQuestion = llmResult.generatedQuestion;
        } catch (error) {
          console.warn('LLM processing for paginated result failed, using fallback:', error);
          // Generate fallback question based on content language
          const isTurkishContent = /[çğıöşüÇĞİÖŞÜ]/.test(cleanExcerpt) ||
                                   /(\b(ve|ile|için|hakkında|bilgi|detaylı|verir|misiniz)\b)/i.test(cleanExcerpt);
          generatedQuestion = isTurkishContent ?
            `${title} hakkında detaylı bilgi verir misiniz?` :
            `Can you provide detailed information about ${title}?`;
        }

        formattedResults.push({
          id: result.id || result.source_id || `related-${Date.now()}-${offset}-${idx}`,
          title: title,
          excerpt: processedContent,
          category: category,
          sourceTable: sourceTable,
          score: Math.round(score),
          relevanceScore: score,
          sourceId: result.source_id,
          metadata: result.metadata || {},
          databaseInfo: {
            table: sourceTable,
            id: result.source_id,
            hasMetadata: !!result.metadata
          },
          priority: offset + idx + 1,
          hasContent: !!(result.content || result.excerpt),
          contentLength: (result.content || result.excerpt || '').length,
          question: generatedQuestion,
          enriched: true
        });
      }

      return formattedResults;
    } catch (error) {
      console.error('Error getting paginated related topics:', error);
      return [];
    }
  }

  /**
   * Get popular questions based on recent searches and actual database content
   */
  async getPopularQuestions(): Promise<string[]> {
    try {
      // 1. Get most searched questions from recent messages
      const recentSearchesQuery = `
        SELECT content, COUNT(*) as count
        FROM messages
        WHERE role = 'user'
          AND created_at > NOW() - INTERVAL '7 days'
          AND LENGTH(content) > 10
          AND LENGTH(content) < 200
        GROUP BY content
        ORDER BY count DESC
        LIMIT 5
      `;

      const recentResult = await this.pool.query(recentSearchesQuery);
      const recentQuestions = recentResult.rows.map(r => r.content);

      // 2. Get interesting titles from unified_embeddings (actual soru-cevap, makaleler, etc.)
      const unifiedQuestionsQuery = `
        SELECT DISTINCT
          COALESCE(metadata->>'title',
                   LEFT(content, 150)) as question_text,
          metadata->>'table' as source_type
        FROM unified_embeddings
        WHERE metadata->>'table' IN ('sorucevap', 'makaleler', 'ozelgeler')
          AND (metadata->>'title' IS NOT NULL OR content IS NOT NULL)
          AND LENGTH(COALESCE(metadata->>'title', content)) > 20
          AND LENGTH(COALESCE(metadata->>'title', content)) < 200
        ORDER BY RANDOM()
        LIMIT 10
      `;

      const unifiedResult = await this.pool.query(unifiedQuestionsQuery);
      const unifiedQuestions: string[] = [];

      for (const row of unifiedResult.rows) {
        let questionText = row.question_text || '';

        // Clean up the question text
        questionText = questionText
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();

        // Skip if too short or contains unwanted patterns
        if (questionText.length < 20 || questionText.includes('http')) {
          continue;
        }

        // Add question mark if it's a soru-cevap entry without one
        if (row.source_type === 'sorucevap' && !questionText.endsWith('?')) {
          questionText += '?';
        }

        unifiedQuestions.push(questionText);
      }

      // 3. Combine all questions, prioritize recent searches
      const allQuestions = [
        ...new Set([
          ...recentQuestions.slice(0, 2), // Max 2 recent searches
          ...unifiedQuestions.slice(0, 8) // Max 8 from database
        ])
      ];

      // 4. If not enough questions, add some default high-quality ones
      if (allQuestions.length < 4) {
        const defaultQuestions = [
          'KDV tevkifatı nasıl hesaplanır?',
          'Gelir vergisi beyannamesi hangi durumlarda verilir?',
          'E-fatura uygulaması zorunlu mudur?',
          'Stopaj oranları nelerdir?',
          'Kurumlar vergisi beyannamesi ne zaman verilir?',
          'Damga vergisi hangi işlemlerde alınır?'
        ];

        allQuestions.push(...defaultQuestions.slice(0, 4 - allQuestions.length));
      }

      // 5. Randomly select 4 questions
      const shuffled = allQuestions.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 4);
    } catch (error) {
      console.error('Error getting popular questions:', error);
      // Return high-quality default questions if error
      return [
        'KDV iade işlemleri nasıl yapılır?',
        'Gelir vergisi matrah tespit yöntemleri nelerdir?',
        'E-beyanname sistemi nasıl kullanılır?',
        'Stopaj tevkifatı hangi durumlarda yapılır?'
      ];
    }
  }
/**
   * Process a single source with LLM enrichment
   * Used by enhanced parallel processing
   */
  private async processSourceWithLLM(r: any, idx: number, enableLLMGeneration: boolean): Promise<any> {
    const category = this.categorizeSource(r);
    const score = r.score || (r.similarity_score ? Math.round(r.similarity_score * 100) : 50);

    // Build proper citation
    let citation = `[Source ${idx + 1}]`;
    if (r.metadata) {
      const parts = [];
      Object.keys(r.metadata).forEach(key => {
        const value = r.metadata[key];
        if (value && typeof value === 'string' && value.trim()) {
          parts.push(`${key}: ${value}`);
        }
      });
      if (parts.length > 0) {
        citation = parts.join(' - ');
      }
    }

    // Clean HTML from title and excerpt
    const cleanTitle = this.stripHtml(r.title?.replace(/ \(Part \d+\/\d+\)/g, '') || citation);
    const cleanExcerpt = this.stripHtml(r.excerpt || r.content || '');

    // Prepare content
    let processedContent = cleanExcerpt;
    let generatedQuestion = this.generateDynamicQuestion(cleanTitle, cleanExcerpt, category);

    // Generate LLM content if enabled
    if (enableLLMGeneration) {
      try {
        console.log(`🤖 Processing source ${idx + 1} with LLM: ${cleanTitle.substring(0, 30)}...`);
        const llmResult = await this.generateContentAndQuestion(cleanTitle, cleanExcerpt, category);
        processedContent = llmResult.processedContent;
        generatedQuestion = llmResult.generatedQuestion;
        console.log(`✅ Parallel LLM generated content (length: ${processedContent?.length || 0})`);
      } catch (error) {
        console.error(`❌ Parallel LLM processing FAILED for source ${idx + 1}:`, error);
        // Continue with fallback content
      }
    }

    return {
      id: r.id,
      title: cleanTitle,
      excerpt: this.truncateExcerpt(cleanExcerpt, 250),
      content: processedContent,
      question: generatedQuestion,
      category: category,
      sourceTable: r.source_table || 'documents',
      citation: citation,
      score: score,
      relevance: score,
      relevanceText: score > 80 ? 'Yüksek' : score > 60 ? 'Orta' : 'Düşük',
      databaseInfo: {
        table: r.source_table || 'documents',
        id: r.id,
        hasMetadata: !!r.metadata
      },
      index: idx + 1,
      metadata: r.metadata || {},
      priority: idx + 1,
      hasContent: !!(r.content || r.excerpt),
      contentLength: (r.content || r.excerpt || '').length,
      enriched: enableLLMGeneration
    };
  }

  /**
   * Create fallback result for failed processing
   */
  private createFallbackResult(r: any, idx: number): any {
    const category = this.categorizeSource(r);
    const score = r.score || (r.similarity_score ? Math.round(r.similarity_score * 100) : 50);
    const cleanTitle = this.stripHtml(r.title || `Kaynak ${idx + 1}`);
    const cleanExcerpt = this.stripHtml(r.excerpt || r.content || '');

    return {
      id: r.id,
      title: cleanTitle,
      excerpt: this.truncateExcerpt(cleanExcerpt, 250),
      content: cleanExcerpt,
      question: this.generateDynamicQuestion(cleanTitle, cleanExcerpt, category),
      category: category,
      sourceTable: r.source_table || 'documents',
      citation: `[Source ${idx + 1}]`,
      score: score,
      relevance: score,
      relevanceText: score > 80 ? 'Yüksek' : score > 60 ? 'Orta' : 'Düşük',
      databaseInfo: {
        table: r.source_table || 'documents',
        id: r.id,
        hasMetadata: !!r.metadata
      },
      index: idx + 1,
      metadata: r.metadata || {},
      priority: idx + 1,
      hasContent: !!(r.content || r.excerpt),
      contentLength: (r.content || r.excerpt || '').length,
      enriched: false
    };
  }

  /**
   * Get more search results with dynamic loading based on settings
   * This enables scroll-to-load functionality
   */
  async getMoreSearchResults(
    originalQuery: string,
    currentOffset: number,
    conversationId?: string
  ): Promise<{ sources: any[], hasMore: boolean, nextOffset: number }> {
    try {
      // Get settings
      const maxResults = parseInt(await settingsService.getSetting('ragSettings.maxResults') || '15');
      const minResults = parseInt(await settingsService.getSetting('ragSettings.minResults') || '5');
      const batchSize = parseInt(await settingsService.getSetting('parallel_llm_batch_size') || '3'); // Use batch size for pagination
      const minThreshold = parseFloat(await settingsService.getSetting('ragSettings.similarityThreshold') || '0.014');

      // Calculate how many results to fetch in this batch
      const fetchCount = Math.min(batchSize, maxResults - currentOffset);
      if (fetchCount <= 0) {
        return { sources: [], hasMore: false, nextOffset: currentOffset };
      }

      console.log(`🔍 Loading more results: query="${originalQuery}", offset=${currentOffset}, batch=${fetchCount} (batch size: ${batchSize})`);

      // Check if we should use unified embeddings
      let useUnifiedEmbeddings = process.env.USE_UNIFIED_EMBEDDINGS === 'true';
      if (process.env.USE_UNIFIED_EMBEDDINGS === undefined) {
        const result = await pool.query(
          "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'use_unified_embeddings'"
        );
        useUnifiedEmbeddings = result.rows[0]?.setting_value === 'true';
      }

      // Perform semantic search with offset
      let allResults = [];
      if (useUnifiedEmbeddings) {
        allResults = await semanticSearch.unifiedSemanticSearch(originalQuery, maxResults);
      } else {
        allResults = await semanticSearch.hybridSearch(originalQuery, maxResults);
      }

      // Filter and get additional results
      const filteredResults = allResults
        .filter(result => {
          const score = result.score || (result.similarity_score * 100) || 0;
          return score >= (minThreshold * 100);
        })
        .sort((a, b) => {
          const scoreA = a.score || (a.similarity_score * 100) || 0;
          const scoreB = b.score || (b.similarity_score * 100) || 0;
          return scoreB - scoreA;
        });

      // Get results from current offset in batch size chunks
      const newResults = filteredResults.slice(currentOffset, currentOffset + fetchCount);

      // Format the results
      const formattedResults = await this.formatSources(newResults);

      // Check if there are more results
      const hasMore = currentOffset + fetchCount < filteredResults.length;
      const nextOffset = currentOffset + fetchCount;

      console.log(`✅ Loaded ${formattedResults.length} more results (batch: ${fetchCount}), hasMore=${hasMore}, nextOffset=${nextOffset}`);

      return {
        sources: formattedResults,
        hasMore,
        nextOffset
      };

    } catch (error) {
      console.error('Error getting more search results:', error);
      return { sources: [], hasMore: false, nextOffset: currentOffset };
    }
  }
}

// Export singleton instance
export const ragChat = new RAGChatService();