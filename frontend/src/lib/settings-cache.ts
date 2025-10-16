// Settings Cache Layer
// Caches settings by category to reduce API calls and improve performance

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class SettingsCache {
  private cache = new Map<string, CacheEntry>();
  private defaultTTL = 60000; // 1 minute default TTL

  // Get cached settings
  get(category: string): any | null {
    const entry = this.cache.get(category);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(category);
      return null;
    }

    return entry.data;
  }

  // Set cached settings
  set(category: string, data: any, ttl?: number): void {
    this.cache.set(category, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  // Clear specific category
  clear(category: string): void {
    this.cache.delete(category);
  }

  // Clear all cache
  clearAll(): void {
    this.cache.clear();
  }

  // Invalidate cache when settings are updated
  invalidate(changedKey?: string): void {
    if (!changedKey) {
      // Clear all if unknown what changed
      this.clearAll();
      return;
    }

    // Determine which categories might be affected
    const affectedCategories: string[] = [];

    if (changedKey.includes('openai') || changedKey.includes('google') ||
        changedKey.includes('anthropic') || changedKey.includes('llm')) {
      affectedCategories.push('llm');
    }

    if (changedKey.includes('embedding') || changedKey.includes('chunk')) {
      affectedCategories.push('embeddings');
    }

    if (changedKey.includes('rag') || changedKey.includes('similarity') ||
        changedKey.includes('maxResults')) {
      affectedCategories.push('rag');
    }

    if (changedKey.includes('database') || changedKey.includes('db')) {
      affectedCategories.push('database');
    }

    if (changedKey.includes('security') || changedKey.includes('auth') ||
        changedKey.includes('jwt')) {
      affectedCategories.push('security');
    }

    // Clear affected categories
    affectedCategories.forEach(cat => this.clear(cat));
  }

  // Get cache stats
  getStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Date.now() - entry.timestamp
    }));

    return {
      size: this.cache.size,
      entries
    };
  }
}

// Export singleton instance
export const settingsCache = new SettingsCache();

// Cache decorator for API calls
export function withCache<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  getCacheKey: (...args: T) => string,
  ttl?: number
) {
  return async (...args: T): Promise<R> => {
    const cacheKey = getCacheKey(...args);

    // Try to get from cache
    const cached = settingsCache.get(cacheKey);
    if (cached !== null) {
      console.log(`📦 [CACHE] Hit for ${cacheKey}`);
      return cached;
    }

    // Call the function
    console.log(`🌐 [API] Miss for ${cacheKey}`);
    const result = await fn(...args);

    // Cache the result
    settingsCache.set(cacheKey, result, ttl);

    return result;
  };
}