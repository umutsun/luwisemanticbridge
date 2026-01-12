import { Pool } from 'pg';
import pool, { TABLE_NAMES } from '../config/database';
import { lsembPool as defaultLsembPool } from '../config/database.config';
import { LLMManager } from './llm-manager.service';
import { pythonService, SemanticSearchResponse } from './python-integration.service';
import Redis from 'ioredis';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

interface EmbeddingSettings {
  provider: string;
  model: string;
  openaiApiKey?: string;
  googleApiKey?: string;
}

/**
 * Dependencies for SemanticSearchService (Dependency Injection)
 */
export interface SemanticSearchDependencies {
  lsembPool?: Pool;
  customerPool?: Pool;
  llmManager?: LLMManager;
  redis?: Redis;
}

export class SemanticSearchService {
  private pool: Pool;  // lsembPool kullan
  private customerPool: Pool;
  private llmManager: LLMManager;
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
  private enableMessageEmbeddings: boolean = true;
  private enableDocumentEmbeddings: boolean = true;
  private enableScrapeEmbeddings: boolean = true;
  private enableUnifiedEmbeddings: boolean = true;
  private unifiedEmbeddingsPriority: number = 1;
  private unifiedRecordTypes: string[] = []; // Dynamic list from database
  private lastRecordTypesRefresh: number = 0;
  private readonly RECORD_TYPES_CACHE_TTL = 300000; // 5 minutes
  private readonly RAG_SETTINGS_TTL = 5000; // Reduced to 5 seconds
  private readonly EMBEDDING_SETTINGS_TTL = 5000; // Reduced to 5 seconds
  private lastRAGSettingsRefresh: number = 0;
  private lastEmbeddingSettingsRefresh: number = 0;

  // Data source priorities (0-10 scale from frontend)
  private databasePriority: number = 8; // Database content (unified_embeddings tables)
  private documentsPriority: number = 5; // Document embeddings (PDFs, Word docs)
  private chatPriority: number = 3; // Chat message embeddings
  private webPriority: number = 4; // Web scrape embeddings

  // Source table weights for search prioritization (DYNAMIC - no hardcoded tables)
  private sourceTableWeights: Record<string, number> = {};
  private lastWeightsRefresh: number = 0;
  private readonly WEIGHTS_CACHE_TTL = 30000; // 30 seconds

  // 🔧 NEW: Source type hierarchy for ranking (from ragSettings.sourceTypeHierarchy)
  // Default weights based on authority level
  private sourceTypeHierarchy: Record<string, { weight: number; label: string }> = {
    'ozelge': { weight: 75, label: 'Özelge' },
    'kanun': { weight: 80, label: 'Kanun' },
    'teblig': { weight: 65, label: 'Tebliğ' },
    'danistay': { weight: 70, label: 'Danıştay Kararı' },
    'sirkuler': { weight: 60, label: 'Sirküler' },
    'sorucevap': { weight: 50, label: 'Soru-Cevap' },
    'makale': { weight: 40, label: 'Makale' },
    'document': { weight: 30, label: 'Belge' }
  };

  // 🔧 NEW: Ranking formula weights (configurable via settings)
  // Default: 70% semantic similarity + 30% source hierarchy
  private semanticWeight: number = 0.70;
  private hierarchyWeight: number = 0.30;

  // Python semantic search settings
  private usePythonSemanticSearch: boolean = true; // Enable Python by default for performance
  private pythonSemanticSearchFallback: boolean = true; // Fallback to Node.js if Python unavailable

  // Add refresh method for immediate refresh
  async refreshRAGSettingsNow(): Promise<void> {
    console.log('[SemanticSearch] Force refreshing RAG settings...');
    this.lastRAGSettingsRefresh = 0; // Force refresh
    await this.loadRAGSettings();
  }

  // Add refresh method for source table weights
  async refreshSourceTableWeightsNow(): Promise<void> {
    console.log('[SemanticSearch] Force refreshing source table weights...');
    this.lastWeightsRefresh = 0; // Force refresh
    await this.loadSourceTableWeights();
  }

