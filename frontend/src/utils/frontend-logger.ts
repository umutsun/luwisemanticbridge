interface FrontendLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
  timestamp?: string;
  metadata?: any;
}

class FrontendLogger {
  private isInitialized = false;
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    info: typeof console.info;
  };
  private logQueue: FrontendLogEntry[] = [];
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      info: console.info,
    };
  }

  initialize() {
    if (this.isInitialized || typeof window === 'undefined') return;

    // Override console methods
    console.log = (...args: any[]) => {
      this.processLog('info', args);
      this.originalConsole.log.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      this.processLog('warn', args);
      this.originalConsole.warn.apply(console, args);
    };

    console.error = (...args: any[]) => {
      this.processLog('error', args);
      this.originalConsole.error.apply(console, args);
    };

    console.debug = (...args: any[]) => {
      this.processLog('debug', args);
      this.originalConsole.debug.apply(console, args);
    };

    console.info = (...args: any[]) => {
      this.processLog('info', args);
      this.originalConsole.info.apply(console, args);
    };

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.sendLog({
        level: 'error',
        message: event.message,
        source: 'window.error',
        timestamp: new Date().toISOString(),
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
        }
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.sendLog({
        level: 'error',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        source: 'unhandled.rejection',
        timestamp: new Date().toISOString(),
        metadata: {
          reason: event.reason
        }
      });
    });

    this.isInitialized = true;
    console.log('Frontend Logger initialized');

    // Send queued logs
    this.flushQueue();
  }

  private processLog(level: FrontendLogEntry['level'], args: any[]) {
    // Skip certain logs to reduce noise
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    // Skip React DevTools and other noise
    if (message.includes('Warning: ReactDOM.render is deprecated') ||
        message.includes('Warning: componentWillMount has been renamed') ||
        message.includes('[HMR]') ||
        message.includes('DevTools')) {
      return;
    }

    this.sendLog({
      level,
      message,
      source: 'frontend',
      timestamp: new Date().toISOString(),
      metadata: {
        url: window.location.href,
        userAgent: navigator.userAgent.substring(0, 100)
      }
    });
  }

  private async sendLog(logEntry: FrontendLogEntry) {
    // If not initialized, queue the log
    if (!this.isInitialized) {
      this.logQueue.push(logEntry);
      return;
    }

    try {
      await fetch(`${this.apiUrl}/api/v2/frontend/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logEntry)
      });
    } catch (error) {
      // Silently fail to avoid infinite loops
      this.originalConsole.error('Failed to send frontend log:', error);
    }
  }

  private async flushQueue() {
    if (this.logQueue.length === 0) return;

    const logsToSend = [...this.logQueue];
    this.logQueue = [];

    try {
      await fetch(`${this.apiUrl}/api/v2/frontend/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs: logsToSend })
      });
    } catch (error) {
      this.originalConsole.error('Failed to send queued logs:', error);
    }
  }

  // Manual log methods
  info(message: string, metadata?: any) {
    this.sendLog({
      level: 'info',
      message,
      source: 'manual',
      timestamp: new Date().toISOString(),
      metadata
    });
  }

  warn(message: string, metadata?: any) {
    this.sendLog({
      level: 'warn',
      message,
      source: 'manual',
      timestamp: new Date().toISOString(),
      metadata
    });
  }

  error(message: string, metadata?: any) {
    this.sendLog({
      level: 'error',
      message,
      source: 'manual',
      timestamp: new Date().toISOString(),
      metadata
    });
  }

  debug(message: string, metadata?: any) {
    this.sendLog({
      level: 'debug',
      message,
      source: 'manual',
      timestamp: new Date().toISOString(),
      metadata
    });
  }

  // Restore original console methods
  restore() {
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;
    this.isInitialized = false;
  }
}

// Singleton instance
const frontendLogger = new FrontendLogger();

export default frontendLogger;

// Initialize on client side
if (typeof window !== 'undefined') {
  // Initialize after a short delay to ensure the page is loaded
  setTimeout(() => {
    frontendLogger.initialize();
  }, 1000);
}