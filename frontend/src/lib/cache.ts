interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();

  set<T>(key: string, data: T, ttl: number = 300000): void { // Default 5 minutes
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Clean up expired entries periodically
    this.cleanup();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance
export const cache = new CacheManager();

// React hook for caching
export function useCache<T>(key: string, fetcher: () => Promise<T>, ttl?: number) {
  const [data, setData] = useState<T | null>(cache.get<T>(key));
  const [loading, setLoading] = useState(!cache.has(key));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cache.has(key)) {
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await fetcher();
        if (isMounted) {
          cache.set(key, result, ttl);
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [key, fetcher, ttl]);

  return { data, loading, error, refetch: () => cache.delete(key) };
}

// Cache utility functions
export const memoize = <T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  ttl?: number
): T => {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    const cached = cache.get<ReturnType<T>>(key);

    if (cached) {
      return cached;
    }

    const result = fn(...args);
    cache.set(key, result, ttl);
    return result;
  }) as T;
};

// Prefetch utility
export const prefetch = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<void> => {
  try {
    const data = await fetcher();
    cache.set(key, data, ttl);
  } catch (error) {
    console.error('Prefetch failed:', error);
  }
};