  /**
   * Verify that vector index exists and log performance status
   */
  private async verifyVectorIndex(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT
          i.indexname,
          i.indexdef,
          pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size
        FROM pg_indexes i
        LEFT JOIN pg_stat_user_indexes s
          ON i.schemaname = s.schemaname
          AND i.tablename = s.tablename
          AND i.indexname = s.indexname
        WHERE i.tablename = 'unified_embeddings'
          AND i.indexname LIKE '%embedding%'
          AND i.indexname NOT LIKE '%record_type%'
          AND i.indexname NOT LIKE '%has_embedding%'
        ORDER BY i.indexname
      `);

      if (result.rows.length === 0) {
        console.warn('️ [SemanticSearch] WARNING: No vector index found on unified_embeddings!');
        console.warn('   Performance will be significantly degraded (100x slower)');
        console.warn('   Run: backend/scripts/QUICK-FIX.sql to create index');
      } else {
        const index = result.rows[0];
        const indexType = index.indexname.includes('hnsw') ? 'HNSW'
          : index.indexname.includes('diskann') ? 'DiskANN'
          : index.indexname.includes('ivfflat') ? 'IVFFlat'
          : 'Unknown';

        const performance = indexType === 'HNSW' ? '10-50x faster'
          : indexType === 'DiskANN' ? '50-100x faster'
          : indexType === 'IVFFlat' ? '5-10x faster'
          : 'Unknown';

        console.log(` [SemanticSearch] Vector index active: ${indexType} (${performance})`);
        console.log(`   Index: ${index.indexname}, Size: ${index.index_size}`);
      }
    } catch (error) {
      // Silent - vector index verification is optional
      // console.error('[SemanticSearch] Failed to verify vector index:', error);
    }
  }

  /**
   * Generate a brief LLM summary for a source
   */
  async generateSourceSummary(source: any): Promise<string> {
    try {
      const llmManager = this.llmManager;

      const prompt = `
        Aşağıdaki kaynak içeriğini kısaca özetleyin (maksimum 1 cümle):

        Başlık: ${source.title || 'Başlık yok'}
        İçerik: ${source.content || source.excerpt || 'İçerik yok'}

        Özet:
      `;

      const response = await llmManager.generateChatResponse(prompt, {
        temperature: 0.3,
        maxTokens: 100,
        systemPrompt: 'Kısa ve öz özetler yaz. Tek cümleyle açıkla.'
      });

      return response?.content?.trim() || 'Özet oluşturulamadı';
    } catch (error) {
      console.error('[SemanticSearch] Failed to generate source summary:', error);
      return 'Özet oluşturulamadı';
    }
  }

  /**
   * Load all unique record types from unified_embeddings table
   * Checks multiple metadata fields: 'table', '_sourceTable', 'source_table', and source_table column
   */
  private async loadUnifiedRecordTypes(): Promise<void> {
    try {
      if (!this.pool) {
        console.warn('[SemanticSearch] Database not initialized, cannot load record types');
        return;
      }

      const result = await this.pool.query(`
        SELECT DISTINCT COALESCE(
          metadata->>'table',
          metadata->>'_sourceTable',
          metadata->>'source_table',
          source_table
        ) as record_type
        FROM unified_embeddings
        WHERE (
          metadata->>'table' IS NOT NULL OR
          metadata->>'_sourceTable' IS NOT NULL OR
          metadata->>'source_table' IS NOT NULL OR
          source_table IS NOT NULL
        )
        ORDER BY record_type
      `);

      this.unifiedRecordTypes = result.rows.map(row => row.record_type).filter(t => t);
      this.lastRecordTypesRefresh = Date.now();

      console.log('[SemanticSearch] Loaded unified record types:', this.unifiedRecordTypes);
    } catch (error) {
      console.error('[SemanticSearch] Failed to load unified record types:', error);
      this.unifiedRecordTypes = [];
    }
  }

  /**
   * Refresh record types if cache is expired OR if array is empty (race condition fix)
   */
  private async refreshUnifiedRecordTypes(): Promise<void> {
    // Also refresh if the array is empty (handles race condition at startup)
    if (this.unifiedRecordTypes.length === 0 || Date.now() - this.lastRecordTypesRefresh >= this.RECORD_TYPES_CACHE_TTL) {
      await this.loadUnifiedRecordTypes();
    }
  }

  /**
   * Load source table weights from settings (DYNAMIC - no hardcoded tables)
   */
  private async loadSourceTableWeights(): Promise<void> {
    try {
      if (!this.pool) {
        console.warn('[SemanticSearch] Database not initialized, cannot load source table weights');
        return;
      }

      const result = await this.pool.query(
        `SELECT value FROM settings WHERE key = $1`,
        ['search.sourceTableWeights']
      );

      if (result.rows.length > 0) {
        try {
          this.sourceTableWeights = JSON.parse(result.rows[0].value);
          this.lastWeightsRefresh = Date.now();
          console.log('[SemanticSearch] Loaded source table weights:', this.sourceTableWeights);
        } catch (parseError) {
          console.error('[SemanticSearch] Failed to parse source table weights:', parseError);
          this.sourceTableWeights = {};
        }
      } else {
        // No weights configured, all tables default to 1.0
        this.sourceTableWeights = {};
        console.log('[SemanticSearch] No source table weights configured, using defaults (1.0 for all)');
      }
    } catch (error) {
      console.error('[SemanticSearch] Failed to load source table weights:', error);
      this.sourceTableWeights = {};
    }
  }

  /**
   * Refresh source table weights if cache is expired
   */
  private async refreshSourceTableWeights(): Promise<void> {
    if (Date.now() - this.lastWeightsRefresh < this.WEIGHTS_CACHE_TTL) {
      return;
    }
    await this.loadSourceTableWeights();
  }

  // Embedding cache for performance (L1 cache)
  private embeddingCache: Map<string, number[]> = new Map();
  private readonly EMBEDDING_CACHE_TTL = 300000; // 5 minutes
  private embeddingCacheTimestamps: Map<string, number> = new Map();

  // Redis cache for search results (L2 cache)
  private redis?: Redis;
  private readonly SEARCH_CACHE_TTL = 600; // 10 minutes

  constructor(dependencies?: SemanticSearchDependencies) {
    // Dependency Injection: Allow mocking for tests
    this.pool = dependencies?.lsembPool || defaultLsembPool;
    this.customerPool = dependencies?.customerPool || new Pool({
      connectionString: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'lsemb'}`
    });
    this.llmManager = dependencies?.llmManager || LLMManager.getInstance();
    this.redis = dependencies?.redis;

    // Check vector index on startup
    this.verifyVectorIndex().catch(error => {
      console.error('[SemanticSearch] Failed to verify vector index:', error);
    });

    this.loadRAGSettings().catch(error => {
      console.error('[SemanticSearch] Failed to load RAG settings:', error);
    });

    this.loadEmbeddingSettings().catch(error => {
      console.error('[SemanticSearch] Failed to load embedding settings:', error);
    });

    this.loadUnifiedRecordTypes().catch(error => {
      console.error('[SemanticSearch] Failed to load unified record types:', error);
    });

    this.loadSourceTableWeights().catch(error => {
      console.error('[SemanticSearch] Failed to load source table weights:', error);
    });
  }

  /**
   * Set Redis instance for L2 caching (optional)
   */
  setRedis(redis: Redis): void {
    this.redis = redis;
    console.log('[SemanticSearch] Redis L2 cache enabled');
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

  async getUnifiedRecordTypes(): Promise<string[]> {
    await this.refreshUnifiedRecordTypes();
    return this.unifiedRecordTypes;
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
      if (!this.pool) {
        console.warn('[SemanticSearch] Database not initialized, using default RAG settings');
        return;
      }

      const result = await this.pool.query(
        `SELECT key, value FROM settings WHERE key IN (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
        )`,
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
          'parallel_llm_batch_size',
          'ragSettings.enableMessageEmbeddings',
          'ragSettings.enableDocumentEmbeddings',
          'ragSettings.enableScrapeEmbeddings',
          'ragSettings.enableUnifiedEmbeddings',
          'ragSettings.unifiedEmbeddingsPriority',
          'ragSettings.databasePriority',
          'ragSettings.documentsPriority',
          'ragSettings.chatPriority',
          'ragSettings.webPriority',
          // 🔧 NEW: Source hierarchy and ranking weights
          'ragSettings.sourceTypeHierarchy',
          'ragSettings.semanticWeight',
          'ragSettings.hierarchyWeight',
          'ragSettings.usePythonSemanticSearch',
          'ragSettings.pythonSemanticSearchFallback'
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
          case 'ragSettings.enableMessageEmbeddings': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.enableMessageEmbeddings = parsed;
            }
            break;
          }
          case 'ragSettings.enableDocumentEmbeddings': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.enableDocumentEmbeddings = parsed;
            }
            break;
          }
          case 'ragSettings.enableScrapeEmbeddings': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.enableScrapeEmbeddings = parsed;
            }
            break;
          }
          case 'ragSettings.enableUnifiedEmbeddings': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.enableUnifiedEmbeddings = parsed;
            }
            break;
          }
          case 'ragSettings.unifiedEmbeddingsPriority': {
            const parsedPriority = parseInt(value, 10);
            if (!isNaN(parsedPriority) && parsedPriority >= 1 && parsedPriority <= 10) {
              this.unifiedEmbeddingsPriority = parsedPriority;
            }
            break;
          }
          case 'ragSettings.databasePriority': {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
              this.databasePriority = parsed;
            }
            break;
          }
          case 'ragSettings.documentsPriority': {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
              this.documentsPriority = parsed;
            }
            break;
          }
          case 'ragSettings.chatPriority': {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
              this.chatPriority = parsed;
            }
            break;
          }
          case 'ragSettings.webPriority': {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
              this.webPriority = parsed;
            }
            break;
          }
          case 'ragSettings.usePythonSemanticSearch': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.usePythonSemanticSearch = parsed;
            }
            break;
          }
          case 'ragSettings.pythonSemanticSearchFallback': {
            const parsed = this.parseBooleanSetting(value);
            if (parsed !== undefined) {
              this.pythonSemanticSearchFallback = parsed;
            }
            break;
          }
          // 🔧 NEW: Source type hierarchy from settings
          case 'ragSettings.sourceTypeHierarchy': {
            try {
              const hierarchy = JSON.parse(value);
              if (hierarchy && typeof hierarchy === 'object') {
                this.sourceTypeHierarchy = hierarchy;
                console.log('[SemanticSearch] Loaded sourceTypeHierarchy from settings');
              }
            } catch (e) {
              console.warn('[SemanticSearch] Failed to parse sourceTypeHierarchy:', e);
            }
            break;
          }
          // 🔧 NEW: Ranking formula weights
          case 'ragSettings.semanticWeight': {
            const weight = parseFloat(value);
            if (!isNaN(weight) && weight >= 0 && weight <= 1) {
              this.semanticWeight = weight;
              console.log(`[SemanticSearch] Set semanticWeight to ${weight}`);
            }
            break;
          }
          case 'ragSettings.hierarchyWeight': {
            const weight = parseFloat(value);
            if (!isNaN(weight) && weight >= 0 && weight <= 1) {
              this.hierarchyWeight = weight;
              console.log(`[SemanticSearch] Set hierarchyWeight to ${weight}`);
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
        parallelLLMBatchSize: this.parallelLLMBatchSize,
        enableMessageEmbeddings: this.enableMessageEmbeddings,
        enableDocumentEmbeddings: this.enableDocumentEmbeddings,
        enableScrapeEmbeddings: this.enableScrapeEmbeddings,
        enableUnifiedEmbeddings: this.enableUnifiedEmbeddings,
        unifiedEmbeddingsPriority: this.unifiedEmbeddingsPriority,
        databasePriority: this.databasePriority,
        documentsPriority: this.documentsPriority,
        chatPriority: this.chatPriority,
        webPriority: this.webPriority,
        usePythonSemanticSearch: this.usePythonSemanticSearch,
        pythonSemanticSearchFallback: this.pythonSemanticSearchFallback
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
      if (!this.pool) {
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
      const result = await this.pool.query(
        'SELECT key, value FROM settings WHERE key IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
        [
          'embedding_provider', 'embedding_model', 'openai_api_key', 'google_api_key',
          'llmSettings.embeddingProvider', 'llmSettings.embeddingModel',
          'embeddings.provider', 'embeddings.model', 'openai.apiKey', 'google.apiKey',
          'embeddingProvider', 'embeddingModel', 'embedding.provider', 'embedding.model'
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
      // Check all possible key formats: camelCase, dot notation, underscore
      let providerFromSettings = settings.embeddingProvider || settings.embeddingprovider ||
                                  settings.llmSettingsembeddingProvider ||
                                  settings.embedding_provider || settings.embeddingsprovider || 'google';
      let modelFromSettings = settings.embeddingModel || settings.embeddingmodel ||
                              settings.llmSettingsembeddingModel ||
                              settings.embedding_model || settings.embeddingsmodel || 'text-embedding-004';

      // Normalize provider name
      let provider = this.normalizeProvider(providerFromSettings);

      // Set default model based on provider
      let model = modelFromSettings;
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

      console.log('[SemanticSearch] Embedding settings loaded', {
        provider: this.embeddingSettings.provider,
        model: this.embeddingSettings.model,
        fullModel: `${this.embeddingSettings.provider}/${this.embeddingSettings.model}`,
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
      this.llmManager.updateEmbeddingConfig({
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

      // Create cache key
      const cacheKey = `${text}_${this.embeddingSettings.provider}_${this.embeddingSettings.model}`;
      const now = Date.now();
      const cachedTime = this.embeddingCacheTimestamps.get(cacheKey) || 0;

      // Check cache first
      if (this.embeddingCache.has(cacheKey) && (now - cachedTime) < this.EMBEDDING_CACHE_TTL) {
        console.log(`[SemanticSearch] Using cached embedding for: "${text.substring(0, 30)}..."`);
        return this.embeddingCache.get(cacheKey)!;
      }

      // Use active embedding provider from settings or fall back to default
      const embeddingProvider = this.embeddingSettings.provider || 'openai';
      const embeddingModel = this.embeddingSettings.model;

      console.log(`[SemanticSearch] Generating embedding using ${embeddingProvider} (${embeddingModel})`);
      const embedding = await this.llmManager.generateEmbedding(text, {
        provider: embeddingProvider,
        model: embeddingModel
      });

      // Cache the result
      this.embeddingCache.set(cacheKey, embedding);
      this.embeddingCacheTimestamps.set(cacheKey, now);

      // Clean old cache entries periodically
      if (this.embeddingCache.size > 1000) {
        this.cleanEmbeddingCache();
      }

      console.log(`[SemanticSearch] Generated and cached embedding with ${embedding.length} dimensions`);
      return embedding;
    } catch (error) {
      console.error('[SemanticSearch] Embedding generation failed:', error);
      console.log('[SemanticSearch] ️ CRITICAL: Embedding generation failed - will fall back to keyword search');
      // IMPORTANT: Do NOT use mock embeddings - they produce misleading low similarity scores (10-15%)
      // Instead, throw the error so semanticSearch() can fall back to keyword search
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  private cleanEmbeddingCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, timestamp] of this.embeddingCacheTimestamps) {
      if (now - timestamp > this.EMBEDDING_CACHE_TTL) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.embeddingCache.delete(key);
      this.embeddingCacheTimestamps.delete(key);
    }

    console.log(`[SemanticSearch] Cleaned ${keysToDelete.length} old embedding cache entries`);
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
   * Smart truncate text at sentence boundaries
   */
  private smartTruncate(text: string, maxLength: number = 1500): string {
    if (!text || text.length <= maxLength) {
      return text;
    }

    // Try to cut at sentence boundary
    const truncated = text.substring(0, maxLength);
    const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];

    let lastSentenceEnd = -1;
    for (const ending of sentenceEndings) {
      const pos = truncated.lastIndexOf(ending);
      if (pos > lastSentenceEnd && pos > maxLength * 0.7) {
        // Only use if we found a sentence ending in the last 30% of text
        lastSentenceEnd = pos;
      }
    }

    if (lastSentenceEnd > 0) {
      return truncated.substring(0, lastSentenceEnd + 1).trim();
    }

    // If no sentence ending found, try word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }

    // Fall back to hard cut with ellipsis
    return truncated.trim() + '...';
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
        if (this.pool) {
          const result = await this.pool.query(searchQuery, [query, effectiveLimit]);
          allResults = [...allResults, ...result.rows];
          console.log(`[SemanticSearch] Found ${result.rows.length} keyword results`);
        } else {
          console.log('[SemanticSearch] Database pool not available, keyword search disabled');
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

    // === PYTHON SEMANTIC SEARCH (HIGH PERFORMANCE) ===
    // Try Python service first if enabled - provides 2-5x faster response times
    if (this.usePythonSemanticSearch) {
      try {
        const pythonAvailable = await pythonService.isPythonServiceAvailable();

        if (pythonAvailable) {
          console.log('[SemanticSearch] Using Python semantic search service');
          const startTime = Date.now();

          const pythonResult = await pythonService.semanticSearch(query, {
            limit,
            useCache: true
          });

          if (pythonResult.success && pythonResult.results.length > 0) {
            const elapsedMs = Date.now() - startTime;
            const cached = pythonResult.cached ? ' (CACHED)' : '';
            console.log(`[SemanticSearch] Python search completed: ${pythonResult.results.length} results in ${elapsedMs}ms${cached}`);

            // Transform Python results to match Node.js format
            return pythonResult.results.map(r => ({
              id: r.id,
              title: r.title || r.metadata?.title || r.metadata?.name || 'Untitled',
              excerpt: r.content,
              full_content: r.full_content,
              source_table: r.source_table,
              source_id: r.source_id,
              similarity_score: r.similarity_score,
              final_score: r.final_score,
              keyword_boost: r.keyword_boost,
              metadata: r.metadata
            }));
          }

          // If Python returned no results, fall through to Node.js
          if (this.pythonSemanticSearchFallback) {
            console.log('[SemanticSearch] Python returned no results, falling back to Node.js');
          } else {
            return [];
          }
        } else if (!this.pythonSemanticSearchFallback) {
          console.warn('[SemanticSearch] Python service unavailable and fallback disabled');
          return [];
        }
      } catch (pythonError: any) {
        console.warn('[SemanticSearch] Python semantic search error, falling back to Node.js:', pythonError.message);
        if (!this.pythonSemanticSearchFallback) {
          throw pythonError;
        }
      }
    }
    // === END PYTHON SEMANTIC SEARCH ===

    try {
      await this.refreshRAGSettings();
      await this.refreshEmbeddingSettings();
      // Note: refreshSourceTableWeights() is called later after record types are loaded

      const effectiveLimit = this.applyResultLimits(limit);

      if (!this.pool) {
        console.log('[SemanticSearch] Database pool not available, using keyword search fallback');
        return this.keywordSearch(query, effectiveLimit);
      }

      const embeddingCheck = await this.pool.query(`
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

      // Enhanced keyword matching: split query into words for better matching
      const queryWords = query.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2) // Skip very short words
        .slice(0, 10); // Limit to 10 keywords max

      const keywordPattern = `%${query}%`;
      const keywordPatterns = queryWords.map(w => `%${w}%`);
      const keywordPatternsJSON = JSON.stringify(keywordPatterns);

      // Refresh record types cache if needed
      await this.refreshUnifiedRecordTypes();

      // Refresh source table weights cache
      await this.refreshSourceTableWeights();

      // Build WHERE clause based on enabled record types
      const enabledTypes: string[] = [];
      if (this.enableMessageEmbeddings) enabledTypes.push('message_embeddings');
      if (this.enableDocumentEmbeddings) enabledTypes.push('document_embeddings');
      if (this.enableScrapeEmbeddings) enabledTypes.push('scrape_embeddings');

      // DYNAMIC: Add all unified record types from database (not hardcoded!)
      // IMPORTANT: Filter out tables with weight = 0 (disabled by user)
      // 🔧 FIX: When databasePriority = 0, skip ALL unified_embeddings sources entirely
      if (this.enableUnifiedEmbeddings && this.unifiedRecordTypes.length > 0 && this.databasePriority > 0) {
        const activeTypes = this.unifiedRecordTypes.filter(tableType => {
          const weight = this.sourceTableWeights[tableType];
          // Include if weight is undefined (default 1.0) or > 0
          return weight === undefined || weight > 0;
        });

        if (activeTypes.length < this.unifiedRecordTypes.length) {
          const excludedTypes = this.unifiedRecordTypes.filter(t => !activeTypes.includes(t));
          console.log('[SemanticSearch] Excluding tables with weight=0:', excludedTypes);
        }

        enabledTypes.push(...activeTypes);
      } else if (this.databasePriority === 0) {
        console.log('[SemanticSearch] 🔒 databasePriority=0: Skipping ALL unified_embeddings sources');
      }

      // If no types enabled, return empty results
      if (enabledTypes.length === 0) {
        console.log('[SemanticSearch] All record types are disabled in settings', {
          enableUnifiedEmbeddings: this.enableUnifiedEmbeddings,
          unifiedRecordTypesCount: this.unifiedRecordTypes.length,
          unifiedRecordTypes: this.unifiedRecordTypes,
          enableMessageEmbeddings: this.enableMessageEmbeddings,
          enableDocumentEmbeddings: this.enableDocumentEmbeddings,
          enableScrapeEmbeddings: this.enableScrapeEmbeddings
        });
        return [];
      }

      console.log('[SemanticSearch] Searching with enabled types:', enabledTypes, {
        enableUnifiedEmbeddings: this.enableUnifiedEmbeddings,
        unifiedRecordTypesCount: this.unifiedRecordTypes.length,
        enableDocumentEmbeddings: this.enableDocumentEmbeddings,
        enableScrapeEmbeddings: this.enableScrapeEmbeddings,
        // 🔧 NEW: Log priorities for debugging
        databasePriority: this.databasePriority,
        documentsPriority: this.documentsPriority,
        webPriority: this.webPriority
      });

      // Build CASE statement for priority boost - only for unified record types
      const unifiedTypesSQL = this.unifiedRecordTypes.length > 0
        ? this.unifiedRecordTypes.map(t => `'${t}'`).join(', ')
        : "''";  // Empty placeholder if no unified types

      // OPTIMIZED QUERY: Uses CTE to calculate distance once, leverages DiskANN index
      // Performance improvement: 10-100x faster on large datasets
      // Searches across: unified_embeddings, document_embeddings, and scrape_embeddings tables

      // Build dynamic UNION query based on enabled sources
      const unionParts: string[] = [];

      // Always include unified_embeddings if enabled types exist for it
      // 🔧 FIX: Also check databasePriority > 0
      const unifiedEnabledTypes = enabledTypes.filter(t =>
        !['document_embeddings', 'scrape_embeddings', 'message_embeddings'].includes(t)
      );

      if (this.enableUnifiedEmbeddings && this.databasePriority > 0 && (unifiedEnabledTypes.length > 0 || enabledTypes.includes('message_embeddings'))) {
        const allUnifiedTypes = [...unifiedEnabledTypes];
        if (enabledTypes.includes('message_embeddings')) {
          allUnifiedTypes.push('message_embeddings');
        }

        if (allUnifiedTypes.length > 0) {
          const unifiedTypePlaceholders = allUnifiedTypes.map(t => `'${t}'`).join(', ');
          unionParts.push(`
            SELECT
              ue.id,
              ue.metadata,
              ue.content,
              ue.source_id::text,
              ue.embedding <=> $1::vector AS distance,
              1 - (ue.embedding <=> $1::vector) AS similarity_score,
              COALESCE(ue.metadata->>'table', ue.metadata->>'_sourceTable', ue.metadata->>'source_table', ue.source_table) AS record_type
            FROM unified_embeddings ue
            WHERE ue.embedding IS NOT NULL
              AND COALESCE(ue.metadata->>'table', ue.metadata->>'_sourceTable', ue.metadata->>'source_table', ue.source_table) IN (${unifiedTypePlaceholders})
          `);
        }
      }

      // Include document_embeddings if enabled
      if (this.enableDocumentEmbeddings && enabledTypes.includes('document_embeddings')) {
        unionParts.push(`
          SELECT
            de.id,
            de.metadata,
            de.chunk_text AS content,
            de.document_id::text AS source_id,
            de.embedding <=> $1::vector AS distance,
            1 - (de.embedding <=> $1::vector) AS similarity_score,
            'document_embeddings' AS record_type
          FROM document_embeddings de
          WHERE de.embedding IS NOT NULL
        `);
        console.log('[SemanticSearch] Including document_embeddings in search');
      }

      // Include scrape_embeddings if enabled - use unified_embeddings with source_table = 'scrapes'
      // (scrape_embeddings table has been migrated to unified_embeddings)
      if (this.enableScrapeEmbeddings && enabledTypes.includes('scrape_embeddings')) {
        unionParts.push(`
          SELECT
            ue.id,
            ue.metadata,
            ue.content,
            ue.source_id::text AS source_id,
            ue.embedding <=> $1::vector AS distance,
            1 - (ue.embedding <=> $1::vector) AS similarity_score,
            'scrape_embeddings' AS record_type
          FROM unified_embeddings ue
          WHERE ue.embedding IS NOT NULL
            AND ue.source_table = 'scrapes'
        `);
        console.log('[SemanticSearch] Including scrape_embeddings (from unified_embeddings) in search');
      }

      // If no sources are enabled, return empty
      if (unionParts.length === 0) {
        console.log('[SemanticSearch] No embedding sources enabled');
        return [];
      }

      // 🔧 NEW: Log which source tables are being queried
      console.log(`[SemanticSearch] 🔍 Building search query with ${unionParts.length} source table(s)`);

      const combinedQuery = unionParts.join(' UNION ALL ');

      const searchQuery = `
        WITH ranked_results AS (
          SELECT * FROM (
            ${combinedQuery}
          ) combined
          ORDER BY distance
          LIMIT $4 * 2
        )
        SELECT
          rr.id::text as id,
          LEFT(COALESCE(rr.metadata->>'title', rr.content::text), 200) as title,
          LEFT(COALESCE(rr.content, rr.metadata->>'content', rr.metadata->>'text', ''), 1500) as excerpt,
          COALESCE(rr.content, rr.metadata->>'content', rr.metadata->>'text', '') as full_content,
          COALESCE(rr.record_type, 'unknown') as source_table,
          rr.source_id,
          rr.metadata,
          rr.record_type,
          rr.similarity_score,
          -- Basic keyword boost (exact phrase match) - kept simple for SQL performance
          CASE
            WHEN $5::boolean AND (rr.content ILIKE $3 OR rr.metadata->>'content' ILIKE $3 OR rr.metadata->>'text' ILIKE $3) THEN 0.10
            WHEN $5::boolean AND rr.metadata->>'title' ILIKE $3 THEN 0.05
            ELSE 0
          END as keyword_boost,
          CASE
            WHEN rr.record_type IN (${unifiedTypesSQL})
            THEN ${this.unifiedEmbeddingsPriority} * 0.1
            ELSE 0
          END as priority_boost
        FROM ranked_results rr
        WHERE rr.similarity_score >= $2
        ORDER BY rr.similarity_score DESC
        LIMIT $4 * 2
      `;

      console.time(queryId);
      queryTimerStarted = true;

      // Hybrid search combines semantic + keyword boost
      // If hybrid search is disabled, don't apply keyword boost even if it's enabled
      const useKeywordBoost = this.enableHybridSearch && this.enableKeywordBoost;

      console.log('[SemanticSearch] Search mode:', {
        enableHybridSearch: this.enableHybridSearch,
        enableKeywordBoost: this.enableKeywordBoost,
        actualKeywordBoost: useKeywordBoost
      });

      const result = await this.pool.query(searchQuery, [
        JSON.stringify(queryEmbedding),
        this.similarityThreshold,
        keywordPattern,
        effectiveLimit,
        useKeywordBoost
      ]);
      console.timeEnd(queryId);

      // Map results first, then add summaries
      const sources = result.rows.map(row => {
        // Smart truncate excerpt at sentence boundary
        const smartExcerpt = this.smartTruncate(row.excerpt || '', 1500);

        // Extract keywords from content, title, and source table
        const keywords = this.extractSmartKeywords(smartExcerpt, row.title || '', row.source_table || '', query);

        // Get source table weight (default to 1.0 if not configured)
        const sourceTable = row.source_table || row.record_type;
        const tableWeight = this.sourceTableWeights[sourceTable] ?? 1.0;

        // Get data source priority based on record type (0-10 scale, normalized to 0-1)
        const dataSourcePriority = this.getDataSourcePriority(sourceTable);

        // Calculate scores
        // similarity_score is the pure semantic similarity (0-1 range)
        // keyword_boost and priority_boost are additional signals (0-1 range each)
        // tableWeight is the user-configured weight for this source table (0-1 range)
        // dataSourcePriority is the category-level priority (database, documents, chat, web)
        const pureSimilarity = parseFloat(row.similarity_score);
        const keywordBoost = parseFloat(row.keyword_boost || 0);
        const priorityBoost = parseFloat(row.priority_boost || 0);

        // Apply table weight AND data source priority to similarity score
        // Data source priority is normalized from 0-10 to 0-1 range
        const weightedSimilarity = pureSimilarity * tableWeight * dataSourcePriority;

        // 🔧 NEW: Get source hierarchy weight (0-100 scale from settings)
        // Normalize source table name for hierarchy lookup
        const normalizedSourceType = this.normalizeSourceType(sourceTable);
        const hierarchyEntry = this.sourceTypeHierarchy[normalizedSourceType];
        const hierarchyScore = hierarchyEntry ? hierarchyEntry.weight / 100 : 0.3; // Default 30% for unknown

        // Display score: Use weighted semantic similarity as the main score (0-100)
        // This gives users honest feedback about relevance with table prioritization
        const displayScore = Math.round(weightedSimilarity * 100);

        // 🔧 NEW: Combined score with configurable weights
        // Default: 70% semantic similarity + 30% source hierarchy
        // Formula: (semantic * semanticWeight) + (hierarchy * hierarchyWeight) + (keyword * 0.1)
        const combinedScore = Math.min(
          (pureSimilarity * this.semanticWeight + hierarchyScore * this.hierarchyWeight + keywordBoost * 0.1) * 100,
          100
        );

        // Format title and excerpt from metadata for better display
        const formatted = this.formatSearchContent(row);

        return {
          ...row,
          title: formatted.title, // Human-readable title from metadata
          score: displayScore, // Display weighted semantic similarity
          similarity_score: weightedSimilarity, // Keep weighted 0-1 value
          relevanceScore: combinedScore, // Combined score for ranking
          _debug: {
            pureSimilarity: Math.round(pureSimilarity * 100),
            tableWeight: tableWeight,
            dataSourcePriority: dataSourcePriority,
            weightedSimilarity: displayScore,
            keywordBoost: Math.round(keywordBoost * 100),
            priorityBoost: Math.round(priorityBoost * 100),
            // 🔧 NEW: Hierarchy debug info
            hierarchyScore: Math.round(hierarchyScore * 100),
            normalizedSourceType: normalizedSourceType,
            semanticWeight: this.semanticWeight,
            hierarchyWeight: this.hierarchyWeight,
            combined: Math.round(combinedScore)
          },
          content: formatted.excerpt, // Human-readable content from metadata
          excerpt: formatted.excerpt, // Human-readable excerpt from metadata
          keywords: keywords,
          sourceType: this.getSourceDisplayName(row.source_table || row.record_type)
        };
      });

      // PERFORMANCE: Skip individual LLM summaries - use excerpt instead
      // Summary generation was causing 25+ LLM calls per search (30-90s delay)
      // Excerpt already contains the relevant content
      sources.forEach(source => {
        source.summary = source.excerpt?.substring(0, 200) || '';
      });

      console.log(`[SemanticSearch] Returned ${sources.length} sources (fast mode - no LLM summaries)`);

      return sources;
    } catch (error) {
      if (queryTimerStarted) {
        console.timeEnd(queryId);
      }
      console.error('[SemanticSearch] Semantic search error:', error);

      // Only fall back to keyword search if hybrid search is enabled
      if (this.enableHybridSearch) {
        console.log('[SemanticSearch] Hybrid search enabled, falling back to keyword search...');
        const keywordResults = await this.keywordSearch(query, limit);
        console.log(`[SemanticSearch] Keyword search returned ${keywordResults.length} results`);
        if (keywordResults.length > 0) {
          console.log(`[SemanticSearch] First keyword result:`, {
            title: keywordResults[0].title,
            score: keywordResults[0].score,
            source_table: keywordResults[0].source_table
          });
        }
        return keywordResults;
      } else {
        console.log('[SemanticSearch] Hybrid search disabled, no keyword fallback');
        return [];
      }
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

  /**
   * 🔧 NEW: Normalize source table name to hierarchy key
   * Maps csv_ozelge, ozelgeler, etc. to 'ozelge' for hierarchy lookup
   */
  private normalizeSourceType(sourceTable: string): string {
    const normalized = (sourceTable || '').toLowerCase()
      .replace(/^csv_/, '')  // Remove csv_ prefix
      .replace(/_embeddings$/, '')  // Remove _embeddings suffix
      .replace(/ler$|ları$|lari$/, '')  // Remove Turkish plural suffixes
      .replace(/kararlari$|kararlari$/, '')  // Remove 'kararlari'
      .trim();

    // Map common variations to standard hierarchy keys
    const mappings: Record<string, string> = {
      'ozelge': 'ozelge',
      'ozelgeler': 'ozelge',
      'danistay': 'danistay',
      'danistaykarar': 'danistay',
      'teblig': 'teblig',
      'tebligler': 'teblig',
      'kanun': 'kanun',
      'kanunlar': 'kanun',
      'sirkuler': 'sirkuler',
      'sorucevap': 'sorucevap',
      'makale': 'makale',
      'makaleler': 'makale',
      'document': 'document',
      'unified': 'document'
    };

    return mappings[normalized] || normalized;
  }

  private getSourceDisplayName(sourceTable: string): string {
    switch (sourceTable) {
      case 'unified_embeddings':
        return 'Veritabanı';
      case 'document_embeddings':
        return 'Dokümanlar';
      case 'scrape_embeddings':
        return 'Web İçeriği';
      case 'message_embeddings':
        return 'Soru-Cevap';
      case 'sorucevap':
        return 'Soru-Cevap';
      case 'makaleler':
        return 'Makaleler';
      case 'ozelgeler':
        return 'Özelgeler';
      case 'danistaykararlari':
        return 'Danıştay Kararları';
      default:
        return sourceTable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  /**
   * Get data source priority (0-1 range) based on record type
   * Maps record types to their data source category and applies priority
   */
  private getDataSourcePriority(sourceTable: string): number {
    // Normalize the source table name
    const normalizedTable = (sourceTable || '').toLowerCase();

    // Document embeddings (PDFs, Word docs, etc.)
    if (normalizedTable === 'document_embeddings' || normalizedTable.includes('document')) {
      // documentsPriority is 0-10, normalize to 0.1-1.0 (never completely zero to avoid multiplication issues)
      return Math.max(0.1, this.documentsPriority / 10);
    }

    // Web scrape embeddings
    if (normalizedTable === 'scrape_embeddings' || normalizedTable.includes('scrape') || normalizedTable.includes('web')) {
      return Math.max(0.1, this.webPriority / 10);
    }

    // Chat/message embeddings
    if (normalizedTable === 'message_embeddings' || normalizedTable.includes('message') || normalizedTable.includes('chat')) {
      return Math.max(0.1, this.chatPriority / 10);
    }

    // Everything else is database content (unified_embeddings, sorucevap, makaleler, ozelgeler, etc.)
    return Math.max(0.1, this.databasePriority / 10);
  }

  /**
   * Extract human-readable title and excerpt from metadata and content
   * Transforms raw "key: value" format into natural language display
   */
  private formatSearchContent(row: any): { title: string; excerpt: string } {
    const metadata = row.metadata || {};
    const sourceTable = (row.source_table || row.record_type || '').toLowerCase();

    let title = '';
    let excerpt = '';

    // Source-specific formatting
    if (sourceTable === 'maddeler') {
      // Maddeler table - use orijinal_metin and madde info
      const maddeNo = metadata.madde_numarasi || '';
      const mevzuatId = metadata.mevzuat_id || '';
      const orijinalMetin = metadata.orijinal_metin || '';
      const ozet = metadata.ozet || '';

      title = maddeNo ? `Madde ${maddeNo}` : (ozet || 'Madde');
      if (mevzuatId) title += ` (${mevzuatId})`;

      excerpt = orijinalMetin || ozet || row.excerpt || '';
    }
    else if (sourceTable === 'mevzuat') {
      // Mevzuat table - use mevzuat_adi and details
      const mevzuatAdi = metadata.mevzuat_adi || metadata.title || '';
      const mevzuatTipi = metadata.mevzuat_tipi || '';
      const durum = metadata.durum || '';
      const kaynakUrl = metadata.kaynak_url || '';

      title = mevzuatAdi || 'Mevzuat';
      if (mevzuatTipi) title = `${mevzuatTipi}: ${title}`;

      // Build natural excerpt
      const excerptParts = [];
      if (durum) excerptParts.push(`Durum: ${durum}`);
      if (kaynakUrl) excerptParts.push(`Kaynak: ${kaynakUrl}`);
      excerpt = excerptParts.length > 0 ? excerptParts.join(' | ') : (row.excerpt || '');
    }
    else if (sourceTable === 'sorucevap' || sourceTable.includes('soru')) {
      // Q&A format
      title = metadata.question || metadata.soru || row.title || 'Soru-Cevap';
      excerpt = metadata.answer || metadata.cevap || row.excerpt || '';
    }
    else if (sourceTable === 'ozelgeler') {
      // Özelge format
      title = metadata.ozelge_no || metadata.konu || row.title || 'Özelge';
      excerpt = metadata.icerik || metadata.ozet || row.excerpt || '';
    }
    else if (sourceTable === 'danistaykararlari' || sourceTable.includes('karar')) {
      // Court decision format
      const daire = metadata.daire || '';
      const kararNo = metadata.karar_no || '';
      title = kararNo ? `${daire} ${kararNo}` : (metadata.konu || row.title || 'Danıştay Kararı');
      excerpt = metadata.karar || metadata.ozet || row.excerpt || '';
    }
    else if (sourceTable === 'makaleler') {
      // Article format
      title = metadata.baslik || metadata.title || row.title || 'Makale';
      excerpt = metadata.icerik || metadata.ozet || row.excerpt || '';
    }
    else {
      // Generic fallback - try common metadata fields
      title = metadata.title || metadata.baslik || metadata.name || metadata.konu || '';
      excerpt = metadata.content || metadata.icerik || metadata.text || metadata.ozet || '';

      // If still no title/excerpt, try to clean up the raw content
      if (!title && row.title) {
        // Check if title is in "key: value" format and extract meaningful part
        if (row.title.includes(':') && row.title.includes('\n')) {
          // Multiple key:value pairs - extract first meaningful value
          const lines = row.title.split('\n');
          for (const line of lines) {
            const parts = line.split(':');
            if (parts.length >= 2) {
              const value = parts.slice(1).join(':').trim();
              if (value.length > 10 && !value.includes('\n')) {
                title = value.substring(0, 150);
                break;
              }
            }
          }
        }
        if (!title) title = row.title;
      }

      if (!excerpt && row.excerpt) {
        // Check if excerpt is in "key: value" format
        if (row.excerpt.includes(':') && row.excerpt.includes('\n')) {
          // Find the most content-like field
          const lines = row.excerpt.split('\n');
          const contentFields = ['orijinal_metin', 'icerik', 'content', 'text', 'cevap', 'answer', 'ozet'];

          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim().toLowerCase();
              const value = line.substring(colonIndex + 1).trim();

              if (contentFields.some(f => key.includes(f)) && value.length > 20) {
                excerpt = value;
                break;
              }
            }
          }

          // If no content field found, take the longest value
          if (!excerpt) {
            let longestValue = '';
            for (const line of lines) {
              const colonIndex = line.indexOf(':');
              if (colonIndex > 0) {
                const value = line.substring(colonIndex + 1).trim();
                if (value.length > longestValue.length) {
                  longestValue = value;
                }
              }
            }
            excerpt = longestValue || row.excerpt;
          }
        } else {
          excerpt = row.excerpt;
        }
      }
    }

    // Final cleanup
    title = (title || 'Kaynak').substring(0, 200).trim();
    excerpt = (excerpt || '').substring(0, 1500).trim();

    return { title, excerpt };
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

  // ============================================
  // REDIS L2 CACHE METHODS (Performance Optimization)
  // ============================================

  /**
   * Generate deterministic cache key for search query
   */
  private generateSearchCacheKey(query: string, limit: number, threshold: number): string {
    const normalized = {
      query: query.trim().toLowerCase(),
      limit,
      threshold: parseFloat(threshold.toFixed(3)),
    };
    return crypto
      .createHash('md5')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  /**
   * Get search results from Redis cache (L2)
   */
  private async getSearchFromCache(cacheKey: string): Promise<any[] | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(`search:result:${cacheKey}`);
      if (cached) {
        // Increment hit count for analytics
        await this.redis.hincrby('search:cache:stats', 'hits', 1);
        return JSON.parse(cached);
      }

      await this.redis.hincrby('search:cache:stats', 'misses', 1);
      return null;
    } catch (error) {
      console.error('[Cache] Get error:', error);
      return null;
    }
  }

  /**
   * Cache search results in Redis (L2)
   */
  private async cacheSearchResults(cacheKey: string, results: any[]): Promise<void> {
    if (!this.redis || results.length === 0) return;

    try {
      await this.redis.setex(
        `search:result:${cacheKey}`,
        this.SEARCH_CACHE_TTL,
        JSON.stringify(results)
      );
    } catch (error) {
      console.error('[Cache] Set error:', error);
    }
  }

  /**
   * Track search analytics in Redis
   */
  private async trackSearchAnalytics(query: string, responseTime: number): Promise<void> {
    if (!this.redis) return;

    try {
      const date = new Date().toISOString().split('T')[0];

      // Increment total search count
      await this.redis.hincrby(`search:stats:${date}`, 'total', 1);

      // Track popular queries
      await this.redis.zincrby('search:popular:24h', 1, query);
      await this.redis.expire('search:popular:24h', 86400);

      // Track response times
      await this.redis.lpush(`search:times:${date}`, responseTime);
      await this.redis.ltrim(`search:times:${date}`, 0, 999);
      await this.redis.expire(`search:times:${date}`, 86400);
    } catch (error) {
      console.error('[Analytics] Track error:', error);
    }
  }

  /**
   * Get popular searches from Redis
   */
  async getPopularSearches(limit: number = 10, timeframe: string = '24h'): Promise<Array<{ query: string; count: number }>> {
    if (!this.redis) return [];

    try {
      const results = await this.redis.zrevrange(
        `search:popular:${timeframe}`,
        0,
        limit - 1,
        'WITHSCORES'
      );

      const popular: Array<{ query: string; count: number }> = [];
      for (let i = 0; i < results.length; i += 2) {
        popular.push({
          query: results[i],
          count: parseInt(results[i + 1]),
        });
      }

      return popular;
    } catch (error) {
      console.error('[Popular] Get error:', error);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStatistics(): Promise<{ hits: number; misses: number; hitRate: number }> {
    if (!this.redis) {
      return { hits: 0, misses: 0, hitRate: 0 };
    }

    try {
      const stats = await this.redis.hgetall('search:cache:stats');
      const hits = parseInt(stats.hits || '0');
      const misses = parseInt(stats.misses || '0');
      const total = hits + misses;

      return {
        hits,
        misses,
        hitRate: total > 0 ? (hits / total) * 100 : 0,
      };
    } catch (error) {
      console.error('[CacheStats] Error:', error);
      return { hits: 0, misses: 0, hitRate: 0 };
    }
  }
}

export const semanticSearch = new SemanticSearchService();
