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
    port: parseInt(process.env.REDIS_PORT || '6379'), // Force use of env port 6379
    db: (redisConfig as any).db || parseInt(process.env.REDIS_DB || '2'),
    // Enable authentication with password from environment
    password: (redisConfig as any).password || process.env.REDIS_PASSWORD || undefined,
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

  // Debug log for Redis configuration
  console.log('🔍 Redis Configuration Debug:', {
    host: config.host,
    port: config.port,
    db: config.db,
    hasPassword: !!config.password,
    passwordLength: config.password ? config.password.length : 0,
    envPassword: process.env.REDIS_PASSWORD,
    envPasswordLength: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD.length : 0
  });

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

  // Try with password first, then without password if NOAUTH error
  try {
    console.log('🔄 Attempting Redis connection with password...');
    redis = await createRedisConnection();
    subscriber = redis.duplicate();

    // Error handlers - prevent unhandled errors
    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
      // If NOAUTH error, try without password
      if (err.message.includes('NOAUTH') || err.message.includes('ECONNREFUSED')) {
        console.log('🔄 NOAUTH/ECONNREFUSED error detected, trying without password...');
        fallbackToNoAuth();
      }
    });

    subscriber.on('error', (err) => {
      console.error('Redis subscriber connection error:', err.message);
      if (err.message.includes('NOAUTH') || err.message.includes('ECONNREFUSED')) {
        fallbackToNoAuth();
      }
    });

    // Add warning handler for better debugging
    redis.on('warning', (warn) => {
      console.warn('Redis warning:', warn);
    });

    subscriber.on('warning', (warn) => {
      console.warn('Redis subscriber warning:', warn);
    });

    redis.on('connect', () => {
      console.log('✅ Redis connected successfully.');
    });

    subscriber.on('connect', () => {
      console.log('✅ Redis subscriber connected successfully.');
    });

    // Try to establish connection
    await redis.connect();
    await subscriber.connect();

    return redis;

  } catch (error) {
    console.error('❌ Failed to initialize Redis connections:', error);
    // Check if it's a NOAUTH or connection error and try without password
    if (error instanceof Error && (error.message.includes('NOAUTH') || error.message.includes('ECONNREFUSED'))) {
      console.log('🔄 NOAUTH/ECONNREFUSED error in initial connection, trying without password...');
      return fallbackToNoAuth();
    }
    // Create dummy Redis objects that gracefully fail
    redis = createFallbackRedis();
    subscriber = createFallbackRedis();
    return redis;
  }
}

// Fallback function to try without password
function fallbackToNoAuth() {
  console.log('🔄 Creating Redis connection without password...');
  try {
    const noAuthConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'), // Force use of env port 6379
      db: parseInt(process.env.REDIS_DB || '2'),
      // No password for fallback
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 10000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    };

    console.log('🔍 Redis No-Auth Configuration:', {
      host: noAuthConfig.host,
      port: noAuthConfig.port,
      db: noAuthConfig.db,
      hasPassword: false
    });

    redis = new Redis(noAuthConfig);
    subscriber = redis.duplicate();

    redis.on('error', (err) => {
      console.error('Redis no-auth connection error:', err.message);
    });

    subscriber.on('error', (err) => {
      console.error('Redis subscriber no-auth connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('✅ Redis no-auth connection successful.');
    });

    subscriber.on('connect', () => {
      console.log('✅ Redis subscriber no-auth connection successful.');
    });

    // Try to connect
    redis.connect().catch(err => {
      console.error('Redis no-auth connect failed:', err.message);
    });
    subscriber.connect().catch(err => {
      console.error('Redis subscriber no-auth connect failed:', err.message);
    });

    return redis;
  } catch (error) {
    console.error('❌ No-auth fallback also failed:', error);
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
