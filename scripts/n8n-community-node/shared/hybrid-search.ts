import { Pool } from 'pg';
import { EmbeddingService } from './embedding';
import { cacheManager } from '../src/shared/cache-manager';
import crypto from 'crypto';
import OpenAI from 'openai';

const redis = cacheManager.getRedisClient();

export interface SearchOptions {
  limit?: number;
  offset?: number;
  minSimilarity?: number;
  includeMetadata?: boolean;
  useCache?: boolean;
  weightVector?: number;
  weightKeyword?: number;
  rerank?: boolean;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata?: any;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

export class HybridSearchEngine {
  private pool: Pool;
  private embeddingService: EmbeddingService;
  private openai: OpenAI;
  private readonly defaultOptions: Required<SearchOptions> = {
    limit: 10,
    offset: 0,
    minSimilarity: 0.7,
    includeMetadata: true,
    useCache: true,
    weightVector: 0.7,
    weightKeyword: 0.3,
    rerank: true
  };

  constructor(pool: Pool, apiKey: string) {
    this.pool = pool;
    this.embeddingService = EmbeddingService.getInstance({
      provider: 'openai' as any,
      model: 'text-embedding-ada-002',
      apiKey: apiKey,
    });
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Perform semantic vector search
   */
  async semanticSearch(
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const opts = { ...this.defaultOptions, ...options };
    
    // Generate query embedding
    const queryEmbeddingResponse = await this.embeddingService.generateEmbedding(query);
    const queryEmbedding = queryEmbeddingResponse.embedding;
    
    // Check cache
    if (opts.useCache) {
      const cached = await this.getCachedResults('semantic', query, opts);
      if (cached) return cached;
    }

    // Execute vector similarity search
    const sql = `
      SELECT 
        id,
        content,
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM documents
      WHERE 1 - (embedding <=> $1::vector) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3 OFFSET $4
    `;

    const values = [
      `[${queryEmbedding.join(',')}]`,
      opts.minSimilarity,
      opts.limit,
      opts.offset
    ];

    const result = await this.pool.query(sql, values);
    
    const results: SearchResult[] = result.rows.map(row => ({
      id: row.id,
      content: row.content,
      metadata: opts.includeMetadata ? row.metadata : undefined,
      score: row.similarity,
      vectorScore: row.similarity,
      source: 'vector' as const
    }));

    // Cache results
    if (opts.useCache) {
      await this.cacheResults('semantic', query, opts, results);
    }

    return results;
  }

  /**
   * Perform keyword-based search using PostgreSQL full-text search
   */
  async keywordSearch(
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const opts = { ...this.defaultOptions, ...options };
    
    // Check cache
    if (opts.useCache) {
      const cached = await this.getCachedResults('keyword', query, opts);
      if (cached) return cached;
    }

    // Prepare query for full-text search
    const tsQuery = this.prepareTsQuery(query);

    const sql = `
      SELECT 
        id,
        content,
        metadata,
        ts_rank_cd(
          to_tsvector('english', content),
          to_tsquery('english', $1)
        ) as rank,
        ts_headline(
          'english',
          content,
          to_tsquery('english', $1),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20'
        ) as highlight
      FROM documents
      WHERE to_tsvector('english', content) @@ to_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2 OFFSET $3
    `;

    const values = [tsQuery, opts.limit, opts.offset];
    const result = await this.pool.query(sql, values);
    
    // Normalize keyword scores to 0-1 range
    const maxRank = Math.max(...result.rows.map(r => r.rank), 1);
    
    const results: SearchResult[] = result.rows.map(row => ({
      id: row.id,
      content: row.highlight || row.content,
      metadata: opts.includeMetadata ? row.metadata : undefined,
      score: row.rank / maxRank,
      keywordScore: row.rank / maxRank,
      source: 'keyword' as const
    }));

    // Cache results
    if (opts.useCache) {
      await this.cacheResults('keyword', query, opts, results);
    }

    return results;
  }

  /**
   * Perform hybrid search combining vector and keyword search
   */
  async hybridSearch(
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const opts = { ...this.defaultOptions, ...options };
    
    // Expand the query
    const expandedQuery = await this.expandQueryWithLLM(query);

    // Check cache
    if (opts.useCache) {
      const cached = await this.getCachedResults('hybrid', expandedQuery, opts);
      if (cached) return cached;
    }

    // Perform both searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      this.semanticSearch(expandedQuery, { ...opts, useCache: false }),
      this.keywordSearch(expandedQuery, { ...opts, useCache: false })
    ]);

    // Combine and deduplicate results
    const combinedResults = this.combineResults(
      vectorResults, 
      keywordResults, 
      opts.weightVector, 
      opts.weightKeyword
    );

    // Rerank if enabled
    let finalResults = combinedResults;
    if (opts.rerank) {
      finalResults = await this.rerank(expandedQuery, combinedResults);
    }

    // Apply limit
    finalResults = finalResults.slice(0, opts.limit);

    // Cache results
    if (opts.useCache) {
      await this.cacheResults('hybrid', expandedQuery, opts, finalResults);
    }

    return finalResults;
  }

