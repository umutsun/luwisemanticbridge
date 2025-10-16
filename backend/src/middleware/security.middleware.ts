import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// NoSQL Injection Prevention for JSON/JSONB operations
export const preventNoSQLInjection = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeObject = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip dangerous operators
        if (isDangerousKey(key)) {
          console.warn(`Blocked potentially dangerous key: ${key}`);
          continue;
        }

        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }

    // Sanitize string values for NoSQL injection
    if (typeof obj === 'string') {
      // Remove potential NoSQL injection patterns
      return obj
        .replace(/\$where/gi, '')
        .replace(/\$ne/gi, '')
        .replace(/\$in/gi, '')
        .replace(/\$nin/gi, '')
        .replace(/\$gt/gi, '')
        .replace(/\$gte/gi, '')
        .replace(/\$lt/gi, '')
        .replace(/\$lte/gi, '')
        .replace(/\$regex/gi, '')
        .replace(/\$exists/gi, '')
        .replace(/\$expr/gi, '')
        .replace(/\$jsonSchema/gi, '')
        .replace(/\$mod/gi, '')
        .replace(/\$all/gi, '')
        .replace(/\$size/gi, '')
        .replace(/\$type/gi, '');
    }

    return obj;
  };

  const isDangerousKey = (key: string): boolean => {
    const dangerousPatterns = [
      /^\$/,
      /^(where|gt|gte|lt|lte|ne|in|nin|regex|exists|expr|jsonSchema|mod|all|size|type)$/i,
      /javascript:/i,
      /<script/i
    ];

    return dangerousPatterns.some(pattern => pattern.test(key));
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Rate limiting configuration
export const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests from rate limiting
    skipSuccessfulRequests: false,
    // Skip failed requests from rate limiting
    skipFailedRequests: false,
    // Custom key generator for rate limiting
    keyGenerator: (req: Request) => {
      return req.ip || 'unknown';
    }
  });
};

// Different rate limits for different endpoints
export const rateLimits = {
  // General API rate limit
  general: createRateLimit(
    15 * 60 * 1000, // 15 minutes
    1000, // 1000 requests
    'Too many requests from this IP, please try again later'
  ),

  // Strict rate limit for sensitive operations
  strict: createRateLimit(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests
    'Too many requests from this IP, please try again later'
  ),

  // Upload rate limit
  upload: createRateLimit(
    60 * 60 * 1000, // 1 hour
    50, // 50 uploads
    'Too many upload attempts, please try again later'
  ),

  // Search rate limit
  search: createRateLimit(
    1 * 60 * 1000, // 1 minute
    60, // 60 searches
    'Too many search requests, please try again later'
  ),

  // Embedding rate limit
  embedding: createRateLimit(
    60 * 60 * 1000, // 1 hour
    20, // 20 embedding operations
    'Too many embedding requests, please try again later'
  )
};

// Request payload size limits
export const payloadSizeLimits = {
  json: '10mb', // General JSON payload
  upload: '50mb', // File uploads
  text: '1mb' // Text-only payloads
};

// Input validation utilities
export const validateInput = {
  // Validate and sanitize email
  email: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate URL
  url: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  // Validate UUID
  uuid: (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },

  // Sanitize string input
  string: (str: string, maxLength: number = 1000): string => {
    if (typeof str !== 'string') return '';

    return str
      .trim()
      .substring(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential XSS
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+\s*=/gi, ''); // Remove event handlers
  },

  // Validate and sanitize JSON
  json: (jsonString: string): any => {
    try {
      const parsed = JSON.parse(jsonString);

      // Check for dangerous patterns
      const dangerousPatterns = [
        /\$where/,
        /\$ne/,
        /\$in/,
        /\$nin/,
        /\$gt/,
        /\$gte/,
        /\$lt/,
        /\$lte/,
        /\$regex/,
        /\$exists/,
        /\$expr/,
        /javascript:/i,
        /<script/i
      ];

      const jsonStr = JSON.stringify(parsed);
      for (const pattern of dangerousPatterns) {
        if (pattern.test(jsonStr)) {
          throw new Error('Dangerous pattern detected in JSON');
        }
      }

      return parsed;
    } catch (error) {
      throw new Error('Invalid or dangerous JSON input');
    }
  }
};

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Error handler for security violations
export const handleSecurityError = (error: any, req: Request, res: Response, next: NextFunction) => {
  if (error.name === 'SecurityError') {
    console.error('Security violation:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      error: error.message
    });

    return res.status(403).json({
      error: 'Security violation detected',
      message: 'Your request has been blocked for security reasons'
    });
  }

  next(error);
};

// Custom SecurityError class
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}