import { redis } from '../server';
import crypto from 'crypto';

interface CacheConfig {
  ttl?: number; // Time to live in seconds
  key?: string; // Custom cache key
  tags?: string[]; // Cache tags for invalidation
}

interface CachedResult<T> {
  data: T;
  cachedAt: string;
  expiresAt: string;
  hitCount: number;
}

interface QueueItem {
  id: string;
  url: string;
  method: string;
  options: any;
  priority: number;
  addedAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class ScrapingCacheService {
  private readonly PAGE_CACHE_TTL = 3600; // 1 hour
  private readonly RESULT_CACHE_TTL = 7200; // 2 hours
  private readonly RATE_LIMIT_WINDOW = 60; // 1 minute
  private readonly BATCH_SIZE = 10;

  /**
   * Cache a scraped page
   */
  async cachePage(url: string, content: string, config: CacheConfig = {}): Promise<void> {
    const key = this.generatePageCacheKey(url);
    const ttl = config.ttl || this.PAGE_CACHE_TTL;

    const cacheData = {
      url,
      content,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      tags: config.tags || [],
      size: Buffer.byteLength(content, 'utf8')
    };

    await redis.setex(key, ttl, JSON.stringify(cacheData));

    // Index by tags for easier invalidation
    if (config.tags) {
      for (const tag of config.tags) {
        await redis.sadd(`cache:tags:${tag}`, key);
        await redis.expire(`cache:tags:${tag}`, ttl);
      }
    }
  }

  /**
   * Get cached page
   */
  async getCachedPage(url: string): Promise<CachedResult<string> | null> {
    const key = this.generatePageCacheKey(url);
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached);
    data.hitCount = (data.hitCount || 0) + 1;

    // Update hit count
    await redis.setex(key, this.PAGE_CACHE_TTL, JSON.stringify(data));

    return data;
  }

  /**
   * Cache scraping results
   */
  async cacheResults(query: string, results: any[], config: CacheConfig = {}): Promise<void> {
    const key = this.generateResultCacheKey(query);
    const ttl = config.ttl || this.RESULT_CACHE_TTL;

    const cacheData = {
      query,
      results,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      count: results.length,
      tags: config.tags || []
    };

    await redis.setex(key, ttl, JSON.stringify(cacheData));

    // Store in search history
    await redis.zadd('cache:search-history', Date.now(), query);
    await redis.expire('cache:search-history', 86400); // 24 hours
  }

  /**
   * Get cached results
   */
  async getCachedResults(query: string): Promise<CachedResult<any[]> | null> {
    const key = this.generateResultCacheKey(query);
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached);
    data.hitCount = (data.hitCount || 0) + 1;

    return data;
  }

  /**
   * Check rate limit for a domain
   */
  async checkRateLimit(domain: string, limit: number = 60): Promise<boolean> {
    const key = `ratelimit:${domain}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, this.RATE_LIMIT_WINDOW);
    }

    return current <= limit;
  }

  /**
   * Add URL to scraping queue
   */
  async addToQueue(urls: string[], method: string = 'puppeteer', options: any = {}, priority: number = 0): Promise<string[]> {
    const jobIds = [];

    for (const url of urls) {
      const jobId = crypto.randomUUID();
      const queueItem: QueueItem = {
        id: jobId,
        url,
        method,
        options,
        priority,
        addedAt: new Date().toISOString(),
        status: 'pending'
      };

      // Add to priority queue
      await redis.zadd('scrape:queue', -priority, JSON.stringify(queueItem));
      jobIds.push(jobId);
    }

    return jobIds;
  }

  /**
   * Get next items from queue
   */
  async getFromQueue(count: number = this.BATCH_SIZE): Promise<QueueItem[]> {
    const items = await redis.zrange('scrape:queue', 0, count - 1);

    if (items.length === 0) {
      return [];
    }

    // Remove from queue
    await redis.zremrange('scrape:queue', 0, count - 1);

    return items.map(item => {
      const queueItem = JSON.parse(item);
      queueItem.status = 'processing';
      return queueItem;
    });
  }

  /**
   * Mark queue item as completed
   */
  async markQueueCompleted(jobId: string, result: any): Promise<void> {
    const key = `scrape:job:${jobId}`;
    const jobData = {
      status: 'completed',
      result,
      completedAt: new Date().toISOString()
    };

    await redis.setex(key, 3600, JSON.stringify(jobData));
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTag(tag: string): Promise<number> {
    const keyPattern = `cache:tags:${tag}`;
    const keys = await redis.smembers(keyPattern);

    if (keys.length === 0) {
      return 0;
    }

    // Delete all cached items with this tag
    await redis.del(...keys);
    await redis.del(keyPattern);

    return keys.length;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    const stats = {
      pages: 0,
      results: 0,
      queue: 0,
      rateLimits: 0,
      memoryUsage: 0
    };

    // Count cached pages
    const pageKeys = await redis.keys('cache:page:*');
    stats.pages = pageKeys.length;

    // Count cached results
    const resultKeys = await redis.keys('cache:result:*');
    stats.results = resultKeys.length;

    // Count queue items
    const queueCount = await redis.zcard('scrape:queue');
    stats.queue = queueCount;

    // Count rate limit keys
    const rateLimitKeys = await redis.keys('ratelimit:*');
    stats.rateLimits = rateLimitKeys.length;

    // Get memory usage (approximate)
    const info = await redis.info('memory');
    const match = info.match(/used_memory_human:(.+)/);
    if (match) {
      stats.memoryUsage = match[1].trim();
    }

    return stats;
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache(): Promise<number> {
    let cleaned = 0;

    // Get all cache keys
    const keys = await redis.keys('cache:*');

    for (const key of keys) {
      const ttl = await redis.ttl(key);
      if (ttl === -1) { // No expiry set, skip
        continue;
      }

      if (ttl === -2) { // Already expired
        await redis.del(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Cache site structure analysis
   */
  async cacheSiteStructure(url: string, structure: any): Promise<void> {
    const key = `structure:${this.hashUrl(url)}`;
    await redis.setex(key, 86400, JSON.stringify({ // 24 hours
      url,
      structure,
      analyzedAt: new Date().toISOString()
    }));
  }

  /**
   * Get cached site structure
   */
  async getCachedSiteStructure(url: string): Promise<any | null> {
    const key = `structure:${this.hashUrl(url)}`;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Generate page cache key
   */
  private generatePageCacheKey(url: string): string {
    return `cache:page:${this.hashUrl(url)}`;
  }

  /**
   * Generate result cache key
   */
  private generateResultCacheKey(query: string): string {
    return `cache:result:${this.hashQuery(query)}`;
  }

  /**
   * Hash URL for cache key
   */
  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Hash query for cache key
   */
  private hashQuery(query: string): string {
    return crypto.createHash('sha256').update(query).digest('hex').substring(0, 16);
  }
}

export const scrapingCacheService = new ScrapingCacheService();