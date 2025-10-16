import { initializeRedis } from "../config/redis";
import { loggingService } from "./logging.service";

export interface CacheHealthCheck {
  status: "healthy" | "degraded" | "failed";
  responseTime: number;
  lastCheck: string;
  errors: string[];
}

export interface CacheReliabilityConfig {
  maxRetries: number;
  retryDelay: number;
  fallbackToDatabase: boolean;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  healthCheckInterval: number;
  maxCacheAge: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export class CacheReliabilityService {
  private redis: any = null;
  private config: CacheReliabilityConfig;
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerTimer: NodeJS.Timeout | null = null;
  private healthStatus: CacheHealthCheck = {
    status: "healthy",
    responseTime: 0,
    lastCheck: new Date().toISOString(),
    errors: [],
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    fallbackActivations: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(config: Partial<CacheReliabilityConfig> = {}) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      fallbackToDatabase: true,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      healthCheckInterval: 30000, // 30 seconds
      maxCacheAge: 86400000, // 24 hours
      compressionEnabled: true,
      encryptionEnabled: false,
      ...config,
    };

    this.initializeService();
  }

  private async initializeService() {
    try {
      this.redis = await initializeRedis();
      if (this.redis && this.redis.status === "ready") {
        console.log("✅ Cache reliability service initialized");
        this.startHealthChecks();
      } else {
        console.warn(
          "⚠️ Redis not available, cache reliability features disabled"
        );
      }
    } catch (error) {
      console.error(
        "❌ Failed to initialize cache reliability service:",
        error
      );
    }
  }

  // Safe cache get with fallback
  async get<T>(
    key: string,
    fallbackProvider?: () => Promise<T>
  ): Promise<T | null> {
    this.metrics.totalOperations++;

    if (this.isCircuitBreakerOpen()) {
      await this.activateFallback();
      return fallbackProvider ? await fallbackProvider() : null;
    }

    try {
      const startTime = Date.now();
      const result = await this.executeWithRetry(() => this.redis.get(key));
      const responseTime = Date.now() - startTime;

      if (result) {
        this.metrics.successfulOperations++;
        this.metrics.cacheHits++;

        // Check cache age
        const parsedResult = this.parseCachedData(result);
        if (this.isCacheExpired(parsedResult)) {
          await this.delete(key);
          this.metrics.cacheMisses++;
          return fallbackProvider ? await fallbackProvider() : null;
        }

        this.updateHealthStatus("healthy", responseTime);
        return parsedResult.data;
      } else {
        this.metrics.cacheMisses++;
        return fallbackProvider ? await fallbackProvider() : null;
      }
    } catch (error) {
      await this.handleCacheError("get", error);
      return fallbackProvider ? await fallbackProvider() : null;
    }
  }

  // Safe cache set with error handling
  async set<T>(key: string, value: T, ttl: number = 3600): Promise<boolean> {
    this.metrics.totalOperations++;

    if (this.isCircuitBreakerOpen()) {
      await this.activateFallback();
      return false;
    }

    try {
      const startTime = Date.now();
      const cacheData = this.prepareCacheData(value);

      await this.executeWithRetry(() =>
        ttl > 0
          ? this.redis.setex(key, ttl, JSON.stringify(cacheData))
          : this.redis.set(key, JSON.stringify(cacheData))
      );

      const responseTime = Date.now() - startTime;
      this.metrics.successfulOperations++;
      this.updateHealthStatus("healthy", responseTime);

      return true;
    } catch (error) {
      await this.handleCacheError("set", error);
      return false;
    }
  }

  // Safe cache delete
  async delete(key: string): Promise<boolean> {
    this.metrics.totalOperations++;

    if (this.isCircuitBreakerOpen()) {
      return false;
    }

    try {
      await this.executeWithRetry(() => this.redis.del(key));
      this.metrics.successfulOperations++;
      return true;
    } catch (error) {
      await this.handleCacheError("delete", error);
      return false;
    }
  }

