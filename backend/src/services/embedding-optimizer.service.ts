import OpenAI from 'openai';
import crypto from 'crypto';
import { Pool } from 'pg';
import { redis } from '../config/redis';

interface EmbeddingCache {
  hash: string;
  embedding: number[];
  tokenCount: number;
  createdAt: Date;
}

interface TokenStats {
  totalTokens: number;
  totalCost: number;
  savedTokens: number;
  savedCost: number;
  cacheHits: number;
  apiCalls: number;
}

export class EmbeddingOptimizer {
  private openai: OpenAI;
  private pool: Pool;
  private redis: any;
  private tokenStats: TokenStats;
  private embeddingCache: Map<string, number[]>;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.pool = new Pool({
      connectionString: process.env.TARGET_DB
    });

    // Use centralized Redis configuration (port 6379)
    this.redis = redis;
    
    this.embeddingCache = new Map();
    
    this.tokenStats = {
      totalTokens: 0,
      totalCost: 0,
      savedTokens: 0,
      savedCost: 0,
      cacheHits: 0,
      apiCalls: 0
    };
  }
  
  // Generate hash for content (for caching)
  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
  
  // Estimate token count (more accurate)
  private estimateTokens(text: string): number {
    // More accurate token estimation
    // Average: ~1 token per 4 characters for English, ~1 token per 2 characters for Turkish
    const turkishRatio = 0.5; // Turkish uses more tokens
    const englishRatio = 0.25;
    
    // Detect if text is mostly Turkish
    const turkishChars = text.match(/[ğüşıöçĞÜŞİÖÇ]/g)?.length || 0;
    const isTurkish = turkishChars > text.length * 0.01;
    
    return Math.ceil(text.length * (isTurkish ? turkishRatio : englishRatio));
  }
  
  // Check if embedding exists in cache
  async checkCache(contentHash: string): Promise<number[] | null> {
    try {
      // Check memory cache first
      if (this.embeddingCache.has(contentHash)) {
        this.tokenStats.cacheHits++;
        return this.embeddingCache.get(contentHash)!;
      }
      
      // Check database cache
      const result = await this.pool.query(`
        SELECT embedding 
        FROM rag_data.embedding_cache 
        WHERE content_hash = $1
      `, [contentHash]);
      
      if (result.rows.length > 0) {
        const embedding = result.rows[0].embedding;
        this.embeddingCache.set(contentHash, embedding);
        this.tokenStats.cacheHits++;
        return embedding;
      }
      
      // Check Redis cache
      const redisKey = `embedding:${contentHash}`;
      const cachedData = await this.redis.get(redisKey);
      if (cachedData) {
        const embedding = JSON.parse(cachedData);
        this.embeddingCache.set(contentHash, embedding);
        this.tokenStats.cacheHits++;
        return embedding;
      }
      
      return null;
    } catch (error) {
      console.error('Cache check error:', error);
      return null;
    }
  }
  
  // Save embedding to cache
  async saveToCache(contentHash: string, embedding: number[], tokenCount: number) {
    try {
      // Save to memory cache
      this.embeddingCache.set(contentHash, embedding);
      
      // Save to database cache
      await this.pool.query(`
        INSERT INTO rag_data.embedding_cache (content_hash, embedding, token_count, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (content_hash) DO NOTHING
      `, [contentHash, `[${embedding.join(',')}]`, tokenCount]);
      
      // Save to Redis with 24 hour expiry
      const redisKey = `embedding:${contentHash}`;
      await this.redis.setex(redisKey, 86400, JSON.stringify(embedding));
      
    } catch (error) {
      console.error('Cache save error:', error);
    }
  }
  
  // Optimize content before embedding (reduce tokens)
  optimizeContent(text: string): string {
    // Remove excessive whitespace
    let optimized = text.replace(/\s+/g, ' ').trim();
    
    // Remove common stop words (Turkish)
    const stopWords = ['ve', 'veya', 'ile', 'için', 'bu', 'şu', 'o', 'da', 'de'];
    const words = optimized.split(' ');
    optimized = words.filter(word => 
      word.length > 2 && !stopWords.includes(word.toLowerCase())
    ).join(' ');
    
    // Truncate to max length (8000 chars for OpenAI)
    if (optimized.length > 8000) {
      optimized = optimized.substring(0, 8000);
    }
    
    return optimized;
  }
  
  // Batch generate embeddings (more efficient)
  async batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const uniqueTexts: Map<string, number[]> = new Map();
    
    // First, check cache for all texts
    for (const text of texts) {
      const hash = this.generateHash(text);
      const cached = await this.checkCache(hash);
      
      if (cached) {
        results.push(cached);
        const savedTokens = this.estimateTokens(text);
        this.tokenStats.savedTokens += savedTokens;
        this.tokenStats.savedCost += (savedTokens / 1000) * 0.0001;
      } else {
        uniqueTexts.set(text, []);
      }
    }
    
    // Batch process uncached texts
    if (uniqueTexts.size > 0) {
      const textsToProcess = Array.from(uniqueTexts.keys());
      const batchSize = 20; // OpenAI allows up to 2048 inputs
      
      for (let i = 0; i < textsToProcess.length; i += batchSize) {
        const batch = textsToProcess.slice(i, i + batchSize);
        
        try {
          const response = await this.openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: batch.map(t => this.optimizeContent(t))
          });
          
          // Process response
          for (let j = 0; j < batch.length; j++) {
            const text = batch[j];
            const embedding = response.data[j].embedding;
            const hash = this.generateHash(text);
            const tokenCount = this.estimateTokens(text);
            
            // Update stats
            this.tokenStats.apiCalls++;
            this.tokenStats.totalTokens += tokenCount;
            this.tokenStats.totalCost += (tokenCount / 1000) * 0.0001;
            
            // Save to cache
            await this.saveToCache(hash, embedding, tokenCount);
            
            uniqueTexts.set(text, embedding);
          }
          
          // Rate limiting - wait 100ms between batches
          if (i + batchSize < textsToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (error) {
          console.error('Batch embedding error:', error);
          // Fallback to individual processing
          for (const text of batch) {
            const embedding = await this.generateSingleEmbedding(text);
            uniqueTexts.set(text, embedding);
          }
        }
      }
    }
    
    // Combine results in original order
    const finalResults: number[][] = [];
    for (const text of texts) {
      const cached = results.shift();
      if (cached) {
        finalResults.push(cached);
      } else {
        finalResults.push(uniqueTexts.get(text)!);
      }
    }
    
    return finalResults;
  }
  
  // Generate single embedding with retry
  async generateSingleEmbedding(text: string, retries = 3): Promise<number[]> {
    const hash = this.generateHash(text);
    
    // Check cache first
    const cached = await this.checkCache(hash);
    if (cached) {
      const savedTokens = this.estimateTokens(text);
      this.tokenStats.savedTokens += savedTokens;
      this.tokenStats.savedCost += (savedTokens / 1000) * 0.0001;
      return cached;
    }
    
    // Generate new embedding
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const optimized = this.optimizeContent(text);
        const tokenCount = this.estimateTokens(optimized);
        
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: optimized
        });
        
        const embedding = response.data[0].embedding;
        
        // Update stats
        this.tokenStats.apiCalls++;
        this.tokenStats.totalTokens += tokenCount;
        this.tokenStats.totalCost += (tokenCount / 1000) * 0.0001;
        
        // Save to cache
        await this.saveToCache(hash, embedding, tokenCount);
        
        return embedding;
        
      } catch (error: any) {
        console.error(`Embedding attempt ${attempt + 1} failed:`, error.message);
        
        if (attempt === retries - 1) throw error;
        
        // Exponential backoff
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw new Error('Failed to generate embedding after retries');
  }
  
  // Get token statistics
  getStats(): TokenStats & { efficiency: number } {
    const efficiency = this.tokenStats.totalTokens > 0
      ? (this.tokenStats.savedTokens / (this.tokenStats.totalTokens + this.tokenStats.savedTokens)) * 100
      : 0;
    
    return {
      ...this.tokenStats,
      efficiency
    };
  }
  
  // Initialize cache table
  async initializeCacheTable() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS rag_data.embedding_cache (
          content_hash VARCHAR(64) PRIMARY KEY,
          embedding vector(1536),
          token_count INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          last_used TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_cache_created 
        ON rag_data.embedding_cache(created_at DESC)
      `);
      
      console.log('✅ Embedding cache table initialized');
    } catch (error) {
      console.error('Failed to initialize cache table:', error);
    }
  }
  
  // Clean old cache entries
  async cleanCache(daysOld = 7) {
    try {
      const result = await this.pool.query(`
        DELETE FROM rag_data.embedding_cache
        WHERE last_used < NOW() - INTERVAL '${daysOld} days'
        RETURNING content_hash
      `);
      
      console.log(`🧹 Cleaned ${result.rowCount} old cache entries`);
      
      // Clear memory cache
      this.embeddingCache.clear();
      
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }
  
  // Pre-warm cache with common queries
  async prewarmCache() {
    try {
      // Get most frequently accessed content
      const result = await this.pool.query(`
        SELECT DISTINCT content, COUNT(*) as access_count
        FROM rag_data.documents
        WHERE embedding IS NOT NULL
        GROUP BY content
        ORDER BY access_count DESC
        LIMIT 100
      `);
      
      for (const row of result.rows) {
        const hash = this.generateHash(row.content);
        if (!this.embeddingCache.has(hash)) {
          // Load into memory cache
          const embedding = row.embedding;
          if (embedding) {
            this.embeddingCache.set(hash, embedding);
          }
        }
      }
      
      console.log(`🔥 Pre-warmed cache with ${result.rowCount} frequently accessed embeddings`);
      
    } catch (error) {
      console.error('Cache pre-warm error:', error);
    }
  }
}

// Singleton instance
let optimizerInstance: EmbeddingOptimizer | null = null;

export function getEmbeddingOptimizer(): EmbeddingOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new EmbeddingOptimizer();
    optimizerInstance.initializeCacheTable();
    optimizerInstance.prewarmCache();
  }
  return optimizerInstance;
}