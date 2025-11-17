/**
 * Alice Semantic Bridge - Error Handling & Retry Logic
 * @author Claude (Architecture Lead)
 */

import { NodeOperationError } from 'n8n-workflow';
import { IWorkflowError } from './interfaces';

// Error Types
export enum ErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface IErrorContext {
  nodeId?: string;
  nodeName?: string;
  operation?: string;
  itemIndex?: number;
  projectKey?: string;
  metadata?: Record<string, any>;
}

export class ASBError extends Error {
  public readonly type: ErrorType;
  public readonly context: IErrorContext;
  public readonly recoverable: boolean;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN_ERROR,
    context: IErrorContext = {},
    recoverable = false,
    retryAfter?: number
  ) {
    super(message);
    this.name = 'ASBError';
    this.type = type;
    this.context = context;
    this.recoverable = recoverable;
    this.retryAfter = retryAfter;
  }

  toWorkflowError(): IWorkflowError {
    return {
      nodeId: this.context.nodeId || 'unknown',
      nodeName: this.context.nodeName || 'unknown',
      error: this.message,
      timestamp: new Date(),
      itemIndex: this.context.itemIndex,
      recoverable: this.recoverable,
    };
  }
}

// Retry Configuration
export interface IRetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: IRetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

// Retry Logic with Exponential Backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<IRetryConfig> = {},
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  const { maxRetries, initialDelay, maxDelay, backoffMultiplier, jitter } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is recoverable
      if (error instanceof ASBError && !error.recoverable) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw new ASBError(
          `Failed after ${maxRetries} attempts: ${lastError.message}`,
          ErrorType.CONNECTION_ERROR,
          { metadata: { attempts: maxRetries } },
          false
        );
      }
      
      // Calculate delay with exponential backoff
      let delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
      delay = Math.min(delay, maxDelay);
      
      // Add jitter to prevent thundering herd
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }
      
      // Use custom retry delay if specified (e.g., from rate limit headers)
      if (error instanceof ASBError && error.retryAfter) {
        delay = error.retryAfter * 1000;
      }
      
      if (onRetry) {
        onRetry(attempt, lastError);
      }
      
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

// Redis Connection with Retry
export async function connectRedisWithRetry(
  connectFn: () => Promise<any>,
  context: IErrorContext = {}
): Promise<any> {
  return retryWithBackoff(
    async () => {
      try {
        return await connectFn();
      } catch (error) {
        throw new ASBError(
          `Redis connection failed: ${(error as Error).message}`,
          ErrorType.CONNECTION_ERROR,
          context,
          true // Redis connection errors are recoverable
        );
      }
    },
    {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 10000,
    },
    (attempt, error) => {
      console.log(`Redis connection attempt ${attempt} failed:`, error.message);
    }
  );
}

// OpenAI API with Rate Limit Handling
export async function callOpenAIWithRetry<T>(
  apiCall: () => Promise<T>,
  context: IErrorContext = {}
): Promise<T> {
  return retryWithBackoff(
    async () => {
      try {
        return await apiCall();
      } catch (error: any) {
        // Check for rate limit error
        if (error.response?.status === 429) {
          const retryAfter = parseInt(
            error.response.headers['retry-after'] || '60'
          );
          throw new ASBError(
            'OpenAI API rate limit exceeded',
            ErrorType.RATE_LIMIT_ERROR,
            context,
            true,
            retryAfter
          );
        }
        
        // Check for timeout
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new ASBError(
            'OpenAI API request timeout',
            ErrorType.TIMEOUT_ERROR,
            context,
            true
          );
        }
        
        // Other errors
        throw new ASBError(
          `OpenAI API error: ${error.message}`,
          ErrorType.PROCESSING_ERROR,
          context,
          error.response?.status >= 500 // 5xx errors are recoverable
        );
      }
    },
    {
      maxRetries: 3,
      initialDelay: 2000,
      backoffMultiplier: 3,
    }
  );
}

// Graceful Degradation
export class ServiceDegradation {
  private serviceStatus: Map<string, boolean> = new Map();
  private fallbackStrategies: Map<string, () => any> = new Map();
  
  constructor() {
    this.registerFallbacks();
  }
  
  private registerFallbacks() {
    // OpenAI fallback
    this.fallbackStrategies.set('openai', () => {
      console.warn('OpenAI service degraded, using mock embeddings');
      return {
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        model: 'mock-embedding',
      };
    });
    
    // Redis fallback
    this.fallbackStrategies.set('redis', () => {
      console.warn('Redis service degraded, using in-memory cache');
      return new Map();
    });
    
    // PostgreSQL fallback
    this.fallbackStrategies.set('postgres', () => {
      console.warn('PostgreSQL service degraded, returning empty results');
      return [];
    });
  }
  
  async executeWithFallback<T>(
    service: string,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      const result = await operation();
      this.serviceStatus.set(service, true);
      return result;
    } catch (error) {
      this.serviceStatus.set(service, false);
      
      const fallback = this.fallbackStrategies.get(service);
      if (fallback) {
        return fallback();
      }
      
      throw error;
    }
  }
  
  isServiceHealthy(service: string): boolean {
    return this.serviceStatus.get(service) ?? true;
  }
  
  getServiceStatus(): Record<string, boolean> {
    return Object.fromEntries(this.serviceStatus);
  }
}

// Error Message Formatter
export function formatErrorMessage(
  error: Error | ASBError,
  context: IErrorContext = {}
): string {
  const parts: string[] = [];
  
  // Add context information
  if (context.nodeName) {
    parts.push(`[${context.nodeName}]`);
  }
  if (context.operation) {
    parts.push(`Operation: ${context.operation}`);
  }
  if (context.itemIndex !== undefined) {
    parts.push(`Item #${context.itemIndex}`);
  }
  
  // Add error message
  parts.push(error.message);
  
  // Add recovery hint
  if (error instanceof ASBError && error.recoverable) {
    parts.push('(This error may be temporary)');
  }
  
  return parts.join(' - ');
}

// Utility Functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export singleton instance
export const serviceDegradation = new ServiceDegradation();
