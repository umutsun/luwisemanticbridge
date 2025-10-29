/**
 * Optimized Semantic Search Service
 * Multi-level caching, batching, and performance optimizations
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { SemanticSearchService } from './semantic-search.service';

export interface SearchInput {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: SearchFilters;
  includeMetadata?: boolean;
  includeEmbeddings?: boolean;
  searchType?: 'SEMANTIC' | 'KEYWORD' | 'HYBRID' | 'NEURAL';
  sortBy?: 'RELEVANCE' | 'DATE' | 'POPULARITY';
  enableCache?: boolean;
  forceRefresh?: boolean;
}

export interface SearchFilters {
  documentTypes?: string[];
  dateRange?: { start: Date; end: Date };
  sources?: string[];
  metadata?: any;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  queryTime: number;
  cacheHit: boolean;
  cacheKey: string;
  queryVector?: number[];
  suggestions: string[];
  relatedQueries: RelatedQuery[];
  facets: Facet[];
  performance: PerformanceMetrics;
}

export interface SearchResult {
  id: string;
  content: string;
  title?: string;
  score: number;
  source: string;
  documentId?: string;
  metadata?: any;
  embedding?: {
    id: string;
    vector: number[];
    model: string;
    dimensions: number;
    createdAt: Date;
  };
  highlights: string[];
  timestamp: Date;
  rank: number;
  explanation?: string;
}

export interface RelatedQuery {
  query: string;
  score: number;
  count: number;
}

export interface Facet {
  field: string;
  values: Array<{ value: string; count: number }>;
}

export interface PerformanceMetrics {
  embeddingTime: number;
  searchTime: number;
  postProcessingTime: number;
  totalTime: number;
  vectorsScanned: number;
  cacheHit: boolean;
}

export interface PopularSearch {
  query: string;
  count: number;
  avgResponseTime: number;
  lastSearched: Date;
  trending: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}

// Cache configuration
const CACHE_KEYS = {
  SEARCH_RESULT: (hash: string) => `search:result:${hash}`,
  POPULAR: (timeframe: string) => `search:popular:${timeframe}`,
  USER_PREFS: (userId: string) => `search:prefs:${userId}`,
  ANALYTICS: (date: string) => `search:analytics:${date}`,
  STATS: 'search:cache:stats',
};

const CACHE_TTL = {
  SEARCH_RESULT: 600,      // 10 minutes
  POPULAR: 3600,           // 1 hour
  USER_PREFS: 1800,        // 30 minutes
  ANALYTICS: 86400,        // 24 hours
};

export class OptimizedSemanticSearchService {
  private baseService: SemanticSearchService;

  constructor(
    private pool: Pool,
    private redis: Redis
  ) {
    this.baseService = new SemanticSearchService();
  }

  /**
   * Search with multi-level caching
   */
  async search(input: SearchInput): Promise<SearchResponse> {
    const startTime = Date.now();

    // Generate cache key
    const cacheKey = this.generateCacheKey(input);

    // Check cache if enabled
    if (input.enableCache !== false && !input.forceRefresh) {
      const cached = await this.getCachedResult(cacheKey);
      if (cached) {
        console.log(`[Search] Cache HIT for: ${input.query.substring(0, 50)}`);
        return {
          ...cached,
          cacheHit: true,
          queryTime: Date.now() - startTime,
        };
      }
    }

    console.log(`[Search] Cache MISS for: ${input.query.substring(0, 50)}`);

    // Execute search with performance tracking
    const performance: Partial<PerformanceMetrics> = {};

    // Step 1: Get query embedding
    const embeddingStart = Date.now();
    const queryVector = await this.getEmbedding(input.query);
    performance.embeddingTime = Date.now() - embeddingStart;

    // Step 2: Vector search
    const searchStart = Date.now();
    const rawResults = await this.vectorSearch(queryVector, input);
    performance.searchTime = Date.now() - searchStart;

    // Step 3: Post-processing (parallel)
    const postStart = Date.now();
    const [suggestions, relatedQueries, facets] = await Promise.all([
      this.generateSuggestions(input.query, rawResults).catch(() => []),
      this.findRelatedQueries(input.query).catch(() => []),
      this.computeFacets(rawResults).catch(() => []),
    ]);
    performance.postProcessingTime = Date.now() - postStart;

    // Build response
    const response: SearchResponse = {
      results: rawResults.map((r, idx) => ({ ...r, rank: idx + 1 })),
      total: rawResults.length,
      queryTime: Date.now() - startTime,
      cacheHit: false,
      cacheKey,
      queryVector: input.includeEmbeddings ? queryVector : undefined,
      suggestions,
      relatedQueries,
      facets,
      performance: {
        embeddingTime: performance.embeddingTime!,
        searchTime: performance.searchTime!,
        postProcessingTime: performance.postProcessingTime!,
        totalTime: Date.now() - startTime,
        vectorsScanned: rawResults.length,
        cacheHit: false,
      },
    };

    // Cache result
    if (input.enableCache !== false) {
      await this.cacheResult(cacheKey, response);
    }

    // Track analytics
    await this.trackSearch(input.query, response.queryTime);

    return response;
  }

  /**
   * Batch search with deduplication
   */
  async batchSearch(inputs: SearchInput[]): Promise<SearchResponse[]> {
    console.log(`[Search] Batch search for ${inputs.length} queries`);

    // Deduplicate inputs
    const uniqueInputs = this.deduplicateInputs(inputs);
    console.log(`[Search] Deduplicated to ${uniqueInputs.length} unique queries`);

    // Check cache for all queries in parallel
    const cacheChecks = await Promise.all(
      uniqueInputs.map(async (input) => {
        const cacheKey = this.generateCacheKey(input);
        const cached = input.enableCache !== false ? await this.getCachedResult(cacheKey) : null;
        return { input, cacheKey, cached };
      })
    );

    // Separate cached and uncached
    const cachedResults = new Map<string, SearchResponse>();
    const uncachedInputs: SearchInput[] = [];

    for (const { input, cacheKey, cached } of cacheChecks) {
      if (cached) {
        cachedResults.set(cacheKey, { ...cached, cacheHit: true });
      } else {
        uncachedInputs.push(input);
      }
    }

    console.log(`[Search] Cache hits: ${cachedResults.size}, Cache misses: ${uncachedInputs.length}`);

    // Execute uncached searches in parallel (with concurrency limit)
    const BATCH_SIZE = 5;
    const newResults: SearchResponse[] = [];

    for (let i = 0; i < uncachedInputs.length; i += BATCH_SIZE) {
      const batch = uncachedInputs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(input => this.search(input))
      );
      newResults.push(...batchResults);
    }

    // Build result map
    const resultMap = new Map<string, SearchResponse>();
    cachedResults.forEach((result, key) => resultMap.set(key, result));
    newResults.forEach((result) => resultMap.set(result.cacheKey, result));

    // Return results in original order
    return inputs.map(input => {
      const cacheKey = this.generateCacheKey(input);
      return resultMap.get(cacheKey)!;
    });
  }

  /**
   * Generate deterministic cache key
   */
  private generateCacheKey(input: SearchInput): string {
    const normalized = {
      query: input.query.trim().toLowerCase(),
      limit: input.limit || 10,
      threshold: input.threshold || 0.7,
      filters: JSON.stringify(input.filters || {}),
      searchType: input.searchType || 'HYBRID',
      sortBy: input.sortBy || 'RELEVANCE',
    };

    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(normalized))
      .digest('hex');

    return hash;
  }

  /**
   * Get cached search result
   */
  private async getCachedResult(cacheKey: string): Promise<SearchResponse | null> {
    try {
      const key = CACHE_KEYS.SEARCH_RESULT(cacheKey);
      const cached = await this.redis.get(key);

      if (!cached) {
        await this.redis.hincrby(CACHE_KEYS.STATS, 'misses', 1);
        return null;
      }

      // Increment hit count
      await this.redis.hincrby(CACHE_KEYS.STATS, 'hits', 1);

      return JSON.parse(cached);
    } catch (error) {
      console.error('[Cache] Get error:', error);
      return null;
    }
  }

  /**
   * Cache search result
   */
  private async cacheResult(cacheKey: string, result: SearchResponse): Promise<void> {
    try {
      const key = CACHE_KEYS.SEARCH_RESULT(cacheKey);

      // Don't cache embeddings (too large)
      const cacheableResult = {
        ...result,
        queryVector: undefined,
        results: result.results.map(r => ({ ...r, embedding: undefined })),
      };

      await this.redis.setex(
        key,
        CACHE_TTL.SEARCH_RESULT,
        JSON.stringify(cacheableResult)
      );
    } catch (error) {
      console.error('[Cache] Set error:', error);
    }
  }

  /**
   * Track search for analytics
   */
  private async trackSearch(query: string, responseTime: number): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0];

      // Increment search count
      await this.redis.hincrby(`search:stats:${date}`, 'total', 1);

      // Track query popularity
      await this.redis.zincrby(CACHE_KEYS.POPULAR('24h'), 1, query);
      await this.redis.expire(CACHE_KEYS.POPULAR('24h'), 86400);

      // Track response time
      await this.redis.lpush(`search:times:${date}`, responseTime);
      await this.redis.ltrim(`search:times:${date}`, 0, 999); // Keep last 1000
      await this.redis.expire(`search:times:${date}`, 86400);
    } catch (error) {
      console.error('[Analytics] Track error:', error);
    }
  }

  /**
   * Get popular searches
   */
  async getPopularSearches(limit: number = 10, timeframe: string = '24h'): Promise<PopularSearch[]> {
    try {
      const key = CACHE_KEYS.POPULAR(timeframe);
      const results = await this.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

      const popular: PopularSearch[] = [];
      for (let i = 0; i < results.length; i += 2) {
        popular.push({
          query: results[i],
          count: parseInt(results[i + 1]),
          avgResponseTime: 0, // TODO: calculate from stats
          lastSearched: new Date(),
          trending: false,
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
  async getCacheStats(): Promise<CacheStats> {
    try {
      const stats = await this.redis.hgetall(CACHE_KEYS.STATS);
      const hits = parseInt(stats.hits || '0');
      const misses = parseInt(stats.misses || '0');
      const total = hits + misses;

      return {
        hits,
        misses,
        hitRate: total > 0 ? hits / total : 0,
        size: await this.redis.dbsize(),
      };
    } catch (error) {
      console.error('[Stats] Get error:', error);
      return { hits: 0, misses: 0, hitRate: 0, size: 0 };
    }
  }

  /**
   * Clear search cache
   */
  async clearCache(pattern?: string): Promise<number> {
    try {
      const searchPattern = pattern || 'search:result:*';
      const keys = await this.redis.keys(searchPattern);

      if (keys.length === 0) return 0;

      await this.redis.del(...keys);
      console.log(`[Cache] Cleared ${keys.length} keys matching: ${searchPattern}`);

      return keys.length;
    } catch (error) {
      console.error('[Cache] Clear error:', error);
      return 0;
    }
  }

  /**
   * Prewarm cache for common queries
   */
  async prewarmCache(queries: string[]): Promise<void> {
    console.log(`[Cache] Prewarming ${queries.length} queries...`);

    const results = await Promise.allSettled(
      queries.map(query =>
        this.search({
          query,
          limit: 10,
          threshold: 0.7,
          enableCache: true,
          forceRefresh: true,
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[Cache] Prewarm complete: ${successful}/${queries.length} successful`);
  }

  /**
   * Deduplicate inputs based on cache key
   */
  private deduplicateInputs(inputs: SearchInput[]): SearchInput[] {
    const seen = new Set<string>();
    const unique: SearchInput[] = [];

    for (const input of inputs) {
      const key = this.generateCacheKey(input);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(input);
      }
    }

    return unique;
  }

  /**
   * Get query embedding (with caching in base service)
   */
  private async getEmbedding(query: string): Promise<number[]> {
    // Delegate to base service which has embedding cache
    return this.baseService.generateEmbedding(query);
  }

  /**
   * Execute vector search
   */
  private async vectorSearch(
    queryVector: number[],
    input: SearchInput
  ): Promise<SearchResult[]> {
    const limit = input.limit || 10;
    const threshold = input.threshold || 0.7;

    try {
      // Build filter clause
      let filterClause = '';
      const params: any[] = [queryVector, limit];
      let paramIndex = 3;

      if (input.filters?.documentTypes?.length) {
        filterClause += ` AND metadata->>'type' = ANY($${paramIndex})`;
        params.push(input.filters.documentTypes);
        paramIndex++;
      }

      if (input.filters?.sources?.length) {
        filterClause += ` AND source = ANY($${paramIndex})`;
        params.push(input.filters.sources);
        paramIndex++;
      }

      // Execute search
      const query = `
        SELECT
          e.id,
          e.content,
          e.metadata->>'title' as title,
          1 - (e.embedding <=> $1::vector) as score,
          e.source,
          e.metadata->>'documentId' as document_id,
          e.metadata,
          e.created_at
        FROM embeddings e
        WHERE 1 = 1
          ${filterClause}
          AND 1 - (e.embedding <=> $1::vector) > ${threshold}
        ORDER BY e.embedding <=> $1::vector
        LIMIT $2
      `;

      const result = await this.pool.query(query, params);

      return result.rows.map((row) => ({
        id: row.id,
        content: row.content,
        title: row.title,
        score: parseFloat(row.score),
        source: row.source,
        documentId: row.document_id,
        metadata: row.metadata,
        highlights: [], // TODO: implement highlighting
        timestamp: row.created_at,
        rank: 0, // Will be set by caller
      }));
    } catch (error) {
      console.error('[VectorSearch] Error:', error);
      return [];
    }
  }

  /**
   * Generate search suggestions
   */
  private async generateSuggestions(query: string, results: SearchResult[]): Promise<string[]> {
    // TODO: Implement ML-based suggestions
    return [];
  }

  /**
   * Find related queries
   */
  private async findRelatedQueries(query: string): Promise<RelatedQuery[]> {
    // TODO: Implement query similarity search
    return [];
  }

  /**
   * Compute facets for filtering
   */
  private async computeFacets(results: SearchResult[]): Promise<Facet[]> {
    const facets: Facet[] = [];

    // Document type facet
    const typeCount = new Map<string, number>();
    results.forEach((r) => {
      const type = r.metadata?.type || 'unknown';
      typeCount.set(type, (typeCount.get(type) || 0) + 1);
    });

    if (typeCount.size > 0) {
      facets.push({
        field: 'type',
        values: Array.from(typeCount.entries()).map(([value, count]) => ({
          value,
          count,
        })),
      });
    }

    return facets;
  }
}

export default OptimizedSemanticSearchService;
