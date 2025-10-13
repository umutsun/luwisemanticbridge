import { Pool } from 'pg';
import pool, { TABLE_NAMES } from '../config/database';
import { lsembPool } from '../config/database.config';
import { LLMManager } from './llm-manager.service';
import dotenv from 'dotenv';

dotenv.config();

interface EmbeddingSettings {
  provider: string;
  model: string;
  openaiApiKey?: string;
  googleApiKey?: string;
}

export class SemanticSearchService {
  private pool = pool;
  private customerPool: Pool;
  private embeddingSettings: EmbeddingSettings = {
    provider: 'openai',
    model: 'text-embedding-3-small'
  };
  private similarityThreshold: number = 0.001;
  private maxResults: number = 25;
  private minResults: number = 1;
  private enableHybridSearch: boolean = true;
  private enableKeywordBoost: boolean = true;
  private parallelLLMCount: number = 5;
  private parallelLLMBatchSize: number = 3;
  private readonly RAG_SETTINGS_TTL = 30000;
  private readonly EMBEDDING_SETTINGS_TTL = 30000;
  private lastRAGSettingsRefresh: number = 0;
  private lastEmbeddingSettingsRefresh: number = 0;

  constructor() {
    this.customerPool = new Pool({
      connectionString: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'lsemb'}`
    });

    this.loadRAGSettings().catch(error => {
      console.error('[SemanticSearch] Failed to load RAG settings:', error);
    });

    this.loadEmbeddingSettings().catch(error => {
      console.error('[SemanticSearch] Failed to load embedding settings:', error);
    });
  }

  private parseBooleanSetting(value: any): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return undefined;
  }

  // Public getters for RAG settings
  getParallelLLMCount(): number {
    return this.parallelLLMCount;
  }

  getParallelLLMBatchSize(): number {
    return this.parallelLLMBatchSize;
  }

  private normalizeProvider(provider?: string): string {
    if (!provider) {
      return 'openai';
    }

    const normalized = provider.toLowerCase();

    if (normalized.includes('claude') || normalized.includes('anthropic')) {
      return 'claude';
    }

    if (normalized.includes('gemini') || normalized.includes('google')) {
      return 'google';
    }

    if (normalized.includes('deepseek')) {
      return 'deepseek';
    }

    if (normalized.includes('openai') || normalized.includes('gpt')) {
      return 'openai';
    }

    return normalized;
  }

  private getDefaultEmbeddingModel(provider: string): string {
    switch (provider) {
      case 'google':
        return 'text-embedding-004';
      case 'openai':
      case 'deepseek':
        return 'text-embedding-3-small';
      default:
        return 'text-embedding-004';
    }
  }

  private async loadRAGSettings(): Promise<void> {
    try {
      // Check if database is available
      if (!lsembPool) {
        console.warn('[SemanticSearch] Database not initialized, using default RAG settings');
        return;
      }

      const result = await lsembPool.query(
        'SELECT key, value FROM settings WHERE key IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [
          'ragSettings.similarityThreshold',
          'similarity_threshold',
          'ragSettings.maxResults',
          'ragSettings.minResults',
          'ragSettings.enableHybridSearch',
          'ragSettings.enableKeywordBoost',
          'similarityThreshold',
          'maxResults',
          'minResults',
          'parallel_llm_count',
          'parallel_llm_batch_size'
        ]
      );

      result.rows.forEach(row => {
        const value = row.value;
        switch (row.key) {
          case 'ragSettings.similarityThreshold':
          case 'similarity_threshold':
          case 'similarityThreshold': {
            const threshold = parseFloat(value);
            if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
              this.similarityThreshold = threshold;
            }
            break;
          }
          case 'ragSettings.maxResults':
          case 'maxResults': {
            const parsedMax = parseInt(value, 10);
            if (!isNaN(parsedMax) && parsedMax > 0) {
              this.maxResults = parsedMax;
            }
            break;
          }
          case 'ragSettings.minResults':
          case 'minResults': {
            const parsedMin = parseInt(value, 10);
            if (!isNaN(parsedMin) && parsedMin > 0) {
              this.minResults = parsedMin;
            }
            break;
          }
          case 'ragSettings.enableHybridSearch': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.enableHybridSearch = parsed;
            }
            break;
          }
          case 'ragSettings.enableKeywordBoost': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.enableKeywordBoost = parsed;
            }
            break;
          }
          case 'parallel_llm_count': {
            const parsedCount = parseInt(value, 10);
            if (!isNaN(parsedCount) && parsedCount > 0 && parsedCount <= 10) {
              this.parallelLLMCount = parsedCount;
            }
            break;
          }
          case 'parallel_llm_batch_size': {
            const parsedBatchSize = parseInt(value, 10);
            if (!isNaN(parsedBatchSize) && parsedBatchSize > 0 && parsedBatchSize <= 20) {
              this.parallelLLMBatchSize = parsedBatchSize;
            }
            break;
          }
          default:
            break;
        }
      });

      this.lastRAGSettingsRefresh = Date.now();

      console.log('[SemanticSearch] RAG settings loaded', {
        similarityThreshold: this.similarityThreshold,
        maxResults: this.maxResults,
        minResults: this.minResults,
        enableHybridSearch: this.enableHybridSearch,
        enableKeywordBoost: this.enableKeywordBoost,
        parallelLLMCount: this.parallelLLMCount,
        parallelLLMBatchSize: this.parallelLLMBatchSize
      });
    } catch (error) {
      console.warn('[SemanticSearch] Failed to load RAG settings from database, using defaults:', error);
    }
  }

  private async refreshRAGSettings(): Promise<void> {
    if (Date.now() - this.lastRAGSettingsRefresh < this.RAG_SETTINGS_TTL) {
      return;
    }

    await this.loadRAGSettings();
  }

  private async loadEmbeddingSettings(): Promise<void> {
    try {
      // Check if database is available
      if (!lsembPool) {
        console.warn('[SemanticSearch] Database not initialized, using default embedding settings');
        // Default to Google embeddings for compatibility
        const provider = 'google';
        const model = this.getDefaultEmbeddingModel(provider);
        this.embeddingSettings = {
          provider,
          model,
          openaiApiKey: process.env.OPENAI_API_KEY,
          googleApiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
        };
        return;
      }

      // Get embedding provider and model from settings, fall back to Google if not set
      const result = await lsembPool.query(
        'SELECT key, value FROM settings WHERE key IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          'embedding_provider', 'embedding_model', 'openai_api_key', 'google_api_key',
          'llmSettings.embeddingProvider', 'llmSettings.embeddingModel',
          'embeddings.provider', 'embeddings.model', 'openai.apiKey', 'google.apiKey'
        ]
      );

      const settings = result.rows.reduce((acc: any, row: any) => {
        if (row.key === 'openai_api_key' || row.key === 'openai.apiKey') {
          acc.openaiapi = row.value;
        } else if (row.key === 'google_api_key' || row.key === 'google.apiKey') {
          acc.googleapi = row.value;
        } else {
          const key = row.key.replace('_key', '').replace('.', '');
          acc[key] = row.value;
        }
        return acc;
      }, {});

      // Determine provider and model from settings
      let provider = settings.embedding_provider || settings.embeddingsprovider || 'google';
      let model = settings.embedding_model || settings.embeddingsmodel || 'text-embedding-004';

      // Normalize provider name
      provider = this.normalizeProvider(provider);

      // Set default model based on provider
      if (!model || model === 'text-embedding-004') {
        model = this.getDefaultEmbeddingModel(provider);
      }

      this.embeddingSettings = {
        provider,
        model,
        openaiApiKey: settings.openaiapi || process.env.OPENAI_API_KEY,
        googleApiKey: settings.googleapi || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
      };

      this.lastEmbeddingSettingsRefresh = Date.now();
      this.syncEmbeddingConfigWithLLM();

      // FORCE GOOGLE EMBEDDINGS for vector compatibility (768 dimensions)
      if (this.embeddingSettings.provider !== 'google') {
        console.log('🔄 FORCING Google embeddings for vector compatibility (768 dims)');
        this.embeddingSettings.provider = 'google';
        this.embeddingSettings.model = 'text-embedding-004';
        this.syncEmbeddingConfigWithLLM();
      }

      console.log('[SemanticSearch] Embedding settings loaded', {
        provider: this.embeddingSettings.provider,
        model: this.embeddingSettings.model,
        hasGoogleKey: !!this.embeddingSettings.googleApiKey,
        hasOpenAIKey: !!this.embeddingSettings.openaiApiKey
      });
    } catch (error) {
      console.warn('[SemanticSearch] Failed to load embedding settings from database, using defaults:', error);
      // Default to Google embeddings for compatibility
      const provider = 'google';
      const model = this.getDefaultEmbeddingModel(provider);
      this.embeddingSettings = {
        provider,
        model,
        openaiApiKey: process.env.OPENAI_API_KEY,
        googleApiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
      };
      this.lastEmbeddingSettingsRefresh = Date.now();
      this.syncEmbeddingConfigWithLLM();
    }
  }

  async refreshEmbeddingSettings(): Promise<void> {
    if (Date.now() - this.lastEmbeddingSettingsRefresh < this.EMBEDDING_SETTINGS_TTL) {
      return;
    }

    await this.loadEmbeddingSettings();
  }

  private syncEmbeddingConfigWithLLM(): void {
    try {
      const llmManager = LLMManager.getInstance();
      llmManager.updateEmbeddingConfig({
        provider: this.embeddingSettings.provider,
        model: this.embeddingSettings.model
      });
    } catch (error) {
      console.warn('[SemanticSearch] Unable to sync embedding settings with LLM Manager:', error);
    }
  }

  private applyResultLimits(requestedLimit: number): number {
    const safeLimit = Number.isFinite(requestedLimit) ? requestedLimit : this.maxResults;
    return Math.max(this.minResults, Math.min(this.maxResults, safeLimit));
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      await this.refreshEmbeddingSettings();
      const llmManager = LLMManager.getInstance();

      // Use active embedding provider from settings or fall back to default
      const embeddingProvider = this.embeddingSettings.provider || 'openai';
      const embeddingModel = this.embeddingSettings.model;

      console.log(`[SemanticSearch] Generating embedding using ${embeddingProvider} (${embeddingModel})`);
      const embedding = await llmManager.generateEmbedding(text, {
        provider: embeddingProvider,
        model: embeddingModel
      });

      console.log(`[SemanticSearch] Generated embedding with ${embedding.length} dimensions`);
      return embedding;
    } catch (error) {
      console.error('[SemanticSearch] Embedding generation failed:', error);
      console.log('[SemanticSearch] Using mock embedding as fallback');
      return this.generateMockEmbedding(text);
    }
  }

  
  private generateMockEmbedding(text: string): number[] {
    const embedding = new Array(768).fill(0);
    const hash = this.simpleHash(text);
    for (let i = 0; i < 768; i++) {
      embedding[i] = Math.sin(hash * (i + 1)) * 0.5 + Math.random() * 0.1;
    }
    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private extractKeywords(text: string, query: string): string[] {
    // Common Turkish tax/legal terms to look for
    const legalTerms = [
      'vergi', 'kdv', 'katma değer vergisi', 'kurumlar vergisi', 'gelir vergisi',
      'stopaj', 'geçici vergi', 'vergi ziyaı', 'usulsüzlük', 'kaçakçılık',
      'vergi incelemesi', 'müfettiş', 'tarh', 'zamanaşımı', 'beyanname',
      'mükellef', 'vergi dairesi', 'defter', 'fatura', 'günlük kasa',
      'beyan', 'ödeme', 'faiz', 'ceza', 'tarhiyat', 'matrah',
      'kanun', 'tebliğ', 'genel tebliğ', 'sirküler', 'karar',
      'danıştay', 'yargıtay', 'mahkeme', 'dava', 'itiraz',
      'sosyal güvenlik', 'sgk', 'bağkur', 'emeklilik', 'işsizlik'
    ];

    // Extract words from text
    const words = text.toLowerCase()
      .replace(/[^\w\sçğıöşü]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Find legal terms in text
    const foundTerms = legalTerms.filter(term =>
      text.toLowerCase().includes(term.toLowerCase())
    );

    // Extract important words from query
    const queryWords = query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 3);

    // Extract capitalized words (potential entities)
    const capitalizedWords = text.match(/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\b/g) || [];

    // Combine and deduplicate
    const allKeywords = [
      ...foundTerms.slice(0, 3),  // Prioritize legal terms
      ...queryWords.slice(0, 2),  // Add query terms
      ...capitalizedWords.slice(0, 2)  // Add some entities
    ];

    // Filter and return unique keywords
    return [...new Set(allKeywords)]
      .filter(keyword =>
        keyword.length > 2 &&
        keyword.length < 30 &&
        !['ve', 'ile', 'için', 'göre', 'üzerine', 'kadar', 'olarak', 'sonra', 'önce'].includes(keyword.toLowerCase())
      )
      .slice(0, 5);  // Limit to 5 keywords
  }

  /**
   * Extract smart keywords from content, title, source table and query
   */
  private extractSmartKeywords(content: string, title: string, sourceTable: string, query: string): string[] {
    const keywords: string[] = [];

    // 1. Add source table as formatted keyword (remove Turkish hardcoded mappings)
    const sourceKeyword = this.formatSourceTableName(sourceTable);
    if (sourceKeyword && sourceKeyword !== 'Kaynak') {
      keywords.push(sourceKeyword);
    }

    // 2. Extract keywords from title (title usually has the most important info)
    if (title && title.length > 0) {
      const titleWords = this.extractImportantWords(title);
      keywords.push(...titleWords.slice(0, 2));
    }

    // 3. Extract keywords from content
    if (content && content.length > 0) {
      const contentWords = this.extractImportantWords(content);
      keywords.push(...contentWords.slice(0, 3));
    }

    // 4. Add query terms if they're meaningful
    const queryWords = this.extractImportantWords(query);
    keywords.push(...queryWords.slice(0, 1));

    // 5. Remove duplicates and filter
    return [...new Set(keywords)]
      .filter(keyword =>
        keyword &&
        keyword.length > 2 &&
        keyword.length < 30 &&
        !['ve', 'ile', 'için', 'göre', 'üzerine', 'kadar', 'olarak', 'sonra', 'önce', 'the', 'and', 'for', 'with'].includes(keyword.toLowerCase())
      )
      .slice(0, 5); // Limit to 5 keywords
  }

  /**
   * Format source table name to readable format
   */
  private formatSourceTableName(sourceTable: string): string {
    if (!sourceTable) return '';

    // Convert common table names to readable format
    const formatted = sourceTable
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();

    return formatted;
  }

  /**
   * Extract important words from text
   */
  private extractImportantWords(text: string): string[] {
    // Common Turkish legal/tax terms that are important
    const importantTerms = [
      'vergi', 'kdv', 'kurumlar', 'gelir', 'stopaj', 'beyanname',
      'mükellef', 'tarh', 'ceza', 'kanun', 'tebliğ', 'karar',
      'mahkeme', 'dava', 'itiraz', 'faiz', 'matrah', 'sgk'
    ];

    const words = text.toLowerCase()
      .replace(/[^\w\sçğıöşü]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Find important terms first
    const found = words.filter(word =>
      importantTerms.some(term => word.includes(term) || term.includes(word))
    );

    // Add capitalized words (likely entities, names)
    const capitalized = text.match(/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\b/g) || [];

    return [...found.slice(0, 2), ...capitalized.slice(0, 2), ...words.slice(0, 2)];
  }

  async keywordSearch(query: string, limit: number = 10) {
    const queryId = `keywordSearch_${query.substring(0, 10)}_${Date.now()}`;
    console.time(queryId);
    try {
      const effectiveLimit = this.applyResultLimits(limit);
      let allResults: any[] = [];

      const searchQuery = `
        SELECT DISTINCT
          id::text as id,
          CASE
            WHEN content ILIKE '%' || $1 || '%' THEN
              LEFT(SUBSTRING(content, POSITION($1 IN content) - 50, 200), 150)
            ELSE LEFT(content, 150)
          END as title,
          source_table,
          source_id,
          CASE
            WHEN content ILIKE '%' || $1 || '%' THEN
              LEFT(SUBSTRING(content, POSITION($1 IN content) - 50, 300), 250)
            ELSE LEFT(content, 250)
          END as excerpt,
          1 as priority,
          CASE
            WHEN content ILIKE '%' || $1 || '%' THEN 90
            WHEN source_table ILIKE '%' || $1 || '%' THEN 70
            ELSE 50
          END as score
        FROM unified_embeddings
        WHERE content ILIKE '%' || $1 || '%'
           OR source_table ILIKE '%' || $1 || '%'
        ORDER BY
          CASE
            WHEN content ILIKE '%' || $1 || '%' THEN 90
            WHEN source_table ILIKE '%' || $1 || '%' THEN 70
            ELSE 50
          END DESC,
          id DESC
        LIMIT $2
      `;

      try {
        if (lsembPool) {
          const result = await lsembPool.query(searchQuery, [query, effectiveLimit]);
          allResults = [...allResults, ...result.rows];
          console.log(`[SemanticSearch] Found ${result.rows.length} keyword results`);
        } else {
          console.log('[SemanticSearch] lsembPool not available, keyword search disabled');
        }
      } catch (error) {
        console.log('[SemanticSearch] unified_embeddings table not accessible for keyword search');
      }

      console.timeEnd(queryId);

      const sortedResults = allResults
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }

          const queryLower = query.toLowerCase();
          const aTitle = (a.title || '').toLowerCase();
          const bTitle = (b.title || '').toLowerCase();
          const aExcerpt = (a.excerpt || '').toLowerCase();
          const bExcerpt = (b.excerpt || '').toLowerCase();

          const aRelevance = (aTitle.includes(queryLower) ? 2 : 0) + (aExcerpt.includes(queryLower) ? 1 : 0);
          const bRelevance = (bTitle.includes(queryLower) ? 2 : 0) + (bExcerpt.includes(queryLower) ? 1 : 0);

          return bRelevance - aRelevance;
        })
        .slice(0, effectiveLimit);

      return sortedResults.map(row => ({
        ...row,
        score: Math.max(90, 100 - (row.priority * 8))
      }));
    } catch (error) {
      console.timeEnd(queryId);
      console.error('[SemanticSearch] Keyword search error:', error);
      return [];
    }
  }

  async semanticSearch(query: string, limit: number = 10) {
    const embeddingId = `semanticSearch_embedding_${query.substring(0, 10)}_${Date.now()}`;
    const queryId = `semanticSearch_query_${query.substring(0, 10)}_${Date.now()}`;
    let queryTimerStarted = false;

    try {
      await this.refreshRAGSettings();
      await this.refreshEmbeddingSettings();

      const effectiveLimit = this.applyResultLimits(limit);

      if (!lsembPool) {
        console.log('[SemanticSearch] lsembPool not available, using keyword search fallback');
        return this.keywordSearch(query, effectiveLimit);
      }

      const embeddingCheck = await lsembPool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE embedding IS NOT NULL
      `);

      const hasEmbeddings = parseInt(embeddingCheck.rows[0].count, 10) > 0;

      if (!hasEmbeddings) {
        console.log('[SemanticSearch] No embeddings in unified_embeddings, using keyword search fallback');
        return this.keywordSearch(query, effectiveLimit);
      }

      console.time(embeddingId);
      const queryEmbedding = await this.generateEmbedding(query);
      console.timeEnd(embeddingId);

      const keywordPattern = `%${query}%`;
      const searchQuery = `
        SELECT
          ue.id::text as id,
          LEFT(COALESCE(ue.metadata->>'title', ue.content::text), 200) as title,
          LEFT(COALESCE(ue.content, ue.metadata->>'content', ue.metadata->>'text', ''), 1500) as excerpt,
          COALESCE(ue.metadata->>'table', 'unknown') as source_table,
          ue.source_id,
          ue.metadata,
          1 - (ue.embedding <=> $1::vector) as similarity_score,
          CASE
            WHEN $5::boolean AND (ue.content ILIKE $3 OR ue.metadata->>'content' ILIKE $3 OR ue.metadata->>'text' ILIKE $3) THEN 0.15
            WHEN $5::boolean AND ue.metadata->>'title' ILIKE $3 THEN 0.1
            ELSE 0
          END as keyword_boost
        FROM unified_embeddings ue
        WHERE ue.embedding IS NOT NULL
          AND (1 - (ue.embedding <=> $1::vector)) >= $2
        ORDER BY
          (1 - (ue.embedding <=> $1::vector)) +
          CASE
            WHEN $5::boolean AND (ue.content ILIKE $3 OR ue.metadata->>'content' ILIKE $3 OR ue.metadata->>'text' ILIKE $3) THEN 0.15
            WHEN $5::boolean AND ue.metadata->>'title' ILIKE $3 THEN 0.1
            ELSE 0
          END DESC
        LIMIT $4
      `;

      console.time(queryId);
      queryTimerStarted = true;
      const result = await lsembPool.query(searchQuery, [
        JSON.stringify(queryEmbedding),
        this.similarityThreshold,
        keywordPattern,
        effectiveLimit,
        this.enableKeywordBoost
      ]);
      console.timeEnd(queryId);

      return result.rows.map(row => {
        // Extract keywords from content, title, and source table
        const keywords = this.extractSmartKeywords(row.excerpt || '', row.title || '', row.source_table || '', query);

        return {
          ...row,
          score: Math.round((parseFloat(row.similarity_score) + parseFloat(row.keyword_boost || 0)) * 125),
          relevanceScore: parseFloat(row.similarity_score),
          content: row.excerpt,
          keywords: keywords
        };
      });
    } catch (error) {
      if (queryTimerStarted) {
        console.timeEnd(queryId);
      }
      console.error('[SemanticSearch] Semantic search error:', error);
      return this.keywordSearch(query, limit);
    }
  }

  async unifiedSemanticSearch(query: string, limit: number = 10) {
    // Use the real semantic search with embeddings
    return this.semanticSearch(query, limit);
  }

  async hybridSearch(query: string, limit: number = 10) {
    // Use the real semantic search with embeddings
    return this.semanticSearch(query, limit);
  }

  async findSimilarDocuments(documentId: string, limit: number = 5) {
    try {
      return [];
    } catch (error) {
      console.error('[SemanticSearch] Find similar documents error:', error);
      return [];
    }
  }

  async searchBySource(sourceTable: string, query: string, limit: number = 10) {
    try {
      const effectiveLimit = this.applyResultLimits(limit);
      let searchQuery = '';

      switch (sourceTable.toLowerCase()) {
        case 'sorucevap':
          try {
            searchQuery = `
              SELECT
                id::text as id,
                LEFT(question, 150) as title,
                'sorucevap' as source_table,
                id::text as source_id,
                LEFT(answer, 1500) as excerpt
              FROM ${TABLE_NAMES.SORUCEVAP}
              WHERE question ILIKE $1 OR answer ILIKE $1
              ORDER BY id DESC
              LIMIT $2
            `;
            const result = await this.customerPool.query(searchQuery, [`%${query}%`, effectiveLimit]);
            return result.rows;
          } catch (error) {
            console.log('[SemanticSearch] SORUCEVAP table not accessible for search');
            return [];
          }
        case 'ozelgeler':
          searchQuery = `
            SELECT
              id::text as id,
              LEFT(subject, 150) as title,
              'ozelgeler' as source_table,
              id::text as source_id,
              LEFT(content, 1500) as excerpt
            FROM ${TABLE_NAMES.OZELGELER}
            WHERE subject ILIKE $1 OR content ILIKE $1
            ORDER BY id DESC
            LIMIT $2
          `;
          break;
        case 'makaleler':
          searchQuery = `
            SELECT
              id::text as id,
              LEFT(baslik, 150) as title,
              'makaleler' as source_table,
              id::text as source_id,
              LEFT(icerik, 1500) as excerpt
            FROM ${TABLE_NAMES.MAKALELER}
            WHERE baslik ILIKE $1 OR icerik ILIKE $1
            ORDER BY id DESC
            LIMIT $2
          `;
          break;
        case 'danistaykararlari':
          searchQuery = `
            SELECT
              id::text as id,
              'DANI?TAY - ' || LEFT(konu, 100) as title,
              'danistaykararlari' as source_table,
              id::text as source_id,
              LEFT(karar, 500) as excerpt
            FROM ${TABLE_NAMES.DANISTAYKARARLARI}
            WHERE konu ILIKE $1 OR karar ILIKE $1
            ORDER BY id DESC
            LIMIT $2
          `;
          break;
        default:
          return [];
      }

      const result = await this.pool.query(searchQuery, [
        `%${query}%`,
        effectiveLimit
      ]);

      return result.rows;
    } catch (error) {
      console.error('[SemanticSearch] Search by source error:', error);
      return [];
    }
  }

  async getStats() {
    try {
      const statsQuery = `
        WITH table_counts AS (
          SELECT 'sorucevap' as source_table, COUNT(*) as count FROM ${TABLE_NAMES.SORUCEVAP}
          UNION ALL
          SELECT 'ozelgeler', COUNT(*) FROM ${TABLE_NAMES.OZELGELER}
          UNION ALL
          SELECT 'makaleler', COUNT(*) FROM ${TABLE_NAMES.MAKALELER}
          UNION ALL
          SELECT 'danistaykararlari', COUNT(*) FROM ${TABLE_NAMES.DANISTAYKARARLARI}
        )
        SELECT * FROM table_counts ORDER BY count DESC
      `;

      let result;
      try {
        result = await this.customerPool.query(statsQuery);
      } catch (error) {
        if (error instanceof Error) {
          console.log('[SemanticSearch] Could not get stats from customer database:', error.message);
        } else {
          console.log('[SemanticSearch] Unknown error while getting stats from the customer database');
        }
        result = { rows: [] };
      }

      const embeddingsQuery = 'SELECT COUNT(*) as count FROM public.embeddings';
      const embeddingsResult = await this.pool.query(embeddingsQuery);

      const total = result.rows.reduce((sum: number, row: any) => sum + parseInt(row.count, 10), 0);

      return {
        bySource: result.rows.map((row: any) => ({
          ...row,
          with_embeddings: 0
        })),
        total,
        totalWithEmbeddings: parseInt(embeddingsResult.rows[0].count, 10)
      };
    } catch (error) {
      console.error('[SemanticSearch] Get stats error:', error);
      return {
        bySource: [],
        total: 0,
        totalWithEmbeddings: 0
      };
    }
  }

  async getSampleDocuments(limit: number = 5) {
    try {
      const effectiveLimit = this.applyResultLimits(limit);
      const query = `
        SELECT
          id::text as id,
          LEFT(question, 150) as title,
          'sorucevap' as source_table,
          id::text as source_id,
          LEFT(answer, 200) as excerpt
        FROM public."${TABLE_NAMES.SORUCEVAP}"
        ORDER BY id DESC
        LIMIT $1
      `;

      const result = await this.pool.query(query, [effectiveLimit]);
      return result.rows;
    } catch (error) {
      console.error('[SemanticSearch] Get sample documents error:', error);
      return [];
    }
  }
}

export const semanticSearch = new SemanticSearchService();
