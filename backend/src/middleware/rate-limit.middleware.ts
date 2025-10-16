import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitInfo {
  requests: number;
  resetTime: number;
  windowMs: number;
}

class RateLimiter {
  private options: RateLimitOptions;

  constructor(options: RateLimitOptions) {
    this.options = {
      message: 'Too many requests, please try again later.',
      keyGenerator: (req) => this.getDefaultKey(req),
      ...options
    };
  }

  private getDefaultKey(req: Request): string {
    // Use IP address as default key, fallback to user ID if available
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  private async getRateLimitInfo(key: string): Promise<RateLimitInfo | null> {
    try {
      const data = await redis.get(`rate_limit:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting rate limit info:', error);
      return null;
    }
  }

  private async setRateLimitInfo(key: string, info: RateLimitInfo): Promise<void> {
    try {
      await redis.setex(
        `rate_limit:${key}`,
        Math.ceil(this.options.windowMs / 1000),
        JSON.stringify(info)
      );
    } catch (error) {
      console.error('Error setting rate limit info:', error);
    }
  }

  middleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = this.options.keyGenerator!(req);
      const now = Date.now();

      let rateLimitInfo = await this.getRateLimitInfo(key);

      if (!rateLimitInfo || now > rateLimitInfo.resetTime) {
        // New window or expired window
        rateLimitInfo = {
          requests: 1,
          resetTime: now + this.options.windowMs,
          windowMs: this.options.windowMs
        };
      } else {
        // Existing window
        rateLimitInfo.requests++;
      }

      // Save updated info
      await this.setRateLimitInfo(key, rateLimitInfo);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': this.options.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, this.options.maxRequests - rateLimitInfo.requests).toString(),
        'X-RateLimit-Reset': Math.ceil(rateLimitInfo.resetTime / 1000).toString()
      });

      // Check if limit exceeded
      if (rateLimitInfo.requests > this.options.maxRequests) {
        const retryAfter = Math.ceil((rateLimitInfo.resetTime - now) / 1000);

        res.set('Retry-After', retryAfter.toString());
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: this.options.message,
          retryAfter,
          limit: this.options.maxRequests,
          windowMs: this.options.windowMs,
          resetTime: new Date(rateLimitInfo.resetTime).toISOString()
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // If rate limiting fails, allow the request
      next();
    }
  };
}

// Predefined rate limiters for different use cases
export const createApiRateLimit = {
  middleware: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000, // 1000 requests per 15 minutes
    message: 'API rate limit exceeded. Please try again later.'
  }).middleware
};

export const createEmbeddingRateLimit = {
  middleware: new RateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 100, // 100 embedding requests per minute
    message: 'Embedding rate limit exceeded. Please try again later.'
  }).middleware
};

export const createUploadRateLimit = {
  middleware: new RateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20, // 20 uploads per 5 minutes
    message: 'Upload rate limit exceeded. Please try again later.'
  }).middleware
};

export const createAuthRateLimit = {
  middleware: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 login attempts per 15 minutes
    message: 'Too many login attempts. Please try again later.'
  }).middleware
};

// General purpose rate limiter
export const generalRateLimit = {
  middleware: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 500, // 500 requests per 15 minutes
    message: 'Too many requests. Please try again later.'
  }).middleware
};

export { RateLimiter };