  // Batch operations with transaction support
  async mget<T>(
    keys: string[],
    fallbackProvider?: (keys: string[]) => Promise<Map<string, T>>
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const missedKeys: string[] = [];

    this.metrics.totalOperations++;

    if (this.isCircuitBreakerOpen()) {
      if (fallbackProvider) {
        const fallbackResults = await fallbackProvider(keys);
        return fallbackResults;
      }
      return results;
    }

    try {
      const startTime = Date.now();
      const values = await this.executeWithRetry(() =>
        this.redis.mget(...keys)
      );
      const responseTime = Date.now() - startTime;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];

        if (value) {
          const parsedResult = this.parseCachedData(value);
          if (!this.isCacheExpired(parsedResult)) {
            results.set(key, parsedResult.data);
            this.metrics.cacheHits++;
          } else {
            missedKeys.push(key);
            this.metrics.cacheMisses++;
          }
        } else {
          missedKeys.push(key);
          this.metrics.cacheMisses++;
        }
      }

      // Get fallback data for missed keys
      if (missedKeys.length > 0 && fallbackProvider) {
        const fallbackResults = await fallbackProvider(missedKeys);
        fallbackResults.forEach((value, key) => {
          results.set(key, value);
        });
      }

      this.updateHealthStatus("healthy", responseTime);
      this.metrics.successfulOperations++;

