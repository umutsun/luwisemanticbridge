/**
 * Multi-Layer Caching Strategy
 * @author Claude - Architecture Lead
 * @version Phase 3
 */

import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { RedisPool } from './connection-pool';
import { AsembError, ErrorCode, ErrorHandler } from '../errors/AsembError';

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Circuit breaker for Redis operations
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number | null = null;
  private successCount: number = 0;
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly resetTimeout: number = 30000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.state === CircuitState.OPEN && this.lastFailureTime) {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      }
    }
    
    // If circuit is open, fail fast
    if (this.state === CircuitState.OPEN) {
      throw new AsembError(
        ErrorCode.CACHE_OPERATION_FAILED,
        'Circuit breaker is open - Redis unavailable',
        {
          context: {
            failures: this.failures,
            lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null
          },
          retryable: false
        }
      );
    }
    
    try {
      const result = await Promise.race([
        operation(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
        )
      ]);
      
      // Success - update state
      if (this.state === CircuitState.HALF_OPEN) {
        this.successCount++;
        if (this.successCount >= 3) {
          this.state = CircuitState.CLOSED;
          this.failures = 0;
          console.log('Circuit breaker closed - Redis recovered');
        }
      }
      
      return result;
    } catch (error: any) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = CircuitState.OPEN;
        console.error(`Circuit breaker opened after ${this.failures} failures`);
      }
      
      throw error;
    }
  }
  
  getState(): { state: CircuitState; failures: number } {
    return { state: this.state, failures: this.failures };
  }
  
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  ttl: number;           // Time to live in seconds
  maxSize?: number;      // Max items in memory cache
  stale?: boolean;       // Allow stale cache on error
  compress?: boolean;    // Compress large values
  prefix?: string;       // Key prefix
}

/**
 * Cache statistics with detailed layer tracking
 */
export interface CacheStats {
  hits: number;
  hitsL1: number;
  hitsL2: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  hitRateL1: number;
  hitRateL2: number;
  memoryUsage: number;
  redisKeys: number;
}

/**
 * Multi-layer cache manager
 * L1: In-memory LRU cache (fastest, limited size)
 * L2: Redis cache (fast, distributed)
 * L3: Database (persistent, slowest)
 */
export class CacheManager {
  private static instance: CacheManager;
  private l1Cache: LRUCache<string, any>;
  private redisClient: any;
  private stats: CacheStats;
  private defaultTTL: number = 3600; // 1 hour
  private circuitBreaker: CircuitBreaker;
  
  private constructor() {
    // Initialize L1 memory cache
    this.l1Cache = new LRUCache<string, any>({
      max: parseInt(process.env.CACHE_L1_MAX_SIZE || '1000'),
      ttl: parseInt(process.env.CACHE_L1_TTL || '300') * 1000, // 5 minutes
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      sizeCalculation: (value) => {
        // Rough estimate of memory size
        return JSON.stringify(value).length;
      },
      maxSize: parseInt(process.env.CACHE_L1_MAX_MEMORY || '52428800'), // 50MB
      dispose: (value, key) => {
        // Cleanup on eviction
        this.stats.deletes++;
      }
    });
    
    // Initialize L2 Redis cache
    this.redisClient = RedisPool.getInstance().getClient('cache');
    
    // Initialize circuit breaker for Redis operations
    this.circuitBreaker = new CircuitBreaker(
      parseInt(process.env.CIRCUIT_THRESHOLD || '5'),
      parseInt(process.env.CIRCUIT_TIMEOUT || '60000'),
      parseInt(process.env.CIRCUIT_RESET_TIMEOUT || '30000')
    );
    
    // Initialize stats
    this.stats = {
      hits: 0,
      hitsL1: 0,
      hitsL2: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      hitRateL1: 0,
      hitRateL2: 0,
      memoryUsage: 0,
      redisKeys: 0
    };
  }
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  /**
   * Get the underlying Redis client
   */
  getRedisClient(): any {
    return this.redisClient;
  }

  /**
   * Generate cache key with namespace
   */
  generateKey(
    namespace: string,
    identifier: string | Record<string, any>,
    prefix?: string
  ): string {
    const idString = typeof identifier === 'string' 
      ? identifier 
      : this.hashObject(identifier || {});
    
    const parts = [
      prefix || 'asemb',
      namespace,
      idString
    ].filter(Boolean);
    
    return parts.join(':');
  }
  
