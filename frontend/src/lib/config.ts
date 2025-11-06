/**
 * API Configuration
 * Values loaded from .env.lsemb via frontend/.env.local
 */
export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083',
  port: process.env.NEXT_PUBLIC_API_PORT || '8083',
  wsUrl: process.env.NEXT_PUBLIC_WEBSOCKET_URL || `ws://localhost:8083/socket.io`,

  endpoints: {
    // Dashboard
    dashboard: '/api/dashboard',

    // Chat
    chat: '/api/v2/chat',
    conversations: '/api/v2/conversations',
    messages: '/api/v2/messages',

    // Documents
    documents: '/api/v2/documents',
    upload: '/api/v2/documents/upload',
    history: '/api/v2/history/documents',
    documentStats: '/api/v2/documents/stats',
    documentOcr: '/api/v2/documents/ocr',
    documentEmbeddings: '/api/v2/documents/embeddings',
    physicalFiles: '/api/v2/documents/physical-files',
    physicalFilesAdd: '/api/v2/documents/physical-files/add',
    preview: '/api/v2/documents/preview',

    // Embeddings
    embeddings: '/api/v2/embeddings',
    embeddingsTables: '/api/v2/embeddings-tables',

    // Scraper
    scraper: '/api/v2/scraper',

    // Search
    search: '/api/v2/search',

    // Config
    config: '/api/v2/config',
    settings: '/api/v2/settings',

    // Health
    health: '/api/v2/health',

    // RAG
    rag: '/api/v2/rag',
    ragConfig: '/api/v2/rag/config',
    ragSearch: '/api/v2/rag/search',
    ragChat: '/api/v2/rag/chat',

    // Prompts (Settings)
    prompts: '/api/v2/settings/config/prompts',

    // Services
    servicesStatus: '/api/v2/services/status',
    servicesAction: '/api/v2/services',

    // Test connections
    testConnection: '/api/v2/test',

    // AI Settings
    aiSettings: '/api/v2/ai/settings',

    // Chatbot settings
    chatbotSettings: '/api/v2/chatbot/settings',

    // GraphQL
    graphql: '/api/graphql'
  }
};

export const getApiUrl = (endpoint: keyof typeof API_CONFIG.endpoints): string => {
  // For dashboard endpoint, use relative path to leverage Next.js rewrites
  if (endpoint === 'dashboard') {
    return API_CONFIG.endpoints[endpoint];
  }
  return `${API_CONFIG.baseUrl}${API_CONFIG.endpoints[endpoint]}`;
};

// Helper function to construct URLs with dynamic paths
export const buildApiUrl = (basePath: string, ...pathSegments: string[]): string => {
  const cleanPath = pathSegments.filter(segment => segment).join('/');
  return `${API_CONFIG.baseUrl}${basePath}/${cleanPath}`;
};