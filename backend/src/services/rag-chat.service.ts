import { v4 as uuidv4 } from 'uuid';
import { semanticSearch, SemanticSearchService } from './semantic-search.service';
import { LLMManager } from './llm-manager.service';
import { dataSchemaService } from './data-schema.service';
import pool from '../config/database';
import { redis } from '../config/redis';
import dotenv from 'dotenv';
import { TIMEOUTS } from '../config';

// Settings service interface
interface SettingsService {
  getSetting(key: string): Promise<string | null>;
  getApiKey(keyName: string): Promise<string | null>;
}

// Question pattern types for dynamic question generation
interface QuestionPatternCombination {
  with: string;  // comma-separated secondary keywords e.g. "fiyat,metrekare"
  question: string;  // question template with {topic} placeholder
}

interface QuestionPattern {
  name: string;
  keywords: string;  // pipe-separated regex e.g. "satılık|kiralık|daire"
  titleKeywords?: string;  // optional: keywords to match in title
  combinations?: QuestionPatternCombination[];
  defaultQuestion: string;  // fallback question template
  priority?: number;  // lower = higher priority (default 99)
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

interface PdfContext {
  filename: string;
  extractedText: string;
  pageCount: number;
  confidence?: number;
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
  pdfContext?: PdfContext;
}

export class RAGChatService {
  private pool = pool;
  private llmManager: LLMManager;

  constructor() {
    this.llmManager = LLMManager.getInstance();
    console.log(' RAG Chat Service initialized with LLM Manager');
  }

  /**
   * 📝 INTELLIGENT TEXT TRUNCATION
   * Extracts meaningful context by truncating at sentence boundaries
   * Preserves complete sentences for better context understanding
   */
  private extractMeaningfulContext(content: string, maxLength: number = 600): string {
    if (!content || content.length <= maxLength) {
      return content || '';
    }

    const truncated = content.substring(0, maxLength);

    // Find the last sentence boundary (. ! ? or Turkish equivalents)
    const sentenceEnders = ['.', '!', '?', ':', ';'];
    let lastSentenceEnd = -1;

    for (const ender of sentenceEnders) {
      const lastIndex = truncated.lastIndexOf(ender);
      if (lastIndex > lastSentenceEnd && lastIndex > maxLength * 0.4) {
        lastSentenceEnd = lastIndex;
      }
    }

    // If we found a good sentence boundary, use it
    if (lastSentenceEnd > maxLength * 0.4) {
      return truncated.substring(0, lastSentenceEnd + 1).trim();
    }

    // Otherwise, try to cut at a word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }

    // Fallback: just truncate with ellipsis
    return truncated.trim() + '...';
  }

  /**
   * 🔗 CONVERSATION CONTEXT DETECTION
   * Detects if the current question is a follow-up to a previous question
   * Returns enhanced query that includes context from previous messages
   */
  private detectFollowUpQuestion(
    currentMessage: string,
    history: { role: string; content: string }[]
  ): { isFollowUp: boolean; enhancedQuery: string; contextInfo: string } {
    // Turkish follow-up indicators
    const followUpIndicators = {
      // Pronouns referring to previous subject
      pronouns: [
        'bu', 'bunu', 'bunun', 'bunlar', 'bunları',
        'o', 'onu', 'onun', 'onlar', 'onları',
        'şu', 'şunu', 'şunun', 'şunlar',
        'hangisi', 'hangisini', 'hangileri',
        'kim', 'kimi', 'kimin',
        'ne', 'neyi', 'neyin', 'neler', 'neleri',
        'nerede', 'nereye', 'nereden', 'neresi',
        'nasıl', 'neden', 'niçin', 'niye',
        'aynı', 'aynısı', 'diğer', 'diğeri', 'diğerleri',
        'başka', 'başkası', 'öteki',
        'kendisi', 'kendisini', 'kendisinin',
        'burası', 'orası', 'şurası'
      ],
      // Continuation words
      continuation: [
        'peki', 'ayrıca', 'ek olarak', 'bunun dışında',
        'bir de', 'başka', 'dahası', 'üstelik',
        'ya', 'veya', 'yoksa', 'hem de',
        'fakat', 'ancak', 'lakin', 'ama',
        'yani', 'mesela', 'örneğin',
        'daha', 'daha fazla', 'daha az',
        'tam olarak', 'kesin olarak', 'spesifik olarak',
        'detaylı', 'özetle', 'kısaca',
        'sonra', 'önce', 'ardından',
        'bununla ilgili', 'bu konuda', 'bu durumda',
        'o zaman', 'öyle ise', 'eğer öyleyse',
        'tabi', 'tabii ki', 'elbette'
      ],
      // Comparative/relative words
      comparative: [
        'daha iyi', 'daha kötü', 'daha ucuz', 'daha pahalı',
        'en iyi', 'en kötü', 'en ucuz', 'en pahalı',
        'karşılaştır', 'fark', 'farkı', 'benzer', 'benzerlik',
        'alternatif', 'seçenek', 'diğer seçenekler'
      ]
    };

    const lowerMessage = currentMessage.toLowerCase().trim();

    // Check for follow-up indicators at the start of the message
    const startsWithIndicator = [...followUpIndicators.pronouns, ...followUpIndicators.continuation]
      .some(word => lowerMessage.startsWith(word + ' ') || lowerMessage.startsWith(word + ',') || lowerMessage === word);

    // Check for pronouns anywhere in short messages (likely referring to previous context)
    const hasPronouns = lowerMessage.length < 100 &&
      followUpIndicators.pronouns.some(pronoun => {
        const regex = new RegExp(`\\b${pronoun}\\b`, 'i');
        return regex.test(lowerMessage);
      });

    // Check for continuation words
    const hasContinuation = followUpIndicators.continuation.some(word =>
      lowerMessage.includes(word)
    );

    // Check for comparative words
    const hasComparative = followUpIndicators.comparative.some(word =>
      lowerMessage.includes(word)
    );

    // Determine if this is a follow-up question
    const isFollowUp = startsWithIndicator || hasPronouns || hasContinuation || hasComparative;

    if (!isFollowUp || history.length === 0) {
      return { isFollowUp: false, enhancedQuery: currentMessage, contextInfo: '' };
    }

    // Find the last user question and assistant response from history
    let lastUserQuestion = '';
    let lastAssistantResponse = '';

    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user' && !lastUserQuestion) {
        lastUserQuestion = history[i].content;
      } else if (history[i].role === 'assistant' && !lastAssistantResponse) {
        // Get meaningful context from assistant response (up to 600 chars, at sentence boundary)
        lastAssistantResponse = this.extractMeaningfulContext(history[i].content, 600);
      }
      if (lastUserQuestion && lastAssistantResponse) break;
    }

    if (!lastUserQuestion) {
      return { isFollowUp: false, enhancedQuery: currentMessage, contextInfo: '' };
    }

    // Create enhanced query that combines previous context with current question
    // This helps semantic search find relevant documents
    const enhancedQuery = `${lastUserQuestion} ${currentMessage}`;
    const contextInfo = `[Önceki soru: "${lastUserQuestion.substring(0, 100)}..."]`;

    console.log(`🔗 FOLLOW-UP DETECTED:`);
    console.log(`   Previous: "${lastUserQuestion.substring(0, 50)}..."`);
    console.log(`   Current: "${currentMessage.substring(0, 50)}..."`);
    console.log(`   Enhanced: "${enhancedQuery.substring(0, 80)}..."`);

