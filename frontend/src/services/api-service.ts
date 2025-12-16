import { z } from 'zod';
import { API_BASE_URL } from '@/config/api.config';

// Error class for API errors
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Request/Response schemas for validation
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number()
  }).optional()
});

// Rate limiting state
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

class APIService {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  // Get auth token
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  // Check rate limit
  private checkRateLimit(endpoint: string): void {
    const key = endpoint;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 100; // 100 requests per minute

    const current = rateLimitMap.get(key);
    if (!current || now > current.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }

    if (current.count >= maxRequests) {
      throw new APIError(
        'Rate limit exceeded',
        429,
        'RATE_LIMIT_EXCEEDED',
        { retryAfter: Math.ceil((current.resetTime - now) / 1000) }
      );
    }

    current.count++;
  }

  // Generic request method with error handling and validation
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    schema?: z.ZodSchema<T>
  ): Promise<T> {
    // Check rate limit
    this.checkRateLimit(endpoint);

    const url = `${this.baseURL}${endpoint}`;
    const token = this.getAuthToken();

    const headers = {
      ...this.defaultHeaders,
      ...options.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle unauthorized
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        throw new APIError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      // Handle rate limit from server
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new APIError(
          'Rate limit exceeded',
          429,
          'RATE_LIMIT_EXCEEDED',
          { retryAfter: retryAfter ? parseInt(retryAfter) : 60 }
        );
      }

      const data = await response.json();

      // Validate response schema if provided
      if (schema) {
        const validated = ApiResponseSchema.parse(data);
        if (!validated.success) {
          throw new APIError(
            validated.error || 'API request failed',
            response.status,
            'API_ERROR',
            validated
          );
        }
        return validated.data as T;
      }

      // Default error handling
      if (!response.ok || !data.success) {
        throw new APIError(
          data.error || data.message || 'Request failed',
          response.status,
          'REQUEST_FAILED',
          data
        );
      }

      return data.data || data;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      // Network or other errors
      throw new APIError(
        error instanceof Error ? error.message : 'Network error',
        0,
        'NETWORK_ERROR',
        error
      );
    }
  }

  // HTTP methods
  async get<T>(endpoint: string, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request(endpoint, { method: 'GET' }, schema);
  }

  async post<T>(
    endpoint: string,
    data?: any,
    schema?: z.ZodSchema<T>
  ): Promise<T> {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }, schema);
  }

  async put<T>(
    endpoint: string,
    data?: any,
    schema?: z.ZodSchema<T>
  ): Promise<T> {
    return this.request(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }, schema);
  }

  async patch<T>(
    endpoint: string,
    data?: any,
    schema?: z.ZodSchema<T>
  ): Promise<T> {
    return this.request(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }, schema);
  }

  async delete<T>(endpoint: string, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request(endpoint, { method: 'DELETE' }, schema);
  }

  // File upload with progress
  async uploadFile(
    endpoint: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      // Progress tracking
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            onProgress(progress);
          }
        });
      }

      // Load complete
      xhr.addEventListener('load', () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(response.data || response);
          } else {
            reject(new APIError(
              response.error || 'Upload failed',
              xhr.status,
              'UPLOAD_FAILED'
            ));
          }
        } catch (error) {
          reject(error);
        }
      });

      // Error handling
      xhr.addEventListener('error', () => {
        reject(new APIError('Network error during upload', 0, 'UPLOAD_ERROR'));
      });

      // Set up request
      xhr.open('POST', `${this.baseURL}${endpoint}`);
      const token = this.getAuthToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  }
}

// Create singleton instance
export const apiService = new APIService();

// Specific API methods with schemas
export const authAPI = {
  login: (email: string, password: string) =>
    apiService.post('/api/v2/auth/login', { email, password }),

  refresh: (refreshToken: string) =>
    apiService.post('/api/v2/auth/refresh', { refreshToken }),

  logout: () =>
    apiService.post('/api/v2/auth/logout'),

  verify: () =>
    apiService.get('/api/v2/auth/verify'),
};

export const documentsAPI = {
  list: (params?: { limit?: number; offset?: number; search?: string }) =>
    apiService.get('/api/v2/documents', z.object({
      documents: z.array(z.any()),
      total: z.number()
    })),

  upload: (file: File, onProgress?: (progress: number) => void) =>
    apiService.uploadFile('/api/v2/documents/upload', file, onProgress),

  delete: (id: string) =>
    apiService.delete(`/api/v2/documents/${id}`),

  generateEmbeddings: (id: string) =>
    apiService.post(`/api/v2/documents/${id}/embeddings`),
};

export const scraperAPI = {
  getJobs: () =>
    apiService.get('/api/v2/scraper/jobs'),

  getData: (params?: { limit?: number; offset?: number; type?: string }) =>
    apiService.get('/api/v2/scraper/data'),

  createJob: (config: any) =>
    apiService.post('/api/v2/scraper/jobs', config),

  pauseJob: (id: string) =>
    apiService.post(`/api/v2/scraper/jobs/${id}/pause`),

  resumeJob: (id: string) =>
    apiService.post(`/api/v2/scraper/jobs/${id}/resume`),

  deleteJob: (id: string) =>
    apiService.delete(`/api/v2/scraper/jobs/${id}`),
};