  /**
   * Hash object for cache key
   */
  private hashObject(obj: Record<string, any>): string {
    const normalized = JSON.stringify(this.normalizeObject(obj));
    return createHash('md5').update(normalized).digest('hex').substring(0, 16);
  }
  
  /**
   * Normalize object for consistent hashing
   */
  private normalizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.normalizeObject(item));
    
    const sorted: Record<string, any> = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.normalizeObject(obj[key]);
    });
    return sorted;
  }
  
  /**
   * Get value from cache with multi-layer fallback
   */
  async get<T>(
    key: string,
    options?: { stale?: boolean }
  ): Promise<T | null> {
    // Check L1 (memory)
    const l1Value = this.l1Cache.get(key);
    if (l1Value !== undefined) {
      this.stats.hits++;
      this.stats.hitsL1++;
      this.updateHitRate();
      return l1Value;
    }
    
    // Check L2 (Redis) with circuit breaker
    try {
      const l2Value = await this.circuitBreaker.execute<string | null>(
        () => this.redisClient.get(key)
      );
      
      if (l2Value) {
        const parsed = JSON.parse(l2Value);
        
        // Promote to L1
        this.l1Cache.set(key, parsed);
        
        this.stats.hits++;
        this.stats.hitsL2++;
        this.updateHitRate();
        return parsed;
      }
    } catch (error) {
      console.warn(`Redis get error for key ${key}:`, error);
      
      // If stale allowed or circuit is open, try to get from L1 even if expired
      if (options?.stale || this.circuitBreaker.getState().state === CircuitState.OPEN) {
        const staleValue = this.l1Cache.get(key, { allowStale: true });
        if (staleValue !== undefined) {
          console.log(`Using stale L1 cache for ${key} due to Redis unavailability`);
          return staleValue;
        }
      }
    }
    
    this.stats.misses++;
    this.updateHitRate();
    return null;
  }
  
  /**
   * Set value in cache layers
   */
  async set<T>(
    key: string,
    value: T,
    ttl?: number
  ): Promise<void> {
    const effectiveTTL = ttl || this.defaultTTL;
    
    // Set in L1 (memory)
    this.l1Cache.set(key, value, { ttl: effectiveTTL * 1000 });
    
    // Set in L2 (Redis) with circuit breaker
    try {
      const serialized = JSON.stringify(value);
      await this.circuitBreaker.execute(
        () => this.redisClient.setex(key, effectiveTTL, serialized)
      );
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
      // Don't throw - L1 cache is still valid
      // Circuit breaker will handle repeated failures
    }
    
    this.stats.sets++;
  }
  
  /**
   * Get or compute value (cache-aside pattern)
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    config?: CacheConfig
  ): Promise<T> {
    // Try to get from cache
    let value = await this.get<T>(key, { stale: config?.stale });
    
    if (value !== null) {
      return value;
    }
    
    // Compute value
    try {
      value = await computeFn();
      
      // Store in cache
      await this.set(key, value, config?.ttl);
      
      return value;
      
    } catch (error) {
      // If computation fails and stale is allowed, try stale value
      if (config?.stale) {
        const staleValue = await this.get<T>(key, { stale: true });
        if (staleValue !== null) {
          console.warn(`Using stale cache for ${key} due to computation error`);
          return staleValue;
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Delete from all cache layers
   */
  async delete(key: string): Promise<void> {
    // Delete from L1
    this.l1Cache.delete(key);
    
    // Delete from L2
    try {
      await this.redisClient.del(key);
    } catch (error) {
      console.error(`Redis delete error for key ${key}:`, error);
    }
    
    this.stats.deletes++;
  }
  
  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;
    
    // Clear from L1 (memory)
    for (const key of this.l1Cache.keys()) {
      if (this.matchPattern(key, pattern)) {
        this.l1Cache.delete(key);
        count++;
      }
    }
    
    // Clear from L2 (Redis)
    try {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
        count += keys.length;
      }
    } catch (error) {
      console.error(`Redis pattern delete error for ${pattern}:`, error);
    }
    
    this.stats.deletes += count;
    return count;
  }
  
  /**
   * Match pattern (simple glob)
   */
  private matchPattern(str: string, pattern: string): boolean {
    const regex = pattern
      .split('*')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${regex}$`).test(str);
  }
  
  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    // Clear L1
    this.l1Cache.clear();
    
    // Clear L2 (only ASEMB keys)
    try {
      const keys = await this.redisClient.keys('asemb:*');
      if (keys && keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
    }
    
    // Reset stats
    this.stats = {
      hits: 0,
      hitsL1: 0,
      hitsL2: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      hitRateL1: 0,
      hitRateL2: 0,
      memoryUsage: 0,
      redisKeys: 0
    };
  }
  
  /**
   * Warm cache with frequently accessed data
   */
  async warmCache(
    items: Array<{ key: string; value: any; ttl?: number }>
  ): Promise<void> {
    const promises = items.map(item => 
      this.set(item.key, item.value, item.ttl)
    );
    
    await Promise.all(promises);
    console.log(`Warmed cache with ${items.length} items`);
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    // Update memory usage
    this.stats.memoryUsage = this.l1Cache.calculatedSize || 0;
    
    // Get Redis key count if circuit is not open
    if (this.circuitBreaker.getState().state !== CircuitState.OPEN) {
      try {
        const keys: string[] = await this.circuitBreaker.execute(
          () => this.redisClient.keys('asemb:*')
        );
        this.stats.redisKeys = keys ? keys.length : 0;
      } catch (error) {
        console.error('Error getting Redis stats:', error);
        this.stats.redisKeys = 0;
      }
    }
    
    return { ...this.stats };
  }
  
  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): { state: string; failures: number } {
    const status = this.circuitBreaker.getState();
    return {
      state: status.state,
      failures: status.failures
    };
  }
  
  /**
   * Reset circuit breaker (for manual recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    console.log('Circuit breaker manually reset');
  }
  
  /**
   * Update hit rate for all layers
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    
    const totalL1 = this.stats.hitsL1 + this.stats.misses;
    this.stats.hitRateL1 = totalL1 > 0 ? this.stats.hitsL1 / totalL1 : 0;
    
    const totalL2 = this.stats.hitsL2 + this.stats.misses;
    this.stats.hitRateL2 = totalL2 > 0 ? this.stats.hitsL2 / totalL2 : 0;
  }
}

/**
 * Cache invalidation strategies
 */
export class CacheInvalidator {
  private cache: CacheManager;
  
  constructor() {
    this.cache = CacheManager.getInstance();
  }
  
  /**
   * Invalidate on document change
   */
  async onDocumentChange(
    documentId: string,
    sourceId?: string
  ): Promise<void> {
    // Invalidate specific document
    await this.cache.invalidatePattern(`*:document:${documentId}`);
    
    // Invalidate search results containing this document
    await this.cache.invalidatePattern(`*:search:*`);
    
    // Invalidate source if provided
    if (sourceId) {
      await this.cache.invalidatePattern(`*:source:${sourceId}:*`);
    }
  }
  
  /**
   * Invalidate on source update
   */
  async onSourceUpdate(sourceId: string): Promise<void> {
    await this.cache.invalidatePattern(`*:source:${sourceId}:*`);
    await this.cache.invalidatePattern(`*:search:*`);
  }
  
  /**
   * Invalidate search cache
   */
  async onSearchIndexUpdate(): Promise<void> {
    await this.cache.invalidatePattern(`*:search:*`);
    await this.cache.invalidatePattern(`*:query:*`);
  }
  
  /**
   * Time-based invalidation
   */
  scheduleInvalidation(
    pattern: string,
    delayMs: number
  ): NodeJS.Timeout {
    return setTimeout(async () => {
      await this.cache.invalidatePattern(pattern);
      console.log(`Scheduled invalidation completed for pattern: ${pattern}`);
    }, delayMs);
  }
}

/**
 * Query result cache decorator
 */
export function Cacheable(
  namespace: string,
  ttl: number = 3600
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cache = CacheManager.getInstance();
      
      // Generate cache key from method name and arguments
      const key = cache.generateKey(
        namespace,
        { method: propertyKey, args },
        'method'
      );
      
      // Try cache first
      const cached = await cache.get(key);
      if (cached !== null) {
        return cached;
      }
      
      // Execute original method
      const result = await originalMethod.apply(this, args);
      
      // Cache result
      await cache.set(key, result, ttl);
      
      return result;
    };
    
    return descriptor;
  };
}

// Export singleton
export const cacheManager = CacheManager.getInstance();
export const cacheInvalidator = new CacheInvalidator();