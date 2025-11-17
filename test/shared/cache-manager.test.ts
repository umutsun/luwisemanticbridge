import { CacheManager, CacheStats, cacheInvalidator } from '../../src/shared/cache-manager';

// Mock Redis client
jest.mock('../../src/shared/redis-config', () => {
  return {
    EnhancedRedis: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      ping: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue(true),
      getHealthStatus: jest.fn().mockReturnValue({ healthy: true, lastError: null }),
      safeExecute: jest.fn().mockImplementation(async (operation, command) => command()),
      on: jest.fn()
    }))
  };
});

// Mock RedisPool
jest.mock('../../src/shared/connection-pool', () => {
  return {
    RedisPool: {
      getInstance: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue({
          get: jest.fn(),
          setex: jest.fn(),
          del: jest.fn(),
          keys: jest.fn()
        })
      })
    }
  };
});

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = CacheManager.getInstance();
    mockRedis = (cacheManager as any).redisClient;
    
    // Reset cache stats before each test
    cacheManager.clear();
  });

  describe('Basic Operations', () => {
    it('should set and get value from L1 cache', async () => {
      const testValue = { data: 'test', count: 42 };
      
      await cacheManager.set('test-key', testValue, 60);
      const result = await cacheManager.get('test-key');
      
      expect(result).toEqual(testValue);
    });

    it('should return null for non-existent key', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete key from cache', async () => {
      await cacheManager.set('delete-test', 'value', 60);
      await cacheManager.delete('delete-test');
      
      const result = await cacheManager.get('delete-test');
      expect(result).toBeNull();
    });
  });

  describe('Multi-layer Cache Strategy', () => {
    it('should hit L1 cache first', async () => {
      const testValue = 'l1-cache-hit';
      await cacheManager.set('l1-test', testValue, 60);
      
      const result = await cacheManager.get('l1-test');
      expect(result).toBe(testValue);
    });

    it('should fallback to L2 cache when L1 misses', async () => {
      const testValue = 'l2-cache-hit';
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(testValue));
      
      const result = await cacheManager.get('l2-test');
      expect(result).toBe(testValue);
      expect(mockRedis.get).toHaveBeenCalledWith('l2-test');
    });

    it('should promote L2 hit to L1 cache', async () => {
      const testValue = 'promote-to-l1';
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(testValue));
      
      await cacheManager.get('promote-test');
      // Second call should hit L1
      const result = await cacheManager.get('promote-test');
      
      expect(result).toBe(testValue);
      expect(mockRedis.get).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('Cache Statistics', () => {
    it('should track L1 cache hits', async () => {
      await cacheManager.set('stats-test', 'value', 60);
      await cacheManager.get('stats-test');
      
      const stats = await cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.hitsL1).toBe(1);
      expect(stats.hitRateL1).toBeGreaterThan(0);
    });

    it('should track L2 cache hits', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify('l2-value'));
      
      await cacheManager.get('l2-stats-test');
      const stats = await cacheManager.getStats();
      
      expect(stats.hits).toBe(1);
      expect(stats.hitsL2).toBe(1);
      expect(stats.hitRateL2).toBeGreaterThan(0);
    });

    it('should track cache misses', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      
      await cacheManager.get('miss-test');
      const stats = await cacheManager.getStats();
      
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate correct hit rates', async () => {
      // Setup some hits and misses
      await cacheManager.set('hit1', 'value', 60);
      await cacheManager.get('hit1'); // L1 hit
      
      mockRedis.get.mockResolvedValueOnce(JSON.stringify('l2-value'));
      await cacheManager.get('hit2'); // L2 hit
      
      mockRedis.get.mockResolvedValueOnce(null);
      await cacheManager.get('miss1'); // Miss
      
      const stats = await cacheManager.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.hitsL1).toBe(1);
      expect(stats.hitsL2).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.67, 2); // 2/3
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection failed'));
      
      // Should not throw, should return null
      const result = await cacheManager.get('error-test');
      expect(result).toBeNull();
    });

    it('should use stale cache when Redis is unavailable', async () => {
      // First set a value
      await cacheManager.set('stale-test', 'stale-value', 1); // 1 second TTL
      
      // Mock Redis error
      mockRedis.get.mockRejectedValue(new Error('Redis unavailable'));
      
      // Should return stale value from L1
      const result = await cacheManager.get('stale-test', { stale: true });
      expect(result).toBe('stale-value');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate by pattern', async () => {
      await cacheManager.set('test:user:1', 'user1', 60);
      await cacheManager.set('test:user:2', 'user2', 60);
      await cacheManager.set('test:product:1', 'product1', 60);
      
      mockRedis.keys.mockResolvedValue(['test:user:1', 'test:user:2']);
      mockRedis.del.mockResolvedValue(2);
      
      const count = await cacheManager.invalidatePattern('test:user:*');
      expect(count).toBe(4);
    });

    it('should clear all cache', async () => {
      await cacheManager.set('clear-test1', 'value1', 60);
      await cacheManager.set('clear-test2', 'value2', 60);
      
      mockRedis.keys.mockResolvedValue(['asemb:clear-test1', 'asemb:clear-test2']);
      mockRedis.del.mockResolvedValue(2);

      await cacheManager.clear();

      // Mock keys to return empty for getStats call
      mockRedis.keys.mockResolvedValue([]);
      const stats = await cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.redisKeys).toBe(0);
    });
  });

  describe('getOrCompute', () => {
    it('should compute and cache value on miss', async () => {
      const computeFn = jest.fn().mockResolvedValue('computed-value');
      
      const result = await cacheManager.getOrCompute('compute-test', computeFn);
      
      expect(result).toBe('computed-value');
      expect(computeFn).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const cachedResult = await cacheManager.getOrCompute('compute-test', computeFn);
      expect(cachedResult).toBe('computed-value');
      expect(computeFn).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should use stale cache when computation fails', async () => {
      // First set a value
      await cacheManager.set('stale-compute-test', 'stale-value', 60);
      
      const computeFn = jest.fn().mockRejectedValue(new Error('Computation failed'));
      
      const result = await cacheManager.getOrCompute('stale-compute-test', computeFn, { stale: true, ttl: 60 });
      expect(result).toBe('stale-value');
    });
  });
});

describe('CacheInvalidator', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = CacheManager.getInstance();
    jest.spyOn(cacheManager, 'invalidatePattern');
  });

  it('should invalidate document cache', async () => {
    await cacheInvalidator.onDocumentChange('doc-123', 'source-456');
    
    expect(cacheManager.invalidatePattern).toHaveBeenCalledWith('*:document:doc-123');
    expect(cacheManager.invalidatePattern).toHaveBeenCalledWith('*:search:*');
    expect(cacheManager.invalidatePattern).toHaveBeenCalledWith('*:source:source-456:*');
  });

  it('should invalidate source cache', async () => {
    await cacheInvalidator.onSourceUpdate('source-789');
    
    expect(cacheManager.invalidatePattern).toHaveBeenCalledWith('*:source:source-789:*');
    expect(cacheManager.invalidatePattern).toHaveBeenCalledWith('*:search:*');
  });

  it('should schedule invalidation', async () => {
    jest.useFakeTimers();
    
    const timeout = cacheInvalidator.scheduleInvalidation('test:*', 1000);
    
    jest.advanceTimersByTime(1000);
    
    expect(cacheManager.invalidatePattern).toHaveBeenCalledWith('test:*');
    
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});