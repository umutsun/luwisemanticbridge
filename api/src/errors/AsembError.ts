/**
 * ASEMB Error Handling Standard
 * @author Claude - Architecture Lead
 * @version Phase 3
 */

import { NodeOperationError } from 'n8n-workflow';

export enum ErrorCode {
  // Workspace Errors (1xxx)
  WORKSPACE_NOT_FOUND = 'ASEMB_1001',
  WORKSPACE_QUOTA_EXCEEDED = 'ASEMB_1002',
  WORKSPACE_LOCKED = 'ASEMB_1003',
  
  // Database Errors (2xxx)
  DATABASE_CONNECTION_FAILED = 'ASEMB_2001',
  DATABASE_QUERY_FAILED = 'ASEMB_2002',
  DATABASE_TRANSACTION_FAILED = 'ASEMB_2003',
  DATABASE_POOL_EXHAUSTED = 'ASEMB_2004',
  
  // Embedding Errors (3xxx)
  EMBEDDING_FAILED = 'ASEMB_3001',
  EMBEDDING_DIMENSION_MISMATCH = 'ASEMB_3002',
  EMBEDDING_PROVIDER_ERROR = 'ASEMB_3003',
  EMBEDDING_RATE_LIMITED = 'ASEMB_3004',
  
  // Search Errors (4xxx)
  SEARCH_FAILED = 'ASEMB_4001',
  SEARCH_TIMEOUT = 'ASEMB_4002',
  SEARCH_NO_RESULTS = 'ASEMB_4003',
  SEARCH_INVALID_QUERY = 'ASEMB_4004',
  
  // Cache Errors (5xxx)
  CACHE_CONNECTION_FAILED = 'ASEMB_5001',
  CACHE_OPERATION_FAILED = 'ASEMB_5002',
  CACHE_INVALIDATION_FAILED = 'ASEMB_5003',
  
  // Validation Errors (6xxx)
  INVALID_INPUT = 'ASEMB_6001',
  INVALID_CHUNK_SIZE = 'ASEMB_6002',
  INVALID_SOURCE_ID = 'ASEMB_6003',
  MISSING_REQUIRED_FIELD = 'ASEMB_6004',
  
  // Rate Limiting Errors (7xxx)
  RATE_LIMIT_EXCEEDED = 'ASEMB_7001',
  QUOTA_EXCEEDED = 'ASEMB_7002',
  
  // System Errors (9xxx)
  INTERNAL_ERROR = 'ASEMB_9001',
  NOT_IMPLEMENTED = 'ASEMB_9002',
  SERVICE_UNAVAILABLE = 'ASEMB_9003'
}

export interface ErrorDetails {
  code: ErrorCode;
  statusCode: number;
  context?: Record<string, any>;
  retryable: boolean;
  userMessage?: string;
  developerMessage?: string;
  documentationUrl?: string;
}

export class AsembError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;
  
  constructor(
    code: ErrorCode,
    message: string,
    details?: Partial<ErrorDetails>
  ) {
    super(message);
    this.name = 'AsembError';
    this.code = code;
    this.statusCode = details?.statusCode || this.getDefaultStatusCode(code);
    this.retryable = details?.retryable ?? this.isRetryableError(code);
    this.context = details?.context;
    this.timestamp = new Date();
    
    // Ensure stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AsembError);
    }
  }
  
  private getDefaultStatusCode(code: ErrorCode): number {
    const prefix = code.slice(0, 7); // ASEMB_X
    switch (prefix[6]) {
      case '1': return 404; // Workspace errors
      case '2': return 503; // Database errors
      case '3': return 502; // Embedding errors
      case '4': return 400; // Search errors
      case '5': return 503; // Cache errors
      case '6': return 400; // Validation errors
      case '7': return 429; // Rate limiting
      case '9': return 500; // System errors
      default: return 500;
    }
  }
  
  private isRetryableError(code: ErrorCode): boolean {
    const retryableCodes = [
      ErrorCode.DATABASE_CONNECTION_FAILED,
      ErrorCode.DATABASE_POOL_EXHAUSTED,
      ErrorCode.EMBEDDING_RATE_LIMITED,
      ErrorCode.CACHE_CONNECTION_FAILED,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      ErrorCode.SERVICE_UNAVAILABLE
    ];
    return retryableCodes.includes(code);
  }
  
  toJSON(): ErrorDetails {
    return {
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      context: this.context,
      userMessage: this.message,
      developerMessage: this.stack
    };
  }
  
  toNodeError(node: any): NodeOperationError {
    return new NodeOperationError(
      node,
      this.message,
      {
        message: this.message,
        description: `Error Code: ${this.code}`,
        itemIndex: this.context?.itemIndex
      }
    );
  }
}

/**
 * Error handler with retry logic
 */
export class ErrorHandler {
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxAttempts?: number;
      backoffMs?: number;
      exponential?: boolean;
      onRetry?: (attempt: number, error: Error) => void;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      backoffMs = 1000,
      exponential = true,
      onRetry
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        const isRetryable = error instanceof AsembError 
          ? error.retryable 
          : this.isRetryableError(error as Error);
        
        if (!isRetryable || attempt === maxAttempts) {
          throw error;
        }
        
        // Calculate delay
        const delay = exponential 
          ? backoffMs * Math.pow(2, attempt - 1)
          : backoffMs;
        
        // Call retry callback
        if (onRetry) {
          onRetry(attempt, error as Error);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
  
  private static isRetryableError(error: Error): boolean {
    // Check for common retryable error patterns
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('503')
    );
  }
  
  /**
   * Wrap errors with context
   */
  static wrapError(
    error: unknown,
    code: ErrorCode,
    context?: Record<string, any>
  ): AsembError {
    if (error instanceof AsembError) {
      // Add additional context
      if (context) {
        // Merge additional context safely
        if (!error.context) {
          (error as any).context = {};
        }
        Object.assign((error as any).context, context || {});
      }
      return error;
    }
    
    const message = error instanceof Error 
      ? error.message 
      : String(error);
    
    return new AsembError(code, message, { context });
  }
  
  /**
   * Create user-friendly error messages
   */
  static getUserMessage(error: AsembError): string {
    switch (error.code) {
      case ErrorCode.WORKSPACE_NOT_FOUND:
        return 'The requested workspace does not exist';
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return 'Too many requests. Please try again later';
      case ErrorCode.INVALID_CHUNK_SIZE:
        return 'The chunk size must be between 100 and 2048 characters';
      case ErrorCode.DATABASE_CONNECTION_FAILED:
        return 'Unable to connect to the database. Please try again';
      case ErrorCode.EMBEDDING_FAILED:
        return 'Failed to generate embeddings. Please check your API credentials';
      default:
        return 'An error occurred while processing your request';
    }
  }
}
