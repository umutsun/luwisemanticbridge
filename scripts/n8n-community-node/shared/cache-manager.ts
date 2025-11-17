// Minimal in-memory cache manager for the isolated n8n package

type AnyObject = Record<string, any>;

class SimpleCacheManager {
  private store = new Map<string, any>();
  private timers = new Map<string, NodeJS.Timeout>();

  generateKey(namespace: string, payload: AnyObject): string {
    try {
      const stable = JSON.stringify(payload, Object.keys(payload).sort());
      return `${namespace}:${stable}`;
    } catch {
      return `${namespace}:${Date.now()}`;
    }
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T = any>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    this.store.set(key, value);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }
    if (ttlSeconds > 0) {
      const t = setTimeout(() => {
        this.store.delete(key);
        this.timers.delete(key);
      }, ttlSeconds * 1000);
      this.timers.set(key, t);
    }
  }
}

export const cacheManager = new SimpleCacheManager();

