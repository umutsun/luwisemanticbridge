import { Redis, RedisOptions } from 'ioredis';
import { AsembError, ErrorCode } from '../errors/AsembError';

/**
 * Redis configuration with enhanced error handling and retry strategies
 */
export const redisConfig: RedisOptions = {
  // Connection settings
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Retry strategy for connection failures
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('Redis connection failed after 10 attempts');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 100, 3000); // Exponential backoff with max 3s
    return delay;
  },
  
  // Reconnect on specific errors
  reconnectOnError: (err: Error) => {
    const targetErrors = [
      'READONLY', 
      'ECONNRESET', 
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH'
    ];
    
    if (targetErrors.some(error => err.message.includes(error))) {
      console.warn(`Redis reconnecting due to error: ${err.message}`);
      return true;
    }
    return false;
  },
  
  // Connection timeout
  connectTimeout: 10000, // 10 seconds
  
  // Keep alive to prevent connection drops
  keepAlive: 10000, // 10 seconds
  
  // Enable auto pipelining for better performance
  enableAutoPipelining: true,
  
  // Max retries per request
  maxRetriesPerRequest: 3,
  
  // Enable offline queue
  enableOfflineQueue: true,
  
  // Command timeout
  commandTimeout: 5000, // 5 seconds
};

/**
 * Enhanced Redis client with health checks and error handling
 */
export class EnhancedRedis extends Redis {
  private isHealthy: boolean = true;
  private lastError: Error | null = null;
  
  constructor(options?: RedisOptions) {
    super({ ...redisConfig, ...options });
    
    this.setupEventHandlers();
  }
  
  private setupEventHandlers(): void {
    this.on('error', (err: Error) => {
      console.error(`Redis error: ${err.message}`, err);
      this.isHealthy = false;
      this.lastError = err;
      
      // Specific handling for common errors
      if (err.message.includes('ECONNRESET')) {
        console.warn('Redis connection reset, attempting to reconnect...');
      } else if (err.message.includes('ETIMEDOUT')) {
        console.warn('Redis connection timeout, retrying...');
      }
    });
    
    this.on('connect', () => {
      console.log('Redis connected successfully');
      this.isHealthy = true;
      this.lastError = null;
    });
    
    this.on('ready', () => {
      console.log('Redis is ready to accept commands');
      this.isHealthy = true;
    });
    
    this.on('reconnecting', (delay: number) => {
      console.log(`Redis reconnecting in ${delay}ms`);
    });
    
    this.on('end', () => {
      console.log('Redis connection ended');
      this.isHealthy = false;
    });
  }
  
  /**
   * Health check method
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ping();
      this.isHealthy = true;
      return true;
    } catch (error) {
      this.isHealthy = false;
      console.error('Redis health check failed:', error);
      return false;
    }
  }
  
  /**
   * Get health status
   */
  getHealthStatus(): { healthy: boolean; lastError: string | null } {
    return {
      healthy: this.isHealthy,
      lastError: this.lastError?.message || null
    };
  }
  
  /**
   * Safe execute with error handling
   */
  async safeExecute<T>(operation: string, command: () => Promise<T>): Promise<T> {
    try {
      const result = await command();
      return result;
    } catch (error: any) {
      throw new AsembError(
        ErrorCode.CACHE_OPERATION_FAILED,
        `Redis operation failed: ${operation}`,
        {
          context: {
            operation,
            originalError: error.message,
            errorStack: error.stack
          },
          retryable: this.isRetryableError(error)
        }
      );
    }
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'READONLY',
      'CONNECTION_BROKEN'
    ];
    
    return retryableErrors.some(errType => 
      error.message?.includes(errType) || error.code === errType
    );
  }
}

// Singleton Redis instance
let redisInstance: EnhancedRedis | null = null;

export const getRedisInstance = (): EnhancedRedis => {
  if (!redisInstance) {
    redisInstance = new EnhancedRedis();
  }
  return redisInstance;
};

// Health check function for external use
export const checkRedisHealth = async (): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> => {
  const redis = getRedisInstance();
  const start = Date.now();
  
  try {
    await redis.ping();
    const latency = Date.now() - start;
    
    return {
      healthy: true,
      latency
    };
  } catch (error: any) {
    return {
      healthy: false,
      error: error.message
    };
  }
};