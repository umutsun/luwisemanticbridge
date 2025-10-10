interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
  service?: string;
  metadata?: any;
  stack?: string;
}

class LoggerBridge {
  private static instance: LoggerBridge;
  private logs: LogEntry[] = [];
  private isSending = false;
  private sendInterval: NodeJS.Timeout | null = null;
  private readonly MAX_LOGS = 100;
  private readonly SEND_INTERVAL = 5000; // 5 seconds

  private constructor() {
    // Start periodic sending
    this.sendInterval = setInterval(() => {
      this.flushLogs();
    }, this.SEND_INTERVAL);

    // Send logs on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushLogs();
      });
    }
  }

  static getInstance(): LoggerBridge {
    if (!LoggerBridge.instance) {
      LoggerBridge.instance = new LoggerBridge();
    }
    return LoggerBridge.instance;
  }

  log(level: LogEntry['level'], message: string, metadata?: any, stack?: string) {
    const logEntry: LogEntry = {
      level,
      message,
      source: 'frontend',
      service: this.detectService(),
      metadata,
      stack,
      timestamp: new Date().toISOString()
    };

    this.logs.push(logEntry);

    // Keep only the last MAX_LOGS entries
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }

    // Send immediately for errors
    if (level === 'error') {
      this.flushLogs();
    }
  }

  private detectService(): string {
    if (typeof window === 'undefined') return 'server';

    const pathname = window.location.pathname;

    if (pathname.includes('/dashboard')) return 'dashboard';
    if (pathname.includes('/api')) return 'api';
    if (pathname.includes('/chat')) return 'chat';
    if (pathname.includes('/embeddings')) return 'embeddings';
    if (pathname.includes('/scraper')) return 'scraper';
    if (pathname.includes('/settings')) return 'settings';
    if (pathname.includes('/documents')) return 'documents';

    return 'frontend';
  }

  async flushLogs() {
    if (this.isSending || this.logs.length === 0) {
      return;
    }

    this.isSending = true;
    const logsToSend = [...this.logs];
    this.logs = [];

    try {
      const response = await fetch('/api/logs/frontend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs: logsToSend }),
      });

      if (!response.ok) {
        // If sending failed, add logs back to the array
        this.logs.unshift(...logsToSend);
      }
    } catch (error) {
      // If sending failed, add logs back to the array
      this.logs.unshift(...logsToSend);
      console.error('Failed to send logs to backend:', error);
    } finally {
      this.isSending = false;
    }
  }

  // Manual flush
  sendNow() {
    this.flushLogs();
  }

  // Get all logs for display
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Clear all logs
  clearLogs() {
    this.logs = [];
  }
}

// Export singleton instance
export const loggerBridge = LoggerBridge.getInstance();

// Export convenience methods
export const log = {
  debug: (message: string, metadata?: any) => {
    loggerBridge.log('debug', message, metadata);
  },
  info: (message: string, metadata?: any) => {
    loggerBridge.log('info', message, metadata);
  },
  warn: (message: string, metadata?: any) => {
    loggerBridge.log('warn', message, metadata);
  },
  error: (message: string, error?: Error | any, metadata?: any) => {
    const stack = error instanceof Error ? error.stack : undefined;
    loggerBridge.log('error', message, { ...metadata, error }, stack);
  }
};