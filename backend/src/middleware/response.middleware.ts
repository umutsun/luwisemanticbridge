import { Request, Response, NextFunction } from 'express';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    version?: string;
    processingTime?: number;
  };
}

// Extend Express Response to include our custom methods
declare global {
  namespace Express {
    interface Response {
      success: <T>(data?: T, message?: string, meta?: any) => Response;
      error: (message: string, statusCode?: number, details?: any) => Response;
      paginated: <T>(data: T[], page: number, limit: number, total: number, message?: string) => Response;
    }
  }
}

export const responseMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate request ID for tracking
  const requestId = req.headers['x-request-id'] as string ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Store request start time for performance tracking
  const startTime = Date.now();

  // Success response method
  res.success = <T>(data?: T, message?: string, meta?: any): Response => {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
      requestId,
      meta: {
        ...meta,
        processingTime: Date.now() - startTime,
        version: process.env.npm_package_version || '1.0.0'
      }
    };

    return res.json(response);
  };

  // Error response method
  res.error = (message: string, statusCode: number = 500, details?: any): Response => {
    const response: ApiResponse = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
      requestId,
      meta: {
        ...details,
        processingTime: Date.now() - startTime,
        version: process.env.npm_package_version || '1.0.0'
      }
    };

    return res.status(statusCode).json(response);
  };

  // Paginated response method
  res.paginated = <T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    message?: string
  ): Response => {
    const totalPages = Math.ceil(total / limit);

    const response: ApiResponse<T[]> = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
      requestId,
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        processingTime: Date.now() - startTime,
        version: process.env.npm_package_version || '1.0.0'
      }
    };

    return res.json(response);
  };

  // Add request ID to response headers for debugging
  res.setHeader('X-Request-ID', requestId);

  next();
};

// Helper function to create consistent error responses
export const createErrorResponse = (
  message: string,
  statusCode: number = 500,
  details?: any
): ApiResponse => {
  return {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    meta: {
      ...details,
      version: process.env.npm_package_version || '1.0.0'
    }
  };
};

// Helper function to create success responses
export const createSuccessResponse = <T>(
  data?: T,
  message?: string,
  meta?: any
): ApiResponse<T> => {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    meta: {
      ...meta,
      version: process.env.npm_package_version || '1.0.0'
    }
  };
};

// Helper function to create paginated responses
export const createPaginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  message?: string
): ApiResponse<T[]> => {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    meta: {
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      version: process.env.npm_package_version || '1.0.0'
    }
  };
};