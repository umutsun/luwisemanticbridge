import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { semanticSearch, SemanticSearchService } from './semantic-search.service';
import claudeService from './claude.service';
import geminiService from './gemini.service';
import deepseekService from './deepseek.service';
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
  private openai: OpenAI | null = null;
  private useOpenAI: boolean = false;
  private aiProviderPriority: string[] = ['claude', 'openai', 'gemini', 'deepseek', 'fallback'];
  private fallbackEnabled: boolean;
  private defaultTemperature: number = 0.1;
  private defaultMaxTokens: number = 4096;
  private defaultGeminiModel: string = 'gemini-1.5-flash';

  constructor() {

    // Set default values
    this.fallbackEnabled = process.env.AI_FALLBACK_ENABLED !== 'false'; // Default to true

    // Try to load AI provider from database
    this.loadAISettings().catch(console.error);

    // Initialize OpenAI only if API key is available
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-proj-YOUR_OPENAI_API_KEY_HERE') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      this.useOpenAI = true;
      console.log('✅ OpenAI Chat API initialized');
    } else {
      console.log('⚠️  OpenAI API key not configured');
    }

    console.log(`🤖 AI Provider Priority: ${this.aiProviderPriority.join(', ')}, Fallback: ${this.fallbackEnabled}`);

    // Load priority asynchronously
    this.loadPriority();
  }

  private async loadPriority() {
    try {
      this.aiProviderPriority = await this.getProviderPriority();
      console.log(`🔄 Updated AI Provider Priority: ${this.aiProviderPriority.join(', ')}`);
    } catch (error) {
      // Keep default priority
    }
  }

  private async getProviderPriority(): Promise<string[]> {
    try {
      // Try to get from database first
      const result = await pool.query(
        "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'ai_provider_priority'"
      );

      if (result.rows[0]?.setting_value) {
        return JSON.parse(result.rows[0].setting_value);
      }
    } catch (error) {
      // Database might not be ready yet
    }

    // Fallback to environment variable or default
    const envPriority = process.env.AI_PROVIDER_PRIORITY;
    if (envPriority) {
      return envPriority.split(',').map(p => p.trim());
    }

    // Default priority
    return ['claude', 'openai', 'gemini', 'deepseek', 'fallback'];
  }

  /**
   * Load AI settings from database
   */
  private async loadAISettings() {
    try {
      const result = await pool.query(
        "SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key IN ('ai_provider', 'fallback_enabled', 'temperature', 'max_tokens', 'gemini_model')"
      );

      for (const row of result.rows) {
        if (row.setting_key === 'ai_provider') {
          // Update provider priority based on database setting
          const provider = row.setting_value;
          this.aiProviderPriority = [provider, ...this.aiProviderPriority.filter(p => p !== provider)];
          console.log(`📝 AI Provider loaded from database: ${provider}`);
        } else if (row.setting_key === 'fallback_enabled') {
          this.fallbackEnabled = row.setting_value === 'true';
          console.log(`📝 Fallback enabled loaded from database: ${this.fallbackEnabled}`);
        } else if (row.setting_key === 'temperature') {
          this.defaultTemperature = parseFloat(row.setting_value) || 0.1;
          console.log(`📝 Temperature loaded from database: ${this.defaultTemperature}`);
        } else if (row.setting_key === 'max_tokens') {
          this.defaultMaxTokens = parseInt(row.setting_value) || 4096;
          console.log(`📝 Max tokens loaded from database: ${this.defaultMaxTokens}`);
        } else if (row.setting_key === 'gemini_model') {
          this.defaultGeminiModel = row.setting_value || 'gemini-1.5-flash';
          console.log(`📝 Gemini model loaded from database: ${this.defaultGeminiModel}`);
        }
      }
    } catch (error) {
      console.warn('Failed to load AI settings from database:', error);
    }
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

      // Use semantic search to find related content
      let allResults = [];
      if (useUnifiedEmbeddings) {
        allResults = await semanticSearch.unifiedSemanticSearch(message, 30);
      } else {
        allResults = await semanticSearch.hybridSearch(message, 30);
      }

      // Get minimum similarity threshold from database (default 10%)
      const minThreshold = parseFloat(await settingsService.getSetting('semantic_search_threshold') || '10');

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

      // If no results meet threshold, take top results anyway
      if (searchResults.length === 0 && allResults.length > 0) {
        searchResults = allResults.slice(0, 10);
        console.log('No results above threshold, showing top matches');
      }

      // 3. Get conversation history
      const history = await this.getConversationHistory(convId, 5);

      // 4. Generate simple response focused on the found topics
      const temperature = options.temperature !== undefined ? options.temperature : this.defaultTemperature;
      const maxTokens = options.maxTokens !== undefined ? options.maxTokens : this.defaultMaxTokens;

      // Create a simple context with titles and scores
      const simpleContext = searchResults.slice(0, 5).map((r, idx) => {
        const score = Math.round(r.score || (r.similarity_score * 100) || 0);
        const title = r.title || `Kaynak ${idx + 1}`;
        return `${idx + 1}. %${score} - ${title}`;
      }).join('\n');

      // Generate response
      const response = await this.generateResponse(message, simpleContext, history, temperature, options, searchResults, maxTokens);

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

    // Kaynakları score'a göre sırala (yüksek score önce) - context için de
    const sortedResults = [...searchResults].sort((a, b) => {
      const scoreA = a.score || (a.similarity_score * 100) || 0;
      const scoreB = b.score || (b.similarity_score * 100) || 0;
      return scoreB - scoreA;
    });

    let context = 'VERİTABANINDAN BULUNAN İLGİLİ BİLGİLER (en yüksek skor dan başlayarak):\n\n';

    // Grupları oluştur - yüksek skorlu kaynakları öne çıkar
    const highScoreSources = sortedResults.filter(r => (r.score || (r.similarity_score * 100) || 0) >= 75);
    const mediumScoreSources = sortedResults.filter(r => {
      const score = r.score || (r.similarity_score * 100) || 0;
      return score >= 50 && score < 75;
    });
    const lowScoreSources = sortedResults.filter(r => (r.score || (r.similarity_score * 100) || 0) < 50);

    // En yüksek skorlu kaynakları başa ekle
    if (highScoreSources.length > 0) {
      context += '🎯 YÜSEK EŞLEŞME SONUÇLARI:\n';
      highScoreSources.forEach((result, idx) => {
        context += this.formatSourceForContext(result, idx + 1);
      });
      context += '\n';
    }

    // Orta skorlu kaynakları ekle
    if (mediumScoreSources.length > 0) {
      context += '📊 ORTA EŞLEŞME SONUÇLARI:\n';
      mediumScoreSources.forEach((result, idx) => {
        context += this.formatSourceForContext(result, idx + highScoreSources.length + 1);
      });
      context += '\n';
    }

    // Düşük skorlu kaynakları sona ekle (sadece az sonuç varsa)
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
    // Önce source_table'dan kategori belirle
    const sourceTable = result.source_table?.toUpperCase();
    
    if (sourceTable === 'OZELGELER') {
      return 'Özelge';
    } else if (sourceTable === 'DANISTAYKARARLARI') {
      return 'Danıştay Kararı';
    } else if (sourceTable === 'MAKALELER') {
      return 'Makale';
    } else if (sourceTable === 'DOKUMAN') {
      return 'Doküman';
    } else if (sourceTable === 'MEVZUAT') {
      return 'Mevzuat';
    }
    
    // Eğer source_table yoksa içerikten tahmin et
    const title = result.title?.toLowerCase() || '';
    const content = result.excerpt?.toLowerCase() || '';
    const combined = title + ' ' + content;

    if (combined.includes('kanun') || combined.includes('yönetmelik') || combined.includes('tebliğ')) {
      return 'Mevzuat';
    } else if (combined.includes('özelge') || combined.includes('mukteza')) {
      return 'Özelge';
    } else if (combined.includes('sirküler') || combined.includes('duyuru')) {
      return 'Sirküler';
    } else if (combined.includes('karar') || combined.includes('mahkeme') || combined.includes('danıştay')) {
      return 'Yargı Kararı';
    } else if (combined.includes('makale') || combined.includes('yazı') || combined.includes('analiz')) {
      return 'Makale';
    } else {
      return 'Kaynak';
    }
  }

  /**
   * Truncate excerpt intelligently
   */
  private truncateExcerpt(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    
    // Cümle sonunda kes
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
      let citation = `[Kaynak ${idx + 1}]`;
      if (r.metadata) {
        if (r.source_table === 'OZELGELER' && r.metadata.sayiNo) {
          citation = `Özelge - ${r.metadata.sayiNo}`;
        } else if (r.source_table === 'DANISTAYKARARLARI' && r.metadata.kararNo) {
          citation = `Danıştay ${r.metadata.daire || ''} - Karar: ${r.metadata.kararNo}`;
        } else if (r.source_table === 'MAKALELER' && r.metadata.yazar) {
          citation = `${r.metadata.yazar} - ${r.metadata.donem || ''}`;
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

      // Use the selected chat model (same as for chat responses)
      try {
        const response = await this.generateResponse(prompt, '', [], 0.3, {}, [], 500);

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
   * Generate response using selected AI provider
   */
  private async generateResponse(
    query: string,
    context: string,
    history: ChatMessage[],
    temperature: number = 0.1,
    options: ChatOptions = {},
    searchResults?: any[],
    maxTokens: number = 2048
  ) {
    let response = null;
    let lastError = null;
    let successfulProvider = null;

    // Get fresh priority settings for each request
    const providerPriority = await this.getProviderPriority();

    // Try providers in priority order
    for (const provider of providerPriority) {
      if (response) break; // Stop if we got a response

      console.log(`🤖 Trying ${provider}...`);

      try {
        switch (provider) {
          case 'gemini':
            if (geminiService.isAvailable()) {
              response = await geminiService.generateResponse(query, context, history, temperature, options.systemPrompt, maxTokens);
              successfulProvider = 'Gemini';
              console.log('✅ Gemini successful');
            } else {
              throw new Error('Gemini API not available');
            }
            break;

          case 'claude':
            if (claudeService.isAvailable()) {
              response = await claudeService.generateResponse(query, context, history, options.systemPrompt, maxTokens);
              successfulProvider = 'Claude';
              console.log('✅ Claude successful');
            } else {
              throw new Error('Claude API not available');
            }
            break;

          case 'openai':
            if (this.useOpenAI && this.openai) {
              response = await this.generateOpenAIResponse(query, context, history, temperature, searchResults, options.systemPrompt, maxTokens);
              successfulProvider = 'OpenAI';
              console.log('✅ OpenAI successful');
            } else {
              throw new Error('OpenAI API not available');
            }
            break;

          case 'deepseek':
            if (deepseekService.isAvailable()) {
              response = await deepseekService.generateResponse(query, context, history, temperature, options.systemPrompt, maxTokens);
              successfulProvider = 'DeepSeek';
              console.log('✅ DeepSeek successful');
            } else {
              throw new Error('DeepSeek API not available');
            }
            break;

          case 'fallback':
            response = this.generateDemoResponse(query, context);
            successfulProvider = 'Demo';
            response.isFallback = true;
            console.log('✅ Demo response generated (Fallback)');
            break;

          default:
            console.warn(`Unknown provider: ${provider}`);
            break;
        }
      } catch (error: any) {
        console.error(`${provider} API error:`, error.message);
        lastError = error;
      }
    }

    if (!response) {
      throw lastError || new Error('All AI providers failed');
    }

    // Add provider info to response
    return {
      ...response,
      provider: successfulProvider
    };
  }

  /**
   * Generate response using OpenAI
   */
  private async generateOpenAIResponse(
    query: string,
    context: string,
    history: ChatMessage[],
    temperature: number = 0.1,
    searchResults?: any[],
    systemPrompt?: string,
    maxTokens: number = 2048
  ) {
    if (!this.openai) throw new Error('OpenAI not initialized');

    // Get OpenAI model from settings
    let openaiModel = 'gpt-3.5-turbo';
    try {
      const modelResult = await pool.query(
        "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'openai_model'"
      );
      if (modelResult.rows[0]?.setting_value) {
        openaiModel = modelResult.rows[0].setting_value;
      }
    } catch (error) {
      // Use default model
    }

    // Get system prompt from database
    const systemPromptFromDB = await this.getSystemPrompt();

    // Check if we have sources but no good context
    const hasSourcesButNoContext = searchResults && searchResults.length > 0 && (!context || context.length < 100);

    // If we have sources but limited context, enrich the prompt with source summaries
    let sourcesSummary = '';
    if (hasSourcesButNoContext && searchResults) {
      sourcesSummary = '\n\nKAYNAK ÖZETLERİ (ilgi düzeyine göre):\n';
      const topSources = searchResults.slice(0, 7);
      topSources.forEach((source, idx) => {
        const score = source.score || Math.round((source.similarity_score || 0.5) * 100);
        const title = source.title || 'Kaynak';
        const excerpt = source.excerpt || source.content || '';
        const truncatedExcerpt = excerpt.length > 100 ? excerpt.substring(0, 100) + '...' : excerpt;
        sourcesSummary += `${idx + 1}. %${score} - ${title}: ${truncatedExcerpt}\n`;
      });
    }

    const defaultSystemPrompt = systemPromptFromDB;

    // Append context information to the system prompt
    const finalSystemPrompt = systemPrompt || defaultSystemPrompt;

    // Add context to the prompt
    const contextPrompt = finalSystemPrompt + `

Bağlam (en ilgiliden başlayarak sıralı):
${context && context.length > 50 ? context : 'Veritabanında bu konuyla ilgili spesifik bilgi bulunamadı.'}${sourcesSummary}`;

    const messages: any[] = [
      { role: 'system', content: contextPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: query }
    ];

    const completion = await this.openai.chat.completions.create({
      model: openaiModel,
      messages,
      temperature: temperature,
      max_tokens: Math.min(maxTokens, 8000) // Allow up to 8000 tokens for longer responses
    });

    return {
      content: completion.choices[0].message.content || 'Yanıt oluşturulamadı.'
    };
  }

  /**
   * Generate demo response without OpenAI
   */
  private generateDemoResponse(query: string, context: string): { content: string } {
    const lowerQuery = query.toLowerCase();
    
    // If context exists, use it to generate a response
    if (context && context.length > 50) {
      const contextLines = context.split('\n').filter(line => line.trim());
      const firstSource = contextLines.find(line => line.includes('[Kaynak')) || '';
      const relevantInfo = contextLines.slice(0, 2).join('\n');
      
      return {
        content: `${query} hakkında:\n\n${relevantInfo}\n\n💡 Not: Daha detaylı bilgi için aşağıdaki kaynaklara bakabilirsiniz.`
      };
    }
    
    // Common responses
    const responses: { [key: string]: string } = {
      'merhaba': 'Merhaba! 👋 Size nasıl yardımcı olabilirim?\n\nVergi, muhasebe ve mali mevzuat konularında sorularınızı yanıtlayabilirim.',
      'özelge': '📋 **Özelge Nedir?**\n\nÖzelge, vergi mükelleflerinin belirli bir konu hakkında Gelir İdaresi Başkanlığı\'ndan aldıkları resmi görüştür.\n\n✅ Sadece başvuru sahibini bağlar\n✅ Vergi güvenliği sağlar\n✅ İşlem öncesi alınmalıdır',
      'kdv': '💰 **KDV Oranları:**\n\n• %1 - Temel gıda maddeleri\n• %8 - Bazı gıda ve hizmetler\n• %18 - Genel oran\n\nDetaylı liste için Maliye Bakanlığı sitesini ziyaret edebilirsiniz.',
      'test': '✅ Sistem başarıyla çalışıyor!\n\nMesajınız alındı ve işlendi. Size nasıl yardımcı olabilirim?'
    };

    // Find matching response
    for (const [key, value] of Object.entries(responses)) {
      if (lowerQuery.includes(key)) {
        return { content: value };
      }
    }

    // Default response
    return {
      content: `"${query}" konusuyla ilgili veritabanımda henüz detaylı bilgi bulunmuyor.\n\nBu konuda size daha iyi yardımcı olabilmem için daha spesifik bir soru sorabilirsiniz.`
    };
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

        // Determine category based on source table and content
        let category = 'Genel';
        if (sourceTable.toUpperCase().includes('OZELGE')) category = 'Özelge';
        else if (sourceTable.toUpperCase().includes('DANISTAY')) category = 'Danıştay Kararı';
        else if (sourceTable.toUpperCase().includes('MAKALE')) category = 'Makale';
        else if (sourceTable.toUpperCase().includes('SORUCEVAP')) category = 'Soru-Cevap';
        else if (sourceTable.toUpperCase().includes('MEVZUAT')) category = 'Mevzuat';

        // Generate a meaningful title
        let title = result.title || `${category} - Kaynak ${idx + 1}`;

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
        let generatedQuestion = `${title} hakkında detaylı bilgi verir misiniz?`;

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

        // Determine category
        let category = 'Genel';
        if (sourceTable.toUpperCase().includes('OZELGE')) category = 'Özelge';
        else if (sourceTable.toUpperCase().includes('DANISTAY')) category = 'Danıştay Kararı';
        else if (sourceTable.toUpperCase().includes('MAKALE')) category = 'Makale';
        else if (sourceTable.toUpperCase().includes('SORUCEVAP')) category = 'Soru-Cevap';
        else if (sourceTable.toUpperCase().includes('MEVZUAT')) category = 'Mevzuat';

        // Clean title
        let title = result.title || `${category} - Kaynak ${offset + idx + 1}`;
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
        let generatedQuestion = `${title} hakkında detaylı bilgi verir misiniz?`;

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