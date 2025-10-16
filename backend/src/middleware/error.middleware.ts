import { Request, Response, NextFunction } from 'express';
import { createErrorResponse } from './response.middleware';

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export class AppError extends Error implements CustomError {
  public statusCode: number;
  public code: string;
  public details?: any;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation error class
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

// Not found error class
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// Unauthorized error class
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// Forbidden error class
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

// Conflict error class
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

// Rate limit error class
export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super(
      'Rate limit exceeded. Please try again later.',
      429,
      'RATE_LIMIT_EXCEEDED',
      { retryAfter }
    );
  }
}

// Database error handler
const handleDatabaseError = (error: any): AppError => {
  console.error('Database error:', error);

  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // unique_violation
      return new ConflictError('Resource already exists');
    case '23503': // foreign_key_violation
      return new ValidationError('Referenced resource does not exist');
    case '23502': // not_null_violation
      return new ValidationError('Required field is missing');
    case '23514': // check_violation
      return new ValidationError('Invalid data provided');
    case '28P01': // invalid_password
      return new UnauthorizedError('Database authentication failed');
    case 'ECONNREFUSED':
      return new AppError('Database connection refused', 503, 'DB_CONNECTION_ERROR');
    case 'ETIMEDOUT':
      return new AppError('Database connection timeout', 503, 'DB_TIMEOUT_ERROR');
    default:
      return new AppError('Database operation failed', 500, 'DB_ERROR', error.message);
  }
};

// Redis error handler
const handleRedisError = (error: any): AppError => {
  console.error('Redis error:', error);

  if (error.code === 'ECONNREFUSED') {
    return new AppError('Cache service unavailable', 503, 'CACHE_CONNECTION_ERROR');
  }
  if (error.code === 'ETIMEDOUT') {
    return new AppError('Cache service timeout', 503, 'CACHE_TIMEOUT_ERROR');
  }
  return new AppError('Cache service error', 500, 'CACHE_ERROR', error.message);
};

// JWT error handler
const handleJWTError = (error: any): AppError => {
  if (error.name === 'JsonWebTokenError') {
    return new UnauthorizedError('Invalid authentication token');
  }
  if (error.name === 'TokenExpiredError') {
    return new UnauthorizedError('Authentication token expired');
  }
  if (error.name === 'NotBeforeError') {
    return new UnauthorizedError('Authentication token not active');
  }
  return new UnauthorizedError('Authentication error');
};

// Multer (file upload) error handler
const handleMulterError = (error: any): AppError => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('File size too large');
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Too many files uploaded');
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new ValidationError('Unexpected file field');
  }
  return new ValidationError(`File upload error: ${error.message}`);
};

// Main error handling middleware
export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let processedError: AppError;

  // Handle different types of errors
  if (error instanceof AppError) {
    processedError = error;
  } else if (error.name === 'ValidationError') {
    processedError = new ValidationError(error.message, error.details);
  } else if (error.name && error.name.includes('Sequelize')) {
    processedError = handleDatabaseError(error);
  } else if (error.code && error.code.startsWith('23')) {
    // PostgreSQL error codes
    processedError = handleDatabaseError(error);
  } else if (error.name && error.name.includes('Redis')) {
    processedError = handleRedisError(error);
  } else if (error.name && error.name.includes('JWT')) {
    processedError = handleJWTError(error);
  } else if (error.name === 'MulterError') {
    processedError = handleMulterError(error);
  } else if (error.code === 'ENOENT') {
    processedError = new NotFoundError('File');
  } else if (error.code === 'EACCES') {
    processedError = new AppError('Permission denied', 403, 'PERMISSION_DENIED');
  } else if (error.code === 'ECONNREFUSED') {
    processedError = new AppError('Service unavailable', 503, 'SERVICE_UNAVAILABLE');
  } else {
    // Unknown error
    console.error('Unhandled error:', error);
    processedError = new AppError(
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message || 'Unknown error occurred',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? error.stack : undefined
    );
  }

  // Log error for debugging
  console.error('Error details:', {
    message: processedError.message,
    statusCode: processedError.statusCode,
    code: processedError.code,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    details: processedError.details,
    stack: processedError.stack
  });

  // Set retry-after header for rate limit errors
  if (processedError.code === 'RATE_LIMIT_EXCEEDED' && processedError.details?.retryAfter) {
    res.set('Retry-After', processedError.details.retryAfter.toString());
  }

  // Send error response
  const errorResponse = createErrorResponse(
    processedError.message,
    processedError.statusCode,
    {
      code: processedError.code,
      details: processedError.details,
      requestId: req.headers['x-request-id'],
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    }
  );

  res.status(processedError.statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse = createErrorResponse(
    `Route ${req.originalUrl} not found`,
    404,
    {
      code: 'NOT_FOUND',
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString()
    }
  );

  res.status(404).json(errorResponse);
};

// Development error handler (detailed errors)
export const developmentErrorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errorResponse = {
    success: false,
    error: error.message,
    code: error.code || 'INTERNAL_ERROR',
    statusCode: error.statusCode || 500,
    details: error.details,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  };

  res.status(error.statusCode || 500).json(errorResponse);
};