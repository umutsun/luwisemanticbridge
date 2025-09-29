import Redis from 'ioredis';
import dotenv from 'dotenv';
import { SettingsService } from '../services/settings.service';

dotenv.config();

// Create Redis connection with dynamic configuration
async function createRedisConnection() {
  // First try to get Redis config from settings
  const settingsService = SettingsService.getInstance();
  const portConfig = await settingsService.getPortConfig();

  // Use settings from database if available, otherwise fall back to environment variables
  const redisConfig = portConfig.redis || {};

  return new Redis({
    host: redisConfig.host || process.env.REDIS_HOST || 'localhost',
    port: redisConfig.port || parseInt(process.env.REDIS_PORT || '6379'),
    db: redisConfig.db || parseInt(process.env.REDIS_DB || '2'),
    password: redisConfig.password || process.env.REDIS_PASSWORD,
    // Add retry strategy for more robust connection
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });
}

// Initialize Redis connections
let redis: Redis;
let subscriber: Redis;

// Async initialization function
export async function initializeRedis() {
  redis = await createRedisConnection();
  subscriber = redis.duplicate();

  // Error handlers
  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  subscriber.on('error', (err) => {
    console.error('Redis subscriber connection error:', err);
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully.');
  });

  subscriber.on('connect', () => {
    console.log('Redis subscriber connected successfully.');
  });
}

// Synchronous export for backward compatibility
// Note: These will be null until initializeRedis() is called
export { redis, subscriber };
