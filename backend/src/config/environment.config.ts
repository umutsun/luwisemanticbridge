/**
 * Environment Configuration
 * Separates development and production settings
 * Date: 2025-01-22
 */

import dotenv from 'dotenv';
import path from 'path';

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_DEVELOPMENT = NODE_ENV === 'development';

// Load appropriate .env file
if (IS_DEVELOPMENT) {
  // In development, use local .env
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
} else {
  // In production, use instance-specific .env
  dotenv.config({ path: path.resolve(process.cwd(), '.env.lsemb') });
}

// Environment-specific configurations
export const config = {
  // Environment flags
  env: NODE_ENV,
  isProduction: IS_PRODUCTION,
  isDevelopment: IS_DEVELOPMENT,

  // Server config
  server: {
    port: parseInt(process.env.PORT || '8083'),
    host: process.env.HOST || 'localhost',
    url: process.env.API_URL || (IS_PRODUCTION
      ? 'https://api.lsemb.com'
      : 'http://localhost:8083'
    ),
  },

  // Database config
  database: {
    host: process.env.POSTGRES_HOST || (IS_PRODUCTION
      ? '91.99.229.96'
      : 'localhost'
    ),
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'lsemb',
    // Use connection string if provided
    url: process.env.DATABASE_URL,
    // Connection pool settings
    pool: {
      max: IS_PRODUCTION ? 20 : 5,
      min: IS_PRODUCTION ? 5 : 1,
      idleTimeoutMillis: IS_PRODUCTION ? 30000 : 10000,
      connectionTimeoutMillis: IS_PRODUCTION ? 10000 : 5000,
    }
  },

  // Redis config
  redis: {
    host: process.env.REDIS_HOST || (IS_PRODUCTION
      ? '127.0.0.1'
      : 'localhost'
    ),
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '2'),
    // Redis-specific settings
    retryStrategy: IS_PRODUCTION
      ? (times: number) => Math.min(times * 100, 3000)
      : (times: number) => Math.min(times * 50, 1000),
    maxRetriesPerRequest: IS_PRODUCTION ? 3 : 1,
    enableOfflineQueue: IS_PRODUCTION,
    lazyConnect: !IS_PRODUCTION,
  },

  // Logging config
  logging: {
    level: IS_PRODUCTION ? 'info' : 'debug',
    format: IS_PRODUCTION ? 'json' : 'pretty',
    errorTracking: IS_PRODUCTION,
    performanceMonitoring: IS_PRODUCTION,
  },

  // Security config
  security: {
    cors: {
      origin: IS_PRODUCTION
        ? process.env.CORS_ORIGIN || 'https://lsemb.com'
        : '*',
      credentials: true,
    },
    rateLimit: {
      enabled: IS_PRODUCTION,
      maxRequests: IS_PRODUCTION ? 100 : 1000,
      windowMs: 15 * 60 * 1000, // 15 minutes
    },
    helmet: {
      enabled: IS_PRODUCTION,
    },
  },

  // Cache config
  cache: {
    enabled: true,
    ttl: IS_PRODUCTION ? 86400 : 3600, // 24h in prod, 1h in dev
    maxSize: IS_PRODUCTION ? 1000 : 100,
    compressionEnabled: IS_PRODUCTION,
  },

  // AI Services config
  ai: {
    // API Keys (same for both environments, from env vars)
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      enabled: !!process.env.OPENAI_API_KEY,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: !!process.env.ANTHROPIC_API_KEY,
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY,
      enabled: !!process.env.GOOGLE_API_KEY,
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      enabled: !!process.env.DEEPSEEK_API_KEY,
    },
    // Rate limits
    rateLimits: {
      embeddings: IS_PRODUCTION ? 100 : 10, // per minute
      llm: IS_PRODUCTION ? 50 : 5, // per minute
    },
  },

  // Feature flags
  features: {
    // Disable certain features in development
    emailNotifications: IS_PRODUCTION,
    backgroundJobs: true,
    realTimeUpdates: true,
    advancedAnalytics: IS_PRODUCTION,
    debugMode: IS_DEVELOPMENT,
    hotReload: IS_DEVELOPMENT,
  },

  // Error handling
  errors: {
    exposeStack: IS_DEVELOPMENT,
    logToFile: IS_PRODUCTION,
    sentryEnabled: IS_PRODUCTION && !!process.env.SENTRY_DSN,
    sentryDsn: process.env.SENTRY_DSN,
  },

  // Performance
  performance: {
    // Prevent excessive restarts in development
    maxRestarts: IS_PRODUCTION ? 10 : 3,
    restartDelay: IS_PRODUCTION ? 1000 : 5000,
    // Memory limits
    maxMemory: IS_PRODUCTION ? '2GB' : '512MB',
    // Request timeouts
    requestTimeout: IS_PRODUCTION ? 30000 : 60000, // More lenient in dev
  },
};

// Instance-specific configuration
export const instanceConfig = {
  // Determine which instance we are (lsemb, emlakai, bookie, scriptus)
  instanceName: process.env.INSTANCE_NAME || 'lsemb',

  // Instance-specific Redis DB assignments
  redisDb: {
    'lsemb': 2,
    'emlakai': 1,
    'bookie': 4,
    'scriptus': 3,
  },

  // Instance-specific PostgreSQL databases
  postgresDb: {
    'lsemb': 'lsemb',
    'emlakai': 'emlakai_lsemb',
    'bookie': 'bookie_lsemb',
    'scriptus': 'scriptus_lsemb',
  },

  // Instance-specific ports
  ports: {
    'lsemb': { backend: 8080, frontend: 3000 },
    'emlakai': { backend: 8081, frontend: 3001 },
    'bookie': { backend: 8082, frontend: 3002 },
    'scriptus': { backend: 8086, frontend: 3006 },
  },
};

// Get instance-specific configuration
export function getInstanceConfig(instanceName?: string) {
  const instance = instanceName || instanceConfig.instanceName;
  return {
    name: instance,
    redisDb: instanceConfig.redisDb[instance] || 2,
    postgresDb: instanceConfig.postgresDb[instance] || 'lsemb',
    ports: instanceConfig.ports[instance] || { backend: 8080, frontend: 3000 },
  };
}

// Validate configuration
export function validateConfig() {
  const errors = [];

  // Check database connection
  if (!config.database.url && !config.database.password) {
    errors.push('Database password or connection URL required');
  }

  // Check Redis in production
  if (IS_PRODUCTION && !config.redis.password) {
    console.warn('⚠️ Redis password not set in production');
  }

  // Check AI services
  const hasAnyAI = config.ai.openai.enabled ||
                   config.ai.anthropic.enabled ||
                   config.ai.google.enabled ||
                   config.ai.deepseek.enabled;

  if (!hasAnyAI) {
    console.warn('⚠️ No AI service API keys configured');
  }

  // Check instance isolation
  const currentInstance = getInstanceConfig();
  console.log(`📦 Instance: ${currentInstance.name}`);
  console.log(`  - Redis DB: ${currentInstance.redisDb}`);
  console.log(`  - PostgreSQL: ${currentInstance.postgresDb}`);
  console.log(`  - Ports: Backend ${currentInstance.ports.backend}, Frontend ${currentInstance.ports.frontend}`);

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }

  return true;
}

// Export environment checks
export const isProduction = IS_PRODUCTION;
export const isDevelopment = IS_DEVELOPMENT;
export const nodeEnv = NODE_ENV;

// Default export
export default config;