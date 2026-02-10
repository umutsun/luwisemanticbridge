/**
 * Python Integration Service
 * Handles communication with Python microservices
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { SettingsService } from './settings.service';

export interface CrawlOptions {
  mode?: 'llm' | 'auto' | 'schema';
  extractionPrompt?: string;
  model?: string;
  provider?: string;
  maxDepth?: number;
  followLinks?: boolean;
  contentType?: string;
  schema?: any;
  cssSelectors?: Record<string, string>;
  jsCode?: string;
  waitFor?: string;
  screenshot?: boolean;
  timeout?: number;
}

export interface CrawlResult {
  success: boolean;
  url: string;
  title?: string;
  content?: string;
  markdown?: string;
  extractedContent?: any;
  metadata: Record<string, any>;
  links?: string[];
  images?: string[];
}

export interface VectorizerConfig {
  name: string;
  sourceTable: string;
  sourceColumns: string[];
  destinationTable: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  scheduleInterval?: string;
}

export interface SemanticSearchOptions {
  limit?: number;
  useCache?: boolean;
  debug?: boolean;  // Include detailed debug info (_debug key in response)
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  full_content?: string;
  title?: string;
  source_table: string;
  source_type: string;
  source_id?: string;
  similarity_score: number;
  keyword_boost: number;
  source_priority: number;
  final_score: number;
  rerank_score?: number;  // Jina reranker score (0-1) when reranking is enabled
  rerank_base?: number;   // Raw Jina score * 100 (percentage)
  rerank_priority_weighted?: number;  // rerank_base * source_priority * table_weight
  table_weight?: number;  // Table weight from settings (0-1)
  pre_rerank_score?: number;  // Pre-rerank final_score (for debugging)
  metadata?: Record<string, any>;
}

// Article query detection result (for article anchoring)
export interface ArticleQuery {
  detected: boolean;
  law_code?: string;          // e.g., "VUK", "GVK", "KDVK"
  article_number?: string;    // e.g., "114", "40", "29"
  intent?: string;            // e.g., "definition", "application"
  exact_match_found?: boolean;
  exact_match_count?: number;
  wrong_match_count?: number;
  filter_action?: string;     // e.g., "removed_wrong_articles", "kept_all"
}

export interface SemanticSearchResponse {
  success: boolean;
  cached: boolean;
  query: string;
  results: SemanticSearchResult[];
  total: number;
  timings?: {
    embedding_ms?: number;
    vector_search_ms?: number;
    scoring_ms?: number;
    rerank_ms?: number;
    total_ms: number;
    cache?: string;
  };
  settings?: {
    similarity_threshold: number;
    hybrid_search: boolean;
    keyword_boost: boolean;
    rerank_enabled?: boolean;
    rerank_provider?: string;
    rerank_applied?: boolean;
  };
  // Article anchoring metadata - tells frontend if user asked about specific law article
  article_query?: ArticleQuery;
  error?: string;
  _debug?: {
    penalty_config?: Record<string, any>;
    penalty_stats?: Record<string, number>;
    embedding_provider?: string;
    query_embedding_dims?: number;
    raw_results_count?: number;
    scored_results_count?: number;
    filtered_count?: number;
    top_penalized?: Array<{
      id: string;
      title: string;
      source_table: string;
      retrieval_penalty: number;
      temporal_reason?: string;
      toc_reason?: string;
    }>;
    search_mode?: string;
    source_table_weights?: Record<string, number>;
    article_anchoring?: {
      enabled: boolean;
      target_law?: string;
      target_article?: string;
      exact_match_found?: boolean;
      results?: Array<{
        id: string;
        match_type: string;
        reason: string;
      }>;
    };
  };
}

export class PythonIntegrationService {
  private static instance: PythonIntegrationService;
  private axiosClient: AxiosInstance;
  private pythonServiceUrl: string;
  private internalApiKey: string;
  private isAvailable: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: number = 30000; // 30 seconds

  private constructor() {
    this.pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002';
    this.internalApiKey = process.env.INTERNAL_API_KEY || 'default-dev-key';

    this.axiosClient = axios.create({
      baseURL: this.pythonServiceUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.internalApiKey
      }
    });

    // Start health check
    this.startHealthCheck();
  }

  public static getInstance(): PythonIntegrationService {
    if (!PythonIntegrationService.instance) {
      PythonIntegrationService.instance = new PythonIntegrationService();
    }
    return PythonIntegrationService.instance;
  }

  private async startHealthCheck() {
    // Initial health check
    await this.checkHealth();

    // Periodic health checks
    setInterval(async () => {
      await this.checkHealth();
    }, this.healthCheckInterval);
  }

  private async checkHealth(): Promise<boolean> {
    try {
      const response = await this.axiosClient.get('/health');
      this.isAvailable = response.data.status === 'healthy';
      this.lastHealthCheck = new Date();

      if (this.isAvailable) {
        logger.info('Python service is healthy');
      }

      return this.isAvailable;
    } catch (error) {
      this.isAvailable = false;
      logger.warn('Python service is not available:', error.message);
      return false;
    }
  }

  public async isPythonServiceAvailable(): Promise<boolean> {
    // If last check was recent, use cached value
    if (this.lastHealthCheck &&
        Date.now() - this.lastHealthCheck.getTime() < 5000) {
      return this.isAvailable;
    }

    // Otherwise, check now
    return await this.checkHealth();
  }

  // ============= Crawl4AI Methods =============

  public async crawlWithAI(url: string, options: CrawlOptions): Promise<CrawlResult> {
    try {
      // Check if Python service is available
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.post('/api/python/crawl', {
        url,
        mode: options.mode || 'auto',
        extraction_prompt: options.extractionPrompt,
        model: options.model || 'gpt-4',
        provider: options.provider || 'openai',
        max_depth: options.maxDepth || 1,
        follow_links: options.followLinks || false,
        content_type: options.contentType || 'all',
        schema: options.schema,
        css_selectors: options.cssSelectors,
        js_code: options.jsCode,
        wait_for: options.waitFor,
        screenshot: options.screenshot || false,
        timeout: options.timeout || 30
      });

      logger.info(`Successfully crawled ${url} with Crawl4AI`);
      return response.data;

    } catch (error) {
      logger.error('Crawl4AI service error:', error);
      throw error;
    }
  }

  public async batchCrawl(urls: string[], options: CrawlOptions): Promise<string> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.post('/api/python/crawl/batch', {
        urls,
        mode: options.mode || 'auto',
        extraction_prompt: options.extractionPrompt,
        parallel: true
      });

      return response.data.job_id;

    } catch (error) {
      logger.error('Batch crawl error:', error);
      throw error;
    }
  }

  public async getCrawlStatus(jobId: string): Promise<any> {
    try {
      const response = await this.axiosClient.get(`/api/python/crawl/status/${jobId}`);
      return response.data;
    } catch (error) {
      logger.error('Get crawl status error:', error);
      throw error;
    }
  }

  // ============= pgai Methods =============

  public async getPgaiStatus(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.get('/api/python/pgai/status');
      return response.data;

    } catch (error) {
      logger.error('pgai status error:', error);
      throw error;
    }
  }

  public async createVectorizer(config: VectorizerConfig): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.post('/api/python/pgai/vectorizer/create', {
        name: config.name,
        source_table: config.sourceTable,
        source_columns: config.sourceColumns,
        destination_table: config.destinationTable,
        embedding_model: config.embeddingModel || 'text-embedding-3-large',
        embedding_dimensions: config.embeddingDimensions || 1536,
        chunk_size: config.chunkSize || 1000,
        chunk_overlap: config.chunkOverlap || 200,
        schedule_interval: config.scheduleInterval || '5 minutes'
      });

      logger.info(`Vectorizer ${config.name} created successfully`);
      return response.data;

    } catch (error) {
      logger.error('Create vectorizer error:', error);
      throw error;
    }
  }

  public async deleteVectorizer(name: string): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.delete(`/api/python/pgai/vectorizer/${name}`);
      return response.data;

    } catch (error) {
      logger.error('Delete vectorizer error:', error);
      throw error;
    }
  }

  public async getVectorizerStats(name: string): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.get(`/api/python/pgai/vectorizer/${name}/stats`);
      return response.data;

    } catch (error) {
      logger.error('Get vectorizer stats error:', error);
      throw error;
    }
  }

  public async getPgaiRecommendations(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.get('/api/python/pgai/recommendations');
      return response.data;

    } catch (error) {
      logger.error('Get pgai recommendations error:', error);
      throw error;
    }
  }

  public async getPgaiWorkerStatus(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.get('/api/python/pgai/worker/status');
      return response.data;

    } catch (error) {
      logger.error('Get pgai worker status error:', error);
      throw error;
    }
  }

  public async startPgaiWorker(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.post('/api/python/pgai/worker/start');
      logger.info('pgai worker started successfully');
      return response.data;

    } catch (error) {
      logger.error('Start pgai worker error:', error);
      throw error;
    }
  }

  public async stopPgaiWorker(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.post('/api/python/pgai/worker/stop');
      logger.info('pgai worker stopped successfully');
      return response.data;

    } catch (error) {
      logger.error('Stop pgai worker error:', error);
      throw error;
    }
  }

  // ============= Fallback Support =============

  public async crawlWithFallback(
    url: string,
    options: CrawlOptions,
    fallbackService?: any
  ): Promise<any> {
    try {
      // Try Python service first
      if (await this.isPythonServiceAvailable()) {
        try {
          return await this.crawlWithAI(url, options);
        } catch (pythonError) {
          logger.warn('Python crawl failed, trying fallback:', pythonError.message);
        }
      }

      // Fallback to existing Node.js scraper
      if (fallbackService) {
        logger.info('Using Node.js fallback scraper');
        return await fallbackService.scrape(url, {
          mode: options.mode === 'auto' ? 'dynamic' : 'static',
          maxDepth: options.maxDepth,
          followLinks: options.followLinks,
          generateEmbeddings: true,
          saveToDb: true,
          waitForSelector: options.waitFor,
          customHeaders: {},
          includeImages: true,
          includePdfs: false
        });
      }

      throw new Error('No scraping service available');

    } catch (error) {
      logger.error('Crawl with fallback error:', error);
      throw error;
    }
  }

  // ============= Service Management =============

  public async getDetailedHealth(): Promise<any> {
    try {
      const response = await this.axiosClient.get('/health/detailed');
      return response.data;
    } catch (error) {
      return {
        status: 'unavailable',
        error: error.message
      };
    }
  }

  public getServiceInfo(): any {
    return {
      url: this.pythonServiceUrl,
      available: this.isAvailable,
      lastHealthCheck: this.lastHealthCheck,
      endpoints: {
        crawl: `${this.pythonServiceUrl}/api/python/crawl`,
        pgai: `${this.pythonServiceUrl}/api/python/pgai`,
        csv: `${this.pythonServiceUrl}/api/python/csv`,
        semanticSearch: `${this.pythonServiceUrl}/api/python/semantic-search`,
        health: `${this.pythonServiceUrl}/health`
      }
    };
  }

  // ============= CSV Transform Methods (High Performance) =============

  /**
   * Transform large CSV files using PostgreSQL COPY command via Python worker
   * 100-1000x faster than Node.js row-by-row INSERT
   *
   * @param filePath - Absolute path to CSV file
   * @param tableName - Target PostgreSQL table name
   * @param databaseUrl - PostgreSQL connection string
   * @param jobId - Unique job ID for progress tracking
   * @param options - Additional options (batchSize, delimiter, etc.)
   */
  public async transformCSV(
    filePath: string,
    tableName: string,
    databaseUrl: string,
    jobId: string,
    options?: {
      batchSize?: number;
      delimiter?: string;
      encoding?: string;
      truncateTable?: boolean;
      columnTypes?: Record<string, string>;
    }
  ): Promise<{ jobId: string; status: string; message: string; estimatedRows?: number }> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available for CSV transform');
      }

      logger.info(`Starting Python CSV transform: ${filePath} -> ${tableName}`);

      const response = await this.axiosClient.post('/api/python/csv/transform', {
        file_path: filePath,
        table_name: tableName,
        database_url: databaseUrl,
        job_id: jobId,
        batch_size: options?.batchSize || 50000,
        delimiter: options?.delimiter || ',',
        encoding: options?.encoding || 'utf-8',
        truncate_table: options?.truncateTable || false,
        column_types: options?.columnTypes
      }, {
        timeout: 60000 // 60 second timeout for starting job
      });

      logger.info(`CSV transform job started: ${jobId}`);
      return {
        jobId: response.data.job_id,
        status: response.data.status,
        message: response.data.message,
        estimatedRows: response.data.estimated_rows
      };

    } catch (error) {
      logger.error('CSV transform start error:', error);
      throw error;
    }
  }

  /**
   * Get CSV transform job progress
   */
  public async getCSVTransformProgress(jobId: string): Promise<{
    jobId: string;
    status: string;
    progress: number;
    rowsProcessed: number;
    totalRows: number;
    rowsPerSecond: number;
    estimatedRemainingSeconds: number;
    errorMessage?: string;
  } | null> {
    try {
      const response = await this.axiosClient.get(`/api/python/csv/progress/${jobId}`);
      return {
        jobId: response.data.job_id,
        status: response.data.status,
        progress: response.data.progress,
        rowsProcessed: response.data.rows_processed,
        totalRows: response.data.total_rows,
        rowsPerSecond: response.data.rows_per_second,
        estimatedRemainingSeconds: response.data.estimated_remaining_seconds,
        errorMessage: response.data.error_message
      };

    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Get CSV transform progress error:', error);
      throw error;
    }
  }

  /**
   * Cancel a running CSV transform job
   */
  public async cancelCSVTransform(jobId: string): Promise<boolean> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python service is not available');
      }

      const response = await this.axiosClient.post(`/api/python/csv/cancel/${jobId}`);
      return response.data.status === 'cancelled';

    } catch (error) {
      logger.error('Cancel CSV transform error:', error);
      throw error;
    }
  }

  /**
   * Check if a file should use Python CSV transform (based on size)
   * Files larger than 10MB should use Python for performance
   */
  public shouldUsePythonTransform(fileSizeBytes: number): boolean {
    const THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB
    return fileSizeBytes > THRESHOLD_BYTES;
  }

  // ============= Semantic Search Methods (High Performance) =============

  /**
   * Perform semantic search via Python microservice
   *
   * Performance benefits:
   * - Redis L2 embedding cache (24h TTL)
   * - Direct asyncpg vector search (no ORM overhead)
   * - Hybrid scoring with keyword boost
   *
   * @param query - Search query text
   * @param options - Search options (limit, useCache)
   * @returns Search results with similarity scores
   */
  public async semanticSearch(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResponse> {
    const startTime = Date.now();

    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python semantic search service is not available');
      }

      logger.info(`Python semantic search: "${query.substring(0, 50)}..."`);

      const response = await this.axiosClient.post('/api/python/semantic-search/search', {
        query,
        limit: options.limit || 25,
        use_cache: options.useCache !== false,
        debug: options.debug || false
      }, {
        timeout: 30000 // 30 second timeout
      });

      const elapsedMs = Date.now() - startTime;
      const resultCount = response.data.results?.length || 0;
      const cached = response.data.cached ? ' (CACHED)' : '';

      // Log rerank info if available
      const rerankApplied = response.data.settings?.rerank_applied;
      const rerankMs = response.data.timings?.rerank_ms;
      const rerankInfo = rerankApplied ? ` [RERANKED in ${rerankMs?.toFixed(0) || 0}ms]` : '';

      logger.info(`Python semantic search completed: ${resultCount} results in ${elapsedMs}ms${cached}${rerankInfo}`);

      return response.data;

    } catch (error: any) {
      logger.error('Python semantic search error:', error.message);
      throw error;
    }
  }

  /**
   * Generate embedding for text via Python microservice
   * Uses Redis L2 cache (24h TTL)
   *
   * @param text - Text to embed
   * @param useCache - Whether to use cache (default: true)
   * @returns Embedding vector (1536 dimensions)
   */
  public async generateEmbedding(
    text: string,
    useCache: boolean = true
  ): Promise<number[]> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python embedding service is not available');
      }

      const response = await this.axiosClient.post('/api/python/semantic-search/embedding', {
        text,
        use_cache: useCache
      });

      return response.data.embedding;

    } catch (error: any) {
      logger.error('Python embedding generation error:', error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in a single API call
   * More efficient than sequential calls
   *
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  public async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python embedding service is not available');
      }

      const response = await this.axiosClient.post('/api/python/semantic-search/embedding/batch', {
        texts
      }, {
        timeout: 60000 // 60 second timeout for batch
      });

      return response.data.embeddings;

    } catch (error: any) {
      logger.error('Python batch embedding error:', error.message);
      throw error;
    }
  }

  /**
   * Get semantic search statistics
   */
  public async getSemanticSearchStats(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python semantic search service is not available');
      }

      const response = await this.axiosClient.get('/api/python/semantic-search/stats');
      return response.data;

    } catch (error: any) {
      logger.error('Semantic search stats error:', error.message);
      throw error;
    }
  }

  /**
   * Check vector index status
   * Returns warning if HNSW index is missing
   */
  public async checkVectorIndex(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python semantic search service is not available');
      }

      const response = await this.axiosClient.get('/api/python/semantic-search/index-status');
      return response.data;

    } catch (error: any) {
      logger.error('Vector index check error:', error.message);
      throw error;
    }
  }

  /**
   * Get current RAG settings from Python service
   */
  public async getRAGSettings(): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python semantic search service is not available');
      }

      const response = await this.axiosClient.get('/api/python/semantic-search/settings');
      return response.data;

    } catch (error: any) {
      logger.error('RAG settings error:', error.message);
      throw error;
    }
  }

  /**
   * Clear semantic search caches
   * @param type - 'embedding', 'search', or 'all'
   */
  public async clearSemanticSearchCache(type: 'embedding' | 'search' | 'all' = 'all'): Promise<any> {
    try {
      if (!await this.isPythonServiceAvailable()) {
        throw new Error('Python semantic search service is not available');
      }

      const response = await this.axiosClient.delete(`/api/python/semantic-search/cache?type=${type}`);
      return response.data;

    } catch (error: any) {
      logger.error('Clear cache error:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
export const pythonService = PythonIntegrationService.getInstance();