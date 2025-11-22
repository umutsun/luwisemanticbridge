/**
 * Simplified Redis Configuration
 * Tek bir bağlantı yolu, gereksiz fallback'ler kaldırıldı
 * VERİ KAYBI YOK - Mevcut Redis data korunur
 */

import Redis from "ioredis";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

// Redis configuration from environment
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  db: parseInt(process.env.REDIS_DB || "2"),
  password: process.env.REDIS_PASSWORD || undefined,

  // Connection settings
  connectTimeout: 10000,
  commandTimeout: 5000,
  maxRetriesPerRequest: 3,

  // Retry strategy
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 attempts');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 1000, 3000);
    logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },

  // Error handling
  enableOfflineQueue: true,  // Queue commands when offline
  lazyConnect: false,  // Connect immediately
};

// Single Redis instance (no complex fallbacks)
let redisInstance: Redis | null = null;
let subscriberInstance: Redis | null = null;

/**
 * Initialize Redis connections
 * Simple, straightforward, no complex fallbacks
 */
export async function initializeRedis(): Promise<Redis | null> {
  try {
    // Log configuration (without password)
    logger.info('Initializing Redis', {
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port,
      db: REDIS_CONFIG.db,
      hasPassword: !!REDIS_CONFIG.password
    });

    // Create main connection
    redisInstance = new Redis(REDIS_CONFIG);

    // Create subscriber (duplicate of main)
    subscriberInstance = redisInstance.duplicate();

    // Set up event handlers
    redisInstance.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisInstance.on('ready', () => {
      logger.info('Redis ready to accept commands');
    });

    redisInstance.on('error', (err) => {
      logger.error('Redis error:', err.message);
      // Don't crash - let retry strategy handle it
    });

    subscriberInstance.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    subscriberInstance.on('error', (err) => {
      logger.error('Redis subscriber error:', err.message);
      // Don't crash - let retry strategy handle it
    });

    // Test connection
    await redisInstance.ping();
    logger.info('Redis ping successful');

    return redisInstance;

  } catch (error) {
    logger.error('Failed to initialize Redis:', error);

    // Redis is optional - app can work without it
    // Return null to indicate Redis unavailable
    redisInstance = null;
    subscriberInstance = null;

    return null;
  }
}

/**
 * Get Redis instance
 * Returns null if Redis not available
 */
export function getRedis(): Redis | null {
  if (!redisInstance) {
    logger.warn('Redis not initialized');
  }
  return redisInstance;
}

/**
 * Get subscriber instance
 * Returns null if Redis not available
 */
export function getSubscriber(): Redis | null {
  if (!subscriberInstance) {
    logger.warn('Redis subscriber not initialized');
  }
  return subscriberInstance;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisInstance !== null && redisInstance.status === 'ready';
}

/**
 * Safe Redis operations with null checks
 * Use these instead of direct redis calls
 */
export const safeRedis = {
  async get(key: string): Promise<string | null> {
    if (!isRedisAvailable()) return null;
    try {
      return await redisInstance!.get(key);
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  },

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      if (ttl) {
        await redisInstance!.setex(key, ttl, value);
      } else {
        await redisInstance!.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      await redisInstance!.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return false;
    }
  },

  async hget(key: string, field: string): Promise<string | null> {
    if (!isRedisAvailable()) return null;
    try {
      return await redisInstance!.hget(key, field);
    } catch (error) {
      logger.error('Redis HGET error:', error);
      return null;
    }
  },

  async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      await redisInstance!.hset(key, field, value);
      return true;
    } catch (error) {
      logger.error('Redis HSET error:', error);
      return false;
    }
  },

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!isRedisAvailable()) return false;
    try {
      await redisInstance!.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Redis EXPIRE error:', error);
      return false;
    }
  }
};

/**
 * Graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  logger.info('Closing Redis connections...');

  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }

  if (subscriberInstance) {
    await subscriberInstance.quit();
    subscriberInstance = null;
  }

  logger.info('Redis connections closed');
}

// Export instances for backward compatibility
// But recommend using getRedis() and safeRedis instead
export { redisInstance as redis, subscriberInstance as subscriber };

// Default export
export default {
  initializeRedis,
  getRedis,
  getSubscriber,
  isRedisAvailable,
  safeRedis,
  closeRedis
};