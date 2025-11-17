import { INode } from 'n8n-workflow';
import { Pool, PoolClient } from 'pg';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  DATABASE = 'database',
  NETWORK = 'network',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  PROCESSING = 'processing',
  CACHE = 'cache'
}

export interface ErrorContext {
  operation?: string;
  sourceId?: string;
  workspace?: string;
  retryCount?: number;
  metadata?: Record<string, any>;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryableErrors?: string[];
}

export class AsembError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly context?: ErrorContext;
  public readonly timestamp: Date;
  public readonly originalError?: Error;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context?: ErrorContext,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AsembError';
    this.severity = severity;
    this.category = category;
    this.context = context;
    this.timestamp = new Date();
    this.originalError = originalError;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AsembError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      severity: this.severity,
      category: this.category,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      originalError: this.originalError?.message
    };
  }
}

export class ErrorHandler {
  private static readonly RETRYABLE_ERRORS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    '429', // Rate limit
    '503', // Service unavailable
    '504', // Gateway timeout
    'connection timeout',
    'pool timeout',
    'deadlock detected'
  ];

  private static readonly DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    retryableErrors: ErrorHandler.RETRYABLE_ERRORS
  };

  /**
   * Wrap an operation with error handling and optional retry logic
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    node?: INode,
    retryOptions?: RetryOptions
  ): Promise<T> {
    const options = { ...this.DEFAULT_RETRY_OPTIONS, ...retryOptions };
    let lastError: Error | undefined;
    let retryCount = 0;

    while (retryCount <= options.maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const errorContext = { ...context, retryCount };

        // Log the error
        if (node) {
          console.warn(`Operation failed (attempt ${retryCount + 1}/${options.maxRetries + 1})`, {
            error: error.message,
            context: errorContext
          });
        }

        // Check if error is retryable
        if (!this.isRetryable(error, options.retryableErrors) || retryCount >= options.maxRetries) {
          throw this.wrapError(error, errorContext);
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          options.initialDelay * Math.pow(options.backoffFactor, retryCount),
          options.maxDelay
        );

        // Wait before retry
        await this.delay(delay);
        retryCount++;
      }
    }

    throw this.wrapError(lastError!, { ...context, retryCount });
  }

  /**
   * Execute database operation with automatic transaction handling
   */
  static async withTransaction<T>(
    pool: Pool,
    operation: (client: PoolClient) => Promise<T>,
    context?: ErrorContext
  ): Promise<T> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw this.wrapError(error, { ...context, operation: 'transaction' });
    } finally {
      client.release();
    }
  }

  /**
   * Determine if an error is retryable
   */
  private static isRetryable(error: any, retryableErrors: string[]): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';

    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError.toLowerCase()) ||
      errorCode === retryableError
    );
  }

  /**
   * Wrap a raw error into AsembError with appropriate categorization
   */
  private static wrapError(error: any, context?: ErrorContext): AsembError {
    // If already an AsembError, return as-is
    if (error instanceof AsembError) {
      return error;
    }

    const message = error.message || String(error);
    const category = this.categorizeError(error);
    const severity = this.assessSeverity(error, category);

    return new AsembError(message, category, severity, context, error);
  }

  /**
   * Categorize error based on its characteristics
   */
  private static categorizeError(error: any): ErrorCategory {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || '';

    if (code.startsWith('2') || message.includes('connection') || message.includes('timeout')) {
      return ErrorCategory.DATABASE;
    }
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || message.includes('network')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('rate') || message.includes('limit') || code === '429') {
      return ErrorCategory.RATE_LIMIT;
    }
    if (message.includes('cache') || message.includes('redis')) {
      return ErrorCategory.CACHE;
    }

    return ErrorCategory.PROCESSING;
  }

  /**
   * Assess error severity based on category and characteristics
   */
  private static assessSeverity(error: any, category: ErrorCategory): ErrorSeverity {
    // Critical errors
    if (category === ErrorCategory.AUTHENTICATION) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity
    if (category === ErrorCategory.DATABASE && error.code?.startsWith('22')) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity
    if (category === ErrorCategory.NETWORK || category === ErrorCategory.RATE_LIMIT) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity for validation and cache errors
    if (category === ErrorCategory.VALIDATION || category === ErrorCategory.CACHE) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  /**
   * Graceful degradation handler
   */
  static async withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    node?: INode
  ): Promise<T> {
    try {
      return await primary();
    } catch (primaryError: any) {
      if (node) {
        console.warn('Primary operation failed, attempting fallback', {
          error: primaryError.message
        });
      }

      try {
        return await fallback();
      } catch (fallbackError: any) {
        // If both fail, throw a combined error
        throw new AsembError(
          `Both primary and fallback operations failed: ${primaryError.message} | ${fallbackError.message}`,
          ErrorCategory.PROCESSING,
          ErrorSeverity.HIGH,
          { metadata: { primaryError: primaryError.message, fallbackError: fallbackError.message } }
        );
      }
    }
  }

  /**
   * Circuit breaker pattern implementation
   */
  static createCircuitBreaker<T>(
    operation: () => Promise<T>,
    options: {
      threshold?: number;
      timeout?: number;
      resetTimeout?: number;
    } = {}
  ) {
    const threshold = options.threshold || 5;
    const timeout = options.timeout || 60000;
    const resetTimeout = options.resetTimeout || 30000;

    let failures = 0;
    let lastFailureTime: number | null = null;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async (): Promise<T> => {
      // Check if circuit should be reset
      if (state === 'open' && lastFailureTime) {
        if (Date.now() - lastFailureTime > resetTimeout) {
          state = 'half-open';
          failures = 0;
        }
      }

      // If circuit is open, fail fast
      if (state === 'open') {
        throw new AsembError(
          'Circuit breaker is open - service unavailable',
          ErrorCategory.PROCESSING,
          ErrorSeverity.HIGH,
          { metadata: { failures, lastFailureTime: new Date(lastFailureTime!).toISOString() } }
        );
      }

      try {
        const result = await Promise.race([
          operation(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), timeout)
          )
        ]);

        // Reset on success
        if (state === 'half-open') {
          state = 'closed';
        }
        failures = 0;
        
        return result;
      } catch (error: any) {
        failures++;
        lastFailureTime = Date.now();

        if (failures >= threshold) {
          state = 'open';
        }

        throw error;
      }
    };
  }

  /**
   * Helper function for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format error for user-friendly display
   */
  static formatError(error: any): string {
    if (error instanceof AsembError) {
      switch (error.severity) {
        case ErrorSeverity.CRITICAL:
          return `Critical Error: ${error.message}. Please check your configuration.`;
        case ErrorSeverity.HIGH:
          return `Error: ${error.message}. Operation failed.`;
        case ErrorSeverity.MEDIUM:
          return `Warning: ${error.message}. Retrying...`;
        case ErrorSeverity.LOW:
          return `Notice: ${error.message}`;
        default:
          return error.message;
      }
    }

    return error.message || 'An unexpected error occurred';
  }
}

/**
 * Error recovery strategies
 */
export class ErrorRecovery {
  /**
   * Attempt to recover from database connection errors
   */
  static async recoverDatabaseConnection(
    pool: Pool,
    node?: INode
  ): Promise<boolean> {
    try {
      // Test connection
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      if (node) {
        console.info('Database connection recovered');
      }
      return true;
    } catch (error: any) {
      if (node) {
        console.error('Failed to recover database connection', { error: error.message });
      }
      return false;
    }
  }

  /**
   * Clean up resources on error
   */
  static async cleanup(
    resources: {
      pool?: Pool;
      client?: PoolClient;
      cache?: any;
    },
    node?: INode
  ): Promise<void> {
    const cleanupTasks: Promise<void>[] = [];

    if (resources.client) {
      cleanupTasks.push(
        resources.client.query('ROLLBACK')
          .then(() => resources.client!.release())
          .catch(err => {
            if (node) console.warn('Failed to rollback transaction', { error: err.message });
          })
      );
    }

    if (resources.cache?.quit) {
      cleanupTasks.push(
        resources.cache.quit()
          .catch((err: any) => {
            if (node) console.warn('Failed to close cache connection', { error: err.message });
          })
      );
    }

    await Promise.allSettled(cleanupTasks);
  }
}