  /**
   * Rerank results using cross-encoder or other advanced techniques
   */
  async rerank(query: string, results: SearchResult[]): Promise<SearchResult[]> {
    // For now, simple reranking based on content length and query term frequency
    // In production, you might use a cross-encoder model
    
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    return results.map(result => {
      let boostScore = 0;
      
      // Boost for query term frequency
      const contentLower = result.content.toLowerCase();
      queryTerms.forEach(term => {
        const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
        boostScore += matches * 0.1;
      });
      
      // Boost for reasonable content length
      const wordCount = result.content.split(/\s+/).length;
      if (wordCount >= 50 && wordCount <= 500) {
        boostScore += 0.1;
      }
      
      return {
        ...result,
        score: Math.min(1, result.score + boostScore)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Expand the query using an LLM
   */
  async expandQueryWithLLM(query: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a query expansion assistant. Your task is to expand the user's query with synonyms, related concepts, and translations to improve search results. 
            Return a single, expanded query string that includes the original query and the expanded terms. 
            For example, if the user provides "eiffel tower", you could return "eiffel tower tour eiffel paris france landmark".
            Do not add any explanations or introductory text. Just return the expanded query.`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
      });
      return response.choices[0].message.content || query;
    } catch (error) {
      console.error('Error expanding query with LLM:', error);
      return query;
    }
  }

  /**
   * Combine vector and keyword results with weighted scoring
   */
  private combineResults(
    vectorResults: SearchResult[], 
    keywordResults: SearchResult[],
    weightVector: number,
    weightKeyword: number
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();
    
    // Process vector results
    vectorResults.forEach(result => {
      resultMap.set(result.id, {
        ...result,
        score: result.score * weightVector,
        source: 'hybrid' as const
      });
    });
    
    // Process keyword results
    keywordResults.forEach(result => {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Combine scores
        existing.score += result.score * weightKeyword;
        existing.keywordScore = result.keywordScore;
      } else {
        resultMap.set(result.id, {
          ...result,
          score: result.score * weightKeyword,
          source: 'hybrid' as const
        });
      }
    });
    
    // Sort by combined score
    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Prepare text query for PostgreSQL full-text search
   */
  private prepareTsQuery(query: string): string {
    // Remove special characters and normalize
    const cleaned = query.replace(/[^\w\s]/g, ' ').trim();
    
    // Split into terms
    const terms = cleaned.split(/\s+/).filter(t => t.length > 2);
    
    // Join with & operator for AND search
    return terms.join(' & ');
  }

  /**
   * Generate cache key
   */
  private getCacheKey(type: string, query: string, options: SearchOptions): string {
    const optionString = JSON.stringify({
      limit: options.limit,
      offset: options.offset,
      minSimilarity: options.minSimilarity,
      weightVector: options.weightVector,
      weightKeyword: options.weightKeyword
    });
    
    const hash = crypto
      .createHash('sha256')
      .update(`${type}:${query}:${optionString}`)
      .digest('hex');
    
    return `search:${type}:${hash}`;
  }

  /**
   * Get cached search results
   */
  private async getCachedResults(
    type: string, 
    query: string, 
    options: SearchOptions
  ): Promise<SearchResult[] | null> {
    try {
      const key = this.getCacheKey(type, query, options);
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  }

  /**
   * Cache search results
   */
  private async cacheResults(
    type: string, 
    query: string, 
    options: SearchOptions,
    results: SearchResult[]
  ): Promise<void> {
    try {
      const key = this.getCacheKey(type, query, options);
      const ttl = 3600; // 1 hour
      await redis.setex(key, ttl, JSON.stringify(results));
    } catch (error) {
      console.error('Cache storage error:', error);
    }
  }

  /**
   * Warm cache with popular queries
   */
  async warmCache(popularQueries: string[]): Promise<void> {
    console.log(`Warming cache with ${popularQueries.length} queries...`);
    
    const promises = popularQueries.map(async query => {
      try {
        await this.hybridSearch(query);
      } catch (error) {
        console.error(`Failed to warm cache for query "${query}":`, error);
      }
    });
    
    await Promise.all(promises);
    console.log('Cache warming complete');
  }

  /**
   * Get search performance metrics
   */
  async getMetrics(): Promise<{
    cacheHitRate: number;
    avgSearchLatency: number;
    popularQueries: string[];
  }> {
    // This would typically track metrics in Redis
    const info = await redis.info('stats');
    const lines = info.split('\r\n');
    const stats: any = {};
    
    lines.forEach((line: string) => {
      const [key, value] = line.split(':');
      if (key && value) stats[key] = value;
    });
    
    const hits = parseInt(stats.keyspace_hits || '0');
    const misses = parseInt(stats.keyspace_misses || '0');
    const total = hits + misses;
    
    return {
      cacheHitRate: total > 0 ? hits / total : 0,
      avgSearchLatency: 0, // TODO: Implement latency tracking
      popularQueries: [] // TODO: Track popular queries
    };
  }
}

// Export factory function
export function createHybridSearchEngine(pool: Pool, apiKey: string): HybridSearchEngine {
  return new HybridSearchEngine(pool, apiKey);
}
