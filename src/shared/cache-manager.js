const Redis = require('ioredis');

class CacheManager {
  constructor() {
    // Try to get Redis config from environment first
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT;
    const redisDb = process.env.REDIS_DB;
    const redisPassword = process.env.REDIS_PASSWORD;

    // If environment variables are set, use them
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    } else if (redisHost) {
      this.redis = new Redis({
        host: redisHost,
        port: parseInt(redisPort || '6379'),
        db: parseInt(redisDb || '0'),
        password: redisPassword
      });
    } else {
      // Fall back to defaults
      this.redis = new Redis({
        host: 'redis',
        port: 6379,
        db: 0,
        password: process.env.REDIS_PASSWORD
      });
    }

    // Handle Redis errors gracefully
    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  getRedisClient() {
    return this.redis;
  }

  async get(key) {
    const value = await this.redis.get(key);
    if (value) {
      this.stats.hits++;
      return JSON.parse(value);
    }
    this.stats.misses++;
    return null;
  }

  async set(key, value, ttl = 3600) {
    this.stats.sets++;
    return await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async del(key) {
    return await this.redis.del(key);
  }

  async getOrCompute(key, computeFn, options = {}) {
    const cached = await this.get(key);
    if (cached) return cached;
    
    const value = await computeFn();
    if (value !== null && value !== undefined) {
      await this.set(key, value, options.ttl || 3600);
    }
    return value;
  }

  async getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      totalOperations: this.stats.hits + this.stats.misses + this.stats.sets
    };
  }
}

const cacheManager = new CacheManager();

module.exports = { cacheManager };