/**
 * High-Performance API Client for Alice Semantic Bridge
 * Target: <200ms response time with caching, retries, and performance monitoring
 */

import config from '@/config/api.config';

const resolveUrl = (endpoint: string): string => {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://') || endpoint.startsWith('ws://')) {
    return endpoint;
  }
  return config.getApiUrl(endpoint);
};

interface RequestOptions extends Omit<RequestInit, 'cache'> {
  timeout?: number;
  retries?: number;
  cache?: boolean;
}


// Performance cache
const responseCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

// Performance monitoring
const performanceStats = {
  totalRequests: 0,
  cachedRequests: 0,
  averageResponseTime: 0,
  slowRequests: [] as string[],
};

// Optimized fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Cache management
function getCachedResponse(key: string): unknown | null {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    performanceStats.cachedRequests++;
    return cached.data;
  }
  responseCache.delete(key);
  return null;
}

function setCachedResponse(key: string, data: unknown): void {
  // Limit cache size
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  responseCache.set(key, { data, timestamp: Date.now() });
}

// Generic fetch wrapper with error handling and performance tracking
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const startTime = performance.now();
  const url = resolveUrl(endpoint);
  const { retries = 1, cache: customCache = false, ...fetchOptions } = options;
  const cacheKey = `${fetchOptions.method || 'GET'}_${url}_${JSON.stringify(fetchOptions.body || {})}`;
  
  performanceStats.totalRequests++;
  
  // Check cache for GET requests
  if ((fetchOptions.method === 'GET' || !fetchOptions.method) && customCache) {
    const cachedData = getCachedResponse(cacheKey);
    if (cachedData) {
      console.log(`[Cache Hit] ${endpoint} - ${performance.now() - startTime}ms`);
      return cachedData as T;
    }
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
            const response = await fetchWithTimeout(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions?.headers,
        },
      });

      const responseTime = performance.now() - startTime;
      
      // Update performance stats
      performanceStats.averageResponseTime = 
        (performanceStats.averageResponseTime * (performanceStats.totalRequests - 1) + responseTime) / 
        performanceStats.totalRequests;
      
      // Track slow requests
      if (responseTime > 200) {
        performanceStats.slowRequests.push(`${endpoint} - ${responseTime}ms`);
        console.warn(`[Slow API] ${endpoint} took ${responseTime}ms`);
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API request failed: ${response.statusText} - ${error}`);
      }

      const data = await response.json();
      
      // Cache successful GET requests
      if ((fetchOptions.method === 'GET' || !fetchOptions.method) && customCache) {
        setCachedResponse(cacheKey, data);
      }
      
      console.log(`[API] ${endpoint} - ${responseTime}ms`);
      return data;
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries) {
        console.log(`[Retry ${attempt + 1}/${retries}] ${endpoint}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  console.error(`API request error for ${endpoint}:`, lastError);
  throw lastError;
}

// GET request helper
export async function apiGet<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

// POST request helper
export async function apiPost<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

// PUT request helper
export async function apiPut<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

// DELETE request helper
export async function apiDelete<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}

// API endpoints organized by feature
export const api = {
  // Activity endpoints
  activity: {
    getHistory: (params?: string) => apiGet(`/api/v2/activity/history${params || ''}`),
    initTable: () => apiPost('/api/v2/activity/init-table'),
  },

  // Analytics endpoints
  analytics: {
    get: () => apiGet('/api/v2/lightrag/analytics'),
  },

  // Cache endpoints
  cache: {
    getStats: () => apiGet('/api/v2/cache/stats'),
    getKeys: () => apiGet('/api/v2/cache/keys'),
    flush: () => apiPost('/api/v2/cache/flush'),
    deleteKey: (key: string) => apiDelete(`/api/v2/cache/keys/${encodeURIComponent(key)}`),
  },

  // Database config endpoints
  database: {
    getConfig: () => apiGet('/api/v2/config/database'),
    testConnection: (config: unknown) => apiPost('/api/v2/config/database/test', config),
    updateConfig: (config: unknown) => apiPost('/api/v2/config/database', config),
    restart: () => apiPost('/api/v2/config/database/restart'),
  },

  // Documents endpoints
  documents: {
    list: () => apiGet('/api/v2/documents'),
    upload: (formData: FormData) => 
      fetch(resolveUrl('/api/v2/documents/upload'), {
        method: 'POST',
        body: formData,
      }).then(res => res.json()),
    create: (data: unknown) => apiPost('/api/v2/documents', data),
    delete: (id: string) => apiDelete(`/api/v2/documents/${id}`),
  },

  // Embeddings endpoints
  embeddings: {
    getStats: () => apiGet('/api/v2/embeddings/stats'),
    getJobs: () => apiGet('/api/v2/embeddings/jobs'),
    generate: (data: unknown) => apiPost('/api/v2/embeddings', data),
  },

  // Migration endpoints
  migration: {
    getStats: () => apiGet('/api/v2/migration/stats'),
    start: (data: unknown) => apiPost('/api/v2/migration/start', data),
  },

  // Prompts endpoints
  prompts: {
    list: () => apiGet('/api/v2/prompts'),
    save: (data: unknown) => apiPost('/api/v2/prompts', data),
    update: (id: string, data: unknown) => apiPut(`/api/v2/prompts/${id}`, data),
    delete: (id: string) => apiDelete(`/api/v2/prompts/${id}`),
  },

  // Services endpoints
  services: {
    list: () => apiGet('/api/v2/services'),
    toggleAll: (enabled: boolean) => apiPost('/api/v2/services/toggle-all', { enabled }),
    toggle: (service: string, enabled: boolean) => 
      apiPost(`/api/v2/services/${service}/toggle`, { enabled }),
    restart: (service: string) => apiPost(`/api/v2/services/${service}/restart`),
  },

  // Settings endpoints
  settings: {
    get: () => apiGet('/api/v2/settings'),
    update: (data: unknown) => apiPost('/api/v2/settings', data),
    generateApiKey: () => apiPost('/api/v2/settings/api-key/generate'),
  },

  // Workflow endpoints
  workflows: {
    list: () => apiGet('/api/v2/workflows'),
    create: (data: unknown) => apiPost('/api/v2/workflows', data),
    update: (id: string, data: unknown) => apiPut(`/api/v2/workflows/${id}`, data),
    delete: (id: string) => apiDelete(`/api/v2/workflows/${id}`),
    execute: (id: string) => apiPost(`/api/v2/workflows/${id}/execute`),
  },

  // Chat endpoints
  chat: {
    send: (message: string) => apiPost('/api/chat', { message }),
    getSuggestions: () => apiGet('/api/v2/chat/suggestions'),
    getHistory: () => apiGet('/api/chat/history'),
    clearHistory: () => apiPost('/api/chat/clear'),
  },

  // Search endpoints
  search: {
    semantic: (query: string) => apiPost('/api/search', { query }),
    documents: (query: string) => apiGet(`/api/search/documents?q=${encodeURIComponent(query)}`),
    entities: (query: string) => apiGet(`/api/search/entities?q=${encodeURIComponent(query)}`),
  },

  // Health check
  health: () => apiGet('/api/health'),
};

export default api;