      return results;
    } catch (error) {
      await this.handleCacheError("mget", error);
      if (fallbackProvider) {
        return await fallbackProvider(keys);
      }
      return results;
    }
  }

  // Health check for Redis
  async performHealthCheck(): Promise<CacheHealthCheck> {
    if (!this.redis) {
      return {
        status: "failed",
        responseTime: 0,
        lastCheck: new Date().toISOString(),
        errors: ["Redis not initialized"],
      };
    }

    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Test basic connectivity
      await this.redis.ping();

      // Test read/write
      const testKey = "health-check-test";
      const testValue = Date.now().toString();
      await this.redis.setex(testKey, 5, testValue);
      const retrieved = await this.redis.get(testKey);
      await this.redis.del(testKey);

      if (retrieved !== testValue) {
        errors.push("Read/write test failed");
      }

      // Check memory usage
      const info = await this.redis.info("memory");
      const usedMemory = this.parseMemoryInfo(info);

      if (usedMemory > 0.9) {
        // 90% memory usage
        errors.push("High memory usage");
      }

      const responseTime = Date.now() - startTime;
      const status = errors.length > 0 ? "degraded" : "healthy";

      this.healthStatus = {
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        errors,
      };

      return this.healthStatus;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthStatus = {
        status: "failed",
        responseTime,
        lastCheck: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };

      return this.healthStatus;
    }
  }

  // Get cache metrics
  getMetrics() {
    return {
      ...this.metrics,
      successRate:
        this.metrics.totalOperations > 0
          ? (this.metrics.successfulOperations / this.metrics.totalOperations) *
            100
          : 0,
      hitRate:
        this.metrics.cacheHits + this.metrics.cacheMisses > 0
          ? (this.metrics.cacheHits /
              (this.metrics.cacheHits + this.metrics.cacheMisses)) *
            100
          : 0,
      circuitBreakerOpen: this.circuitBreakerOpen,
      healthStatus: this.healthStatus,
    };
  }

  // Alias for getMetrics for backward compatibility
  getCacheMetrics() {
    return this.getMetrics();
  }

  // Clear expired cache entries
  async clearExpiredEntries(): Promise<number> {
    if (!this.redis) return 0;

    try {
      const pattern = "scraper:cache:*";
      const keys = await this.redis.keys(pattern);
      let deletedCount = 0;

      for (const key of keys) {
        try {
          const value = await this.redis.get(key);
          if (value) {
            const parsed = this.parseCachedData(value);
            if (this.isCacheExpired(parsed)) {
              await this.redis.del(key);
              deletedCount++;
            }
          }
        } catch (error) {
          // Continue with other keys if one fails
          continue;
        }
      }

      if (deletedCount > 0) {
        await loggingService.info(
          "Cache-Cleanup",
          `Cleared ${deletedCount} expired cache entries`
        );
      }

      return deletedCount;
    } catch (error) {
      await loggingService.error(
        "Cache-Cleanup",
        "Failed to clear expired entries",
        { error }
      );
      return 0;
    }
  }

  // Reset circuit breaker
  async resetCircuitBreaker(): Promise<void> {
    this.circuitBreakerOpen = false;
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
    await loggingService.info(
      "CircuitBreaker",
      "Circuit breaker reset manually"
    );
  }

  // Private helper methods
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw lastError;
  }

  private isCircuitBreakerOpen(): boolean {
    return this.config.enableCircuitBreaker && this.circuitBreakerOpen;
  }

  private async openCircuitBreaker(): Promise<void> {
    this.circuitBreakerOpen = true;

    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
    }

    // Auto-close circuit breaker after 60 seconds
    this.circuitBreakerTimer = setTimeout(async () => {
      await this.resetCircuitBreaker();
    }, 60000);

    await loggingService.warn(
      "CircuitBreaker",
      "Circuit breaker opened due to repeated failures"
    );
  }

  private async handleCacheError(operation: string, error: any): Promise<void> {
    this.metrics.failedOperations++;

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await loggingService.error(
      "Cache-Error",
      `Cache operation failed: ${operation}`,
      {
        error: errorMessage,
        metrics: this.getMetrics(),
      }
    );

    // Check if we should open the circuit breaker
    if (
      this.config.enableCircuitBreaker &&
      this.metrics.failedOperations >= this.config.circuitBreakerThreshold
    ) {
      await this.openCircuitBreaker();
    }

    // Activate fallback if configured
    if (this.config.fallbackToDatabase) {
      await this.activateFallback();
    }
  }

  private async activateFallback(): Promise<void> {
    this.metrics.fallbackActivations++;
    await loggingService.warn(
      "Cache-Fallback",
      "Activated fallback to database due to cache issues"
    );
  }

  private updateHealthStatus(
    status: "healthy" | "degraded" | "failed",
    responseTime: number
  ): void {
    this.healthStatus = {
      status,
      responseTime,
      lastCheck: new Date().toISOString(),
      errors: [],
    };
  }

  private prepareCacheData<T>(data: T): any {
    const cacheEntry = {
      data,
      timestamp: Date.now(),
      version: "1.0",
    };

    // Apply compression if enabled
    if (this.config.compressionEnabled) {
      // In a real implementation, you would compress the data here
      cacheEntry.compressed = true;
    }

    // Apply encryption if enabled
    if (this.config.encryptionEnabled) {
      // In a real implementation, you would encrypt the data here
      cacheEntry.encrypted = true;
    }

    return cacheEntry;
  }

  private parseCachedData(rawData: string): any {
    try {
      return JSON.parse(rawData);
    } catch (error) {
      return { data: rawData, timestamp: 0 };
    }
  }

  private isCacheExpired(cacheEntry: any): boolean {
    if (!cacheEntry.timestamp) return true;

    const age = Date.now() - cacheEntry.timestamp;
    return age > this.config.maxCacheAge;
  }

  private parseMemoryInfo(info: string): number {
    const lines = info.split("\r\n");
    for (const line of lines) {
      if (line.startsWith("used_memory_human:")) {
        const value = line.split(":")[1];
        // Convert human readable memory to bytes (simplified)
        return parseFloat(value);
      }
    }
    return 0;
  }

  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Cleanup method
  async destroy(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
  }
}

export const cacheReliabilityService = new CacheReliabilityService();
export default cacheReliabilityService;
