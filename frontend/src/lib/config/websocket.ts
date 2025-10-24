export const WEBSOCKET_CONFIG = {
  // WebSocket URL based on environment
  url: process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_WS_URL || `ws://localhost:8083`
    : `ws://localhost:8083`,

  // Connection settings
  reconnectAttempts: 5,
  reconnectInterval: 3000,
  heartbeatInterval: 30000,

  // Events for live data updates
  EVENTS: {
    // Dashboard metrics
    DASHBOARD_METRICS_UPDATE: 'dashboard:metrics:update',

    // Documents
    DOCUMENT_UPLOAD_PROGRESS: 'document:upload:progress',
    DOCUMENT_PROCESSING_STATUS: 'document:processing:status',
    DOCUMENT_EMBEDDING_UPDATE: 'document:embedding:update',
    DOCUMENT_LIST_UPDATE: 'document:list:update',
    DOCUMENT_TRANSFORM_PROGRESS: 'document:transform:progress',

    // Scraper jobs
    SCRAPER_JOB_STATUS: 'scraper:job:status',
    SCRAPER_JOB_PROGRESS: 'scraper:job:progress',
    SCRAPER_JOB_COMPLETE: 'scraper:job:complete',
    SCRAPER_LIST_UPDATE: 'scraper:list:update',

    // Embeddings
    EMBEDDING_JOB_STATUS: 'embedding:job:status',
    EMBEDDING_JOB_PROGRESS: 'embedding:job:progress',
    EMBEDDING_METRICS_UPDATE: 'embedding:metrics:update',

    // Chat/Conversations
    MESSAGE_STREAM: 'message:stream',
    TYPING_STATUS: 'typing:status',
    CONVERSATION_UPDATE: 'conversation:update',

    // System status
    SYSTEM_HEALTH_UPDATE: 'system:health:update',
    PERFORMANCE_METRICS: 'system:performance:metrics',

    // Settings updates
    SETTINGS_CHANGED: 'settings:changed',
    CONFIGURATION_UPDATE: 'configuration:update',
  },

  // Connection status
  CONNECTION_STATUS: {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    ERROR: 'error',
    RECONNECTING: 'reconnecting',
  }
};