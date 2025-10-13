import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  service?: string;
  metadata?: any;
}

export class ConsoleLogService extends EventEmitter {
  private redis: Redis;
  private redisSubscriber: Redis;
  private readonly LOG_CHANNEL = 'asb:console:logs';
  private readonly LOG_STREAM = 'asb:console:stream';
  private readonly MAX_LOGS = 1000; // Keep last 1000 logs in Redis stream
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.redisSubscriber = redis.duplicate();

    // Store original console methods
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    this.initialize();
  }

  private async initialize() {
    try {
      // Subscribe to log channel
      await this.redisSubscriber.subscribe(this.LOG_CHANNEL);
      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === this.LOG_CHANNEL) {
          try {
            const logEntry: ConsoleLogEntry = JSON.parse(message);
            this.emit('log', logEntry);
          } catch (error) {
            // Ignore malformed messages
          }
        }
      });

      // Override console methods
      this.overrideConsole();

      console.log('✅ Console Log Service initialized with Redis');
    } catch (error) {
      console.error('❌ Failed to initialize Console Log Service:', error);
    }
  }

  private overrideConsole() {
    // Override console.log
    console.log = (...args: any[]) => {
      this.originalConsole.log(...args);
      this.processLog('info', args);
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      this.processLog('warn', args);
    };

    // Override console.error
    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      this.processLog('error', args);
    };

    // Override console.debug
    console.debug = (...args: any[]) => {
      this.originalConsole.debug(...args);
      this.processLog('debug', args);
    };
  }

  private processLog(level: ConsoleLogEntry['level'], args: any[]) {
    try {
      // Filter out unwanted logs
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      // Skip CORS debug logs and other noisy logs
      if (message.includes('CORS Debug') ||
          message.includes('[0m') ||
          message.includes('GET /api/v2/system/stream 200')) {
        return;
      }

      const logEntry: ConsoleLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        level,
        message: this.cleanMessage(message),
        service: 'asb-backend',
      };

      // Add to Redis stream
      this.redis.xadd(
        this.LOG_STREAM,
        'MAXLEN',
        '~',
        this.MAX_LOGS,
        '*',
        'id', logEntry.id,
        'timestamp', logEntry.timestamp,
        'level', logEntry.level,
        'message', logEntry.message,
        'service', logEntry.service
      ).catch(err => {
        // Silently fail to avoid infinite loops
      });

      // Publish to channel for real-time updates
      this.redis.publish(
        this.LOG_CHANNEL,
        JSON.stringify(logEntry)
      ).catch(err => {
        // Silently fail to avoid infinite loops
      });

    } catch (error) {
      // Avoid infinite loops
      this.originalConsole.error('ConsoleLogService error:', error);
    }
  }

  private cleanMessage(message: string): string {
    // Remove ANSI color codes
    return message.replace(/\x1b\[[0-9;]*m/g, '');
  }

  // Get recent logs from Redis stream
  async getRecentLogs(count: number = 100): Promise<ConsoleLogEntry[]> {
    try {
      const results = await this.redis.xrevrange(
        this.LOG_STREAM,
        '+',
        '-',
        'COUNT',
        count
      );

      return results.map(([id, fields]) => {
        const logEntry: Partial<ConsoleLogEntry> = {};
        for (let i = 0; i < fields.length; i += 2) {
          logEntry[fields[i] as keyof ConsoleLogEntry] = fields[i + 1];
        }
        return logEntry as ConsoleLogEntry;
      }).reverse(); // Reverse to get chronological order
    } catch (error) {
      console.error('Failed to get recent logs:', error);
      return [];
    }
  }

  // Add custom log entry
  async addCustomLog(entry: Omit<ConsoleLogEntry, 'id' | 'timestamp'>) {
    const logEntry: ConsoleLogEntry = {
      ...entry,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    await this.redis.xadd(
      this.LOG_STREAM,
      'MAXLEN',
      '~',
      this.MAX_LOGS,
      '*',
      'id', logEntry.id,
      'timestamp', logEntry.timestamp,
      'level', logEntry.level,
      'message', logEntry.message,
      'service', logEntry.service || 'custom'
    );

    await this.redis.publish(
      this.LOG_CHANNEL,
      JSON.stringify(logEntry)
    );
  }

  // Clear all logs
  async clearLogs() {
    try {
      await this.redis.del(this.LOG_STREAM);
      console.log('✅ Console logs cleared');
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }

  // Restore original console methods
  restore() {
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
  }

  // Get log statistics
  async getLogStats(): Promise<{
    total: number;
    byLevel: Record<string, number>;
    recentByHour: Record<string, number>;
  }> {
    try {
      const logs = await this.getRecentLogs(1000);

      const byLevel: Record<string, number> = {
        info: 0,
        warn: 0,
        error: 0,
        debug: 0,
      };

      const recentByHour: Record<string, number> = {};

      logs.forEach(log => {
        // Count by level
        if (byLevel[log.level]) {
          byLevel[log.level]++;
        }

        // Count by hour
        const hour = new Date(log.timestamp).getHours();
        const hourKey = `${hour}:00`;
        if (recentByHour[hourKey]) {
          recentByHour[hourKey]++;
        } else {
          recentByHour[hourKey] = 1;
        }
      });

      return {
        total: logs.length,
        byLevel,
        recentByHour,
      };
    } catch (error) {
      return {
        total: 0,
        byLevel: { info: 0, warn: 0, error: 0, debug: 0 },
        recentByHour: {},
      };
    }
  }
}

// Singleton instance
let consoleLogService: ConsoleLogService | null = null;

export function initializeConsoleLogService(redis: Redis): ConsoleLogService {
  if (!consoleLogService) {
    consoleLogService = new ConsoleLogService(redis);
  }
  return consoleLogService;
}

export function getConsoleLogService(): ConsoleLogService | null {
  return consoleLogService;
}