import winston from 'winston';
import { WebSocketServer } from 'ws';
import { SettingsService } from '../services/settings.service';

interface LogConfig {
  level: string;
  file: string;
  maxSize: string;
  maxFiles: number;
}

class LoggerService {
  private static instance: LoggerService;
  private logger: winston.Logger;
  private wss: WebSocketServer | null = null;
  private config: LogConfig = {
    level: 'info',
    file: 'logs/asb.log',
    maxSize: '10m',
    maxFiles: 5
  };

  private constructor() {
    this.logger = this.createLogger();
  }

  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // Add file transport
    transports.push(
      new winston.transports.File({
        filename: this.config.file,
        level: this.config.level,
        maxsize: this.parseSize(this.config.maxSize),
        maxFiles: this.config.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      })
    );

    // Add error file transport
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: this.parseSize(this.config.maxSize),
        maxFiles: this.config.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      })
    );

    // Add console transport in development
    if (process.env.NODE_ENV !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'luwi-semantic-bridge' },
      transports
    });
  }

  private parseSize(size: string): number {
    const units: { [key: string]: number } = {
      'b': 1,
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024
    };

    const match = size.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 10 * 1024 * 1024; // Default 10MB

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return value * (units[unit] || 1);
  }

  // Set WebSocket server for real-time logging
  setWebSocketServer(wss: WebSocketServer): void {
    this.wss = wss;

    // Create a simple stream for winston
    const WritableStream = require('stream').Writable;
    const wsStream = new WritableStream({
      write: (chunk: any, encoding: string, next: Function) => {
        if (this.wss && this.wss.clients) {
          try {
            const logEntry = JSON.parse(chunk.toString());
            this.wss.clients.forEach((client) => {
              if (client.readyState === client.OPEN) {
                client.send(JSON.stringify({
                  message: logEntry.message,
                  level: logEntry.level,
                  source: logEntry.service || 'backend',
                  timestamp: logEntry.timestamp,
                  stack: logEntry.stack
                }));
              }
            });
          } catch (error) {
            console.error('Failed to parse log message:', error);
          }
        }
        next();
      }
    });

    // Add WebSocket transport for real-time logs
    if (this.wss) {
      const wsTransport = new winston.transports.Stream({
        stream: wsStream
      });

      this.logger.add(wsTransport);
    }
  }

  // Update logging configuration
  async updateConfig(config: Partial<LogConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // Only recreate logger if configuration changed
    if (
      oldConfig.level !== this.config.level ||
      oldConfig.file !== this.config.file ||
      oldConfig.maxSize !== this.config.maxSize ||
      oldConfig.maxFiles !== this.config.maxFiles
    ) {
      // Remove all existing transports
      this.logger.clear();

      // Create new logger with new config
      this.logger = this.createLogger();

      // Re-add WebSocket transport if it was set
      if (this.wss) {
        this.setWebSocketServer(this.wss);
      }

      // Save configuration to database
      try {
        const settingsService = SettingsService.getInstance();
        await settingsService.setSetting('logging_level', this.config.level);
        await settingsService.setSetting('logging_file', this.config.file);
        await settingsService.setSetting('logging_max_size', this.config.maxSize);
        await settingsService.setSetting('logging_max_files', this.config.maxFiles.toString());
      } catch (error) {
        console.error('Failed to save logging configuration:', error);
      }
    }
  }

  // Get current configuration
  getConfig(): LogConfig {
    return { ...this.config };
  }

  // Logger methods
  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error | any): void {
    this.logger.error(message, error);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  // Get the underlying winston logger for compatibility
  getLogger(): winston.Logger {
    return this.logger;
  }
}

// Create and export singleton instance
const loggerService = LoggerService.getInstance();

// Export the logger method for backward compatibility
export const logger = loggerService.getLogger();

// Export the service for advanced usage
export { loggerService };