    return { isFollowUp: true, enhancedQuery, contextInfo };
  }

  /**
   * ⚡ FAST MODE: Extract keywords for keyword-first hybrid search
   * Uses simple keyword extraction for faster initial filtering
   */
  private extractKeywordsForFastSearch(message: string): string[] {
    // Turkish stop words to filter out
    const stopWords = new Set([
      've', 'veya', 'ile', 'için', 'de', 'da', 'bir', 'bu', 'şu', 'o',
      'ne', 'nasıl', 'neden', 'niçin', 'nerede', 'kim', 'hangi',
      'mı', 'mi', 'mu', 'mü', 'dır', 'dir', 'dur', 'dür',
      'var', 'yok', 'olan', 'olarak', 'gibi', 'kadar', 'daha',
      'en', 'çok', 'az', 'her', 'hiç', 'bazı', 'tüm', 'bütün',
      'bana', 'beni', 'sana', 'seni', 'ona', 'onu', 'bize', 'size',
      'hakkında', 'ile', 'ilgili', 'üzerine', 'üzerinde', 'içinde',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'how', 'why',
      'listele', 'göster', 'anlat', 'açıkla', 'söyle', 'bilgi', 'ver'
    ]);

    // Extract words, filter stop words, keep meaningful ones
    const words = message
      .toLowerCase()
      .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Return unique keywords, max 5 for fast search
    return [...new Set(words)].slice(0, 5);
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

  /**
   * Process a message with PDF content ONLY (no RAG search)
   * Used when user uploads a PDF - the PDF content is the sole context
   */
  private async processPdfOnlyMessage(
    message: string,
    conversationId: string,
    userId: string,
    systemPrompt: string,
    options: ChatOptions
  ) {
    const pdfContext = options.pdfContext!;
    const llmManager = LLMManager.getInstance();

    // Batch fetch all PDF-related settings
    const settingsKeys = [
      'response_language',
      'llmSettings.activeChatModel',
      'ragSettings.pdfInstructionTr',
      'ragSettings.pdfInstructionEn',
      'ragSettings.pdfMaxLength'
    ];

    const settingsResult = await pool.query(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [settingsKeys]
    );

    const settingsMap = new Map(settingsResult.rows.map(r => [r.key, r.value]));

    const responseLanguage = settingsMap.get('response_language') || 'tr';
    const activeModel = settingsMap.get('llmSettings.activeChatModel') || 'anthropic/claude-3-5-sonnet-20241022';

    // Truncate PDF content to avoid context overflow - configurable from settings
    const maxPdfLength = parseInt(settingsMap.get('ragSettings.pdfMaxLength') || '20000');
    let pdfText = pdfContext.extractedText;
    if (pdfText.length > maxPdfLength) {
      pdfText = pdfText.substring(0, maxPdfLength) + '\n\n[... belgenin geri kalani kisaltildi ...]';
    }

    // Build PDF-focused prompt - instruction loaded from settings
    const pdfLabel = responseLanguage === 'en' ? 'DOCUMENT CONTENT' : 'BELGE ICERIGI';
    const questionLabel = responseLanguage === 'en' ? 'USER QUESTION' : 'KULLANICI SORUSU';

    // Default instructions (used if not configured in settings)
    const defaultInstructionTr = `Kullanicinin yuklediği bir belgeyi inceliyorsun. Once belgenin ne hakkinda olduğunu kısaca acıkla (1-2 cumle), sonra kullanicinin sorusunu SADECE belge icerigine dayanarak yanitla. Soru belgeden cevaplanamıyorsa bunu acikca belirt.`;
    const defaultInstructionEn = `You are analyzing a document the user has uploaded. First, briefly describe what the document is about (1-2 sentences), then answer the user's question based ONLY on the document content. If the question cannot be answered from the document, say so clearly.`;

    const pdfInstruction = responseLanguage === 'en'
      ? (settingsMap.get('ragSettings.pdfInstructionEn') || defaultInstructionEn)
      : (settingsMap.get('ragSettings.pdfInstructionTr') || defaultInstructionTr);

    const userPrompt = `${pdfInstruction}

--- ${pdfLabel}: ${pdfContext.filename} ---
${pdfText}
--- BELGE SONU ---

${questionLabel}: ${message}`;

    console.log(`[PDF Mode] Sending ${pdfText.length} chars from PDF to LLM (instruction from ${settingsMap.has('ragSettings.pdfInstructionTr') ? 'settings' : 'default'})`);

    // Extract provider from model
    const providerFromModel = llmManager.extractProviderFromModel(activeModel);

    // Generate response
    const response = await llmManager.generateChatResponse(
      userPrompt,
      {
        temperature: options.temperature,
        maxTokens: options.maxTokens || 2000,
        systemPrompt: systemPrompt,
        preferredProvider: providerFromModel
      }
    );

    // Save message to conversation
    try {
      await this.saveMessage(conversationId, 'user', message, { pdfFilename: pdfContext.filename });
      await this.saveMessage(conversationId, 'assistant', response.content, {
        model: activeModel,
        pdfFilename: pdfContext.filename
      });
    } catch (saveError) {
      console.error('[PDF Mode] Failed to save messages:', saveError);
    }

    console.log(`[PDF Mode] Response generated for: ${pdfContext.filename}`);

    return {
      response: response.content,
      sources: [], // No RAG sources in PDF-only mode
      conversationId: conversationId,
      pdfMode: true,
      pdfFilename: pdfContext.filename
    };
  }

  private async getSystemPrompt(): Promise<string> {
    let basePrompt = '';
    let llmGuide = '';

    try {
      // System prompt comes from prompts.list (user-configurable via UI)
      // Schema is for data structure guide (llmGuide), NOT system prompt
      const promptsListResult = await pool.query(
        "SELECT value FROM settings WHERE key = 'prompts.list'"
      );

      if (promptsListResult.rows.length > 0) {
        try {
          // Parse the JSON array of prompts
          const rawValue = promptsListResult.rows[0].value;
          console.log(`📋 prompts.list raw type: ${typeof rawValue}, length: ${rawValue?.length || 0}`);

          const promptsList = typeof rawValue === 'string'
            ? JSON.parse(rawValue)
            : rawValue;

          console.log(`📋 prompts.list parsed: isArray=${Array.isArray(promptsList)}, count=${Array.isArray(promptsList) ? promptsList.length : 0}`);

          // Find the active prompt
          const activePrompt = Array.isArray(promptsList)
            ? promptsList.find((p: any) => p.isActive === true)
            : null;

          console.log(`📋 Active prompt found: ${!!activePrompt}, hasSystemPrompt=${!!activePrompt?.systemPrompt}, promptLength=${activePrompt?.systemPrompt?.length || 0}`);

          if (activePrompt) {
            const tone = activePrompt.conversationTone || 'professional';
            const toneInstruction = this.getToneInstruction(tone);
            const content = activePrompt.systemPrompt || '';

            if (content) {
              console.log(`✅ Using active prompt: ${activePrompt.name || activePrompt.id} with ${tone} tone (${content.length} chars)`);
              basePrompt = `${toneInstruction}\n\n${content}`;
            } else {
              console.warn(`⚠️ Active prompt found but systemPrompt is empty!`);
            }
          } else {
            console.warn(`⚠️ No active prompt found in prompts.list array`);
          }
        } catch (parseError) {
          console.warn('Failed to parse prompts.list:', parseError);
        }
      } else {
        console.warn(`⚠️ prompts.list not found in settings table`);
      }

      // Fallback: Try old format (prompts.{id}.active keys)
      if (!basePrompt) {
        const activePromptResult = await pool.query(
          "SELECT key, value FROM settings WHERE key LIKE 'prompts.%.active' AND value = 'true' LIMIT 1"
        );

        if (activePromptResult.rows.length > 0) {
          const activeKey = activePromptResult.rows[0].key;
          const promptId = activeKey.split('.')[1];

          const tone = await this.getConversationTone(promptId);
          const toneInstruction = this.getToneInstruction(tone);

          const promptResult = await pool.query(
            "SELECT value FROM settings WHERE key = $1",
            [`prompts.${promptId}.content`]
          );

          if (promptResult.rows.length > 0) {
            const content = typeof promptResult.rows[0].value === 'string'
              ? promptResult.rows[0].value
              : promptResult.rows[0].value;
            console.log(`✅ Using active prompt (legacy): ${promptId} with ${tone} tone`);
            basePrompt = `${toneInstruction}\n\n${content}`;
          }
        }
      }

      // Fallback: Try old chatbot_settings table
      if (!basePrompt) {
        const oldResult = await pool.query(
          "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'system_prompt'"
        );

        if (oldResult.rows[0]?.setting_value) {
          console.log('⚠️ Using system prompt from old chatbot_settings table');
          basePrompt = oldResult.rows[0].setting_value;
        }
      }

      // Get LLM Guide from active DataSchema
      try {
        llmGuide = await dataSchemaService.getLLMGuide();
        if (llmGuide) {
          console.log(` DataSchema LLM Guide loaded (${llmGuide.length} chars)`);
        }
      } catch (schemaError) {
        console.warn('Failed to load DataSchema LLM Guide:', schemaError);
      }

    } catch (error) {
      console.warn('Failed to fetch system prompt from database:', error);
    }

    // Default system prompt from settings (NO HARDCODED DEFAULTS - multi-tenant support)
    if (!basePrompt) {
      // Get default prompts from settings - each tenant can customize these
      let responseLanguage = 'tr';
      let customDefaultTr: string | null = null;
      let customDefaultEn: string | null = null;

      try {
        const settingsResult = await pool.query(
          "SELECT key, value FROM settings WHERE key IN ('response_language', 'ragSettings.defaultSystemPromptTr', 'ragSettings.defaultSystemPromptEn')"
        );

        for (const row of settingsResult.rows) {
          if (row.key === 'response_language') responseLanguage = row.value || 'tr';
          if (row.key === 'ragSettings.defaultSystemPromptTr') customDefaultTr = row.value;
          if (row.key === 'ragSettings.defaultSystemPromptEn') customDefaultEn = row.value;
        }
      } catch (e) {
        console.warn('Failed to fetch default system prompt settings:', e);
      }

      // Use settings-based defaults (admin must configure these per tenant)
      basePrompt = responseLanguage === 'en'
        ? customDefaultEn
        : customDefaultTr;

      if (basePrompt) {
        console.log(`️ Using default system prompt from settings (${responseLanguage})`);
      } else {
        // Minimal fallback only if settings not configured - admin should configure this
        console.warn('⚠️ No system prompt configured in settings! Please configure ragSettings.defaultSystemPromptTr/En in admin panel.');
        basePrompt = responseLanguage === 'en'
          ? 'Answer based on the provided context.'
          : 'Sağlanan bağlama göre yanıt ver.';
      }
    }

    // Combine base prompt with LLM Guide if available
    if (llmGuide) {
      return `${basePrompt}\n\n--- DATA CONTEXT ---\n${llmGuide}`;
    }

    return basePrompt;
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
      console.log(` System Prompt loaded (length: ${systemPrompt?.length || 0} chars)`);

      // PDF-ONLY MODE: If user uploaded a PDF, skip RAG search entirely
      // The PDF content IS the context - no need for semantic search
      if (options.pdfContext && options.pdfContext.extractedText) {
        console.log(`[PDF Mode] User uploaded PDF: ${options.pdfContext.filename}, using PDF content as sole context`);
        return this.processPdfOnlyMessage(message, convId, userId, systemPrompt, options);
      }

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
      // Includes all instruction/prompt settings for full customization
      const settingsKeys = [
        'ragSettings.maxResults', 'maxResults',
        'ragSettings.minResults', 'minResults',
        'parallel_llm_batch_size',
        'enable_parallel_llm',
        'parallel_llm_count',
        'ragSettings.similarityThreshold', 'similarityThreshold', 'semantic_search_threshold',
        'ragSettings.lowConfidenceThreshold', 'lowConfidenceThreshold', 'databaseconfidence',
        'response_language',
        'llmSettings.activeChatModel',
        // Instruction/prompt settings (customizable from admin panel)
        'ragSettings.followUpInstructionTr',
        'ragSettings.followUpInstructionEn',
        'ragSettings.fastModeInstructionTr',
        'ragSettings.fastModeInstructionEn',
        'ragSettings.citationInstructionTr',
        'ragSettings.citationInstructionEn',
        // Configurable messages (multi-tenant support)
        'ragSettings.noResultsMessageTr',
        'ragSettings.noResultsMessageEn',
        // Citation control
        'ragSettings.disableCitationText'
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
        '30'
      );
      const minResults = parseInt(
        settingsMap.get('ragSettings.minResults') ||
        settingsMap.get('minResults') ||
        '8'
      );
      const batchSize = parseInt(settingsMap.get('parallel_llm_batch_size') || '3');
      const minThreshold = parseFloat(
        settingsMap.get('ragSettings.similarityThreshold') ||
        settingsMap.get('similarityThreshold') ||
        settingsMap.get('semantic_search_threshold') ||
        '0.005'
      );
      const responseLanguage = settingsMap.get('response_language') || 'tr';
      const activeModel = settingsMap.get('llmSettings.activeChatModel') || 'anthropic/claude-3-5-sonnet-20241022';
      const lowConfidenceThreshold = parseFloat(
        settingsMap.get('ragSettings.lowConfidenceThreshold') ||
        settingsMap.get('lowConfidenceThreshold') ||
        settingsMap.get('databaseconfidence') ||
        '0.5'
      );

      // Check if citations are disabled
      const citationsDisabled = maxResults === 0 && minResults === 0;
      console.log(`️ RAG Settings: maxResults=${maxResults}, minResults=${minResults}, batchSize=${batchSize}, threshold=${minThreshold}, citationsDisabled=${citationsDisabled}`);

      // 🔗 EARLY CONVERSATION HISTORY FETCH for follow-up detection
      // Get history BEFORE search to enable context-aware queries
      let earlyHistory: { role: string; content: string }[] = [];
      try {
        earlyHistory = await this.getConversationHistory(convId, 5);
        console.log(`📜 Fetched ${earlyHistory.length} previous messages for context detection`);
      } catch (histError) {
        console.warn('Could not fetch early history for follow-up detection:', histError);
      }

      // 🔗 FOLLOW-UP QUESTION DETECTION
      // Detect if current question references previous context
      const followUpResult = this.detectFollowUpQuestion(message, earlyHistory);
      const searchQuery = followUpResult.isFollowUp ? followUpResult.enhancedQuery : message;

      if (followUpResult.isFollowUp) {
        console.log(`🔗 Using enhanced query for semantic search: "${searchQuery.substring(0, 80)}..."`);
      }

      let searchResults: any[] = [];
      let allResults: any[] = [];
      let initialDisplayCount = 0;

      if (!citationsDisabled) {
        // Use semantic search to find related content (only if citations enabled)
        if (useUnifiedEmbeddings) {
          allResults = await semanticSearch.unifiedSemanticSearch(searchQuery, maxResults);
        } else {
          allResults = await semanticSearch.hybridSearch(searchQuery, maxResults);
        }

        console.log(` DEBUG: unifiedSemanticSearch returned ${allResults.length} results`);
        if (allResults.length > 0) {
          console.log(` DEBUG: First raw result:`, {
            title: allResults[0].title,
            score: allResults[0].score,
            similarity_score: allResults[0].similarity_score
          });
        }

        // Sort by similarity score (no threshold filtering - show all results)
        searchResults = allResults
          .sort((a, b) => {
            const scoreA = a.score || (a.similarity_score * 100) || 0;
            const scoreB = b.score || (b.similarity_score * 100) || 0;
            return scoreB - scoreA; // Highest similarity first
          });

        console.log(`Found ${searchResults.length} total results (sorted by similarity, no threshold filtering)`);

        // For initial display, use minResults
        initialDisplayCount = Math.min(minResults, searchResults.length);
        console.log(` Displaying ${initialDisplayCount} initial results (minResults: ${minResults})`);

        // Ensure we have at least minResults if available
        if (searchResults.length === 0 && allResults.length > 0) {
          searchResults = allResults.slice(0, minResults);
          console.log('Using all available results');
        }
      } else {
        // ⚡ FAST MODE: Citations disabled but still do semantic search for context
        console.log('⚡ FAST MODE: Citations disabled - performing keyword-first hybrid search');

        // Extract keywords for faster initial filtering
        const keywords = this.extractKeywordsForFastSearch(searchQuery);
        console.log(`⚡ FAST MODE: Keywords extracted: [${keywords.join(', ')}]`);

        // Still perform search but with reduced limit for faster response
        // Use enhanced searchQuery (includes previous context if follow-up)
        const fastModeLimit = 15; // Slightly more results for better keyword matching
        if (useUnifiedEmbeddings) {
          allResults = await semanticSearch.unifiedSemanticSearch(searchQuery, fastModeLimit);
        } else {
          allResults = await semanticSearch.hybridSearch(searchQuery, fastModeLimit);
        }

        // ⚡ FAST MODE ENHANCEMENT: Keyword boost for better relevance
        // Boost results that contain extracted keywords in title or content
        searchResults = allResults.map(result => {
          let keywordBoost = 0;
          const titleLower = (result.title || '').toLowerCase();
          const contentLower = (result.excerpt || result.content || '').toLowerCase();

          keywords.forEach(keyword => {
            if (titleLower.includes(keyword)) keywordBoost += 0.15; // Title match = strong boost
            if (contentLower.includes(keyword)) keywordBoost += 0.05; // Content match = slight boost
          });

          return {
            ...result,
            score: (result.score || (result.similarity_score * 100) || 0) + (keywordBoost * 100),
            keywordBoost
          };
        }).sort((a, b) => {
          const scoreA = a.score || 0;
          const scoreB = b.score || 0;
          return scoreB - scoreA;
        });

        // Use top 5 results for context in fast mode
        initialDisplayCount = Math.min(5, searchResults.length);

        // Log keyword boost effects
        const boostedCount = searchResults.filter(r => r.keywordBoost > 0).length;
        console.log(`⚡ FAST MODE: Found ${searchResults.length} results, ${boostedCount} boosted by keywords, using top ${initialDisplayCount} for context`);

        if (searchResults.length > 0) {
          console.log(`⚡ Top result: "${searchResults[0].title?.substring(0, 50)}..." (score: ${searchResults[0].score?.toFixed(1)}, boost: ${(searchResults[0].keywordBoost * 100).toFixed(0)}%)`);
        }
      }

      // 3. Get conversation history (use early history if already fetched)
      let history = earlyHistory;
      if (history.length === 0) {
        try {
          history = await this.getConversationHistory(convId, 5);
        } catch (dbError) {
          console.error('Failed to get conversation history:', dbError);
          // Continue without history if DB fails
          history = [];
        }
      }

      // 4. Generate response using LLM Manager
      const llmManager = LLMManager.getInstance();

      // Create enhanced context with actual content for better response generation
      // Now includes schema metadata for richer LLM context
      // 🔧 FIX: Limit context length to prevent model hallucination with small models
      const maxContextLength = parseInt(settingsMap.get('ragSettings.maxContextLength') || '6000');
      const maxExcerptLength = parseInt(settingsMap.get('ragSettings.maxExcerptLength') || '250');

      let contextParts: string[] = [];
      let currentContextLength = 0;

      for (let idx = 0; idx < Math.min(initialDisplayCount, searchResults.length); idx++) {
        const r = searchResults[idx];
        const score = Math.round(r.score || (r.similarity_score * 100) || 0);
        const title = r.title || `Kaynak ${idx + 1}`;
        // Get content - use excerpt, content, or title as fallback
        // Clean raw metadata content (handles crawler records with listing_id/url format)
        const rawContent = r.excerpt || r.content || '';
        const cleanedContent = this.cleanRawMetadataContent(rawContent, r.metadata);
        // 🔧 Use configurable excerpt length (smaller for smaller models)
        let content = this.truncateExcerpt(cleanedContent, maxExcerptLength);
        // If still empty after truncation, use title as content
        if (!content || content.trim().length === 0) {
          content = `Bu kaynak "${title}" başlıklı bir belgedir.`;
        }

        // Add schema metadata for richer context (tarih, kurum, makam, konu, kategori, yil)
        let metadataLine = '';
        if (r.metadata) {
          const relevantFields = ['tarih', 'kurum', 'makam', 'konu', 'kategori', 'yil', 'sayi', 'esas_no', 'karar_no']
            .filter(f => r.metadata[f])
            .map(f => `${f}: ${r.metadata[f]}`)
            .join(', ');
          if (relevantFields) {
            metadataLine = `\n   [${relevantFields}]`;
          }
        }

        const part = `${idx + 1}. ${title}${metadataLine}\n${content}\n`;

        // 🔧 Stop adding context if we've exceeded max length
        if (currentContextLength + part.length > maxContextLength) {
          console.log(`⚠️ Context truncated at source ${idx + 1}/${initialDisplayCount} (limit: ${maxContextLength} chars)`);
          break;
        }

        contextParts.push(part);
        currentContextLength += part.length;
      }

      const enhancedContext = contextParts.join('\n');
      console.log(`📊 Context built: ${contextParts.length} sources, ${enhancedContext.length} chars (max: ${maxContextLength})`);

      // Check confidence levels based on similarity scores
      const bestScore = searchResults.length > 0 ? (searchResults[0].score || 0) : 0;

      // Get threshold settings (0-1 range, e.g., 0.25 = 25%, 0.75 = 75%)
      const HIGH_CONFIDENCE_THRESHOLD = 0.50; // 50% similarity = strong match
      const LOW_CONFIDENCE_THRESHOLD = parseFloat(
        settingsMap.get('ragSettings.similarityThreshold') ||
        settingsMap.get('similarityThreshold') ||
        '0.08'
      ); // Below this = "not found" message

      // Check if we have actual content (not just empty strings or only titles)
      const hasActualContent = searchResults.slice(0, initialDisplayCount).some(r =>
        (r.excerpt && r.excerpt.trim().length > 0) || (r.content && r.content.trim().length > 0)
      );

      // Debug: Log content availability
      console.log(` DEBUG - Content check:`, {
        resultsCount: searchResults.length,
        initialDisplayCount,
        hasActualContent,
        firstResultHasExcerpt: searchResults[0] ? !!(searchResults[0].excerpt && searchResults[0].excerpt.trim().length > 0) : false,
        firstResultHasContent: searchResults[0] ? !!(searchResults[0].content && searchResults[0].content.trim().length > 0) : false,
        firstResultTitle: searchResults[0]?.title?.substring(0, 50),
        enhancedContextLength: enhancedContext.length
      });

      const hasNoResults = searchResults.length === 0 || !enhancedContext || enhancedContext.trim().length === 0 || !hasActualContent;
      const isBelowThreshold = bestScore < LOW_CONFIDENCE_THRESHOLD; // Below minimum threshold
      const hasHighConfidence = bestScore >= HIGH_CONFIDENCE_THRESHOLD;
      const hasPartialMatch = bestScore >= LOW_CONFIDENCE_THRESHOLD && bestScore < HIGH_CONFIDENCE_THRESHOLD;

      console.log(` Context quality: bestScore=${(bestScore * 100).toFixed(1)}%, threshold=${(LOW_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%, results=${searchResults.length}, hasActualContent=${hasActualContent}, high=${hasHighConfidence}, partial=${hasPartialMatch}, belowThreshold=${isBelowThreshold}`);

      // CASE 1: No results - return "not found" message from settings (configurable per tenant)
      if (hasNoResults) {
        // Get customizable "no results" message from settings
        const noResultsMessageTr = settingsMap.get('ragSettings.noResultsMessageTr') ||
          'Bu konuda yeterli bilgi bulunamadı. Daha spesifik bir soru sorarak veya farklı anahtar kelimelerle tekrar deneyebilirsiniz.';
        const noResultsMessageEn = settingsMap.get('ragSettings.noResultsMessageEn') ||
          "I couldn't find relevant information for your question. Please try rephrasing or using different keywords.";

        const noResultsMessage = responseLanguage === 'en' ? noResultsMessageEn : noResultsMessageTr;

        console.log(`️ No relevant context found for query: "${message}" (bestScore=${(bestScore * 100).toFixed(1)}% < threshold=${(LOW_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%)`);

        return {
          response: noResultsMessage,
          sources: [],
          relatedTopics: [],
          conversationId: convId,
          provider: 'system',
          model: 'no-context',
          providerDisplayName: 'System',
          language: options.language || 'tr',
          fallbackUsed: false,
          originalModel: activeModel || 'none',
          actualProvider: 'system',
          lowConfidence: true
        };
      }

      // CASE 2 & 3: Has results (either high confidence or partial match)
      // Let LLM generate response, but add instruction for partial matches

      // Generate user message with context (NOT including system prompt - it goes separately)
      // NOTE: PDF-only mode is handled separately by processPdfOnlyMessage() at the start of processMessage()
      const contextLabel = responseLanguage === 'en' ? 'CONTEXT INFORMATION' : 'BAĞLAM BİLGİLERİ';
      const questionLabel = responseLanguage === 'en' ? 'QUESTION' : 'SORU';

      let userPrompt: string;

      // Check if citation text should be disabled (sources shown but no [1], [2] in response)
      const disableCitationText = settingsMap.get('ragSettings.disableCitationText') === 'true';

      // ⚡ FAST MODE or Citation Text Disabled: Simplified prompt without citation instructions
      if (citationsDisabled || disableCitationText) {
        console.log(`⚡ NO CITATIONS MODE: citationsDisabled=${citationsDisabled}, disableCitationText=${disableCitationText}`);

        // 🔗 Add follow-up context instruction if this is a follow-up question
        // NOTE: Instruction loaded from settings (ragSettings.followUpInstructionTr/En)
        let followUpInstruction = '';
        if (followUpResult.isFollowUp && followUpResult.contextInfo) {
          // Default instructions (used if settings not configured)
          const defaultInstructionEn = '[INTERNAL: Use conversation history for context. Do NOT mention that this relates to a previous question - answer naturally as if continuing a conversation.]';
          const defaultInstructionTr = '[DAHİLİ: Konuşma geçmişini bağlam olarak kullan. Bunun önceki bir soruyla ilgili olduğundan BAHSETME - doğal bir sohbet devam ediyormuş gibi yanıt ver.]';

          // Get from settings or use defaults
          const customInstructionTr = settingsMap.get('ragSettings.followUpInstructionTr');
          const customInstructionEn = settingsMap.get('ragSettings.followUpInstructionEn');

          followUpInstruction = responseLanguage === 'en'
            ? `\n\n${customInstructionEn || defaultInstructionEn}`
            : `\n\n${customInstructionTr || defaultInstructionTr}`;
          console.log('🔗 Added follow-up context instruction (from settings:', !!customInstructionTr || !!customInstructionEn, ')');
        }

        // Fast mode instruction - loaded from settings
        // IMPORTANT: Explicitly tell LLM not to use citation markers like [1], [2], [3]
        // Now supports {maxLength} placeholder for character count from settings
        const fastModeMaxLength = parseInt(
          settingsMap.get('ragSettings.summaryMaxLength') || '2000'
        );

        const defaultFastModeEn = 'Write a comprehensive answer of approximately {maxLength} characters based on the context. Write natural paragraphs without citations. NEVER use [1], [2], [3] or any citation markers - sources are shown separately.';
        const defaultFastModeTr = 'Bağlam bilgilerine dayanarak yaklaşık {maxLength} karakter uzunluğunda kapsamlı bir yanıt yaz. Kaynak referansı olmadan doğal paragraflar yaz. ASLA [1], [2], [3] gibi kaynak işaretleri KULLANMA - kaynaklar ayrıca gösterilecek.';

        let fastModeTemplate = responseLanguage === 'en'
          ? (settingsMap.get('ragSettings.fastModeInstructionEn') || defaultFastModeEn)
          : (settingsMap.get('ragSettings.fastModeInstructionTr') || defaultFastModeTr);

        // Replace {maxLength} placeholder with actual value from settings
        const fastModeInstruction = `\n\n${fastModeTemplate.replace(/{maxLength}/g, String(fastModeMaxLength))}`;
        console.log(`⚡ FAST MODE: Using maxLength=${fastModeMaxLength} characters`);

        userPrompt = `${contextLabel}:\n${enhancedContext}${followUpInstruction}\n\n${questionLabel}: ${message}${fastModeInstruction}`;
      } else {
        // Normal mode with natural language summary instructions - loaded from settings
        // Supports {sourceCount} and {maxLength} placeholders for dynamic values
        const defaultSummaryEn =
          `RESPONSE INSTRUCTIONS:\n` +
          ` Write a comprehensive natural language summary that synthesizes ALL {sourceCount} sources provided above\n` +
          ` DO NOT use citation markers like [1], [2], [3] - write as a cohesive narrative\n` +
          ` Aim for approximately {maxLength} characters (adjust as needed for completeness)\n` +
          ` Write ONLY natural paragraphs like an expert explaining the topic\n` +
          ` Combine related information from multiple sources into unified insights\n` +
          ` NEVER add section headings or labels like "SUMMARY:" or "CONCLUSION:"\n` +
          `Provide a flowing, informative overview that addresses the question comprehensively.`;

        const defaultSummaryTr =
          `YANIT TALİMATLARI:\n` +
          ` Yukarıda verilen TÜM {sourceCount} kaynağı sentezleyen kapsamlı bir doğal dil özeti yaz\n` +
          ` [1], [2], [3] gibi kaynak işaretleri KULLANMA - tutarlı bir anlatım olarak yaz\n` +
          ` Yaklaşık {maxLength} karakter hedefle (bütünlük için gerekirse ayarla)\n` +
          ` SADECE doğal paragraflar yaz, bir uzman konuyu anlatıyormuş gibi\n` +
          ` Birden fazla kaynaktan ilgili bilgileri birleşik içgörüler halinde birleştir\n` +
          ` ASLA "ÖZET:" veya "SONUÇ:" gibi bölüm başlıkları ekleme\n` +
          `Soruyu kapsamlı bir şekilde ele alan akıcı, bilgilendirici bir genel bakış sun.`;

        // Get max summary length from settings (used in citation excerpt generation)
        const maxSummaryLength = parseInt(
          settingsMap.get('ragSettings.summaryMaxLength') || '800'
        );

        // Get instruction from settings or use default, then replace placeholders
        let summaryTemplate = responseLanguage === 'en'
          ? (settingsMap.get('ragSettings.citationInstructionEn') || defaultSummaryEn)
          : (settingsMap.get('ragSettings.citationInstructionTr') || defaultSummaryTr);

        const summaryInstruction = `\n\n${summaryTemplate
          .replace(/{sourceCount}/g, String(initialDisplayCount))
          .replace(/{maxLength}/g, String(maxSummaryLength))}`;

        userPrompt = `${contextLabel}:\n${enhancedContext}\n\n${questionLabel}: ${message}${summaryInstruction}`;
      }
      console.log(` Best similarity score: ${(bestScore * 100).toFixed(1)}% (results sorted by relevance)`);
      console.log(`️ Sending temperature to LLM Manager: ${options.temperature} (type: ${typeof options.temperature})`);
      console.log(` Context length: ${enhancedContext.length}, sources: ${initialDisplayCount}`);
      console.log(` System prompt length: ${systemPrompt?.length || 0} chars`);
      console.log(` Response language: ${responseLanguage}`);

      // Extract provider from active model
      const providerFromModel = this.extractProviderFromModel(activeModel);
      console.log(` Active Chat Model: ${activeModel} (provider: ${providerFromModel})`);

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

      // Clean response content - remove section headings that LLM might add despite instructions
      response.content = this.stripSectionHeadings(response.content);

      // Strip citation markers when disableCitationText is enabled (sources shown separately)
      if (disableCitationText) {
        response.content = this.stripCitationMarkers(response.content);
        console.log(' Citation markers stripped from response (disableCitationText=true)');
      }

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
        console.log(`️ Fallback was used - active model ${providerFromModel} was not available`);
        await this.logActivity(userId, 'model_fallback', {
          activeModel: activeModel,
          actualProvider: response.provider,
          fallbackUsed: true
        });
      }

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

      // ⚡ FAST MODE: Simple source formatting without LLM summaries
      if (citationsDisabled) {
        // Format sources quickly without LLM-generated summaries
        const fastModeSources = searchResults.slice(0, initialDisplayCount || 5).map((r, idx) => {
          // Clean raw metadata content
          const rawContent = r.excerpt || r.content || '';
          const cleanedContent = this.cleanRawMetadataContent(rawContent, r.metadata);
          const content = this.truncateExcerpt(cleanedContent, 200);

          // Extract metadata for display
          let metadataInfo = '';
          if (r.metadata) {
            const relevantFields = ['tarih', 'kurum', 'makam', 'konu', 'kategori', 'yil']
              .filter(f => r.metadata[f])
              .map(f => r.metadata[f])
              .slice(0, 2);
            if (relevantFields.length > 0) {
              metadataInfo = ` (${relevantFields.join(' - ')})`;
            }
          }

          return {
            title: (r.title || `Kaynak ${idx + 1}`) + metadataInfo,
            content: content || `Bu kaynak "${r.title}" başlıklı bir belgedir.`,
            excerpt: content,
            score: r.score || (r.similarity_score * 100) || 0,
            sourceTable: r.source_table || r.table_name,
            sourceType: r.source_type || r.type,
            metadata: r.metadata
          };
        });

        console.log(`⚡ FAST MODE: Returning ${fastModeSources.length} sources (no LLM summaries)`);

        return {
          response: response.content,
          sources: fastModeSources, // ⚡ Now returns formatted sources
          relatedTopics: [],
          followUpQuestions: [],
          conversationId: convId,
          provider: response.provider,
          model: response.model || response.provider,
          providerDisplayName: getProviderDisplayName(response.provider || '', options.language || 'tr'),
          language: options.language || 'tr',
          fallbackUsed: response.fallbackUsed || false,
          originalModel: activeModel,
          actualProvider: response.provider,
          fastMode: true // Flag for frontend
        };
      }

      // 6. Format sources for frontend with natural language summaries (NORMAL MODE)
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

      // Log sources content for debugging
      console.log(` Returning ${formattedSources.length} sources to frontend`);
      formattedSources.forEach((source, idx) => {
        console.log(`  Source ${idx + 1}: title="${source.title?.substring(0, 30)}...", content length=${source.content?.length || 0}, excerpt length=${source.excerpt?.length || 0}`);
      });

      // 8. Generate contextual follow-up questions (async, don't block response)
      let followUpQuestions: string[] = [];
      try {
        followUpQuestions = await this.generateContextualFollowUps(
          message,
          response.content,
          formattedSources,
          options.language || 'tr'
        );
      } catch (followUpError) {
        console.error('[FOLLOW-UP] Failed to generate follow-up questions:', followUpError);
        // Continue without follow-up questions
      }

      return {
        response: response.content,
        sources: formattedSources,
        relatedTopics: relatedTopics,
        followUpQuestions: followUpQuestions,
        conversationId: convId,
        provider: response.provider,
        model: response.model || response.provider,
        providerDisplayName: getProviderDisplayName(response.provider || '', options.language || 'tr'),
        language: options.language || 'tr',
        fallbackUsed: response.fallbackUsed || false,
        originalModel: activeModel,
        actualProvider: response.provider,
        fastMode: false
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
      context += ' YÜSEK EŞLEŞME SONUÇLARI:\n';
      highScoreSources.forEach((result, idx) => {
        context += this.formatSourceForContext(result, idx + 1);
      });
      context += '\n';
    }

    // Add medium scoring sources
    if (mediumScoreSources.length > 0) {
      context += ' ORTA EŞLEŞME SONUÇLARI:\n';
      mediumScoreSources.forEach((result, idx) => {
        context += this.formatSourceForContext(result, idx + highScoreSources.length + 1);
      });
      context += '\n';
    }

    // Add low scoring sources at the end (only if few results)
    if (lowScoreSources.length > 0 && sortedResults.length < 10) {
      context += ' DİĞER İLGİLİ BİLGİLER:\n';
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
    // Clean raw metadata content (handles crawler records with listing_id/url format)
    const rawContent = result.excerpt || result.content || '';
    const cleanedContent = this.cleanRawMetadataContent(rawContent, result.metadata);
    const excerpt = this.truncateExcerpt(cleanedContent, 400);

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
    // CRITICAL: Check OpenRouter first (before openai/gpt check)
    // OpenRouter models: "openrouter/openai/gpt-4o-mini"
    if (model.includes('openrouter')) return 'openrouter';
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
   * Fix spacing issues in metadata content
   * Adds spaces between concatenated metadata fields like "TARİH:2012SAYI:123" -> "TARİH: 2012 SAYI: 123"
   */
  private fixMetadataSpacing(text: string): string {
    if (!text) return '';

    return text
      // Add space after metadata labels (TARİH:value -> TARİH: value)
      .replace(/([A-ZÇĞİÖŞÜa-zçğıöşü]+):(\S)/g, '$1: $2')
      // Add space before uppercase metadata labels (valueSAYI: -> value SAYI:)
      .replace(/([a-zçğıöşü0-9])([A-ZÇĞİÖŞÜ]{2,}:)/g, '$1 $2')
      // Add space before "hk." (konuhk. -> konu hk.)
      .replace(/([a-zçğıöşü])hk\./gi, '$1 hk.')
      // Add space between date and next field (13/09/2012SAYI -> 13/09/2012 SAYI)
      .replace(/(\d{2}\/\d{2}\/\d{4})([A-ZÇĞİÖŞÜ])/g, '$1 $2')
      // Add space between number and uppercase (120.01SAYI -> 120.01 SAYI)
      .replace(/(\d+\.\d+)([A-ZÇĞİÖŞÜ])/g, '$1 $2')
      // Clean multiple spaces
      .replace(/\s{2,}/g, ' ')
      .trim();
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
   * Detect and clean raw crawler metadata content
   * Some records contain "listing_id: X\nurl: Y\ntitle: Z" instead of actual description
   * This extracts usable content from such raw metadata
   */
  private cleanRawMetadataContent(content: string, metadata?: Record<string, unknown>): string {
    if (!content) return '';

    // Detect raw metadata format patterns:
    // 1. Real estate: listing_id:, url:
    // 2. Court records: row_id:, daire:, esasno:, kararno:
    // 3. Tax documents: sayi:, tarih:, konu:
    const isRawMetadata = content.match(/^listing_id:\s*\d+/i) ||
                          content.match(/^url:\s*https?:\/\//i) ||
                          content.match(/^row_id:\s*\d+/i) ||
                          content.match(/^daire:\s*/i) ||
                          content.match(/^esasno:\s*/i) ||
                          content.match(/^kararno:\s*/i) ||
                          content.match(/^sayi:\s*/i);

    if (!isRawMetadata) {
      return content; // Normal content, return as-is
    }

    // Try to extract actual content from known content fields
    // Priority: icerik > metin > ozet > karar_ozeti > aciklama
    const contentFieldPatterns = [
      /(?:icerik|içerik):\s*(.+?)(?=\n[a-z_]+:|$)/is,
      /metin:\s*(.+?)(?=\n[a-z_]+:|$)/is,
      /ozet:\s*(.+?)(?=\n[a-z_]+:|$)/is,
      /karar_ozeti:\s*(.+?)(?=\n[a-z_]+:|$)/is,
      /aciklama:\s*(.+?)(?=\n[a-z_]+:|$)/is,
      /konu:\s*(.+?)(?=\n[a-z_]+:|$)/is
    ];

    for (const pattern of contentFieldPatterns) {
      const match = content.match(pattern);
      if (match && match[1] && match[1].trim().length > 30) {
        return match[1].trim();
      }
    }

    // Try to extract title from raw metadata content
    const titleMatch = content.match(/title:\s*(.+?)(?:\n|$)/i);
    if (titleMatch && titleMatch[1]) {
      const extractedTitle = titleMatch[1].trim();
      // If we have metadata.title, prefer it (usually cleaner)
      if (metadata?.title && typeof metadata.title === 'string') {
        return metadata.title;
      }
      return extractedTitle;
    }

    // Fall back to metadata.title if available
    if (metadata?.title && typeof metadata.title === 'string') {
      return metadata.title;
    }

    // Last resort: clean up the raw content by removing all metadata field patterns
    return content
      // Real estate patterns
      .replace(/listing_id:\s*\d+\s*/gi, '')
      .replace(/url:\s*https?:\/\/[^\s\n]+\s*/gi, '')
      .replace(/title:\s*/gi, '')
      // Court record patterns (Danıştay, etc.)
      .replace(/row_id:\s*\d+\s*/gi, '')
      .replace(/daire:\s*[^\n]+\s*/gi, '')
      .replace(/esasno:\s*[^\n]+\s*/gi, '')
      .replace(/kararno:\s*[^\n]+\s*/gi, '')
      .replace(/tarih:\s*[\d\-\/]+\s*/gi, '')
      // Tax document patterns
      .replace(/sayi:\s*[^\n]+\s*/gi, '')
      .replace(/kurum:\s*[^\n]+\s*/gi, '')
      .replace(/makam:\s*[^\n]+\s*/gi, '')
      .replace(/kategori:\s*[^\n]+\s*/gi, '')
      .replace(/yil:\s*\d+\s*/gi, '')
      .trim();
  }

  /**
   * Convert ALL CAPS text to proper sentence case
   * - First letter uppercase, rest lowercase
   * - Capitalize after periods, question marks, exclamation marks
   * - Preserve proper nouns that might be intentionally capitalized (skip if mixed case)
   */
  private toSentenceCase(text: string): string {
    if (!text) return '';

    // Only transform if text is mostly UPPERCASE (more than 70% uppercase letters)
    const letters = text.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');
    const upperCount = (text.match(/[A-ZÇĞİÖŞÜ]/g) || []).length;
    const isAllCaps = letters.length > 0 && (upperCount / letters.length) > 0.7;

    if (!isAllCaps) return text; // Already mixed case, don't transform

    // Convert to lowercase first
    let result = text.toLowerCase();

    // Capitalize first letter
    result = result.charAt(0).toUpperCase() + result.slice(1);

    // Capitalize after sentence-ending punctuation (. ! ?)
    result = result.replace(/([.!?])\s+([a-zçğıöşü])/g, (match, punct, letter) => {
      return punct + ' ' + letter.toUpperCase();
    });

    // Capitalize Turkish specific: after line breaks
    result = result.replace(/\n([a-zçğıöşü])/g, (match, letter) => {
      return '\n' + letter.toUpperCase();
    });

    return result;
  }

  /**
   * Clean title specifically for suggestion questions
   * - Removes PDF names, file extensions, technical metadata
   * - Fixes spaced-out text like "D A N I Ş T A Y" -> "Danıştay"
   * - Removes ISSN/ISBN numbers and other academic metadata
   */
  private cleanTitleForSuggestions(title: string): string {
    if (!title) return '';

    let cleaned = title
      // Fix spaced-out letters (D A N I Ş T A Y -> DANIŞTAY)
      .replace(/([A-ZÇĞİÖŞÜ])\s+(?=[A-ZÇĞİÖŞÜ]\s*)/g, '$1')
      // Remove PDF/file extensions
      .replace(/\.(pdf|docx?|xlsx?|pptx?|txt)\s*/gi, ' ')
      // Remove ISSN/ISBN patterns
      .replace(/\b(e-)?issn\s*:?\s*[\d-]+/gi, '')
      .replace(/\bissn\s*[\d-]+/gi, '')
      .replace(/\bisbn\s*[\d-]+/gi, '')
      // Remove common file name patterns
      .replace(/\b\d+issn\b/gi, '')
      .replace(/Malicozum\d+/gi, 'Mali Çözüm')
      // Remove page/part indicators
      .replace(/\s*[-–]\s*(page|sayfa|bölüm|part)\s*\d+/gi, '')
      .replace(/\s*\((page|sayfa|bölüm|part)\s*\d+[^)]*\)/gi, '')
      // Remove ID patterns
      .replace(/\s*[-–]\s*ID:\s*\d+/gi, '')
      .replace(/\s*\[ID:\s*\d+\]/gi, '')
      // Remove chunk/part indicators
      .replace(/\s*\(Part\s*\d+\/\d+\)/gi, '')
      .replace(/\s*\(Chunk\s*\d+\)/gi, '')
      // Remove common table prefixes
      .replace(/^(csv_|tbl_|unified_)/gi, '')
      // Clean up volume/issue patterns
      .replace(/ci̇lt\/volume:\s*\d+/gi, '')
      .replace(/volume:\s*\d+/gi, '')
      // Remove parenthetical metadata like (DİYALOGDERGİSİ)
      .replace(/\([A-ZÇĞİÖŞÜa-zçğıöşü]+DERGİSİ\)/gi, '')
      .replace(/\(YAKLASIM[^)]*\)/gi, '')
      // Fix concatenated words (T.C.DANIŞTAY -> T.C. Danıştay)
      .replace(/T\.C\.(DANIŞTAY|DANİŞTAY)/gi, 'Danıştay')
      .replace(/(DANIŞTAY|DANİŞTAY)(DOKUZUNCU|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ|SEKİZİNCİ|ÜÇÜNCÜ|İKİNCİ|BİRİNCİ)/gi, 'Danıştay $2')
      .replace(/DAİRE/gi, 'Dairesi')
      // Remove "Esas No:" patterns
      .replace(/Esas No:\s*/gi, '')
      .replace(/Karar No:\s*/gi, '')
      // Remove "Sorular ve cevapları ile" generic patterns
      .replace(/Sorular ve cevapları ile\s*/gi, '')
      // Clean up multiple spaces and trim
      .replace(/\s+/g, ' ')
      .trim();

    // Apply sentence case after cleaning
    cleaned = this.toSentenceCase(cleaned);

    // Final validation: if title is too short or looks like metadata, return empty
    if (cleaned.length < 15 || /^(Dairesi|Danıştay|Mali çözüm|Halk eğitim)$/i.test(cleaned)) {
      return '';
    }

    return cleaned;
  }

  /**
   * Strip section headings from LLM response
   * Removes headings like "KISA GİRİŞ:", "ANA BİLGİ:", "UYGULAMA:", "KAYNAKÇA:", etc.
   */
  private stripSectionHeadings(text: string): string {
    if (!text) return '';

    // Turkish headings (most common)
    const turkishHeadings = [
      /\*\*KISA GİRİŞ:\*\*/gi,
      /\*\*ANA BİLGİ:\*\*/gi,
      /\*\*UYGULAMA:\*\*/gi,
      /\*\*KAYNAKÇA:\*\*/gi,
      /\*\*GİRİŞ:\*\*/gi,
      /\*\*SONUÇ:\*\*/gi,
      /\*\*DETAYLAR:\*\*/gi,
      /KISA GİRİŞ:/gi,
      /ANA BİLGİ:/gi,
      /UYGULAMA:/gi,
      /KAYNAKÇA:/gi,
      /GİRİŞ:/gi,
      /SONUÇ:/gi,
      /DETAYLAR:/gi
    ];

    // English headings
    const englishHeadings = [
      /\*\*INTRODUCTION:\*\*/gi,
      /\*\*MAIN POINTS:\*\*/gi,
      /\*\*APPLICATION:\*\*/gi,
      /\*\*REFERENCES:\*\*/gi,
      /\*\*SOURCES:\*\*/gi,
      /\*\*CONCLUSION:\*\*/gi,
      /INTRODUCTION:/gi,
      /MAIN POINTS:/gi,
      /APPLICATION:/gi,
      /REFERENCES:/gi,
      /SOURCES:/gi,
      /CONCLUSION:/gi
    ];

    let cleanedText = text;

    // Remove Turkish headings
    turkishHeadings.forEach(heading => {
      cleanedText = cleanedText.replace(heading, '');
    });

    // Remove English headings
    englishHeadings.forEach(heading => {
      cleanedText = cleanedText.replace(heading, '');
    });

    // Clean up excessive whitespace
    cleanedText = cleanedText
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();

    return cleanedText;
  }

  /**
   * Strip citation markers from LLM response
   * Removes inline citations like [1], [2], [3] that LLM might add despite instructions
   * Called when disableCitationText is enabled (sources shown separately, no need for inline refs)
   */
  private stripCitationMarkers(text: string): string {
    if (!text) return '';

    return text
      // Remove simple citation markers: [1], [2], [3], etc.
      .replace(/\[\d+\]/g, '')
      // Remove citation ranges: [1-3], [1,2,3], [1, 2], etc.
      .replace(/\[\d+[-,\s]+\d+(?:[-,\s]+\d+)*\]/g, '')
      // Remove superscript-style citations: ¹, ², ³, etc.
      .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, '')
      // Remove parenthetical citations: (1), (2), (3)
      .replace(/\(\d+\)/g, '')
      // Remove "Kaynak X" references in Turkish
      .replace(/\bKaynak\s*\d+\b/gi, '')
      .replace(/\bKaynak\s*\[\d+\]\b/gi, '')
      // Remove "Source X" references in English
      .replace(/\bSource\s*\d+\b/gi, '')
      .replace(/\bSource\s*\[\d+\]\b/gi, '')
      // Clean up any resulting double spaces
      .replace(/\s{2,}/g, ' ')
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

    // Get excerpt and summary lengths from settings (configurable)
    const excerptMaxLength = parseInt(await settingsService.getSetting('ragSettings.excerptMaxLength') || '300');
    const summaryMaxLength = parseInt(await settingsService.getSetting('ragSettings.summaryMaxLength') || '500');

    // Get maxQuestionLength from chatbot settings for question generation
    const chatbotSettingsRaw = await settingsService.getSetting('chatbot');
    let maxQuestionLength = 500; // Default
    try {
      const chatbotSettings = chatbotSettingsRaw ? JSON.parse(chatbotSettingsRaw) : {};
      maxQuestionLength = chatbotSettings.maxQuestionLength || 500;
    } catch (e) {
      // Use default if parsing fails
    }

    console.log(` Formatting ${searchResults.length} sources (LLM: ${enableLLMGeneration ? 'ON' : 'OFF'}, maxQ: ${maxQuestionLength})`);

    if (enableParallelLLM && searchResults.length > 1) {
      // NOTE: Parallel mode is now deprecated in favor of batch LLM processing
      // Batch processing is much faster (1 call vs N calls) and simpler
      // Redirecting to sequential path which uses batch LLM optimization
      console.log('️ Parallel LLM mode is deprecated - using optimized batch processing instead');
    }

    // Always use batch processing path (much faster than parallel individual calls)
    {
      // Optimized batch LLM processing - single API call for all sources
      console.log(' Using optimized batch processing for all sources');

      // STEP 1: Prepare all results with metadata and categories
      const preparedResults = searchResults.map((r, idx) => {
        const category = this.categorizeSource(r);
        // Score is already 0-100 from semantic search service, use it directly
        // Only multiply by 100 if similarity_score is in 0-1 range (< 1)
        const score = r.score || (r.similarity_score && r.similarity_score < 1 ? Math.round(r.similarity_score * 100) : r.similarity_score) || 50;

        // Build proper citation with schema-aware field labels
        let citation = `[Source ${idx + 1}]`;
        if (r.metadata) {
          // Field label mappings for better readability (Turkish display names)
          const fieldLabels: Record<string, string> = {
            'tarih': 'Tarih',
            'kurum': 'Kurum',
            'makam': 'Makam',
            'konu': 'Konu',
            'kategori': 'Kategori',
            'yil': 'Yıl',
            'sayi': 'Sayı',
            'esas_no': 'Esas No',
            'karar_no': 'Karar No',
            'karar_tarihi': 'Karar Tarihi',
            'daire': 'Daire',
            'yazar': 'Yazar',
            'baslik': 'Başlık',
            'ozet': 'Özet'
          };

          // Priority fields for citation (most informative first)
          const priorityFields = ['kurum', 'makam', 'tarih', 'konu', 'kategori', 'yil', 'sayi'];
          const parts: string[] = [];

          for (const key of priorityFields) {
            const value = r.metadata[key];
            if (value && typeof value === 'string' && value.trim()) {
              const label = fieldLabels[key] || key;
              parts.push(`${label}: ${value}`);
              if (parts.length >= 3) break; // Max 3 fields for readability
            }
          }

          if (parts.length > 0) {
            citation = parts.join(' | ');
          }
        }

        // Clean HTML from title and excerpt, convert ALL CAPS to sentence case
        const cleanTitle = this.toSentenceCase(this.stripHtml(r.title?.replace(/ \(Part \d+\/\d+\)/g, '') || citation));
        // Clean raw metadata content (handles crawler records with listing_id/url format)
        const rawContent = r.excerpt || r.content || '';
        const cleanedContent = this.cleanRawMetadataContent(rawContent, r.metadata);
        const cleanExcerpt = this.toSentenceCase(this.stripHtml(cleanedContent));

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
          console.time(' Batch LLM processing for ALL results');
          console.log(` Processing ${preparedResults.length} sources in SINGLE batch LLM call...`);

          // Single batch call instead of N individual calls
          batchLLMResults = await this.generateBatchContentAndQuestions(
            preparedResults.map(p => ({
              title: p.cleanTitle,
              excerpt: p.cleanExcerpt,
              category: p.category
            })),
            maxQuestionLength
          );

          console.log(` Batch LLM completed: ${batchLLMResults.length} results generated`);
          console.timeEnd(' Batch LLM processing for ALL results');
        } catch (error) {
          console.error(' Batch LLM processing FAILED:', error);
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
        let generatedQuestion = this.generateDynamicQuestion(prep.cleanTitle, prep.cleanExcerpt, prep.category, maxQuestionLength, undefined, r.metadata);

        if (enableLLMGeneration && batchLLMResults[i]) {
          processedContent = batchLLMResults[i].processedContent || prep.cleanExcerpt;
          generatedQuestion = batchLLMResults[i].generatedQuestion || generatedQuestion;
        }

        // Create natural language title and excerpt from LLM-processed content (if available)
        // Uses processedContent which is either LLM-generated or falls back to cleanExcerpt
        const displayContent = this.fixMetadataSpacing(processedContent || prep.cleanExcerpt);
        const naturalTitle = this.truncateExcerpt(displayContent, Math.min(excerptMaxLength, 120));
        const naturalExcerpt = this.truncateExcerpt(displayContent, excerptMaxLength);
        const naturalContent = this.truncateExcerpt(displayContent, summaryMaxLength);

        formattedResults.push({
          id: r.id,
          title: naturalTitle, // Natural language, not metadata title
          excerpt: naturalExcerpt, // Configurable length from settings
          content: naturalContent, // Summary with configurable length
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

    console.log(` Formatted ${formattedResults.length} sources successfully`);
    return formattedResults;
  }

  /**
   * Default question patterns - can be overridden via RAG settings
   */
  private getDefaultQuestionPatterns(): QuestionPattern[] {
    return [
      {
        name: 'emlak',
        keywords: 'satılık|kiralık|emlak|daire|konut|arsa|tarla|bahçe|villa|müstakil',
        titleKeywords: 'satılık|kiralık|arsa|tarla|bahçe|daire|konut',
        combinations: [
          { with: 'fiyat,metrekare', question: '{topic} için m² fiyatı ve toplam maliyet ne kadardır?' },
          { with: 'ozellik', question: '{topic} özellikleri ve imkanları nelerdir?' },
          { with: 'konum', question: '{topic} lokasyonu ve çevre özellikleri nasıldır?' },
          { with: 'fiyat', question: '{topic} fiyatı ve ödeme seçenekleri nelerdir?' },
          { with: 'metrekare', question: '{topic} büyüklüğü ve alan kullanımı nasıldır?' }
        ],
        defaultQuestion: '{topic} özellikleri ve fiyat bilgisi nedir?',
        priority: 1
      },
      {
        name: 'saglik',
        keywords: 'aşı|aşılama|bağışıklık|sağlık|hastane|tedavi|hastalık',
        titleKeywords: 'aşı|sağlık|hastane',
        combinations: [
          { with: 'basvuru', question: '{topic} için başvuru süreci ve gerekli belgeler nelerdir?' },
          { with: 'sure', question: '{topic} ne zaman ve hangi aralıklarla yapılmalı?' }
        ],
        defaultQuestion: '{topic} kimlere uygulanmalı ve nelere dikkat edilmeli?',
        priority: 2
      },
      {
        name: 'vergi',
        keywords: 'stopaj|tevkifat|kdv|katma değer|gelir vergisi|kurumlar vergisi|beyanname|muafiyet|istisna',
        combinations: [
          { with: 'oran', question: '{topic} kapsamında vergi oranları nedir?' },
          { with: 'sure', question: '{topic} için beyanname süreleri nedir?' },
          { with: 'muafiyet', question: '{topic} kapsamında muafiyetten kimler yararlanabilir?' }
        ],
        defaultQuestion: '{topic} ile ilgili vergi uygulaması nasıldır?',
        priority: 3
      },
      {
        name: 'genel',
        keywords: 'oran|yüzde|%|süre|tarih|başvuru|kayıt|müracaat',
        combinations: [
          { with: 'oran', question: '{topic} için geçerli oranlar ve şartlar nelerdir?' },
          { with: 'basvuru', question: '{topic} için başvuru nasıl yapılır?' },
          { with: 'sure', question: '{topic} için süreler ve tarihler nelerdir?' }
        ],
        defaultQuestion: '{topic} konusunda önemli noktalar nelerdir?',
        priority: 10
      }
    ];
  }

  /**
   * Secondary keyword patterns for combination matching
   */
  private getSecondaryPatterns(): Record<string, string> {
    return {
      fiyat: 'fiyat|tl|₺|lira|m²|metrekare',
      metrekare: 'm²|metrekare|\\d+\\s*m2',
      konum: 'ilçe|mahalle|cadde|sokak|bölge|mevki|lokasyon',
      ozellik: 'oda|salon|banyo|balkon|otopark|asansör|site|güvenlik',
      oran: 'oran|yüzde|%',
      sure: 'süre|tarih|son gün',
      basvuru: 'başvuru|kayıt|müracaat',
      muafiyet: 'muafiyet|istisna'
    };
  }

  /**
   * Generate dynamic question based on title, excerpt, category and metadata
   * Uses schema metadata for meaningful questions when available
   * @param maxLength - Maximum question length from settings (default 500)
   * @param customPatterns - Optional custom patterns from settings
   * @param metadata - Source metadata from schema (tarih, kurum, makam, konu, etc.)
   */
  private generateDynamicQuestion(
    title: string,
    excerpt: string,
    category: string,
    maxLength: number = 500,
    customPatterns?: QuestionPattern[],
    metadata?: Record<string, unknown>
  ): string {
    // Detect language
    const isTurkish = /[çğıöşüÇĞİÖŞÜ]/.test(excerpt) ||
      /(\b(ve|ile|için|hakkında|nasıl|neden|ne|hangi)\b)/i.test(excerpt);

    // If we have meaningful metadata, use it for better questions
    if (metadata && isTurkish) {
      const kurum = metadata.kurum as string;
      const makam = metadata.makam as string;
      const konu = metadata.konu as string;
      const tarih = metadata.tarih as string;
      const yil = metadata.yil as string;
      const baslik = metadata.baslik as string || title;

      // Generate schema-aware question based on available fields
      if (konu) {
        return `${konu} konusunda detaylı bilgi ver.`;
      }
      if (kurum && makam) {
        return `${kurum} ${makam} kararı hakkında bilgi ver.`;
      }
      if (kurum) {
        return `${kurum} görüşü hakkında detaylı bilgi ver.`;
      }
      if (baslik && baslik !== title) {
        return `"${baslik.substring(0, 60)}${baslik.length > 60 ? '...' : ''}" hakkında detaylı bilgi ver.`;
      }
    }

    // Fallback: Extract topic from title
    const maxTopicLength = Math.min(45, Math.max(20, maxLength - 60));

    const extractTopic = (text: string): string => {
      let topic = text
        .replace(/^(prof\.?\s*dr\.?|dr\.?|doç\.?|yrd\.?\s*doç\.?)\s*/gi, '')
        .replace(/\s*[-–:]\s*.{0,20}$/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (topic.length > maxTopicLength) {
        const truncated = topic.substring(0, maxTopicLength);
        const lastSpace = truncated.lastIndexOf(' ');
        topic = lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated;
      }

      return topic || 'bu konu';
    };

    const topic = extractTopic(title);
    let smartQuestion = '';

    if (isTurkish) {
      // Get patterns - use custom if provided, otherwise defaults
      const patterns = customPatterns || this.getDefaultQuestionPatterns();
      const secondaryPatterns = this.getSecondaryPatterns();
      const content = `${title} ${excerpt}`;

      // Sort patterns by priority (lower = higher priority)
      const sortedPatterns = [...patterns].sort((a, b) => (a.priority || 99) - (b.priority || 99));

      // Find matching pattern
      for (const pattern of sortedPatterns) {
        const mainRegex = new RegExp(pattern.keywords, 'i');
        const titleRegex = pattern.titleKeywords ? new RegExp(pattern.titleKeywords, 'i') : null;

        const matchesMain = mainRegex.test(excerpt);
        const matchesTitle = titleRegex ? titleRegex.test(title) : false;

        if (matchesMain || matchesTitle) {
          // Check combinations
          if (pattern.combinations) {
            for (const combo of pattern.combinations) {
              const comboKeywords = combo.with.split(',').map(k => k.trim());
              const allMatch = comboKeywords.every(keyword => {
                const secondaryRegex = secondaryPatterns[keyword];
                if (secondaryRegex) {
                  return new RegExp(secondaryRegex, 'i').test(excerpt);
                }
                return new RegExp(keyword, 'i').test(excerpt);
              });

              if (allMatch) {
                smartQuestion = combo.question.replace('{topic}', topic);
                break;
              }
            }
          }

          // If no combination matched, use default
          if (!smartQuestion && pattern.defaultQuestion) {
            smartQuestion = pattern.defaultQuestion.replace('{topic}', topic);
          }

          if (smartQuestion) break;
        }
      }

      // Fallback if no pattern matched
      if (!smartQuestion) {
        const defaultQuestions = [
          `${topic} konusunda önemli noktalar nelerdir?`,
          `${topic} ile ilgili temel bilgiler nedir?`,
          `${topic} kapsamında nelere dikkat edilmeli?`,
          `${topic} hakkında merak edilenler nelerdir?`
        ];
        smartQuestion = defaultQuestions[Math.floor(Math.random() * defaultQuestions.length)];
      }
    } else {
      // English with topic
      smartQuestion = `What are the key details about ${topic}?`;
    }

    // Final truncation to respect maxLength setting
    if (smartQuestion.length > maxLength) {
      const truncated = smartQuestion.substring(0, maxLength - 3);
      const lastSpace = truncated.lastIndexOf(' ');
      smartQuestion = (lastSpace > maxLength * 0.6 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }

    return smartQuestion;
  }


  /**
   * Generate contextual follow-up questions based on conversation context
   * These questions are SELF-CONTAINED and build on what was just discussed
   */
  async generateContextualFollowUps(
    userQuestion: string,
    aiResponse: string,
    sources: any[],
    language: string = 'tr'
  ): Promise<string[]> {
    try {
      console.log('[FOLLOW-UP] Generating contextual follow-up questions...');

      // 1. First try schema-based pattern matching
      const patternQuestions = await this.generatePatternBasedQuestions(userQuestion, sources);
      if (patternQuestions.length >= 2) {
        console.log(`[FOLLOW-UP] Using ${patternQuestions.length} pattern-based questions`);
        return patternQuestions.slice(0, 3);
      }

      // 2. Fallback to LLM generation if patterns don't match well
      // Extract topics from sources for context
      const sourceTopics = sources.slice(0, 3)
        .map(s => s.title || '')
        .filter(t => t.length > 0)
        .join(', ');

      // Truncate AI response to key points (first 600 chars)
      const responseSummary = aiResponse.substring(0, 600).replace(/\n+/g, ' ').trim();

      const llmManager = LLMManager.getInstance();

      const prompt = language === 'en'
        ? `Based on this Q&A, generate 3 follow-up questions the user might ask next.

USER'S QUESTION: ${userQuestion}

AI'S RESPONSE (summary): ${responseSummary}

RELATED TOPICS: ${sourceTopics}

RULES:
1. Questions must be SELF-CONTAINED - include the specific topic so they make sense without context
2. Questions should DIG DEEPER into what was discussed - not ask about unrelated topics
3. Questions should be SPECIFIC and ACTIONABLE
4. NO vague questions like "tell me more" or "what else?"
5. Each question should explore a DIFFERENT aspect of the topic

Return ONLY a JSON array with exactly 3 questions. Example format:
["What are the specific deadlines for corporate tax filings?", "How does the 50% rate apply to foreign income?", "What documents are required for the tax exemption application?"]`
        : `Bu soru-cevap etkileşimine göre kullanıcının sorması muhtemel 3 takip sorusu üret.

KULLANICININ SORUSU: ${userQuestion}

YAPAY ZEKANIN YANITI (özet): ${responseSummary}

İLGİLİ KONULAR: ${sourceTopics}

KURALLAR:
1. Sorular KENDİ BAŞINA ANLAMLI olmalı - konuyu içermeli, bağlam olmadan da anlaşılmalı
2. Sorular konuşulan konuyu DERİNLEŞTİRMELİ - alakasız konulara geçmemeli
3. Sorular SPESIFIK ve UYGULANABİLİR olmalı
4. "Daha fazla bilgi verir misiniz?" gibi MUĞLAK sorular YASAK
5. Her soru konunun FARKLI bir yönünü keşfetmeli

SADECE 3 soruluk bir JSON dizisi döndür. Örnek format:
["Kurumlar vergisi beyanname süreleri nelerdir?", "Yurt dışı gelirler için %50 oranı nasıl uygulanır?", "Vergi muafiyeti başvurusu için hangi belgeler gerekli?"]`;

      const response = await llmManager.generateChatResponse(prompt, {
        temperature: 0.7,
        maxTokens: 500,
        systemPrompt: 'You are a helpful assistant that generates follow-up questions. Return ONLY valid JSON array, no other text.'
      });

      // Parse JSON from response
      try {
        // Try to extract JSON array from response
        const content = response.content || '';
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const questions = JSON.parse(jsonMatch[0]);
          if (Array.isArray(questions) && questions.length > 0) {
            console.log(`[FOLLOW-UP] Generated ${questions.length} contextual questions`);
            return questions.slice(0, 4); // Max 4 questions
          }
        }
      } catch (parseError) {
        console.error('[FOLLOW-UP] Failed to parse JSON:', parseError);
      }

      // Fallback: Generate simple contextual questions if LLM fails
      console.log('[FOLLOW-UP] Using fallback question generation');
      return this.generateFallbackFollowUps(userQuestion, sources, language);

    } catch (error) {
      console.error('[FOLLOW-UP] Error generating follow-up questions:', error);
      return [];
    }
  }

  /**
   * Generate questions based on schema's question patterns
   * Matches source content against pattern keywords and generates relevant questions
   */
  private async generatePatternBasedQuestions(userQuestion: string, sources: any[]): Promise<string[]> {
    try {
      const config = await dataSchemaService.loadConfig();
      const activeSchema = config.schemas.find(s => s.id === config.activeSchemaId);

      if (!activeSchema?.questionPatterns || activeSchema.questionPatterns.length === 0) {
        return [];
      }

      const questions: string[] = [];
      const combinedText = [
        userQuestion,
        ...sources.slice(0, 3).map(s => (s.content || '') + ' ' + (s.title || ''))
      ].join(' ').toLowerCase();

      // Sort patterns by priority (higher first)
      const sortedPatterns = [...activeSchema.questionPatterns].sort((a, b) => (b.priority || 0) - (a.priority || 0));

      for (const pattern of sortedPatterns) {
        // Check if any pattern keyword matches the content
        const matchedKeyword = pattern.keywords?.find(kw => combinedText.includes(kw.toLowerCase()));

        if (matchedKeyword) {
          // Extract topic from user question for template
          const topic = userQuestion.replace(/\?$/, '').trim();

          // Check for combination matches (more specific questions)
          let questionAdded = false;
          if (pattern.combinations) {
            for (const combo of pattern.combinations) {
              if (combinedText.includes(combo.when.toLowerCase())) {
                const question = combo.question.replace('{topic}', topic);
                if (!questions.includes(question)) {
                  questions.push(question);
                  questionAdded = true;
                  break; // Only one question per pattern
                }
              }
            }
          }

          // If no combination matched, use default question
          if (!questionAdded && pattern.defaultQuestion) {
            const question = pattern.defaultQuestion.replace('{topic}', topic);
            if (!questions.includes(question)) {
              questions.push(question);
            }
          }

          // Stop after finding 3 questions
          if (questions.length >= 3) break;
        }
      }

      console.log(`[PATTERN] Generated ${questions.length} pattern-based questions from schema: ${activeSchema.name}`);
      return questions;

    } catch (error) {
      console.warn('[PATTERN] Failed to generate pattern-based questions:', error);
      return [];
    }
  }

  /**
   * Fallback follow-up question generation (non-LLM)
   */
  private generateFallbackFollowUps(userQuestion: string, sources: any[], language: string): string[] {
    const questions: string[] = [];

    // Extract main topic from user question (first 50 chars)
    const topic = userQuestion.substring(0, 50).replace(/\?$/, '').trim();

    if (language === 'tr') {
      if (topic.includes('vergi') || topic.includes('oran')) {
        questions.push(`${topic} için muafiyet şartları nelerdir?`);
        questions.push(`${topic} ile ilgili beyanname süreleri nedir?`);
      } else if (topic.includes('başvuru') || topic.includes('kayıt')) {
        questions.push(`${topic} için gerekli belgeler nelerdir?`);
        questions.push(`${topic} süreci ne kadar sürer?`);
      } else {
        questions.push(`${topic} hakkında yasal düzenlemeler nelerdir?`);
        questions.push(`${topic} için önemli tarihler nedir?`);
      }
    } else {
      questions.push(`What are the requirements for ${topic}?`);
      questions.push(`What are the deadlines related to ${topic}?`);
    }

    return questions.slice(0, 3);
  }


  /**
   * BATCH: Generate LLM-processed content and questions for multiple results at once
   * This is 10x faster than processing individually!
   */
  private async generateBatchContentAndQuestions(
    results: Array<{ title: string; excerpt: string; category: string }>,
    maxQuestionLength: number = 500
  ): Promise<Array<{ processedContent: string; generatedQuestion: string }>> {
    try {
      console.log(` Batch processing ${results.length} results with LLM...`);
      console.time('Batch LLM processing');

      // Get settings once for all results
      const maxSummaryLength = parseInt(
        await settingsService.getSetting('ragSettings.summaryMaxLength') || '800'
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
1. A natural explanation (max ${maxSummaryLength} chars) - INTERPRET, don't copy. Use **bold** for key terms.
2. A brief summary (max 15 words) - Very short summary of the main topic (NOT a question)

RESPOND IN THIS EXACT FORMAT:

ITEM 1:
CONTENT: [Your natural explanation]
SUMMARY: [Brief topic summary - NOT a question]

ITEM 2:
CONTENT: [Your natural explanation]
SUMMARY: [Brief topic summary - NOT a question]

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
1. Doğal açıklama (maks ${maxSummaryLength} karakter) - YORUMLA, kopyalama. Anahtar terimler için **kalın** kullan.
2. Kısa özet (maks 15 kelime) - Ana konunun çok kısa özeti (SORU FORMATINDA DEĞİL)

TAM OLARAK BU FORMATTA YANITLA:

KAYIT 1:
İÇERİK: [Doğal açıklaman]
ÖZET: [Kısa konu özeti - SORU DEĞİL]

KAYIT 2:
İÇERİK: [Doğal açıklaman]
ÖZET: [Kısa konu özeti - SORU DEĞİL]

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
        ? /ITEM \d+:[\s\S]*?CONTENT:\s*(.*?)[\s\S]*?SUMMARY:\s*(.*?)(?=ITEM \d+:|$)/gi
        : /KAYIT \d+:[\s\S]*?İÇERİK:\s*(.*?)[\s\S]*?ÖZET:\s*(.*?)(?=KAYIT \d+:|$)/gi;

      let match;
      while ((match = itemPattern.exec(response.content)) !== null) {
        parsed.push({
          processedContent: match[1].trim().replace(/^\*\*+|\*\*+$/g, '').substring(0, maxSummaryLength),
          generatedQuestion: match[2].trim().replace(/^\*\*+|\*\*+$/g, '')
        });
      }

      console.timeEnd('Batch LLM processing');
      console.log(` Batch processed ${parsed.length}/${results.length} results`);

      // Fallback for missing results
      while (parsed.length < results.length) {
        const idx = parsed.length;
        parsed.push({
          processedContent: cleanedResults[idx].excerpt.substring(0, maxSummaryLength),
          generatedQuestion: this.generateDynamicQuestion(
            cleanedResults[idx].title,
            cleanedResults[idx].excerpt,
            cleanedResults[idx].category,
            maxQuestionLength
          )
        });
      }

      return parsed;
    } catch (error) {
      console.error(' Batch LLM processing failed:', error);
      // Fallback: return original excerpts
      return results.map(r => ({
        processedContent: r.excerpt.substring(0, 500),
        generatedQuestion: this.generateDynamicQuestion(r.title, r.excerpt, r.category, maxQuestionLength)
      }));
    }
  }

  /**
   * Generate LLM-processed content and question from excerpt (LEGACY - use batch instead)
   */
  private async generateContentAndQuestion(title: string, excerpt: string, category: string): Promise<{ processedContent: string; generatedQuestion: string }> {
    try {
      console.log(` Attempting to generate question for: ${title.substring(0, 30)}...`);
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
        await settingsService.getSetting('ragSettings.summaryMaxLength') || '800'
      );

      // Get active system prompt from database
      const activeSystemPrompt = await this.getSystemPrompt();
      console.log(` Using active system prompt for source summary (length: ${activeSystemPrompt?.length || 0})`);

      // Get language setting from database
      const responseLanguage = await settingsService.getSetting('response_language') || 'tr';

      // Get conversation tone from settings (friendly, formal, professional, casual)
      const conversationTone = await settingsService.getSetting('llmSettings.conversationTone')
        || await settingsService.getSetting('conversationTone')
        || await settingsService.getSetting('prompts.conversationTone')
        || 'professional';
      console.log(` Using conversation tone: ${conversationTone}`);

      // Get temperature from settings (check multiple possible keys)
      let temperature = 0.3; // Default fallback
      const tempSetting = await settingsService.getSetting('llmSettings.temperature')
        || await settingsService.getSetting('temperature')
        || await settingsService.getSetting('content_generation_temperature');

      if (tempSetting) {
        const parsed = parseFloat(tempSetting);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
          temperature = parsed;
          console.log(`️  Using temperature from settings: ${temperature}`);
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
 DO NOT copy the original text
 DO NOT start with "The document says..." or "This content discusses..."
 DO NOT preserve the original structure
 REWRITE in natural language matching the tone above
 EXPLAIN as if talking to someone who needs to understand quickly
 USE MARKDOWN: **bold** for key terms, *italic* for emphasis, bullet points when appropriate

TASK:
Read the content below and create:

1. A NATURAL EXPLANATION (max ${maxSummaryLength} characters):
   - What is the main point? (be specific: rates, deadlines, requirements)
   - Who does it affect? (taxpayers, companies, specific groups)
   - How does it work? (procedure, calculation, conditions)
   - Write in the ${conversationTone} tone specified above

2. A BRIEF SUMMARY (max 15 words):
   - Very short summary of the main topic (NOT a question)
   - Use specific terms from content
   - Natural summary style, not interrogative

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

IMPROVED CONTENT:
[Your interpretation - completely rewritten in ${conversationTone} tone, NOT copied]

SUMMARY:
[Brief topic summary - NOT a question]

Title: ${title}
Content: ${cleanExcerpt}

REMEMBER: INTERPRET in ${conversationTone} tone, don't copy. Explain in YOUR OWN WORDS.
` : `
Sen vergi ve hukuk uzmanısın. Görevin içeriği YORUMLAMAK ve KENDI KELİMELERİNLE açıklamak.

ÜSLUBİN: ${toneInstruction}

KRİTİK KURALLAR:
 Orijinal metni KOPYALAMA
 "Bu belge şunu söylüyor..." diye BAŞLAMA
 Orijinal yapıyı KORUMA
 Yukarıdaki üsluba uygun doğal dilde YENİDEN YAZ
 Hızlıca anlaması gereken birine anlatır gibi AÇIKLA
 MARKDOWN KULLAN: **kalın** anahtar terimler için, *italik* vurgu için, uygun yerlerde madde işareti

GÖREV:
Aşağıdaki içeriği oku ve oluştur:

1. DOĞAL BİR AÇIKLAMA (maksimum ${maxSummaryLength} karakter):
   - Ana nokta ne? (spesifik ol: oranlar, süreler, gereksinimler)
   - Kimi etkiliyor? (mükellefler, şirketler, belirli gruplar)
   - Nasıl işliyor? (prosedür, hesaplama, koşullar)
   - Yukarıda belirtilen ${conversationTone} üslubunda yaz

2. KISA BİR ÖZET (maksimum 15 kelime):
   - Ana konunun çok kısa özeti (SORU FORMATINDA DEĞİL)
   - İçerikteki spesifik terimleri kullan
   - Doğal özet tarzı, soru tarzı değil

YANITI TAM OLARAK BU FORMATTA VER:

İYİLEŞTİRİLMİŞ İÇERİK:
[Senin yorumun - ${conversationTone} üslubunda tamamen yeniden yazılmış, KOPYALANMAMIŞ]

ÖZET:
[Kısa konu özeti - SORU DEĞİL]

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
          // Debug: Log LLM response for troubleshooting empty summaries
          console.log(` LLM Response for "${title.substring(0, 50)}...": ${response.content.substring(0, 200)}...`);

          // Parse the response based on language
          const contentMatch = response.content.match(
            responseLanguage === 'en'
              ? /IMPROVED CONTENT:\s*(.*?)(?=\nSUMMARY:|$)/s
              : /İYİLEŞTİRİLMİŞ İÇERİK:\s*(.*?)(?=\nÖZET:|$)/s
          );
          const questionMatch = response.content.match(
            responseLanguage === 'en'
              ? /SUMMARY:\s*(.*)/s
              : /ÖZET:\s*(.*)/s
          );

          // Debug: Log parsing results
          if (!contentMatch) {
            console.warn(`️ Failed to parse content for "${title.substring(0, 50)}..." - using fallback`);
          }
          if (!questionMatch) {
            console.warn(`️ Failed to parse summary for "${title.substring(0, 50)}..." - using fallback`);
          }

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
      console.log(' Checking messages table structure...');
      const modelColumnCheck = await this.pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'model'
      `);

      if (modelColumnCheck.rows.length === 0) {
        console.log(' Adding model column to messages table...');
        await this.pool.query(`ALTER TABLE messages ADD COLUMN model VARCHAR(255)`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model)`);
        console.log(' Added model column to messages table');
      } else {
        console.log(' Model column already exists in messages table');
      }

      // Create activity_log table if not exists
      console.log(' Checking activity_log table...');

      // First check if table exists
      const tableCheck = await this.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'activity_log'
        )
      `);

      if (!tableCheck.rows[0].exists) {
        console.log(' Creating activity_log table...');
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

        console.log(' Activity log table created successfully');
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
            console.log('️ activity_log table has wrong user_id type, dropping and recreating...');
            await this.pool.query(`DROP TABLE activity_log`);
            console.log(' Dropped old activity_log table');

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

            console.log(' Activity log table recreated with correct schema');
          } else {
            console.log(' Activity log table already exists with proper columns');
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(` Database schema check completed in ${duration}ms`);
    } catch (error) {
      console.error(' Failed to ensure tables:', error);
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
      console.log(` Searching for related topics: "${query}" (limit: ${limit}, threshold: ${relevanceThreshold}%, excluding ${usedSources.length} sources)`);

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

      // Randomize results (Fisher-Yates shuffle) instead of sorting by score
      const shuffledResults = [...filteredResults];
      for (let i = shuffledResults.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledResults[i], shuffledResults[j]] = [shuffledResults[j], shuffledResults[i]];
      }
      const sortedResults = shuffledResults.slice(0, limit);

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

        // Clean raw metadata content (handles crawler records with listing_id/url format)
        const rawContent = result.excerpt || result.content || '';
        const cleanedContent = this.cleanRawMetadataContent(rawContent, result.metadata);
        const cleanExcerpt = this.toSentenceCase(this.stripHtml(cleanedContent));

        // Enable LLM generation for related topics
        let processedContent = cleanExcerpt;
        let generatedQuestion = '';

        try {
          console.log(` Processing related topic with LLM: ${title.substring(0, 30)}...`);
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
      console.log(` Getting paginated related results: query="${query}", offset=${offset}, limit=${limit}, threshold=${relevanceThreshold}%`);

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

      // Randomize results (Fisher-Yates shuffle) instead of sorting by score
      const shuffledResults = [...filteredResults];
      for (let i = shuffledResults.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledResults[i], shuffledResults[j]] = [shuffledResults[j], shuffledResults[i]];
      }

      // Apply pagination
      const paginatedResults = shuffledResults.slice(offset, offset + limit);

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

        // Clean raw metadata content (handles crawler records with listing_id/url format)
        const rawContent = result.excerpt || result.content || '';
        const cleanedContent = this.cleanRawMetadataContent(rawContent, result.metadata);
        const cleanExcerpt = this.toSentenceCase(this.stripHtml(cleanedContent));

        // Generate LLM-processed content and question
        let processedContent = cleanExcerpt;
        let generatedQuestion = '';

        try {
          console.log(` Processing paginated result with LLM: ${title.substring(0, 30)}...`);
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
   * IMPROVED: Now generates contextual, specific questions instead of generic ones
   * ENHANCED: Now respects RAG settings - source table weights and document embeddings toggle
   */
  async getPopularQuestions(): Promise<string[]> {
    try {
      console.log('[SUGGESTIONS] Generating contextual suggestion questions...');

      // Get maxQuestionLength from chatbot settings
      const chatbotSettingsRaw = await settingsService.getSetting('chatbot');
      let maxQuestionLength = 500;
      try {
        const chatbotSettings = chatbotSettingsRaw ? JSON.parse(chatbotSettingsRaw) : {};
        maxQuestionLength = chatbotSettings.maxQuestionLength || 500;
      } catch (e) { /* use default */ }

      // ===== NEW: Get RAG Settings for source filtering =====
      // Get source table weights from settings
      let sourceTableWeights: Record<string, number> = {};
      try {
        const weightsRaw = await settingsService.getSetting('search.sourceTableWeights');
        if (weightsRaw) {
          sourceTableWeights = typeof weightsRaw === 'string' ? JSON.parse(weightsRaw) : weightsRaw;
        }
      } catch (e) {
        console.log('[SUGGESTIONS] No source table weights found, using defaults');
      }

      // Get enableDocumentEmbeddings setting
      let enableDocumentEmbeddings = true; // default true
      try {
        const docEmbeddingSetting = await settingsService.getSetting('ragSettings.enableDocumentEmbeddings');
        enableDocumentEmbeddings = docEmbeddingSetting === 'true' || docEmbeddingSetting === true;
      } catch (e) { /* use default */ }

      // Get database priority (for unified_embeddings)
      let databasePriority = 5; // default
      try {
        const dbPrioritySetting = await settingsService.getSetting('ragSettings.databasePriority');
        if (dbPrioritySetting) {
          databasePriority = parseInt(dbPrioritySetting as string) || 5;
        }
      } catch (e) { /* use default */ }

      console.log('[SUGGESTIONS] RAG Settings:', {
        sourceTableWeights,
        enableDocumentEmbeddings,
        databasePriority
      });

      // 1. Get active source tables (with minimum record count threshold)
      // This filters out disabled or empty data sources
      const activeTablesQuery = `
        SELECT source_table, COUNT(*) as record_count
        FROM unified_embeddings
        GROUP BY source_table
        HAVING COUNT(*) >= 5
      `;

      const activeTablesResult = await this.pool.query(activeTablesQuery);

      // ===== NEW: Filter tables by weight > 0 and databasePriority > 0 =====
      let activeTables = activeTablesResult.rows
        .map(row => row.source_table)
        .filter(Boolean)
        .filter(table => {
          // If databasePriority is 0, exclude all unified_embeddings sources
          if (databasePriority === 0) {
            console.log(`[SUGGESTIONS] Excluding ${table}: databasePriority is 0`);
            return false;
          }
          // If table has explicit weight of 0, exclude it
          if (sourceTableWeights[table] === 0) {
            console.log(`[SUGGESTIONS] Excluding ${table}: weight is 0`);
            return false;
          }
          return true;
        });

      console.log(`[SUGGESTIONS] Active data sources after RAG filter:`, activeTables);

      // ===== NEW: Also get suggestions from document_embeddings if enabled =====
      let documentContent: any[] = [];
      if (enableDocumentEmbeddings) {
        try {
          const docQuery = `
            SELECT
              COALESCE(metadata->>'filename', LEFT(chunk_text, 100)) as title,
              LEFT(chunk_text, 300) as excerpt,
              'document_embeddings' as source_table
            FROM document_embeddings
            WHERE chunk_text IS NOT NULL
              AND LENGTH(chunk_text) > 50
            ORDER BY RANDOM()
            LIMIT 20
          `;
          const docResult = await this.pool.query(docQuery);
          documentContent = docResult.rows;
          console.log(`[SUGGESTIONS] Found ${documentContent.length} document embeddings entries`);
        } catch (e) {
          console.log('[SUGGESTIONS] No document_embeddings table or error:', e);
        }
      }

      // If no active tables AND no document content, return empty suggestions
      if (activeTables.length === 0 && documentContent.length === 0) {
        console.log(`[SUGGESTIONS] No active data sources found, returning empty suggestions`);
        return [];
      }

      // 2. Get interesting content from database (titles + excerpts for context)
      // Only select from active tables (filtered by RAG settings)
      let unifiedContent: any[] = [];
      if (activeTables.length > 0) {
        const contentQuery = `
          SELECT
            COALESCE(metadata->>'title', LEFT(content, 100)) as title,
            LEFT(content, 300) as excerpt,
            source_table
          FROM unified_embeddings
          WHERE (metadata->>'title' IS NOT NULL OR content IS NOT NULL)
            AND LENGTH(COALESCE(metadata->>'title', content)) > 30
            AND source_table = ANY($1::text[])
          ORDER BY RANDOM()
          LIMIT 50
        `;
        const contentResult = await this.pool.query(contentQuery, [activeTables]);
        unifiedContent = contentResult.rows;
      }

      // Combine both sources
      const allContent = [...unifiedContent, ...documentContent];
      const generatedQuestions: string[] = [];

      console.log(`[SUGGESTIONS] Processing ${allContent.length} entries (${unifiedContent.length} unified + ${documentContent.length} documents)...`);

      // Early exit once we have enough questions (for performance)
      const TARGET_QUESTIONS = 8; // Generate 8, pick 4 randomly

      // 2. Generate contextual questions from each content (unified + documents)
      for (const row of allContent) {
        const title = row.title || '';
        const excerpt = row.excerpt || '';
        const sourceTable = row.source_table || '';

        // Skip empty or too short content
        if (!title || title.length < 10) {
          continue;
        }

        // Clean the text - use specialized cleaner for suggestions
        const cleanTitle = this.cleanTitleForSuggestions(title.replace(/<[^>]*>/g, ''));
        const cleanExcerpt = this.toSentenceCase(excerpt.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

        // Skip URLs, file patterns, and unwanted content
        if (cleanTitle.includes('http') || cleanExcerpt.includes('http')) {
          continue;
        }

        // Skip titles that are still technical/metadata-like after cleaning
        if (cleanTitle.length < 10 || /^\d+$/.test(cleanTitle) || /^[A-Z]{2,}\d+/.test(cleanTitle)) {
          continue;
        }

        // Generate dynamic, contextual question using existing smart logic
        const category = this.categorizeContent(cleanTitle, cleanExcerpt, sourceTable);
        const smartQuestion = this.generateDynamicQuestion(cleanTitle, cleanExcerpt, category, maxQuestionLength);

        // FILTER OUT GENERIC/VAGUE QUESTIONS
        const isGenericQuestion = this.isGenericQuestion(smartQuestion);
        if (isGenericQuestion) {
          console.log(`   [SKIP] Generic: "${smartQuestion.substring(0, 60)}..."`);
          continue;
        }

        generatedQuestions.push(smartQuestion);
        console.log(`   [OK] Generated: "${smartQuestion.substring(0, 80)}..."`);

        // Early exit once we have enough questions (performance optimization)
        if (generatedQuestions.length >= TARGET_QUESTIONS) {
          console.log(`[SUGGESTIONS] Reached target of ${TARGET_QUESTIONS} questions, stopping early`);
          break;
        }
      }

      console.log(`[SUGGESTIONS] Generated ${generatedQuestions.length} contextual questions`);

      // 3. If not enough questions, generate generic ones from whatever content we have
      if (generatedQuestions.length < 4) {
        console.log(`[SUGGESTIONS] Not enough questions (${generatedQuestions.length}), trying to generate more from content...`);

        // Don't use hardcoded default questions - instead return what we have
        // The questions should come from the actual database content
        // If there's no content, return empty array (no suggestions)
      }

      // 4. Randomly select 4 questions using Fisher-Yates shuffle
      const shuffled = [...generatedQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const final = shuffled.slice(0, 4);
      console.log('[SUGGESTIONS] Final 4 questions:', final);

      return final;
    } catch (error) {
      console.error('[SUGGESTIONS] Error generating questions:', error);
      // Return empty array on error - no fallback to hardcoded questions
      // This allows each deployment to generate questions from its own content
      return [];
    }
  }

  /**
   * Filter out generic/vague questions that lack context
   */
  private isGenericQuestion(question: string): boolean {
    const genericPatterns = [
      /buna benzer/i,
      /bunun gibi/i,
      /bu tür/i,
      /bu konuda/i,
      /hakkında bilgi/i,
      /detaylı bilgi/i,
      /bilgi verir misiniz/i,
      /açıklar mısınız/i,
      /nedir\?$/i, // Questions that ONLY ask "what is X?"
      /ne demek/i,
      /similar to/i,
      /like this/i,
      /about this/i,
      /information about/i,
      /can you provide/i
    ];

    // Check if question matches any generic pattern
    for (const pattern of genericPatterns) {
      if (pattern.test(question)) {
        return true;
      }
    }

    // Check if question is too short (less than 30 chars = likely too generic)
    if (question.length < 30) {
      return true;
    }

    return false;
  }

  /**
   * Categorize content for better question generation
   */
  private categorizeContent(title: string, excerpt: string, sourceTable: string): string {
    const content = `${title} ${excerpt}`.toLowerCase();

    // Tax/Legal categories
    if (/stopaj|tevkifat/i.test(content)) return 'stopaj';
    if (/kdv|katma değer/i.test(content)) return 'kdv';
    if (/gelir vergisi/i.test(content)) return 'gelir_vergisi';
    if (/kurumlar vergisi/i.test(content)) return 'kurumlar_vergisi';
    if (/beyanname/i.test(content)) return 'beyanname';
    if (/muafiyet|istisna/i.test(content)) return 'muafiyet';
    if (/damga vergisi/i.test(content)) return 'damga';

    // Source table fallback
    if (sourceTable === 'sorucevap') return 'soru_cevap';
    if (sourceTable === 'makaleler') return 'makale';
    if (sourceTable === 'ozelgeler') return 'ozelge';

    return 'genel';
  }
  /**
     * Process a single source with LLM enrichment
     * Used by enhanced parallel processing
     */
  private async processSourceWithLLM(r: any, idx: number, enableLLMGeneration: boolean, maxQuestionLength: number = 500): Promise<any> {
    const category = this.categorizeSource(r);
    const score = r.score || (r.similarity_score ? Math.round(r.similarity_score * 100) : 50);
    const sourceTable = r.source_table || 'documents';

    // Clean HTML from title and excerpt, convert ALL CAPS to sentence case
    const cleanTitle = this.toSentenceCase(this.stripHtml(r.title?.replace(/ \(Part \d+\/\d+\)/g, '') || `Source ${idx + 1}`));
    // Clean raw metadata content (handles crawler records with listing_id/url format)
    const rawContent = r.excerpt || r.content || '';
    const cleanedContent = this.cleanRawMetadataContent(rawContent, r.metadata);
    const cleanExcerpt = this.toSentenceCase(this.stripHtml(cleanedContent));

    // Build metadata context for template processing
    const metadata: Record<string, unknown> = {
      title: cleanTitle,
      excerpt: cleanExcerpt,
      content: r.content || cleanExcerpt,
      ...r.metadata
    };

    // Use DataSchema service for citation generation
    let citation = `[Source ${idx + 1}]`;
    try {
      const citationResult = await dataSchemaService.generateCitation(sourceTable, metadata);
      if (citationResult.text && citationResult.text !== sourceTable) {
        citation = citationResult.text;
      }
    } catch (err) {
      // Fallback to old citation logic
      if (r.metadata) {
        const parts: string[] = [];
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
    }

    // Prepare content
    let processedContent = cleanExcerpt;
    let generatedQuestion = this.generateDynamicQuestion(cleanTitle, cleanExcerpt, category, maxQuestionLength);

    // Use DataSchema service for question generation
    try {
      const schemaQuestions = await dataSchemaService.generateQuestions(sourceTable, metadata, 1);
      if (schemaQuestions.length > 0) {
        generatedQuestion = schemaQuestions[0].text;
      }
    } catch (err) {
      // Keep fallback question
    }

    // Generate LLM content if enabled
    if (enableLLMGeneration) {
      try {
        console.log(` Processing source ${idx + 1} with LLM: ${cleanTitle.substring(0, 30)}...`);
        const llmResult = await this.generateContentAndQuestion(cleanTitle, cleanExcerpt, category);
        processedContent = llmResult.processedContent;
        // Only override question if LLM provides one
        if (llmResult.generatedQuestion) {
          generatedQuestion = llmResult.generatedQuestion;
        }
        console.log(` Parallel LLM generated content (length: ${processedContent?.length || 0})`);
      } catch (error) {
        console.error(` Parallel LLM processing FAILED for source ${idx + 1}:`, error);
        // Continue with fallback content
      }
    }

    // Extract tags from schema
    let tags: string[] = [];
    try {
      tags = await dataSchemaService.extractTags(sourceTable, metadata);
    } catch (err) {
      // No tags
    }

    return {
      id: r.id,
      title: cleanTitle,
      excerpt: this.truncateExcerpt(cleanExcerpt, 250),
      content: processedContent,
      question: generatedQuestion,
      category: category,
      sourceTable: sourceTable,
      citation: citation,
      tags: tags,
      score: score,
      relevance: score,
      relevanceText: score > 80 ? 'Yüksek' : score > 60 ? 'Orta' : 'Düşük',
      databaseInfo: {
        table: sourceTable,
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
  private createFallbackResult(r: any, idx: number, maxQuestionLength: number = 500): any {
    const category = this.categorizeSource(r);
    const score = r.score || (r.similarity_score ? Math.round(r.similarity_score * 100) : 50);
    const sourceTable = r.source_table || 'documents';
    const cleanTitle = this.toSentenceCase(this.stripHtml(r.title || `Kaynak ${idx + 1}`));
    // Clean raw metadata content (handles crawler records with listing_id/url format)
    const rawContent = r.excerpt || r.content || '';
    const cleanedContent = this.cleanRawMetadataContent(rawContent, r.metadata);
    const cleanExcerpt = this.toSentenceCase(this.stripHtml(cleanedContent));

    return {
      id: r.id,
      title: cleanTitle,
      excerpt: this.truncateExcerpt(cleanExcerpt, 250),
      content: cleanExcerpt,
      question: this.generateDynamicQuestion(cleanTitle, cleanExcerpt, category, maxQuestionLength),
      category: category,
      sourceTable: sourceTable,
      citation: cleanTitle || `[Source ${idx + 1}]`,
      tags: [],
      score: score,
      relevance: score,
      relevanceText: score > 80 ? 'Yüksek' : score > 60 ? 'Orta' : 'Düşük',
      databaseInfo: {
        table: sourceTable,
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

      console.log(` Loading more results: query="${originalQuery}", offset=${currentOffset}, batch=${fetchCount} (batch size: ${batchSize})`);

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

      // Get additional settings for LLM generation
      const enableParallelLLM = await settingsService.getSetting('enable_parallel_llm') === 'true';
      const parallelCount = Math.min(parseInt(await settingsService.getSetting('parallel_llm_count') || '3'), 5);

      // Format the results with LLM generation enabled (same as initial results)
      const formattedResults = await this.formatSources(newResults, {
        enableParallelLLM,
        parallelCount,
        batchSize
      });

      // Check if there are more results
      const hasMore = currentOffset + fetchCount < filteredResults.length;
      const nextOffset = currentOffset + fetchCount;

      console.log(` Loaded ${formattedResults.length} more results (batch: ${fetchCount}), hasMore=${hasMore}, nextOffset=${nextOffset}`);

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