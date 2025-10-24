import DOMPurify from 'dompurify';
import { z } from 'zod';

// Zod schemas for validation
export const schemas = {
  // Document validation
  documentTitle: z.string().min(1).max(255).trim(),
  documentContent: z.string().min(1).max(1000000).trim(),

  // Search query validation
  searchQuery: z.string().min(1).max(500).trim(),

  // URL validation
  url: z.string().url().max(2048),

  // User input validation
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email().max(255),

  // Scraper configuration
  scraperConfig: z.object({
    url: z.string().url(),
    maxDepth: z.number().min(1).max(10),
    includeImages: z.boolean(),
    includeLinks: z.boolean(),
    followExternal: z.boolean(),
  }),

  // Pagination
  pagination: z.object({
    limit: z.number().min(1).max(100),
    offset: z.number().min(0),
  }),
};

// Sanitize HTML content
export function sanitizeHTML(dirty: string): string {
  if (typeof window === 'undefined') return dirty;

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'i', 'b',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a',
      'code', 'pre',
      'blockquote',
      'span', 'div'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'class',
      'data-*', // Allow data attributes
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

// Sanitize user input for plain text
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML
    .substring(0, 10000); // Limit length
}

// Validate and sanitize search query
export function validateSearchQuery(query: unknown): string {
  const result = schemas.searchQuery.safeParse(query);
  if (!result.success) {
    throw new Error('Invalid search query');
  }
  return sanitizeText(result.data);
}

// Validate URL
export function validateURL(url: unknown): string {
  const result = schemas.url.safeParse(url);
  if (!result.success) {
    throw new Error('Invalid URL provided');
  }
  return result.data;
}

// XSS protection for dynamic content
export function createSafeHTML(html: string): { __html: string } {
  return {
    __html: sanitizeHTML(html)
  };
}

// Content Security Policy helper
export const cspConfig = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'", 'data:', 'https:'],
  'connect-src': ["'self'", 'https:'],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

// Generate CSP header
export function getCSPHeader(): string {
  return Object.entries(cspConfig)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

// Rate limiting helper
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(private maxRequests: number, private windowMs: number) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.requests.get(identifier) || [];

    // Remove old timestamps
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    if (timestamps.length >= this.maxRequests) {
      return false;
    }

    // Add current timestamp
    timestamps.push(now);
    this.requests.set(identifier, timestamps);

    return true;
  }
}

// Create rate limiters for different actions
export const rateLimiters = {
  search: new RateLimiter(100, 60000), // 100 searches per minute
  upload: new RateLimiter(10, 60000), // 10 uploads per minute
  api: new RateLimiter(1000, 60000), // 1000 API calls per minute
};

// Validate and sanitize file uploads
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size (10MB max)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  // Check file type
  const allowedTypes = [
    'text/plain',
    'text/markdown',
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(txt|md|json|pdf|docx?|csv|jpe?g|png|gif|webp)$/i)) {
    return { valid: false, error: 'File type not allowed' };
  }

  // Check file name for path traversal
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return { valid: false, error: 'Invalid file name' };
  }

  return { valid: true };
}

// Safe JSON parsing
export function safeJSONParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// Escape HTML entities
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}