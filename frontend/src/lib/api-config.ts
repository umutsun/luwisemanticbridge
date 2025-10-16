/**
 * Unified API Configuration
 * Single source of truth for all API endpoints and configurations
 */

// Base configuration
export const API_CONFIG = {
  // Base URL - single source of truth
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083',

  // API versions
  V1: '/api/v1',
  V2: '/api/v2',

  // Endpoints
  ENDPOINTS: {
    // Authentication
    AUTH: {
      LOGIN: '/api/v2/auth/login',
      LOGOUT: '/api/v2/auth/logout',
      REGISTER: '/api/v2/auth/register',
      VERIFY: '/api/v2/auth/verify',
      REFRESH: '/api/v2/auth/refresh',
    },

    // Chat
    CHAT: {
      SEND: '/api/v2/chat/send',
      HISTORY: '/api/v2/chat/history',
      STREAM: '/api/v2/chat/stream',
      CLEAR: '/api/v2/chat/clear',
    },

    // Embeddings
    EMBEDDINGS: {
      BASE: '/api/v2/embeddings',
      PROGRESS: '/api/v2/embeddings/progress',
      START: '/api/v2/embeddings/start',
      STOP: '/api/v2/embeddings/stop',
      PAUSE: '/api/v2/embeddings/pause',
      RESUME: '/api/v2/embeddings/resume',
      ANALYTICS: '/api/v2/embeddings/analytics',
      TABLES: '/api/v2/embeddings-tables',
      TABLE_PREVIEW: (tableName: string) => `/api/v2/embeddings-tables/${tableName}/preview`,
    },

    // Documents
    DOCUMENTS: {
      BASE: '/api/v2/documents',
      UPLOAD: '/api/v2/documents/upload',
      LIST: '/api/v2/documents/list',
      DELETE: (id: string) => `/api/v2/documents/${id}`,
      PREVIEW: (id: string) => `/api/v2/documents/${id}/preview`,
      PROCESS: (id: string) => `/api/v2/documents/${id}/process`,
    },

    // Scraper
    SCRAPER: {
      BASE: '/api/v2/scraper',
      CONFIG: '/api/v2/scraper/config',
      START: '/api/v2/scraper/start',
      STOP: '/api/v2/scraper/stop',
      STATUS: '/api/v2/scraper/status',
      SITES: '/api/v2/scraper/sites',
      JOBS: '/api/v2/scraper/jobs',
    },

    // Settings
    SETTINGS: {
      BASE: '/api/v2/settings',
      LLM: '/api/v2/settings/llm',
      EMBEDDINGS: '/api/v2/settings/embeddings',
      DATABASE: '/api/v2/settings/database',
      SECURITY: '/api/v2/settings/security',
      RAG: '/api/v2/settings/rag',
    },

    // Health
    HEALTH: '/api/health',
  },

  // WebSocket endpoints
  WS: {
    CHAT: '/ws/chat',
    LOGS: '/ws/logs',
    NOTIFICATIONS: '/ws/notifications',
  },

  // Timeouts
  TIMEOUTS: {
    DEFAULT: 30000, // 30 seconds
    UPLOAD: 300000, // 5 minutes
    LONG_POLLING: 60000, // 1 minute
  },

  // Polling intervals (optimized for performance)
  INTERVALS: {
    PROGRESS: 5000, // 5 seconds (reduced from 2 seconds)
    PERFORMANCE: 10000, // 10 seconds (reduced from 2 seconds)
    NOTIFICATIONS: 30000, // 30 seconds
    HEALTH_CHECK: 60000, // 1 minute
  },
};

// Helper functions to build URLs
export const buildApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

export const getEndpoint = (category: keyof typeof API_CONFIG.ENDPOINTS, name: string): string => {
  const categoryEndpoints = API_CONFIG.ENDPOINTS[category];
  if (typeof categoryEndpoints === 'object' && name in categoryEndpoints) {
    const endpoint = (categoryEndpoints as any)[name];
    return typeof endpoint === 'function' ? endpoint : buildApiUrl(endpoint);
  }
  throw new Error(`Endpoint ${name} not found in category ${category}`);
};

// Default headers
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Export for backward compatibility
export default API_CONFIG;