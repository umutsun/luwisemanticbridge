import { v4 as uuidv4 } from 'uuid';
import { semanticSearch, SemanticSearchService } from './semantic-search.service';
import { LLMManager } from './llm-manager.service';
import { dataSchemaService } from './data-schema.service';
import pool from '../config/database';
import { redis } from '../config/redis';
import dotenv from 'dotenv';
import { TIMEOUTS } from '../config';
import {
  TopicEntity,
  LLMConfig,
  SanitizerConfig,
  DEFAULT_SANITIZER_CONFIG,
  SanitizerPattern,
  PendingDisambiguation,
  FollowUpConfig,
  DEFAULT_FOLLOWUP_CONFIG,
  DEADLINE_DISAMBIGUATION_RESPONSES,
  ExpectedDisambiguationResponse
} from '../types/data-schema.types';
import { RAGRoutingSchema, RAGResponseType } from '../types/settings.types';
import { DEFAULT_RAG_ROUTING_SCHEMA, getRAGRoutingSchema } from '../config/rag-routing-schema.config';
import { getSanitizerLangPack, buildTemporalPattern, buildDatePattern, buildPercentagePattern, SanitizerLangPack, normalizeNumberWords, buildNumberMatchPattern } from '../config/sanitizer-langs';

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
  private routingSchema: RAGRoutingSchema = DEFAULT_RAG_ROUTING_SCHEMA;
  private routingSchemaLoadedAt: number = 0;
  private readonly SCHEMA_CACHE_TTL = 60000; // 1 minute cache

  constructor() {
    this.llmManager = LLMManager.getInstance();
    console.log(' RAG Chat Service initialized with LLM Manager');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v12.33: FOLLOW-UP DEPTH CONTROL & INTENT CARRY-OVER
  // Prevents chatbot-like behavior with MAX_DEPTH=2, EXCEPTIONAL_MAX=3
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get Redis key prefix for pending disambiguation
   * Multi-tenant: Uses TENANT_NAME env var if set (e.g., vergilex, geolex, bookie)
   * Format: {tenant}:rag:disambiguation:{conversationId}
   */
  private getDisambiguationKey(conversationId: string): string {
    const tenant = process.env.TENANT_NAME || process.env.APP_NAME || 'lsemb';
    return `${tenant}:rag:disambiguation:${conversationId}`;
  }

  /**
   * v12.33: Store pending disambiguation in Redis
   * @param conversationId - Conversation ID
   * @param disambiguation - Pending disambiguation state
   * @param config - Follow-up configuration (for TTL)
   */
  private async setPendingDisambiguation(
    conversationId: string,
    disambiguation: PendingDisambiguation,
    config: FollowUpConfig = DEFAULT_FOLLOWUP_CONFIG
  ): Promise<void> {
    try {
      const key = this.getDisambiguationKey(conversationId);
      const ttl = config.ttlSeconds || 300; // Default 5 minutes

      await redis.setex(key, ttl, JSON.stringify(disambiguation));
      console.log(`💾 [v12.33] PENDING_SAVED: ${key} (TTL=${ttl}s, depth=${disambiguation.followUpCount})`);
    } catch (error) {
      console.error(`❌ [v12.33] DISAMBIGUATION_STORE_FAILED:`, error);
    }
  }

  /**
   * v12.33: Get pending disambiguation from Redis
   * @param conversationId - Conversation ID
   * @returns PendingDisambiguation or null if not found/expired
   */
  private async getPendingDisambiguation(conversationId: string): Promise<PendingDisambiguation | null> {
    try {
      const key = this.getDisambiguationKey(conversationId);
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      const disambiguation = JSON.parse(data) as PendingDisambiguation;

      // Check if expired (double-check, Redis TTL should handle this)
      if (Date.now() > disambiguation.expiresAt) {
        await this.clearPendingDisambiguation(conversationId);
        return null;
      }

      return disambiguation;
    } catch (error) {
      console.error(`❌ [v12.33] DISAMBIGUATION_GET_FAILED:`, error);
      return null;
    }
  }

  /**
   * v12.33: Clear pending disambiguation from Redis
   * @param conversationId - Conversation ID
   */
  private async clearPendingDisambiguation(conversationId: string): Promise<void> {
    try {
      const key = this.getDisambiguationKey(conversationId);
      await redis.del(key);
      console.log(`🧹 [v12.33] DISAMBIGUATION_CLEARED: ${key}`);
    } catch (error) {
      console.error(`❌ [v12.33] DISAMBIGUATION_CLEAR_FAILED:`, error);
    }
  }

  /**
   * v12.33: Detect if message is a follow-up to pending disambiguation
   * Uses fuzzy matching with Levenshtein distance for typo tolerance
   *
   * @param message - User message
   * @param conversationId - Conversation ID
   * @returns Detection result with resolution if matched
   */
  private async detectFollowUp(
    message: string,
    conversationId: string
  ): Promise<{ isFollowUp: boolean; resolution?: string; context?: any; pending?: PendingDisambiguation }> {
    // 1. Check for pending disambiguation
    const pending = await this.getPendingDisambiguation(conversationId);
    if (!pending) {
      return { isFollowUp: false };
    }

    // 2. Normalize message
    const normalized = this.normalizeQueryForIntent(message);
    const words = normalized.split(/\s+/).filter(w => w.length > 0);

    // 3. Short message detection (1-3 words likely a follow-up response)
    if (words.length > 5) {
      // Too long to be a simple follow-up response like "beyanname"
      console.log(`🔍 [v12.33] FOLLOWUP_CHECK: Message too long (${words.length} words), treating as new query`);
      return { isFollowUp: false };
    }

    // 4. Check if any word matches expected responses (with fuzzy matching)
    for (const expected of pending.expectedResponses) {
      const allKeywords = [expected.keyword, ...expected.aliases];

      for (const word of words) {
        // Exact match
        if (allKeywords.includes(word)) {
          console.log(`✅ [v12.33] FOLLOWUP_DETECTED: Exact match "${word}" → ${expected.resolution}`);
          return {
            isFollowUp: true,
            resolution: expected.resolution,
            context: pending.cachedContext,
            pending
          };
        }

        // Fuzzy match with Levenshtein distance
        const maxDistance = word.length <= 4 ? 1 : 2; // Shorter words = stricter matching
        if (this.fuzzyContainsKeyword(word, allKeywords, maxDistance)) {
          console.log(`✅ [v12.33] FOLLOWUP_DETECTED: Fuzzy match "${word}" → ${expected.resolution}`);
          return {
            isFollowUp: true,
            resolution: expected.resolution,
            context: pending.cachedContext,
            pending
          };
        }
      }
    }

    // 5. No match found
    console.log(`🔍 [v12.33] FOLLOWUP_CHECK: No match for "${message}" in expected responses`);
    return { isFollowUp: false };
  }

  /**
   * v12.33: Handle depth control - prevent endless follow-up loops
   *
   * @param pending - Current pending disambiguation state
   * @param config - Follow-up configuration
   * @returns Whether to proceed or close with message
   */
  private handleWithDepthControl(
    pending: PendingDisambiguation | null,
    config: FollowUpConfig = DEFAULT_FOLLOWUP_CONFIG
  ): { proceed: boolean; closingResponse?: string } {
    if (!pending) {
      return { proceed: true };
    }

    const currentDepth = pending.followUpCount || 0;

    // Check if this intent category gets exceptional depth
    const maxAllowed = config.exceptionalIntents.includes(pending.intentCategory)
      ? config.exceptionalMaxDepth
      : config.maxDepth;

    if (currentDepth >= maxAllowed) {
      console.log(`🛑 [v12.33] MAX_DEPTH_REACHED: depth=${currentDepth}, max=${maxAllowed}, category=${pending.intentCategory}`);
      return {
        proceed: false,
        closingResponse: config.closingMessage.tr // TODO: detect language
      };
    }

    return { proceed: true };
  }

  /**
   * v12.33: Resolve disambiguation with cached context
   * Generates the final answer based on user's follow-up response
   *
   * @param resolution - Resolution key (e.g., 'beyanname', 'odeme')
   * @param pending - Pending disambiguation state
   * @param conversationId - Conversation ID
   * @returns Final response with content and sources
   */
  private async resolveDisambiguation(
    resolution: string,
    pending: PendingDisambiguation,
    conversationId: string
  ): Promise<{ content: string; sources: any[] }> {
    // v12.34: Defensive null checks
    if (!pending || !pending.cachedContext) {
      console.error(`❌ [v12.34] RESOLVE_ERROR: Invalid pending disambiguation state`);
      return {
        content: 'Önceki sorgu bağlamı bulunamadı. Lütfen sorunuzu yeniden sorun.',
        sources: []
      };
    }

    // Get pre-computed answer from disambiguation responses
    const responseConfig = DEADLINE_DISAMBIGUATION_RESPONSES[resolution];

    if (!responseConfig || !responseConfig.answer) {
      // Fallback: couldn't find pre-computed answer
      console.warn(`⚠️ [v12.33] RESOLUTION_NOT_FOUND: ${resolution}`);
      return {
        content: 'Belirtilen seçenek için yanıt bulunamadı. Lütfen sorunuzu yeniden ifade edin.',
        sources: pending.cachedContext?.searchResults || []
      };
    }

    const { day, article, lawCode } = responseConfig.answer;

    // v12.34: Re-order sources to prioritize Kanun/Mevzuat over Sirküler
    // This ensures the citation points to the authoritative source
    let searchResults = [...(pending.cachedContext.searchResults || [])];
    const articleNum = article.replace('m.', '');

    // Find Kanun/Mevzuat source that contains the target article
    const kanunSourceIndex = searchResults.findIndex((source: any) => {
      const sourceTable = (source.source_table || source.table_name || '').toLowerCase();
      const content = (source.content || source.excerpt || source.title || '').toLowerCase();
      const isKanun = sourceTable.includes('kanun') || sourceTable.includes('mevzuat');
      const hasArticle = content.includes(`madde ${articleNum}`) || content.includes(`m.${articleNum}`) || content.includes(`m. ${articleNum}`);
      return isKanun && hasArticle;
    });

    // If Kanun source found and not already at top, move it to top
    if (kanunSourceIndex > 0) {
      const kanunSource = searchResults[kanunSourceIndex];
      searchResults.splice(kanunSourceIndex, 1);
      searchResults.unshift(kanunSource);
      console.log(`🔄 [v12.34] SOURCE_REORDER: Moved Kanun source to Top-1 (was at index ${kanunSourceIndex})`);
    }

    // Find citation index - should now be 1 if Kanun source was moved
    let citationIndex = 1;

    for (let i = 0; i < searchResults.length; i++) {
      const source = searchResults[i];
      const content = (source.content || source.excerpt || source.title || '').toLowerCase();
      const sourceName = (source.source_name || source.title || '').toLowerCase();

      if (content.includes(`madde ${articleNum}`) || sourceName.includes(`madde ${articleNum}`) ||
          content.includes(article) || content.includes(`m. ${articleNum}`)) {
        citationIndex = i + 1;
        break;
      }
    }

    // Generate response
    const dayWord = day === 24 ? 'yirmidördüncü' : 'yirmialtıncı';
    const suffix = this.getSuffix(day);

    let content: string;
    if (resolution === 'beyanname') {
      content = `KDV beyannamesi, vergilendirme dönemini takip eden ayın ${day}'${suffix} (${dayWord} günü) akşamına kadar ilgili vergi dairesine verilmelidir (${lawCode} ${article}) [${citationIndex}].`;
    } else if (resolution === 'odeme') {
      content = `KDV ödemesi, takip eden ayın ${day}'${suffix} (${dayWord} günü) akşamına kadar yapılmalıdır (${lawCode} ${article}) [${citationIndex}].`;
    } else {
      content = `${resolution} için son tarih: takip eden ayın ${day}'${suffix} (${lawCode} ${article}) [${citationIndex}].`;
    }

    // Clear disambiguation state - conversation resolved
    await this.clearPendingDisambiguation(conversationId);

    console.log(`✅ [v12.33] DISAMBIGUATION_RESOLVED: ${resolution} → day=${day}, article=${article}`);

    return {
      content,
      sources: searchResults.slice(0, 3) // Return top 3 sources
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v12.31: QUERY NORMALIZATION & FUZZY MATCHING LAYER
  // Systematic tolerance for typos, ASCII variants, and malformed queries
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Turkish character to ASCII mapping
   */
  private readonly TURKISH_CHAR_MAP: Record<string, string> = {
    'ö': 'o', 'ü': 'u', 'ı': 'i', 'ş': 's', 'ç': 'c', 'ğ': 'g',
    'Ö': 'o', 'Ü': 'u', 'İ': 'i', 'Ş': 's', 'Ç': 'c', 'Ğ': 'g'
  };

  /**
   * Common typo patterns for intent keywords
   * Maps typo → correct word
   */
  private readonly COMMON_TYPO_CORRECTIONS: Record<string, string> = {
    // "hangi" typos
    'nagi': 'hangi', 'nagı': 'hangi', 'hngi': 'hangi', 'hangı': 'hangi',
    'hagi': 'hangi', 'hagı': 'hangi', 'angi': 'hangi', 'angı': 'hangi',
    // "gün" typos
    'gn': 'gun', 'gün': 'gun', 'güm': 'gun', 'gum': 'gun',
    // "kaçına" typos
    'kacna': 'kacina', 'kaçna': 'kacina', 'kcina': 'kacina', 'kacına': 'kacina',
    // "ödeme" typos
    'odme': 'odeme', 'ödme': 'odeme', 'oedme': 'odeme',
    // "beyanname" typos
    'beyanne': 'beyanname', 'beyaname': 'beyanname', 'byeanname': 'beyanname'
  };

  /**
   * v12.31: Normalize query for intent detection
   * - Lowercase
   * - Turkish → ASCII
   * - Common typo corrections
   */
  private normalizeQueryForIntent(query: string): string {
    let normalized = query.toLowerCase();

    // Step 1: Turkish character normalization
    for (const [tr, ascii] of Object.entries(this.TURKISH_CHAR_MAP)) {
      normalized = normalized.replace(new RegExp(tr, 'g'), ascii);
    }

    // Step 2: Apply common typo corrections
    const words = normalized.split(/\s+/);
    const correctedWords = words.map(word => {
      // Check exact typo match
      if (this.COMMON_TYPO_CORRECTIONS[word]) {
        return this.COMMON_TYPO_CORRECTIONS[word];
      }
      return word;
    });

    return correctedWords.join(' ');
  }

  /**
   * v12.31: Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * v12.31: Check if query contains keyword with fuzzy tolerance
   * @param query - Normalized query
   * @param keywords - Array of keywords to match
   * @param maxDistance - Maximum edit distance allowed (default: 2)
   */
  private fuzzyContainsKeyword(query: string, keywords: string[], maxDistance: number = 2): boolean {
    const words = query.split(/\s+/);

    for (const word of words) {
      for (const keyword of keywords) {
        // For short keywords (<=3 chars), require exact match or 1 edit
        const allowedDistance = keyword.length <= 3 ? 1 : maxDistance;

        if (this.levenshteinDistance(word, keyword) <= allowedDistance) {
          return true;
        }

        // Also check if word contains keyword as substring (for compound words)
        if (word.length > keyword.length && word.includes(keyword)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * v12.31: Robust deadline keyword detection with typo tolerance
   * Returns true if query likely asks about a deadline/timing
   */
  private hasDeadlineKeywordRobust(query: string): boolean {
    // Normalize query first
    const normalizedQuery = this.normalizeQueryForIntent(query);

    // Core deadline keywords (ASCII normalized)
    const deadlineKeywords = [
      'kacina', 'kadar', 'zaman', 'sure', 'tarih', 'gun', 'deadline', 'teslim'
    ];

    // Time-related question words
    const questionWords = ['hangi', 'ne', 'kac', 'kacinci'];

    // Check for exact/fuzzy deadline keywords
    if (this.fuzzyContainsKeyword(normalizedQuery, deadlineKeywords, 2)) {
      console.log(`🔍 [v12.31] ROBUST_DEADLINE: Matched deadline keyword in "${normalizedQuery}"`);
      return true;
    }

    // Check for question word + "gun" pattern (e.g., "hangi gun", "nagi gun")
    const hasQuestionWord = this.fuzzyContainsKeyword(normalizedQuery, questionWords, 2);
    const hasGunVariant = /g[uü]n|gn|gum|güm/i.test(normalizedQuery);

    if (hasQuestionWord && hasGunVariant) {
      console.log(`🔍 [v12.31] ROBUST_DEADLINE: Matched question+gun pattern in "${normalizedQuery}"`);
      return true;
    }

    // Fallback: Original exact patterns
    const exactPatterns = [
      'kaçına kadar', 'kacina kadar',
      'ne zamana kadar', 'ne zaman',
      'süre', 'sure',
      'son tarih', 'son gün', 'son gun',
      'hangi gün', 'hangi gun',
      'hangi tarihe kadar', 'hangi tarih',
      'kaçıncı gün', 'kacinci gun'
    ];

    const queryLower = query.toLowerCase();
    if (exactPatterns.some(kw => queryLower.includes(kw))) {
      return true;
    }

    return false;
  }

  /**
   * v12.31: Robust ödeme keyword detection with typo tolerance
   */
  private hasOdemeKeywordRobust(query: string): boolean {
    const normalizedQuery = this.normalizeQueryForIntent(query);

    const odemeKeywords = [
      'odeme', 'odenir', 'odemesi', 'odemesini', 'odenmesi', 'oden',
      'yatirilir', 'yatirma', 'yatirilma', 'yatir',
      'odeyeceg', 'odeye', 'odeniyor', 'odenmekte'
    ];

    return this.fuzzyContainsKeyword(normalizedQuery, odemeKeywords, 2);
  }

  /**
   * v12.31: Robust beyanname keyword detection with typo tolerance
   */
  private hasBeyanKeywordRobust(query: string): boolean {
    const normalizedQuery = this.normalizeQueryForIntent(query);

    const beyanKeywords = [
      'beyanname', 'beyan', 'bildirim', 'verilir', 'verilme'
    ];

    return this.fuzzyContainsKeyword(normalizedQuery, beyanKeywords, 2);
  }

  /**
   * 📋 Load RAG Routing Schema from settings
   * Caches schema for 1 minute to avoid DB hits on every request
   */
  private async loadRoutingSchema(): Promise<RAGRoutingSchema> {
    const now = Date.now();
    if (now - this.routingSchemaLoadedAt < this.SCHEMA_CACHE_TTL) {
      return this.routingSchema;
    }

    try {
      const result = await this.pool.query(
        "SELECT value FROM settings WHERE key = 'ragRoutingSchema'"
      );

      if (result.rows[0]?.value) {
        const parsed = typeof result.rows[0].value === 'string'
          ? JSON.parse(result.rows[0].value)
          : result.rows[0].value;
        this.routingSchema = getRAGRoutingSchema(parsed);
        console.log(`📋 Routing schema loaded from DB (v${this.routingSchema.version})`);
      } else {
        this.routingSchema = DEFAULT_RAG_ROUTING_SCHEMA;
        console.log(`📋 Using default routing schema (v${this.routingSchema.version})`);
      }

      this.routingSchemaLoadedAt = now;
      return this.routingSchema;
    } catch (error) {
      console.error('Failed to load routing schema:', error);
      return DEFAULT_RAG_ROUTING_SCHEMA;
    }
  }

  /**
   * Build article format prompt for FOUND responses
   * SCHEMA-DRIVEN: All format rules come from database (formatTemplate)
   * NO HARDCODED FORMAT RULES
   *
   * @param schema - RAG routing schema with format.formatTemplate
   * @param language - 'tr' or 'en'
   * @param articleLength - Target character count from settings (default 2000)
   */
  private buildArticleFormatPrompt(
    schema: RAGRoutingSchema,
    language: string = 'tr',
    articleLength: number = 2000
  ): string {
    const foundFormat = schema.routes.FOUND.format;
    const groundingRules = foundFormat.groundingRules || {};
    const minLength = Math.floor(articleLength * 0.8);

    if (language === 'tr') {
      const groundingRulesText = groundingRules.tr || `
1. Only cite laws/articles explicitly mentioned in sources. Do not fabricate article numbers.
2. For "am I required", "can I" questions: If no explicit provision in sources, state "No explicit regulation found in sources".
3. Use definitive statements ("required", "prohibited", "allowed") ONLY if explicitly stated in sources.
4. When uncertain, use hedged language: "According to sources..." or "may be considered as..."`;

      const formatTemplate = foundFormat.formatTemplate ||
        foundFormat.formatTemplateEn ||
        'Write structured response with ## headings, blank lines between paragraphs, and [1][2] citations after each statement.';

      const prompt = `🚨 CRITICAL: FOLLOW THIS OUTPUT FORMAT EXACTLY

${formatTemplate}

---

YOUR ROLE: RAG response generator
YOUR ONLY JOB: Generate text from sources below, add citations [1], [2], [3]

GROUNDING RULES:
${groundingRulesText}

INLINE CITATION RULES:
- Add source number IMMEDIATELY after each statement: "...tax rate is 18% [1]."
- Multiple sources for same info: "...is accepted [1][3]."
- Use footnote format [1], [2] in text
- Keep source order (do not reorder sources)

LENGTH:
- TARGET: ${articleLength} chars
- MINIMUM: ${minLength} chars

PROHIBITED:
- Do NOT write "This is out of scope" or "No sources found" (backend handles this)
- Do NOT write meta headers like "TOPIC:", "ASSESSMENT:", "KEYWORDS:" (use ## for content headings)
- Do NOT do scope checking (you are a RAG generator, not a classifier)
- Do NOT provide information outside sources
- Do NOT fabricate law/article numbers not in sources
- Do NOT write classification labels (NEEDS_CLARIFICATION/OUT_OF_SCOPE/NOT_FOUND/FOUND)
`;
      return prompt;
    } else {
      const groundingRulesText = groundingRules.en || `
1. Only cite laws/articles explicitly mentioned in sources. Do not fabricate article numbers.
2. For "must I", "can I" questions: If no explicit provision in sources, state "No clear regulation found in sources".
3. Use definitive statements ("required", "prohibited", "allowed") ONLY if explicitly stated in sources.
4. When uncertain, use hedged language: "According to sources..." or "may be considered as..."`;

      const formatTemplate = foundFormat.formatTemplateEn ||
        foundFormat.formatTemplate ||
        'Write structured response with ## headings, blank lines between paragraphs, and [1][2] citations after each statement.';

      const prompt = `🚨 CRITICAL: FOLLOW THIS OUTPUT FORMAT EXACTLY

${formatTemplate}

---

YOUR ROLE: RAG response generator
YOUR ONLY JOB: Generate text from sources below, add citations [1], [2], [3]

GROUNDING RULES:
${groundingRulesText}

INLINE CITATION RULES:
- Add source number IMMEDIATELY after each statement: "...tax rate is 18% [1]."
- Multiple sources for same info: "...is accepted [1][3]."
- Use footnote format [1], [2] in text
- Keep source order (do not reorder sources)

LENGTH:
- TARGET: ${articleLength} chars
- MINIMUM: ${minLength} chars

PROHIBITED:
- Do NOT write "This is out of scope" or "No sources found" (backend handles this)
- Do NOT write meta headers like "TOPIC:", "ASSESSMENT:", "KEYWORDS:" (use ## for content headings)
- Do NOT do scope checking (you are a RAG generator, not a classifier)
- Do NOT provide information outside sources
- Do NOT fabricate law/article numbers not in sources
- Do NOT write classification labels (NEEDS_CLARIFICATION/OUT_OF_SCOPE/NOT_FOUND/FOUND)
`;
      return prompt;
    }
  }

  /**
   * 🔧 DOMAIN CONFIG LOADER
   * Loads topic entities and key terms from active schema's llm_config
   * NO HARDCODED DEFAULTS - each instance imports their own domain config JSON
   *
   * Domain configs available at: docs/domain-configs/
   * - vergilex-domain-config.json (Vergi/Hukuk)
   * - bookie-domain-config.json (Muhasebe)
   * - geolex-domain-config.json (Emlak/İmar)
   */
  private async getDomainConfig(): Promise<{
    topicEntities: TopicEntity[];
    keyTerms: string[];
    authorityLevels: Record<string, number>;
    sanitizerConfig?: SanitizerConfig;
    lawCodes?: string[];
    lawCodeConfig?: {
      lawCodes?: Record<string, string[]>;
      lawNumberToCode?: Record<string, string>;
      lawNameToCode?: Record<string, string>;
      lawCodePatterns?: Array<{ pattern: string; code: string }>;
    };
  }> {
    try {
      const config = await dataSchemaService.loadConfig();
      const activeSchema = config.schemas.find(s => s.id === config.activeSchemaId);
      const llmConfig = activeSchema?.llmConfig as any;

      // Get topic entities from Schema llmConfig (domain-specific)
      const topicEntities = llmConfig?.topicEntities || [];

      // Get key terms from Schema llmConfig (domain-specific)
      const keyTerms = llmConfig?.keyTerms || [];

      // Get sanitizer config from Schema llmConfig (domain-specific)
      const sanitizerConfig = llmConfig?.sanitizerConfig as SanitizerConfig | undefined;

      // Get FULL law code config from Schema llmConfig.lawCodeConfig (for v12.16 citation fix)
      const lawCodeConfig = llmConfig?.lawCodeConfig as {
        lawCodes?: Record<string, string[]>;
        lawNumberToCode?: Record<string, string>;
        lawNameToCode?: Record<string, string>;
        lawCodePatterns?: Array<{ pattern: string; code: string }>;
      } | undefined;
      const lawCodes = lawCodeConfig?.lawCodes ? Object.keys(lawCodeConfig.lawCodes) : undefined;

      // Get authority levels from RAG Settings (NOT from schema - single source of truth)
      // This uses ragSettings.sourceTypeHierarchy which is configured via UI
      const hierarchyRaw = await settingsService.getSetting('ragSettings.sourceTypeHierarchy');
      let authorityLevels: Record<string, number> = {};

      if (hierarchyRaw) {
        try {
          const hierarchy = typeof hierarchyRaw === 'string' ? JSON.parse(hierarchyRaw) : hierarchyRaw;
          // Convert sourceTypeHierarchy format to authorityLevels format
          for (const [key, value] of Object.entries(hierarchy)) {
            if (typeof value === 'object' && value !== null && 'weight' in value) {
              authorityLevels[key] = (value as any).weight;
            }
          }
        } catch (e) {
          console.warn('[DOMAIN_CONFIG] Failed to parse sourceTypeHierarchy:', e);
        }
      }

      if (topicEntities.length === 0 && keyTerms.length === 0) {
        console.log(`⚠️ [DOMAIN_CONFIG] No domain config in DB!`);
        console.log(`   Import a domain config JSON via Settings > Schema > JSON Import`);
      } else {
        const sanitizerStatus = sanitizerConfig?.enabled ? 'enabled' : 'disabled/default';
        const lawCodeStatus = lawCodes ? lawCodes.join(', ') : 'not configured';
        console.log(`📋 [DOMAIN_CONFIG] Loaded: ${topicEntities.length} entities, ${keyTerms.length} terms, ${Object.keys(authorityLevels).length} authority levels, sanitizer=${sanitizerStatus}, lawCodes=[${lawCodeStatus}]`);
      }

      return { topicEntities, keyTerms, authorityLevels, sanitizerConfig, lawCodes, lawCodeConfig };
    } catch (error) {
      console.error('[DOMAIN_CONFIG] Failed to load config:', error);
      return { topicEntities: [], keyTerms: [], authorityLevels: {} };
    }
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

    // ═══════════════════════════════════════════════════════════════
    // ARTICLE QUERY ISOLATION: Prevent mixing different law articles
    // If current asks about KDVK 29 and previous was VUK 114, DON'T combine
    // ═══════════════════════════════════════════════════════════════
    const articlePattern = /\b(VUK|GVK|KVK|KDVK|ÖTVK|MTV|DVK|HMK|SGK|İYUK|AATUHK)\s*(?:madde\s*)?\.?\s*(\d+)/gi;
    const currentArticles = Array.from(currentMessage.matchAll(articlePattern)).map(m => `${m[1].toUpperCase()}_${m[2]}`);
    const previousArticles = Array.from(lastUserQuestion.matchAll(articlePattern)).map(m => `${m[1].toUpperCase()}_${m[2]}`);

    if (currentArticles.length > 0 && previousArticles.length > 0) {
      // Both have article references - check if they're different
      const hasDifferentArticle = currentArticles.some(curr => !previousArticles.includes(curr));
      if (hasDifferentArticle) {
        console.log(`🎯 ARTICLE ISOLATION: Current=[${currentArticles.join(', ')}] vs Previous=[${previousArticles.join(', ')}] - NOT a follow-up`);
        return { isFollowUp: false, enhancedQuery: currentMessage, contextInfo: '' };
      }
    }

    // If current question has article reference but previous didn't, not a follow-up
    if (currentArticles.length > 0 && previousArticles.length === 0) {
      console.log(`🎯 ARTICLE ISOLATION: Current has article ref [${currentArticles.join(', ')}], previous didn't - NOT a follow-up`);
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
   * 🏷️ Extract keywords from sources for display at end of response
   * Extracts meaningful terms from source titles and content
   */
  private extractKeywordsFromSources(sources: any[], userQuery: string): string[] {
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
      'listele', 'göster', 'anlat', 'açıkla', 'söyle', 'bilgi', 'ver',
      'sayı', 'madde', 'kanun', 'yasa', 'fıkra', 'bent', 'tarih', 'sayılı',
      'uyarınca', 'gereğince', 'kapsamında', 'çerçevesinde', 'bakımından'
    ]);

    // Legal/tax term patterns to prioritize (Turkish)
    const legalTermPatterns = [
      /\b(kdv|ötv|mtv|gelir\s*vergisi|kurumlar\s*vergisi|stopaj|tevkifat)\b/gi,
      /\b(muafiyet|istisna|indirim|matrah|beyanname|tebliğ|yönetmelik)\b/gi,
      /\b(mükellef|vergi\s*dairesi|maliye|hazine|gümrük)\b/gi,
      /\b(fatura|e-fatura|e-defter|ba-bs|tahakkuk|tahsilat)\b/gi,
      /\b(damga\s*vergisi|emlak\s*vergisi|veraset|harç)\b/gi,
      /\b(serbest\s*meslek|ücret|kira|gayrimenkul|menkul)\b/gi
    ];

    const allKeywords: string[] = [];
    const keywordCounts = new Map<string, number>();

    // Process each source
    for (const source of sources.slice(0, 5)) { // Limit to top 5 sources
      const textToProcess = [
        source.title || '',
        source.excerpt || '',
        (source.content || '').substring(0, 500) // First 500 chars of content
      ].join(' ').toLowerCase();

      // Extract legal terms first (high priority)
      for (const pattern of legalTermPatterns) {
        const matches = textToProcess.match(pattern);
        if (matches) {
          for (const match of matches) {
            const normalized = match.toLowerCase().trim();
            keywordCounts.set(normalized, (keywordCounts.get(normalized) || 0) + 2); // Higher weight
          }
        }
      }

      // Extract other meaningful words
      const words = textToProcess
        .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));

      for (const word of words) {
        keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
      }
    }

    // Also extract from user query for relevance
    const queryWords = userQuery
      .toLowerCase()
      .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    for (const word of queryWords) {
      if (keywordCounts.has(word)) {
        keywordCounts.set(word, (keywordCounts.get(word) || 0) + 3); // Boost query terms
      }
    }

    // Sort by count and get top keywords
    const sortedKeywords = [...keywordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8) // Max 8 keywords
      .map(([keyword]) => keyword);

    return sortedKeywords;
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
   * Process a message with PDF content + optional RAG search
   * Hybrid mode: PDF content analysis + relevant RAG sources
   */
  private async processPdfMessage(
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
      'ragSettings.pdfMaxLength',
      'ragSettings.pdfEnableRag',
      'ragSettings.pdfRagMaxResults'
    ];

    const settingsResult = await pool.query(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [settingsKeys]
    );

    const settingsMap = new Map(settingsResult.rows.map(r => [r.key, r.value]));

    const responseLanguage = settingsMap.get('response_language') || 'tr';
    // NOTE: Claude 3.5 Sonnet RETIRED by Anthropic Oct 28, 2025 - use Claude Sonnet 4.5
    const activeModel = settingsMap.get('llmSettings.activeChatModel') || 'anthropic/claude-sonnet-4-5-20250929';

    // PDF + RAG hybrid mode settings
    const enableRagWithPdf = settingsMap.get('ragSettings.pdfEnableRag') === 'true';
    const pdfRagMaxResults = parseInt(settingsMap.get('ragSettings.pdfRagMaxResults') || '5');

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
    const defaultInstructionTr = `Kullanicinin yuklediği bir belgeyi inceliyorsun.

📄 **BELGE ANALİZİ**
Önce şu başlıkla belgeyi tanıt:
"Bu belge bir [BELGE TÜRÜ] belgesidir."

Ardından belgenin önemli noktalarını listele:
- Taraflar (varsa)
- Tarihler
- Tutarlar/Değerler
- Önemli koşullar

Son olarak kullanıcının sorusunu belge içeriğine dayanarak yanıtla.`;

    const defaultInstructionEn = `You are analyzing a document the user has uploaded.

📄 **DOCUMENT ANALYSIS**
First introduce the document with:
"This document is a [DOCUMENT TYPE]."

Then list the important points:
- Parties involved (if any)
- Dates
- Amounts/Values
- Key conditions

Finally, answer the user's question based on the document content.`;

    // Hybrid mode instructions
    const defaultHybridInstructionTr = `Kullanicinin yuklediği bir belgeyi ve ilgili hukuki kaynaklari birlikte inceliyorsun.

📄 **BELGE ANALİZİ**
Önce şu başlıkla belgeyi tanıt:
"Bu belge bir [BELGE TÜRÜ] belgesidir."

Belgeden önemli bilgileri çıkar:
- Taraflar
- Tarihler
- Tutarlar/Değerler
- Önemli koşullar ve maddeler

⚖️ **HUKUKİ DEĞERLENDİRME**
Veritabanından gelen ilgili hukuki kaynakları değerlendirerek:
- Bu tür belgelerde dikkat edilmesi gereken hususları belirt
- Varsa riskli veya eksik maddeleri işaretle
- Kullanıcının sorusunu hem belge hem de hukuki kaynaklar ışığında yanıtla`;

    const defaultHybridInstructionEn = `You are analyzing a document uploaded by the user along with relevant legal sources.

📄 **DOCUMENT ANALYSIS**
First introduce the document with:
"This document is a [DOCUMENT TYPE]."

Extract important information:
- Parties involved
- Dates
- Amounts/Values
- Key terms and conditions

⚖️ **LEGAL EVALUATION**
Using the relevant legal sources from database:
- Point out what to watch for in this type of document
- Flag any risky or missing clauses
- Answer the user's question considering both the document and legal sources`;

    let ragSources: any[] = [];
    let ragContext = '';

    // 🔗 HYBRID MODE: Search RAG database if enabled
    if (enableRagWithPdf) {
      console.log(`[PDF+RAG] Hybrid mode enabled, searching RAG with max ${pdfRagMaxResults} results`);

      try {
        // Extract key terms from PDF for better RAG search
        const pdfKeyTerms = this.extractKeyTermsFromPdf(pdfText, pdfContext.filename);
        const searchQuery = `${message} ${pdfKeyTerms}`.trim();

        console.log(`[PDF+RAG] Search query: "${searchQuery.substring(0, 100)}..."`);

        // Search unified embeddings
        const searchResults = await this.searchUnifiedEmbeddings(searchQuery, pdfRagMaxResults);

        if (searchResults && searchResults.length > 0) {
          ragSources = searchResults.map((r: any) => ({
            id: r.id || r.source_id,
            title: r.title || r.source_title || 'Kaynak',
            excerpt: r.content?.substring(0, 300) || r.text?.substring(0, 300) || '',
            relevanceScore: r.similarity || r.score || 0,
            sourceTable: r.source_table || r.table_name || 'unified_embeddings',
            category: r.category || r.source_type || 'Hukuki Kaynak'
          }));

          // Build RAG context
          const ragLabel = responseLanguage === 'en' ? 'RELATED LEGAL SOURCES' : 'ILGILI HUKUKI KAYNAKLAR';
          ragContext = `\n\n--- ${ragLabel} ---\n`;
          ragSources.forEach((source, idx) => {
            ragContext += `\n[${idx + 1}] ${source.title} (${source.category})\n${source.excerpt}\n`;
          });
          ragContext += `--- KAYNAKLAR SONU ---\n`;

          console.log(`[PDF+RAG] Found ${ragSources.length} relevant sources`);
        }
      } catch (ragError) {
        console.warn('[PDF+RAG] RAG search failed, continuing with PDF only:', ragError);
      }
    }

    // Select instruction based on mode
    const pdfInstruction = enableRagWithPdf && ragSources.length > 0
      ? (responseLanguage === 'en' ? defaultHybridInstructionEn : defaultHybridInstructionTr)
      : (responseLanguage === 'en'
        ? (settingsMap.get('ragSettings.pdfInstructionEn') || defaultInstructionEn)
        : (settingsMap.get('ragSettings.pdfInstructionTr') || defaultInstructionTr));

    const userPrompt = `${pdfInstruction}

--- ${pdfLabel}: ${pdfContext.filename} ---
${pdfText}
--- BELGE SONU ---${ragContext}

${questionLabel}: ${message}`;

    console.log(`[PDF Mode] Sending ${pdfText.length} chars from PDF + ${ragSources.length} RAG sources to LLM`);

    // Extract provider from model
    const providerFromModel = llmManager.extractProviderFromModel(activeModel);

    // Generate response
    const response = await llmManager.generateChatResponse(
      userPrompt,
      {
        temperature: options.temperature,
        maxTokens: options.maxTokens || 6000, // Increased for Wikipedia-style long articles
        systemPrompt: systemPrompt,
        preferredProvider: providerFromModel
      }
    );

    // Save message to conversation
    try {
      await this.saveMessage(conversationId, 'user', message, { pdfFilename: pdfContext.filename });
      await this.saveMessage(conversationId, 'assistant', response.content, {
        model: activeModel,
        pdfFilename: pdfContext.filename,
        ragSourceCount: ragSources.length
      });
    } catch (saveError) {
      console.error('[PDF Mode] Failed to save messages:', saveError);
    }

    console.log(`[PDF Mode] Response generated for: ${pdfContext.filename} (hybrid: ${enableRagWithPdf})`);

    return {
      response: response.content,
      sources: ragSources, // Include RAG sources in hybrid mode
      conversationId: conversationId,
      pdfMode: true,
      pdfFilename: pdfContext.filename,
      hybridMode: enableRagWithPdf && ragSources.length > 0
    };
  }

  /**
   * Extract key terms from PDF for better RAG search
   */
  private extractKeyTermsFromPdf(pdfText: string, filename: string): string {
    // Extract document type hints from filename
    const filenameHints: string[] = [];
    const lowerFilename = filename.toLowerCase();

    if (lowerFilename.includes('kira') || lowerFilename.includes('kiralama')) {
      filenameHints.push('kira sözleşmesi kiralama');
    }
    if (lowerFilename.includes('tapu') || lowerFilename.includes('gayrimenkul')) {
      filenameHints.push('tapu gayrimenkul mülkiyet');
    }
    if (lowerFilename.includes('sozlesme') || lowerFilename.includes('sözleşme')) {
      filenameHints.push('sözleşme anlaşma');
    }
    if (lowerFilename.includes('noter')) {
      filenameHints.push('noter tasdik');
    }

    // Extract key terms from content (first 2000 chars)
    const contentSample = pdfText.substring(0, 2000).toLowerCase();
    const legalTerms = [
      'kira', 'tapu', 'sözleşme', 'gayrimenkul', 'mülkiyet', 'kiracı', 'kiraya veren',
      'teminat', 'depozito', 'noter', 'taşınmaz', 'ipotek', 'haciz', 'kat mülkiyeti',
      'konut', 'işyeri', 'arsa', 'bina', 'daire', 'tahliye', 'fesih', 'devir'
    ];

    const foundTerms = legalTerms.filter(term => contentSample.includes(term));

    return [...filenameHints, ...foundTerms].join(' ');
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
    // ⏱️ PERFORMANCE TIMING
    const timings: Record<string, number> = {};
    const startTotal = Date.now();

    // 📋 Load domain config (topic entities and key terms) from active schema
    // This is loaded once at the start and reused throughout the method
    const domainConfig = await this.getDomainConfig();

    // 📋 Load RAG routing schema (cached for 1 minute)
    const routingSchema = await this.loadRoutingSchema();

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

      // ═══════════════════════════════════════════════════════════════════════════
      // v12.33: FOLLOW-UP DETECTION - Check if this is a disambiguation response
      // v12.34: Added try-catch for graceful error handling (P0 crash fix)
      // This MUST run BEFORE normal RAG flow to intercept follow-up messages
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        const followUpCheck = await this.detectFollowUp(message, convId);

        if (followUpCheck.isFollowUp && followUpCheck.resolution && followUpCheck.pending) {
          console.log(`🔄 [v12.33] FOLLOW_UP_DETECTED: Resolving "${message}" → ${followUpCheck.resolution}`);

          // Check depth control
          const depthCheck = this.handleWithDepthControl(followUpCheck.pending);

          if (!depthCheck.proceed) {
            // Max depth reached - return closing message
            console.log(`🛑 [v12.33] FOLLOW_UP_CLOSED: Max depth reached, returning closing message`);

            // Analytics: Log max depth reached
            await this.logActivity(userId, 'follow_up_max_depth', {
              conversationId: convId,
              originalQuery: followUpCheck.pending.originalQuery,
              lastQuery: message,
              depth: followUpCheck.pending.followUpCount,
              intentCategory: followUpCheck.pending.intentCategory
            });

            // Clear disambiguation state
            await this.clearPendingDisambiguation(convId);

            return {
              conversationId: convId,
              content: depthCheck.closingResponse || DEFAULT_FOLLOWUP_CONFIG.closingMessage.tr,
              sources: [],
              responseType: 'CLOSING' as const,
              timings: { total: Date.now() - startTotal }
            };
          }

          // Resolve disambiguation with cached context
          const resolved = await this.resolveDisambiguation(
            followUpCheck.resolution,
            followUpCheck.pending,
            convId
          );

          // Analytics: Log successful follow-up resolution
          await this.logActivity(userId, 'follow_up_resolved', {
            conversationId: convId,
            originalQuery: followUpCheck.pending.originalQuery,
            followUpQuery: message,
            resolution: followUpCheck.resolution,
            depth: followUpCheck.pending.followUpCount,
            intentCategory: followUpCheck.pending.intentCategory
          });

          return {
            conversationId: convId,
            content: resolved.content,
            sources: resolved.sources,
            responseType: 'FOUND' as const,
            timings: { total: Date.now() - startTotal }
          };
        }
      } catch (followUpError) {
        // v12.34: Graceful fallback - if follow-up detection fails, continue with normal RAG flow
        console.error(`❌ [v12.34] FOLLOW_UP_ERROR: ${followUpError instanceof Error ? followUpError.message : followUpError}`);
        console.log(`🔄 [v12.34] FOLLOW_UP_FALLBACK: Continuing with normal RAG flow`);
        // Clear any corrupted disambiguation state
        await this.clearPendingDisambiguation(convId).catch(() => {});
      }
      // ═══════════════════════════════════════════════════════════════════════════

      // Get system prompt from database or use default
      let systemPrompt = options.systemPrompt || await this.getSystemPrompt();
      console.log(` System Prompt loaded (length: ${systemPrompt?.length || 0} chars)`);

      // PDF MODE: If user uploaded a PDF, process with optional RAG hybrid mode
      // Hybrid mode can be enabled via ragSettings.pdfEnableRag = 'true'
      const hasPdfContext = options.pdfContext && options.pdfContext.extractedText;

      if (hasPdfContext) {
        console.log(`[PDF Mode] User uploaded PDF: ${options.pdfContext.filename}`);
        return this.processPdfMessage(message, convId, userId, systemPrompt, options);
      }

      // NO PDF: Remove PDF-related instructions from system prompt
      // This prevents the AI from mentioning PDF when no PDF was uploaded
      if (!hasPdfContext && systemPrompt) {
        // Remove PDF KURALI section and any PDF-related instructions
        systemPrompt = systemPrompt
          .replace(/🔴\s*PDF\s*KURALI:.*?(?=\n\n|\n\*\*|$)/gis, '')
          .replace(/PDF yükle[^.]*\./gi, '')
          .replace(/Eğer kullanıcı PDF yüklemişse[^.]*\./gi, '')
          .replace(/PDF yüklenmemişse bu kuralı atla\.?/gi, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        console.log(`[NO PDF] Removed PDF instructions from system prompt`);
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

      // ⏱️ Settings fetch timing
      const startSettings = Date.now();

      // PERFORMANCE OPTIMIZATION: Batch fetch all settings in ONE query
      // ALL RAG configuration is loaded from database - no hardcoded values
      const settingsKeys = [
        // Core settings
        'ragSettings.maxResults', 'maxResults',
        'ragSettings.minResults', 'minResults',
        'ragSettings.minSourcesToShow', 'ragSettings.maxSourcesToShow',  // Source display limits
        'parallel_llm_batch_size',
        'enable_parallel_llm',
        'parallel_llm_count',
        'ragSettings.similarityThreshold', 'similarityThreshold', 'semantic_search_threshold',
        'ragSettings.lowConfidenceThreshold', 'lowConfidenceThreshold', 'databaseconfidence',
        'ragSettings.highConfidenceThreshold',
        'response_language',
        'llmSettings.activeChatModel',
        // Evidence Gate settings (for quality control)
        'ragSettings.evidenceGateEnabled',
        'ragSettings.evidenceGateMinScore',
        'ragSettings.evidenceGateMinChunks',
        'ragSettings.evidenceGateRefusalTr',
        'ragSettings.evidenceGateRefusalEn',
        // Refusal policy settings
        'ragSettings.refusalPolicy.clearSourcesOnRefusal',
        'ragSettings.refusalPolicy.cleanResponseTextOnRefusal',
        'ragSettings.refusalPolicy.patterns',
        // Prompt templates (fully configurable)
        'ragSettings.strictModePromptTr',
        'ragSettings.strictModePromptEn',
        'ragSettings.fastModePromptTr',
        'ragSettings.fastModePromptEn',
        'ragSettings.followUpInstructionTr',
        'ragSettings.followUpInstructionEn',
        // Legacy keys (for backwards compatibility)
        'ragSettings.strictModeInstructionTr',
        'ragSettings.strictModeInstructionEn',
        'ragSettings.fastModeInstructionTr',
        'ragSettings.fastModeInstructionEn',
        'ragSettings.citationInstructionTr',
        'ragSettings.citationInstructionEn',
        // Messages
        'ragSettings.noResultsMessageTr',
        'ragSettings.noResultsMessageEn',
        // Mode toggles
        'ragSettings.disableCitationText',
        'ragSettings.strictMode',
        'ragSettings.strictModeTemperature',
        'ragSettings.strictModeLevel',
        // Level-specific prompts
        'ragSettings.mediumModePromptTr',
        'ragSettings.mediumModePromptEn',
        // JSON configurations
        'ragSettings.sourceTypeNormalizations',
        'ragSettings.preferredSourceTypes',
        'ragSettings.tocDetection',
        // Source type priority (dynamic ordering)
        'ragSettings.sourceTypePriority',
        'ragSettings.sourceTypePriorityEnabled',
        'ragSettings.htmlCleaningPatterns',
        'ragSettings.quotePrefixPatterns',
        'ragSettings.genericTitlePatterns',
        'ragSettings.sectionHeadingsToStrip',
        'ragSettings.fieldLabels',
        'ragSettings.citationPriorityFields',
        'ragSettings.strictContextTemplate',
        // Numeric limits
        'ragSettings.maxContextLength',
        'ragSettings.maxExcerptLength',
        'ragSettings.summaryMaxLength',
        'ragSettings.excerptMaxLength'
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
      // NOTE: Claude 3.5 Sonnet RETIRED by Anthropic Oct 28, 2025 - use Claude Sonnet 4.5
    const activeModel = settingsMap.get('llmSettings.activeChatModel') || 'anthropic/claude-sonnet-4-5-20250929';
      const lowConfidenceThreshold = parseFloat(
        settingsMap.get('ragSettings.lowConfidenceThreshold') ||
        settingsMap.get('lowConfidenceThreshold') ||
        settingsMap.get('databaseconfidence') ||
        '0.5'
      );

      // Check if citations are disabled
      const citationsDisabled = maxResults === 0 && minResults === 0;
      timings.settings = Date.now() - startSettings;
      console.log(`⏱️ RAG Settings: maxResults=${maxResults}, minResults=${minResults}, citationsDisabled=${citationsDisabled} [${timings.settings}ms]`);

      // ⏱️ History fetch timing
      const startHistory = Date.now();
      let earlyHistory: { role: string; content: string }[] = [];
      try {
        earlyHistory = await this.getConversationHistory(convId, 5);
      } catch (histError) {
        console.warn('Could not fetch early history:', histError);
      }
      timings.history = Date.now() - startHistory;

      let searchResults: any[] = [];
      let allResults: any[] = [];
      let initialDisplayCount = 0;

      // 🧹 QUERY SANITIZATION: Clean query before retrieval
      // Removes numbering ("6)"), meta-instructions ("(CEVAP+ALINTI formatında)"), etc.
      const sanitizeResult = this.sanitizeSearchQuery(message);
      let searchQuery = sanitizeResult.sanitized;

      // 🔗 FOLLOW-UP QUESTION DETECTION (moved outside to be available in all modes)
      const followUpResult = this.detectFollowUpQuestion(message, earlyHistory);
      if (followUpResult.isFollowUp) {
        searchQuery = followUpResult.enhancedQuery;
        console.log(`🔗 Follow-up detected, enhanced query: "${searchQuery.substring(0, 60)}..."`);
      }

      // 📝 QUERY REWRITING: Expand short queries with domain synsets
      // Example: "6111" → "6111 vergi yapılandırma VUK 5 vergi levhası"
      const rewriteResult = this.rewriteQuery(searchQuery);
      if (rewriteResult.expanded && rewriteResult.rewritten !== searchQuery) {
        searchQuery = rewriteResult.rewritten;
      }

      // ========================================
      // 🚪 EARLY EXIT GUARDS (BEFORE retrieval/LLM)
      // ========================================
      // These guards prevent unnecessary retrieval and LLM calls for queries
      // that we can deterministically handle with template responses.
      // This is CRITICAL for:
      // - Strong ambiguity: "6111", "ne?", "KDV" → NEEDS_CLARIFICATION immediately
      // - Out-of-scope: "Einstein kimdir?", "Hava durumu" → OUT_OF_SCOPE immediately
      //
      // WHY HERE? Before semantic search to prevent:
      // 1. Irrelevant docs being retrieved for out-of-scope queries
      // 2. LLM hallucinating on ambiguous queries
      // 3. Wasted compute on queries we can handle deterministically

      const earlyQueryLower = message.toLowerCase().trim();
      const earlyWordCount = earlyQueryLower.split(/\s+/).filter(w => w.length > 2).length;

      // --- EARLY AMBIGUITY CHECK ---
      const earlyAmbiguityCheck = {
        justNumbers: /^\d+$/.test(message.trim()) || /^(\d+\s*\/\s*\d+)$/.test(message.trim()),
        vagueQuestion: /^(ne|nasıl|nedir|neden|kim)\s*\??$/i.test(message.trim()),
        tooShortNoQuestion: earlyWordCount < 2 && !message.includes('?'),
        singleToken: message.trim().split(/\s+/).length === 1 && !/\?$/.test(message.trim())
      };
      const isEarlyAmbiguous = Object.values(earlyAmbiguityCheck).some(v => v);

      // --- EARLY OUT-OF-SCOPE CHECK ---
      // Domain terms from config (vergi, KDV, beyanname, etc.)
      const earlyDomainTerms = [
        ...domainConfig.keyTerms.map(t => t.toLowerCase()),
        // Fallback tax terms if config is empty
        ...(domainConfig.keyTerms.length === 0 ? [
          'vergi', 'kdv', 'beyanname', 'mükellef', 'fatura', 'matrah', 'stopaj',
          'tevkifat', 'muafiyet', 'istisna', 'kanun', 'madde', 'tebliğ', 'özelge',
          'levha', 'vuk', 'gvk', 'kvk', 'damga', 'ötv', 'emlak'
        ] : [])
      ];
      const hasDomainTerm = earlyDomainTerms.some(term => earlyQueryLower.includes(term));

      // Domain mode: TAX_ONLY (default) vs GENERAL_LAW
      // TAX_ONLY: Only tax-related queries (VUK, GVK, KVK, KDV, etc.)
      // GENERAL_LAW: All laws including TMK, Borçlar, TCK, etc.
      const domainMode = settingsMap.get('ragSettings.domainMode') || 'TAX_ONLY';

      // Non-tax law patterns (for TAX_ONLY mode)
      // These are valid laws but NOT tax-related - should be OUT_OF_SCOPE in TAX_ONLY mode
      // NOTE: Turkish suffixes handled with optional ['\u2019]?\w* pattern
      const NON_TAX_LAW_PATTERNS = [
        /medeni\s*kanun/i,                     // Türk Medeni Kanunu (with Turkish suffixes)
        /\btmk['\u2019]?\w*/i,                 // TMK, TMK'da, TMK'nın etc.
        /borçlar\s*kanun/i,                    // Türk Borçlar Kanunu
        /\btbk['\u2019]?\w*/i,                 // TBK, TBK'da, TBK'nın etc.
        /ceza\s*kanun/i,                       // Türk Ceza Kanunu
        /\btck['\u2019]?\w*/i,                 // TCK, TCK'da, TCK'nın etc.
        /ticaret\s*kanun/i,                    // Türk Ticaret Kanunu (except tax provisions)
        /\bttk['\u2019]?\w*/i,                 // TTK, TTK'da, TTK'nın etc.
        /\biş\s*kanun/i,                       // İş Kanunu
        /miras\s*(payı|hukuk|bırakan)/i,       // Inheritance law (Medeni Kanun)
        /\b(velayet|nafaka|boşanma)\b/i,       // Family law (Medeni Kanun)
        /kira\s*(artış|sözleşme|bedeli)/i,     // Lease law (Borçlar Kanunu)
        /\b(tahliye|kiracı\s*hakk)/i,          // Tenant rights (Borçlar Kanunu)
        /\b(tazminat\s*davas|haksız\s*fiil)/i, // Tort law (Borçlar Kanunu)
      ];
      const isNonTaxLaw = NON_TAX_LAW_PATTERNS.some(p => p.test(message));

      // Non-tax patterns (clearly out of domain - always OUT_OF_SCOPE)
      const OUT_OF_SCOPE_PATTERNS = [
        /\b(einstein|newton|shakespeare|picasso)\b/i,  // Famous people
        /\b(hava\s+durumu|weather)\b/i,                // Weather
        /\b(futbol|basketbol|spor|maç)\b/i,            // Sports
        /\b(yemek\s+tarifi|recipe)\b/i,                // Recipes
        /\b(film|dizi|sinema|movie)\b/i,               // Entertainment
        /^(merhaba|selam|hello|hi|hey)\s*\?*$/i,       // Greetings
        /\b(astroloji|burç|horoscope)\b/i,             // Astrology
      ];

      // OUT_OF_SCOPE if:
      // 1. No domain term AND matches out-of-scope pattern, OR
      // 2. TAX_ONLY mode AND matches non-tax law pattern
      const isEarlyOutOfScope = (
        (!hasDomainTerm && OUT_OF_SCOPE_PATTERNS.some(p => p.test(message))) ||
        (domainMode === 'TAX_ONLY' && isNonTaxLaw)
      );

      if (isNonTaxLaw && domainMode === 'TAX_ONLY') {
        console.log(`🚪 EARLY EXIT: OUT_OF_SCOPE (non-tax law detected in TAX_ONLY mode)`);
      }

      // --- EARLY EXIT: NEEDS_CLARIFICATION ---
      if (isEarlyAmbiguous) {
        const ambiguityReason = Object.entries(earlyAmbiguityCheck)
          .filter(([_, v]) => v)
          .map(([k]) => k)
          .join(', ');

        console.log(`🚪 EARLY EXIT: NEEDS_CLARIFICATION (${ambiguityReason}) - skipping retrieval/LLM`);

        // Save messages
        await this.saveMessage(convId, 'user', message);
        const clarificationResult = this.generateClarificationResponse(message, responseLanguage);
        await this.saveMessage(convId, 'assistant', clarificationResult.text, [], activeModel);

        return {
          response: clarificationResult.text,
          sources: [],  // NO SOURCES for NEEDS_CLARIFICATION
          relatedTopics: [],
          followUpQuestions: [],
          suggestedQuestions: clarificationResult.suggestions,  // Clickable suggestion cards
          conversationId: convId,
          provider: 'system',
          model: 'deterministic',
          providerDisplayName: 'Sistem',
          language: responseLanguage,
          fallbackUsed: false,
          fastMode: false,
          strictMode: false,
          _debug: {
            responseType: 'NEEDS_CLARIFICATION',
            earlyExit: true,
            earlyExitReason: ambiguityReason,
            queryInScope: hasDomainTerm,
            resultsCount: 0,
            sourcesCount: 0,
            deterministic: true,
            suggestions: clarificationResult.suggestions
          }
        };
      }

      // --- EARLY EXIT: OUT_OF_SCOPE ---
      if (isEarlyOutOfScope) {
        console.log(`🚪 EARLY EXIT: OUT_OF_SCOPE - skipping retrieval/LLM`);

        // Save messages
        await this.saveMessage(convId, 'user', message);
        const outOfScopeResponse = responseLanguage === 'tr'
          ? 'Bu soru Vergilex kapsamı dışındadır. Türk vergi mevzuatı ile ilgili sorularınızda yardımcı olabilirim.'
          : 'This question is outside Vergilex scope. I can help with questions about Turkish tax legislation.';
        await this.saveMessage(convId, 'assistant', outOfScopeResponse, [], activeModel);

        return {
          response: outOfScopeResponse,
          sources: [],  // NO SOURCES for OUT_OF_SCOPE
          relatedTopics: [],
          followUpQuestions: [],
          conversationId: convId,
          provider: 'system',
          model: 'deterministic',
          providerDisplayName: 'Sistem',
          language: responseLanguage,
          fallbackUsed: false,
          fastMode: false,
          strictMode: false,
          _debug: {
            responseType: 'OUT_OF_SCOPE',
            earlyExit: true,
            earlyExitReason: 'no_domain_term_plus_out_of_scope_pattern',
            queryInScope: false,
            resultsCount: 0,
            sourcesCount: 0,
            deterministic: true
          }
        };
      }

      console.log(`✅ EARLY EXIT CHECK PASSED: hasDomainTerm=${hasDomainTerm}, isAmbiguous=${isEarlyAmbiguous}, isOutOfScope=${isEarlyOutOfScope}`);

      // 🔍 Always perform semantic search (even when citations disabled)
      const searchMaxResults = citationsDisabled ? 5 : maxResults;
      if (citationsDisabled) {
        console.log(`🔍 SILENT SEARCH: Citations disabled, searching with ${searchMaxResults} results`);
      }

      // ⏱️ Semantic search timing
      const startSearch = Date.now();
      if (useUnifiedEmbeddings) {
        allResults = await semanticSearch.unifiedSemanticSearch(searchQuery, searchMaxResults);
      } else {
        allResults = await semanticSearch.hybridSearch(searchQuery, searchMaxResults);
      }
      timings.search = Date.now() - startSearch;

      // 🎯 Article Query: Get article anchoring metadata from search
      // Used to show warnings when target article not found in database
      const articleQuery = semanticSearch.getLastArticleQuery();
      if (articleQuery?.detected) {
        console.log(`[RAG] 🎯 Article query detected: ${articleQuery.law_code} Madde ${articleQuery.article_number}, exact_match=${articleQuery.exact_match_found}`);
      }

      // 🎯 KEYWORD BOOST: Boost results with exact query term matches
      // This helps surface relevant özelge/tebliğ when embedding similarity is close
      const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      // Use keyTerms from DB domain config (no hardcoding)
      const highValueTerms = domainConfig.keyTerms.length > 0
        ? domainConfig.keyTerms.map(t => t.toLowerCase())
        : []; // Empty if not configured in DB
      const queryHighValueTerms = queryTerms.filter(t => highValueTerms.some(hv => t.includes(hv)));

      allResults = allResults.map(result => {
        let keywordBoost = 0;
        const title = (result.title || '').toLowerCase();
        const content = (result.content || result.text || result.excerpt || '').toLowerCase();
        const sourceType = (result.source_type || result.metadata?.source_type || '').toLowerCase();

        // Boost for each high-value query term found in title (strongest signal)
        for (const term of queryHighValueTerms) {
          if (title.includes(term)) keywordBoost += 15; // Title match = +15%
        }

        // Boost for each query term found in content
        for (const term of queryTerms) {
          if (content.includes(term)) keywordBoost += 3; // Content match = +3%
        }

        // Extra boost for özelge sources when query contains official-document terms
        if (sourceType.includes('ozelge') && queryHighValueTerms.length > 0) {
          keywordBoost += 10; // özelge relevance boost
        }

        // Apply boost to score
        const originalScore = result.score || (result.similarity_score * 100) || 0;
        const boostedScore = Math.min(originalScore + keywordBoost, 100);

        if (keywordBoost > 0) {
          console.log(`🎯 KEYWORD_BOOST: "${title.substring(0, 40)}..." +${keywordBoost}% (${originalScore.toFixed(1)} -> ${boostedScore.toFixed(1)})`);
        }

        return {
          ...result,
          score: boostedScore,
          _keywordBoost: keywordBoost
        };
      });

      // 🎯 P0: INTENT-BASED ARTICLE BOOST
      // Detect deadline intent and boost relevant articles (m.41 for beyanname, m.46 for ödeme)
      const deadlineIntent = this.detectDeadlineIntent(searchQuery);
      if (deadlineIntent) {
        const intentArticles: Record<string, string[]> = {
          'beyanname': ['madde 41', 'm.41', 'm. 41', 'madde41'],
          'odeme': ['madde 46', 'm.46', 'm. 46', 'madde46']
        };
        const targetArticles = intentArticles[deadlineIntent] || [];

        allResults = allResults.map(result => {
          const title = (result.title || '').toLowerCase();
          const content = (result.content || result.text || result.excerpt || '').toLowerCase();
          const currentScore = result.score || 0;

          // Check if result contains the target article
          const hasTargetArticle = targetArticles.some(art =>
            title.includes(art) || content.includes(art)
          );

          if (hasTargetArticle) {
            const intentBoost = 25; // Strong boost for intent-matched articles
            const newScore = Math.min(currentScore + intentBoost, 100);
            console.log(`🎯 INTENT_BOOST (${deadlineIntent}): "${title.substring(0, 40)}..." +${intentBoost}% (${currentScore.toFixed(1)} -> ${newScore.toFixed(1)})`);
            return {
              ...result,
              score: newScore,
              _intentBoost: intentBoost,
              _intentMatched: deadlineIntent
            };
          }

          return result;
        });

        // Re-sort after intent boost
        allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
        console.log(`🎯 INTENT_BOOST: Applied ${deadlineIntent} boost, top result now: "${(allResults[0]?.title || '').substring(0, 50)}..."`);
      }

      // 🛡️ P0: WRONG ARTICLE PREVENTION
      // If user asked for a specific article (e.g., "KDVK m.46") but exact match not found,
      // demote results that contain DIFFERENT article numbers from the same law
      if (articleQuery?.detected && !articleQuery.exact_match_found) {
        const targetLaw = (articleQuery.law_code || '').toLowerCase();
        const targetArticle = articleQuery.article_number;

        console.log(`🛡️ WRONG_ARTICLE_PREVENTION: Target=${targetLaw} m.${targetArticle}, exact_match=false`);

        allResults = allResults.map(result => {
          const title = (result.title || '').toLowerCase();
          const content = (result.content || result.text || result.excerpt || '').toLowerCase();
          const combined = title + ' ' + content;

          // Check if this result mentions the same law but different article
          const lawPatterns: Record<string, RegExp> = {
            'kdvk': /kdvk|katma\s*değer/i,
            'vuk': /vuk|vergi\s*usul/i,
            'gvk': /gvk|gelir\s*vergisi/i,
            'kvk': /kvk|kurumlar\s*vergisi/i
          };

          const lawPattern = lawPatterns[targetLaw];
          if (!lawPattern) return result; // Unknown law, don't filter

          const mentionsTargetLaw = lawPattern.test(combined);
          if (!mentionsTargetLaw) return result; // Different law, keep as-is

          // Extract article numbers from this result
          const articleMatches = combined.match(/madde\s*(\d+)|m\.?\s*(\d+)/gi) || [];
          const mentionedArticles = articleMatches.map(m => {
            const num = m.match(/\d+/);
            return num ? parseInt(num[0]) : 0;
          }).filter(n => n > 0);

          // If result mentions different article from same law, demote it heavily
          const hasWrongArticle = mentionedArticles.length > 0 &&
                                   !mentionedArticles.includes(targetArticle);

          if (hasWrongArticle) {
            const penalty = -30; // Heavy penalty for wrong article
            const currentScore = result.score || 0;
            const newScore = Math.max(currentScore + penalty, 0);
            console.log(`🛡️ WRONG_ARTICLE_PENALTY: "${title.substring(0, 40)}..." has m.${mentionedArticles.join(',')} instead of m.${targetArticle}, ${penalty}%`);
            return {
              ...result,
              score: newScore,
              _wrongArticlePenalty: penalty
            };
          }

          return result;
        });

        // Re-sort after penalty
        allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      // Sort by similarity score with optional source type priority
      const sourceTypePriorityEnabled = settingsMap.get('ragSettings.sourceTypePriorityEnabled') !== 'false';
      let sourceTypePriority: string[] = [];
      if (sourceTypePriorityEnabled) {
        const priorityRaw = settingsMap.get('ragSettings.sourceTypePriority');
        if (priorityRaw) {
          try {
            sourceTypePriority = JSON.parse(priorityRaw);
          } catch (e) {
            // Default priority if parse fails
            sourceTypePriority = ['ozelge', 'kanun', 'teblig', 'sorucevap', 'danistay', 'makale', 'document'];
          }
        } else {
          sourceTypePriority = ['ozelge', 'kanun', 'teblig', 'sorucevap', 'danistay', 'makale', 'document'];
        }
      }

      searchResults = allResults.sort((a, b) => {
        const scoreA = a.score || (a.similarity_score * 100) || 0;
        const scoreB = b.score || (b.similarity_score * 100) || 0;

        // Primary sort: by score (descending)
        const scoreDiff = scoreB - scoreA;

        // If scores are within 5% tolerance and source type priority is enabled,
        // use source type as secondary sort
        if (sourceTypePriorityEnabled && Math.abs(scoreDiff) < 5) {
          const typeA = (a.source_type || a.metadata?.source_type || '').toLowerCase();
          const typeB = (b.source_type || b.metadata?.source_type || '').toLowerCase();

          // Get priority index (lower = higher priority, -1 means not in list = lowest priority)
          const getPriority = (type: string): number => {
            for (let i = 0; i < sourceTypePriority.length; i++) {
              if (type.includes(sourceTypePriority[i])) return i;
            }
            return sourceTypePriority.length; // Lowest priority if not found
          };

          const priorityA = getPriority(typeA);
          const priorityB = getPriority(typeB);

          // If priorities differ, sort by priority
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
        }

        return scoreDiff;
      });

      initialDisplayCount = Math.min(minResults, searchResults.length);
      console.log(`⏱️ Search: ${searchResults.length} results in ${timings.search}ms, displaying ${initialDisplayCount}`);

      // 📊 METRIC: AC-D - Source Type Distribution for this request
      const sourceTypeDistribution: Record<string, number> = {};
      searchResults.forEach(r => {
        const rawType = (r.source_type || r.sourceTable || r.category || r.metadata?.source_type || 'unknown').toLowerCase();
        const type = rawType.replace(/^csv_/, '').replace(/_/g, '');
        sourceTypeDistribution[type] = (sourceTypeDistribution[type] || 0) + 1;
      });
      const topSourceTypes = searchResults.slice(0, 5).map(r => ({
        type: (r.source_type || r.sourceTable || r.category || r.metadata?.source_type || 'unknown').toLowerCase().replace(/^csv_/, '').replace(/_/g, ''),
        score: ((r.final_score || r.score || 0) * 100).toFixed(1) + '%'
      }));
      console.log(`📊 [METRIC] SOURCE_TYPE_COUNTS: distribution=${JSON.stringify(sourceTypeDistribution)}, topN=${JSON.stringify(topSourceTypes)}`);

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
      // 📝 NOTE: maxExcerptLength increased from 250 to 600 for better source detail extraction
      const maxContextLength = parseInt(settingsMap.get('ragSettings.maxContextLength') || '8000');
      const maxExcerptLength = parseInt(settingsMap.get('ragSettings.maxExcerptLength') || '600');

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
      // NOTE: Python returns final_score and similarity_score in 0-100 range, normalize to 0-1
      const rawBestScore = searchResults.length > 0
        ? (searchResults[0].final_score || searchResults[0].score || searchResults[0].similarity_score || 0)
        : 0;
      const bestScore = rawBestScore > 1 ? rawBestScore / 100 : rawBestScore; // Normalize to 0-1

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
      // Skip this when citations disabled - let LLM answer with search context
      if (hasNoResults && !citationsDisabled) {
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

      // ========================================
      // EVIDENCE GATE: Quality control for search results
      // ========================================
      // Prevents showing irrelevant citations when top results don't meet quality threshold
      // If gate fails: Return clean refusal WITHOUT any sources (no misleading citations)
      const evidenceGateEnabled = settingsMap.get('ragSettings.evidenceGateEnabled') !== 'false'; // Default: true
      const evidenceGateMinScore = parseFloat(settingsMap.get('ragSettings.evidenceGateMinScore') || '0.55');
      const evidenceGateMinChunks = parseInt(settingsMap.get('ragSettings.evidenceGateMinChunks') || '2');

      // Check if results pass the evidence gate
      // NOTE: Python returns final_score/similarity_score in 0-100 range
      const qualityChunks = searchResults.filter(r => {
        // Use final_score (preferred) or similarity_score - both are 0-100 from Python
        const rawScore = r.final_score || r.score || r.similarity_score || 0;
        // Normalize to 0-1 range for comparison with evidenceGateMinScore
        const normalizedScore = rawScore > 1 ? rawScore / 100 : rawScore;
        return normalizedScore >= evidenceGateMinScore;
      });

      const passesEvidenceGate = qualityChunks.length >= evidenceGateMinChunks;

      // Debug: Show actual scores being evaluated
      const scoreDebug = searchResults.slice(0, 3).map(r => {
        const raw = r.final_score || r.score || r.similarity_score || 0;
        const normalized = raw > 1 ? raw / 100 : raw;
        return `${(normalized * 100).toFixed(1)}%`;
      });
      console.log(`🚪 EVIDENCE GATE: enabled=${evidenceGateEnabled}, minScore=${(evidenceGateMinScore * 100).toFixed(0)}%, minChunks=${evidenceGateMinChunks}`);
      console.log(`   Top3 scores: [${scoreDebug.join(', ')}], qualityPassing: ${qualityChunks.length}/${searchResults.length}, gate=${passesEvidenceGate ? 'PASS' : 'FAIL'}`);

      // If evidence gate is enabled and fails, return clean refusal
      if (evidenceGateEnabled && !passesEvidenceGate && !citationsDisabled) {
        const refusalTr = settingsMap.get('ragSettings.evidenceGateRefusalTr') ||
          'Bu konuda yeterince güvenilir kaynak bulunamadı. Sorunuzu farklı anahtar kelimelerle veya daha spesifik şekilde sormayı deneyin.';
        const refusalEn = settingsMap.get('ragSettings.evidenceGateRefusalEn') ||
          'No sufficiently relevant sources found for this topic. Please try rephrasing your question or using different keywords.';

        const refusalMessage = responseLanguage === 'en' ? refusalEn : refusalTr;

        console.log(`🚫 EVIDENCE GATE REFUSAL: ${qualityChunks.length} quality chunks < ${evidenceGateMinChunks} required`);
        const topScores = searchResults.slice(0, 3).map(r => {
          const raw = r.final_score || r.score || r.similarity_score || 0;
          return (raw > 1 ? raw : raw * 100).toFixed(1) + '%';
        });
        console.log(`   Top scores: ${topScores.join(', ')}`);

        // 📊 SOURCE TYPE BREAKDOWN for debugging
        const sourceTypeCounts: Record<string, number> = {};
        searchResults.forEach(r => {
          const rawType = (r.source_type || r.sourceTable || r.category || r.metadata?.source_type || 'unknown').toLowerCase();
          const type = rawType.replace(/^csv_/, '').replace(/_/g, '');
          sourceTypeCounts[type] = (sourceTypeCounts[type] || 0) + 1;
        });
        console.log(`   📊 Source types: ${JSON.stringify(sourceTypeCounts)}`);

        // 🎯 TOPIC ENTITIES for debugging (using domain config)
        const topicEntitiesForLog = this.extractTopicEntities(message, domainConfig.topicEntities);
        console.log(`   🎯 Topic entities: [${topicEntitiesForLog.slice(0, 5).join(', ')}]`);

        return {
          response: refusalMessage,
          sources: [],  // CRITICAL: No sources when gate fails
          relatedTopics: [],
          conversationId: convId,
          provider: 'system',
          model: 'evidence-gate',
          providerDisplayName: 'System',
          language: options.language || 'tr',
          fallbackUsed: false,
          originalModel: activeModel || 'none',
          actualProvider: 'system',
          lowConfidence: true,
          refusalReason: 'INSUFFICIENT_EVIDENCE'
        };
      }
      // ========================================

      // CASE 2 & 3: Has results (either high confidence or partial match)
      // Let LLM generate response, but add instruction for partial matches

      // Generate user message with context (NOT including system prompt - it goes separately)
      // NOTE: PDF mode is handled separately by processPdfMessage() at the start of processMessage()
      const contextLabel = responseLanguage === 'en' ? 'CONTEXT INFORMATION' : 'BAĞLAM BİLGİLERİ';
      const questionLabel = responseLanguage === 'en' ? 'QUESTION' : 'SORU';

      let userPrompt: string;

      // Check if citation text should be disabled (sources shown but no [1], [2] in response)
      const disableCitationText = settingsMap.get('ragSettings.disableCitationText') === 'true';

      // Check if strict RAG mode is enabled (for legal/accurate responses)
      // DEFAULT: true - Legal platforms require source-faithful responses by default
      // NOTE: strictMode takes priority over citationsDisabled/disableCitationText
      const strictRagMode = settingsMap.get('ragSettings.strictMode') !== 'false';

      // 🎯 NON-DETERMINISM FIX: Override temperature for strict mode
      // Lower temperature = more consistent/deterministic responses
      // Default: 0.4 for strict mode (balanced between accuracy and fluency)
      // NOTE: 0 was too low for Wikipedia-style long articles - increased to 0.4
      if (strictRagMode) {
        const strictModeTemp = parseFloat(settingsMap.get('ragSettings.strictModeTemperature') || '0.4');
        if (options.temperature === undefined || options.temperature > strictModeTemp) {
          console.log(`🎯 STRICT MODE: Overriding temperature ${options.temperature ?? 'undefined'} → ${strictModeTemp} for deterministic responses`);
          options.temperature = strictModeTemp;
        }
      }

      console.log(`🔍 RAG MODE CHECK: strictRagMode=${strictRagMode}, citationsDisabled=${citationsDisabled}, disableCitationText=${disableCitationText}, temperature=${options.temperature}`);

      // ⚡ FAST MODE: Only when strict mode is OFF and citations are disabled
      if (!strictRagMode && (citationsDisabled || disableCitationText)) {
        console.log(`⚡ FAST MODE: citationsDisabled=${citationsDisabled}, disableCitationText=${disableCitationText}`);

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
      } else if (strictRagMode) {
        // ========================================
        // STRICT RAG MODE - Source-faithful responses
        // ========================================
        // Supports multiple strictness levels: strict/medium/relaxed
        // - strict: Requires exact verdict sentence (mümkündür, uygundur, etc.) - high refusal
        // - medium: Requires citation but accepts any conclusive statement - balanced
        // - relaxed: Requires citation, more flexible interpretation - low refusal

        const strictModeLevel = settingsMap.get('ragSettings.strictModeLevel') || 'medium'; // Default to medium for better recall
        console.log(`✅ STRICT MODE ACTIVE - Level: ${strictModeLevel.toUpperCase()}`);

        // 📋 Use article format from routing schema (akademik makale format)
        // Article length comes from user settings (ragSettings.summaryMaxLength)
        const useArticleFormat = routingSchema.routes.FOUND.format.articleSections &&
                                 routingSchema.routes.FOUND.format.articleSections.length > 0;

        // Get article length from settings (user-configurable)
        // Increased default from 2000 to 4000 for Wikipedia-style long articles
        const articleLength = parseInt(settingsMap.get('ragSettings.summaryMaxLength') || '4000');

        // Default medium-mode prompts (better recall, still requires citation)
        // If article format is enabled, use schema-driven academic article format
        const defaultMediumPromptTr = useArticleFormat
          ? this.buildArticleFormatPrompt(routingSchema, 'tr', articleLength)
          : `Aşağıda numaralanmış kaynaklar var.

CEVAPLAMA KURALLARI:
1. SADECE kaynaklardaki bilgiyi kullan
2. Her iddiayı [Kaynak X] ile referansla
3. Kaynak metninden doğrudan alıntı yap
4. Kaynaklarda yoksa "Bu konuda kaynaklarda bilgi bulunamadı" de

FORMAT:
**CEVAP**
[Cevabın] [Kaynak X]`;

        const defaultMediumPromptEn = useArticleFormat
          ? this.buildArticleFormatPrompt(routingSchema, 'en', articleLength)
          : `Sources are numbered below.

ANSWERING RULES:
1. Use ONLY information from sources
2. Reference every claim with [Source X]
3. Quote directly from source text
4. If not in sources, say "No information found on this topic in the sources"

FORMAT:
**ANSWER**
[Your answer] [Source X]`;

        if (useArticleFormat) {
          console.log(`📋 ARTICLE FORMAT: Using ${routingSchema.routes.FOUND.format.articleSections?.length || 0}-section mini-makale format`);
        }

        // Select prompt based on strictModeLevel
        let strictInstructionTr: string;
        let strictInstructionEn: string;

        if (strictModeLevel === 'strict') {
          // Full strict mode - requires exact verdict patterns (high refusal)
          strictInstructionTr =
            settingsMap.get('ragSettings.strictModePromptTr') ||
            settingsMap.get('ragSettings.strictModeInstructionTr') ||
            'Kaynakları kullanarak kısa ve öz cevap ver. [Kaynak X] formatında referans ekle.';

          strictInstructionEn =
            settingsMap.get('ragSettings.strictModePromptEn') ||
            settingsMap.get('ragSettings.strictModeInstructionEn') ||
            'Provide a concise answer using sources. Add references in [Source X] format.';
        } else {
          // Medium or relaxed - better recall, still requires citation
          strictInstructionTr =
            settingsMap.get('ragSettings.mediumModePromptTr') ||
            defaultMediumPromptTr;

          strictInstructionEn =
            settingsMap.get('ragSettings.mediumModePromptEn') ||
            defaultMediumPromptEn;
        }

        const strictInstruction = responseLanguage === 'en' ? strictInstructionEn : strictInstructionTr;
        const isCustomPrompt = strictModeLevel === 'strict'
          ? (settingsMap.get('ragSettings.strictModePromptTr') || settingsMap.get('ragSettings.strictModeInstructionTr'))
          : settingsMap.get('ragSettings.mediumModePromptTr');
        console.log(`📋 STRICT MODE [${strictModeLevel}]: Using ${isCustomPrompt ? 'database' : 'default'} prompt (${responseLanguage})`);

        // Load context template from database or use defaults
        const contextTemplateRaw = settingsMap.get('ragSettings.strictContextTemplate');
        const contextTemplate = contextTemplateRaw ? JSON.parse(contextTemplateRaw) : {
          sourceHeader: '=== KAYNAK {n} ===',
          schemaLabel: '📋 ŞEMA:',
          typeLabel: '   Tür: {type}',
          titleLabel: '   Başlık: {title}',
          tocWarning: '   ⚠️ UYARI: Bu kaynak İÇİNDEKİLER TABLOSU - alıntı için KULLANMA!',
          contentLabel: '📝 İÇERİK:',
          sourceReminder: 'MEVCUT KAYNAKLAR: {sources}\nBu referanslardan birini MUTLAKA kullan.'
        };

        // Load source type normalizations from database
        const typeNormalizationsRaw = settingsMap.get('ragSettings.sourceTypeNormalizations');
        const typeNormalizations: Record<string, string> = typeNormalizationsRaw
          ? JSON.parse(typeNormalizationsRaw)
          : {};

        // Load quote prefix patterns from database
        const quotePrefixPatternsRaw = settingsMap.get('ragSettings.quotePrefixPatterns');
        const quotePrefixPatterns: string[] = quotePrefixPatternsRaw
          ? JSON.parse(quotePrefixPatternsRaw)
          : ['Cevap:', 'Soru:', 'Yanıt:'];

        // Build enhanced context with source numbers for strict mode
        let strictContext = '';
        const sourceCount = Math.min(initialDisplayCount, searchResults.length);

        // Track which sources are TOC (Table of Contents) vs actual content
        const tocSources: number[] = [];
        const contentSources: number[] = [];

        for (let idx = 0; idx < sourceCount; idx++) {
          const r = searchResults[idx];
          const title = r.title || 'Untitled';
          const rawSourceType = r.source_type || r.source_table || 'Unknown';
          // Normalize source type using database configuration
          const sourceType = typeNormalizations[rawSourceType.toLowerCase()] || rawSourceType;
          let content = r.excerpt || r.content || '';

          // Detect TOC using database-configured patterns
          const isTOC = this.isTableOfContents(title, content, settingsMap);

          if (isTOC) {
            tocSources.push(idx + 1);
          } else {
            contentSources.push(idx + 1);
          }

          // Clean content using database-configured patterns
          for (const prefix of quotePrefixPatterns) {
            const prefixRegex = new RegExp(`^${prefix}\\s*`, 'i');
            content = content.replace(prefixRegex, '');
          }
          // Clean HTML (always needed)
          content = content
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<\/?(p|div|span|strong|em|b|i)>/gi, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          // Build context using template
          strictContext += contextTemplate.sourceHeader.replace('{n}', String(idx + 1)) + '\n';
          strictContext += contextTemplate.schemaLabel + '\n';
          strictContext += contextTemplate.typeLabel.replace('{type}', sourceType) + '\n';
          strictContext += contextTemplate.titleLabel.replace('{title}', title) + '\n';
          if (isTOC) {
            strictContext += contextTemplate.tocWarning + '\n';
          }
          strictContext += contextTemplate.contentLabel + '\n' + content + '\n\n';
        }

        // Log TOC detection
        if (tocSources.length > 0) {
          console.log(`⚠️ TOC DETECTED: Sources ${tocSources.join(', ')} are Table of Contents entries`);
          console.log(`✅ CONTENT SOURCES: ${contentSources.join(', ') || 'None'}`);
        }

        // Build available source numbers list dynamically
        const sourceNumbers = Array.from({length: sourceCount}, (_, i) => `[Kaynak ${i + 1}]`).join(', ');

        // Build source reminder from template
        const sourceReminder = '\n\n' + contextTemplate.sourceReminder.replace('{sources}', sourceNumbers);

        userPrompt = `${strictInstruction}${sourceReminder}\n\n--- ${contextLabel} ---\n${strictContext}\n--- KAYNAKLAR SONU ---\n\n${questionLabel}: ${message}`;
        console.log('📋 STRICT RAG MODE: Using database-configured context format');
        console.log(`📝 PROMPT PREVIEW (first 300 chars): ${userPrompt.substring(0, 300).replace(/\n/g, '\\n')}`);
        } else {
          // Normal mode with natural language summary instructions - loaded from settings
          // Supports {sourceCount} and {maxLength} placeholders for dynamic values
          const defaultSummaryEn =
            `RESPONSE INSTRUCTIONS:\n` +
            `• Start your response with a SHORT introductory sentence that acknowledges the user's question (e.g., "According to the relevant law...", "Based on tax regulations...", "Under the applicable legislation...")\n` +
            `• Write a DETAILED natural language summary that synthesizes ALL {sourceCount} sources provided above\n` +
            `• DO NOT use citation markers like [1], [2], [3] - write as a cohesive narrative\n` +
            `• Aim for approximately {maxLength} characters (write LONGER if needed for completeness)\n` +
            `• MUST include:\n` +
            `  - Specific NUMBERS (rates, periods, amounts, dates)\n` +
            `  - CONDITIONS and REQUIREMENTS (when what applies)\n` +
            `  - EXCEPTIONS and EXEMPTIONS (if any)\n` +
            `  - RELEVANT LEGISLATION (law/article/regulation numbers)\n` +
            `• DO NOT skip information from sources - TRANSFER it fully\n` +
            `• Provide CONCRETE and SPECIFIC information like a tax expert\n` +
            `• NEVER add section headings or labels like "SUMMARY:" or "CONCLUSION:"\n` +
            `Provide a flowing, informative overview that addresses the question comprehensively.`;

          const defaultSummaryTr =
            `YANIT TALİMATLARI:\n` +
            `• Yanıta kullanıcının sorusunu anladığını gösteren KISA bir giriş cümlesiyle başla (örn: "İlgili kanun gereği...", "Bu konuda mevzuata göre...", "Vergi mevzuatı çerçevesinde...")\n` +
            `• Yukarıda verilen TÜM {sourceCount} kaynağı sentezleyen DETAYLI bir doğal dil özeti yaz\n` +
            `• [1], [2], [3] gibi kaynak işaretleri KULLANMA - tutarlı bir anlatım olarak yaz\n` +
            `• Yaklaşık {maxLength} karakter hedefle (bütünlük için gerekirse DAHA UZUN yaz)\n` +
            `• MUTLAKA şunları içer:\n` +
            `  - Spesifik SAYILAR (oranlar, süreler, tutarlar, tarihler)\n` +
            `  - ŞARTLAR ve KOŞULLAR (hangi durumda ne geçerli)\n` +
            `  - İSTİSNALAR ve MUAFIYETLER (varsa)\n` +
            `  - İLGİLİ MEVZUAT (kanun/madde/tebliğ numaraları)\n` +
            `• Kaynaklardaki BİLGİYİ ATLA DEĞİL, AKTAR - kısa kesme\n` +
            `• Bir vergi uzmanı gibi SOMUT ve SPESİFİK bilgi ver\n` +
            `• ASLA "ÖZET:" veya "SONUÇ:" gibi bölüm başlıkları ekleme\n` +
            `Soruyu kapsamlı bir şekilde ele alan akıcı, bilgilendirici bir genel bakış sun.`;

          // Get max summary length from settings (used in citation excerpt generation)
          // 📝 NOTE: Increased default from 800 to 1500 for more detailed responses
          const maxSummaryLength = parseInt(
            settingsMap.get('ragSettings.summaryMaxLength') || '1500'
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

      // 🛡️ v12.9: SCENARIO PROMPT INJECTION
      // For complex scenario queries (MURAT tests), inject article-format instructions
      if (this.isScenarioQuery(message)) {
        const scenarioInstruction = `

🔴 SENARYO SORUSU TESPİT EDİLDİ - AKADEMİK MAKALE FORMATI ZORUNLU:

Bu soru karmaşık bir vergisel senaryo içermektedir. Yanıtını AŞAĞIDAKİ FORMAT'ta ver:

**ÖZET:**
(2-3 cümle ile konunun özeti)

**DEĞERLENDİRME:**
(En az 3 paragraf detaylı analiz:
- İlgili mevzuat hükümleri
- Uygulama esasları
- Dikkat edilmesi gereken hususlar)

**SONUÇ:**
(Somut öneriler ve sonuç)

⚠️ ZORUNLU KURALLAR:
- Minimum 800 kelime yanıt ver
- Her bölümde kaynaklara atıf yap [1], [2], vb.
- Mevzuat maddelerini açıkça belirt
- Genel ifadelerden kaçın, somut bilgi ver
`;
        systemPrompt = systemPrompt + scenarioInstruction;
        console.log(`🛡️ [v12.9] SCENARIO_PROMPT_INJECTION: Added article format instructions (${scenarioInstruction.length} chars)`);
      }

      console.log(` System prompt length: ${systemPrompt?.length || 0} chars`);
      console.log(` Response language: ${responseLanguage}`);

      // 🔍 DEBUG v12: Log CONTEXT sent to LLM (check if "yirmidördüncü" is in sources)
      if (message.toLowerCase().includes('kaç') || message.toLowerCase().includes('beyanname')) {
        console.log(`[DEBUG-v12] ═══════════════════════════════════════════════════`);
        console.log(`[DEBUG-v12] CONTEXT SENT TO LLM (searching for date info):`);
        console.log(`[DEBUG-v12] Context contains "yirmidört": ${/yirmidört/i.test(enhancedContext)}`);
        console.log(`[DEBUG-v12] Context contains "24": ${enhancedContext.includes('24')}`);
        // Find and log the sentence containing the date
        const dateMatch = enhancedContext.match(/[^.]*(?:yirmidört|24)[^.]*/i);
        if (dateMatch) {
          console.log(`[DEBUG-v12] DATE SENTENCE IN CONTEXT: "${dateMatch[0].trim()}"`);
        } else {
          console.log(`[DEBUG-v12] ⚠️ NO DATE FOUND IN CONTEXT!`);
        }
        console.log(`[DEBUG-v12] ═══════════════════════════════════════════════════`);
      }

      // Extract provider from active model
      const providerFromModel = this.extractProviderFromModel(activeModel);
      console.log(`⏱️ Pre-LLM timings: settings=${timings.settings}ms, history=${timings.history}ms, search=${timings.search}ms`);

      // ⏱️ LLM timing
      const startLLM = Date.now();
      const response = await llmManager.generateChatResponse(
        userPrompt,  // User message with context (no system prompt here)
        {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          systemPrompt: systemPrompt,  // System prompt sent separately to LLM API
          preferredProvider: providerFromModel  // Pass normalized provider name (claude/openai/gemini/deepseek)
        }
      );
      timings.llm = Date.now() - startLLM;
      timings.total = Date.now() - startTotal;
      console.log(`⏱️ LLM response in ${timings.llm}ms | TOTAL: ${timings.total}ms (settings: ${timings.settings}, history: ${timings.history}, search: ${timings.search}, llm: ${timings.llm})`);

      // 🔍 DEBUG v12: Log RAW LLM output IMMEDIATELY
      if (message.toLowerCase().includes('kaç') || message.toLowerCase().includes('beyanname')) {
        console.log(`[DEBUG-v12] ═══════════════════════════════════════════════════`);
        console.log(`[DEBUG-v12] QUERY: "${message}"`);
        console.log(`[DEBUG-v12] RAW LLM OUTPUT (first 800 chars):`);
        console.log(`[DEBUG-v12] ${response.content.substring(0, 800)}`);
        console.log(`[DEBUG-v12] ───────────────────────────────────────────────────`);
        console.log(`[DEBUG-v12] Contains "24": ${response.content.includes('24')}`);
        console.log(`[DEBUG-v12] Contains "yirmidört": ${/yirmidört/i.test(response.content)}`);
        console.log(`[DEBUG-v12] Contains citation [1]: ${response.content.includes('[1]')}`);
        console.log(`[DEBUG-v12] ═══════════════════════════════════════════════════`);
      }

      // Clean response content - remove section headings that LLM might add despite instructions
      response.content = this.stripSectionHeadings(response.content, settingsMap);

      // 🕐 v12.8 FIX: DEADLINE INTENT HANDLER (DETERMINISTIC)
      // For deadline questions, ALWAYS replace with our extracted answer for consistency
      // Don't trust LLM - it's non-deterministic and may include wrong dates
      const postProcDeadlineIntent = this.detectDeadlineIntent(message);
      let deadlineFixApplied = false; // Track if we applied deadline fix to skip SHORT_RESPONSE
      let deadlineHardcodedApplied = false; // v12.14: Track hardcoded fallback to skip sanitizer
      console.log(`[v12.8-DEBUG] Deadline intent check: query="${message.substring(0, 50)}", intent=${postProcDeadlineIntent}`);

      // v12.15: Check for WRONG DATE verification questions FIRST
      // E.g., "KDV beyannamesi 26'sına kadar verilir mi?" → should correct to 24
      const wrongDateCheck = this.detectWrongDateVerification(message);
      if (wrongDateCheck) {
        console.log(`🛡️ [v12.15] WRONG_DATE_CORRECTION: User mentioned ${wrongDateCheck.wrongDate}, correct is ${wrongDateCheck.correctDate}`);

        const { intent, wrongDate, correctDate } = wrongDateCheck;
        const correctWord = correctDate === 24 ? 'yirmidördüncü' : correctDate === 26 ? 'yirmialtıncı' : String(correctDate);
        const article = intent === 'beyanname' ? 'KDVK madde 41' : 'KDVK madde 46';
        const subject = intent === 'beyanname' ? 'KDV beyannamesi' : 'KDV ödemesi';
        const action = intent === 'beyanname' ? 'verilir' : 'yapılır';

        response.content = `Hayır, ${subject} ayın ${wrongDate}'${this.getSuffix(wrongDate)} kadar değil, **${correctDate}'${this.getSuffix(correctDate)} (${correctWord} günü) akşamına kadar** ${action} (${article}) [1].`;

        deadlineFixApplied = true;
        deadlineHardcodedApplied = true;
      }
      // v12.15: Handle AMBIGUOUS questions by providing BOTH deadlines
      // v12.32: Fixed citation format - separate citations for each article
      else if (postProcDeadlineIntent === 'ambiguous') {
        console.log(`🛡️ [v12.15] AMBIGUOUS_HANDLER: Providing both beyanname and ödeme deadlines`);

        // v12.32: Try to find m.41 and m.46 in sources and assign correct citation numbers
        let beyanCitation = '[1]';
        let odemeCitation = '[2]';

        // Search for m.41 (beyanname) and m.46 (ödeme) in search results
        for (let i = 0; i < searchResults.length; i++) {
          const source = searchResults[i];
          const content = (source.content || source.excerpt || source.title || '').toLowerCase();
          const sourceName = (source.source_name || source.title || '').toLowerCase();

          if (content.includes('madde 41') || sourceName.includes('madde 41') ||
              content.includes('m.41') || content.includes('m. 41') ||
              (content.includes('41') && content.includes('beyanname'))) {
            beyanCitation = `[${i + 1}]`;
          }
          if (content.includes('madde 46') || sourceName.includes('madde 46') ||
              content.includes('m.46') || content.includes('m. 46') ||
              (content.includes('46') && (content.includes('ödeme') || content.includes('odeme')))) {
            odemeCitation = `[${i + 1}]`;
          }
        }

        console.log(`🔍 [v12.32] AMBIGUOUS_CITATIONS: beyan=${beyanCitation}, odeme=${odemeCitation}`);

        // v12.34: Clean disambiguation - ONLY ask the question, don't give away the answer
        // User requested: First turn should NOT show 24/26 values
        response.content = `KDV'de beyanname ve ödeme için farklı son tarihler bulunmaktadır.

**Beyanname için mi, yoksa ödeme için mi** soruyorsunuz?`;

        deadlineFixApplied = true;
        deadlineHardcodedApplied = true; // Skip sanitizer for this response

        // ═══════════════════════════════════════════════════════════════════════════
        // v12.33: Store pending disambiguation for follow-up detection
        // This enables the system to understand "beyanname" or "ödeme" as follow-ups
        // ═══════════════════════════════════════════════════════════════════════════
        const pendingDisambiguation: PendingDisambiguation = {
          originalQuery: message,
          intentCategory: 'deadline',
          intentType: null, // Will be resolved on follow-up
          expectedResponses: [
            DEADLINE_DISAMBIGUATION_RESPONSES.beyanname,
            DEADLINE_DISAMBIGUATION_RESPONSES.odeme
          ],
          cachedContext: {
            searchResults: searchResults,
            detectedIntent: 'ambiguous'
          },
          followUpCount: 1,
          createdAt: Date.now(),
          expiresAt: Date.now() + (DEFAULT_FOLLOWUP_CONFIG.ttlSeconds * 1000),
          conversationId: convId
        };

        // Store in Redis for follow-up detection
        await this.setPendingDisambiguation(convId, pendingDisambiguation);
        console.log(`🔄 [v12.33] DISAMBIGUATION_PENDING: Stored for follow-up (TTL=${DEFAULT_FOLLOWUP_CONFIG.ttlSeconds}s)`);
        // ═══════════════════════════════════════════════════════════════════════════
      }
      // Handle specific beyanname or odeme intent
      else if (postProcDeadlineIntent === 'beyanname' || postProcDeadlineIntent === 'odeme') {
        const expectedDay = postProcDeadlineIntent === 'odeme' ? 26 : 24;

        // v12.8: ALWAYS extract and apply deadline fix for deterministic responses
        // LLM is non-deterministic, so we force our answer regardless of what it returned
        const extractedDeadline = this.extractDeadlineFromSources(searchResults, postProcDeadlineIntent);
        console.log(`[v12.8-DEBUG] Expected day=${expectedDay}, extracted:`, extractedDeadline);

        if (extractedDeadline && extractedDeadline.day === expectedDay) {
          const forcedAnswer = this.generateDeadlineAnswer(extractedDeadline, postProcDeadlineIntent, responseLanguage);
          if (forcedAnswer) {
            console.log(`🛡️ DEADLINE_FORCE_FIX: Forcing deterministic response (day=${extractedDeadline.day})`);
            response.content = forcedAnswer;
            deadlineFixApplied = true;
            deadlineHardcodedApplied = true; // v12.18: Also skip sanitizer for extracted deadline (known correct value)
          }
        } else if (extractedDeadline && extractedDeadline.day !== expectedDay) {
          // v12.16 FIX: If extracted deadline doesn't match expected, use HARDCODED fallback
          // Don't trust mismatched extraction - it's likely from wrong source
          console.log(`⚠️ [v12.16] DEADLINE_MISMATCH: Expected ${expectedDay}, got ${extractedDeadline.day} - using HARDCODED fallback instead`);
          // Fall through to hardcoded fallback below
        }

        // v12.16: Use hardcoded fallback if extraction failed OR returned wrong day
        if (!deadlineFixApplied) {
          // v12.12 FIX: No deadline found in sources - use HARDCODED FALLBACK
          // This is a known, factual answer - better than LLM hallucination
          console.log(`🛡️ [v12.12] DEADLINE_HARDCODED_FALLBACK: No deadline in sources, using known correct answer`);

          const hardcodedDeadlines: Record<string, { day: number; word: string; article: string }> = {
            'beyanname': { day: 24, word: 'yirmidördüncü', article: 'KDVK m.41' },
            'odeme': { day: 26, word: 'yirmialtıncı', article: 'KDVK m.46' }
          };

          const fallback = hardcodedDeadlines[postProcDeadlineIntent];
          if (fallback) {
            const intent = this.DEADLINE_INTENTS[postProcDeadlineIntent];
            const deadlineStr = `takip eden ayın ${fallback.day}'${this.getSuffix(fallback.day)} (${fallback.word} günü) akşamına kadar`;

            // v12.15 FIX: Clear separation between article ref and citation to prevent m.41[1] → m.4[1] rendering issue
            // v12.20 FIX: Use comma separator instead of parentheses to avoid remarkGfm parsing issues
            const articleFull = fallback.article.replace('m.', 'madde '); // "KDVK m.41" → "KDVK madde 41"

            if (postProcDeadlineIntent === 'odeme') {
              response.content = `${intent.subject}, ${deadlineStr} ${intent.action}, ${articleFull}, [1].`;
            } else {
              response.content = `${intent.subject}, vergilendirme dönemini ${deadlineStr} ilgili vergi dairesine ${intent.action}, ${articleFull}, [1].`;
            }
            console.log(`🛡️ DEADLINE_HARDCODED: Forced response with day=${fallback.day} (with citation)`);
            deadlineHardcodedApplied = true; // v12.14: Flag to skip sanitizer
          }

          deadlineFixApplied = true;
        }
      }

      // Legacy fixes (still useful as fallback) - v12.19: Skip if deadline already fixed to prevent duplication
      if (!deadlineFixApplied) {
        response.content = this.fixDeadlineHeaderOnly(response.content, searchResults, message, responseLanguage);
        response.content = this.fixDateContradiction(response.content, searchResults, message, responseLanguage);
      }

      // 🎯 v12.23: VUK REGULATORY INTENT HANDLER (fatura düzenleme süresi, etc.)
      // Similar to KDV deadline handler but for VUK-specific known facts
      const vukRegulatoryIntent = this.detectVukRegulatoryIntent(message);
      if (vukRegulatoryIntent && !deadlineFixApplied) {
        const vukIntent = this.VUK_REGULATORY_INTENTS[vukRegulatoryIntent];
        if (vukIntent) {
          console.log(`🛡️ [v12.23] VUK_REGULATORY_HANDLER: Applying ${vukRegulatoryIntent} hardcoded response`);

          // Find the best VUK source for citation
          let vukSourceIndex = 1;
          const vukSourcePattern = /vuk|vergi usul|231/i;
          for (let i = 0; i < searchResults.length && i < 5; i++) {
            const src = searchResults[i];
            const srcText = `${src.title || ''} ${src.content || ''}`.toLowerCase();
            if (vukSourcePattern.test(srcText)) {
              vukSourceIndex = i + 1;
              break;
            }
          }

          // Generate the deterministic response
          response.content = `${vukIntent.answer} (${vukIntent.citation}) [${vukSourceIndex}].`;
          console.log(`🛡️ [v12.23] VUK_REGULATORY: Generated response for ${vukRegulatoryIntent}`);

          // v12.23: Skip sanitizer/claim verification for VUK regulatory (known correct values)
          deadlineHardcodedApplied = true;
          deadlineFixApplied = true;
        }
      }

      // 🛡️ P0: ARTICLE NOT FOUND RESPONSE
      // If user asked for specific article (e.g., VUK 376) but it's not in DB, give explicit response
      if (articleQuery?.detected && !articleQuery.exact_match_found && articleQuery.exact_match_count === 0) {
        const notFoundResponse = this.generateArticleNotFoundResponse(
          articleQuery.law_code,
          articleQuery.article_number,
          responseLanguage
        );
        if (notFoundResponse && response.content.length < 200) {
          console.log(`🛡️ ARTICLE_NOT_FOUND: ${articleQuery.law_code} m.${articleQuery.article_number} not in DB, using fallback response`);
          response.content = notFoundResponse;
        }
      }

      // 🛡️ v12.4: "BULUNAMADI" FILLER DETECTION
      // LLM often says "kaynaklarda bulunamadı" even when sources HAVE the content!
      // Detect this and replace with actual source content
      const fillerPatterns = [
        /kaynak(lar)?da\s+(buluna|yer\s+al)ma(dı|maktadır)/gi,
        /kanun\s+metni.*buluna?ma(dı|maktadır)/gi,
        /içeriği\s+hakkında.*bilgi\s+verilememektedir/gi,
        /spesifik\s+içeriği.*sağlanamamaktadır/gi,
        /doğrudan\s+bir\s+açıklama\s+yapmam\s+mümkün\s+değil/gi,
        /kesin\s+bilgi\s+sağlanamamaktadır/gi
      ];

      const hasFillerContent = fillerPatterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(response.content);
      });

      if (hasFillerContent && searchResults.length > 0) {
        console.log(`🛡️ FILLER_RESPONSE_FIX: Detected "bulunamadı" filler, replacing with source content`);

        // Check if this is an article query (VUK 114, KDVK 41, etc.)
        const articleMatch = message.match(/(vuk|gvk|kdvk|kvk|aatuhk)\s*(?:madde\s*)?(\d+)/i);

        let bestSource: any = null;
        let bestSourceIndex = 1;

        if (articleMatch) {
          // For article queries, find the source that actually contains this article
          const lawCode = articleMatch[1].toUpperCase();
          const articleNum = articleMatch[2];
          const result = this.findRelevantSourceForArticle(searchResults, lawCode, articleNum);
          bestSource = result.source;
          bestSourceIndex = result.index;
          console.log(`🛡️ FILLER_RESPONSE_FIX: Article query ${lawCode} ${articleNum}, found matching source at [${bestSourceIndex}]`);
        } else {
          // For non-article queries, use top source
          bestSource = searchResults[0];
          bestSourceIndex = 1;
        }

        if (bestSource) {
          const sourceContent = (bestSource.content || bestSource.excerpt || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 800);

          if (sourceContent.length > 100) {
            if (articleMatch) {
              const lawCode = articleMatch[1].toUpperCase();
              const articleNum = articleMatch[2];
              response.content = `**${lawCode} Madde ${articleNum}**\n\n${sourceContent}...\n\n[${bestSourceIndex}]`;
            } else {
              response.content = `${sourceContent}...\n\n[${bestSourceIndex}]`;
            }
            console.log(`🛡️ FILLER_RESPONSE_FIX: Replaced filler with ${response.content.length} chars from source [${bestSourceIndex}]`);
          }
        }
      }

      // 🛡️ v12.3: GENERAL HEADER-ONLY FIX
      // If response is just a title/header (like "Vergi Usul Kanunu Madde 114") with no content,
      // extract content from sources
      const contentWithoutCitations = response.content.replace(/\[\d+\]/g, '').trim();
      const isHeaderOnly = contentWithoutCitations.length < 80 &&
                           searchResults.length > 0 &&
                           message.length > 15;

      if (isHeaderOnly) {
        console.log(`🛡️ HEADER_ONLY_FIX: Response too short (${contentWithoutCitations.length} chars), extracting from sources`);

        // Check if this is an article query (VUK 114, KDVK 41, etc.)
        const headerArticleMatch = message.match(/(vuk|gvk|kdvk|kvk|aatuhk)\s*(?:madde\s*)?(\d+)/i);

        let headerBestSource: any = null;
        let headerSourceIndex = 1;

        if (headerArticleMatch) {
          // For article queries, find the source that contains this article
          const lawCode = headerArticleMatch[1].toUpperCase();
          const articleNum = headerArticleMatch[2];
          const result = this.findRelevantSourceForArticle(searchResults, lawCode, articleNum);
          headerBestSource = result.source;
          headerSourceIndex = result.index;
        } else {
          headerBestSource = searchResults[0];
        }

        if (headerBestSource) {
          const sourceContent = (headerBestSource.content || headerBestSource.excerpt || '').trim();

          // Clean up source content (remove HTML tags, excessive whitespace)
          const cleanContent = sourceContent
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .substring(0, 600);

          if (cleanContent.length > 100) {
            // Generate proper response with source content
            let enhancedResponse = '';

            if (headerArticleMatch) {
              // Article query - format nicely
              const lawCode = headerArticleMatch[1].toUpperCase();
              const articleNum = headerArticleMatch[2];
              enhancedResponse = `**${lawCode} Madde ${articleNum}**\n\n${cleanContent}...\n\n[${headerSourceIndex}]`;
            } else {
              // General query - use clean content
              enhancedResponse = `${cleanContent}...\n\n[${headerSourceIndex}]`;
            }

            response.content = enhancedResponse;
            console.log(`🛡️ HEADER_ONLY_FIX: Enhanced response to ${response.content.length} chars from source [${headerSourceIndex}]`);
          }
        }
      }

      // 🛡️ v12.3: EMPTY RESPONSE FIX
      // If response is ONLY citation markers like "[1]" with no actual content
      const citationOnlyPattern = /^\s*\[?\d+\]?\s*$/;
      if (citationOnlyPattern.test(response.content) && searchResults.length > 0) {
        console.log(`🛡️ EMPTY_RESPONSE_FIX: Response is citation-only, extracting from sources`);

        const topSource = searchResults[0];
        const sourceContent = (topSource.content || topSource.excerpt || '')
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 500);

        if (sourceContent.length > 50) {
          response.content = `${sourceContent}...\n\n[1]`;
          console.log(`🛡️ EMPTY_RESPONSE_FIX: Replaced with source content (${response.content.length} chars)`);
        }
      }

      // 🛡️ P1: MINIMUM RESPONSE LENGTH VALIDATOR
      // Ensure responses are not too short (excluding greetings and simple acknowledgments)
      // v12.7: Skip enrichment for deadline responses - they're intentionally concise
      const minResponseLength = 100; // Minimum characters for substantive responses
      const isSubstantiveQuery = message.length > 20 && !/(merhaba|selam|teşekkür|sağol)/i.test(message);
      if (isSubstantiveQuery && response.content.length < minResponseLength && searchResults.length > 0 && !deadlineFixApplied) {
        console.log(`🛡️ SHORT_RESPONSE: Response too short (${response.content.length} chars), attempting to enrich`);
        // Try to add context from top source
        const topSource = searchResults[0];
        if (topSource) {
          const sourceExcerpt = (topSource.content || topSource.excerpt || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .substring(0, 400);
          const enrichedResponse = `${response.content}\n\n${sourceExcerpt}... [1]`;
          if (enrichedResponse.length > response.content.length) {
            response.content = enrichedResponse;
            console.log(`🛡️ SHORT_RESPONSE: Enriched to ${response.content.length} chars`);
          }
        }
      } else if (deadlineFixApplied) {
        console.log(`[v12.7-DEBUG] SHORT_RESPONSE skipped for deadline query (deadlineFixApplied=true)`);
      }

      // 🛡️ v12.9: ARTICLE FORMAT VALIDATOR for scenario queries
      // Ensures proper sections (ÖZET, DEĞERLENDİRME, SONUÇ) for complex scenario questions
      // Now passes sources to generate substantial content if response is too short
      response.content = this.ensureArticleFormat(response.content, message, searchResults);

      // Strip citation markers when disableCitationText is enabled AND strict mode is OFF
      // In strict mode, we NEED the [Kaynak X] references for source verification
      if (disableCitationText && !strictRagMode) {
        response.content = this.stripCitationMarkers(response.content);
        console.log('📝 Citation markers stripped from response (disableCitationText=true, strictMode=false)');
      }

      // Fix empty source references [] in strict mode - replace with best matching source
      // This runs AFTER strip to ensure [Kaynak X] references are preserved
      if (strictRagMode && searchResults.length > 0) {
        response.content = this.fixEmptySourceReferences(response.content, searchResults, settingsMap, message);
      }

      // 🎯 GUARDRAILS - Validate response quality in strict mode
      // This prevents "wrong quote from right document" and "unsupported claims" problems
      if (strictRagMode && searchResults.length > 0) {
        // ⚡ PERF: Extract topic entities ONCE using DB config and reuse throughout guardrails
        const topicEntities = this.extractTopicEntities(message, domainConfig.topicEntities);

        // 0. AUTHORITY UPGRADE - DISABLED (ALINTI removed from UI)
        // Original: try to find a matching quote from a higher-authority source
        const showAlinti = false; // ALINTI no longer shown in UI
        if (showAlinti && topicEntities.length > 0 && response.content.includes('**ALINTI**')) {
          const upgradeResult = this.tryUpgradeQuoteToHigherAuthority(
            response.content,
            searchResults,
            topicEntities,
            responseLanguage,
            domainConfig.authorityLevels,
            domainConfig.keyTerms
          );
          if (upgradeResult.upgraded && upgradeResult.newResponse) {
            response.content = upgradeResult.newResponse;
            console.log(`📊 [METRIC] AUTHORITY_UPGRADE_APPLIED: old="${upgradeResult.oldSource}", new="${upgradeResult.newSource}"`);
          }
        }

        // 0b. NUMBER VALIDATION (Eksik-3 Fix) - For "hangi tebliğ/madde?" questions,
        // verify the number in answer also appears in quote, and flag conflicts
        const numberValidation = this.validateNumberInQuote(
          message,
          response.content,
          searchResults,
          responseLanguage
        );

        if (!numberValidation.valid) {
          // Number mismatch - remove the ALINTI to prevent misleading
          console.log(`📊 [METRIC] NUMBER_VALIDATION_FAIL: answerNumber="${numberValidation.answerNumber}", quoteNumber="${numberValidation.quoteNumber}"`);
          console.log(`🔢 NUMBER MISMATCH: Removing ALINTI because answer number not in quote`);
          response.content = this.removeInvalidQuote(response.content, responseLanguage);
        } else if (numberValidation.conflictNumbers && numberValidation.conflictNumbers.length > 0) {
          // Valid but has conflicts - add warning
          console.log(`📊 [METRIC] NUMBER_CONFLICT_WARNING: answerNumber="${numberValidation.answerNumber}", conflicts=[${numberValidation.conflictNumbers.join(', ')}]`);
          response.content = this.addNumberConflictWarning(
            response.content,
            numberValidation.answerNumber!,
            numberValidation.conflictNumbers,
            responseLanguage
          );
        }

        // 1. Quote Selection Guardrail - Check if ALINTI contains relevant keywords + topic entities
        const quoteValidation = this.validateQuoteRelevance(
          message,
          response.content,
          searchResults,
          responseLanguage,
          domainConfig.topicEntities,
          domainConfig.keyTerms
        );

        // 🚨 HARD FAIL: If quote doesn't match topic, REMOVE the ALINTI section entirely
        // "Yanlış alıntı göstermek, alıntı yok demekten çok daha kötü."
        let alintıRemoved = false;
        let alintıRemovalReason = '';
        // ⚡ PERF: topicEntities already computed at start of guardrails block

        if (!quoteValidation.valid) {
          // 📊 METRIC: AC-A1 - Quote Guardrail Hard Fail
          console.log(`📊 [METRIC] QUOTE_GUARDRAIL_HARD_FAIL: reason="${quoteValidation.reason}", topicMissing=${quoteValidation.topicMissing || false}`);
          console.log(`🚨 QUOTE GUARDRAIL HARD FAIL: ${quoteValidation.reason}`);

          // Remove ALINTI section from response to prevent showing irrelevant quotes
          const cleanedResponse = this.removeInvalidQuote(response.content, responseLanguage);
          if (cleanedResponse !== response.content) {
            // 📊 METRIC: AC-A2 - ALINTI Removed due to topic mismatch
            console.log(`📊 [METRIC] ALINTI_REMOVED_TOPIC_MISMATCH: question="${message.substring(0, 50)}...", topicEntities=[${topicEntities.slice(0, 3).join(', ')}]`);
            console.log(`🧹 ALINTI REMOVED: Topic mismatch - showing answer without misleading quote`);
            response.content = cleanedResponse;
            alintıRemoved = true;
            alintıRemovalReason = 'TOPIC_MISMATCH';
          }
        }

        // 1b. SOURCE-TYPE MINIMUM BAR: If all results are low-authority (qna), remove ALINTI
        // Alıntı göstermek için en az bir regulation/ozelge sonucu olmalı
        const hasHighAuthoritySource = searchResults.some(r => {
          // Check multiple fields for source type (same logic as source ranking)
          const rawSourceType = (r.source_type || r.sourceTable || r.category || r.metadata?.source_type || '').toLowerCase();
          // Normalize: remove csv_ prefix and underscores
          const sourceType = rawSourceType.replace(/^csv_/, '').replace(/_/g, '');
          // High authority: regulation, ozelge, kanun, teblig, danistay
          // Low authority: qna, sorucevap, makale, document (unless quasi-high)
          const isHighAuthority = sourceType.includes('ozelge') ||
                 sourceType.includes('regulation') ||
                 sourceType.includes('kanun') ||
                 sourceType.includes('tebli') ||
                 sourceType.includes('danistay');

          if (isHighAuthority) return true;

          // QUASI-HIGH CHECK: "document" type may contain official content
          // Check title/content for official publication indicators
          if (sourceType.includes('document') || sourceType.includes('ebook') || sourceType.includes('pdf')) {
            const title = (r.title || '').toLowerCase();
            const content = (r.content || r.text || '').toLowerCase().substring(0, 500);
            const quasiHighPatterns = [
              'resmî gazete', 'resmi gazete', 'r.g.', 'rg tarih',
              'kanun', 'sayılı kanun', 'madde',
              'tebliğ', 'yönetmelik', 'genelge',
              'bakanlar kurulu', 'cumhurbaşkanlığı kararnamesi',
              'vergi usul', 'vuk', 'kvk', 'gvk'
            ];
            const matchedPattern = quasiHighPatterns.find(p =>
              title.includes(p) || content.includes(p)
            );
            if (matchedPattern) {
              // 📊 METRIC: AC-C2 - Quasi-High Match
              console.log(`📊 [METRIC] QUASI_HIGH_MATCH: sourceType="${sourceType}", pattern="${matchedPattern}", title="${r.title?.substring(0, 40)}..."`);
              console.log(`📄 QUASI-HIGH: "${r.title?.substring(0, 40)}..." treated as high-authority (official content detected)`);
              return true;
            }
          }

          return false;
        });

        if (!hasHighAuthoritySource && showAlinti && response.content.includes('**ALINTI**')) {
          // 📊 METRIC: AC-C1 - Source Type Bar Fail (no high-authority sources)
          const sourceTypeCounts: Record<string, number> = {};
          searchResults.forEach(r => {
            // Use same source type detection logic as hasHighAuthoritySource check
            const rawType = (r.source_type || r.sourceTable || r.category || r.metadata?.source_type || 'unknown').toLowerCase();
            const type = rawType.replace(/^csv_/, '').replace(/_/g, '');
            sourceTypeCounts[type] = (sourceTypeCounts[type] || 0) + 1;
          });
          console.log(`📊 [METRIC] SOURCE_TYPE_BAR_FAIL: allLowAuthority=true, sourceTypes=${JSON.stringify(sourceTypeCounts)}`);
          console.log(`📊 SOURCE-TYPE BAR: No high-authority sources found (all are qna/makale), removing ALINTI`);
          const cleanedResponse = this.removeInvalidQuote(response.content, responseLanguage);
          if (cleanedResponse !== response.content) {
            console.log(`🧹 ALINTI REMOVED: Low-authority sources only - quote may not be reliable`);
            response.content = cleanedResponse;
            alintıRemoved = true;
            alintıRemovalReason = alintıRemovalReason || 'LOW_AUTHORITY_ONLY';
          }
        }

        // 🔄 FALLBACK RETRY: After removing ALINTI, try to find a better quote in search results
        if (alintıRemoved && topicEntities.length > 0) {
          // 📊 METRIC: AC-B - Fallback Tried
          console.log(`📊 [METRIC] FALLBACK_TRIED: removalReason="${alintıRemovalReason}", topicEntities=[${topicEntities.slice(0, 3).join(', ')}], resultCount=${searchResults.length}`);
          console.log(`🔄 FALLBACK: Attempting to find relevant quote after hard fail...`);

          const fallback = this.tryFindFallbackQuote(
            response.content,
            searchResults,
            topicEntities,
            responseLanguage,
            domainConfig.keyTerms
          );

          if (fallback.found && fallback.quote && fallback.source) {
            // 📊 METRIC: AC-B1 - Fallback Accepted
            console.log(`📊 [METRIC] FALLBACK_ACCEPTED: source="${fallback.source}", quoteLength=${fallback.quote.length}`);
            console.log(`✅ FALLBACK SUCCESS: Replacing "no quote" message with found quote`);
            response.content = this.replaceWithFallbackQuote(
              response.content,
              fallback.quote,
              fallback.source,
              responseLanguage
            );
          } else {
            // 📊 METRIC: AC-B - Fallback Rejected (no suitable quote found)
            console.log(`📊 [METRIC] FALLBACK_REJECTED: reason="NO_MATCHING_QUOTE"`);
          }
        }

        // 2. Answer-Evidence Consistency - Check if claims are supported by ALINTI
        const consistencyCheck = this.validateAnswerEvidenceConsistency(
          response.content,
          responseLanguage
        );

        if (!consistencyCheck.consistent) {
          console.log(`⚠️ CONSISTENCY GUARDRAIL: ${consistencyCheck.issue}`);
          // Note: For now, only log. Future: could add disclaimer or retry
        }
      }

      // ========================================
      // 📋 RESPONSE TYPE DETECTION (before format enforcement)
      // ========================================
      // Types: OUT_OF_SCOPE | NOT_FOUND | NEEDS_CLARIFICATION | FOUND
      // This determines whether to run enforceResponseFormat and how to handle sources

      // ✅ DOMAIN TERM ALLOWLIST: Use keyTerms + topicEntity synonyms from DB
      // 🔧 FIX: Add fallback core tax terms when DB config is empty
      const FALLBACK_TAX_TERMS = [
        'vergi', 'kdv', 'gelir', 'kurumlar', 'stopaj', 'beyanname', 'fatura',
        'levha', 'özelge', 'ozelge', 'tebliğ', 'teblig', 'kanun', 'madde',
        'tevkifat', 'istisna', 'muafiyet', 'indirim', 'iade', 'mahsup',
        'fotokopi', 'şube', 'sube', 'merkez', 'tasdik', 'asıl', 'suret',
        'mükellef', 'mukellef', 'vuk', 'gvk', 'kvk', 'ötv', 'mtv', 'damga'
      ];

      const domainTermAllowlist = [
        ...domainConfig.keyTerms.map(t => t.toLowerCase()),
        ...domainConfig.topicEntities.flatMap(e => [
          e.entity.toLowerCase(),
          ...e.synonyms.map(s => s.toLowerCase()),
          // Also split pattern by | to get individual terms
          ...e.pattern.split('|').map(p => p.toLowerCase().trim())
        ]),
        // 🔧 FIX: Always include fallback terms to prevent false OUT_OF_SCOPE
        ...(domainConfig.keyTerms.length === 0 ? FALLBACK_TAX_TERMS : [])
      ];

      const queryLower = message.toLowerCase();

      // 🔧 FIX: Check both DB config AND fallback terms
      const isQueryInScope = domainTermAllowlist.some(term => queryLower.includes(term))
        || FALLBACK_TAX_TERMS.some(term => queryLower.includes(term));

      // Log for debugging
      if (isQueryInScope) {
        const matchedTerms = [...domainTermAllowlist, ...FALLBACK_TAX_TERMS]
          .filter(term => queryLower.includes(term));
        console.log(`✅ Query IN SCOPE: matched terms = [${matchedTerms.slice(0, 5).join(', ')}${matchedTerms.length > 5 ? '...' : ''}]`);
      }

      // 🤔 NEEDS_CLARIFICATION DETECTION (query-based, before LLM response check)
      // Patterns that indicate unclear/ambiguous query
      const wordCount = queryLower.split(/\s+/).filter(w => w.length > 2).length;

      const needsClarificationPatterns = {
        // Very short queries (less than 3 words) - applies even for in-scope terms
        // 🔧 FIX: Short domain queries should get NEEDS_CLARIFICATION, not OUT_OF_SCOPE
        tooShort: wordCount < 3,
        // Incomplete terms or typos (common mistakes)
        hasIncomplete: /\b(verg[^i]|kdv[a-z]|beyan[^n]|tebli[^gğ])\b/i.test(queryLower),
        // Just numbers without context (e.g., "6111")
        justNumbers: /^\d+$/.test(message.trim()) || /^(\d+\s*\/\s*\d+)$/.test(message.trim()),
        // Question words without clear subject
        vagueQuestion: /^(ne|nasıl|nedir|neden|kim)\s*\??$/i.test(message.trim()),
        // 🔧 NEW: Short phrase with "?" but lacking full context
        shortPhraseQuestion: wordCount <= 4 && message.trim().endsWith('?') && !message.includes(' mı') && !message.includes(' mi'),
        // LLM response indicates need for clarification
        llmAsksClarification: /(?:ne demek istiyorsunuz|hangi(?:si)?.*(?:kastediyorsunuz|soruyorsunuz)|a[çc][ıi]klar\s*m[ıi]s[ıi]n[ıi]z|daha fazla bilgi|belirtir misiniz)/i.test(response.content)
      };

      const needsClarification = Object.values(needsClarificationPatterns).some(v => v === true);

      // ========================================
      // 🚫 AMBIGUITY GUARD: Short/ambiguous queries MUST get NEEDS_CLARIFICATION
      // ========================================
      // Even if we have search results, certain query patterns are too ambiguous
      // to provide a confident answer. These patterns OVERRIDE the normal FOUND logic.
      //
      // STRONG AMBIGUITY (forces NEEDS_CLARIFICATION even with results):
      // - justNumbers: "6111", "213", "7326" - could mean law number, article, year, etc.
      // - vagueQuestion: "ne?", "nedir?" - no subject specified
      // - tooShort without clear question form: "KDV" vs "KDV nedir?"
      //
      // v12.32: EXEMPTION for deadline comparison patterns (24 mü 26 mı, kdv 24 mu 26 mi)
      // These are clear intent patterns that should NOT be treated as ambiguous
      const hasDeadlineComparisonPattern = /24\s*(mı?|mi|mu|mü)?\s*(yoksa|veya)?\s*26/i.test(message) ||
                                            /26\s*(mı?|mi|mu|mü)?\s*(yoksa|veya)?\s*24/i.test(message);
      const hasKdvContext = /kdv|katma\s*değer|kdvk/i.test(message);
      const isDeadlineComparisonQuery = hasDeadlineComparisonPattern && hasKdvContext;

      if (isDeadlineComparisonQuery) {
        console.log(`🛡️ [v12.32] DEADLINE_COMPARISON_EXEMPTION: Skipping strong ambiguity for "24 vs 26" query`);
      }

      const isStrongAmbiguity = !isDeadlineComparisonQuery && (
        needsClarificationPatterns.justNumbers ||
        needsClarificationPatterns.vagueQuestion ||
        (needsClarificationPatterns.tooShort && !message.includes('?'))
      );

      if (isStrongAmbiguity) {
        console.log(`🚫 AMBIGUITY GUARD: Strong ambiguity detected - will force NEEDS_CLARIFICATION regardless of results`);
      }
      const clarificationReason = Object.entries(needsClarificationPatterns)
        .filter(([_, v]) => v === true)
        .map(([k, _]) => k)
        .join(', ');

      // ========================================
      // 🎯 DETERMINISTIC RESPONSE TYPE (NO LLM PATTERN MATCHING)
      // ========================================
      // ResponseType is PURELY based on:
      // 1. isStrongAmbiguity (ambiguity guard - highest priority!)
      // 2. searchResults.length (do we have results?)
      // 3. isQueryInScope (does query contain domain terms?)
      // 4. needsClarification (is query too short/unclear?)
      //
      // LLM response content is NEVER checked for OUT_OF_SCOPE/NOT_FOUND patterns.
      // This prevents regression when LLM produces unexpected responses.
      //
      // RULES (strict priority):
      // 0. isStrongAmbiguity → NEEDS_CLARIFICATION (even with results!)
      // 1. searchResults.length > 0 → FOUND
      // 2. searchResults.length == 0 + isQueryInScope → NOT_FOUND
      // 3. searchResults.length == 0 + needsClarification → NEEDS_CLARIFICATION
      // 4. searchResults.length == 0 + !isQueryInScope → OUT_OF_SCOPE
      let responseType: 'OUT_OF_SCOPE' | 'NOT_FOUND' | 'NEEDS_CLARIFICATION' | 'FOUND' = 'FOUND';

      // ═══════════════════════════════════════════════════════════════════════════
      // v12.31: DEADLINE EARLY-ESCAPE PREVENTION
      // For deadline queries with poor search results, do targeted DB fetch
      // This prevents "net bilgi yok" fallback for typo/malformed deadline queries
      // v12.32: Also handles 'ambiguous' case - fetches BOTH m.41 and m.46
      // ═══════════════════════════════════════════════════════════════════════════
      const earlyDeadlineIntent = this.detectDeadlineIntent(message);

      // v12.32: For ambiguous "24 vs 26" queries, fetch BOTH m.41 and m.46
      if (earlyDeadlineIntent === 'ambiguous' && (searchResults.length < 2 || isDeadlineComparisonQuery)) {
        console.log(`🛡️ [v12.32] AMBIGUOUS_RESCUE: Fetching both m.41 and m.46 for comparison query`);

        const articlesToFetch = [
          { article: '41', lawName: 'KATMA DEĞER VERGİSİ KANUNU' },
          { article: '46', lawName: 'KATMA DEĞER VERGİSİ KANUNU' }
        ];

        for (const targetInfo of articlesToFetch) {
          // Check if this article is already in results
          const alreadyExists = searchResults.some(r =>
            (r.content || r.title || '').toLowerCase().includes(`madde ${targetInfo.article}`)
          );

          if (!alreadyExists) {
            try {
              const rescueResult = await this.pool.query(
                `SELECT id, source_table, source_type, source_name, content, metadata
                 FROM unified_embeddings
                 WHERE source_table = 'vergilex_mevzuat_kanunlar_chunks'
                   AND source_name ILIKE $1
                 LIMIT 1`,
                [`%${targetInfo.lawName}%Madde ${targetInfo.article}%`]
              );

              if (rescueResult.rows.length > 0) {
                const row = rescueResult.rows[0];
                const rescuedSource = {
                  id: row.id,
                  sourceTable: row.source_table,
                  sourceType: row.source_type || 'kanun',
                  title: row.source_name || `KDVK Madde ${targetInfo.article}`,
                  content: row.content,
                  excerpt: row.content?.substring(0, 500),
                  score: targetInfo.article === '41' ? 0.96 : 0.95, // m.41 slightly higher for ordering
                  metadata: row.metadata || {}
                };
                searchResults.push(rescuedSource);
                console.log(`✅ [v12.32] AMBIGUOUS_RESCUED: Added KDVK m.${targetInfo.article} from DB`);
              }
            } catch (rescueError) {
              console.error(`❌ [v12.32] AMBIGUOUS_RESCUE_FAILED for m.${targetInfo.article}:`, rescueError);
            }
          }
        }
      }
      // v12.31: Single intent rescue (beyanname or odeme)
      else if (earlyDeadlineIntent && earlyDeadlineIntent !== 'ambiguous' && searchResults.length === 0) {
        console.log(`🛡️ [v12.31] DEADLINE_RESCUE: No search results but deadline intent detected (${earlyDeadlineIntent}), attempting DB fetch`);

        // Targeted article mapping
        const targetArticles: Record<string, { article: string; lawName: string }> = {
          'beyanname': { article: '41', lawName: 'KATMA DEĞER VERGİSİ KANUNU' },
          'odeme': { article: '46', lawName: 'KATMA DEĞER VERGİSİ KANUNU' }
        };

        const targetInfo = targetArticles[earlyDeadlineIntent];
        if (targetInfo) {
          try {
            const rescueResult = await this.pool.query(
              `SELECT id, source_table, source_type, source_name, content, metadata
               FROM unified_embeddings
               WHERE source_table = 'vergilex_mevzuat_kanunlar_chunks'
                 AND source_name ILIKE $1
               LIMIT 1`,
              [`%${targetInfo.lawName}%Madde ${targetInfo.article}%`]
            );

            if (rescueResult.rows.length > 0) {
              const row = rescueResult.rows[0];
              const rescuedSource = {
                id: row.id,
                sourceTable: row.source_table,
                sourceType: row.source_type || 'kanun',
                title: row.source_name || `KDVK Madde ${targetInfo.article}`,
                content: row.content,
                excerpt: row.content?.substring(0, 500),
                score: 0.95,
                metadata: row.metadata || {}
              };
              searchResults.push(rescuedSource);
              console.log(`✅ [v12.31] DEADLINE_RESCUED: Added KDVK m.${targetInfo.article} from DB (${row.source_name})`);
            }
          } catch (rescueError) {
            console.error(`❌ [v12.31] DEADLINE_RESCUE_FAILED:`, rescueError);
          }
        }
      }
      // ═══════════════════════════════════════════════════════════════════════════

      if (isStrongAmbiguity) {
        // RULE 0: Strong ambiguity → NEEDS_CLARIFICATION (even with results!)
        // This prevents showing misleading results for "6111", "ne?" etc.
        responseType = 'NEEDS_CLARIFICATION';
        console.log(`🚫 NEEDS_CLARIFICATION: AMBIGUITY GUARD triggered (${clarificationReason}) - ignoring ${searchResults.length} results`);
      } else if (searchResults.length > 0) {
        // RULE 1: Results exist → FOUND
        responseType = 'FOUND';
        console.log(`✅ FOUND: ${searchResults.length} results - deterministic FOUND`);
      } else if (isQueryInScope) {
        // v12.31: For deadline queries, never fall back to NOT_FOUND - use fallback response
        const deadlineIntentForNotFound = this.detectDeadlineIntent(message);
        if (deadlineIntentForNotFound && deadlineIntentForNotFound !== 'ambiguous') {
          responseType = 'FOUND'; // Force FOUND to use deadline handler
          console.log(`🛡️ [v12.31] DEADLINE_FORCE_FOUND: Preventing NOT_FOUND for deadline query (${deadlineIntentForNotFound})`);
        } else {
          // RULE 2: No results + in-scope → NOT_FOUND (single sentence, sources=[])
          responseType = 'NOT_FOUND';
          console.log(`🔍 NOT_FOUND: No results for in-scope query - deterministic NOT_FOUND`);
        }
      } else if (needsClarification) {
        // RULE 3: No results + unclear → NEEDS_CLARIFICATION
        responseType = 'NEEDS_CLARIFICATION';
        console.log(`🤔 NEEDS_CLARIFICATION: Unclear query (${clarificationReason})`);
      } else {
        // RULE 4: No results + not in scope → OUT_OF_SCOPE
        responseType = 'OUT_OF_SCOPE';
        console.log(`🚫 OUT_OF_SCOPE: No results, not in domain scope`);
      }

      console.log(`📋 RESPONSE TYPE: ${responseType} [DETERMINISTIC] (strongAmbiguity=${isStrongAmbiguity}, results=${searchResults.length}, inScope=${isQueryInScope}, unclear=${needsClarification}${needsClarification ? ' [' + clarificationReason + ']' : ''})`);

      // ========================================
      // APPLY BEHAVIORAL CONTRACT
      // ========================================

      if (responseType === 'OUT_OF_SCOPE') {
        // A) OUT_OF_SCOPE: Single line, no CEVAP/ALINTI, sources=[], bypass format
        console.log(`🚫 OUT_OF_SCOPE: Applying contract - single line response, no sources`);
        response.content = 'Bu soru Vergilex kapsamı dışındadır (Türk vergi mevzuatı ile ilgili değil).';
        // sources will be cleared in finalSources below
        // NO enforceResponseFormat
      } else if (responseType === 'NEEDS_CLARIFICATION') {
        // B) NEEDS_CLARIFICATION: Ask for clarification, sources=[], no misleading results
        console.log(`🤔 NEEDS_CLARIFICATION: Applying contract - ask clarification, no sources`);
        const clarificationResult = this.generateClarificationResponse(message, responseLanguage);
        response.content = clarificationResult.text;
        (response as any).suggestedQuestions = clarificationResult.suggestions;
        // sources will be cleared in finalSources below
        // NO enforceResponseFormat
      } else if (responseType === 'NOT_FOUND') {
        // C) NOT_FOUND: CEVAP with "bulunamadı", no ALINTI, sources=[]
        console.log(`🔍 NOT_FOUND: Applying contract - clean response, no sources`);
        response.content = this.cleanNotFoundResponse(response.content, responseLanguage);
        // sources will be cleared in finalSources below
        // NO enforceResponseFormat
      } else {
        // D) FOUND: Apply format enforcement ONLY for found responses
        // Pass original message for verdict question detection
        // Determine format type from schema - 'article' if articleSections configured
        // v12.10 FIX: SKIP article format for DEADLINE queries (causes content truncation)
        const isDeadlineQuery = this.detectDeadlineIntent(message) !== null;
        const hasArticleSections = routingSchema.routes.FOUND.format.articleSections &&
                                   routingSchema.routes.FOUND.format.articleSections.length > 0;

        // Use 'legacy' format for deadline queries to preserve full response
        const formatType = (hasArticleSections && !isDeadlineQuery) ? 'article' : 'legacy';

        if (isDeadlineQuery) {
          console.log(`🛡️ [v12.10] DEADLINE_FORMAT_SKIP: Using legacy format for deadline query (preserves content)`);
        }

        response.content = this.enforceResponseFormat(
          response.content,
          searchResults,
          responseLanguage,
          message,  // Original user query for verdict detection
          formatType,
          routingSchema  // Schema for backendLabel lookup (settings-driven)
        );
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
        // Use minResults for display count (fallback to initialDisplayCount then 7)
        const fastModeSources = searchResults.slice(0, initialDisplayCount || minResults || 7).map((r, idx) => {
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

        // 📋 APPLY BEHAVIORAL CONTRACT in fast mode (same rules as normal mode)
        // responseType was already determined before fast mode check
        let fastModeResponse = response.content;
        let fastModeFinalSources = fastModeSources;

        let fastModeSuggestedQuestions: string[] = [];

        if (responseType === 'OUT_OF_SCOPE') {
          fastModeResponse = 'Bu soru Vergilex kapsamı dışındadır (Türk vergi mevzuatı ile ilgili değil).';
          fastModeFinalSources = [];
        } else if (responseType === 'NEEDS_CLARIFICATION') {
          const clarificationResult = this.generateClarificationResponse(message, responseLanguage);
          fastModeResponse = clarificationResult.text;
          fastModeSuggestedQuestions = clarificationResult.suggestions;
          fastModeFinalSources = [];
        } else if (responseType === 'NOT_FOUND') {
          fastModeResponse = this.cleanNotFoundResponse(response.content, responseLanguage);
          fastModeFinalSources = [];
        } else {
          // FOUND: Apply format enforcement only for found responses
          // Pass original message for verdict question detection
          // v12.10 FIX: SKIP article format for DEADLINE queries (causes content truncation)
          const isDeadlineQueryFast = this.detectDeadlineIntent(message) !== null;
          const hasArticleSectionsFast = routingSchema.routes.FOUND.format.articleSections &&
                                         routingSchema.routes.FOUND.format.articleSections.length > 0;
          const formatType = (hasArticleSectionsFast && !isDeadlineQueryFast) ? 'article' : 'legacy';

          if (isDeadlineQueryFast) {
            console.log(`🛡️ [v12.10] DEADLINE_FORMAT_SKIP (fast): Using legacy format for deadline query`);
          }

          fastModeResponse = this.enforceResponseFormat(response.content, searchResults, responseLanguage, message, formatType, routingSchema);
        }

        // 📊 DEBUG INFO for fast mode
        const fastModeDebugInfo = {
          responseType,
          queryInScope: isQueryInScope,
          resultsCount: searchResults.length,
          needsClarification,
          clarificationReason: needsClarification ? clarificationReason : null,
          sourcesCount: fastModeFinalSources.length,
          searchResultsCount: searchResults.length,
          hasCevap: fastModeResponse.includes('**CEVAP**'),
          hasAlinti: false, // ALINTI removed from UI
          fastMode: true,
          suggestions: fastModeSuggestedQuestions.length > 0 ? fastModeSuggestedQuestions : undefined
        };
        console.log(`📊 DEBUG_INFO (FAST): ${JSON.stringify(fastModeDebugInfo)}`);

        return {
          response: fastModeResponse,
          sources: fastModeFinalSources, // ⚡ Cleared if OUT_OF_SCOPE/NOT_FOUND/NEEDS_CLARIFICATION
          relatedTopics: [],
          followUpQuestions: [],
          suggestedQuestions: fastModeSuggestedQuestions.length > 0 ? fastModeSuggestedQuestions : undefined,
          conversationId: convId,
          provider: response.provider,
          model: response.model || response.provider,
          providerDisplayName: getProviderDisplayName(response.provider || '', options.language || 'tr'),
          language: options.language || 'tr',
          fallbackUsed: response.fallbackUsed || false,
          originalModel: activeModel,
          actualProvider: response.provider,
          fastMode: true, // Flag for frontend
          strictMode: false, // Fast mode is not strict mode
          usage: response.usage, // Token usage from LLM
          _debug: fastModeDebugInfo // 📊 Debug field for regression testing
        };
      }

      // 6. Format sources for frontend with natural language summaries (NORMAL MODE)
      // PERFORMANCE: Pass settings to avoid re-querying database
      const formattedSources = await this.formatSources(searchResults, {
        enableParallelLLM: settingsMap.get('enable_parallel_llm') === 'true',
        parallelCount: Math.min(parseInt(settingsMap.get('parallel_llm_count') || '3'), 5),
        batchSize: batchSize
      });

      // ========================================
      // 6b. RANK AND LIMIT SOURCES (Hierarchy + Relevance + Threshold)
      // ========================================
      // 1. Add hierarchy weight + combined score to all sources
      // 2. Filter by similarity threshold (from RAG Settings)
      // 3. Apply min/max bounds (from RAG Settings)
      // NOTE: Use minResults/maxResults as fallback for minSourcesToShow/maxSourcesToShow
      const maxSourcesToShow = parseInt(
        settingsMap.get('ragSettings.maxSourcesToShow') ||
        settingsMap.get('ragSettings.maxResults') ||
        '15'
      );
      const minSourcesToShow = parseInt(
        settingsMap.get('ragSettings.minSourcesToShow') ||
        settingsMap.get('ragSettings.minResults') ||
        '7'
      );
      // Use the same threshold as search (already loaded earlier)
      const sourceThreshold = parseFloat(
        settingsMap.get('ragSettings.similarityThreshold') ||
        settingsMap.get('similarityThreshold') ||
        '0.25'
      );

      // DEBUG: Log source count settings
      console.log(`📊 [SOURCE_LIMITS] formattedSources=${formattedSources.length}, minSourcesToShow=${minSourcesToShow}, maxSourcesToShow=${maxSourcesToShow}, threshold=${sourceThreshold}`);
      console.log(`📊 [SOURCE_LIMITS] DB values: ragSettings.minResults=${settingsMap.get('ragSettings.minResults')}, ragSettings.maxResults=${settingsMap.get('ragSettings.maxResults')}, ragSettings.minSourcesToShow=${settingsMap.get('ragSettings.minSourcesToShow')}`);

      // Step 1: Add hierarchy weight, combined score, AND original index to all sources
      // IMPORTANT: Track _originalIndex for citation remapping after sorting
      const sourcesWithScores = formattedSources.map((source, originalIndex) => {
        // Get source type from multiple possible fields
        const rawSourceType = (
          source.source_type ||
          source.sourceTable ||
          source.category ||
          source.metadata?.source_type ||
          source.metadata?.sourceTable ||
          'document'
        ).toLowerCase();

        // Normalize source type (remove csv_ prefix, etc.)
        const sourceType = rawSourceType
          .replace(/^csv_/, '')
          .replace(/_/g, '')
          .replace(/arsiv.*/, '');  // "makale_arsiv_2021" -> "makale"

        // Get hierarchy weight from domainConfig.authorityLevels (loaded from RAG Settings)
        let hierarchyWeight = domainConfig.authorityLevels[sourceType] || 0;

        // Try partial matches for source types like "danistaykararlari" -> "danistay"
        if (hierarchyWeight === 0) {
          for (const [key, weight] of Object.entries(domainConfig.authorityLevels)) {
            if (sourceType.includes(key) || key.includes(sourceType)) {
              hierarchyWeight = weight;
              break;
            }
          }
        }

        // Final fallback to default weight
        if (hierarchyWeight === 0) {
          hierarchyWeight = 20; // Low default for unknown sources
        }

        // Get similarity score (normalized 0-1)
        const similarityScore = source.score || source.similarity_score || 0;

        // Combined score: hierarchy weight (70%) + similarity score (30%)
        const combinedScore = (hierarchyWeight / 100) * 0.7 + similarityScore * 0.3;

        return {
          ...source,
          _hierarchyWeight: hierarchyWeight,
          _similarityScore: similarityScore,
          _combinedScore: combinedScore,
          _originalIndex: originalIndex + 1  // 1-indexed (matches LLM citation [1], [2], etc.)
        };
      });

      // Step 2: Sort by combined score (hierarchy + similarity)
      let sortedSources = sourcesWithScores.sort((a, b) => b._combinedScore - a._combinedScore);

      // ═══════════════════════════════════════════════════════════════
      // v12.17 FIX: CROSS-LAW DOWNRANK for ALL law-specific queries (Schema-driven)
      // When user asks about a specific law (e.g., KDVK), penalize sources from
      // other laws (e.g., DVK) to prevent citation confusion between similar laws
      // Configuration comes from domainConfig.lawCodeConfig (no hardcoding)
      // NOTE: Removed deadline intent dependency - runs for ANY query with law code
      // ═══════════════════════════════════════════════════════════════
      if (domainConfig.lawCodeConfig?.lawCodes) {
        const lawCodes = domainConfig.lawCodeConfig.lawCodes;
        const queryLower = message.toLowerCase();

        // Detect which law code the user is asking about
        let targetLawCode: string | null = null;
        for (const [code, aliases] of Object.entries(lawCodes)) {
          const codePattern = new RegExp(code.replace(/K$/, ''), 'i'); // KDVK → KDV
          const aliasMatches = aliases.some(alias => queryLower.includes(alias.toLowerCase()));
          if (codePattern.test(queryLower) || aliasMatches) {
            targetLawCode = code;
            console.log(`🎯 [v12.17] LAW_CODE_DETECTED: Query targets ${code} (matched pattern or alias)`);
            break;
          }
        }

        if (targetLawCode) {
          // Build patterns for OTHER law codes to penalize
          const excludePatterns: RegExp[] = [];
          for (const [code, aliases] of Object.entries(lawCodes)) {
            if (code !== targetLawCode) {
              // Add code pattern (e.g., DVK, GVK)
              excludePatterns.push(new RegExp(code, 'i'));
              // Add alias patterns (e.g., "Damga Vergisi", "Gelir Vergisi")
              for (const alias of aliases) {
                if (alias.length > 3) { // Skip short aliases to avoid false matches
                  excludePatterns.push(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                }
              }
            }
          }

          if (excludePatterns.length > 0) {
            // v12.21 FIX: HARD FILTER - completely remove non-target law sources for strict isolation
            // Requirement: Top 15 sources must be 100% target law code (zero leakage)
            const beforeCount = sortedSources.length;

            // First, identify KDVK sources (sources that match target law code)
            const targetPatterns: RegExp[] = [];
            const targetAliases = lawCodes[targetLawCode] || [];
            targetPatterns.push(new RegExp(targetLawCode, 'i'));
            for (const alias of targetAliases) {
              if (alias.length > 3) {
                targetPatterns.push(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
              }
            }

            // Filter: Keep only sources that match target law code OR are truly generic (not law sources)
            // v12.22 FIX: Also filter out generic "KANUN" sources that don't match target
            const filteredSources = sortedSources.filter(s => {
              const searchText = `${s.content || ''} ${s.title || ''}`;
              const titleUpper = (s.title || '').toUpperCase();

              // Check if source matches target law code
              const matchesTarget = targetPatterns.some(p => p.test(searchText));
              if (matchesTarget) return true;

              // Check if source matches any OTHER law code (should be excluded)
              const matchesOther = excludePatterns.some(p => p.test(searchText));
              if (matchesOther) return false;

              // v12.22: If title contains "KANUN" but didn't match target, it's a non-target law - exclude
              // This catches omnibus laws like "BAZI KANUNLARDA DEĞİŞİKLİK" (5838, 7440, etc.)
              const isLawSource = titleUpper.includes('KANUN') || titleUpper.includes('KANUNU');
              if (isLawSource) {
                console.log(`🛡️ [v12.22] OMNIBUS_LAW_FILTER: Excluded "${s.title?.substring(0, 50)}..." (law source not matching ${targetLawCode})`);
                return false;
              }

              // Generic sources (documents, articles without "KANUN" in title) - keep
              return true;
            });

            const removedCount = beforeCount - filteredSources.length;
            if (removedCount > 0) {
              console.log(`🛡️ [v12.21] CROSS_LAW_FILTER: Removed ${removedCount} non-${targetLawCode} sources (strict isolation)`);
            }

            sortedSources = filteredSources;
          }
        }
      }

      // Step 3: Filter by similarity threshold, then apply min/max bounds
      const sourcesAboveThreshold = sortedSources.filter(s => s._similarityScore >= sourceThreshold);

      let rankedSources: typeof sortedSources;
      if (sourcesAboveThreshold.length >= maxSourcesToShow) {
        // More than max passed threshold → take top max
        rankedSources = sourcesAboveThreshold.slice(0, maxSourcesToShow);
      } else if (sourcesAboveThreshold.length >= minSourcesToShow) {
        // Between min and max passed threshold → take all that passed
        rankedSources = sourcesAboveThreshold;
      } else {
        // Less than min passed threshold → take top min (even below threshold)
        rankedSources = sortedSources.slice(0, minSourcesToShow);
      }

      console.log(`📊 [SOURCES] Total=${formattedSources.length}, AboveThreshold(${(sourceThreshold * 100).toFixed(0)}%)=${sourcesAboveThreshold.length}, Showing=${rankedSources.length} (min=${minSourcesToShow}, max=${maxSourcesToShow})`);

      // ═══════════════════════════════════════════════════════════════
      // v12.25: MURAT HIERARCHY - Law Article to Top-1 for deadline queries
      // For KDV deadline questions, the target law article (madde 41/46) should be Top-1
      // This ensures "Kanun/Mevzuat" appears first, then Tebliğ, then Makale
      // ═══════════════════════════════════════════════════════════════
      const deadlineIntentForHierarchy = this.detectDeadlineIntent(message);
      if (deadlineIntentForHierarchy && deadlineIntentForHierarchy !== 'ambiguous') {
        const targetArticlePatterns: Record<string, RegExp[]> = {
          'beyanname': [/madde\s*41\b/i, /m\.?\s*41\b/i],
          'odeme': [/madde\s*46\b/i, /m\.?\s*46\b/i]
        };
        const targetPatterns = targetArticlePatterns[deadlineIntentForHierarchy] || [];

        // Also pattern to identify law sources (Kanun/Mevzuat)
        const lawSourcePatterns = [
          /kanun/i,
          /mevzuat.*kanun/i,
          /3065\s*sayılı/i,      // KDVK law number
          /katma\s*değer\s*vergisi\s*kanunu/i
        ];

        // Find the best law source with target article
        let bestLawSourceIndex = -1;
        let bestLawSourceScore = -1;

        for (let i = 0; i < rankedSources.length; i++) {
          const source = rankedSources[i];
          const title = (source.title || '').toLowerCase();
          const content = (source.content || source.excerpt || '').toLowerCase();
          const sourceType = (source.sourceTable || source.source_type || '').toLowerCase();
          const combinedText = title + ' ' + content;

          // Check if this is a law source
          const isLawSource = lawSourcePatterns.some(p => p.test(combinedText)) ||
                              sourceType.includes('mevzuat') ||
                              sourceType.includes('kanun');

          // Check if it contains the target article
          const hasTargetArticle = targetPatterns.some(p => p.test(combinedText));

          if (isLawSource && hasTargetArticle) {
            const score = source._combinedScore || 0;
            if (score > bestLawSourceScore) {
              bestLawSourceScore = score;
              bestLawSourceIndex = i;
            }
          }
        }

        // Move best law source to Top-1 if found and not already there
        if (bestLawSourceIndex > 0) {
          const lawSource = rankedSources.splice(bestLawSourceIndex, 1)[0];
          rankedSources.unshift(lawSource);
          console.log(`🏛️ [v12.25] MURAT_HIERARCHY: Moved law article to Top-1: "${lawSource.title?.substring(0, 50)}..."`);
        } else if (bestLawSourceIndex === 0) {
          console.log(`✅ [v12.25] MURAT_HIERARCHY: Law article already at Top-1`);
        } else {
          // v12.28: Before synthetic injection, search FULL sortedSources (beyond Top-N cutoff)
          // The target article may exist in DB but was cut by Top-N limiting
          let foundInFullList = false;
          for (let i = 0; i < sortedSources.length; i++) {
            const source = sortedSources[i];
            // Skip if already in rankedSources
            if (rankedSources.includes(source)) continue;

            const title = (source.title || '').toLowerCase();
            const content = (source.content || source.excerpt || '').toLowerCase();
            const sourceType = (source.sourceTable || source.source_type || '').toLowerCase();
            const combinedText = title + ' ' + content;

            const isLawSource = lawSourcePatterns.some(p => p.test(combinedText)) ||
                                sourceType.includes('mevzuat') ||
                                sourceType.includes('kanun');
            const hasTargetArticle = targetPatterns.some(p => p.test(combinedText));

            if (isLawSource && hasTargetArticle) {
              // Found in full list - pull into rankedSources at Top-1 instead of synthetic
              rankedSources.unshift(source);
              console.log(`🏛️ [v12.28] MURAT_HIERARCHY: Found law article in full source list (was below Top-N cutoff), moved to Top-1: "${source.title?.substring(0, 50)}..."`);
              foundInFullList = true;
              break;
            }
          }

          if (foundInFullList) {
            // Skip DB fetch - real source found in sortedSources
          } else {
            // v12.28: Targeted DB fetch - query unified_embeddings for the exact law article
            // This replaces synthetic injection with REAL source data from DB
            const targetArticleNumbers: Record<string, { article: string; lawName: string }> = {
              'beyanname': { article: '41', lawName: 'KATMA DEĞER VERGİSİ KANUNU' },
              'odeme': { article: '46', lawName: 'KATMA DEĞER VERGİSİ KANUNU' }
            };
            const targetInfo = targetArticleNumbers[deadlineIntentForHierarchy];
            let dbFetchSuccess = false;

            if (targetInfo) {
              try {
                const dbResult = await this.pool.query(
                  `SELECT id, source_table, source_type, source_name, content, metadata
                   FROM unified_embeddings
                   WHERE source_table = 'vergilex_mevzuat_kanunlar_chunks'
                     AND source_name ILIKE $1
                     AND metadata->>'article_number' = $2
                   LIMIT 1`,
                  [`%${targetInfo.lawName}%Madde ${targetInfo.article}%`, targetInfo.article]
                );

                if (dbResult.rows.length > 0) {
                  const row = dbResult.rows[0];
                  const dbSource = {
                    id: row.id,
                    title: row.source_name,
                    content: row.content,
                    excerpt: row.content?.substring(0, 300),
                    category: 'Mevzuat_Kanun',
                    sourceTable: row.source_table,
                    source_type: row.source_type,
                    citation: row.source_name,
                    score: 1.0,
                    relevance: 100,
                    relevanceText: 'Yüksek',
                    _hierarchyWeight: 100,
                    _similarityScore: 1.0,
                    _combinedScore: 1.0,
                    _originalIndex: 0,
                    metadata: row.metadata || {}
                  };
                  rankedSources.unshift(dbSource);
                  dbFetchSuccess = true;
                  console.log(`🏛️ [v12.28] MURAT_HIERARCHY: Fetched REAL law article from DB at Top-1: "${row.source_name?.substring(0, 60)}"`);
                }
              } catch (dbErr) {
                console.warn(`⚠️ [v12.28] DB fetch failed for ${targetInfo.lawName} Madde ${targetInfo.article}:`, dbErr);
              }
            }

            if (!dbFetchSuccess) {
              console.warn(`⚠️ [v12.28] MURAT_HIERARCHY: Law article not found in DB either (${deadlineIntentForHierarchy}) - no source available`);
            }
          } // close: else (not foundInFullList → DB fetch attempt)
        } // close: else (bestLawSourceIndex === -1)
      } // close: if (deadlineIntentForHierarchy)

      rankedSources.forEach((s, i) => {
        const detectedType = s.sourceTable || s.category || s.source_type || 'unknown';
        console.log(`   ${i + 1}. ${detectedType} (weight=${s._hierarchyWeight}, combined=${(s._combinedScore * 100).toFixed(1)}%, orig=[${s._originalIndex}]): ${s.title?.substring(0, 40)}...`);
      });

      // Replace formattedSources with ranked/limited version for FOUND responses
      const limitedSources = rankedSources;

      // ═══════════════════════════════════════════════════════════════
      // CITATION REMAPPING: Build mapping from original [X] to new [Y]
      // When sources are re-sorted, LLM's [3] might become display [1]
      // ═══════════════════════════════════════════════════════════════
      const citationRemap: Map<number, number> = new Map();
      limitedSources.forEach((source, newIndex) => {
        const originalIndex = source._originalIndex;
        citationRemap.set(originalIndex, newIndex + 1); // New display index (1-indexed)
      });

      // Log remapping if any changes
      const remapEntries = Array.from(citationRemap.entries()).filter(([orig, newIdx]) => orig !== newIdx);
      if (remapEntries.length > 0) {
        console.log(`🔄 [CITATION_REMAP] Remapping ${remapEntries.length} citations: ${remapEntries.map(([o, n]) => `[${o}]→[${n}]`).join(', ')}`);
      }

      // 7. Get additional related topics (excluding already shown ones) - DISABLED FOR PERFORMANCE
      // const relatedResultsLimit = parseInt(await settingsService.getSetting('related_results_limit') || '20');
      // const shownIds = searchResults.slice(0, 3).map(s => s.id?.toString() || s.source_id?.toString());
      // const relatedTopics = await this.getRelatedTopics(message, searchResults.slice(0, 3), relatedResultsLimit);
      const relatedTopics = []; // Disable for now

      // ========================================
      // REFUSAL DETECTION: Clear sources if LLM couldn't find verdict
      // ========================================
      // Configurable via DB: ragSettings.refusalPolicy.*
      // This prevents showing irrelevant sources when LLM admits it couldn't answer

      // Load refusal policy from settings (with defaults)
      const clearSourcesOnRefusal = settingsMap.get('ragSettings.refusalPolicy.clearSourcesOnRefusal') !== 'false';
      const cleanResponseOnRefusal = settingsMap.get('ragSettings.refusalPolicy.cleanResponseTextOnRefusal') !== 'false';

      // Load patterns from DB or use defaults
      const defaultPatterns = [
        'bulunamadı', 'bulunamadi', 'hüküm bulunamadı',
        'kesin hüküm.*bulunamadı', 'yeterli.*kaynak.*yok',
        'yeterli bilgi bulunamadı', 'ilgili kaynak.*bulunamadı',
        'bu konuda.*bilgi.*yok', 'no.*relevant.*found',
        'could not find', 'no definitive ruling'
      ];

      let refusalPatterns = defaultPatterns;
      const patternsRaw = settingsMap.get('ragSettings.refusalPolicy.patterns');
      if (patternsRaw) {
        try {
          refusalPatterns = JSON.parse(patternsRaw);
        } catch (e) {
          console.warn('Failed to parse refusal patterns from settings, using defaults');
        }
      }

      const responseTextLower = response.content.toLowerCase();

      // v12.11 FIX: Skip refusal detection for deadline queries
      // Deadline responses may contain "bulunamadı" in context but still have correct date
      const isDeadlineQueryRefusal = this.detectDeadlineIntent(message) !== null;
      const isRefusalResponse = isDeadlineQueryRefusal
        ? false  // Skip refusal for deadline queries
        : refusalPatterns.some(pattern => {
            const regex = new RegExp(pattern, 'i');
            return regex.test(responseTextLower);
          });

      if (isDeadlineQueryRefusal) {
        console.log(`🛡️ [v12.11] DEADLINE_REFUSAL_SKIP: Skipping refusal detection for deadline query`);
      }

      // If refusal detected, apply configured policies
      // Use limitedSources (ranked and limited by maxSourcesToShow) instead of raw formattedSources
      let finalSources = limitedSources;
      let finalResponse = response.content;

      // ═══════════════════════════════════════════════════════════════
      // CITATION REMAPPING: Apply mapping to LLM response
      // This ensures [X] in text matches source [X] in displayed list
      // ═══════════════════════════════════════════════════════════════

      // v12.16 FIX: For hardcoded deadline responses, find the ACTUAL target law source
      // instead of blind citation remap which may map [1] to wrong source (e.g., DVK for KDVK)
      // Configuration comes from domainConfig.lawCodeConfig (no hardcoding)
      if (deadlineHardcodedApplied && limitedSources.length > 0) {
        const lawCodeConfig = domainConfig.lawCodeConfig;
        const queryLower = message.toLowerCase();

        // Detect which law code the user is asking about
        let targetLawCode: string | null = null;
        let targetPatterns: RegExp[] = [];

        if (lawCodeConfig?.lawCodes) {
          for (const [code, aliases] of Object.entries(lawCodeConfig.lawCodes)) {
            const codePattern = new RegExp(code.replace(/K$/, ''), 'i'); // KDVK → KDV
            const aliasMatches = aliases.some(alias => queryLower.includes(alias.toLowerCase()));
            if (codePattern.test(queryLower) || aliasMatches) {
              targetLawCode = code;
              // Build patterns from code and aliases
              targetPatterns.push(new RegExp(code, 'i'));
              for (const alias of aliases) {
                if (alias.length > 3) {
                  targetPatterns.push(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                }
              }
              // Also add law number pattern if available
              if (lawCodeConfig.lawNumberToCode) {
                for (const [num, lawCode] of Object.entries(lawCodeConfig.lawNumberToCode)) {
                  if (lawCode === code) {
                    targetPatterns.push(new RegExp(`${num}.*kanun|kanun.*${num}`, 'i'));
                  }
                }
              }
              break;
            }
          }
        }

        // Fallback to KDVK patterns if no schema config (backward compatibility)
        if (targetPatterns.length === 0) {
          targetLawCode = 'KDVK';
          targetPatterns = [
            /KDVK|KDV\s*Kanun/i,
            /3065.*kanun|kanun.*3065/i,
            /katma\s*de[gğ]er\s*vergisi/i,
          ];
          console.log(`⚠️ [v12.16] No lawCodeConfig, using fallback KDVK patterns`);
        }

        console.log(`🛡️ [v12.16] DEADLINE_CITATION_FIX: Finding ${targetLawCode} source for hardcoded response`);

        // Build exclude patterns for other law codes
        const excludePatterns: RegExp[] = [];
        if (lawCodeConfig?.lawCodes && targetLawCode) {
          for (const [code, aliases] of Object.entries(lawCodeConfig.lawCodes)) {
            if (code !== targetLawCode) {
              excludePatterns.push(new RegExp(code, 'i'));
              for (const alias of aliases) {
                if (alias.length > 5) { // Only longer aliases to avoid false matches
                  excludePatterns.push(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                }
              }
            }
          }
        }

        let targetSourceIndex = -1;
        for (let i = 0; i < limitedSources.length; i++) {
          const source = limitedSources[i];
          const searchText = `${source.content || ''} ${source.title || ''} ${source.excerpt || ''}`;

          // Check if source matches target law AND doesn't match excluded laws
          const matchesTarget = targetPatterns.some(p => p.test(searchText));
          const matchesExcluded = excludePatterns.length > 0 && excludePatterns.some(p => p.test(searchText));

          if (matchesTarget && !matchesExcluded) {
            targetSourceIndex = i + 1; // 1-indexed for citation
            console.log(`🎯 [v12.16] Found ${targetLawCode} source at index [${targetSourceIndex}]: ${source.title?.substring(0, 50)}`);
            break;
          }
        }

        // Fallback: any source matching target (even if also matches excluded)
        if (targetSourceIndex < 0) {
          for (let i = 0; i < limitedSources.length; i++) {
            const source = limitedSources[i];
            const searchText = `${source.content || ''} ${source.title || ''}`;
            if (targetPatterns.some(p => p.test(searchText))) {
              targetSourceIndex = i + 1;
              console.log(`🎯 [v12.16] Found ${targetLawCode} source (fallback) at index [${targetSourceIndex}]: ${source.title?.substring(0, 50)}`);
              break;
            }
          }
        }

        if (targetSourceIndex > 0) {
          // v12.28 FIX: Replace ALL citation patterns [n], not just [1]
          // extractDeadlineFromSources returns sourceIndex from raw searchResults (e.g. [8])
          // but limitedSources has fewer items, so [8] would be stripped by fixMarkdownAndCitations
          finalResponse = finalResponse.replace(/\[\d+\]/g, `[${targetSourceIndex}]`);
          console.log(`🔄 [v12.28] CITATION_UPDATED: Replaced all citations with ${targetLawCode} source [${targetSourceIndex}]`);
        } else {
          console.warn(`⚠️ [v12.16] No ${targetLawCode} source found in ranked sources - keeping citation as-is`);
        }
        // Skip normal citation remap for hardcoded responses
      } else if (citationRemap.size > 0) {
        // Normal citation remapping for LLM-generated responses
        let remappedCount = 0;
        finalResponse = finalResponse.replace(/\[(\d+)\]/g, (match, num) => {
          const originalNum = parseInt(num, 10);
          const newNum = citationRemap.get(originalNum);
          if (newNum !== undefined && newNum !== originalNum) {
            remappedCount++;
            return `[${newNum}]`;
          } else if (newNum === undefined) {
            // Original citation points to a source that was filtered out
            // Keep as-is but log warning
            console.warn(`⚠️ [CITATION_REMAP] Citation [${originalNum}] refers to filtered-out source`);
            return match;
          }
          return match;
        });
        if (remappedCount > 0) {
          console.log(`🔄 [CITATION_REMAP] Remapped ${remappedCount} citations in response`);
        }
      }

      // FIX: Ensure proper markdown formatting and remove hallucinated citations
      finalResponse = this.fixMarkdownAndCitations(finalResponse, limitedSources);

      // 🔧 v12 FIX: Auto-add citations to date claims before sanitizer removes them
      // This fixes the issue where model writes dates but forgets citations
      finalResponse = this.autoFixDateCitations(finalResponse, limitedSources, responseLanguage);

      // 🔍 DEBUG v12: Log response BEFORE sanitizer to diagnose date extraction issues
      // Looking for "24" or "yirmidördüncü" in raw model output
      const beforeSanitizer = finalResponse;
      const has24Before = /24|yirmidört/i.test(beforeSanitizer);
      if (message.toLowerCase().includes('kaç') || message.toLowerCase().includes('deadline') || message.toLowerCase().includes('beyanname')) {
        console.log(`[DEBUG-v12] BEFORE SANITIZER - contains 24/yirmidört: ${has24Before}`);
        console.log(`[DEBUG-v12] Raw excerpt (first 500 chars): ${beforeSanitizer.substring(0, 500)}`);
      }

      // 🛡️ PROSEDÜR CLAIM SANITIZER v9: critical claims verified in ALL sentences
      // v12.14 FIX: Skip sanitizer for hardcoded deadline responses (known correct values, not hallucinations)
      if (deadlineHardcodedApplied) {
        console.log(`🛡️ [v12.14] DEADLINE_SANITIZER_BYPASS: Skipping sanitizer for hardcoded deadline response`);
      } else {
        finalResponse = this.sanitizeProsedurClaims(finalResponse, limitedSources, domainConfig.sanitizerConfig, domainConfig.lawCodes);
      }

      // 🔍 DEBUG v12: Log response AFTER sanitizer
      const has24After = /24|yirmidört/i.test(finalResponse);
      if (message.toLowerCase().includes('kaç') || message.toLowerCase().includes('deadline') || message.toLowerCase().includes('beyanname')) {
        console.log(`[DEBUG-v12] AFTER SANITIZER - contains 24/yirmidört: ${has24After}`);
        if (has24Before && !has24After) {
          console.log(`[DEBUG-v12] ⚠️ SANITIZER REMOVED DATE! Check logs above for REMOVED entries`);
        } else if (!has24Before) {
          console.log(`[DEBUG-v12] ❌ MODEL NEVER WROTE DATE - issue is model behavior, not sanitizer`);
        }
      }

      if (isRefusalResponse) {
        // 🎯 REFUSAL TYPE DETECTION: Gate-based vs Prompt-based
        // Gate-based: Evidence Gate blocked due to low scores (correct behavior)
        // Prompt-based: Gate passed but LLM couldn't find verdict sentence (potential over-strict issue)
        const refusalType = searchResults.length > 0 && passesEvidenceGate
          ? 'PROMPT_REFUSAL'  // Gate passed, LLM refused - prompt may be too strict
          : 'GATE_REFUSAL';  // Gate blocked - correct behavior

        // Get the strictModeLevel for logging
        const currentStrictLevel = settingsMap.get('ragSettings.strictModeLevel') || 'medium';

        console.log(`🚫 ${refusalType} DETECTED`);
        console.log(`   Refusal Type: ${refusalType}`);
        console.log(`   Strict Mode Level: ${currentStrictLevel}`);
        console.log(`   Evidence Gate: ${passesEvidenceGate ? 'PASSED' : 'FAILED'} (${qualityChunks.length}/${evidenceGateMinChunks} quality chunks)`);
        console.log(`   Top Score: ${(bestScore * 100).toFixed(1)}% (min: ${(evidenceGateMinScore * 100).toFixed(0)}%)`);
        console.log(`   Search Results: ${searchResults.length} total`);
        console.log(`   Policy: clearSources=${clearSourcesOnRefusal}, cleanResponse=${cleanResponseOnRefusal}`);

        // 📊 SOURCE TYPE BREAKDOWN for debugging
        const refusalSourceTypes: Record<string, number> = {};
        searchResults.forEach(r => {
          const rawType = (r.source_type || r.sourceTable || r.category || r.metadata?.source_type || 'unknown').toLowerCase();
          const type = rawType.replace(/^csv_/, '').replace(/_/g, '');
          refusalSourceTypes[type] = (refusalSourceTypes[type] || 0) + 1;
        });
        console.log(`   📊 Source types: ${JSON.stringify(refusalSourceTypes)}`);

        // 🎯 TOPIC ENTITIES extracted from query (using domain config)
        const refusalTopicEntities = this.extractTopicEntities(message, domainConfig.topicEntities);
        console.log(`   🎯 Topic entities: [${refusalTopicEntities.slice(0, 5).join(', ')}]`);

        console.log(`   Original response: "${response.content.substring(0, 200)}..."`);

        // Log which pattern triggered the refusal
        const triggeringPattern = refusalPatterns.find(pattern => {
          const regex = new RegExp(pattern, 'i');
          return regex.test(responseTextLower);
        });
        console.log(`   Triggered by pattern: "${triggeringPattern}"`);

        // ⚠️ WARNING: If this is PROMPT_REFUSAL, the strictModeLevel might be too strict
        if (refusalType === 'PROMPT_REFUSAL') {
          console.log(`⚠️ PROMPT_REFUSAL WARNING: Evidence exists but LLM refused. Consider using strictModeLevel='medium' instead of '${currentStrictLevel}'`);
        }

        // Clear sources if policy enabled
        if (clearSourcesOnRefusal) {
          console.log(`   Clearing ${formattedSources.length} sources`);
          finalSources = [];
        }

        // Clean response text if policy enabled
        if (cleanResponseOnRefusal) {
          finalResponse = this.cleanRefusalResponse(response.content);
          console.log(`   Cleaned response: "${finalResponse.substring(0, 150)}..."`);
        }
      }

      // 🚫 BEHAVIORAL CONTRACT: Clear sources based on responseType (detected earlier)
      // OUT_OF_SCOPE, NOT_FOUND, and NEEDS_CLARIFICATION should NEVER show sources to user
      if (responseType === 'OUT_OF_SCOPE' || responseType === 'NOT_FOUND' || responseType === 'NEEDS_CLARIFICATION') {
        console.log(`🚫 ${responseType}: Clearing all sources per behavioral contract`);
        finalSources = [];
      }

      // Log sources content for debugging
      console.log(` Returning ${finalSources.length} sources to frontend`);
      finalSources.forEach((source, idx) => {
        console.log(`  Source ${idx + 1}: title="${source.title?.substring(0, 30)}...", content length=${source.content?.length || 0}, excerpt length=${source.excerpt?.length || 0}`);
      });

      // 8. Generate contextual follow-up questions (async, don't block response)
      let followUpQuestions: string[] = [];
      try {
        followUpQuestions = await this.generateContextualFollowUps(
          message,
          response.content,
          finalSources,
          options.language || 'tr'
        );
      } catch (followUpError) {
        console.error('[FOLLOW-UP] Failed to generate follow-up questions:', followUpError);
        // Continue without follow-up questions
      }

      // 📊 DEBUG INFO: Log response type decision for troubleshooting
      // NOTE: ResponseType is now DETERMINISTIC - no LLM pattern matching
      const debugInfo = {
        responseType,
        queryInScope: isQueryInScope,
        resultsCount: searchResults.length,
        needsClarification,
        clarificationReason: needsClarification ? clarificationReason : null,
        sourcesCount: finalSources.length,
        refusalDetected: isRefusalResponse,
        hasCevap: finalResponse.includes('**CEVAP**'),
        hasAlinti: false, // ALINTI removed from UI
        deterministic: true  // Flag indicating no LLM pattern matching
      };
      console.log(`📊 DEBUG_INFO: ${JSON.stringify(debugInfo)}`);

      // 🏷️ KEYWORDS: Disabled - tags already shown in source cards (Atıflar section)
      // Keywords were redundant with the type badges and metadata shown per source

      // 📝 FOOTNOTES: Disabled - sources already shown in Atıflar section with full metadata
      // Footnotes at end of response were redundant

      return {
        response: finalResponse,  // Use cleaned response if refusal detected
        sources: finalSources,    // Use finalSources (cleared if refusal detected)
        relatedTopics: relatedTopics,
        followUpQuestions: followUpQuestions,
        suggestedQuestions: (response as any).suggestedQuestions,  // Clickable suggestions for NEEDS_CLARIFICATION
        conversationId: convId,
        provider: response.provider,
        model: response.model || response.provider,
        providerDisplayName: getProviderDisplayName(response.provider || '', options.language || 'tr'),
        language: options.language || 'tr',
        fallbackUsed: response.fallbackUsed || false,
        originalModel: activeModel,
        actualProvider: response.provider,
        fastMode: false,
        strictMode: settingsMap.get('ragSettings.strictMode') === 'true',
        usage: response.usage, // Token usage from LLM
        refusalDetected: isRefusalResponse, // Flag for debugging
        // 🎯 Article anchoring metadata for chat interface
        articleQuery: articleQuery ? {
          detected: articleQuery.detected,
          lawCode: articleQuery.law_code,
          articleNumber: articleQuery.article_number,
          exactMatchFound: articleQuery.exact_match_found,
          exactMatchCount: articleQuery.exact_match_count,
          wrongMatchCount: articleQuery.wrong_match_count
        } : null,
        _debug: debugInfo // 📊 Debug field for regression testing
      };
    } catch (error) {
      console.error('RAG chat error:', error);
      throw error;
    }
  }

  /**
   * Clean response text when refusal is detected
   * Removes citation markers, ALINTI blocks, and source references
   * This ensures user sees clean "not found" message without misleading citations
   */
  private cleanRefusalResponse(text: string): string {
    let cleaned = text;

    // Remove [Kaynak X] or [Source X] references (with or without brackets)
    cleaned = cleaned.replace(/\[Kaynak\s*\d+\]/gi, '');
    cleaned = cleaned.replace(/\[Source\s*\d+\]/gi, '');
    cleaned = cleaned.replace(/Kaynak\s*\d+/gi, '');
    cleaned = cleaned.replace(/Source\s*\d+/gi, '');

    // Remove **ALINTI** blocks entirely (from **ALINTI** to next ** or end)
    // Pattern: **ALINTI** ... (everything until next section or double newline)
    cleaned = cleaned.replace(/\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n|$)/gi, '');
    cleaned = cleaned.replace(/\*\*QUOTE\*\*[\s\S]*?(?=\*\*[A-Z]|\n\n|$)/gi, '');

    // Remove "— Tür: ... [Kaynak X]" attribution lines
    cleaned = cleaned.replace(/—\s*Tür:.*$/gm, '');
    cleaned = cleaned.replace(/—\s*Type:.*$/gm, '');

    // Remove orphaned citation numbers like [1], [2], [3]
    cleaned = cleaned.replace(/\[\d+\]/g, '');

    // Remove empty **CEVAP** or **ANSWER** headers if content is removed
    cleaned = cleaned.replace(/\*\*CEVAP\*\*\s*\n\s*\n/gi, '');
    cleaned = cleaned.replace(/\*\*ANSWER\*\*\s*\n\s*\n/gi, '');

    // Clean up multiple newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Trim whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * 🔍 CLEAN NOT_FOUND RESPONSE
   * Formats response for NOT_FOUND case:
   * - CEVAP: Bu konuda kaynaklarda bilgi bulunamadı.
   * - No ALINTI section
   * - No source references
   */
  private cleanNotFoundResponse(text: string, language: string = 'tr'): string {
    // Extract the core "not found" message if present, otherwise use default
    const notFoundMessage = language === 'tr'
      ? 'Bu konuda kaynaklarda bilgi bulunamadı.'
      : 'No information found in the sources for this topic.';

    // Check if there's useful context in the original response
    // (e.g., "Vergi levhası hakkında kaynaklarda bilgi bulunamadı")
    const contextMatch = text.match(/(?:hakkında|konusunda|ile ilgili).*(?:bulunamadı|yok)/i);

    if (contextMatch) {
      // Keep the contextual not found message
      let cleaned = text;
      // Remove ALINTI section
      cleaned = cleaned.replace(/\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '');
      cleaned = cleaned.replace(/\*\*QUOTE\*\*[\s\S]*?(?=\*\*[A-Z]|\n\n\n|$)/gi, '');
      // Remove source references
      cleaned = cleaned.replace(/\[Kaynak\s*\d+\]/gi, '');
      cleaned = cleaned.replace(/\[\d+\]/g, '');
      // Clean up
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

      // Ensure CEVAP header
      if (!cleaned.includes('**CEVAP**')) {
        cleaned = '**CEVAP**\n' + cleaned;
      }
      return cleaned;
    }

    // Default NOT_FOUND format
    return '**CEVAP**\n' + notFoundMessage;
  }

  /**
   * 🤔 GENERATE CLARIFICATION RESPONSE (Google-style "Did you mean?")
   * Creates a response asking user to clarify their question
   * Uses smart detection for typos, partial terms, and number-based queries
   * Returns both text response and clickable suggestion cards
   * sources=[] to avoid misleading results
   */
  private generateClarificationResponse(query: string, language: string = 'tr'): { text: string; suggestions: string[] } {
    const queryLower = query.toLowerCase().trim();
    const didYouMean: string[] = [];
    const clarifyQuestions: string[] = [];

    // ========================================
    // 🔢 NUMBER-BASED QUERIES (Law/Article numbers)
    // ========================================
    const numberMatch = query.match(/^(\d{3,5})$/);
    if (numberMatch) {
      const num = numberMatch[1];
      // Known tax law numbers
      const knownLaws: Record<string, string> = {
        '213': 'Vergi Usul Kanunu (VUK)',
        '193': 'Gelir Vergisi Kanunu (GVK)',
        '5520': 'Kurumlar Vergisi Kanunu (KVK)',
        '3065': 'Katma Değer Vergisi Kanunu (KDVK)',
        '6111': '6111 sayılı Torba Kanun (Vergi affı)',
        '7143': '7143 sayılı Yapılandırma Kanunu',
        '7256': '7256 sayılı Yapılandırma Kanunu',
        '7326': '7326 sayılı Matrah Artırımı Kanunu',
        '488': 'Damga Vergisi Kanunu',
        '4760': 'Özel Tüketim Vergisi Kanunu (ÖTV)',
      };

      if (knownLaws[num]) {
        didYouMean.push(`"${knownLaws[num]}" hakkında mı soruyorsunuz?`);
        didYouMean.push(`${num} sayılı kanunun hangi maddesi?`);
      } else {
        didYouMean.push(`${num} sayılı bir kanun mu?`);
        didYouMean.push(`${num} numaralı bir madde veya tebliğ mi?`);
      }
    }

    // ========================================
    // 🔤 TYPO DETECTION & CORRECTION
    // ========================================
    const typoCorrections: Array<{ pattern: RegExp; correction: string; suggestion: string }> = [
      { pattern: /\bverg[iı]?\b/i, correction: 'vergi', suggestion: 'Vergi ile ilgili ne öğrenmek istiyorsunuz?' },
      { pattern: /\bkdv\b/i, correction: 'KDV', suggestion: 'KDV oranı, KDV iadesi, veya KDV beyannamesi mi?' },
      { pattern: /\bbeyan\b/i, correction: 'beyanname', suggestion: 'Hangi beyanname? (KDV, Muhtasar, Gelir, Kurumlar)' },
      { pattern: /\blevh?a\b/i, correction: 'vergi levhası', suggestion: 'Vergi levhası asma zorunluluğu mu, tasdiki mi?' },
      { pattern: /\bfatur\b/i, correction: 'fatura', suggestion: 'E-fatura mı, kağıt fatura mı, fatura düzenleme mi?' },
      { pattern: /\btevk[iı]f\b/i, correction: 'tevkifat', suggestion: 'KDV tevkifatı mı, gelir vergisi tevkifatı mı?' },
      { pattern: /\bstop[aı]j\b/i, correction: 'stopaj', suggestion: 'Stopaj oranı mı, stopaj iadesi mi?' },
      { pattern: /\bmuaf[iı]?y?e?t?\b/i, correction: 'muafiyet', suggestion: 'Hangi vergiden muafiyet? (KDV, Damga, Gelir)' },
      { pattern: /\b[iı]st[iı]sna\b/i, correction: 'istisna', suggestion: 'Hangi vergi istisnası?' },
      { pattern: /\bmatra[hğ]?\b/i, correction: 'matrah', suggestion: 'Matrah artırımı mı, matrah hesabı mı?' },
    ];

    for (const { pattern, suggestion } of typoCorrections) {
      if (pattern.test(queryLower) && !didYouMean.includes(suggestion)) {
        clarifyQuestions.push(suggestion);
      }
    }

    // ========================================
    // 📝 SINGLE WORD QUERIES
    // ========================================
    if (queryLower.split(/\s+/).length === 1 && !numberMatch) {
      const singleWordExpansions: Record<string, string[]> = {
        'kdv': ['KDV oranı nedir?', 'KDV iadesi nasıl alınır?', 'KDV beyannamesi ne zaman verilir?'],
        'fatura': ['E-fatura zorunluluğu', 'Fatura düzenleme süresi', 'Fatura iptal prosedürü'],
        'beyanname': ['KDV beyannamesi', 'Muhtasar beyanname', 'Yıllık gelir vergisi beyannamesi'],
        'levha': ['Vergi levhası asma zorunluluğu', 'Vergi levhası fotokopisi asılabilir mi?'],
        'stopaj': ['Stopaj oranları', 'Stopaj kesintisi nasıl yapılır?'],
        'tevkifat': ['KDV tevkifat oranları', 'Tevkifat uygulaması'],
        'iade': ['KDV iadesi', 'Gelir vergisi iadesi', 'ÖTV iadesi'],
      };

      const expansions = singleWordExpansions[queryLower];
      if (expansions) {
        didYouMean.push(...expansions.slice(0, 3));
      }
    }

    // ========================================
    // 🤷 VAGUE QUESTIONS
    // ========================================
    if (/^(ne|nasıl|nedir|neden|kim|hangi)\s*\??$/i.test(query)) {
      clarifyQuestions.push(
        'Hangi konu hakkında bilgi istiyorsunuz?',
        'Vergi türü belirtir misiniz? (KDV, Gelir, Kurumlar, Damga)',
        'Belirli bir işlem veya belge hakkında mı?'
      );
    }

    // ========================================
    // 📋 BUILD RESPONSE
    // ========================================
    const allSuggestions = [...didYouMean, ...clarifyQuestions];

    // Fallback if no specific suggestions
    if (allSuggestions.length === 0) {
      allSuggestions.push(
        'Hangi vergi türü? (KDV, Gelir Vergisi, Kurumlar Vergisi)',
        'Belirli bir mevzuat veya tebliğ numarası var mı?',
        'Ne tür bir işlem? (beyanname, iade, muafiyet, tevkifat)'
      );
    }

    const limitedSuggestions = allSuggestions.slice(0, 4);

    // Format suggestions as clickable questions (ensure they end with ?)
    const clickableSuggestions = limitedSuggestions.map(s => {
      // Clean up and format as a proper question
      const cleaned = s.replace(/^\d+\.\s*/, '').trim();
      // If it's a question already, keep it; otherwise add ?
      return cleaned.endsWith('?') ? cleaned : `${cleaned}?`;
    });

    if (language === 'tr') {
      const header = didYouMean.length > 0
        ? `🔍 **Bunu mu demek istediniz?**`
        : `❓ **Sorunuzu anlamam için daha fazla bilgi gerekiyor**`;

      const text = `${header}\n\n` +
        limitedSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        `\n\n_💡 İpucu: Aşağıdaki önerilerden birini tıklayabilir veya kendi sorunuzu yazabilirsiniz._`;

      return { text, suggestions: clickableSuggestions };
    } else {
      const header = didYouMean.length > 0
        ? `🔍 **Did you mean?**`
        : `❓ **I need more information to understand your question**`;

      const text = `${header}\n\n` +
        limitedSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        `\n\n_💡 Tip: Click one of the suggestions below or type your own question._`;

      return { text, suggestions: clickableSuggestions };
    }
  }

  /**
   * 📝 QUERY REWRITING - Domain Synset Expansion
   * Expands short/numeric queries with related domain terms
   * Example: "6111" → "6111 kanun VUK 5 vergi levhası"
   *
   * This improves recall for queries that may have related concepts
   * the user didn't explicitly mention but are relevant for search.
   */
  private rewriteQuery(query: string): { rewritten: string; expanded: boolean; additions: string[] } {
    const queryLower = query.toLowerCase().trim();
    const additions: string[] = [];

    // Domain synset mapping: short term -> related expansion terms
    // This is loaded once and can be extended via database config
    const DOMAIN_SYNSETS: Record<string, string[]> = {
      // Tax law numbers and their related concepts
      '6111': ['vergi yapılandırma', 'VUK 5', 'vergi levhası', 'af kanunu'],
      '6736': ['vergi barışı', 'yapılandırma', 'matrah artırımı'],
      '7143': ['vergi yapılandırma', 'borç yapılandırma'],
      '7256': ['vergi barışı', 'yapılandırma'],
      '7326': ['matrah artırımı', 'vergi yapılandırma', 'af'],
      '5520': ['kurumlar vergisi', 'kurumlar vergisi kanunu'],
      '193': ['gelir vergisi kanunu', 'GVK'],
      '213': ['vergi usul kanunu', 'VUK'],
      '3065': ['KDV kanunu', 'katma değer vergisi'],
      '4760': ['ÖTV kanunu', 'özel tüketim vergisi'],

      // Common short terms and their expansions
      'vuk': ['vergi usul kanunu', '213'],
      'gvk': ['gelir vergisi kanunu', '193'],
      'kdv': ['katma değer vergisi', '3065', 'KDV oranı', 'KDV indirimi'],
      'ötv': ['özel tüketim vergisi', '4760'],
      'kvk': ['kurumlar vergisi kanunu', '5520'],

      // Specific document/concept expansions
      'levha': ['vergi levhası', 'levha asma', 'levha zorunluluğu', 'VUK 5'],
      'fatura': ['fatura düzenleme', 'fatura zorunluluğu', 'e-fatura'],
      'defter': ['defter tutma', 'yasal defter', 'bilanço esası'],
      'beyanname': ['vergi beyannamesi', 'beyanname verme', 'beyan süresi'],
      'muafiyet': ['vergi muafiyeti', 'istisna', 'muaf'],
      'istisna': ['vergi istisnası', 'muafiyet'],
      'ceza': ['vergi cezası', 'usulsüzlük cezası', 'gecikme faizi'],
      'uzlaşma': ['vergi uzlaşması', 'tarhiyat', 'uzlaşma komisyonu'],
    };

    // Check if query contains any synset keys
    let rewritten = query;
    let expanded = false;

    for (const [key, expansions] of Object.entries(DOMAIN_SYNSETS)) {
      // Match whole word or number
      const keyPattern = new RegExp(`\\b${key}\\b`, 'i');
      if (keyPattern.test(queryLower)) {
        // Add expansions that aren't already in the query
        for (const expansion of expansions) {
          if (!queryLower.includes(expansion.toLowerCase())) {
            additions.push(expansion);
          }
        }
        expanded = true;
      }
    }

    // Only add expansions if query is short (likely a search term, not a full question)
    if (expanded && query.trim().split(/\s+/).length <= 5 && additions.length > 0) {
      // Limit to top 3 most relevant expansions
      const topAdditions = additions.slice(0, 3);
      rewritten = `${query} ${topAdditions.join(' ')}`;
      console.log(`[QUERY-REWRITE] Expanded: "${query}" → "${rewritten}"`);
    } else if (expanded) {
      console.log(`[QUERY-REWRITE] Skip expansion for long query (${query.split(/\s+/).length} words)`);
    }

    return { rewritten, expanded, additions };
  }

  /**
   * 📋 DOCUMENT-TYPE SECTION FINDER
   * Extracts the relevant ruling section based on document type
   * Different document types have rulings in different locations:
   * - Özelge: "Açıklamalar", "Bu durumda", "Sonuç", "Cevap" sections (NOT "Konu:")
   * - Danıştay: "HÜKÜM", "SONUÇ", "Karar" sections
   * - Kanun/Tebliğ: "Madde" (Article) numbered sections
   */
  private extractRulingSection(content: string, sourceType: string): string {
    const sourceTypeLower = (sourceType || '').toLowerCase();

    // Document type detection and ruling section extraction
    if (sourceTypeLower.includes('ozelge') || sourceTypeLower.includes('özelge')) {
      // ÖZELGE: Ruling is in Açıklamalar/Sonuç/Cevap sections
      // Match section headers like "Açıklamalar:", "AÇIKLAMALAR:", "Sonuç olarak", "Cevap:"
      const ozelgeSectionPatterns = [
        // "Açıklamalar" section (most common for rulings)
        /(?:açıklamalar?|AÇIKLAMALAR?)[\s:]*([^]*?)(?=(?:sonuç|değerlendirme|kaynakça|ekler|tarih|sayı)[\s:]|$)/i,
        // "Bu durumda" paragraph (often contains the verdict)
        /(?:bu\s+durumda|bu\s+çerçevede|sonuç\s+olarak)[\s:,]*([^]*?)(?=(?:\n\n|\r\n\r\n|$))/i,
        // "Sonuç" section
        /(?:sonuç|SONUÇ)[\s:]*([^]*?)(?=(?:ekler|kaynakça|tarih|sayı)|$)/i,
        // "Cevap" section
        /(?:cevap|CEVAP)[\s:]*([^]*?)(?=(?:\n\n|\r\n\r\n|ekler|$))/i
      ];

      for (const pattern of ozelgeSectionPatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim().length > 50) {
          console.log('[SECTION-FINDER] Extracted Özelge ruling section: ' + match[1].substring(0, 50) + '...');
          return match[1].trim();
        }
      }
    }

    if (sourceTypeLower.includes('danistay') || sourceTypeLower.includes('danıştay')) {
      // DANIŞTAY: Ruling is in HÜKÜM/SONUÇ/Karar sections
      const danistaySectionPatterns = [
        // "HÜKÜM" section (formal verdict)
        /(?:HÜKÜM|hüküm|Hüküm)[\s:]*([^]*?)(?=(?:başkan|üye|katılan|tarih|imza)|$)/i,
        // "SONUÇ" section
        /(?:SONUÇ|sonuç|Sonuç)[\s:]*([^]*?)(?=(?:başkan|üye|katılan|hüküm|tarih)|$)/i,
        // "Karar" paragraph (often contains verdict)
        /(?:karara\s+bağlanmıştır|karar\s+verilmiştir|hükmedilmiştir)([^]*?)(?=(?:\n\n|\r\n\r\n|$))/i,
        // Match around "hükmedilmiştir" verb (key verdict indicator)
        /([^.]*(?:reddine|kabulüne|bozulmasına|onanmasına|hükmedilmiştir)[^.]*\.)/i
      ];

      for (const pattern of danistaySectionPatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim().length > 30) {
          console.log('[SECTION-FINDER] Extracted Danıştay ruling section: ' + match[1].substring(0, 50) + '...');
          return match[1].trim();
        }
      }
    }

    if (sourceTypeLower.includes('kanun') || sourceTypeLower.includes('tebli')) {
      // KANUN/TEBLİĞ: Content is in numbered Madde sections
      // Extract Madde (Article) content
      const kanunSectionPatterns = [
        // "Madde X -" format
        /(?:madde\s*\d+)\s*[-–]\s*([^]*?)(?=(?:madde\s*\d+|$))/i,
        // "X. Madde" or "Madde X:" format
        /(?:\d+\.?\s*madde|madde\s*\d+:?)\s*([^]*?)(?=(?:\d+\.?\s*madde|madde\s*\d+|$))/i
      ];

      for (const pattern of kanunSectionPatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim().length > 30) {
          console.log('[SECTION-FINDER] Extracted Kanun/Tebliğ article section: ' + match[1].substring(0, 50) + '...');
          return match[1].trim();
        }
      }
    }

    // ========================================
    // 🔄 FALLBACK: Extract verdict-containing sentences when section headers not found
    // ========================================
    // If no explicit section headers found, look for sentences containing verdict patterns
    const FALLBACK_VERDICT_PATTERNS = [
      /bu\s+durumda[^.]*\./gi,           // "Bu durumda ... ."
      /sonuç\s+olarak[^.]*\./gi,         // "Sonuç olarak ... ."
      /uygun\s+görülmüştür[^.]*\./gi,    // "... uygun görülmüştür."
      /mümkün\s+(?:değildir|bulunmaktadır)[^.]*\./gi,  // "... mümkün değildir/bulunmaktadır."
      /mümkündür[^.]*\./gi,              // "... mümkündür."
      /gerekmektedir[^.]*\./gi,          // "... gerekmektedir."
      /zorunludur[^.]*\./gi,             // "... zorunludur."
      /yasaktır[^.]*\./gi,               // "... yasaktır."
      /asılabilir[^.]*\./gi,             // "... asılabilir."
      /bulundurulabilir[^.]*\./gi,       // "... bulundurulabilir."
      /kaldırılmıştır[^.]*\./gi          // "... kaldırılmıştır."
    ];

    const verdictSentences: string[] = [];
    for (const pattern of FALLBACK_VERDICT_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        verdictSentences.push(...matches);
      }
    }

    if (verdictSentences.length > 0) {
      // Return the first few verdict-containing sentences (max 3)
      const extracted = verdictSentences.slice(0, 3).join(' ');
      console.log('[SECTION-FINDER] Extracted fallback verdict sentences: ' + extracted.substring(0, 50) + '...');
      return extracted;
    }

    // Default: return full content if no specific section or verdict patterns found
    return content;
  }

  /**
   * Fix markdown formatting and remove hallucinated citations
   *
   * Ensures proper markdown rendering:
   * 1. Add blank lines before/after ## headings (required for markdown)
   * 2. Remove hallucinated citations beyond available sources
   *
   * Note: Citations stay simple [1], [2] in text.
   * Source details displayed in frontend sources section.
   *
   * @param response - LLM response text
   * @param sources - Source objects with metadata
   * @returns Fixed response text
   */
  private fixMarkdownAndCitations(response: string, sources: any[]): string {
    let fixed = response;

    // 1. Ensure blank lines before ## headings
    fixed = fixed.replace(/([^\n])\n?(##\s)/g, '$1\n\n$2');

    // 2. Ensure blank lines after ## headings
    fixed = fixed.replace(/(##[^\n]+)\n([^\n])/g, '$1\n\n$2');

    // 3. Remove hallucinated citations (beyond available sources)
    const maxCitations = sources.length;
    if (maxCitations > 0) {
      for (let i = maxCitations + 1; i <= 20; i++) {
        const pattern = new RegExp(`\\[${i}\\]`, 'g');
        fixed = fixed.replace(pattern, '');
      }
    }

    return fixed;
  }

  /**
   * 🔧 AUTO-FIX DATE CITATIONS v12
   *
   * Automatically adds citations to sentences containing date claims but no citations.
   * This prevents sanitizer from removing valid date information when model forgets to cite.
   *
   * Flow:
   * 1. Split response into sentences
   * 2. For each sentence with date pattern but no citation:
   *    a. Extract the date value (e.g., "24" from "24'üne" or "yirmidördüncü")
   *    b. Search sources for that date (digit or word form)
   *    c. If found, append citation [n] to the sentence
   * 3. Rejoin sentences
   *
   * @param response - LLM response text
   * @param sources - Source objects to search for dates
   * @param language - Response language ('tr' or 'en')
   */
  private autoFixDateCitations(response: string, sources: any[], language: string = 'tr'): string {
    if (!response || !sources.length) return response;

    // Get language pack for number word normalization
    const langPack = getSanitizerLangPack(language);

    // Date patterns to detect
    const digitDatePattern = /(\d+)['''][ıiuüsSnN]?[a-zğüşıöçA-ZĞÜŞİÖÇ]*/gi;
    const wordDatePattern = langPack?.numberWords?.ordinals
      ? new RegExp(`\\b(${Object.keys(langPack.numberWords.ordinals).sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
      : null;

    // Citation pattern
    const hasCitation = /\[\d+\]/;

    // Split into sentences
    const sentences = response.split(/(?<=[.!?])\s+/);
    let fixCount = 0;

    const fixedSentences = sentences.map(sentence => {
      // Skip if already has citation
      if (hasCitation.test(sentence)) return sentence;

      // Check for digit date (24'üne, 26'sına)
      let dateMatch = sentence.match(digitDatePattern);
      let dateValue: number | null = null;

      if (dateMatch) {
        dateValue = parseInt(dateMatch[0].replace(/[^\d]/g, ''), 10);
      } else if (wordDatePattern) {
        // Check for word date (yirmidördüncü)
        const wordMatch = sentence.match(wordDatePattern);
        if (wordMatch && langPack?.numberWords?.ordinals) {
          const normalizedWord = wordMatch[0].toLowerCase().replace(/\s+/g, '');
          dateValue = langPack.numberWords.ordinals[normalizedWord] || null;
        }
      }

      // No date found, return as-is
      if (!dateValue) return sentence;

      // Search sources for this date
      for (let i = 0; i < sources.length; i++) {
        const sourceText = (sources[i].content || sources[i].excerpt || '').toLowerCase();

        // Check for digit form
        const hasDigitForm = sourceText.includes(dateValue.toString());

        // Check for word form using normalization
        const normalizedSource = normalizeNumberWords(sourceText, language);
        const hasWordForm = normalizedSource.includes(dateValue.toString());

        if (hasDigitForm || hasWordForm) {
          // Found matching source - add citation
          const citationNum = i + 1;
          const trimmed = sentence.trimEnd();
          const punctuation = trimmed.match(/[.!?]$/) ? '' : '.';
          const fixed = `${trimmed}${punctuation} [${citationNum}]`;
          fixCount++;
          console.log(`[DATE-AUTOFIX] Added citation [${citationNum}] for date "${dateValue}" in: "${sentence.substring(0, 50)}..."`);
          return fixed;
        }
      }

      // Date not found in any source - return as-is (sanitizer will remove if appropriate)
      return sentence;
    });

    if (fixCount > 0) {
      console.log(`[DATE-AUTOFIX] Auto-fixed ${fixCount} sentences with date claims`);
    }

    return fixedSentences.join(' ');
  }

  /**
   * 🕐 DEADLINE HEADER-ONLY FIX v12
   *
   * Fixes responses where model only generates header (Konu:) without actual content.
   * This happens with deadline questions where the model gets stuck in format mode.
   *
   * Detection:
   * - Question contains deadline keywords (kaçına kadar, ne zamana kadar, etc.)
   * - Response is too short or only contains headers
   * - Sources contain deadline information (yirmidördüncü, 24, 21, 26, etc.)
   *
   * Fix:
   * - Extract deadline info directly from sources
   * - Generate simple, direct answer with citation
   *
   * @param response - LLM response text
   * @param sources - Source objects
   * @param query - Original user query
   * @param language - Response language
   */
  /**
   * 🎯 DEADLINE INTENT TYPES - Dynamic detection
   */
  private readonly DEADLINE_INTENTS = {
    beyanname: {
      keywords: ['beyanname', 'verilir', 'verilme', 'beyan', 'bildirim'],
      articles: ['madde 41', 'm.41', 'm. 41'],
      action: 'verilmelidir',
      subject: 'KDV beyannamesi'
    },
    odeme: {
      // v12.15: Expanded keywords to catch more ödeme variants
      // v12.30: Added ASCII variants (ö→o, ı→i, ş→s, ğ→g)
      keywords: [
        'ödeme', 'ödenir', 'ödemesi', 'ödemesini', 'ödenmesi', 'öden',
        'odeme', 'odenir', 'odemesi', 'odemesini', 'odenmesi', 'oden',  // ASCII variants
        'yatırılır', 'yatırma', 'yatırılma', 'yatır',
        'yatirilir', 'yatirma', 'yatirilma', 'yatir',  // ASCII variants
        'ödeyeceğ', 'ödeye', 'ödeniyor', 'ödenmekte',
        'odeyeceg', 'odeye', 'odeniyor', 'odenmekte'   // ASCII variants
      ],
      articles: ['madde 46', 'm.46', 'm. 46'],
      action: 'ödenmelidir',
      subject: 'KDV'
    }
  };

  /**
   * 🎯 v12.23: VUK REGULATORY INTENTS - VUK deadline/timeline detection
   * These are known factual deadlines from Vergi Usul Kanunu
   */
  private readonly VUK_REGULATORY_INTENTS: Record<string, {
    keywords: string[];
    articles: string[];
    answer: string;
    citation: string;
  }> = {
    fatura_duzenleme: {
      keywords: ['fatura düzenleme', 'fatura düzenle', 'fatura ne zaman', 'fatura süresi', 'fatura kaç gün'],
      articles: ['madde 231', 'm.231', 'vuk 231'],
      answer: 'Fatura, malın teslimi veya hizmetin yapıldığı tarihten itibaren azami **7 (yedi) gün** içinde düzenlenir',
      citation: 'VUK madde 231/5'
    }
  };

  /**
   * 🎯 DEADLINE TOKEN MAP - Turkish ordinal numbers for days
   */
  private readonly DEADLINE_TOKENS: Record<string, { day: number; word: string }> = {
    'yirmibirinci': { day: 21, word: 'yirmibirinci' },
    'yirmidördüncü': { day: 24, word: 'yirmidördüncü' },
    'yirmialtıncı': { day: 26, word: 'yirmialtıncı' },
    'yirmisekizinci': { day: 28, word: 'yirmisekizinci' }
  };

  private fixDeadlineHeaderOnly(
    response: string,
    sources: any[],
    query: string,
    language: string = 'tr'
  ): string {
    // 1. Detect deadline intent type (beyanname vs ödeme)
    const intentType = this.detectDeadlineIntent(query);
    if (!intentType) return response;

    // 2. Check if response is header-only, too short, or missing the deadline token
    const contentWithoutHeaders = response
      .replace(/\*\*Konu:\*\*[^\n]*/gi, '')
      .replace(/\*\*Anahtar Terimler:\*\*[^\n]*/gi, '')
      .replace(/\*\*Dayanaklar:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
      .replace(/\*\*Değerlendirme:\*\*/gi, '')
      .trim();

    // Check if response contains any deadline token (21, 24, 26 or Turkish words)
    const hasDeadlineInResponse = this.responseContainsDeadline(response);
    const isHeaderOnly = contentWithoutHeaders.length < 100;
    const needsFix = isHeaderOnly || !hasDeadlineInResponse;

    if (!needsFix) return response;

    console.log(`[DEADLINE-FIX] ${isHeaderOnly ? 'Header-only' : 'Missing deadline token'} detected for ${intentType} question`);

    // 3. Search sources for deadline info matching the intent
    const deadlineInfo = this.extractDeadlineFromSources(sources, intentType);

    if (!deadlineInfo) {
      console.log(`[DEADLINE-FIX] No deadline info found in sources for ${intentType}`);
      return response;
    }

    // 4. Generate direct answer based on intent type
    const directAnswer = this.generateDeadlineAnswer(deadlineInfo, intentType, language);

    if (directAnswer) {
      console.log(`[DEADLINE-FIX] Generated ${intentType} answer: day=${deadlineInfo.day}, source=[${deadlineInfo.sourceIndex}]`);
      // Prepend to existing response or replace if too short
      if (contentWithoutHeaders.length < 30) {
        return directAnswer;
      } else {
        return directAnswer + '\n\n' + response;
      }
    }

    return response;
  }

  /**
   * v12.15: Detect verification questions with WRONG dates
   * E.g., "KDV beyannamesi 26'sına kadar verilir mi?" → should correct to 24
   * Returns the wrong date mentioned and the correct date for the intent
   */
  private detectWrongDateVerification(query: string): {
    intent: 'beyanname' | 'odeme';
    wrongDate: number;
    correctDate: number;
  } | null {
    const queryLower = query.toLowerCase();

    // Check if it's a verification question (mi/mı/mu/mü at the end or "verilir mi", "ödenir mi")
    const isVerificationQuestion = /\b(mi|mı|mu|mü)\b\s*\??$/i.test(query) ||
                                   /(verilir|ödenir|yapılır|yatırılır)\s*(mi|mı|mu|mü)/i.test(query);

    if (!isVerificationQuestion) return null;

    // Check for beyanname context
    const isBeyanname = /beyanname|beyan|bildirim|verilir/i.test(query);
    const isOdeme = /ödeme|öde[nm]|yatır/i.test(query);

    // Extract the date mentioned in the question
    const dateMatch = query.match(/(\d+)[''']?\s*(ın|in|ün|un|sın|sin|sına|sine|ına|ine)/i) ||
                      query.match(/(\d+)\s*gün/i);

    if (!dateMatch) return null;

    const mentionedDate = parseInt(dateMatch[1]);

    // Determine the correct date based on intent
    if (isBeyanname && !isOdeme) {
      const correctDate = 24;
      if (mentionedDate !== correctDate && [21, 26, 28].includes(mentionedDate)) {
        return { intent: 'beyanname', wrongDate: mentionedDate, correctDate };
      }
    } else if (isOdeme && !isBeyanname) {
      const correctDate = 26;
      if (mentionedDate !== correctDate && [21, 24, 28].includes(mentionedDate)) {
        return { intent: 'odeme', wrongDate: mentionedDate, correctDate };
      }
    }

    return null;
  }

  /**
   * Detect deadline intent type from query
   * v12.15 FIX: Added KDV scope check to prevent other tax types from triggering KDV fallback
   * v12.15 FIX: Added 'ambiguous' return for questions that need clarification
   * v12.31 FIX: Use robust fuzzy matching for typo tolerance
   */
  private detectDeadlineIntent(query: string): 'beyanname' | 'odeme' | 'ambiguous' | null {
    const queryLower = query.toLowerCase();

    // v12.31: Use robust deadline keyword detection with fuzzy matching
    const hasDeadlineKeyword = this.hasDeadlineKeywordRobust(query);

    // v12.16: Also detect implicit deadline questions that compare 24/26
    // E.g., "KDV beyanname 24 mü 26 mı?" - no explicit "ne zaman" but clearly asking about deadlines
    const hasComparisonPattern = /24\s*(mı?|mi|mu|mü)?\s*(yoksa|veya)?\s*26/i.test(queryLower) ||
                                  /26\s*(mı?|mi|mu|mü)?\s*(yoksa|veya)?\s*24/i.test(queryLower);

    const isDeadlineQuestion = hasDeadlineKeyword || hasComparisonPattern;

    if (!isDeadlineQuestion) {
      console.log(`🔍 [v12.31] DEADLINE_CHECK: No deadline pattern found in "${query}"`);
      return null;
    }

    console.log(`🔍 [v12.31] DEADLINE_CHECK: Deadline pattern detected in "${query}"`);


    // 🛡️ v12.15 SCOPE CHECK: This handler is ONLY for KDV questions
    // Check if query mentions KDV explicitly
    const isKdvQuestion = queryLower.includes('kdv') ||
                          queryLower.includes('katma değer') ||
                          queryLower.includes('kdvk');

    // Check for OTHER tax types that should NOT trigger KDV handler
    const otherTaxKeywords = [
      'damga', 'damga vergisi',     // Damga Vergisi
      'gelir vergisi', 'gvk',       // Gelir Vergisi
      'kurumlar', 'kurumlar vergisi', 'kvk', // Kurumlar Vergisi
      'emlak', 'emlak vergisi',     // Emlak Vergisi
      'motorlu taşıt', 'mtv',       // MTV
      'ötv', 'özel tüketim',        // ÖTV
      'veraset', 'intikal',         // Veraset ve İntikal Vergisi
      'stopaj', 'tevkifat',         // Stopaj (unless with KDV context)
      'muhtasar'                    // Muhtasar beyanname
    ];

    const isOtherTaxQuestion = otherTaxKeywords.some(kw => queryLower.includes(kw));

    // If it's another tax type question (not KDV), don't apply KDV handler
    if (isOtherTaxQuestion && !isKdvQuestion) {
      console.log(`🛡️ [v12.15] SCOPE_CHECK: Other tax detected (not KDV), skipping deadline handler`);
      return null;
    }

    // v12.15: Detect AMBIGUOUS questions that ask about both or compare 24/26
    const ambiguousPatterns = [
      /24\s*(mı?|mi|mu|mü)?\s*(yoksa|veya)?\s*26/i,    // "24 mü 26 mı?"
      /26\s*(mı?|mi|mu|mü)?\s*(yoksa|veya)?\s*24/i,    // "26 mı 24 mü?"
      /beyanname\s*(mı?|mi)?\s*(yoksa|veya)?\s*ödeme/i, // "beyanname mi ödeme mi?"
      /ödeme\s*(mi|mı)?\s*(yoksa|veya)?\s*beyanname/i,  // "ödeme mi beyanname mi?"
      /son\s*gün\s*ne\s*zaman/i                          // "son gün ne zaman?" (too generic)
    ];

    const isAmbiguousQuestion = ambiguousPatterns.some(pattern => pattern.test(queryLower));

    // v12.16 FIX: If comparison pattern (24 mü 26 mı) is detected, ALWAYS return ambiguous
    // because the user is confused about which day applies - they need BOTH explained
    // This overrides even explicit "beyanname" or "ödeme" keywords in the question
    if (isKdvQuestion && hasComparisonPattern) {
      console.log(`🛡️ [v12.16] COMPARISON_PATTERN: User is confused about 24 vs 26, returning ambiguous`);
      return 'ambiguous';
    }

    // v12.31: Use robust fuzzy matching for beyanname/odeme detection
    const hasExplicitBeyanname = this.hasBeyanKeywordRobust(query);
    const hasExplicitOdeme = this.hasOdemeKeywordRobust(query);

    if (isKdvQuestion && isAmbiguousQuestion && !hasExplicitBeyanname && !hasExplicitOdeme) {
      console.log(`🛡️ [v12.15] AMBIGUOUS_QUESTION: KDV deadline question without specific intent`);
      return 'ambiguous';
    }

    // v12.31: Check for ödeme (payment) intent with robust matching
    const isOdeme = hasExplicitOdeme ||
                    this.DEADLINE_INTENTS.odeme.articles.some(art => queryLower.includes(art));

    // v12.15: For KDV questions, check if it's asking about payment specifically
    if (isKdvQuestion && isOdeme) {
      console.log(`🔍 [v12.31] INTENT_DETECTED: odeme (KDV payment deadline)`);
      return 'odeme';
    }

    // v12.31: Check for beyanname (declaration) intent with robust matching
    const isBeyanname = hasExplicitBeyanname ||
                        this.DEADLINE_INTENTS.beyanname.articles.some(art => queryLower.includes(art));

    // v12.15: For beyanname, require KDV context to avoid matching other beyan types
    if (isKdvQuestion && isBeyanname) {
      console.log(`🔍 [v12.31] INTENT_DETECTED: beyanname (KDV declaration deadline)`);
      return 'beyanname';
    }

    // If only articles mentioned without KDV keyword, still match (m.41, m.46 are KDV specific)
    if (this.DEADLINE_INTENTS.odeme.articles.some(art => queryLower.includes(art))) return 'odeme';
    if (this.DEADLINE_INTENTS.beyanname.articles.some(art => queryLower.includes(art))) return 'beyanname';

    // For generic KDV questions without explicit intent, return ambiguous to provide both answers
    if (isKdvQuestion && !hasExplicitBeyanname && !hasExplicitOdeme) {
      console.log(`🛡️ [v12.31] AMBIGUOUS_QUESTION: Generic KDV deadline question, providing both answers`);
      return 'ambiguous';
    }

    // No KDV context found - don't apply KDV deadline handler
    console.log(`🔍 [v12.31] NO_KDV_CONTEXT: Deadline pattern found but no KDV context`);
    return null;
  }

  /**
   * 🎯 v12.23: Detect VUK regulatory intent (fatura düzenleme süresi, etc.)
   * These are known factual deadlines from Vergi Usul Kanunu
   */
  private detectVukRegulatoryIntent(query: string): string | null {
    const queryLower = query.toLowerCase();

    // Check each VUK regulatory intent
    for (const [intentType, intent] of Object.entries(this.VUK_REGULATORY_INTENTS)) {
      // Check keywords
      const hasKeyword = intent.keywords.some(kw => queryLower.includes(kw));
      if (hasKeyword) {
        console.log(`🛡️ [v12.23] VUK_REGULATORY_INTENT: Detected ${intentType} (keyword match)`);
        return intentType;
      }

      // Check articles
      const hasArticle = intent.articles.some(art => queryLower.includes(art));
      if (hasArticle) {
        console.log(`🛡️ [v12.23] VUK_REGULATORY_INTENT: Detected ${intentType} (article match)`);
        return intentType;
      }
    }

    // Also check for generic "fatura" + "süre/zaman/kaç gün" combinations
    if (queryLower.includes('fatura') &&
        (queryLower.includes('süre') || queryLower.includes('zaman') ||
         queryLower.includes('kaç gün') || queryLower.includes('ne kadar') ||
         queryLower.includes('içinde') || queryLower.includes('kadar'))) {
      console.log(`🛡️ [v12.23] VUK_REGULATORY_INTENT: Detected fatura_duzenleme (generic pattern)`);
      return 'fatura_duzenleme';
    }

    return null;
  }

  /**
   * Check if response already contains a deadline token
   */
  private responseContainsDeadline(response: string): boolean {
    const responseLower = response.toLowerCase();

    // Check Turkish word forms
    for (const token of Object.keys(this.DEADLINE_TOKENS)) {
      if (responseLower.includes(token)) return true;
    }

    // Check digit forms (21, 24, 26, etc.)
    const digitPattern = /\b(21|24|26|28)\b/;
    if (digitPattern.test(response)) return true;

    // Check "ayın X" pattern
    if (/ayın\s*\d+/i.test(response)) return true;

    return false;
  }

  /**
   * Extract deadline info from sources based on intent type
   * v12.3 FIX: Now collects ALL candidates and returns the BEST one based on intent
   */
  private extractDeadlineFromSources(
    sources: any[],
    intentType: 'beyanname' | 'odeme'
  ): { day: number; word: string; sourceIndex: number; articleRef: string } | null {
    const intent = this.DEADLINE_INTENTS[intentType];

    // 🎯 INTENT-SPECIFIC TARGET DAYS
    // beyanname: prefer 24 (genel mükellef), fallback 21 (tevkifat)
    // odeme: prefer 26, fallback 24
    const targetDays: Record<string, number[]> = {
      'beyanname': [24, 21], // 24 first (genel), then 21 (tevkifat)
      'odeme': [26, 24]      // 26 first (ödeme), then 24 (fallback)
    };
    const preferredDays = targetDays[intentType] || [24, 26, 21];

    // Build deadline token patterns
    const tokenPatterns = Object.entries(this.DEADLINE_TOKENS).map(([word, info]) => ({
      pattern: new RegExp(`${word}\\s+(günü?)?\\s*(akşam[ıi]na)?\\s*(kadar)?`, 'gi'),
      ...info
    }));

    // Collect ALL deadline candidates from all sources
    const candidates: Array<{
      day: number;
      word: string;
      sourceIndex: number;
      articleRef: string;
      score: number;
    }> = [];

    for (let i = 0; i < sources.length; i++) {
      const sourceContent = (sources[i].content || sources[i].excerpt || '').toLowerCase();
      const sourceTitle = (sources[i].title || sources[i].source_name || '').toLowerCase();

      // Check if source matches the expected article for this intent
      const matchesArticle = intent.articles.some(art =>
        sourceContent.includes(art) || sourceTitle.includes(art)
      );

      // v12.16 FIX: Robust article reference detection with multiple patterns
      // Use regex with word boundaries to prevent partial matches (e.g., "madde 4" matching "madde 41")
      let articleRef = '';
      const article41Patterns = [
        /madde\s*41\b/i,     // "madde 41", "madde41"
        /m\.\s*41\b/i,       // "m.41", "m. 41"
        /\bm41\b/i           // "m41"
      ];
      const article46Patterns = [
        /madde\s*46\b/i,     // "madde 46", "madde46"
        /m\.\s*46\b/i,       // "m.46", "m. 46"
        /\bm46\b/i           // "m46"
      ];

      const combinedText = sourceContent + ' ' + sourceTitle;
      if (article41Patterns.some(p => p.test(combinedText))) {
        articleRef = 'KDVK m.41';
      } else if (article46Patterns.some(p => p.test(combinedText))) {
        articleRef = 'KDVK m.46';
      }
      // v12.16: Fallback to intent-based article if extraction fails
      if (!articleRef) {
        articleRef = intentType === 'beyanname' ? 'KDVK m.41' : 'KDVK m.46';
        console.log(`[v12.16] ARTICLE_EXTRACT_FALLBACK: Using intent-based article "${articleRef}" for ${intentType}`);
      }

      // Check Turkish word tokens
      for (const tokenInfo of tokenPatterns) {
        tokenInfo.pattern.lastIndex = 0;
        if (tokenInfo.pattern.test(sourceContent)) {
          // Calculate score based on intent match
          let score = 0;
          if (matchesArticle) score += 100; // Article match bonus
          const dayPriority = preferredDays.indexOf(tokenInfo.day);
          if (dayPriority === 0) score += 50;      // First preferred day
          else if (dayPriority === 1) score += 25; // Second preferred day
          else if (dayPriority >= 0) score += 10;  // In preferred list
          // Penalize wrong days for intent
          if (intentType === 'odeme' && tokenInfo.day === 21) score -= 50; // 21 is wrong for ödeme
          if (intentType === 'beyanname' && tokenInfo.day === 26) score -= 50; // 26 is wrong for beyanname

          candidates.push({
            day: tokenInfo.day,
            word: tokenInfo.word,
            sourceIndex: i + 1,
            articleRef,
            score
          });
          console.log(`[DEADLINE-EXTRACT] Candidate: "${tokenInfo.word}" (day ${tokenInfo.day}) in source [${i + 1}], score=${score}`);
        }
      }

      // Check digit patterns
      const digitPattern = /(\d+)[''']?\s*(inci|ıncı|üncü|uncu|nci|ncı|ncü|ncu)?\s*(günü?)/gi;
      let digitMatch;
      while ((digitMatch = digitPattern.exec(sourceContent)) !== null) {
        const day = parseInt(digitMatch[1]);
        if ([21, 24, 26, 28].includes(day)) {
          const wordEntry = Object.entries(this.DEADLINE_TOKENS).find(([_, info]) => info.day === day);
          const word = wordEntry ? wordEntry[1].word : `${day}`;

          let score = 0;
          if (matchesArticle) score += 100;
          const dayPriority = preferredDays.indexOf(day);
          if (dayPriority === 0) score += 50;
          else if (dayPriority === 1) score += 25;
          else if (dayPriority >= 0) score += 10;
          if (intentType === 'odeme' && day === 21) score -= 50;
          if (intentType === 'beyanname' && day === 26) score -= 50;

          candidates.push({ day, word, sourceIndex: i + 1, articleRef, score });
          console.log(`[DEADLINE-EXTRACT] Candidate: day ${day} (digit) in source [${i + 1}], score=${score}`);
        }
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score descending and return the best candidate
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    console.log(`[DEADLINE-EXTRACT] Selected BEST: day=${best.day}, score=${best.score}, source=[${best.sourceIndex}]`);

    return {
      day: best.day,
      word: best.word,
      sourceIndex: best.sourceIndex,
      articleRef: best.articleRef
    };
  }

  /**
   * Generate a direct deadline answer based on intent type
   */
  private generateDeadlineAnswer(
    deadlineInfo: { day: number; word: string; sourceIndex: number; articleRef: string },
    intentType: 'beyanname' | 'odeme',
    language: string
  ): string | null {
    const { day, word, sourceIndex, articleRef } = deadlineInfo;
    const intent = this.DEADLINE_INTENTS[intentType];

    // Format deadline string
    const deadlineStr = `takip eden ayın ${day}'${this.getSuffix(day)} (${word} günü) akşamına kadar`;

    // v12.16 FIX: ROBUST article reference - ALWAYS use known correct articles for KDV intents
    // Don't trust extracted articleRef which can be empty or malformed
    const KDV_ARTICLES: Record<string, string> = {
      'beyanname': 'KDVK madde 41',
      'odeme': 'KDVK madde 46'
    };

    // v12.15 FIX: Build article reference with "madde" instead of "m." to prevent rendering issues
    // v12.16: If extracted articleRef is valid, use it; otherwise fallback to known correct article
    let articleFull = '';
    if (articleRef && articleRef.includes('m.')) {
      articleFull = articleRef.replace(/m\.(\d+)/g, 'madde $1');
    }
    // v12.16: Fallback to known correct article if extraction failed or produced invalid result
    if (!articleFull || !articleFull.includes('madde 4')) {
      articleFull = KDV_ARTICLES[intentType] || '';
      console.log(`[v12.16] ARTICLE_FALLBACK: Using hardcoded article "${articleFull}" for ${intentType} (original articleRef: "${articleRef}")`);
    }
    // v12.20 FIX: Use comma separator instead of parentheses to avoid remarkGfm parsing issues
    // "(KDVK madde 46) [10]" was being parsed incorrectly, "6)" eaten by markdown
    const articleSuffix = articleFull ? `, ${articleFull},` : '';

    if (language === 'tr') {
      if (intentType === 'odeme') {
        return `${intent.subject}, ${deadlineStr} ${intent.action}${articleSuffix} [${sourceIndex}].`;
      } else {
        // beyanname
        let answer = `${intent.subject}, vergilendirme dönemini ${deadlineStr} ilgili vergi dairesine ${intent.action}${articleSuffix} [${sourceIndex}].`;

        // Add withholding agent note if 21st day is involved
        if (day === 21) {
          answer = `Vergi kesintisi yapmakla sorumlu olanlar için ${intent.subject.toLowerCase()}, ${deadlineStr} ${intent.action}${articleSuffix} [${sourceIndex}].`;
        }

        return answer;
      }
    } else {
      if (intentType === 'odeme') {
        return `VAT must be paid by the ${day}th day of the following month${articleSuffix} [${sourceIndex}].`;
      } else {
        return `VAT returns must be submitted by the ${day}th day of the following month${articleSuffix} [${sourceIndex}].`;
      }
    }
  }

  /**
   * Get Turkish suffix for day number
   */
  private getSuffix(day: number): string {
    // Turkish vowel harmony for numbers (extended for v12.15 verification questions)
    const suffixes: Record<number, string> = {
      1: 'i', 2: 'si', 3: 'ü', 4: 'ü', 5: 'i',
      6: 'sı', 7: 'si', 8: 'i', 9: 'u', 10: 'u',
      11: 'i', 12: 'si', 13: 'ü', 14: 'ü', 15: 'i',
      16: 'sı', 17: 'si', 18: 'i', 19: 'u', 20: 'si',
      21: 'i', 22: 'si', 23: 'ü', 24: 'ü', 25: 'i',
      26: 'sı', 27: 'si', 28: 'i', 29: 'u', 30: 'u',
      31: 'i'
    };
    return suffixes[day] || 'i';
  }

  /**
   * 🛡️ v12.5: Find the most relevant source for a specific article query
   * Searches through all sources to find the one that contains the target article
   *
   * @param sources - Array of search results
   * @param lawCode - Law code (VUK, GVK, KDVK, etc.)
   * @param articleNum - Article number as string
   * @returns Object with source and its 1-based index
   */
  private findRelevantSourceForArticle(
    sources: any[],
    lawCode: string,
    articleNum: string
  ): { source: any; index: number } {
    const lawCodeLower = lawCode.toLowerCase();
    const articleNumber = parseInt(articleNum);

    // Build patterns to match the article
    const articlePatterns = [
      new RegExp(`madde\\s*${articleNum}\\b`, 'i'),
      new RegExp(`m\\.?\\s*${articleNum}\\b`, 'i'),
      new RegExp(`${lawCodeLower}.*madde\\s*${articleNum}`, 'i'),
      new RegExp(`${lawCodeLower}.*m\\.?\\s*${articleNum}`, 'i')
    ];

    // Law name patterns for matching source titles/content
    const lawPatterns: Record<string, RegExp> = {
      'vuk': /vergi\s*usul|vuk/i,
      'gvk': /gelir\s*vergisi|gvk/i,
      'kdvk': /katma\s*değer|kdvk/i,
      'kvk': /kurumlar\s*vergisi|kvk/i,
      'aatuhk': /amme\s*alacak|aatuhk/i
    };

    const lawPattern = lawPatterns[lawCodeLower];

    // Score each source
    const scoredSources = sources.map((source, idx) => {
      const title = (source.title || source.source_name || '').toLowerCase();
      const content = (source.content || source.excerpt || '').toLowerCase();
      const combined = title + ' ' + content;

      let score = 0;

      // Check if source mentions the target law
      if (lawPattern && lawPattern.test(combined)) {
        score += 20;
      }

      // Check if source contains the article number
      for (const pattern of articlePatterns) {
        if (pattern.test(combined)) {
          score += 50;
          break;
        }
      }

      // Extra points if title contains the article reference
      if (articlePatterns.some(p => p.test(title))) {
        score += 30;
      }

      // Check for "kanun" or official document indicators
      if (/kanun|yasa|madde\s+\d+/i.test(title)) {
        score += 10;
      }

      return { source, index: idx + 1, score };
    });

    // Sort by score descending
    scoredSources.sort((a, b) => b.score - a.score);

    // Log the scoring for debugging
    if (scoredSources.length > 0) {
      console.log(`[ARTICLE_SOURCE_FINDER] ${lawCode} m.${articleNum}: Best match at [${scoredSources[0].index}] with score ${scoredSources[0].score}`);
      if (scoredSources[0].score === 0) {
        console.log(`[ARTICLE_SOURCE_FINDER] WARNING: No good match found, using top result by default`);
      }
    }

    // Return best match, or first source as fallback
    return scoredSources.length > 0
      ? { source: scoredSources[0].source, index: scoredSources[0].index }
      : { source: sources[0], index: 1 };
  }

  /**
   * 🛡️ v12.7: Check if query is a scenario/case question (Murat senaryoları)
   * Scenarios require full article format with multiple sections
   */
  private isScenarioQuery(query: string): boolean {
    const queryLower = query.toLowerCase();

    // v12.7: Lowered threshold from 100 to 80 for MURAT-2/3 scenarios
    if (query.length < 80) return false;

    // v12.8: Scenario indicators with labels for debugging
    const scenarioPatterns: Array<{ pattern: RegExp; label: string }> = [
      // Company/entity references
      { pattern: /firmam[ıi]z/i, label: 'firmamız' },
      { pattern: /şirketimiz/i, label: 'şirketimiz' },
      { pattern: /müşterimiz/i, label: 'müşterimiz' },
      { pattern: /mükellef/i, label: 'mükellef' },

      // Question patterns
      { pattern: /durumu nedir/i, label: 'durumu nedir' },
      { pattern: /ne yapmal[ıi]/i, label: 'ne yapmalı' },
      { pattern: /nas[ıi]l\s+(?:değerlendiri|yorumlan)/i, label: 'nasıl değerlendirilir' },
      { pattern: /nas[ıi]l\s+hareket/i, label: 'nasıl hareket' },

      // Legal/tax context
      { pattern: /vergisel\s+(?:durum|sonuç)/i, label: 'vergisel durum' },
      { pattern: /mevzuat\s+açısından/i, label: 'mevzuat açısından' },
      { pattern: /hukuki\s+(?:durum|değerlendirme)/i, label: 'hukuki durum' },
      { pattern: /yapılması\s+gereken/i, label: 'yapılması gereken' },
      { pattern: /uygulama\s+(?:nasıl|şekli)/i, label: 'uygulama nasıl' },

      // v12.8: MURAT-2/3 patterns (fixed regex)
      { pattern: /uzlaşma/i, label: 'uzlaşma' },
      { pattern: /indirim\s*(?:talep|iste|hakkı|oranı)/i, label: 'indirim talep' },
      { pattern: /izaha?\s*davet/i, label: 'izaha davet' },  // Fixed: \s* instead of \s+
      { pattern: /ceza\s*(?:indirim|kalkma|affı|kes)/i, label: 'ceza indirim' },
      { pattern: /pişmanlık/i, label: 'pişmanlık' },
      { pattern: /vergi\s*(?:ziya[ıi]|kaçakçılı|suç)/i, label: 'vergi ziyaı' },
      { pattern: /ödeme\s*emri/i, label: 'ödeme emri' },
      { pattern: /haciz/i, label: 'haciz' },
      { pattern: /şekil\s*şart/i, label: 'şekil şart' },  // Added for MURAT-3
      { pattern: /usulsüzlük/i, label: 'usulsüzlük' },
      { pattern: /tarhiyat/i, label: 'tarhiyat' },

      // Generic scenario markers
      { pattern: /senaryo/i, label: 'senaryo' },
      { pattern: /örnek\s+olay/i, label: 'örnek olay' },
      { pattern: /durum[u]?\s+şu/i, label: 'durumu şu' },
      { pattern: /şöyle\s+bir\s+durum/i, label: 'şöyle bir durum' }
    ];

    // Find matching pattern
    const matchedPattern = scenarioPatterns.find(p => p.pattern.test(queryLower));

    if (matchedPattern) {
      console.log(`[v12.8-DEBUG] SCENARIO_DETECT: query.length=${query.length}, matched="${matchedPattern.label}"`);
      return true;
    }

    console.log(`[v12.8-DEBUG] isScenarioQuery: query.length=${query.length}, NO MATCH`);
    return false;
  }

  /**
   * 🛡️ v12.6: Validate article format has required sections
   */
  private validateArticleFormat(response: string): { valid: boolean; missing: string[] } {
    const requiredSections = [
      'ÖZET',
      'DEĞERLENDİRME',
      'SONUÇ'
    ];

    const optionalSections = [
      'VARSAYIMLAR',
      'MEVZUAT HİYERARŞİSİ',
      'UYGULAMA ADIMLARI',
      'RİSKLER'
    ];

    const responseUpper = response.toUpperCase();
    const missing: string[] = [];

    // Check required sections
    for (const section of requiredSections) {
      if (!responseUpper.includes(section) && !responseUpper.includes(`**${section}**`)) {
        missing.push(section);
      }
    }

    // For full validity, need at least 3 sections total
    const allSections = [...requiredSections, ...optionalSections];
    const foundCount = allSections.filter(s =>
      responseUpper.includes(s) || responseUpper.includes(`**${s}**`)
    ).length;

    return {
      valid: missing.length === 0 && foundCount >= 3,
      missing
    };
  }

  /**
   * 🛡️ v12.9: Ensure article format for scenario queries
   * If response is too short, generates substantial content from sources
   */
  private ensureArticleFormat(response: string, query: string, sources: any[] = []): string {
    if (!this.isScenarioQuery(query)) return response;

    const MIN_SCENARIO_LENGTH = 600; // Minimum chars for scenario response
    const validation = this.validateArticleFormat(response);

    console.log(`🛡️ [v12.9] ensureArticleFormat: response.length=${response.length}, valid=${validation.valid}, missing=${validation.missing.join(',')}`);

    // If response is too short for a scenario query, generate from sources
    if (response.length < MIN_SCENARIO_LENGTH && sources.length > 0) {
      console.log(`🛡️ ARTICLE_FORMAT_FIX: Response too short (${response.length} < ${MIN_SCENARIO_LENGTH}), generating from sources`);

      // Extract content from top 3 sources
      const sourceContents: Array<{ index: number; content: string }> = [];
      for (let i = 0; i < Math.min(3, sources.length); i++) {
        const content = (sources[i].content || sources[i].excerpt || '')
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (content.length > 100) {
          sourceContents.push({ index: i + 1, content: content.substring(0, 800) });
        }
      }

      // Build article-format response
      let articleResponse = `**ÖZET:**\n${response.replace(/\*\*/g, '').substring(0, 300).trim()}`;

      articleResponse += `\n\n**DEĞERLENDİRME:**\n`;

      // Add source content as evaluation paragraphs
      sourceContents.forEach((src) => {
        articleResponse += `\n${src.content}... [${src.index}]\n`;
      });

      // Add conclusion
      articleResponse += `\n\n**SONUÇ:**\n`;
      articleResponse += `Yukarıda belirtilen mevzuat hükümleri ve uygulama esasları çerçevesinde:\n\n`;
      articleResponse += `1. İlgili yasal düzenlemelerin dikkatli bir şekilde incelenmesi gerekmektedir.\n`;
      articleResponse += `2. Somut duruma göre vergi idaresi ile iletişime geçilmesi önerilir.\n`;
      articleResponse += `3. Gerekli hallerde uzman görüşü alınması faydalı olacaktır.\n\n`;
      articleResponse += `Detaylı bilgi için yukarıda atıfta bulunulan kaynaklara başvurulabilir.`;

      console.log(`🛡️ ARTICLE_FORMAT_FIX: Generated article response (${articleResponse.length} chars from ${sourceContents.length} sources)`);
      return articleResponse;
    }

    // If response is long enough but missing sections, just add headers
    if (!validation.valid) {
      console.log(`🛡️ ARTICLE_FORMAT_FIX: Adding missing sections: ${validation.missing.join(', ')}`);

      let enhanced = response;

      // Add ÖZET if missing
      if (!response.toUpperCase().includes('ÖZET')) {
        const summary = response.substring(0, Math.min(response.length, 300)).replace(/\n/g, ' ').trim();
        enhanced = `**ÖZET:**\n${summary}...\n\n${enhanced}`;
      }

      // Add DEĞERLENDİRME header if content exists but header missing
      if (!response.toUpperCase().includes('DEĞERLENDİRME') && response.length > 200) {
        const ozetIndex = enhanced.toUpperCase().indexOf('ÖZET');
        if (ozetIndex >= 0) {
          const afterOzet = enhanced.indexOf('\n\n', ozetIndex + 10);
          if (afterOzet > 0) {
            enhanced = enhanced.substring(0, afterOzet) + '\n\n**DEĞERLENDİRME:**\n' + enhanced.substring(afterOzet + 2);
          }
        }
      }

      // Add SONUÇ if missing
      if (!response.toUpperCase().includes('SONUÇ')) {
        enhanced = `${enhanced}\n\n**SONUÇ:**\nYukarıdaki değerlendirmeler ışığında ilgili mevzuat hükümlerinin dikkatli bir şekilde incelenmesi ve gerekirse uzman görüşü alınması önerilir.`;
      }

      return enhanced;
    }

    return response;
  }

  /**
   * 🛡️ P1: Generate "Article Not Found" Response
   * When user asks for a specific article that doesn't exist in the database
   */
  private generateArticleNotFoundResponse(
    lawCode: string,
    articleNumber: number,
    language: string = 'tr'
  ): string {
    const lawNames: Record<string, string> = {
      'VUK': 'Vergi Usul Kanunu',
      'GVK': 'Gelir Vergisi Kanunu',
      'KDVK': 'Katma Değer Vergisi Kanunu',
      'KVK': 'Kurumlar Vergisi Kanunu',
      'AATUHK': 'Amme Alacaklarının Tahsil Usulü Hakkında Kanun'
    };

    const lawName = lawNames[lawCode?.toUpperCase()] || lawCode;

    if (language === 'tr') {
      return `⚠️ **${lawCode} Madde ${articleNumber} Bulunamadı**

Aradığınız **${lawName} Madde ${articleNumber}** metnine veritabanımızda ulaşılamadı.

**Olası nedenler:**
- Bu madde numarası mevcut olmayabilir
- Madde numarası yanlış girilmiş olabilir
- Bu madde henüz veritabanımıza eklenmemiş olabilir

**Öneriler:**
- Madde numarasını kontrol edin
- Resmi Gazete veya mevzuat.gov.tr üzerinden kontrol edebilirsiniz
- Farklı bir madde numarası ile tekrar deneyebilirsiniz`;
    } else {
      return `⚠️ **${lawCode} Article ${articleNumber} Not Found**

The requested **${lawName} Article ${articleNumber}** could not be found in our database.

Please verify the article number or check official sources.`;
    }
  }

  /**
   * 🛡️ v12 FIX: Contradiction Protection
   *
   * Detects when LLM falsely claims "no date in sources" while sources actually have deadline info.
   * This happens when model uses hedging language like "kaynaklarda belirtilmemiş" but the date IS there.
   *
   * RULE: If sources contain a deadline token (21/24/26), "net tarih yok" is FORBIDDEN in response.
   *
   * @param response - LLM response text
   * @param sources - Source objects from search
   * @param query - Original user query
   * @param language - Response language
   */
  private fixDateContradiction(
    response: string,
    sources: any[],
    query: string,
    language: string = 'tr'
  ): string {
    // Only apply to deadline-related queries
    const intentType = this.detectDeadlineIntent(query);
    if (!intentType) return response;

    // Detect contradiction phrases in response (EXPANDED - catches "bulunmamaktadır" etc.)
    const contradictionPhrases = [
      // "kaynaklarda tarih yok/almamaktadır/bulunmamaktadır" variants
      /kaynak(lar)?da\s*(doğrudan\s+)?(belirli\s+bir\s+)?tarih\s*(bilgisi\s+)?(yer\s+)?(alma|bulunma)(maktadır|mıyor|dı)/gi,
      /kaynak(lar)?da\s*(doğrudan\s+)?(bir\s+)?tarih\s+(yok|belirtilmemiş|verilmemiş|mevcut\s+değil)/gi,
      // "tarih bulamadım/yok" variants
      /tarih\s*(bilgisi\s+)?bula(madım|mamadım|namadı|nmadı)/gi,
      /net\s+(bir\s+)?tarih\s+(yok|belirtilmemiş|verilmemiş|bulunmamaktadır)/gi,
      /kesin\s+(bir\s+)?tarih\s*(yok|belirtilmemiş|belli\s+değil|verilmemiş)/gi,
      /spesifik\s+(bir\s+)?tarih\s*(yok|belirtilmemiş|bulunmamaktadır)/gi,
      // "doğrudan tarih yok" - common LLM escape pattern
      /doğrudan\s+(bir\s+)?tarih\s*(bilgisi\s+)?(yok|bulunmamaktadır|verilmemiş|mevcut\s+değil)/gi,
      // Other variants
      /tarih\s+veril(me)?miş/gi,
      /tarih\s+bilgisi\s+mevcut\s+değil/gi,
      /belirli\s+bir\s+gün\s+belirtilmemiş/gi,
      /tam\s+tarih\s+yok/gi,
      // "net bilgi yok" - another common escape
      /net\s+(bir\s+)?bilgi\s+(yok|bulunmamaktadır|mevcut\s+değil)/gi
    ];

    const hasContradiction = contradictionPhrases.some(pattern => {
      pattern.lastIndex = 0;
      const matches = pattern.test(response);
      if (matches) {
        console.log(`[CONTRADICTION-FIX] Pattern matched: ${pattern.source}`);
      }
      return matches;
    });

    // Check if response has deadline but WITHOUT citation (LLM using own knowledge)
    const hasDeadlineWithoutCitation = this.responseContainsDeadline(response) &&
                                        !/\[\d+\]/.test(response);

    // Also check if response is missing the deadline completely for deadline questions
    const hasMissingDeadline = !this.responseContainsDeadline(response);

    // RULE: For deadline questions, we need deadline WITH citation from sources
    const needsFix = hasContradiction || hasMissingDeadline || hasDeadlineWithoutCitation;

    if (!needsFix) return response;

    const reason = hasContradiction ? '"no date" claim' :
                   hasDeadlineWithoutCitation ? 'deadline without citation' :
                   'missing deadline token';
    console.log(`[CONTRADICTION-FIX] Detected ${reason} for ${intentType} question, checking sources...`);

    // Use the unified deadline extractor
    const deadlineInfo = this.extractDeadlineFromSources(sources, intentType);

    if (!deadlineInfo) {
      console.log(`[CONTRADICTION-FIX] No deadline found in sources, keeping original response`);
      return response;
    }

    // Generate corrected answer using the unified generator
    const correctedAnswer = this.generateDeadlineAnswer(deadlineInfo, intentType, language);

    if (correctedAnswer) {
      console.log(`[CONTRADICTION-FIX] Replacing response with corrected answer: day=${deadlineInfo.day}`);
      return correctedAnswer;
    }

    return response;
  }

  /**
   * 🛡️ PROSEDÜR CLAIM SANITIZER v3 - SCHEMA-DRIVEN
   *
   * Post-processes LLM output to REMOVE (not soften) ungrounded procedural claims.
   * If a claim contains normative verbs and source chunks don't support it, sentence is removed.
   *
   * v3: Patterns and keywords are now loaded from schema.llmConfig.sanitizerConfig
   * This enables domain-specific configuration without code changes.
   *
   * Philosophy: "Soften" masks hallucinations. "Remove" is honest.
   * Performance: ~2-5ms (regex + source check, no LLM call)
   *
   * @param response - LLM response text
   * @param sources - Source objects for grounding check
   * @param config - Optional sanitizer config from schema (uses DEFAULT_SANITIZER_CONFIG if not provided)
   * @param lawCodes - Optional law codes from schema's lawCodeConfig (e.g., ['VUK', 'GVK', 'KDVK'])
   */
  private sanitizeProsedurClaims(
    response: string,
    sources: any[],
    config?: SanitizerConfig,
    lawCodes?: string[]
  ): string {
    // Use provided config or fall back to defaults
    const sanitizerConfig = config || DEFAULT_SANITIZER_CONFIG;

    // Check if sanitizer is enabled
    if (!sanitizerConfig.enabled) {
      console.log('[SANITIZER] Disabled via schema config');
      return response;
    }

    // ═══════════════════════════════════════════════════════════════
    // LANGUAGE PACK INTEGRATION (v10 - Multi-language support)
    // If useLanguagePack is enabled, load patterns from language pack
    // Custom patterns in config override/extend language pack patterns
    // ═══════════════════════════════════════════════════════════════
    let langPack: SanitizerLangPack | null = null;
    let effectiveForbiddenPatterns: SanitizerPattern[] = sanitizerConfig.forbiddenPatterns || [];
    let effectiveGroundingKeywords: string[] = sanitizerConfig.groundingKeywords || [];
    let effectiveTemporalUnits: string[] = sanitizerConfig.temporalUnits || [];

    if (sanitizerConfig.useLanguagePack) {
      const langCode = sanitizerConfig.language || 'tr';
      langPack = getSanitizerLangPack(langCode);
      console.log(`[SANITIZER] Loaded language pack: ${langPack.name} (${langPack.code})`);

      // Merge language pack patterns with custom patterns (custom patterns take precedence by ID)
      const customPatternIds = new Set(sanitizerConfig.forbiddenPatterns?.map(p => p.id) || []);
      const langPackPatterns = langPack.forbiddenPatterns
        .filter(p => !customPatternIds.has(p.id))
        .map(p => ({ ...p, enabled: true }));
      effectiveForbiddenPatterns = [...langPackPatterns, ...(sanitizerConfig.forbiddenPatterns || [])];

      // Merge grounding keywords (union)
      const keywordSet = new Set([
        ...langPack.groundingKeywords,
        ...(sanitizerConfig.groundingKeywords || [])
      ]);
      effectiveGroundingKeywords = Array.from(keywordSet);

      // Use language pack temporal units if not provided in config
      effectiveTemporalUnits = sanitizerConfig.temporalUnits?.length
        ? sanitizerConfig.temporalUnits
        : langPack.temporalUnits;

      console.log(`[SANITIZER] Merged: ${effectiveForbiddenPatterns.length} patterns, ${effectiveGroundingKeywords.length} keywords, ${effectiveTemporalUnits.length} temporal units`);
    }

    // Build source content corpus for grounding check (lowercase, normalized)
    const sourceCorpus = sources
      .map(s => `${s.content || ''} ${s.excerpt || ''} ${s.title || ''}`.toLowerCase())
      .join(' ')
      .replace(/\s+/g, ' ');

    // Split response into sentences for granular removal
    const sentences = response.split(/(?<=[.!?])\s+/);
    const processedSentences: string[] = [];

    let removedCount = 0;
    let keptWithGroundingCount = 0;

    // ═══════════════════════════════════════════════════════════════
    // BUILD FORBIDDEN PATTERNS FROM SCHEMA/LANGUAGE PACK
    // ═══════════════════════════════════════════════════════════════
    const forbiddenPatterns: RegExp[] = effectiveForbiddenPatterns
      .filter(p => p.enabled)
      .map(p => {
        try {
          return new RegExp(p.pattern, 'i');
        } catch (e) {
          console.warn(`[SANITIZER] Invalid regex pattern: ${p.pattern}`, e);
          return null;
        }
      })
      .filter((p): p is RegExp => p !== null);

    console.log(`[SANITIZER] Loaded ${forbiddenPatterns.length} patterns (lang: ${sanitizerConfig.language || 'tr'})`);

    // ═══════════════════════════════════════════════════════════════
    // BUILD SOURCE INDEX - Map citation numbers to source content
    // ═══════════════════════════════════════════════════════════════
    const sourceIndex: Map<number, string> = new Map();
    sources.forEach((s, idx) => {
      const content = `${s.content || ''} ${s.excerpt || ''} ${s.title || ''}`.toLowerCase();
      sourceIndex.set(idx + 1, content); // Citations are 1-indexed
    });

    // ═══════════════════════════════════════════════════════════════
    // CITATION EXTRACTION - Get [X] numbers from sentence
    // ═══════════════════════════════════════════════════════════════
    const extractCitations = (sentence: string): number[] => {
      const matches = sentence.match(/\[(\d+)\]/g) || [];
      return matches.map(m => parseInt(m.replace(/[\[\]]/g, ''), 10));
    };

    // ═══════════════════════════════════════════════════════════════
    // CLAIM EXTRACTION - Extract key claims from sentence
    // These are what we verify against cited sources
    // v6: Uses schema's groundingKeywords instead of hardcoded terms
    // ═══════════════════════════════════════════════════════════════
    const extractClaims = (sentence: string): string[] => {
      const claims: string[] = [];
      const sentenceLower = sentence.toLowerCase();

      // Extract numeric values (dates, durations, percentages)
      // CRITICAL for claim verification: "10 yıl" must have "10" in source
      const numbers = sentence.match(/\d+/g) || [];
      claims.push(...numbers);

      // Extract Turkish number words (universal, not domain-specific)
      const turkishNumbers = ['bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on',
        'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan', 'yüz'];
      for (const num of turkishNumbers) {
        if (sentenceLower.includes(num)) claims.push(num);
      }

      // Extract key terms FROM SCHEMA CONFIG (domain-specific, no hardcoding)
      // These are grounding keywords that MUST appear in source to verify a claim
      const schemaKeyTerms = sanitizerConfig.groundingKeywords || [];
      for (const term of schemaKeyTerms) {
        if (sentenceLower.includes(term.toLowerCase())) claims.push(term.toLowerCase());
      }

      return [...new Set(claims)]; // Dedupe
    };

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL CLAIM DETECTION v10 - Language-aware pattern detection
    // Returns array of detected claims (empty if no critical claims)
    // Uses language pack for date/percentage patterns when available
    // ═══════════════════════════════════════════════════════════════
    const detectCriticalClaims = (sentence: string): Array<{ type: string; value: string }> => {
      const claimConfig = sanitizerConfig.criticalClaimConfig || {
        verifyTemporalClaims: true,
        verifyDateClaims: true,
        verifyPercentageClaims: true,
        verifyArticleClaims: true,
        genericClaimThreshold: 0.7
      };
      const schemaLawCodes = lawCodes || [];

      const claims: Array<{ type: string; value: string }> = [];
      let match;

      // 1. Temporal claims - Use language pack pattern if available
      // v11: Also detect Turkish number word + temporal unit (beş yıl, on gün)
      if (claimConfig.verifyTemporalClaims && effectiveTemporalUnits.length > 0) {
        let temporalPattern: RegExp;
        if (langPack) {
          temporalPattern = buildTemporalPattern(langPack);
        } else {
          // Fallback: Turkish pattern
          const unitsWithSuffixes = effectiveTemporalUnits.map(unit => {
            const suffix = /[aıou]/.test(unit) ? 'd[ıi]r' : 'd[üui]r';
            return `${unit}(?:${suffix})?`;
          }).join('|');
          temporalPattern = new RegExp(`(\\d+)\\s*(${unitsWithSuffixes})`, 'gi');
        }
        while ((match = temporalPattern.exec(sentence)) !== null) {
          const num = match[1];
          // Normalize unit: remove suffix
          const rawUnit = match[2].toLowerCase().replace(/d[ıiüu]r$/i, '').replace(/s$/i, '');
          claims.push({ type: 'temporal', value: `${num} ${rawUnit}` });
        }

        // v11: Also detect Turkish number word + temporal unit (beş yıl, on gün, yirmi ay)
        if (langPack?.numberWords?.cardinals) {
          const cardinals = langPack.numberWords.cardinals;
          const cardinalWords = Object.keys(cardinals).sort((a, b) => b.length - a.length);
          // Build pattern: (number word) + (temporal unit)
          const unitsPattern = effectiveTemporalUnits.map(unit => {
            const suffix = /[aıou]/.test(unit) ? 'd[ıi]r' : 'd[üui]r';
            return `${unit}(?:${suffix})?`;
          }).join('|');
          const numberWordsPattern = cardinalWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
          const wordTemporalPattern = new RegExp(`\\b(${numberWordsPattern})\\s*(${unitsPattern})\\b`, 'gi');

          while ((match = wordTemporalPattern.exec(sentence)) !== null) {
            const wordNum = match[1].toLowerCase().replace(/\s+/g, '');
            const digit = cardinals[wordNum];
            const rawUnit = match[2].toLowerCase().replace(/d[ıiüu]r$/i, '').replace(/s$/i, '');
            if (digit !== undefined) {
              // Avoid duplicates
              const claimValue = `${digit} ${rawUnit}`;
              if (!claims.some(c => c.type === 'temporal' && c.value === claimValue)) {
                claims.push({ type: 'temporal', value: claimValue });
              }
            }
          }
        }
      }

      // 2. Date ordinals - Use language pack pattern if available
      // v11: Also detect Turkish number words (yirmidördüncü → 24)
      if (claimConfig.verifyDateClaims) {
        let datePattern: RegExp;
        if (langPack) {
          datePattern = buildDatePattern(langPack);
        } else {
          // Fallback: Turkish date ordinals
          datePattern = /(\d+)[''ıiuü](?:n[aeiıoöuü]|s[ıi])/gi;
        }
        while ((match = datePattern.exec(sentence)) !== null) {
          claims.push({ type: 'date', value: match[1] });
        }

        // v11: Also detect Turkish ordinal words (yirmidördüncü, yirmi dördüncü, etc.)
        if (langPack?.numberWords?.ordinals) {
          const ordinals = langPack.numberWords.ordinals;
          // Build pattern for all ordinal words
          const ordinalWords = Object.keys(ordinals).sort((a, b) => b.length - a.length);
          // Also add spaced compound forms
          const allForms: string[] = [];
          for (const word of ordinalWords) {
            allForms.push(word);
            // Add spaced form for compound numbers (yirmidördüncü → yirmi dördüncü)
            const spacedForm = word.replace(/^(on|yirmi|otuz)/, '$1 ');
            if (spacedForm !== word) {
              allForms.push(spacedForm);
            }
          }
          const ordinalPattern = new RegExp(`\\b(${allForms.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
          while ((match = ordinalPattern.exec(sentence)) !== null) {
            const word = match[1].toLowerCase().replace(/\s+/g, '');
            const digit = ordinals[word];
            if (digit !== undefined) {
              // Avoid duplicates if digit form was already detected
              if (!claims.some(c => c.type === 'date' && c.value === digit.toString())) {
                claims.push({ type: 'date', value: digit.toString() });
              }
            }
          }
        }
      }

      // 3. Percentages - Use language pack pattern if available
      if (claimConfig.verifyPercentageClaims) {
        let percentPattern: RegExp;
        if (langPack) {
          percentPattern = buildPercentagePattern(langPack);
        } else {
          // Fallback: Turkish/universal percentage
          percentPattern = /%\s*(\d+)|yüzde\s*(\d+)/gi;
        }
        while ((match = percentPattern.exec(sentence)) !== null) {
          const num = match[1] || match[2];
          claims.push({ type: 'percentage', value: `%${num}` });
        }
      }

      // 4. Article references - Schema-driven (not language-specific)
      if (claimConfig.verifyArticleClaims && schemaLawCodes.length > 0) {
        const lawCodesPattern = schemaLawCodes.join('|');
        const articlePattern = new RegExp(`\\b(${lawCodesPattern})\\s*(?:madde\\s*)?(\\d+)`, 'gi');
        while ((match = articlePattern.exec(sentence)) !== null) {
          claims.push({ type: 'article', value: `${match[1].toUpperCase()} ${match[2]}` });
        }
      }

      return claims;
    };

    // ═══════════════════════════════════════════════════════════════
    // CITATION VERIFICATION v10 - Language-aware Claim-Source Matching
    // Key insight: Having [X] is NOT enough. The cited source must
    // contain the SPECIFIC claim, not just generic keywords.
    //
    // v10: Multi-language support via language packs
    // - Uses effectiveTemporalUnits from language pack or config
    // - Uses langPack patterns for dates/percentages when available
    // - lawCodes from schema's lawCodeConfig (not language-specific)
    // ═══════════════════════════════════════════════════════════════
    const verifyCitationSupport = (sentence: string, citationNums: number[]): { verified: boolean; reason: string } => {
      if (citationNums.length === 0) {
        return { verified: false, reason: 'no_citation' };
      }

      // Get config values (with sensible defaults)
      const claimConfig = sanitizerConfig.criticalClaimConfig || {
        verifyTemporalClaims: true,
        verifyDateClaims: true,
        verifyPercentageClaims: true,
        verifyArticleClaims: true,
        genericClaimThreshold: 0.7
      };
      const schemaLawCodes = lawCodes || []; // From getDomainConfig -> lawCodeConfig.lawCodes

      const sentenceLower = sentence.toLowerCase();

      // ═══════════════════════════════════════════════════════════════
      // EXTRACT CRITICAL CLAIMS - Language-aware pattern extraction
      // Uses language pack for temporal/date/percentage patterns
      // ═══════════════════════════════════════════════════════════════
      const criticalClaims: Array<{ type: string; value: string; pattern: RegExp }> = [];
      let match;

      // 1. Temporal claims - Use language pack or effective config
      // v11: Also detect Turkish number word + temporal unit (beş yıl, on gün)
      if (claimConfig.verifyTemporalClaims && effectiveTemporalUnits.length > 0) {
        let temporalPattern: RegExp;
        if (langPack) {
          temporalPattern = buildTemporalPattern(langPack);
        } else {
          // Fallback: Turkish vowel harmony pattern
          const unitsWithSuffixes = effectiveTemporalUnits.map(unit => {
            const suffix = /[aıou]/.test(unit) ? 'd[ıi]r' : 'd[üui]r';
            return `${unit}(?:${suffix})?`;
          }).join('|');
          temporalPattern = new RegExp(`(\\d+)\\s*(${unitsWithSuffixes})`, 'gi');
        }
        while ((match = temporalPattern.exec(sentence)) !== null) {
          const num = match[1];
          // Normalize unit: remove suffixes (yıldır → yıl, years → year)
          const rawUnit = match[2].toLowerCase().replace(/d[ıiüu]r$/i, '').replace(/s$/i, '');
          criticalClaims.push({
            type: 'temporal',
            value: `${num} ${rawUnit}`,
            // Pattern should match both with and without suffix in source
            pattern: new RegExp(`${num}\\s*${rawUnit}`, 'i')
          });
        }

        // v11: Also detect Turkish number word + temporal unit (beş yıl, on gün, yirmi ay)
        if (langPack?.numberWords?.cardinals) {
          const cardinals = langPack.numberWords.cardinals;
          const cardinalWords = Object.keys(cardinals).sort((a, b) => b.length - a.length);
          const unitsPattern = effectiveTemporalUnits.map(unit => {
            const suffix = /[aıou]/.test(unit) ? 'd[ıi]r' : 'd[üui]r';
            return `${unit}(?:${suffix})?`;
          }).join('|');
          const numberWordsPattern = cardinalWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
          const wordTemporalPattern = new RegExp(`\\b(${numberWordsPattern})\\s*(${unitsPattern})\\b`, 'gi');

          while ((match = wordTemporalPattern.exec(sentence)) !== null) {
            const wordNum = match[1].toLowerCase().replace(/\s+/g, '');
            const digit = cardinals[wordNum];
            const rawUnit = match[2].toLowerCase().replace(/d[ıiüu]r$/i, '').replace(/s$/i, '');
            if (digit !== undefined) {
              // Avoid duplicates
              const claimValue = `${digit} ${rawUnit}`;
              if (!criticalClaims.some(c => c.type === 'temporal' && c.value === claimValue)) {
                criticalClaims.push({
                  type: 'temporal',
                  value: claimValue,
                  pattern: new RegExp(`${digit}\\s*${rawUnit}`, 'i')
                });
              }
            }
          }
        }
      }

      // 2. Date ordinals - Use language pack or fallback
      // v11: Also detect Turkish ordinal words (yirmidördüncü → 24)
      if (claimConfig.verifyDateClaims) {
        let datePattern: RegExp;
        if (langPack) {
          datePattern = buildDatePattern(langPack);
        } else {
          // Fallback: Turkish date ordinals
          datePattern = /(\d+)[''ıiuü](?:n[aeiıoöuü]|s[ıi])/gi;
        }
        while ((match = datePattern.exec(sentence)) !== null) {
          const num = match[1];
          criticalClaims.push({
            type: 'date',
            value: num,
            pattern: new RegExp(`${num}`, 'i')
          });
        }

        // v11: Also detect Turkish ordinal words (yirmidördüncü, yirmi dördüncü)
        if (langPack?.numberWords?.ordinals) {
          const ordinals = langPack.numberWords.ordinals;
          const ordinalWords = Object.keys(ordinals).sort((a, b) => b.length - a.length);
          // Also add spaced compound forms
          const allForms: string[] = [];
          for (const word of ordinalWords) {
            allForms.push(word);
            const spacedForm = word.replace(/^(on|yirmi|otuz)/, '$1 ');
            if (spacedForm !== word) {
              allForms.push(spacedForm);
            }
          }
          const ordinalPattern = new RegExp(`\\b(${allForms.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

          while ((match = ordinalPattern.exec(sentence)) !== null) {
            const word = match[1].toLowerCase().replace(/\s+/g, '');
            const digit = ordinals[word];
            if (digit !== undefined) {
              // Avoid duplicates
              if (!criticalClaims.some(c => c.type === 'date' && c.value === digit.toString())) {
                criticalClaims.push({
                  type: 'date',
                  value: digit.toString(),
                  pattern: new RegExp(`${digit}`, 'i')
                });
              }
            }
          }
        }
      }

      // 3. Percentages - Use language pack or fallback
      if (claimConfig.verifyPercentageClaims) {
        let percentPattern: RegExp;
        if (langPack) {
          percentPattern = buildPercentagePattern(langPack);
        } else {
          // Fallback: Turkish/universal percentage
          percentPattern = /%\s*(\d+)|yüzde\s*(\d+)/gi;
        }
        while ((match = percentPattern.exec(sentence)) !== null) {
          const num = match[1] || match[2];
          criticalClaims.push({
            type: 'percentage',
            value: `%${num}`,
            pattern: new RegExp(`%\\s*${num}|${num}\\s*%|yüzde\\s*${num}|${num}\\s*percent`, 'i')
          });
        }
      }

      // 4. Article references - Schema-driven (not language-specific)
      if (claimConfig.verifyArticleClaims && schemaLawCodes.length > 0) {
        const lawCodesPattern = schemaLawCodes.join('|');
        const articlePattern = new RegExp(`\\b(${lawCodesPattern})\\s*(?:madde\\s*)?(\\d+)`, 'gi');
        while ((match = articlePattern.exec(sentence)) !== null) {
          const law = match[1].toUpperCase();
          const article = match[2];
          criticalClaims.push({
            type: 'article',
            value: `${law} ${article}`,
            pattern: new RegExp(`${law}[^\\d]*${article}|madde\\s*${article}`, 'i')
          });
        }
      }

      // If no critical claims, check for generic keywords (fallback)
      if (criticalClaims.length === 0) {
        const genericClaims = extractClaims(sentence);
        if (genericClaims.length === 0) {
          // No claims at all → trust the citation
          return { verified: true, reason: 'no_claims_to_verify' };
        }

        // For generic claims, use configurable threshold
        const threshold = claimConfig.genericClaimThreshold;
        for (const citNum of citationNums) {
          const sourceContent = sourceIndex.get(citNum);
          if (!sourceContent) continue;

          const supported = genericClaims.filter(claim => sourceContent.includes(claim.toLowerCase()));
          const supportRatio = supported.length / genericClaims.length;

          if (supportRatio >= threshold) {
            return {
              verified: true,
              reason: `generic_claims_verified_in_[${citNum}]: ${supported.length}/${genericClaims.length} (${Math.round(supportRatio * 100)}%)`
            };
          }
        }

        return {
          verified: false,
          reason: `generic_claims_not_verified: [${genericClaims.join(', ')}] <${Math.round(threshold * 100)}% in cited sources`
        };
      }

      // ═══════════════════════════════════════════════════════════════
      // STRICT VERIFICATION: Critical claims MUST exist in source
      // v11: Number word normalization for Turkish (24 ↔ yirmidördüncü)
      // ═══════════════════════════════════════════════════════════════
      let bestMatch = { citNum: -1, matched: 0, total: criticalClaims.length, details: [] as string[] };

      // Determine language for normalization
      const effectiveLangCode = langPack?.code || 'tr';

      for (const citNum of citationNums) {
        const sourceContent = sourceIndex.get(citNum);
        if (!sourceContent) continue;

        // v11: Normalize source content (convert word forms to digits)
        // This allows "yirmidördüncü" in source to match "24" in claim
        const normalizedSource = normalizeNumberWords(sourceContent, effectiveLangCode);

        // v12 DEBUG: Log normalization for date claims
        if (sanitizerConfig.logRemovals && criticalClaims.some(c => c.type === 'date')) {
          console.log(`[CLAIM-VERIFY] Citation [${citNum}] checking ${criticalClaims.length} claims`);
          console.log(`   Source excerpt: "${sourceContent.substring(0, 150)}..."`);
          console.log(`   Normalized excerpt: "${normalizedSource.substring(0, 150)}..."`);
        }

        const matchedClaims: string[] = [];
        for (const claim of criticalClaims) {
          // First try original source, then normalized source
          const originalMatch = claim.pattern.test(sourceContent);
          const normalizedMatch = claim.pattern.test(normalizedSource);

          if (originalMatch || normalizedMatch) {
            matchedClaims.push(claim.value);
            if (sanitizerConfig.logRemovals) {
              console.log(`   [CLAIM-VERIFY] ✓ ${claim.type}:${claim.value} found (original:${originalMatch}, normalized:${normalizedMatch})`);
            }
          } else if (claim.type === 'date' || claim.type === 'temporal') {
            // v11: For date/temporal claims, also try enhanced number pattern
            // This catches cases like "24" claim matching "yirmidördüncü" source
            const numValue = parseInt(claim.value.replace(/[^\d]/g, ''), 10);
            if (!isNaN(numValue)) {
              const enhancedPattern = buildNumberMatchPattern(numValue, effectiveLangCode);
              const enhancedMatch = enhancedPattern.test(sourceContent);
              if (enhancedMatch) {
                matchedClaims.push(claim.value);
                if (sanitizerConfig.logRemovals) {
                  console.log(`   [CLAIM-VERIFY] ✓ ${claim.type}:${claim.value} found via enhanced pattern (${enhancedPattern.source})`);
                }
              } else if (sanitizerConfig.logRemovals) {
                console.log(`   [CLAIM-VERIFY] ✗ ${claim.type}:${claim.value} NOT found. Pattern: ${claim.pattern.source}, Enhanced: ${enhancedPattern.source}`);
              }
            }
          } else if (sanitizerConfig.logRemovals) {
            console.log(`   [CLAIM-VERIFY] ✗ ${claim.type}:${claim.value} NOT found. Pattern: ${claim.pattern.source}`);
          }
        }

        if (matchedClaims.length > bestMatch.matched) {
          bestMatch = {
            citNum,
            matched: matchedClaims.length,
            total: criticalClaims.length,
            details: matchedClaims
          };
        }
      }

      // v7: ALL critical claims must be verified (100% threshold for critical)
      // This is the key anti-laundering fix
      if (bestMatch.matched === bestMatch.total && bestMatch.total > 0) {
        return {
          verified: true,
          reason: `critical_claims_verified_in_[${bestMatch.citNum}]: [${bestMatch.details.join(', ')}]`
        };
      } else if (bestMatch.matched > 0) {
        // Partial match - still FAIL but log what was found
        return {
          verified: false,
          reason: `citation_laundering: only ${bestMatch.matched}/${bestMatch.total} critical claims found. Missing: [${criticalClaims.filter(c => !bestMatch.details.includes(c.value)).map(c => c.value).join(', ')}]`
        };
      } else {
        return {
          verified: false,
          reason: `citation_laundering: 0/${bestMatch.total} critical claims [${criticalClaims.map(c => c.value).join(', ')}] found in [${citationNums.join(', ')}]`
        };
      }
    };

    // ═══════════════════════════════════════════════════════════════
    // PROCESS EACH SENTENCE (v9 - Universal Critical Claim Verification)
    //
    // Key insight for v9: Critical claims (temporal, date, %, article) must be
    // verified REGARDLESS of whether sentence matches a forbidden pattern.
    //
    // Flow:
    // 1. Extract citations from sentence
    // 2. If citations exist → verify with verifyCitationSupport
    // 3. If no citations:
    //    a. Check for critical claims → REMOVE if found (need citation)
    //    b. Check for forbidden pattern → REMOVE if found (v8 rule)
    //    c. Neither → KEEP
    // ═══════════════════════════════════════════════════════════════
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      // PHASE 1: Extract citations
      const citationNums = extractCitations(trimmedSentence);
      const hasCitations = citationNums.length > 0;

      // ═══════════════════════════════════════════════════════════════
      // PHASE 2: CITATION EXISTS → Verify claim-source alignment
      // v9: This applies to ALL sentences with citations (not just forbidden)
      // ═══════════════════════════════════════════════════════════════
      if (hasCitations) {
        const verification = verifyCitationSupport(trimmedSentence, citationNums);

        if (verification.verified) {
          processedSentences.push(trimmedSentence);
          keptWithGroundingCount++;
          if (sanitizerConfig.logRemovals) {
            console.log(`[SANITIZER] KEPT (verified): "${trimmedSentence.substring(0, 60)}..." - ${verification.reason}`);
          }
        } else {
          // CITATION LAUNDERING DETECTED → REMOVE
          removedCount++;
          if (sanitizerConfig.logRemovals) {
            console.log(`[SANITIZER] REMOVED (laundering): "${trimmedSentence.substring(0, 80)}..."`);
            console.log(`   ${verification.reason}`);
          }
        }
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // PHASE 3: NO CITATION → Check for critical claims or forbidden patterns
      // v9: Critical claims without citations are removed (can't trust them)
      // v8: Forbidden patterns without citations are removed (normative rule)
      // ═══════════════════════════════════════════════════════════════

      // Check 3a: Critical claims without citation → REMOVE
      const criticalClaims = detectCriticalClaims(trimmedSentence);
      if (criticalClaims.length > 0) {
        removedCount++;
        if (sanitizerConfig.logRemovals) {
          console.log(`[SANITIZER] REMOVED (critical-no-citation): "${trimmedSentence.substring(0, 80)}..."`);
          console.log(`   Critical claims found: [${criticalClaims.map(c => `${c.type}:${c.value}`).join(', ')}]`);
          console.log(`   No citation present - critical claims require verified citation`);
        }
        continue;
      }

      // Check 3b: Forbidden pattern without citation → REMOVE (v8 rule)
      const matchedPattern = forbiddenPatterns.find(p => p.test(trimmedSentence));
      if (matchedPattern) {
        removedCount++;
        if (sanitizerConfig.logRemovals) {
          const claims = extractClaims(trimmedSentence);
          console.log(`[SANITIZER] REMOVED (forbidden+no-citation): "${trimmedSentence.substring(0, 80)}..."`);
          console.log(`   Forbidden pattern matched: ${matchedPattern.source}`);
          console.log(`   No citation present - normative claim requires citation to survive`);
          console.log(`   Extracted claims for reference: [${claims.join(', ')}]`);
        }
        continue;
      }

      // Check 3c: No critical claims, no forbidden pattern → KEEP
      processedSentences.push(trimmedSentence);
    }

    // ═══════════════════════════════════════════════════════════════
    // RECONSTRUCTION & CLEANUP
    // ═══════════════════════════════════════════════════════════════
    let result = processedSentences.join(' ');

    // Clean up artifacts
    result = result.replace(/\s{2,}/g, ' ');           // Double spaces
    result = result.replace(/\s+([,;.])/g, '$1');      // Space before punctuation
    result = result.replace(/([,;])\s*([,;.])/g, '$1'); // Double punctuation
    result = result.replace(/\n{3,}/g, '\n\n');        // Multiple newlines
    result = result.replace(/\[\d+\]\s*\[\d+\]/g, (m) => m.split('][').join('], [')); // Fix citation clusters

    // Log summary
    if (removedCount > 0 || keptWithGroundingCount > 0) {
      console.log(`[SANITIZER v9] Summary: removed=${removedCount}, kept=${keptWithGroundingCount}, sources=${sources.length}`);
    }

    return result.trim();
  }


  /**
   * 📋 ENFORCE RESPONSE FORMAT
   * Format enforcement based on schema configuration:
   * - 'article' format: Uses ## section headers (Konu, Anahtar Terimler, etc.)
   * - 'legacy' format: Uses **CEVAP** header
   *
   * ALINTI removed - citations are shown separately in UI
   *
   * @param formatType - 'article' | 'legacy' - from schema.routes.FOUND.format.type
   * @param routingSchema - RAG routing schema for backendLabel lookup (NOT hardcoded)
   */
  private enforceResponseFormat(
    responseText: string,
    searchResults: any[],
    language: string = 'tr',
    originalQuery: string = '',  // Original user query for verdict detection
    formatType: 'article' | 'legacy' = 'legacy',  // From schema config
    routingSchema?: RAGRoutingSchema  // Schema for section labels (settings-driven)
  ): string {
    let result = responseText;

    // 📋 ARTICLE FORMAT: Backend generates Anahtar Terimler + Dayanaklar from sources
    if (formatType === 'article') {
      console.log('[FORMAT] Article format detected - backend generating metadata sections');

      // Clean up any legacy headers LLM might have added
      result = result.replace(/\*\*CEVAP\*\*\s*\n?/gi, '');
      result = result.replace(/\*\*ANSWER\*\*\s*\n?/gi, '');
      result = result.replace(/\*\*ALINTI\*\*[\s\S]*?(?=##|\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '');
      result = result.replace(/\*\*QUOTE\*\*[\s\S]*?(?=##|\*\*[A-Z]|\n\n\n|$)/gi, '');

      // Remove LLM-generated Anahtar Terimler section (backend will generate from sources)
      // Support both markdown (## Anahtar Terimler) and numbered (2) ANAHTAR KELİMELER) formats
      result = result.replace(/##\s*Anahtar\s*Terim[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi, '');
      result = result.replace(/\*\*Anahtar\s*Terim[^*]*\*\*[\s\S]*?(?=##|\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '');
      result = result.replace(/2\)\s*ANAHTAR\s*KELİMELER[:\s]*[\s\S]*?(?=3\)|4\)|##|\n\n\n|$)/gi, '');

      // Remove LLM-generated Dayanaklar / Yasal Düzenlemeler section (backend will generate from sources)
      result = result.replace(/##\s*Dayanaklar[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi, '');
      result = result.replace(/\*\*Dayanaklar[^*]*\*\*[\s\S]*?(?=##|\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '');
      result = result.replace(/3\)\s*(?:İLGİLİ\s*)?YASAL\s*DÜZENLEMELER[^\n]*[\s\S]*?(?=4\)|##|\n\n\n|$)/gi, '');

      // Remove ALL Dipnotlar/Footnotes sections - citations shown in Atıflar UI component
      // Support both markdown (## Dipnotlar) and numbered (SON BÖLÜM: DİPNOTLAR) formats
      result = result.replace(/##\s*Dipnotlar:?[\s\S]*?(?=##|\n\n\n|$)/gi, '');
      result = result.replace(/##\s*Footnotes:?[\s\S]*?(?=##|\n\n\n|$)/gi, '');
      result = result.replace(/\*\*Dipnotlar:?\*\*[\s\S]*?(?=##|\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '');
      result = result.replace(/\*\*Footnotes:?\*\*[\s\S]*?(?=##|\*\*[A-Z]|\n\n\n|$)/gi, '');
      result = result.replace(/SON\s*BÖLÜM[:\s]*DİPNOTLAR[\s\S]*$/gi, '');
      result = result.replace(/5\)\s*DİPNOTLAR[\s\S]*$/gi, '');
      // Remove any standalone [1] [2] reference lists at the end
      result = result.replace(/\n\s*\[\d+\]\s+[^\n]+(?:\n\s*\[\d+\]\s+[^\n]+)*\s*$/gi, '');

      // ═══════════════════════════════════════════════════════════════
      // BACKEND-GENERATED SECTIONS FROM SOURCES METADATA
      // ═══════════════════════════════════════════════════════════════

      // 🚫 CHECK FOR REFUSAL PATTERNS IN LLM RESPONSE
      // If LLM indicates insufficient sources, don't add misleading keywords/dayanaklar
      const refusalPatterns = [
        /bulunamadı/i,
        /bulunamadi/i,
        /yeterli.*kaynak.*yok/i,
        /kaynak.*bulunamadı/i,
        /bilgi.*bulunamadı/i,
        /hüküm.*bulunamadı/i,
        /no.*(?:relevant|sufficient).*(?:source|information)/i
      ];
      const isRefusalResponse = refusalPatterns.some(pattern => pattern.test(result));

      if (isRefusalResponse) {
        console.log('[FORMAT] 🚫 Refusal pattern detected in LLM response - skipping keywords/dayanaklar');
      }

      // 1. Extract keywords from SOURCES (not query) - important terms from source content
      // SKIP if LLM response indicates refusal/insufficient sources
      const keywordsFromSources = isRefusalResponse ? [] : this.extractKeywordsFromSourceContent(searchResults);

      // NOTE: Dayanaklar extraction removed - citations shown inline [1], [2] in text
      // Sources displayed in Atıflar section (ZenMessage component)

      // 2. Get min sources count from search results for citation requirement
      const minSources = Math.min(searchResults.length, 5);

      // Build the final formatted response (NO ## headers - frontend renders them)
      let formattedResponse = '';

      // ═══════════════════════════════════════════════════════════════
      // MULTI-FORMAT PARSER: Support both numbered format and markdown headers
      // LLM may output:
      //   - Numbered: 1) SORUNUN KONUSU, 2) ANAHTAR KELİMELER, 4) VERGİLEX DEĞERLENDİRMESİ
      //   - Markdown: ## Konu, ## Değerlendirme
      // ═══════════════════════════════════════════════════════════════

      // ═══════════════════════════════════════════════════════════════
      // MULTI-PATTERN PARSER: Support various LLM output formats
      // LLM may output in many different formats, try them all
      // ═══════════════════════════════════════════════════════════════

      // Log raw result for debugging
      console.log('[FORMAT] Raw LLM result (first 500 chars):', result.substring(0, 500));

      // PATTERN 1: Numbered format (1) SORUNUN KONUSU ... 4) VERGİLEX DEĞERLENDİRMESİ)
      const numberedKonuMatch = result.match(/1\)\s*(?:SORUNUN\s*)?KONU[SU]?[:\s]*([\s\S]*?)(?=2\)|3\)|4\)|##|\*\*|$)/i);
      const numberedDegerlendirmeMatch = result.match(/4\)\s*(?:VERGİLEX\s*)?DEĞERLENDİRME[Sİ]?[:\s]*([\s\S]*?)(?=5\)|SON\s*BÖLÜM|DİPNOTLAR|##|\*\*|$)/i);

      // PATTERN 2: Markdown format (## Konu, ## Değerlendirme)
      const markdownKonuMatch = result.match(/##\s*Konu[:\s]*\n?([\s\S]*?)(?=##|$)/i);
      const markdownDegerlendirmeMatch = result.match(/##\s*Değerlendirme[:\s]*\n?([\s\S]*?)(?=##|$)/i);

      // PATTERN 3: Bold format (**Konu:** ... **Değerlendirme:**)
      const boldKonuMatch = result.match(/\*\*Konu[:\*]*\*\*[:\s]*([\s\S]*?)(?=\*\*[A-ZÇĞİÖŞÜa-z]|##|$)/i);
      const boldDegerlendirmeMatch = result.match(/\*\*Değerlendirme[:\*]*\*\*[:\s]*([\s\S]*?)(?=\*\*[A-ZÇĞİÖŞÜa-z]|##|$)/i);

      // PATTERN 4: Simple colon format (Konu: ... Değerlendirme:)
      const simpleKonuMatch = result.match(/^Konu[:\s]+([\s\S]*?)(?=\n\s*(?:Değerlendirme|Anahtar|Dayanaklar|$))/im);
      const simpleDegerlendirmeMatch = result.match(/Değerlendirme[:\s]+([\s\S]*?)(?=\n\s*(?:Konu|Anahtar|Dayanaklar|Dipnotlar|$))/im);

      // Use whichever format is found (prioritize numbered, then markdown, then bold, then simple)
      const konuContent = numberedKonuMatch?.[1]?.trim()
        || markdownKonuMatch?.[1]?.trim()
        || boldKonuMatch?.[1]?.trim()
        || simpleKonuMatch?.[1]?.trim()
        || '';

      let assessmentContent = numberedDegerlendirmeMatch?.[1]?.trim()
        || markdownDegerlendirmeMatch?.[1]?.trim()
        || boldDegerlendirmeMatch?.[1]?.trim()
        || simpleDegerlendirmeMatch?.[1]?.trim()
        || '';

      console.log('[FORMAT] Pattern matches - Konu:', !!konuContent, 'Assessment:', !!assessmentContent);

      // ═══════════════════════════════════════════════════════════════
      // ALWAYS CLEAN UP assessmentContent - remove any LLM section headers that leaked through
      // ═══════════════════════════════════════════════════════════════
      const cleanupPatterns = [
        /1\)\s*SORUNUN\s*KONUSU[:\s]*/gi,
        /2\)\s*ANAHTAR\s*KELİMELER[:\s]*[^\n]*\n?/gi,
        /3\)\s*(?:İLGİLİ\s*)?YASAL\s*DÜZENLEMELER[^\n]*[\s\S]*?(?=4\)|$)/gi,
        /4\)\s*(?:VERGİLEX\s*)?DEĞERLENDİRME[Sİ]?[:\s]*/gi,
        /SON\s*BÖLÜM[:\s]*DİPNOTLAR[\s\S]*$/gi,
        /5\)\s*DİPNOTLAR[\s\S]*$/gi,
        /##\s*Dipnotlar[\s\S]*$/gi,
        /##\s*Anahtar\s*(?:Terim|Kelime)[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi,
        /##\s*Dayanaklar[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi,
      ];

      // If no specific sections found, use entire response as assessment (fallback)
      if (!konuContent && !assessmentContent) {
        console.log('[FORMAT] No structured sections found - using full response as assessment');
        assessmentContent = result;
      }

      // Clean assessment content from any leaked section headers
      for (const pattern of cleanupPatterns) {
        assessmentContent = assessmentContent.replace(pattern, '');
      }
      assessmentContent = assessmentContent.replace(/\n{3,}/g, '\n\n').trim();

      // ═══════════════════════════════════════════════════════════════
      // BUILD FORMATTED OUTPUT - Use backendLabels from routingSchema (NOT hardcoded)
      // ═══════════════════════════════════════════════════════════════

      // Get section labels from schema
      const keywordsSection = routingSchema.articleSections?.find(s => s.id === 'keywords');
      const assessmentSection = routingSchema.articleSections?.find(s => s.id === 'assessment');

      // NOTE: "Konu" section removed in 2-section format (keywords + assessment only)
      // If you need it back, add to routingSchema.articleSections with id='topic'
      if (konuContent) {
        // Legacy support: KONU section (not in current schema)
        formattedResponse += `KONU:\n${konuContent}\n\n`;
      }

      // Add backend-generated Anahtar Terimler (from sources, not LLM)
      // Only add if not a refusal response
      if (keywordsFromSources.length > 0 && keywordsSection) {
        const label = keywordsSection.backendLabel || 'ANAHTAR_TERIMLER:';
        formattedResponse += `${label}\n${keywordsFromSources.join(', ')}\n\n`;
      }

      // NOTE: Dayanaklar bölümü kaldırıldı - atıflar metin içinde [1], [2] şeklinde gösterilir
      // Kaynaklar frontend'de Atıflar bölümünde listelenir (ZenMessage sources)
      // const dayanaklar = ... - artık kullanılmıyor

      // ═══════════════════════════════════════════════════════════════
      // VERDICT HARD GATE: Soften definitive statements if sources don't support
      // If LLM uses strong verdict words but sources don't contain them,
      // replace with hedged versions
      // ═══════════════════════════════════════════════════════════════
      if (assessmentContent && !isRefusalResponse) {
        // Definitive verdict patterns that require source backing
        const definitivePatterns = [
          { pattern: /\bzorunludur\b/gi, softened: 'zorunlu olabilir', sourceCheck: /zorunlu(?:dur)?/i },
          { pattern: /\byasaktır\b/gi, softened: 'yasak olabilir', sourceCheck: /yasak(?:tır)?/i },
          { pattern: /\bmecburidir\b/gi, softened: 'mecburi olabilir', sourceCheck: /mecburi(?:dir)?/i },
          { pattern: /\bgereklidir\b/gi, softened: 'gerekli olabilir', sourceCheck: /gerekli(?:dir)?/i },
          { pattern: /\bmümkün\s*değildir\b/gi, softened: 'mümkün olmayabilir', sourceCheck: /mümkün\s*değil/i },
          { pattern: /\bkabuledilemez\b/gi, softened: 'kabul edilmeyebilir', sourceCheck: /kabul\s*edilemez/i },
        ];

        // Combine all source content to check for supporting evidence
        const allSourceContent = searchResults.slice(0, 10)
          .map(s => (s.content || s.text || s.excerpt || '') + ' ' + (s.title || ''))
          .join(' ')
          .toLowerCase();

        for (const { pattern, softened, sourceCheck } of definitivePatterns) {
          if (pattern.test(assessmentContent)) {
            // Check if sources contain supporting evidence
            const hasSourceSupport = sourceCheck.test(allSourceContent);
            if (!hasSourceSupport) {
              console.log(`[VERDICT-GATE] Softening unsupported verdict: ${pattern.source} -> ${softened}`);
              assessmentContent = assessmentContent.replace(pattern, softened);
            } else {
              console.log(`[VERDICT-GATE] Keeping verdict (source-backed): ${pattern.source}`);
            }
          }
        }
      }

      // Add assessment with citation references preserved
      // v12.10 FIX: Always add assessment content even if assessmentSection not in schema
      if (assessmentContent) {
        const label = assessmentSection?.backendLabel || 'DEGERLENDIRME:';
        formattedResponse += `${label}\n${assessmentContent}`;
      }

      console.log('[FORMAT] Parsed sections - Konu: ' + (konuContent ? 'found' : 'missing') +
                  ', Assessment: ' + (assessmentContent ? `found (${assessmentContent.length} chars)` : 'missing'));

      // v12.10 FIX: If formattedResponse is too short, return original result to preserve content
      const MIN_FORMATTED_LENGTH = 200;
      if (formattedResponse.trim().length < MIN_FORMATTED_LENGTH && result.trim().length > formattedResponse.trim().length) {
        console.log(`[FORMAT] ⚠️ Formatted response too short (${formattedResponse.length} chars), using original (${result.length} chars)`);
        return result.trim();
      }

      return formattedResponse.trim() || result.trim();
    }

    // 📋 LEGACY FORMAT: Enforce **CEVAP** header
    const hasCevap = /\*\*CEVAP\*\*/i.test(result);

    // If no CEVAP header, wrap the response
    if (!hasCevap) {
      console.log('[FORMAT] Missing **CEVAP** header - wrapping response');
      // Find if there's any content before potential sections
      const content = result.replace(/\*\*[A-Z]+\*\*[\s\S]*/gi, '').trim();
      if (content) {
        result = '**CEVAP**\n' + content + '\n\n' + result.replace(content, '').trim();
      } else {
        result = '**CEVAP**\n' + result;
      }
    }

    // 🔧 ALINTI section removed - citations shown separately in UI
    // Strip any existing ALINTI section from LLM response
    result = result.replace(/\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '').trim();
    result = result.replace(/\*\*QUOTE\*\*[\s\S]*?(?=\*\*[A-Z]|\n\n\n|$)/gi, '').trim();

    return result;

    // --- REMOVED: ALINTI handling code below is no longer used ---
    /*
    const hasAlinti = /\*\*ALINTI\*\*/i.test(result);
    if (!hasAlinti) {
      console.log('[FORMAT] Missing **ALINTI** header - adding section');

      // Extract CEVAP section to find key terms mentioned in answer
      const cevapMatch = result.match(/\*\*CEVAP\*\*\s*([\s\S]*?)(?=\*\*[A-Z]|\n\n\n|$)/i);
      const answerText = (cevapMatch?.[1] || '').toLowerCase();

      // Key terms to search for in sources (extract from answer)
      // 🔧 IMPROVED: Extract key terms from answer + domain config
      const potentialKeyTerms = answerText.match(/\b(?:fotokopi|şube|sube|tasdik|asıl|asil|zorunlu|mecburi|gerekli|levha|vergi|özelge|ozelge|tebliğ|teblig|madde|kanun|asmak|asılır|asilir|bulundur|mümkün|mumkun|yasak|ceza)\b/gi) || [];
      const keyTermsLower = [...new Set(potentialKeyTerms.map(t => t.toLowerCase()))];

      let alintıContent = '';
      let bestQuote = '';
      let bestSource = '';
      let bestScore = 0;
      let bestSourceType = '';

      // Search through all results for best matching sentence
      for (const searchResult of searchResults) {
        let sourceContent = searchResult.content || searchResult.text || searchResult.excerpt || '';
        const sourceTitle = searchResult.title || 'Kaynak';
        const sourceType = searchResult.source_type || searchResult.metadata?.source_type || 'document';

        // 🔧 FIX: Decode HTML entities BEFORE sentence splitting
        sourceContent = sourceContent
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&#39;/gi, "'")
          .replace(/&quot;/gi, '"')
          .replace(/&#\d+;/gi, '')
          .replace(/<br\s*\/?>/gi, '. ')
          .replace(/<\/?(p|div|li|tr|td)>/gi, '. ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // 🔧 DOCUMENT-TYPE SECTION FINDER: Extract ruling section based on document type
        // This focuses quote extraction on the actual ruling part of the document
        const rulingContent = this.extractRulingSection(sourceContent, sourceType);
        // Use ruling section if found, otherwise use full content
        const contentForQuotes = rulingContent.length > 50 ? rulingContent : sourceContent;

        // 🔧 FIX: Better Turkish sentence splitting
        // Split on: period+space+capital, exclamation, question mark
        // But preserve abbreviations like "vb.", "vs.", "No."
        const sentences = contentForQuotes
          .replace(/\b(vb|vs|No|Md|Dr|Prof|vd)\.\s*/gi, '$1<DOT>')
          .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ])/)
          .map(s => s.replace(/<DOT>/g, '. '))
          .filter((s: string) => {
            const trimmed = s.trim();
            // 🔧 FIX: Keep "Konu:" sentences - they often contain key rulings!
            // Only filter out pure metadata headers (Tarih:, Sayı:)
            return trimmed.length > 40 &&
                   trimmed.length < 600 &&
                   !trimmed.match(/^(Tarih|Sayı|Dosya No|T\.C\.):/i) &&
                   !trimmed.match(/^[A-Z\s]{20,}$/); // All-caps headers only
          });

        // 🔧 FIX: Also check for "Konu:" content which often has the ruling
        const konuMatch = sourceContent.match(/Konu:\s*([^.]+(?:\.[^.]+)?)/i);
        if (konuMatch && konuMatch[1] && konuMatch[1].length > 40) {
          sentences.push(konuMatch[1].trim());
        }

        for (const sentence of sentences) {
          const sentenceLower = sentence.toLowerCase();

          // ========================================
          // 🚫 HARD FILTER: Non-verdict sentences are NEVER candidates
          // ========================================
          // These patterns indicate preamble/question text, NOT rulings.
          // Unlike penalty-based scoring, these sentences are SKIPPED entirely.
          const NON_VERDICT_HARD_FILTERS = [
            /ilgi\s+dilekçe/i,           // "İlgi dilekçenizden..."
            /dilekçeniz(?:de|den|le)/i,  // "Dilekçenizde..."
            /sorulmaktadır/i,            // "...sorulmaktadır"
            /sorulmuştur/i,              // "...sorulmuştur"
            /tereddüt/i,                 // Any mention of "tereddüt" = not a ruling
            /talep\s+edilmektedir/i,     // "talep edilmektedir"
            /bilgi\s+(?:verilmesi|istenmiş)/i,   // "bilgi verilmesi istenmiştir"
            /(?:yukarıda|aşağıda)\s+(?:belirtilen|açıklanan)/i, // meta-references
            /(?:hususunda|konusunda)\s+görüş/i,  // "hususunda görüşünüz"
            /başvuru(?:nuz|da)/i,        // "başvurunuzda..."
            /talebiniz/i,                // "talebiniz..."
            /soru(?:nuz|larınız)/i       // "sorunuz..."
          ];

          // HARD FILTER: Skip this sentence entirely if it matches
          const isNonVerdict = NON_VERDICT_HARD_FILTERS.some(p => p.test(sentence));
          if (isNonVerdict) {
            console.log(`[QUOTE-SCORER] 🚫 HARD FILTER: Skipping non-verdict sentence: "${sentence.substring(0, 40)}..."`);
            continue; // Skip to next sentence - this one is NOT a candidate
          }

          // Score based on how many key terms are present
          let score = 0;
          for (const term of keyTermsLower) {
            if (sentenceLower.includes(term)) score += 1;
          }

          // 🔧 IMPROVED: Higher bonus for authoritative sources
          const sourceTypeLower = sourceType.toLowerCase();
          if (sourceTypeLower.includes('ozelge') || sourceTypeLower.includes('özelge')) {
            score += 3; // Özelge is most authoritative for specific rulings
          } else if (sourceTypeLower.includes('tebli') || sourceTypeLower.includes('kanun')) {
            score += 2;
          } else if (sourceTypeLower.includes('danistay') || sourceTypeLower.includes('danıştay')) {
            score += 2;
          }

          // 🔧 AGGRESSIVE: Bonus for verdict-like sentences
          // These are actual rulings/conclusions
          const VERDICT_PATTERNS = [
            /\b(?:mümkündür|mümkün\s+değildir|mümkün\s+bulunmaktadır)\b/i,  // +5
            /\b(?:zorunludur|mecburidir|gerekir|gerekmektedir)\b/i,         // +5
            /\b(?:yasaktır|yasaklanmıştır|uygulanamaz)\b/i,                 // +5
            /\b(?:uygulanır|uygulanacaktır|uygulanmaktadır)\b/i,            // +4
            /\b(?:kaldırılmıştır|yürürlükten\s+kaldırılmış)\b/i,            // +4
            /\b(?:asılabilir|asılması\s+(?:mümkündür|gerekir))\b/i,         // +5
            /\b(?:bulundurulabilir|bulundurulması\s+(?:mümkündür|zorunludur))\b/i, // +5
            /\b(?:fotokopi(?:si)?\s+(?:ile|olarak)\s+(?:asıl|kullanıl))\b/i // +5 - specific to levha questions
          ];
          for (const pattern of VERDICT_PATTERNS) {
            if (pattern.test(sentence)) {
              score += 5; // Strong boost for actual rulings
              break; // Only count once
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestQuote = sentence.trim();
            bestSource = sourceTitle + ' (' + sourceType + ')';
            bestSourceType = sourceType;
          }
        }
      }

      // 🔧 FIX: Increased threshold + query relevance check
      const MIN_QUOTE_SCORE = 4;  // Increased from 3

      // 🔒 QUOTE RELEVANCE VALIDATION
      // Even if score is high, verify quote actually relates to query
      const queryTerms = (originalQuery || answerText)
        .toLowerCase()
        .split(/\s+/)
        .filter((t: string) => t.length > 3 && !['mümkün', 'zorunlu', 'nedir', 'nasıl', 'hangi', 'kadar'].includes(t));

      const quoteHasQueryRelevance = bestQuote
        ? queryTerms.some((term: string) => bestQuote.toLowerCase().includes(term))
        : false;

      // Quote must score >= MIN AND have query term overlap
      const isValidQuote = bestQuote &&
        bestScore >= MIN_QUOTE_SCORE &&
        (quoteHasQueryRelevance || bestScore >= 8);  // Very high score can bypass relevance check

      if (isValidQuote) {
        // Good quote found - use it
        alintıContent = '> "' + bestQuote + '..."\n\n' + bestSource;
        console.log('[FORMAT] ✅ Found relevant quote with score ' + bestScore + ' from ' + bestSourceType + ': ' + bestQuote.substring(0, 50) + '...');
      } else {
        // Log why quote was rejected
        if (bestQuote && bestScore >= MIN_QUOTE_SCORE && !quoteHasQueryRelevance) {
          console.log('[FORMAT] ❌ Quote rejected: score=' + bestScore + ' but no query term overlap. Query terms: ' + queryTerms.slice(0, 5).join(', '));
        }
        // ========================================
        // 🔒 EVIDENCE-FIRST CONTRACT
        // ========================================
        // "ALINTI yoksa kesin hüküm yok" - bu tek kural seti
        // Sistem asla "bilgi yok" demesin; kaynakları göstersin
        console.log('[FORMAT] 🔒 EVIDENCE-FIRST: No quote found (bestScore=' + bestScore + ') - applying contract');

        // ========================================
        // 🔒 VERDICT QUESTION DETECTION
        // ========================================
        // Uses ORIGINAL user query, NOT LLM response text!
        // This prevents false negatives when LLM doesn't echo the question.
        // NOTE: Turkish characters (ı, ğ, ş, ü, ö, ç, İ) are NOT word characters in JS regex!
        // So \b after Turkish chars fails. Use (?=\s|$|[?!,.)]) instead of trailing \b
        const TR_END = '(?=\\s|$|[?!,.);:\\]])';  // Turkish-safe word end boundary
        const VERDICT_QUESTION_PATTERNS = [
          // === YES/NO VERDICT PATTERNS ===
          // Turkish-safe: no trailing \b, use TR_END lookahead
          new RegExp(`\\b(?:mümkün\\s+mü|mümkün\\s+müdür|olabilir\\s+mi)${TR_END}`, 'i'),
          new RegExp(`\\b(?:zorunlu\\s+mu|mecburi\\s+mi|gerekli\\s+mi|şart\\s+mı)${TR_END}`, 'i'),
          new RegExp(`\\b(?:zorunda\\s+mı|zorunda\\s+mıdır)${TR_END}`, 'i'),  // "asılmak zorunda mı"
          new RegExp(`\\b(?:yasak\\s+mı|yasaklandı\\s+mı)${TR_END}`, 'i'),
          new RegExp(`\\b(?:kaldırıldı\\s+mı|kalktı\\s+mı|yürürlükte\\s+mi)${TR_END}`, 'i'),
          new RegExp(`\\b(?:kaldırdı\\s+mı|kaldırır\\s+mı|kaldırıyor\\s+mu)${TR_END}`, 'i'),  // Active voice
          new RegExp(`\\b(?:asılabilir\\s+mi|asılır\\s+mı|bulundurulabilir\\s+mi)${TR_END}`, 'i'),
          new RegExp(`\\b(?:uygulanır\\s+mı|geçerli\\s+mi)${TR_END}`, 'i'),
          new RegExp(`\\b(?:var\\s+mı|yok\\s+mu)${TR_END}`, 'i'),
          // Additional patterns for implicit verdict questions
          /\b(?:zorunlu(?:luk|luğu)?)\s+var\b/i,  // "zorunluluk var mı"
          /\b(?:asma|bulundurma)\s+(?:mecburiyeti|zorunluluğu)\b/i,  // "asma zorunluluğu"

          // === PROCEDURAL PATTERNS (Evidence-First required) ===
          // These questions need specific documentary evidence, not LLM opinions
          /\b(?:nereye)\s+(?:yazılır|girilir|kaydedilir|bildirilir|beyan\s+edilir)\b/i,  // "nereye yazılır"
          /\b(?:hangi)\s+(?:alana?|satıra?|koda?|bölüme?|beyanname(?:ye)?)\s+(?:yazılır|girilir)\b/i,  // "hangi alana girilir"
          /\b(?:hangi)\s+(?:kodu?|satırı?)\b/i,  // "hangi kod", "hangi satır"
          /\b(?:kaç)\s+(?:gün(?:de)?|ay(?:da)?|yıl(?:da)?|süre(?:de)?)\b/i,  // "kaç gün", "kaç günde"
          /\b(?:ne\s+zaman(?:a\s+kadar)?|hangi\s+tarih(?:te|e)?)\b/i,  // "ne zaman", "hangi tarihte"
          /\b(?:süre(?:si)?|vade(?:si)?)\s+(?:ne\s+kadar|kaç)\b/i,  // "süre ne kadar"
          /\b(?:oran(?:ı)?)\s+(?:kaç|ne\s+kadar|yüzde\s+kaç)\b/i,  // "oranı kaç", "yüzde kaç"
          /\b(?:limit(?:i)?|tutar(?:ı)?|miktar(?:ı)?)\s+(?:kaç|ne\s+kadar)\b/i,  // "limiti kaç", "tutarı ne kadar"
          /\b(?:kaçıncı|kaç\s+numaralı)\s+(?:madde|satır|kod|alan)\b/i  // "kaçıncı madde"
        ];

        // Check ORIGINAL query, not LLM response
        const queryToCheck = originalQuery || answerText;
        const isVerdictQuestion = VERDICT_QUESTION_PATTERNS.some(p => p.test(queryToCheck));

        console.log(`[FORMAT] Verdict check: query="${queryToCheck.substring(0, 50)}...", isVerdict=${isVerdictQuestion}`);

        if (isVerdictQuestion && searchResults.length > 0) {
          // ========================================
          // 🔒 HARD GATE: Verdict question + no quote = BLOCK ALL HALF-VERDICTS
          // ========================================
          // "asılabilir", "mümkün olabilir", "zorunlu olabilir" gibi yarım-hükümler YASAK.
          // Sadece "hüküm cümlesi seçilemedi" mesajı ve kaynaklar gösterilir.
          console.log('[FORMAT] 🔒 HARD GATE: Verdict question with no quote - blocking half-verdicts');

          // Build source list (top 3, sorted by hierarchy: Kanun > Tebliğ > Özelge > Danıştay)
          const sourceHierarchy = ['kanun', 'teblig', 'tebliğ', 'ozelge', 'özelge', 'danistay', 'danıştay', 'sirkuler'];

          // 🔒 FIX #1: Filter out irrelevant document_embeddings (kobi, kosgeb, generic PDFs)
          const IRRELEVANT_KEYWORDS = ['kobi', 'kosgeb', 'destekleri', 'hibe', 'teşvik programı', 'girişimci'];
          const relevantSources = [...searchResults].filter(r => {
            const title = (r.title || '').toLowerCase();
            const sourceTable = (r.source_table || '').toLowerCase();
            const content = (r.content || '').toLowerCase().substring(0, 500);

            // Skip document_embeddings with irrelevant keywords
            if (sourceTable.includes('document_embeddings') || sourceTable.includes('döküman')) {
              const hasIrrelevantKeyword = IRRELEVANT_KEYWORDS.some(kw =>
                title.includes(kw) || content.includes(kw)
              );
              if (hasIrrelevantKeyword) {
                console.log(`[FORMAT] Filtering out irrelevant source: ${title.substring(0, 50)}`);
                return false;
              }
            }
            return true;
          });

          const sortedSources = relevantSources.sort((a, b) => {
            const typeA = (a.source_type || a.source_table || '').toLowerCase();
            const typeB = (b.source_type || b.source_table || '').toLowerCase();
            const indexA = sourceHierarchy.findIndex(h => typeA.includes(h));
            const indexB = sourceHierarchy.findIndex(h => typeB.includes(h));
            return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
          });

          // 🔒 FIX #2: Use consistent slice size (top 3) for both display AND count
          const TOP_SOURCE_COUNT = 3;

          // Enhanced source list with relevance context
          const topSources = sortedSources.slice(0, TOP_SOURCE_COUNT).map((r, i) => {
            const title = r.title || 'Kaynak';
            const type = r.source_type || r.source_table || 'Belge';
            const score = r.similarity_score || r.score || 0;
            const relevance = score > 0.7 ? '●●●' : score > 0.5 ? '●●○' : '●○○';
            // Extract date if available
            const date = r.metadata?.tarih || r.metadata?.date || '';
            const dateStr = date ? ` (${date})` : '';
            return `${i + 1}. **${title}**${dateStr}\n   _Tür: ${type} | Eşleşme: ${relevance}_`;
          }).join('\n\n');

          // Count source types for justification - 🔒 FIX #2: Use same TOP_SOURCE_COUNT
          const sourceTypeCounts = sortedSources.slice(0, TOP_SOURCE_COUNT).reduce((acc, r) => {
            const type = (r.source_type || r.source_table || 'diger').toLowerCase();
            if (type.includes('ozelge') || type.includes('özelge')) acc.ozelge++;
            else if (type.includes('kanun')) acc.kanun++;
            else if (type.includes('teblig') || type.includes('tebliğ')) acc.teblig++;
            else if (type.includes('danistay') || type.includes('danıştay')) acc.danistay++;
            else acc.diger++;
            return acc;
          }, { ozelge: 0, kanun: 0, teblig: 0, danistay: 0, diger: 0 });

          // Build justification based on what we found
          const foundTypes = [];
          if (sourceTypeCounts.kanun > 0) foundTypes.push(`${sourceTypeCounts.kanun} kanun`);
          if (sourceTypeCounts.teblig > 0) foundTypes.push(`${sourceTypeCounts.teblig} tebliğ`);
          if (sourceTypeCounts.ozelge > 0) foundTypes.push(`${sourceTypeCounts.ozelge} özelge`);
          if (sourceTypeCounts.danistay > 0) foundTypes.push(`${sourceTypeCounts.danistay} Danıştay kararı`);
          const foundTypesStr = foundTypes.length > 0 ? foundTypes.join(', ') : 'çeşitli belgeler';

          // 🔒 REPLACE entire response - NO HALF-VERDICTS ALLOWED
          const evidenceFirstResponse = language === 'tr'
            ? `**CEVAP**\n🔍 **Arama Sonucu:** Bu konuda ${foundTypesStr} bulundu.\n\n⚠️ **Neden net hüküm yok?**\nBulunan belgelerde sorunuzla doğrudan örtüşen tek bir hüküm cümlesi tespit edilemedi. Bu durum şu nedenlerden kaynaklanabilir:\n• İlgili hüküm belgenin farklı bir bölümünde olabilir\n• Konu birden fazla mevzuatta ele alınmış olabilir\n• Sorunun kapsamı mevcut belgelerden daha spesifik olabilir\n\n📚 **İncelenecek Kaynaklar:**\n${topSources}\n\n_💡 Öneri: Yukarıdaki kaynakların "Sonuç", "Açıklamalar" veya "Hüküm" bölümlerini inceleyiniz._`
            : `**ANSWER**\n🔍 **Search Result:** Found ${foundTypesStr} on this topic.\n\n⚠️ **Why no clear verdict?**\nNo single ruling sentence directly matching your question was found in the documents. This may be because:\n• The relevant ruling may be in a different section of the document\n• The topic may be addressed in multiple regulations\n• Your question may be more specific than available documents\n\n📚 **Sources to Review:**\n${topSources}\n\n_💡 Tip: Review the "Conclusion", "Explanations" or "Ruling" sections of the sources above._`;

          result = evidenceFirstResponse;
          alintıContent = language === 'tr'
            ? '_Net hüküm cümlesi otomatik seçilemedi. Yukarıdaki kaynaklarda ilgili bölüm incelenmelidir._'
            : '_A clear ruling sentence could not be automatically extracted. Please review the relevant sections in the sources above._';

          // 🔒 FIX #3: Clarify responseType for verdict questions
          // Verdict + no quote = FOUND (sources exist, just no extractable verdict)
          // NOT NOT_FOUND (that would mean no relevant sources at all)
          console.log(`[FORMAT] 🔒 Verdict HARD GATE applied: responseType=FOUND (${sortedSources.length} sources, but no extractable verdict)`);

        } else {
          // Non-verdict question (tanım, açıklama, nedir, nasıl)
          // These can show LLM response with disclaimer
          // BUT we must still strip any definitive verdict words that LLM might have generated
          console.log('[FORMAT] Non-verdict question - stripping verdicts + adding disclaimer');

          // 🔒 STRIP DEFINITIVE VERDICT WORDS from LLM response
          // These create false certainty when no supporting quote exists
          const DEFINITIVE_VERDICT_WORDS = [
            // Affirmative verdicts
            [/\b(mümkündür|mümkün\s+bulunmaktadır)\b/gi, 'mümkün olabilir'],
            [/\b(zorunludur|mecburidir|zorunlu\s+bulunmaktadır)\b/gi, 'zorunlu olabilir'],
            [/\b(zorunluluğu\s+(?:bulunmaktadır|vardır|devam\s+etmektedir))\b/gi, 'zorunluluğu olabilir'],  // "zorunluluğu bulunmaktadır"
            [/\b(yasaktır|yasaklanmıştır)\b/gi, 'yasak olabilir'],
            [/\b(uygulanır|uygulanmaktadır|uygulanacaktır)\b/gi, 'uygulanabilir'],
            [/\b(kaldırılmıştır|yürürlükten\s+kalkmıştır)\b/gi, 'kaldırılmış olabilir'],
            [/\b(kaldırmıştır|kaldırmaktadır)\b/gi, 'kaldırmış olabilir'],  // Active voice: "kaldırmıştır"
            [/\b(gerekir|gerekmektedir|gereklidir)\b/gi, 'gerekebilir'],
            // Negative verdicts
            [/\b(mümkün\s+değildir|mümkün\s+bulunmamaktadır)\b/gi, 'mümkün olmayabilir'],
            [/\b(uygulanamaz|uygulanmaz)\b/gi, 'uygulanmayabilir'],
            [/\b(gerekmez|gerekmemektedir)\b/gi, 'gerekmeyebilir'],
            [/\b(zorunluluğu\s+(?:kaldırılmıştır|yoktur|bulunmamaktadır))\b/gi, 'zorunluluğu kaldırılmış olabilir'],  // "zorunluluğu kaldırılmıştır"
            // Specific verdicts
            [/\b(asılabilir|asılması\s+mümkündür)\b/gi, 'asılması mümkün olabilir'],
            [/\b(asılamaz|asılması\s+mümkün\s+değildir)\b/gi, 'asılması mümkün olmayabilir'],
            [/\b(bulundurulabilir)\b/gi, 'bulundurulabilir olabilir'],
          ];

          for (const [pattern, replacement] of DEFINITIVE_VERDICT_WORDS) {
            if ((pattern as RegExp).test(result)) {
              console.log('[FORMAT] 🔒 Stripping definitive verdict: ' + (pattern as RegExp).source);
              result = result.replace(pattern as RegExp, replacement as string);
            }
          }

          // Add disclaimer for non-verdict questions
          const noQuoteDisclaimer = language === 'tr'
            ? '\n\n_⚠️ Bu bilgi kaynaklara dayanmaktadır ancak doğrudan destekleyen alıntı tespit edilememiştir. Kesin bilgi için ilgili mevzuata başvurunuz._'
            : '\n\n_⚠️ This information is based on sources but no direct supporting quote was found. Please refer to the relevant legislation for definitive information._';

          // Only add disclaimer, do not modify content
          if (!result.includes('⚠️')) {
            result = result.replace(
              /(\*\*CEVAP\*\*\s*[\s\S]*?)(?=\*\*[A-Z]|\n\n\n|$)/i,
              '$1' + noQuoteDisclaimer
            );
          }

          // Set ALINTI content for non-verdict questions (no quote found)
          alintıContent = language === 'tr'
            ? '_Kaynaklarda bu konuya ilişkin içerik bulunmakla birlikte, cevabı doğrudan destekleyen kısa ve net bir alıntı tespit edilememiştir._'
            : '_While sources contain relevant content, no short and clear quote directly supporting this answer was found._';
        }
      }

      // Append ALINTI section
      result = result.trimEnd() + '\n\n**ALINTI**\n' + alintıContent;
    }

    return result;
  }

  /**
   * 🧹 REMOVE INVALID QUOTE (Hard Fail)
   * Removes ALINTI/QUOTE section from response when topic mismatch is detected
   * Replaces with a clean "no relevant quote found" message
   *
   * "Yanlış alıntı göstermek, alıntı yok demekten çok daha kötü."
   */
  private removeInvalidQuote(responseText: string, language: string = 'tr'): string {
    let cleaned = responseText;

    // Pattern to match ALINTI section (Turkish)
    const alintıPattern = /\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü]*\*\*|\n\n\n|$)/gi;

    // Pattern to match QUOTE section (English)
    const quotePattern = /\*\*QUOTE\*\*[\s\S]*?(?=\*\*[A-Z][A-Za-z]*\*\*|\n\n\n|$)/gi;

    // Check if there's an ALINTI section
    const hasAlinti = alintıPattern.test(cleaned);
    alintıPattern.lastIndex = 0; // Reset regex state

    const hasQuote = quotePattern.test(cleaned);
    quotePattern.lastIndex = 0;

    if (hasAlinti) {
      // Simply remove invalid ALINTI section - no placeholder
      cleaned = cleaned.replace(alintıPattern, '');
      console.log(`🧹 Removed invalid ALINTI section (no placeholder)`);
    } else if (hasQuote) {
      // Simply remove invalid QUOTE section - no placeholder
      cleaned = cleaned.replace(quotePattern, '');
      console.log(`🧹 Removed invalid QUOTE section (no placeholder)`);
    }
    // If no ALINTI/QUOTE section exists, don't add anything - just return as-is

    // Clean up multiple newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * 🔢 NUMBER VALIDATION FOR "HANGI TEBLİĞ/MADDE?" QUESTIONS (Eksik-3 Fix)
   * When question asks "hangi tebliğ/madde/kanun", validates that:
   * 1. The number in CEVAP also appears in ALINTI
   * 2. If multiple conflicting numbers exist, flags for conflict handling
   *
   * Returns validation result with:
   * - valid: true if number in answer matches quote
   * - conflictNumbers: array if multiple different numbers found in sources
   */
  private validateNumberInQuote(
    question: string,
    responseText: string,
    searchResults: any[],
    language: string = 'tr'
  ): { valid: boolean; reason?: string; answerNumber?: string; quoteNumber?: string; conflictNumbers?: string[] } {
    const questionLower = question.toLowerCase();

    // Check if this is a "hangi tebliğ/madde/kanun" type question
    const numberQuestionPatterns = [
      /hangi\s+(tebliğ|teblig|madde|kanun|sirk[üu]ler|karar|genelge)/i,
      /kaçıncı\s+(madde|fıkra|bent)/i,
      /kaç\s*(?:nolu|numaralı|seri)/i,
      /(\d+)\s*(?:nolu|numaralı|seri|sayılı)\s+(?:tebliğ|kanun|madde)/i
    ];

    const isNumberQuestion = numberQuestionPatterns.some(p => p.test(questionLower));
    if (!isNumberQuestion) {
      return { valid: true }; // Not a number question, skip validation
    }

    console.log(`🔢 NUMBER VALIDATION: Detected "hangi tebliğ/madde?" type question`);

    // Extract the CEVAP section
    const cevapMatch = responseText.match(/\*\*CEVAP\*\*([\s\S]*?)(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/i);
    if (!cevapMatch) {
      return { valid: true }; // No answer to validate
    }

    const answerText = cevapMatch[1];

    // Extract numbers from answer (looking for tebliğ/madde numbers)
    // Patterns: "117 nolu", "117 seri", "107 sayılı", "madde 5", etc.
    const numberPatterns = [
      /(\d+)\s*(?:nolu|no'lu|numaralı|seri|sayılı)/gi,
      /(?:tebliğ|kanun|madde|sirküler)\s*(?:no|numarası)?\s*[:=]?\s*(\d+)/gi,
      /(\d{2,4})\s*(?:nolu|seri)\s*(?:kdv|katma değer|gelir|kurumlar)?\s*tebliğ/gi
    ];

    const answerNumbers: string[] = [];
    for (const pattern of numberPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(answerText)) !== null) {
        const num = match[1];
        if (num && !answerNumbers.includes(num) && parseInt(num) >= 10) {
          answerNumbers.push(num);
        }
      }
    }

    if (answerNumbers.length === 0) {
      console.log(`🔢 NUMBER VALIDATION: No specific numbers found in answer`);
      return { valid: true }; // No number to validate
    }

    console.log(`🔢 NUMBER VALIDATION: Found answer numbers: [${answerNumbers.join(', ')}]`);

    // Extract the ALINTI section
    const alintiMatch = responseText.match(/\*\*ALINTI\*\*([\s\S]*?)(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/i);
    if (!alintiMatch) {
      // No quote to validate against - this is OK, but flag it
      console.log(`🔢 NUMBER VALIDATION: No ALINTI section to validate against`);
      return { valid: true, answerNumber: answerNumbers[0] };
    }

    const quoteText = alintiMatch[1];

    // Check if the answer number appears in the quote
    const answerNumber = answerNumbers[0];
    const numberInQuote = quoteText.includes(answerNumber);

    if (!numberInQuote) {
      console.log(`📊 [METRIC] NUMBER_MISMATCH: answerNumber="${answerNumber}" not found in ALINTI`);
      console.log(`🔢 NUMBER VALIDATION FAIL: Number ${answerNumber} in answer but not in quote`);

      // Try to find what number IS in the quote
      const quoteNumbers: string[] = [];
      for (const pattern of numberPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(quoteText)) !== null) {
          const num = match[1];
          if (num && !quoteNumbers.includes(num) && parseInt(num) >= 10) {
            quoteNumbers.push(num);
          }
        }
      }

      return {
        valid: false,
        reason: `Answer says "${answerNumber}" but quote doesn't contain this number`,
        answerNumber,
        quoteNumber: quoteNumbers[0] || 'none'
      };
    }

    // Check for conflicting numbers in search results (multiple different tebliğ numbers)
    const allNumbersInResults: Set<string> = new Set();
    for (const result of searchResults) {
      const content = (result.content || result.text || '').toLowerCase();
      // Only check high-authority sources for conflict
      const sourceType = (result.source_type || result.source_table || '').toLowerCase();
      const isHighAuthority = sourceType.includes('ozelge') || sourceType.includes('tebli') ||
        sourceType.includes('regulation') || sourceType.includes('kanun');

      if (isHighAuthority) {
        for (const pattern of numberPatterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const num = match[1];
            if (num && parseInt(num) >= 10 && parseInt(num) <= 500) {
              allNumbersInResults.add(num);
            }
          }
        }
      }
    }

    // If multiple different numbers found in high-authority sources, flag conflict
    const conflictNumbers = Array.from(allNumbersInResults).filter(n => n !== answerNumber);
    if (conflictNumbers.length > 0) {
      console.log(`📊 [METRIC] NUMBER_CONFLICT: answerNumber="${answerNumber}", otherNumbers=[${conflictNumbers.join(', ')}]`);
      console.log(`⚠️ NUMBER VALIDATION: Multiple numbers found in sources - potential conflict`);
      return {
        valid: true, // Still valid, but with conflict warning
        answerNumber,
        conflictNumbers
      };
    }

    console.log(`✅ NUMBER VALIDATION PASS: Number ${answerNumber} found in quote`);
    return { valid: true, answerNumber };
  }

  /**
   * 🔢 ADD CONFLICT WARNING TO RESPONSE
   * When multiple tebliğ/madde numbers exist in sources, adds a disclaimer
   */
  private addNumberConflictWarning(
    responseText: string,
    answerNumber: string,
    conflictNumbers: string[],
    language: string = 'tr'
  ): string {
    const warningTr = `\n\n> ⚠️ _Not: Kaynaklarda ${answerNumber} numaralı tebliğin yanı sıra ${conflictNumbers.join(', ')} numaralı tebliğlere de atıf bulunmaktadır. Farklı dönemlerde farklı düzenlemeler geçerli olabilir._`;
    const warningEn = `\n\n> ⚠️ _Note: In addition to regulation ${answerNumber}, sources also reference regulations ${conflictNumbers.join(', ')}. Different regulations may apply in different periods._`;

    const warning = language === 'tr' ? warningTr : warningEn;

    // Insert warning after ALINTI section
    const alintiEndPattern = /(\*\*ALINTI\*\*[\s\S]*?)(\*\*KAYNAKLAR\*\*|\*\*SOURCES\*\*|$)/i;
    if (alintiEndPattern.test(responseText)) {
      return responseText.replace(alintiEndPattern, `$1${warning}\n\n$2`);
    }

    // Fallback: insert before KAYNAKLAR
    const sourcesPattern = /(\*\*KAYNAKLAR\*\*|\*\*SOURCES\*\*)/i;
    if (sourcesPattern.test(responseText)) {
      return responseText.replace(sourcesPattern, `${warning}\n\n$1`);
    }

    return responseText + warning;
  }

  /**
   * 🔝 AUTHORITY-BASED QUOTE UPGRADE (Eksik-2 Fix)
   * When LLM selects a quote from low-authority source (QnA/makale),
   * checks if a higher-authority source has a matching topic+keyterm quote.
   * If found, upgrades the quote to the higher-authority source.
   *
   * Authority levels are loaded from schema config (llmConfig.authorityLevels)
   * Each domain defines its own authority hierarchy
   */
  private tryUpgradeQuoteToHigherAuthority(
    responseText: string,
    searchResults: any[],
    topicEntities: string[],
    language: string = 'tr',
    configAuthorityLevels?: Record<string, number>,
    configKeyTerms?: string[]
  ): { upgraded: boolean; newResponse?: string; oldSource?: string; newSource?: string } {
    // Extract current ALINTI section
    const alintıMatch = responseText.match(/\*\*ALINTI\*\*([\s\S]*?)(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/i);
    if (!alintıMatch) {
      return { upgraded: false };
    }

    const currentAlinti = alintıMatch[0];
    const currentAlintiLower = currentAlinti.toLowerCase();

    // Detect source type from the current quote attribution line
    // Pattern: "— Tür: SoruCevap" or "— csv_sorucevap" etc.
    const sourceAttributionMatch = currentAlinti.match(/—\s*(?:Tür:\s*)?([^\[（\n]+)/i);
    const currentSourceHint = (sourceAttributionMatch?.[1] || '').toLowerCase().trim();

    // Get authority level from config or use empty (no hardcoded defaults)
    const getAuthorityLevel = (sourceType: string): number => {
      const s = sourceType.toLowerCase();
      // Check config authority levels first
      if (configAuthorityLevels && Object.keys(configAuthorityLevels).length > 0) {
        for (const [pattern, level] of Object.entries(configAuthorityLevels)) {
          if (s.includes(pattern.toLowerCase())) {
            return level;
          }
        }
        return 35; // default unknown when config exists but no match
      }
      // No config - return low authority for all (no assumptions about domain)
      return 35;
    };

    // Determine current source's authority
    let currentAuthority = 35;
    for (const result of searchResults) {
      const content = (result.content || result.text || '').toLowerCase();
      // Check if this result's content appears in the current quote
      if (currentAlintiLower.includes(content.substring(0, 100))) {
        const sourceType = (result.source_type || result.source_table || '').toLowerCase();
        currentAuthority = getAuthorityLevel(sourceType);
        break;
      }
    }

    // Also check hint from attribution line
    if (currentSourceHint) {
      const hintAuthority = getAuthorityLevel(currentSourceHint);
      currentAuthority = Math.max(currentAuthority, hintAuthority);
    }

    // If already high authority (>= 70), no need to upgrade
    if (currentAuthority >= 70) {
      console.log(`🔝 AUTHORITY CHECK: Current quote from high-authority source (level ${currentAuthority}), no upgrade needed`);
      return { upgraded: false };
    }

    console.log(`🔝 AUTHORITY CHECK: Current quote from authority level ${currentAuthority}, searching for higher...`);

    // Extract key terms from current ALINTI for matching
    // Use config key terms - NO HARDCODED DEFAULTS
    const keyTerms = configKeyTerms || [];
    const matchedKeyTerms = keyTerms.filter(term => currentAlintiLower.includes(term.toLowerCase()));
    const primaryEntities = topicEntities.slice(0, 3);

    // Search for better quote in higher-authority sources
    for (const result of searchResults) {
      const sourceType = (result.source_type || result.source_table || '').toLowerCase();
      const resultAuthority = getAuthorityLevel(sourceType);

      // Skip if not higher authority
      if (resultAuthority <= currentAuthority) continue;

      const content = (result.content || result.text || '').toLowerCase();

      // Check if this source contains topic entities
      const hasTopicEntity = primaryEntities.some(entity =>
        content.includes(entity.toLowerCase())
      );
      if (!hasTopicEntity) continue;

      // Find a sentence with topic + keyterm
      const sentences = content.split(/[.!?。]\s*/);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length < 30 || trimmed.length > 400) continue;

        const hasTopic = primaryEntities.some(e => trimmed.includes(e.toLowerCase()));
        const hasKeyTerm = matchedKeyTerms.length === 0 ||
          matchedKeyTerms.some(term => trimmed.includes(term));

        if (hasTopic && hasKeyTerm) {
          // Found a better quote!
          const newSourceTitle = result.title || result.source_table || sourceType;

          // Build new ALINTI section
          const newAlinti = language === 'tr'
            ? `**ALINTI**\n> "${trimmed}"\n— _${newSourceTitle}_`
            : `**QUOTE**\n> "${trimmed}"\n— _${newSourceTitle}_`;

          // Replace in response
          const newResponse = responseText.replace(
            /\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/i,
            newAlinti + '\n\n'
          );

          console.log(`📊 [METRIC] QUOTE_AUTHORITY_UPGRADE: from=${currentAuthority}, to=${resultAuthority}, newSource="${newSourceTitle.substring(0, 30)}..."`);
          console.log(`🔝 AUTHORITY UPGRADE: Replaced QnA quote with ${sourceType} quote (authority ${currentAuthority} → ${resultAuthority})`);

          return {
            upgraded: true,
            newResponse,
            oldSource: currentSourceHint || 'unknown',
            newSource: newSourceTitle
          };
        }
      }
    }

    console.log(`🔝 AUTHORITY CHECK: No higher-authority quote found with matching topic+keyterm`);
    return { upgraded: false };
  }

  /**
   * 🔄 FALLBACK QUOTE FINDER (Strengthened)
   * When ALINTI hard fail occurs, attempts to find a relevant quote by:
   * 1. Extracting key sentences from CEVAP (answer) section
   * 2. Using topic entities to search within existing results
   * 3. REQUIRES BOTH: topic entity match + key term match (to prevent false positives)
   * 4. Returns a replacement quote if found, null otherwise
   */
  private tryFindFallbackQuote(
    responseText: string,
    searchResults: any[],
    topicEntities: string[],
    language: string = 'tr',
    configKeyTerms?: string[]
  ): { found: boolean; quote?: string; source?: string } {
    // Extract the CEVAP/ANSWER section
    const answerMatch = language === 'tr'
      ? responseText.match(/\*\*CEVAP\*\*([\s\S]*?)(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/i)
      : responseText.match(/\*\*ANSWER\*\*([\s\S]*?)(?=\*\*[A-Z]|\n\n\n|$)/i);

    if (!answerMatch) {
      console.log(`🔄 FALLBACK: No CEVAP section found to extract keywords`);
      return { found: false };
    }

    const answerText = answerMatch[1].toLowerCase();

    // 🔒 KEY TERMS: Intent/action words that must also appear in fallback quote
    // These ensure the quote is about the same "what" not just the same "topic"
    // Use config key terms - NO HARDCODED DEFAULTS
    const keyTerms = configKeyTerms || [];

    // Find which key terms appear in the answer
    const answerKeyTerms = keyTerms.filter(term => answerText.includes(term));
    console.log(`🔄 FALLBACK: Searching for quote in ${searchResults.length} results`);
    console.log(`   Topic entities: [${topicEntities.slice(0, 3).join(', ')}]`);
    console.log(`   Key terms from answer: [${answerKeyTerms.join(', ')}]`);

    // Track rejection reasons for metrics
    let resultsWithoutTopic = 0;
    let sentencesWithoutTopic = 0;
    let sentencesWithoutKeyTerm = 0;

    // Look through search results for text containing topic entities + key terms
    const primaryEntities = topicEntities.slice(0, 3); // First 3 are likely primary entities

    for (const result of searchResults) {
      const content = (result.content || result.text || '').toLowerCase();

      // Check if this result contains any topic entity (primary entity, not all synonyms)
      const containsTopicEntity = primaryEntities.some(entity =>
        content.includes(entity.toLowerCase())
      );

      if (!containsTopicEntity) {
        resultsWithoutTopic++;
        continue;
      }

      // Find a sentence containing BOTH topic entity AND key term
      const sentences = content.split(/[.!?。]\s*/);
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        // Skip very short or very long sentences
        if (trimmedSentence.length < 30 || trimmedSentence.length > 400) continue;

        // Check if sentence contains topic entity
        const hasTopic = primaryEntities.some(entity =>
          trimmedSentence.includes(entity.toLowerCase())
        );

        if (!hasTopic) {
          sentencesWithoutTopic++;
          continue;
        }

        // 🔒 STRENGTHENED: Also require at least one key term match
        const hasKeyTerm = answerKeyTerms.length === 0 || // If no key terms in answer, skip this check
          answerKeyTerms.some(term => trimmedSentence.includes(term));

        if (!hasKeyTerm) {
          sentencesWithoutKeyTerm++;
          continue;
        }

        // Found a relevant sentence - use it as the fallback quote
        const sourceTitle = result.title || result.source_table || 'Kaynak';
        console.log(`✅ FALLBACK SUCCESS: Found quote with topic+keyterm match in "${sourceTitle}"`);
        return {
          found: true,
          quote: trimmedSentence,
          source: sourceTitle
        };
      }
    }

    // 📊 METRIC: AC-B - Detailed rejection breakdown
    console.log(`📊 [METRIC] FALLBACK_REJECTION_DETAILS: resultsWithoutTopic=${resultsWithoutTopic}/${searchResults.length}, sentencesWithoutTopic=${sentencesWithoutTopic}, sentencesWithoutKeyTerm=${sentencesWithoutKeyTerm}`);
    console.log(`❌ FALLBACK: No relevant quote found (requires both topic entity + key term)`);
    return { found: false };
  }

  /**
   * 🔄 REPLACE NO-QUOTE MESSAGE WITH FALLBACK
   * Replaces the "no quote found" message with an actual quote from fallback search
   */
  private replaceWithFallbackQuote(
    responseText: string,
    fallbackQuote: string,
    sourceTitle: string,
    language: string = 'tr'
  ): string {
    // Create the new quote section
    const newQuoteSection = language === 'tr'
      ? `**ALINTI**\n> "${fallbackQuote}"\n— _${sourceTitle}_`
      : `**QUOTE**\n> "${fallbackQuote}"\n— _${sourceTitle}_`;

    // Pattern to match the "no quote found" placeholder
    const noQuotePlaceholder = language === 'tr'
      ? /\*\*ALINTI\*\*\n_Mevcut veritabanında[^*]*?Kaynaklar aşağıda listelenmiştir\._/gi
      : /\*\*QUOTE\*\*\n_No direct quote[^*]*?Sources are listed below\._/gi;

    // Replace placeholder with actual quote
    return responseText.replace(noQuotePlaceholder, newQuoteSection);
  }

  /**
   * 🎯 QUOTE SELECTION GUARDRAIL (Enhanced)
   * Validates that ALINTI section contains:
   * 1. Key terms from question (ceza, usulsüzlük, etc.)
   * 2. Topic entities from question (vergi levhası, fason, KDV, etc.)
   *
   * This prevents both:
   * - "wrong quote from right document" problem
   * - "generic term match without topic relevance" problem
   */
  private validateQuoteRelevance(
    question: string,
    responseText: string,
    searchResults: any[],
    language: string = 'tr',
    configEntities?: TopicEntity[],
    configTerms?: string[]
  ): { valid: boolean; reason?: string; fixedResponse?: string; topicMissing?: boolean } {
    // Extract ALINTI section from response
    const alintıMatch = responseText.match(/\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/i);
    const quoteMatch = responseText.match(/\*\*QUOTE\*\*[\s\S]*?(?=\*\*[A-Z]|\n\n\n|$)/i);
    const alintıText = (alintıMatch?.[0] || quoteMatch?.[0] || '').toLowerCase();

    // If no ALINTI section, nothing to validate
    if (!alintıText || alintıText.length < 20) {
      return { valid: true };
    }

    // Extract key terms AND topic entities from question (using config if provided)
    const questionLower = question.toLowerCase();
    const keyTerms = this.extractKeyTerms(questionLower, configTerms);
    const topicEntities = this.extractTopicEntities(questionLower, configEntities);

    console.log(`🎯 QUOTE GUARDRAIL CHECK:`);
    console.log(`   Key terms: [${keyTerms.join(', ')}]`);
    console.log(`   Topic entities: [${topicEntities.join(', ')}]`);

    // Check if ALINTI contains key terms
    const foundKeyTerms = keyTerms.filter(term => alintıText.includes(term));

    // Check if ALINTI contains topic entities
    const foundTopicEntities = topicEntities.filter(entity => {
      // For compound entities like "vergi levhası", check both together and separately
      if (entity.includes(' ')) {
        const parts = entity.split(' ');
        return alintıText.includes(entity) || parts.some(p => alintıText.includes(p));
      }
      return alintıText.includes(entity);
    });

    // PASS if: at least one topic entity found AND (key term found OR no key terms required)
    if (foundTopicEntities.length > 0 && (foundKeyTerms.length > 0 || keyTerms.length === 0)) {
      console.log(`✅ QUOTE GUARDRAIL PASS: Found topic entities [${foundTopicEntities.join(', ')}] and key terms [${foundKeyTerms.join(', ')}]`);
      return { valid: true };
    }

    // WARN if: key terms found but NO topic entity (e.g., "usulsüzlük" found but not "vergi levhası")
    if (foundKeyTerms.length > 0 && foundTopicEntities.length === 0 && topicEntities.length > 0) {
      console.log(`⚠️ QUOTE GUARDRAIL TOPIC MISMATCH: Found key terms [${foundKeyTerms.join(', ')}] but MISSING topic entities [${topicEntities.join(', ')}]`);
      console.log(`   This may indicate quote is from wrong context (e.g., generic "usulsüzlük" not about "vergi levhası")`);
      return {
        valid: false,
        reason: `ALINTI contains generic term [${foundKeyTerms.join(', ')}] but missing topic entity [${topicEntities.join(', ')}]`,
        topicMissing: true
      };
    }

    // WARN if: no key terms found at all
    if (foundKeyTerms.length === 0 && keyTerms.length > 0) {
      console.log(`⚠️ QUOTE GUARDRAIL WARNING: ALINTI doesn't contain key terms: [${keyTerms.join(', ')}]`);
    }

    // Check if any source has a sentence containing the key terms + topic entities
    const betterQuote = this.findBetterQuote(searchResults, [...keyTerms, ...topicEntities]);

    if (betterQuote) {
      console.log(`🔧 QUOTE GUARDRAIL: Found better quote containing key terms`);
      // Return suggestion to use better quote (but don't modify response here)
      return {
        valid: false,
        reason: `ALINTI doesn't contain key terms [${keyTerms.join(', ')}]. Better quote found in sources.`,
        // We could fix response here but for now just log warning
      };
    }

    // No better quote found - the evidence doesn't support the claim
    console.log(`❌ QUOTE GUARDRAIL FAIL: No evidence found containing key terms [${keyTerms.join(', ')}]`);
    return {
      valid: false,
      reason: `No evidence found containing key terms [${keyTerms.join(', ')}]`
    };
  }

  /**
   * 🎯 ANSWER-EVIDENCE CONSISTENCY CHECK
   * Validates that claims in the answer (CEVAP section) are supported by the ALINTI
   * Specifically checks for penalty/requirement claims
   */
  private validateAnswerEvidenceConsistency(
    responseText: string,
    language: string = 'tr'
  ): { consistent: boolean; issue?: string } {
    // Extract CEVAP/ANSWER section
    const cevapMatch = responseText.match(/\*\*CEVAP\*\*\s*([\s\S]*?)(?=\*\*ALINTI|\*\*QUOTE|$)/i);
    const answerMatch = responseText.match(/\*\*ANSWER\*\*\s*([\s\S]*?)(?=\*\*QUOTE|$)/i);
    const answerText = (cevapMatch?.[1] || answerMatch?.[1] || '').toLowerCase();

    // Extract ALINTI section
    const alintıMatch = responseText.match(/\*\*ALINTI\*\*\s*([\s\S]*?)(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/i);
    const quoteMatch = responseText.match(/\*\*QUOTE\*\*\s*([\s\S]*?)(?=\*\*[A-Z]|\n\n\n|$)/i);
    const alintıText = (alintıMatch?.[1] || quoteMatch?.[1] || '').toLowerCase();

    if (!answerText || !alintıText) {
      return { consistent: true };
    }

    // Define claim-evidence pairs that must match
    // If answer contains claim, evidence must contain supporting term
    const claimEvidencePairs = [
      // Penalty claims
      {
        answerPatterns: ['ceza uygulanır', 'ceza kesilir', 'ceza öngörülmüştür', 'cezaya tabi', 'usulsüzlük cezası var'],
        evidenceTerms: ['ceza', 'usulsüzlük', 'müeyyide', 'yaptırım'],
        claimType: 'penalty_applies'
      },
      {
        answerPatterns: ['ceza uygulanmaz', 'ceza kesilmez', 'ceza yok', 'cezai sorumluluk yok'],
        evidenceTerms: ['ceza', 'usulsüzlük', 'müeyyide', 'yaptırım', 'kaldırılmış', 'ortadan kalkmış'],
        claimType: 'penalty_not_applies'
      },
      // Requirement claims
      {
        answerPatterns: ['zorunludur', 'mecburidir', 'gereklidir', 'şarttır', 'asılmalıdır', 'yapılmalıdır'],
        evidenceTerms: ['zorunlu', 'mecburi', 'gerekli', 'şart', 'yapılmalı', 'mükellef'],
        claimType: 'requirement'
      },
      {
        answerPatterns: ['zorunlu değildir', 'mecburi değildir', 'gerekli değildir', 'kaldırılmıştır', 'asılmasına gerek yok'],
        evidenceTerms: ['zorunlu değil', 'kaldırılmış', 'ortadan kalkmış', 'gerekmemekte', 'yükümlülük yok'],
        claimType: 'no_requirement'
      }
    ];

    for (const pair of claimEvidencePairs) {
      // Check if answer contains this type of claim
      const hasClaim = pair.answerPatterns.some(pattern => answerText.includes(pattern));

      if (hasClaim) {
        // Check if evidence supports this claim
        const hasEvidence = pair.evidenceTerms.some(term => alintıText.includes(term));

        if (!hasEvidence) {
          console.log(`⚠️ ANSWER-EVIDENCE INCONSISTENCY: Claim type "${pair.claimType}" not supported by ALINTI`);
          return {
            consistent: false,
            issue: `Answer makes "${pair.claimType}" claim but ALINTI doesn't contain supporting evidence [${pair.evidenceTerms.join('/')}]`
          };
        } else {
          console.log(`✅ ANSWER-EVIDENCE CONSISTENT: Claim "${pair.claimType}" supported by evidence`);
        }
      }
    }

    return { consistent: true };
  }

  /**
   * 🧹 QUERY SANITIZATION
   * Cleans the user query before sending to retriever
   * Removes numbering, meta-instructions, and formatting directives
   * This prevents "query pollution" that causes false refusals
   */
  private sanitizeSearchQuery(query: string): { sanitized: string; originalLength: number; modifications: string[] } {
    const modifications: string[] = [];
    let sanitized = query;
    const originalLength = query.length;

    // 1. Remove leading numbering patterns like "6)", "12.", "a)", "A."
    const numberingMatch = sanitized.match(/^\s*(\d+[\.\)]\s*|\(?[a-zA-Z][\.\)]\s*)/);
    if (numberingMatch) {
      sanitized = sanitized.replace(/^\s*(\d+[\.\)]\s*|\(?[a-zA-Z][\.\)]\s*)/, '');
      modifications.push(`removed_numbering: "${numberingMatch[0].trim()}"`);
    }

    // 2. Remove parenthetical meta-instructions like "(CEVAP+ALINTI formatında yanıtla)"
    // Common patterns: (CEVAP...), (format...), (yanıtla...), (lütfen...), (sadece...)
    const metaPatterns = [
      /\s*\((?:CEVAP|cevap|ALINTI|alıntı|format|FORMAT|yanıtla|lütfen|sadece|only|please)[^)]*\)\s*/gi,
      /\s*\[(?:CEVAP|cevap|ALINTI|alıntı|format|FORMAT)[^\]]*\]\s*/gi,
    ];

    for (const pattern of metaPatterns) {
      const match = sanitized.match(pattern);
      if (match) {
        sanitized = sanitized.replace(pattern, ' ');
        modifications.push(`removed_meta: "${match[0].trim()}"`);
      }
    }

    // 3. Remove trailing format instructions after question mark
    // e.g., "...ceza var mı? Kısa cevap ver." → "...ceza var mı?"
    const questionMarkIndex = sanitized.lastIndexOf('?');
    if (questionMarkIndex > 0 && questionMarkIndex < sanitized.length - 1) {
      const afterQuestion = sanitized.substring(questionMarkIndex + 1).trim();
      // Check if what follows looks like a format instruction (not a follow-up question)
      const formatInstructionPatterns = [
        /^(kısa|uzun|detaylı|öz|sadece|format|cevap|yanıt|açıkla)/i,
        /^(short|long|detailed|brief|only|format|answer|explain)/i
      ];
      const isFormatInstruction = formatInstructionPatterns.some(p => p.test(afterQuestion));
      if (isFormatInstruction && !afterQuestion.includes('?')) {
        sanitized = sanitized.substring(0, questionMarkIndex + 1);
        modifications.push(`removed_trailing: "${afterQuestion}"`);
      }
    }

    // 4. Clean up multiple spaces and trim
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Log if modifications were made
    if (modifications.length > 0) {
      console.log(`🧹 QUERY SANITIZED: "${query.substring(0, 50)}..." → "${sanitized.substring(0, 50)}..."`);
      console.log(`   Modifications: ${modifications.join(', ')}`);
    }

    return { sanitized, originalLength, modifications };
  }

  /**
   * 🎯 EXTRACT TOPIC ENTITIES
   * Extracts the main topic/entity from the question for quote relevance validation
   * e.g., "vergi levhası asılmazsa ceza var mı?" → ["vergi levhası", "levha"]
   * @param question - The user's question
   * @param configEntities - Optional custom entities from DB config (falls back to defaults)
   */
  private extractTopicEntities(question: string, configEntities?: TopicEntity[]): string[] {
    const entities: string[] = [];
    const questionLower = question.toLowerCase();

    // Use config entities if provided, otherwise use defaults
    const topicEntities = configEntities || this.getDefaultTopicEntities();

    for (const { pattern, entity, synonyms } of topicEntities) {
      // Convert string pattern to RegExp if needed
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;

      // Reset regex lastIndex (important for global patterns)
      regex.lastIndex = 0;
      if (regex.test(questionLower)) {
        // Add primary entity
        if (!entities.includes(entity)) {
          entities.push(entity);
        }
        // Add all synonyms for broader matching
        for (const synonym of synonyms) {
          if (!entities.includes(synonym)) {
            entities.push(synonym);
          }
        }
      }
    }

    return entities;
  }

  /**
   * Extract key terms from question for quote validation
   * Focuses on domain-specific terms and identifiers
   * @param question - The user's question
   * @param configTerms - Optional custom key terms from DB config (falls back to defaults)
   */
  private extractKeyTerms(question: string, configTerms?: string[]): string[] {
    const terms: string[] = [];

    // Use config terms if provided, otherwise use defaults
    const legalTerms = configTerms || this.getDefaultKeyTerms();

    // Check for legal terms
    legalTerms.forEach(term => {
      if (question.includes(term)) {
        terms.push(term);
      }
    });

    // Extract numbers (like 107, 2024, etc.) - important for tebliğ references
    const numberMatches = question.match(/\b\d{2,4}\b/g);
    if (numberMatches) {
      numberMatches.forEach(num => {
        // Only include meaningful numbers (not years before 1990 or generic small numbers)
        const numVal = parseInt(num);
        if (numVal >= 10 && (numVal <= 500 || (numVal >= 1990 && numVal <= 2030))) {
          terms.push(num);
        }
      });
    }

    // Extract specific keywords from question patterns
    // "X var mı?" -> look for X in evidence
    const varMiMatch = question.match(/(\w+)\s+(var|yok|uygulanır|uygulanmaz)\s*(mı|mi|mu|mü)?/i);
    if (varMiMatch && varMiMatch[1].length > 3) {
      terms.push(varMiMatch[1].toLowerCase());
    }

    // Deduplicate
    return [...new Set(terms)];
  }

  /**
   * Find a better quote from search results that contains key terms
   */
  private findBetterQuote(searchResults: any[], keyTerms: string[]): string | null {
    for (const result of searchResults) {
      const content = (result.content || result.excerpt || '').toLowerCase();

      // Split content into sentences
      const sentences = content.split(/[.!?]\s+/);

      for (const sentence of sentences) {
        // Check if sentence contains any key term
        const hasKeyTerm = keyTerms.some(term => sentence.includes(term));
        if (hasKeyTerm && sentence.length > 30 && sentence.length < 500) {
          // Found a sentence with key term
          return sentence.trim();
        }
      }
    }

    return null;
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
   * Fast regex-based Turkish word spacing fix for OCR/PDF text
   * Adds spaces at common Turkish word boundaries without LLM
   */
  private fixTurkishWordSpacing(text: string): string {
    if (!text || text.length < 20) return text;

    // Check if text needs fixing (low space ratio + long uppercase sequences)
    const spaceRatio = (text.match(/\s/g) || []).length / text.length;
    const hasLongUppercase = /[A-ZÇĞİÖŞÜ]{20,}/.test(text);
    if (spaceRatio > 0.1 && !hasLongUppercase) return text;

    let result = text;

    // 1. Add space before common Turkish words/particles (case insensitive matching, preserve case)
    const particles = [
      'VE', 'VEYA', 'İLE', 'İÇİN', 'OLAN', 'OLARAK', 'OLMAK', 'KADAR',
      'DAHA', 'ANCAK', 'AMA', 'FAKAT', 'ÇÜNKÜ', 'EĞER', 'GİBİ', 'GÖRE',
      'HAKKINDA', 'KARŞI', 'SONRA', 'ÖNCE', 'SIRASINDA', 'DOLAYI',
      'DAHİL', 'HARİÇ', 'AYRICA', 'BU', 'ŞU', 'O', 'HER', 'BİR',
      'KANUN', 'KANUNU', 'MADDE', 'MADDESİ', 'SAYILI', 'TARİHLİ',
      'GELİR', 'VERGİ', 'VERGİSİ', 'ÖDEME', 'ÖDEMESİ', 'BEYAN', 'BEYANI'
    ];

    // Add space before particles when preceded by letters
    for (const p of particles) {
      // Match lowercase/uppercase letter followed by particle
      const regex = new RegExp(`([a-zçğıöşüA-ZÇĞİÖŞÜ])(?=${p}[^a-zçğıöşü])`, 'g');
      result = result.replace(regex, '$1 ');
    }

    // 2. Add space between number and uppercase word
    result = result.replace(/(\d)([A-ZÇĞİÖŞÜ]{2,})/g, '$1 $2');

    // 3. Add space between lowercase ending and uppercase start (camelCase fix)
    // e.g., "metinVERGİ" -> "metin VERGİ"
    result = result.replace(/([a-zçğıöşü]{2,})([A-ZÇĞİÖŞÜ]{2,})/g, '$1 $2');

    // 4. Add space before common suffixed words
    // e.g., "KONSOLOSLUKLARDAçalışan" -> "KONSOLOSLUKLARDA çalışan"
    result = result.replace(/([A-ZÇĞİÖŞÜ]{3,}(?:DA|DE|DAN|DEN|TA|TE|NDA|NDE))([a-zçğıöşü])/g, '$1 $2');

    // 5. Fix common Turkish suffix patterns (uppercase context)
    // Add space after common word endings before new uppercase word
    const suffixPatterns = [
      /([İI]N)([A-ZÇĞİÖŞÜ]{3,})/g,      // -İN, -IN before uppercase
      /([Sİ]İ)([A-ZÇĞİÖŞÜ]{3,})/g,       // -Sİ before uppercase
      /(LARI|LERİ)([A-ZÇĞİÖŞÜ]{3,})/g,   // -LARI, -LERİ before uppercase
      /(MASI|MESİ)([A-ZÇĞİÖŞÜ]{3,})/g,   // -MASI, -MESİ before uppercase
      /(ININ|İNİN|UNUN|ÜNÜN)([A-ZÇĞİÖŞÜ]{2,})/g, // Genitive before uppercase
    ];

    for (const pattern of suffixPatterns) {
      result = result.replace(pattern, '$1 $2');
    }

    // 6. Clean up multiple spaces
    result = result.replace(/\s{2,}/g, ' ').trim();

    return result;
  }

  /**
   * Detect if text has OCR-style concatenated words (missing word spaces)
   * Examples: "İŞEİADEBAŞVURUSU" should be "İŞE İADE BAŞVURUSU"
   */
  private detectConcatenatedText(text: string): boolean {
    if (!text || text.length < 30) return false;

    // Count spaces vs total length
    const spaceCount = (text.match(/\s/g) || []).length;
    const spaceRatio = spaceCount / text.length;

    // Normal Turkish text has ~15-20% spaces, OCR-broken text has <5%
    if (spaceRatio > 0.08) return false;

    // Look for long sequences of uppercase Turkish letters without spaces (25+ chars)
    const longUppercasePattern = /[A-ZÇĞİÖŞÜ]{25,}/;
    if (longUppercasePattern.test(text)) return true;

    // Look for mixed case concatenation patterns (lowercase followed by uppercase)
    // Normal: "kelime Kelime" | OCR-broken: "kelimeKelime"
    const concatenatedPattern = /[a-zçğıöşü][A-ZÇĞİÖŞÜ][a-zçğıöşü]/;
    const concatenatedCount = (text.match(new RegExp(concatenatedPattern, 'g')) || []).length;
    if (concatenatedCount > 5) return true;

    return false;
  }

  /**
   * Normalize OCR text with LLM - adds proper word breaks to concatenated text
   * Only called when detectConcatenatedText returns true
   */
  private async normalizeOCRTextWithLLM(text: string): Promise<string> {
    try {
      // Skip if text is too short or already looks normal
      if (!text || text.length < 30 || !this.detectConcatenatedText(text)) {
        return text;
      }

      console.log(`🔧 [OCR] Normalizing concatenated text (${text.length} chars)...`);

      // Take first 500 chars for normalization (LLM context limit)
      const textToNormalize = text.substring(0, 500);

      const prompt = `Sen bir OCR hata düzeltme uzmanısın. Aşağıdaki metin PDF/OCR taramasından geldi ve kelimeler arasında boşluklar eksik.

GÖREV: Kelimeleri ayır ve doğru boşlukları ekle. Türkçe dil bilgisi kurallarına göre kelimeleri tanı.

ÖNEMLİ KURALLAR:
- SADECE boşluk ekle, kelime değiştirme
- Orijinal harfleri AYNEN koru (büyük/küçük harf dahil)
- Noktalama işaretlerini koru
- Sayıları ve tarihleri koru

ÖRNEK:
GİRDİ: "İŞEİADEBAŞVURUSUSAMİMİOLMAYANİŞÇİ"
ÇIKTI: "İŞE İADE BAŞVURUSU SAMİMİ OLMAYAN İŞÇİ"

GİRDİ: "VERGİKANUNUNUN193SAYILI"
ÇIKTI: "VERGİ KANUNUNUN 193 SAYILI"

ŞİMDİ BU METNİ DÜZELt:
${textToNormalize}

DÜZELTILMIŞ METİN:`;

      const response = await this.llmManager.generateChatResponse(prompt, {
        temperature: 0.1, // Low temperature for accuracy
        maxTokens: 600,
        systemPrompt: ''
      });

      if (!response || !response.content) {
        console.warn('⚠️ [OCR] LLM returned empty response, using original');
        return text;
      }

      let normalizedText = response.content.trim();

      // Remove any preamble the LLM might add
      normalizedText = normalizedText
        .replace(/^(DÜZELTİLMİŞ METİN:|ÇIKTI:|İşte düzeltilmiş metin:)/i, '')
        .trim();

      // If normalized text is similar length (±20%) to original, use it
      // Otherwise, something went wrong
      const lengthRatio = normalizedText.length / textToNormalize.length;
      if (lengthRatio < 0.8 || lengthRatio > 1.3) {
        console.warn(`⚠️ [OCR] Normalized text length mismatch (ratio: ${lengthRatio.toFixed(2)}), using original`);
        return text;
      }

      // If original text was longer than 500 chars, append the rest
      if (text.length > 500) {
        normalizedText += text.substring(500);
      }

      console.log(`✅ [OCR] Normalized successfully: "${normalizedText.substring(0, 50)}..."`);
      return normalizedText;

    } catch (error) {
      console.error('❌ [OCR] Normalization failed:', error);
      return text; // Return original on error
    }
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
   * Post-process strict mode responses to ensure quality output
   * Fixes: empty [], generic titles, quote prefixes
   * Configuration loaded from database for all patterns
   */
  private fixEmptySourceReferences(text: string, searchResults: any[], settingsMap?: Map<string, string>, originalQuestion?: string): string {
    if (!text || !searchResults.length) return text;

    let fixedText = text;
    let fixCount = 0;

    // Load configurations from database
    let preferredSourceTypes = ['sorucevap', 'csv_sorucevap', 'soru-cevap', 'q&a', 'ozelge', 'csv_ozelge'];
    let quotePrefixPatterns = ['Cevap:', 'Soru:', 'Yanıt:', 'Answer:', 'Question:', 'Response:'];
    let genericTitlePatterns = ['Soru-Cevap', 'SoruCevap', 'csv_sorucevap', 'Q&A', 'Soru-cevap'];
    let htmlCleaningPatterns = [
      { pattern: '<br\\s*/?>', replacement: ' ' },
      { pattern: '</?(p|div|span|strong|em|b|i)>', replacement: '' },
      { pattern: '&nbsp;', replacement: ' ' },
      { pattern: '&amp;', replacement: '&' },
      { pattern: '&lt;', replacement: '<' },
      { pattern: '&gt;', replacement: '>' },
      { pattern: '&quot;', replacement: '"' }
    ];
    let sourceTypeNormalizations: Record<string, string> = {
      csv_sorucevap: 'SoruCevap',
      sorucevap: 'SoruCevap',
      csv_ozelge: 'Özelge',
      csv_danistaykararlari: 'Danıştay Kararı',
      csv_makale: 'Makale',
      csv_makale_arsiv_2021: 'Makale',
      csv_makale_arsiv_2022: 'Makale',
      document_embeddings: 'Döküman',
      crawler: 'Web Kaynağı'
    };

    if (settingsMap) {
      // Load preferred source types
      const preferredRaw = settingsMap.get('ragSettings.preferredSourceTypes');
      if (preferredRaw) {
        try { preferredSourceTypes = JSON.parse(preferredRaw); } catch (e) { /* use default */ }
      }

      // Load quote prefix patterns
      const quotePrefixRaw = settingsMap.get('ragSettings.quotePrefixPatterns');
      if (quotePrefixRaw) {
        try { quotePrefixPatterns = JSON.parse(quotePrefixRaw); } catch (e) { /* use default */ }
      }

      // Load generic title patterns
      const genericTitlesRaw = settingsMap.get('ragSettings.genericTitlePatterns');
      if (genericTitlesRaw) {
        try { genericTitlePatterns = JSON.parse(genericTitlesRaw); } catch (e) { /* use default */ }
      }

      // Load HTML cleaning patterns
      const htmlPatternsRaw = settingsMap.get('ragSettings.htmlCleaningPatterns');
      if (htmlPatternsRaw) {
        try { htmlCleaningPatterns = JSON.parse(htmlPatternsRaw); } catch (e) { /* use default */ }
      }

      // Load source type normalizations
      const typeNormRaw = settingsMap.get('ragSettings.sourceTypeNormalizations');
      if (typeNormRaw) {
        try { sourceTypeNormalizations = JSON.parse(typeNormRaw); } catch (e) { /* use default */ }
      }
    }

    // 1. Find the best source - prioritize based on configured preferred types
    let bestSourceIdx = 0;
    for (let i = 0; i < searchResults.length; i++) {
      const sourceType = (searchResults[i].source_type || searchResults[i].source_table || '').toLowerCase();
      const isPreferred = preferredSourceTypes.some(pt => sourceType.includes(pt.toLowerCase()));
      if (isPreferred) {
        bestSourceIdx = i;
        break;
      }
    }

    // 2. Fix empty [] references
    const emptyRefPattern = /\[\s*\]/g;
    const emptyCount = (text.match(emptyRefPattern) || []).length;
    if (emptyCount > 0) {
      const sourceRef = `[Kaynak ${bestSourceIdx + 1}]`;
      fixedText = fixedText.replace(emptyRefPattern, sourceRef);
      console.log(`🔧 POST-PROCESS: Fixed ${emptyCount} empty [] → ${sourceRef}`);
      fixCount++;
    }

    // 3. Fix generic titles - build pattern from configured generic titles
    const genericTitlesEscaped = genericTitlePatterns.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const genericTitlePattern = new RegExp(`Başlık:\\s*(?:${genericTitlesEscaped})\\s*(\\[(?:Kaynak|Source)\\s*(\\d+)\\])`, 'gi');

    let match;
    while ((match = genericTitlePattern.exec(fixedText)) !== null) {
      const fullMatch = match[0];
      const sourceRef = match[1]; // [Kaynak 3]
      const sourceNum = parseInt(match[2]) - 1; // 2 (0-indexed)

      const source = searchResults[sourceNum] || searchResults[bestSourceIdx];
      if (source && source.title) {
        // Clean the title - remove type prefixes
        const prefixPattern = new RegExp(`^(?:${genericTitlesEscaped})\\s*[-:]\\s*`, 'i');
        let actualTitle = source.title.replace(prefixPattern, '').trim();

        // Fallback to original if cleaning made it too short
        if (!actualTitle || actualTitle.length < 5) {
          actualTitle = source.title;
        }

        const replacement = `Başlık: ${actualTitle} ${sourceRef}`;
        fixedText = fixedText.replace(fullMatch, replacement);
        console.log(`🔧 POST-PROCESS: Fixed title → "${actualTitle.substring(0, 50)}..."`);
        fixCount++;
      }
    }

    // 4. Clean quote prefixes - using configured patterns
    for (const prefix of quotePrefixPatterns) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`"${escaped}\\s*`, 'gi');
      const beforeFix = fixedText;
      fixedText = fixedText.replace(pattern, '"');
      if (fixedText !== beforeFix) {
        console.log(`🔧 POST-PROCESS: Cleaned quote prefix`);
        fixCount++;
      }
    }

    // 5. Clean HTML tags from response - using configured patterns
    for (const { pattern, replacement } of htmlCleaningPatterns) {
      try {
        const regex = new RegExp(pattern, 'gi');
        const beforeFix = fixedText;
        fixedText = fixedText.replace(regex, replacement);
        if (fixedText !== beforeFix && !fixedText.includes('<br')) {
          console.log(`🔧 POST-PROCESS: Cleaned HTML tags`);
          fixCount++;
        }
      } catch (e) {
        console.warn(`Invalid HTML cleaning pattern: ${pattern}`);
      }
    }

    // 6. Clean "Tür:" field - normalize source type display using configured normalizations
    for (const [sourceType, displayName] of Object.entries(sourceTypeNormalizations)) {
      const escaped = sourceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`Tür:\\s*${escaped}`, 'gi');
      fixedText = fixedText.replace(pattern, `Tür: ${displayName}`);
    }

    // 7. Fix "Başlık: Soru-Cevap" without source reference (fallback fix)
    const genericTitleFallback = new RegExp(`Başlık:\\s*(?:${genericTitlesEscaped})(?!\\s*\\[)`, 'gi');
    if (genericTitleFallback.test(fixedText) && searchResults[bestSourceIdx]?.title) {
      const actualTitle = searchResults[bestSourceIdx].title;
      fixedText = fixedText.replace(genericTitleFallback, `Başlık: ${actualTitle}`);
      console.log(`🔧 POST-PROCESS: Fixed fallback generic title`);
      fixCount++;
    }

    // 8. CRITICAL: Detect forbidden quote patterns (question sentences, not verdicts)
    // If ALINTI contains these patterns, the quote is invalid - it's a question, not evidence
    const forbiddenQuotePatterns = [
      /sorulmaktadır/i,           // "is being asked" - question marker
      /hususu sorulmaktadır/i,    // "the matter is being asked"
      /mümkün olup olmadığı/i,    // "whether possible" - question pattern
      /olup olmadığı\s*(hk\.?|hakkında)/i,  // "whether or not... hk" - KONU line
      /\s+hk\.?"?\s*$/i,          // ends with "hk." - KONU title, NOT evidence!
      /^KONU:/im,                 // "SUBJECT:" header
      /^İLGİ:/im,                 // "REFERENCE:" header
      /Dilekçenizde.*sorulmaktadır/i,  // "In your petition... is being asked"
      /is being asked/i,          // English version
      /whether.*is possible.*asked/i,  // English pattern
    ];

    // Extract the ALINTI section to check for forbidden patterns
    const alintiForbiddenMatch = fixedText.match(/\*\*ALINTI\*\*\s*\n?"([^"]+)"/i);
    if (alintiForbiddenMatch) {
      const quotedText = alintiForbiddenMatch[1];
      const hasForbiddenPattern = forbiddenQuotePatterns.some(pattern => pattern.test(quotedText));

      if (hasForbiddenPattern) {
        console.log(`⚠️ POST-PROCESS: Detected forbidden quote pattern (question, not verdict)`);
        console.log(`   Quote was: "${quotedText.substring(0, 100)}..."`);

        // Replace the definitive answer with a cautious one
        // Find the CEVAP section and modify if it contains definitive claims
        const cevapMatch = fixedText.match(/\*\*CEVAP\*\*\s*\n?([^\n]+)/i);
        if (cevapMatch) {
          const originalCevap = cevapMatch[1];
          // If CEVAP contains definitive words like "mümkündür" but quote is just a question
          // Check for ANY definitive claim (positive OR negative) - ALL must be replaced if quote is forbidden
          if (/mümkündür|zorunludur|uygundur|gerekmektedir|zorunlu değildir|gerekmemektedir|gerekmez|zorunlu olmadığı|mümkün değildir|uygun değildir/i.test(originalCevap)) {
            // Extract source reference
            const sourceRef = originalCevap.match(/\[Kaynak\s*\d+\]/i)?.[0] || '[Kaynak 1]';
            // Determine what type of question was asked to give appropriate cautious response
            let cautionCevap;
            if (/zorunlu|mecbur|gerekli/i.test(originalQuestion || '')) {
              cautionCevap = `Mevcut kaynakta "zorunlu olup olmadığı" yönünde açık bir hüküm cümlesi bulunamadı. ${sourceRef}`;
            } else {
              cautionCevap = `Bu konuda ilgili özelge incelenebilir, ancak kesin hüküm cümlesi alıntılanamadı. ${sourceRef}`;
            }
            fixedText = fixedText.replace(originalCevap, cautionCevap);
            console.log(`🔧 POST-PROCESS: Replaced definitive claim with cautious statement`);
            fixCount++;
          }
        }

        // CRITICAL: Replace the forbidden ALINTI with a standard message
        // Never show KONU/İLGİ/hk./sorulmaktadır lines as if they were evidence
        const alintiSection = fixedText.match(/\*\*ALINTI\*\*\s*\n?"[^"]*"[^]*?(?=\n\n|\n\*\*|$)/i);
        if (alintiSection) {
          const sourceRef = alintiSection[0].match(/\[Kaynak\s*\d+\]/i)?.[0] || '[Kaynak 1]';
          const cleanAlintiText = `**ALINTI**
"Kesin hüküm cümlesi bulunamadı (kaynakta yalnızca konu başlığı/başvuru özeti var)." ${sourceRef}`;
          fixedText = fixedText.replace(alintiSection[0], cleanAlintiText);
          console.log(`🔧 POST-PROCESS: Replaced forbidden quote with standard no-evidence message`);
          fixCount++;
        }
      }
    }

    // 9. SEMANTIC MISMATCH DETECTION
    // If question asks "zorunlu mu?" but answer says "mümkündür", this is a semantic mismatch
    // "mümkündür" (is possible) ≠ "zorunludur" (is required)
    if (originalQuestion) {
      const questionLower = originalQuestion.toLowerCase();
      const cevapMatch = fixedText.match(/\*\*CEVAP\*\*\s*\n?([^\n]+)/i);

      if (cevapMatch) {
        const cevapText = cevapMatch[1].toLowerCase();

        // Question asks about obligation but answer talks about possibility
        const asksAboutObligation = /zorunlu\s*(mu|mudur|değil|olmak)|mecburi|gerekli\s*mi/i.test(questionLower);
        const answersWithPossibility = /mümkündür|mümkün bulunmaktadır/i.test(cevapText) &&
                                        !/zorunlu|zorunludur|gerekmektedir|mecburidir/i.test(cevapText);

        if (asksAboutObligation && answersWithPossibility) {
          console.log(`⚠️ POST-PROCESS: Semantic mismatch detected`);
          console.log(`   Question asks about obligation, answer talks about possibility`);

          // Extract source reference
          const sourceRef = cevapText.match(/\[kaynak\s*\d+\]/i)?.[0] || '[Kaynak 1]';
          const correctedCevap = `Bu konuda "zorunlu olup olmadığı" yönünde açık bir hüküm cümlesi bulunamadı. Mevcut kaynak yalnızca "mümkün olup olmadığı" konusunda bilgi içeriyor. ${sourceRef}`;

          fixedText = fixedText.replace(cevapMatch[1], correctedCevap);
          console.log(`🔧 POST-PROCESS: Replaced mismatched answer with clarification`);
          fixCount++;
        }
      }
    }

    // 10. SEMANTIC DRIFT DETECTION
    // Detect when quote talks about a DIFFERENT action/topic than the question
    // e.g., Question: "bulundurmak" vs Quote: "asmak" - these are different actions!
    if (originalQuestion) {
      const questionLower = originalQuestion.toLowerCase();
      const alintiMatch = fixedText.match(/\*\*ALINTI\*\*\s*\n?"([^"]+)"/i);

      if (alintiMatch) {
        const quoteText = alintiMatch[1].toLowerCase();

        // Define semantic drift pairs - question term vs quote term that don't match
        const semanticDriftPairs = [
          // bulundurmak (keep/carry) vs asmak (hang/display)
          { questionTerm: /bulundur|taşı|fotokopi/i, quoteTerm: /asmak|asma|asılma|asmaları/i, drift: '"bulundurmak/taşımak" ile "asmak" farklı eylemlerdir' },
          // nakliye aracı vs turizm aracı
          { questionTerm: /nakliye|kargo|taşıma/i, quoteTerm: /turizm|transfer|otel/i, drift: '"nakliye aracı" ile "turizm aracı" farklı sektörlerdir' },
        ];

        for (const pair of semanticDriftPairs) {
          const questionHasTerm = pair.questionTerm.test(questionLower);
          const quoteHasDifferentTerm = pair.quoteTerm.test(quoteText) && !pair.questionTerm.test(quoteText);

          if (questionHasTerm && quoteHasDifferentTerm) {
            console.log(`⚠️ POST-PROCESS: Semantic drift detected - ${pair.drift}`);

            // Check if answer makes definitive claim
            const cevapMatch = fixedText.match(/\*\*CEVAP\*\*\s*\n?([^\n]+)/i);
            if (cevapMatch) {
              const cevapText = cevapMatch[1];
              // If definitive claim exists, add clarification
              if (/zorunlu değildir|gerekmemektedir|zorunludur|gerekmektedir|mümkündür/i.test(cevapText)) {
                const sourceRef = cevapText.match(/\[Kaynak\s*\d+\]/i)?.[0] || '[Kaynak 1]';
                const driftWarning = `Mevcut kaynak farklı bir konuyu (örn. ${pair.drift.split(' ile ')[1]?.split(' ')[0] || 'başka eylem'}) ele alıyor. Sorulan konu hakkında doğrudan hüküm bulunamadı. ${sourceRef}`;
                fixedText = fixedText.replace(cevapMatch[1], driftWarning);
                console.log(`🔧 POST-PROCESS: Replaced drifted answer with clarification`);
                fixCount++;
                break;
              }
            }
          }
        }
      }
    }

    // 11. Clean up multiple spaces
    fixedText = fixedText.replace(/\s{2,}/g, ' ').replace(/ +\./g, '.').replace(/ +,/g, ',');

    if (fixCount > 0) {
      console.log(`✅ POST-PROCESS: Applied ${fixCount} fixes to response`);
    }

    return fixedText;
  }

  /**
   * Detect if a source is a Table of Contents (TOC) entry
   * TOC entries should NOT be used for quotes - they don't contain actual content
   *
   * STRICT detection - only flag clear TOC patterns to avoid false positives
   * Configuration loaded from database via ragSettings.tocDetection
   */
  private isTableOfContents(title: string, content: string, settingsMap?: Map<string, string>): boolean {
    const combined = `${title} ${content}`;

    // Load TOC detection config from database
    let tocConfig = {
      minDotSequence: 5,
      minDotRatio: 0.1,
      maxContentLength: 300,
      patterns: ['\\.{5,}', '…{3,}', '\\.{3,}\\s*\\d{2,4}\\s+\\d+\\.']
    };

    if (settingsMap) {
      const tocConfigRaw = settingsMap.get('ragSettings.tocDetection');
      if (tocConfigRaw) {
        try {
          tocConfig = { ...tocConfig, ...JSON.parse(tocConfigRaw) };
        } catch (e) {
          console.warn('Failed to parse TOC detection config:', e);
        }
      }
    }

    // Pattern 1: Heavy dot filler - configurable minimum dots in a row
    const heavyDotPattern = new RegExp(`\\.{${tocConfig.minDotSequence},}|…{3,}`);
    const hasHeavyDotFiller = heavyDotPattern.test(combined);

    // Pattern 2: TOC line structure - dots followed by page number
    const hasTOCLineStructure = /\.{3,}\s*\d{2,4}\s+\d+\./.test(combined);

    // Pattern 3: Title starts with dots (clear TOC indicator)
    const titleStartsWithDots = /^\.{3,}/.test(title.trim());

    // Pattern 4: Content is MOSTLY dots and numbers (configurable ratio)
    const dotCount = (combined.match(/\./g) || []).length;
    const isMostlyStructural = combined.length < tocConfig.maxContentLength &&
      dotCount > combined.length * tocConfig.minDotRatio;

    // Only flag as TOC if CLEAR indicators present
    const isTOC = hasHeavyDotFiller || hasTOCLineStructure || titleStartsWithDots ||
      (isMostlyStructural && hasTOCLineStructure);

    if (isTOC) {
      console.log(`📋 TOC DETECTED: "${title.substring(0, 50)}..." (heavyDots=${hasHeavyDotFiller}, tocLine=${hasTOCLineStructure})`);
    }

    return isTOC;
  }

  /**
   * Strip section headings from LLM response
   * Removes headings like "KISA GİRİŞ:", "ANA BİLGİ:", "UYGULAMA:", "KAYNAKÇA:", etc.
   * Configuration loaded from database via ragSettings.sectionHeadingsToStrip
   */
  private stripSectionHeadings(text: string, settingsMap?: Map<string, string>): string {
    if (!text) return '';

    // Load headings config from database
    let headingsConfig: { tr: string[]; en: string[] } = {
      tr: ['KISA GİRİŞ:', 'ANA BİLGİ:', 'UYGULAMA:', 'KAYNAKÇA:', 'GİRİŞ:', 'SONUÇ:', 'DETAYLAR:', 'ÖZET:'],
      en: ['INTRODUCTION:', 'MAIN POINTS:', 'APPLICATION:', 'REFERENCES:', 'SOURCES:', 'CONCLUSION:', 'SUMMARY:', 'DETAILS:']
    };

    if (settingsMap) {
      const headingsRaw = settingsMap.get('ragSettings.sectionHeadingsToStrip');
      if (headingsRaw) {
        try {
          headingsConfig = { ...headingsConfig, ...JSON.parse(headingsRaw) };
        } catch (e) {
          console.warn('Failed to parse section headings config:', e);
        }
      }
    }

    let cleanedText = text;

    // Remove Turkish headings (with and without bold markers)
    headingsConfig.tr.forEach(heading => {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanedText = cleanedText.replace(new RegExp(`\\*\\*${escaped}\\*\\*`, 'gi'), '');
      cleanedText = cleanedText.replace(new RegExp(escaped, 'gi'), '');
    });

    // Remove English headings (with and without bold markers)
    headingsConfig.en.forEach(heading => {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanedText = cleanedText.replace(new RegExp(`\\*\\*${escaped}\\*\\*`, 'gi'), '');
      cleanedText = cleanedText.replace(new RegExp(escaped, 'gi'), '');
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
        // Apply Turkish word spacing fix for OCR/PDF content
        const rawTitle = r.title?.replace(/ \(Part \d+\/\d+\)/g, '') || citation;
        const cleanTitle = this.toSentenceCase(this.stripHtml(this.fixTurkishWordSpacing(rawTitle)));
        // Clean raw metadata content (handles crawler records with listing_id/url format)
        const rawExcerpt = r.excerpt || r.content || '';
        const cleanedContent = this.cleanRawMetadataContent(rawExcerpt, r.metadata);
        const cleanExcerpt = this.toSentenceCase(this.stripHtml(this.fixTurkishWordSpacing(cleanedContent)));

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
        // Apply Turkish word spacing fix for OCR/PDF content, then metadata spacing fix
        const rawContent = processedContent || prep.cleanExcerpt;
        const spacedContent = this.fixTurkishWordSpacing(rawContent);
        const displayContent = this.fixMetadataSpacing(spacedContent);
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
   * 📝 Generate footnotes from sources metadata (BACKEND-GENERATED)
   * Follows Dipnot Standardı specification:
   * - Makale: Yazar, Başlık, Dergi, Tarih, Sayı
   * - Özelge: Tarih, Sayı (Birim opsiyonel)
   * - Yargı Kararı: Daire, Tarih, Esas No, Karar No
   * - PDF/Doküman: Başlık, Kurum, Tarih
   * - Soru-Cevap: İçerikte kullanılır ama dipnot BASILMAZ
   *
   * @param sources - Formatted sources array
   * @returns Footnotes string to append to response
   */
  private generateFootnotes(sources: any[]): string {
    if (!sources || sources.length === 0) {
      return '';
    }

    const footnotes: string[] = [];

    sources.forEach((source, idx) => {
      const num = idx + 1;
      const metadata = source.metadata || {};

      // Source type detection
      const sourceType = (
        source.category ||
        source.sourceTable ||
        metadata.source_type ||
        'document'
      ).toLowerCase();

      // 🚫 Soru-Cevap kaynakları dipnot listesine EKLENMEz
      if (sourceType.includes('sorucevap') || sourceType.includes('soru_cevap') || sourceType.includes('qna')) {
        console.log(`[FOOTNOTE] Skipping Soru-Cevap source #${num}`);
        return; // Skip this source
      }

      let footnoteText = '';

      // ============================================
      // 1) MAKALE (Dergi/Journal)
      // Format: Yazar, "Başlık", Dergi Adı, Tarih, Sayı: XX
      // ============================================
      if (sourceType.includes('makale') || sourceType.includes('article') || sourceType.includes('journal')) {
        const parts: string[] = [];

        // Yazar (zorunlu)
        const yazar = metadata.yazar || metadata.author || metadata.yazaradi;
        if (yazar) parts.push(yazar);

        // Makale başlığı (zorunlu)
        const baslik = metadata.baslik || metadata.title || metadata.makale_baslik || source.title;
        if (baslik && baslik.length < 100) parts.push(`"${baslik}"`);

        // Dergi adı (zorunlu)
        const dergi = metadata.dergi || metadata.dergi_adi || metadata.journal || metadata.yayin;
        if (dergi) parts.push(dergi);

        // Tarih (zorunlu - en az yıl)
        const tarih = metadata.tarih || metadata.yil || metadata.year || metadata.yayin_tarihi;
        if (tarih) parts.push(tarih);

        // Sayı (varsa)
        const sayi = metadata.sayi || metadata.sayı || metadata.issue || metadata.cilt;
        if (sayi) parts.push(`Sayı: ${sayi}`);

        // Minimum zorunlu alanlar: yazar + başlık + dergi + tarih (4 alan)
        if (parts.length >= 3) {
          footnoteText = parts.join(', ');
        }
      }

      // ============================================
      // 2) ÖZELGE
      // Format: Özelge, Tarih: GG.AA.YYYY, Sayı: XXXXX (ops: Birim)
      // ============================================
      else if (sourceType.includes('ozelge') || sourceType.includes('özelge') || sourceType.includes('ruling')) {
        const parts: string[] = ['Özelge'];

        // Tarih (zorunlu)
        const tarih = metadata.tarih || metadata.ozelge_tarihi || metadata.karar_tarihi;
        if (tarih) parts.push(`Tarih: ${tarih}`);

        // Sayı (zorunlu)
        const sayi = metadata.sayisirano || metadata.sayi || metadata.sayı || metadata.ozelge_no;
        if (sayi) parts.push(`Sayı: ${sayi}`);

        // Birim/İdare (opsiyonel)
        const birim = metadata.kurum || metadata.makam || metadata.idare || metadata.daire;
        if (birim) parts.push(`(${birim})`);

        // Minimum zorunlu: tarih + sayı (en az 3 parça: "Özelge" + tarih + sayı)
        if (parts.length >= 3) {
          footnoteText = parts.join(', ').replace(', (', ' (');
        }
      }

      // ============================================
      // 3) YARGI KARARI (Danıştay, vb.)
      // Format: Danıştay X. Daire, Tarih: GG.AA.YYYY, E. YYYY/XXXX, K. YYYY/XXXX
      // ============================================
      else if (sourceType.includes('danistay') || sourceType.includes('yargi') || sourceType.includes('karar') || sourceType.includes('court')) {
        const parts: string[] = [];

        // Daire (zorunlu)
        const daire = metadata.daire || metadata.mahkeme || metadata.court;
        if (daire) {
          parts.push(daire.includes('Danıştay') ? daire : `Danıştay ${daire}`);
        } else {
          parts.push('Danıştay');
        }

        // Tarih (zorunlu)
        const tarih = metadata.karar_tarihi || metadata.tarih || metadata.date;
        if (tarih) parts.push(`Tarih: ${tarih}`);

        // Esas No (zorunlu)
        const esasNo = metadata.esas_no || metadata.esas || metadata.esasno;
        if (esasNo) parts.push(`E. ${esasNo}`);

        // Karar No (zorunlu)
        const kararNo = metadata.karar_no || metadata.karar || metadata.kararno;
        if (kararNo) parts.push(`K. ${kararNo}`);

        // Minimum zorunlu: daire + tarih + esas no + karar no (4 parça)
        if (parts.length >= 3) {
          footnoteText = parts.join(', ');
        }
      }

      // ============================================
      // 4) PDF / RESMİ DOKÜMAN (Rehber, Tebliğ, Kılavuz, vb.)
      // Format: "Başlık", Kurum, Tarih: GG.AA.YYYY
      // ============================================
      else if (sourceType.includes('document') || sourceType.includes('pdf') || sourceType.includes('rehber') ||
               sourceType.includes('teblig') || sourceType.includes('kilavuz') || sourceType.includes('duyuru')) {
        const parts: string[] = [];

        // Doküman başlığı (zorunlu)
        const baslik = metadata.baslik || metadata.title || metadata.dokuman_adi || source.title;
        if (baslik && baslik.length < 120) parts.push(`"${baslik}"`);

        // Kurum (zorunlu)
        const kurum = metadata.kurum || metadata.yayinlayan || metadata.publisher || metadata.institution;
        if (kurum) parts.push(kurum);

        // Tarih (varsa)
        const tarih = metadata.tarih || metadata.yayin_tarihi || metadata.date || metadata.yil;
        if (tarih) parts.push(`Tarih: ${tarih}`);

        // Sayfa/Bölüm (opsiyonel)
        const sayfa = metadata.sayfa || metadata.page || metadata.bolum;
        if (sayfa) parts.push(`s. ${sayfa}`);

        // Minimum zorunlu: başlık + kurum (en az 2 parça)
        if (parts.length >= 2) {
          footnoteText = parts.join(', ');
        }
      }

      // ============================================
      // 5) DİĞER KAYNAKLAR (Generic fallback)
      // ============================================
      else {
        const parts: string[] = [];

        // Type label
        const typeLabels: Record<string, string> = {
          'kanun': 'Kanun',
          'teblig': 'Tebliğ',
          'sirkuler': 'Sirküler',
          'yonetmelik': 'Yönetmelik'
        };

        let typeLabel = 'Kaynak';
        for (const [key, label] of Object.entries(typeLabels)) {
          if (sourceType.includes(key)) {
            typeLabel = label;
            break;
          }
        }
        parts.push(typeLabel);

        // Add any available metadata
        if (metadata.kurum || metadata.makam) parts.push(metadata.kurum || metadata.makam);
        if (metadata.tarih || metadata.yil) parts.push(metadata.tarih || metadata.yil);
        if (metadata.sayi || metadata.sayı) parts.push(`Sayı: ${metadata.sayi || metadata.sayı}`);

        // Only create footnote if we have meaningful content
        if (parts.length >= 2) {
          footnoteText = parts.join(', ');
        }
      }

      // Only add footnote if we have valid content
      if (footnoteText && footnoteText.length > 10) {
        footnotes.push(`[${num}] ${footnoteText}`);
      } else {
        console.log(`[FOOTNOTE] Skipping source #${num} - insufficient metadata for type: ${sourceType}`);
      }
    });

    if (footnotes.length === 0) {
      return '';
    }

    return '\n\n---\n\n**Dipnotlar:**\n' + footnotes.join('\n');
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
   * 🔧 BACKEND KEYWORD EXTRACTOR
   * Extracts keywords from source content and titles
   * Does NOT use LLM - pure text extraction from actual source content
   */
  private extractKeywordsFromSources(query: string, searchResults: any[]): string[] {
    const keywords = new Set<string>();

    // Turkish stopwords to exclude - expanded list
    const stopwords = new Set([
      // Common words
      'vergi', 'vergisi', 'kanun', 'kanunu', 'madde', 'maddesi', 'hakkında', 'ilgili',
      'nasıl', 'nedir', 'midir', 'mıdır', 'mudur', 'müdür', 'mıyım', 'miyim',
      'bir', 'bu', 'şu', 'olan', 'olarak', 'ise', 'veya', 'ile', 'için', 'gibi', 'kadar', 'daha',
      'var', 'yok', 'ama', 'fakat', 'ancak', 'çünkü', 'dolayı', 'nedeni', 'olup',
      'ayrıca', 'bunun', 'buna', 'bunu', 'bunlar', 'diğer', 'tarafından', 'üzere',
      // Database field names to exclude
      'daire', 'dairesi', 'esas', 'karar', 'tarih', 'sayı', 'sayi', 'kurum',
      'dairesiesas', 'dairesitarih', 'kararno', 'esasno', 'record_type', 'source_type',
      // Document structure words
      'başlık', 'içerik', 'özet', 'sonuç', 'bölüm', 'konu', 'konusu',
      // Yargıtay/Danıştay terms
      'yargıtay', 'danıştay', 'temyiz', 'davacı', 'davalı', 'mahkeme', 'mahkemece',
      'hüküm', 'karar', 'onama', 'bozma', 'itiraz'
    ]);

    // Legal terms to prioritize (Turkish tax/law)
    const legalTerms = new Set([
      'kdv', 'ötv', 'mtv', 'stopaj', 'tevkifat', 'istisna', 'muafiyet', 'indirim',
      'matrah', 'beyanname', 'tebliğ', 'sirküler', 'özelge', 'mükellef',
      'fatura', 'fiş', 'belge', 'iade', 'tahakkuk', 'tahsilat', 'ceza',
      'gecikme', 'faiz', 'uzlaşma', 'inceleme', 'denetim', 'tarhiyat'
    ]);

    // Extract meaningful content-based keywords from sources
    for (const source of searchResults.slice(0, 5)) {
      const content = source.content || source.text || source.excerpt || '';
      const title = source.title || '';

      // Combine title and first part of content
      const textToAnalyze = (title + ' ' + content.substring(0, 800)).toLowerCase();

      // Extract words (4+ chars, not stopword, not numeric-only)
      const words = textToAnalyze
        .replace(/[?!.,;:'"()\/\[\]\{\}]/g, ' ')
        .replace(/\d{4,}/g, ' ')  // Remove long numbers (dates, case numbers)
        .split(/\s+/)
        .filter((w: string) => {
          if (w.length < 4) return false;
          if (stopwords.has(w)) return false;
          if (/^\d+$/.test(w)) return false;  // Exclude pure numbers
          if (/^[a-z_]+$/i.test(w) && w.includes('_')) return false;  // Exclude db fields
          return true;
        });

      // Add legal terms first (higher priority)
      words.forEach((w: string) => {
        if (legalTerms.has(w)) {
          keywords.add(w);
        }
      });

      // Then add other meaningful words (limit per source)
      let addedFromSource = 0;
      words.forEach((w: string) => {
        if (addedFromSource < 3 && !legalTerms.has(w) && w.length > 4) {
          keywords.add(w);
          addedFromSource++;
        }
      });
    }

    // Return max 8 keywords, prioritize legal terms, then by length
    const result = Array.from(keywords)
      .filter(k => k.length > 3)
      .sort((a, b) => {
        // Legal terms first
        const aIsLegal = legalTerms.has(a) ? 1 : 0;
        const bIsLegal = legalTerms.has(b) ? 1 : 0;
        if (aIsLegal !== bIsLegal) return bIsLegal - aIsLegal;
        // Then by length (longer = more specific)
        return b.length - a.length;
      })
      .slice(0, 8);

    return result;
  }

  /**
   * 🔧 BACKEND DAYANAKLAR EXTRACTOR
   * Extracts legal references from source metadata and content
   * Does NOT use LLM - regex-based extraction from actual sources
   */
  private extractDayanaklarFromSources(searchResults: any[]): string[] {
    const dayanaklar: string[] = [];
    const seen = new Set<string>();

    // Regex patterns for Turkish legal references
    const patterns = [
      // Kanun referansları: "3065 sayılı Kanun", "VUK 229", "KDV Kanunu"
      /(\d{3,5})\s*sayılı\s*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)\s*Kanun/gi,
      // Madde referansları: "Madde 29", "m. 29", "29. madde"
      /(?:madde|md\.?|m\.)\s*(\d+)/gi,
      // Tebliğ referansları
      /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+(?:Genel\s+)?Tebliğ[i]?)/gi,
      // Sirküler referansları
      /(Sirküler\s*(?:No[:\s]*)?[\d\/\-]+)/gi,
      // Özelge referansları with date
      /(Özelge[:\s]+\d{2}[\.\/]\d{2}[\.\/]\d{4})/gi,
    ];

    for (const source of searchResults.slice(0, 5)) {
      const content = source.content || source.text || source.excerpt || '';
      const title = source.title || '';
      const sourceType = source.source_type || source.sourceType || 'belge';
      const sourceDate = source.date || source.metadata?.date || '';

      // Try to extract from title first (usually more accurate)
      const titleText = title + ' ' + content.substring(0, 500);

      for (const pattern of patterns) {
        const matches = titleText.matchAll(pattern);
        for (const match of matches) {
          const ref = match[0].trim();
          const normalizedRef = ref.toLowerCase().replace(/\s+/g, ' ');
          if (!seen.has(normalizedRef) && ref.length > 5) {
            seen.add(normalizedRef);
            dayanaklar.push(ref);
          }
        }
      }

      // If no patterns found, try to use meaningful source metadata
      // Only add if sourceType is specific (not generic "belge" or "document")
      if (dayanaklar.length === 0 && sourceType) {
        const genericTypes = ['belge', 'document', 'dosya', 'file', 'kaynak', 'source'];
        const isGenericType = genericTypes.includes(sourceType.toLowerCase());

        if (!isGenericType) {
          const typeLabel = this.getSourceTypeLabel(sourceType);
          const dateStr = sourceDate ? ` (${sourceDate})` : '';
          const refFromMeta = `${typeLabel}${dateStr}`;
          if (!seen.has(refFromMeta.toLowerCase()) && refFromMeta.length > 5) {
            seen.add(refFromMeta.toLowerCase());
            dayanaklar.push(refFromMeta);
          }
        }
        // If generic type but has a VALID title (not content fragment), use it
        // Valid titles: contain legal keywords or are short descriptive titles
        else if (title && title.length > 15 && title.length <= 150) {
          // Check if title looks like a proper document title (not content)
          const legalTitleKeywords = [
            'kanun', 'madde', 'tebliğ', 'sirküler', 'özelge', 'yönetmelik',
            'karar', 'daire', 'esas', 'hakkında', 'hk.', 'sayılı', 'tarihli'
          ];
          const contentIndicators = [
            // Common sentence starters/fragments that indicate content, not title
            'için', 'olarak', 'şekilde', 'nedeniyle', 'dolayı', 'göre',
            'tarafından', 'üzere', 'suretiyle', 'kapsamında', 'çerçevesinde',
            'ilişkin', 'dair', 'bakımından', 'açısından', 've', 'veya',
            'ile', 'ise', 'ancak', 'fakat', 'çünkü', 'zira', 'yani'
          ];

          const titleLower = title.toLowerCase();
          const hasLegalKeyword = legalTitleKeywords.some(kw => titleLower.includes(kw));
          const startsWithContentWord = contentIndicators.some(ind =>
            titleLower.startsWith(ind) || titleLower.startsWith(ind + ' ')
          );

          // Only use title if it looks like a legal document title, not content
          if (hasLegalKeyword && !startsWithContentWord) {
            const titleExcerpt = title.length > 80 ? title.substring(0, 80) + '...' : title;
            if (!seen.has(titleExcerpt.toLowerCase())) {
              seen.add(titleExcerpt.toLowerCase());
              dayanaklar.push(titleExcerpt);
            }
          }
        }
      }
    }

    // Return unique references, max 5
    return dayanaklar.slice(0, 5);
  }

  /**
   * Get human-readable label for source type
   */
  private getSourceTypeLabel(sourceType: string): string {
    const labels: Record<string, string> = {
      'ozelge': 'Özelge',
      'sirkuler': 'Sirküler',
      'teblig': 'Tebliğ',
      'kanun': 'Kanun',
      'yonetmelik': 'Yönetmelik',
      'makale': 'Makale',
      'yargi': 'Yargı Kararı',
      'danistay': 'Danıştay Kararı',
      'sorucevap': 'Soru-Cevap'
    };
    return labels[sourceType.toLowerCase()] || sourceType;
  }

  /**
   * 🔧 BACKEND KEYWORD EXTRACTOR FROM SOURCE CONTENT
   * Extracts semantically important terms from the actual source content
   * NOT from the user query - these are the key concepts IN the sources
   * Does NOT use LLM - TF-IDF style extraction
   */
  private extractKeywordsFromSourceContent(searchResults: any[]): string[] {
    const termFrequency = new Map<string, number>();

    // Turkish stopwords to exclude (common words that don't carry semantic meaning)
    const stopwords = new Set([
      // Question words
      'nasıl', 'nedir', 'midir', 'mıdır', 'mudur', 'müdür', 'mıyım', 'miyim', 'neden', 'niçin',
      // Common verbs/auxiliaries
      'olan', 'olarak', 'olmak', 'olduğu', 'olup', 'olmayan', 'olabilir', 'olmaktadır',
      'edilmiş', 'edilir', 'edilen', 'edilecek', 'edilmektedir', 'edilmesi',
      'yapılır', 'yapılan', 'yapılacak', 'yapılması', 'yapılmaktadır',
      'belirtilen', 'belirtilmiş', 'belirtilmektedir',
      // Connectors/articles
      'bir', 'bu', 'şu', 'her', 've', 'ile', 'için', 'gibi', 'kadar', 'daha', 'çok', 'en',
      'ise', 'veya', 'ya', 'de', 'da', 'den', 'dan', 'ne', 'ki', 'ama', 'fakat', 'ancak',
      'var', 'yok', 'mi', 'mı', 'mu', 'mü', 'hem', 'yani', 'aynı', 'başka', 'diğer',
      // Pronouns
      'ben', 'sen', 'biz', 'siz', 'onlar', 'bunlar', 'şunlar',
      // Common document terms (too generic)
      'tarih', 'sayı', 'konu', 'ilgi', 'kaynak', 'belge', 'dosya', 'numara',
      // Meta terms
      'hakkında', 'ilgili', 'ait', 'göre', 'bağlı', 'karşı', 'dolayı', 'nedeniyle',
      'üzerine', 'üzerinde', 'altında', 'içinde', 'dışında', 'arasında',
      // Generic legal boilerplate
      'talep', 'başvuru', 'dilekçe', 'cevap', 'görüş', 'değerlendirme',
      'yukarıda', 'aşağıda', 'söz', 'konusu', 'bahse', 'konu'
    ]);

    // Domain-specific important terms to boost (semantic weight)
    const domainTerms = new Set([
      // Tax/Finance terms
      'vergi', 'kdv', 'ötv', 'gelir', 'kurumlar', 'stopaj', 'tevkifat', 'muafiyet', 'istisna',
      'matrah', 'beyanname', 'fatura', 'sevk', 'irsaliye', 'tahakkuk', 'tahsilat', 'iade',
      'indirim', 'gider', 'hasılat', 'kar', 'zarar', 'amortisman', 'reeskont',
      // Legal terms
      'kanun', 'madde', 'tebliğ', 'sirküler', 'özelge', 'yönetmelik', 'mevzuat',
      'hüküm', 'yaptırım', 'ceza', 'usulsüzlük', 'denetim', 'inceleme',
      // Business terms
      'mükellef', 'şirket', 'işletme', 'ticaret', 'satış', 'alım', 'hizmet',
      'serbest', 'meslek', 'ücret', 'maaş', 'kira', 'faiz', 'temettü'
    ]);

    // Process each source
    for (const source of searchResults.slice(0, 5)) {
      const content = source.content || source.text || source.excerpt || '';
      const title = source.title || '';
      const fullText = (title + ' ' + content).toLowerCase();

      // Tokenize and count terms
      const words = fullText
        .replace(/[?!.,;:'"()\[\]{}\/\\<>«»""'']/g, ' ')
        .replace(/\d+/g, ' ') // Remove numbers
        .split(/\s+/)
        .filter(w => w.length >= 3 && w.length <= 25);

      for (const word of words) {
        // Skip stopwords
        if (stopwords.has(word)) continue;

        // Count frequency with domain boost
        const currentCount = termFrequency.get(word) || 0;
        const boost = domainTerms.has(word) ? 2 : 1;
        termFrequency.set(word, currentCount + boost);
      }
    }

    // Sort by frequency and return top keywords
    const sortedTerms = Array.from(termFrequency.entries())
      .filter(([term, freq]) => freq >= 2) // Must appear at least twice
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term]) => term);

    // Capitalize first letter for display
    return sortedTerms.map(term =>
      term.charAt(0).toUpperCase() + term.slice(1)
    );
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