import { redis } from '../server';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  service: string;
  message: string;
  metadata?: any;
  userId?: string;
  sessionId?: string;
}

export class LoggingService {
  private static instance: LoggingService;
  private static readonly LOG_KEY_PREFIX = 'logs:';
  private static readonly LOG_CHANNEL = 'console_logs';
  private static readonly MAX_LOGS_PER_SERVICE = 1000;

  static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  /**
   * Log a message and push to Redis for real-time streaming
   */
  async log(entry: Omit<LogEntry, 'timestamp'>): Promise<void> {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };

    try {
      // Store in Redis list with timestamp
      const key = `${LoggingService.LOG_KEY_PREFIX}${logEntry.service}`;
      await redis.lpush(key, JSON.stringify(logEntry));

      // Keep only recent logs (prevent memory bloat)
      await redis.ltrim(key, 0, LoggingService.MAX_LOGS_PER_SERVICE - 1);

      // Set expiration for logs (24 hours)
      await redis.expire(key, 86400);

      // Publish to Redis channel for real-time updates
      await redis.publish(LoggingService.LOG_CHANNEL, JSON.stringify(logEntry));

      // Also log to console with colors
      this.logToConsole(logEntry);

    } catch (error) {
      console.error('Failed to log to Redis:', error);
      // Fallback to console only
      this.logToConsole(logEntry);
    }
  }

  /**
   * Convenience methods for different log levels
   */
  async info(service: string, message: string, metadata?: any, userId?: string): Promise<void> {
    await this.log({ level: 'info', service, message, metadata, userId });
  }

  async warn(service: string, message: string, metadata?: any, userId?: string): Promise<void> {
    await this.log({ level: 'warn', service, message, metadata, userId });
  }

  async error(service: string, message: string, metadata?: any, userId?: string): Promise<void> {
    await this.log({ level: 'error', service, message, metadata, userId });
  }

  async debug(service: string, message: string, metadata?: any, userId?: string): Promise<void> {
    await this.log({ level: 'debug', service, message, metadata, userId });
  }

  async success(service: string, message: string, metadata?: any, userId?: string): Promise<void> {
    await this.log({ level: 'success', service, message, metadata, userId });
  }

  /**
   * Get recent logs for a service
   */
  async getLogs(service: string, limit: number = 100): Promise<LogEntry[]> {
    try {
      const key = `${LoggingService.LOG_KEY_PREFIX}${service}`;
      const logs = await redis.lrange(key, 0, limit - 1);

      return logs.map(log => JSON.parse(log));
    } catch (error) {
      console.error('Failed to get logs from Redis:', error);
      return [];
    }
  }

  /**
   * Get logs from all services
   */
  async getAllLogs(limit: number = 100): Promise<LogEntry[]> {
    try {
      const keys = await redis.keys(`${LoggingService.LOG_KEY_PREFIX}*`);
      const allLogs: LogEntry[] = [];

      for (const key of keys) {
        const logs = await redis.lrange(key, 0, 49); // Get 50 per service max
        for (const log of logs) {
          allLogs.push(JSON.parse(log));
        }
      }

      // Sort by timestamp (newest first) and limit
      return allLogs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to get all logs from Redis:', error);
      return [];
    }
  }

  /**
   * Clear logs for a service
   */
  async clearLogs(service: string): Promise<void> {
    try {
      const key = `${LoggingService.LOG_KEY_PREFIX}${service}`;
      await redis.del(key);
    } catch (error) {
      console.error(`Failed to clear logs for ${service}:`, error);
    }
  }

  /**
   * Log to console with colors
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `[${timestamp}] [${entry.service.toUpperCase()}]`;

    switch (entry.level) {
      case 'error':
        console.error(`\x1b[31m${prefix} ❌ ${entry.message}\x1b[0m`);
        if (entry.metadata) console.error('  Metadata:', entry.metadata);
        break;
      case 'warn':
        console.warn(`\x1b[33m${prefix} ⚠️  ${entry.message}\x1b[0m`);
        if (entry.metadata) console.warn('  Metadata:', entry.metadata);
        break;
      case 'success':
        console.log(`\x1b[32m${prefix} ✅ ${entry.message}\x1b[0m`);
        if (entry.metadata) console.log('  Metadata:', entry.metadata);
        break;
      case 'info':
        console.log(`\x1b[36m${prefix} ℹ️  ${entry.message}\x1b[0m`);
        break;
      case 'debug':
        console.debug(`\x1b[90m${prefix} 🔍 ${entry.message}\x1b[0m`);
        break;
      default:
        console.log(`${prefix} ${entry.message}`);
    }
  }

  /**
   * Create middleware for Express to log requests
   */
  createRequestMiddleware(service: string) {
    return (req: any, res: any, next: any) => {
      const start = Date.now();

      res.on('finish', async () => {
        const duration = Date.now() - start;
        const logEntry = {
          level: res.statusCode >= 400 ? 'error' : 'info',
          service,
          message: `${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`,
          metadata: {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress
          }
        };

        await this.log(logEntry);
      });

      next();
    };
  }
}

export const loggingService = LoggingService.getInstance();