// API Configuration
// All API endpoints and URLs should be configured here
import { SERVER } from './index';

const config = {
  // Base URLs from environment variables
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || `http://${SERVER.HOSTS.LOCALHOST}:${SERVER.DEFAULT_PORTS.BACKEND}`,
    websocketUrl: process.env.NEXT_PUBLIC_WEBSOCKET_URL || `ws://${SERVER.HOSTS.LOCALHOST}:${SERVER.DEFAULT_PORTS.BACKEND}`,
  },
  
  // API Endpoints
  endpoints: {
    // Chat endpoints
    chat: {
      send: '/api/v2/chat',
      suggestions: '/api/v2/chat/suggestions',
      history: '/api/v2/chat/conversations',
      clear: '/api/v2/chat/clear',
      complete: '/api/v2/chat/complete', // LLM excerpt completion
    },
    
    // Search endpoints
    search: {
      semantic: '/api/search',
      documents: '/api/search/documents',
      entities: '/api/search/entities',
    },
    
    // Dashboard endpoints
    dashboard: {
      stats: '/api/dashboard/stats',
      activity: '/api/dashboard/activity',
      settings: '/api/dashboard/settings',
    },
    
    // Scraper endpoints
    scraper: {
      scrape: '/api/scraper/scrape',
      status: '/api/scraper/status',
      history: '/api/scraper/history',
    },
    
    // Embeddings endpoints
    embeddings: {
      generate: '/api/embeddings/generate',
      search: '/api/embeddings/search',
      update: '/api/embeddings/update',
    },
    
    // Health check
    health: '/api/health',
  },
  
  // Helper function to get full URL
  getApiUrl: (endpoint: string): string => {
    const baseUrl = config.api.baseUrl;
    return `${baseUrl}${endpoint}`;
  },
  
  // Helper function to get WebSocket URL
  getWebSocketUrl: (path: string = ''): string => {
    const wsUrl = config.api.websocketUrl;
    return `${wsUrl}${path}`;
  },
};

export default config;

// Type-safe endpoint getter
export const getEndpoint = (category: keyof typeof config.endpoints, endpoint: string): string => {
  const categoryEndpoints = config.endpoints[category];
  if (categoryEndpoints && endpoint in categoryEndpoints) {
    const url = categoryEndpoints[endpoint as keyof typeof categoryEndpoints];
    // If it's already an absolute URL, return it as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return config.getApiUrl(url);
  }
  throw new Error(`Endpoint ${endpoint} not found in category ${category}`);
};

// Export commonly used URLs
export const API_BASE_URL = config.api.baseUrl;
export const WS_BASE_URL = config.api.websocketUrl;