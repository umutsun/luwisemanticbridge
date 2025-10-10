import Redis from 'ioredis';
import dotenv from 'dotenv';
import { SettingsService } from '../services/settings.service';

dotenv.config();

// Create Redis connection with dynamic configuration
async function createRedisConnection() {
  let redisConfig = {};

  // Try to get Redis config from settings database, but don't fail if database is not available
  try {
    const settingsService = SettingsService.getInstance();
    const portConfig = await settingsService.getPortConfig();
    redisConfig = portConfig.redis || {};
  } catch (error) {
    console.log('⚠️ Could not load Redis config from database, using environment variables');
    // Use empty config to fall back to environment variables
  }

  const config: any = {
    host: (redisConfig as any).host || process.env.REDIS_HOST || 'localhost',
    port: (redisConfig as any).port || parseInt(process.env.REDIS_PORT || '6380'),
    db: (redisConfig as any).db || parseInt(process.env.REDIS_DB || '2'),
    // Temporarily disable authentication to prevent crashes
    // password: redisConfig.password || process.env.REDIS_PASSWORD || 'Semsiye!22',
    // Add retry strategy for more robust connection
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Add connection timeout
    connectTimeout: 10000,
    commandTimeout: 5000,
    // Handle errors gracefully
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    // Disable reconnect to prevent error loops
    enableOfflineQueue: false,
  };

  return new Redis(config);
}

// Initialize Redis connections
let redis: Redis;
let subscriber: Redis;

// Async initialization function
export async function initializeRedis() {
  // Check if already initialized
  if (redis && redis.status === 'ready') {
    return redis;
  }

  try {
    redis = await createRedisConnection();
    subscriber = redis.duplicate();

    // Error handlers - prevent unhandled errors
    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
      // Don't rethrow to prevent crashes
    });

    subscriber.on('error', (err) => {
      console.error('Redis subscriber connection error:', err.message);
      // Don't rethrow to prevent crashes
    });

    // Add warning handler for better debugging
    redis.on('warning', (warn) => {
      console.warn('Redis warning:', warn);
    });

    subscriber.on('warning', (warn) => {
      console.warn('Redis subscriber warning:', warn);
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully.');
    });

    subscriber.on('connect', () => {
      console.log('Redis subscriber connected successfully.');
    });

    // Try to establish connection
    await redis.connect();
    await subscriber.connect();

    return redis;

  } catch (error) {
    console.error('Failed to initialize Redis connections:', error);
    // Create dummy Redis objects that gracefully fail
    redis = createFallbackRedis();
    subscriber = createFallbackRedis();
    return redis;
  }
}

// Create fallback Redis client that doesn't crash the application
function createFallbackRedis(): Redis {
  const dummyRedis = new Redis({
    host: 'localhost',
    port: 6379, // Use default Redis port
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: 5000,
  });

  dummyRedis.on('error', (err) => {
    // Silently handle errors to prevent crashes
  });

  return dummyRedis;
}

// Synchronous export for backward compatibility
// Note: These will be null until initializeRedis() is called
export { redis, subscriber };
