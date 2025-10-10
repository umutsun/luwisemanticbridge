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
      const result = await this.pool.query(
        'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
        [key]
      );

      return result.rows[0]?.setting_value || null;
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
  private async getSystemPrompt(): Promise<string> {
    try {
      const result = await pool.query(
        "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'system_prompt'"
      );

      if (result.rows[0]?.setting_value) {
        return result.rows[0].setting_value;
      }
    } catch (error) {
      console.warn('Failed to fetch system prompt from database:', error);
    }

    // Default system prompt
    return `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.

GÖREV:
- Aşağıdaki bağlamda verilen bilgilere dayanarak ANLAMLI ve AKICI bir metin oluştur
- Cevabını 2-3 paragraf halinde organize et:
  • İlk paragraf: Konunun genel çerçevesi ve temel bilgiler
  • İkinci paragraf: Detaylar, örnekler ve uygulamalar
  • Üçüncü paragraf (gerekirse): Önemli noktalar, istisnalar veya dikkat edilmesi gerekenler

- DİL ve ÜSLUP:
  • Profesyonel ama anlaşılır bir dil kullan
  • Teknik terimleri açıklayarak kullan
  • Madde madde sıralama yerine akıcı paragraflar oluştur
  • "Buna göre", "Bu kapsamda", "Öte yandan" gibi bağlaçlarla metni akıcı hale getir
  • KAYNAK BELİRTME: Metin içinde kaynak numarası belirtme (Kaynak 1, Kaynak 2 gibi yazma)

- KAYNAK YETERSİZLİĞİ DURUMU:
  • Eğer bağlamda direkt cevap bulamazsan ama ilgili kaynaklar varsa: "Bu konuda direkt bilgi bulamadım ama şunlar ilgili olabilir:" diye BAŞLA
  • İlk 3-5 en yüksek skorlu kaynağı kendi cümlelerinle ÖZETLE (sadece kaynakları listeleme!)
  • Özeti şu şekilde yap: "Bulduğum ilgili bilgiler arasında: [kaynak1 özeti]. Ayrıca: [kaynak2 özeti]. Konuyla ilgili olarak şunlar da dikkat çekici: [kaynak3 özeti]"
  • Skorları yüksek olan kaynaklara daha çok ağırlık ver
  • Sadece tamamen alakasız veya boş sonuçlar geldiğinde "Bu konuda veritabanımda bilgi bulunmuyor" de

- Tahmin yapma, sadece verilen bağlamdaki bilgileri kullan

Bağlam (en ilgiliden başlayarak sıralı):`;
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
      await this.ensureConversation(convId, userId, message);

      // Get system prompt from database or use default
      const systemPrompt = options.systemPrompt || await this.getSystemPrompt();

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

      // Get search settings from database
      const maxResults = parseInt(await settingsService.getSetting('ragSettings.maxResults') || await settingsService.getSetting('maxResults') || '15');
      const minResults = parseInt(await settingsService.getSetting('ragSettings.minResults') || await settingsService.getSetting('minResults') || '5');
      const minThreshold = parseFloat(await settingsService.getSetting('ragSettings.similarityThreshold') || await settingsService.getSetting('similarityThreshold') || await settingsService.getSetting('semantic_search_threshold') || '0.014');

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

      // Ensure minimum results requirement
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

      // 3. Get conversation history
      const history = await this.getConversationHistory(convId, 5);

      // 4. Generate response using LLM Manager
      const llmManager = LLMManager.getInstance();

      // Create a simple context with titles and scores
      const simpleContext = searchResults.slice(0, 5).map((r, idx) => {
        const score = Math.round(r.score || (r.similarity_score * 100) || 0);
        const title = r.title || `Kaynak ${idx + 1}`;
        return `${idx + 1}. %${score} - ${title}`;
      }).join('\n');

      // Generate response using LLM Manager
      const fullPrompt = `${systemPrompt}\n\nBAĞLAM:\n${simpleContext}\n\nSORU: ${message}`;
      const response = await llmManager.generateChatResponse(
        fullPrompt,
        {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          systemPrompt: systemPrompt
        }
      );

      // 5. Save messages to database
      await this.saveMessage(convId, 'user', message);
      await this.saveMessage(convId, 'assistant', response.content, searchResults);

      // 6. Format sources for frontend with natural language summaries
      const formattedSources = await this.formatSources(searchResults);

      // 7. Get additional related topics (excluding already shown ones)
      const relatedResultsLimit = parseInt(await settingsService.getSetting('related_results_limit') || '20');
      const shownIds = searchResults.slice(0, 3).map(s => s.id?.toString() || s.source_id?.toString());
      const relatedTopics = await this.getRelatedTopics(message, searchResults.slice(0, 3), relatedResultsLimit);

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

    return {
        response: response.content,
        sources: formattedSources,
        relatedTopics: relatedTopics,
        conversationId: convId,
        provider: response.provider,
        model: response.model || response.provider,
        providerDisplayName: getProviderDisplayName(response.provider || '', options.language || 'tr'),
        language: options.language || 'tr'
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
   * Optimized to avoid blocking on LLM content generation
   */
  private async formatSources(searchResults: any[]): Promise<any[]> {
    const formattedResults = [];
    const enableLLMGeneration = true; // Always enable LLM generation for better questions

    console.log(`🔄 Formatting ${searchResults.length} sources with LLM generation: ${enableLLMGeneration}`);

    for (let idx = 0; idx < searchResults.length; idx++) {
      const r = searchResults[idx];
      const category = this.categorizeSource(r);
      // Score already calculated in search results
      const score = r.score || (r.similarity_score ? Math.round(r.similarity_score * 100) : 50);
      console.log(`Source ${idx}: score=${r.score}, similarity_score=${r.similarity_score}, calculated=${score}`);

      // Build proper citation
      let citation = `[Source ${idx + 1}]`;
      if (r.metadata) {
        // Dynamic citation based on metadata fields
        const parts = [];

        // Add metadata fields dynamically (skip source_table as it's redundant)
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

      // Use fallback content by default for faster response
      let processedContent = cleanExcerpt;
      let generatedQuestion = `${cleanTitle} hakkında detaylı bilgi verir misiniz?`;

      // Only generate LLM content if explicitly enabled (opt-in)
      if (enableLLMGeneration) {
        try {
          console.time(`LLM processing for: ${cleanTitle.substring(0, 30)}...`);
          const llmResult = await this.generateContentAndQuestion(cleanTitle, cleanExcerpt, category);
          processedContent = llmResult.processedContent;
          generatedQuestion = llmResult.generatedQuestion;
          console.timeEnd(`LLM processing for: ${cleanTitle.substring(0, 30)}...`);
        } catch (error) {
          console.warn('LLM content generation failed, using fallback:', error);
        }
      }

      formattedResults.push({
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
        // Add flag indicating if LLM enrichment was applied
        enriched: enableLLMGeneration
      });
    }

    console.log(`✅ Formatted ${formattedResults.length} sources successfully`);
    return formattedResults;
  }

  /**
   * Generate LLM-processed content and question from excerpt
   */
  private async generateContentAndQuestion(title: string, excerpt: string, category: string): Promise<{ processedContent: string; generatedQuestion: string }> {
    try {
      console.log(`🤖 Attempting to generate question for: ${title.substring(0, 30)}...`);
      console.time(`LLM processing for: ${title.substring(0, 30)}...`);
      // Clean the excerpt first
      const cleanExcerpt = excerpt.replace(/^Cevap:\s*/i, '').trim();

      // Get language setting from database
      const responseLanguage = await settingsService.getSetting('response_language') || 'tr';

      // Create a simple prompt for the selected chat model
      const prompt = responseLanguage === 'en' ? `
Process the title and content below. Respond in this exact format:

IMPROVED CONTENT:
[Write a clear, 1-2 sentence summary of the content]

QUESTION:
[Ask a specific question about the content details, max 10 words]

Title: ${title}
Content: ${cleanExcerpt}
` : `
Aşağıdaki başlığı ve içeriği işle. Tam olarak bu formatla yanıtla:

İYİLEŞTİRİLMİŞ İÇERİK:
[İçeriğin net, 1-2 cümlelik özetini yaz]

SORU:
[İçerik detayları hakkında spesifik bir soru sor, maksimum 10 kelime]

Başlık: ${title}
İçerik: ${cleanExcerpt}
`;

      // Use the LLM Manager
      try {
        const response = await this.llmManager.generateChatResponse(prompt, {
          temperature: 0.3,
          maxTokens: 500,
          systemPrompt: ''
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
          processedContent = processedContent.replace(/^\*\*+/g, '').replace(/\*\*+$/g, '').replace(/\*\*\*/g, '').trim();

          // Clean the question
          let generatedQuestion = questionMatch ? questionMatch[1].trim() : `${title} hakkında bilgi verir misiniz?`;
          generatedQuestion = generatedQuestion.replace(/^\*\*+/g, '').replace(/^Üretilmiş Soru:\s*/i, '').trim();

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
    sources?: any[]
  ) {
    const query = `
      INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `;

    await this.pool.query(query, [
      uuidv4(),
      conversationId,
      role,
      content,
      sources ? JSON.stringify(sources) : null
    ]);
  }

  /**
   * Get conversation history
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

    const result = await this.pool.query(query, [conversationId, limit]);
    return result.rows.reverse();
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

        // Generate LLM-processed content and question for related topics
        let processedContent = cleanExcerpt;
        // Generate question based on content language (detect Turkish vs other)
        const isTurkishContent = /[çğıöşüÇĞİÖŞÜ]/.test(cleanExcerpt) ||
                                 /(\b(ve|ile|için|hakkında|bilgi|detaylı|verir|misiniz)\b)/i.test(cleanExcerpt);
        const questionTemplate = isTurkishContent ?
          `${title} hakkında detaylı bilgi verir misiniz?` :
          `Can you provide detailed information about ${title}?`;
        let generatedQuestion = questionTemplate;

        try {
          console.log(`🤖 Processing related topic: ${title.substring(0, 30)}...`);
          const llmResult = await this.generateContentAndQuestion(title, cleanExcerpt, category);
          processedContent = llmResult.processedContent;
          generatedQuestion = llmResult.generatedQuestion;
        } catch (error) {
          console.warn('LLM processing for related topic failed, using fallback:', error);
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
        // Generate question based on content language (detect Turkish vs other)
        const isTurkishContent = /[çğıöşüÇĞİÖŞÜ]/.test(cleanExcerpt) ||
                                 /(\b(ve|ile|için|hakkında|bilgi|detaylı|verir|misiniz)\b)/i.test(cleanExcerpt);
        const questionTemplate = isTurkishContent ?
          `${title} hakkında detaylı bilgi verir misiniz?` :
          `Can you provide detailed information about ${title}?`;
        let generatedQuestion = questionTemplate;

        try {
          console.log(`🤖 Processing paginated result: ${title.substring(0, 30)}...`);
          const llmResult = await this.generateContentAndQuestion(title, cleanExcerpt, category);
          processedContent = llmResult.processedContent;
          generatedQuestion = llmResult.generatedQuestion;
        } catch (error) {
          console.warn('LLM processing for paginated result failed, using fallback:', error);
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
   * Get popular questions based on recent searches and database content
   */
  async getPopularQuestions(): Promise<string[]> {
    try {
      // Get most searched questions from recent messages
      const recentSearchesQuery = `
        SELECT content, COUNT(*) as count
        FROM messages
        WHERE role = 'user'
          AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY content
        ORDER BY count DESC
        LIMIT 20
      `;

      const recentResult = await this.pool.query(recentSearchesQuery);
      const recentQuestions = recentResult.rows.map(r => r.content);

      // Pre-defined popular questions based on database content
      const popularQuestions = [
        'KDV iadesi nasıl alınır?',
        'E-fatura zorunluluğu kimleri kapsar?',
        'Gelir vergisi dilimleri 2024',
        'KDV tevkifatı oranları nedir?',
        'Geçici vergi nasıl hesaplanır?',
        'Stopaj oranları hangi ödemelerde uygulanır?',
        'Vergi dairesi işlemleri nasıl yapılır?',
        'Ar-Ge indirimi şartları nelerdir?',
        'KDV beyannamesi ne zaman verilir?',
        'Mücbir sebep halleri nelerdir?',
        'Transfer fiyatlandırması nedir?',
        'Vergi cezaları ve indirim oranları',
        'E-defter uygulaması zorunlu mu?',
        'İhracatta KDV istisnası nasıl uygulanır?',
        'Kurumlar vergisi istisnaları nelerdir?',
        'Damga vergisi oranları nedir?',
        'Motorlu taşıtlar vergisi hesaplama',
        'Özelge başvurusu nasıl yapılır?',
        'Vergi incelemesi süreçleri',
        'Dijital hizmet vergisi kimleri kapsar?'
      ];

      // Combine recent searches with popular questions, remove duplicates
      const allQuestions = [...new Set([...recentQuestions, ...popularQuestions])];
      
      // Randomly select 4 questions
      const shuffled = allQuestions.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 4);
    } catch (error) {
      console.error('Error getting popular questions:', error);
      // Return default questions if error
      return [
        'KDV iadesi nasıl alınır?',
        'E-fatura zorunluluğu kimleri kapsar?',
        'Gelir vergisi dilimleri 2024',
        'Geçici vergi nasıl hesaplanır?'
      ];
    }
  }
}

// Export singleton instance
export const ragChat = new RAGChatService();