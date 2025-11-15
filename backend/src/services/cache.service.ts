// High-Performance Cache Service for Settings
// Implements LRU cache with TTL for 5x performance improvement

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
}

class SettingsCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000; // Max entries
  private defaultTTL = 30000; // 30 seconds
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  // Get cached data
  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  // Set cached data
  set(key: string, data: any, ttl?: number): void {
    // Check if we need to evict
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0
    });
  }

  // Delete specific key
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  // Clear entries matching pattern
  clearPattern(pattern: string): number {
    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  // Evict LRU entries
  private evictLRU(): void {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  // Get cache stats
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      memoryUsage: this.getMemoryUsage()
    };
  }

  // Estimate memory usage
  private getMemoryUsage(): string {
    let totalSize = 0;
    for (const [key, entry] of this.cache) {
      totalSize += key.length * 2; // UTF-16
      totalSize += JSON.stringify(entry.data).length * 2;
    }
    return (totalSize / 1024).toFixed(2) + ' KB';
  }

  // Cleanup expired entries
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Export singleton
export const settingsCache = new SettingsCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const cleaned = settingsCache.cleanup();
  if (cleaned > 0) {
    console.log(`️ [CACHE] Cleaned ${cleaned} expired entries`);
  }
}, 300000);