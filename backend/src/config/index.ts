/**
 * Centralized Configuration for Alice Semantic Bridge Backend
 * All hardcoded values should be moved here
 */

// Database Table Names - Environment variables'den al
export const TABLES = {
  OZELGELER: process.env.DB_TABLE_OZELGELER || 'OZELGELER',
  DANISTAY_KARARLARI: process.env.DB_TABLE_DANISTAY_KARARLARI || 'DANISTAYKARARLARI',
  MEVZUAT: process.env.DB_TABLE_MEVZUAT || 'MEVZUAT',
  MAKALELER: process.env.DB_TABLE_MAKALELER || 'Makaleler',
  DOKUMAN: process.env.DB_TABLE_DOKUMAN || 'Dokümanlar',
  SORU_CEVAP: process.env.DB_TABLE_SORU_CEVAP || 'sorucevap',
  DOCUMENTS: process.env.DB_TABLE_DOCUMENTS || 'documents',
  CONVERSATIONS: process.env.DB_TABLE_CONVERSATIONS || 'conversations',
  MESSAGES: process.env.DB_TABLE_MESSAGES || 'messages',
  EMBEDDINGS: process.env.DB_TABLE_EMBEDDINGS || 'embeddings',
  UNIFIED_EMBEDDINGS: process.env.DB_TABLE_UNIFIED_EMBEDDINGS || 'unified_embeddings',
} as const;

// Server Configuration
export const SERVER = {
  PORT: parseInt(process.env.BACKEND_PORT || process.env.API_PORT || '8083', 10),
  HOST: process.env.HOST || '0.0.0.0',
  DEFAULT_PORTS: {
    BACKEND: parseInt(process.env.BACKEND_PORT || '8083', 10),
    FRONTEND: parseInt(process.env.FRONTEND_PORT || '3000', 10),
    REDIS: parseInt(process.env.REDIS_PORT || '6380', 10),
  },
  WEBSOCKET: {
    PORT: parseInt(process.env.WEBSOCKET_PORT || '8083', 10),
    PATH: process.env.WEBSOCKET_PATH || '/socket.io',
    ENABLED: process.env.ENABLE_WEBSOCKET === 'true',
    NOTIFICATIONS_PATH: process.env.WEBSOCKET_NOTIFICATIONS_PATH || '/ws/notifications',
  },
} as const;

// Timeouts (in milliseconds)
export const TIMEOUTS = {
  API_CALL: 30000,
  LLM_CALL: 10000,
  EMBEDDING_GENERATION: 30000,
  SCRAPING: 120000,
  DATABASE_QUERY: 10000,
  HEALTH_CHECK: 5000,
  // Delays for async operations
  DELAYS: {
    WORKER_INIT_BASE: 500,
    WORKER_INIT_MULTIPLIER: 200,
    BATCH_PROCESSING: 50,
    EMBEDDING_BATCH: 200,
  },
} as const;

// API Configuration
export const API = {
  VERSIONS: {
    V1: '/api/v1',
    V2: '/api/v2',
  },
  ENDPOINTS: {
    V1: {
      CHAT: '/api/v1/chat',
      SEARCH: '/api/v1/search',
      DASHBOARD: '/api/v1/dashboard',
      SCRAPER: '/api/v1/scraper',
      EMBEDDINGS: '/api/v1/embeddings',
    },
    V2: {
      CHAT: '/api/v2/chat',
      SEARCH: '/api/v2/search',
      DASHBOARD: '/api/v2/dashboard',
      SCRAPER: '/api/v2/scraper',
      EMBEDDINGS: '/api/v2/embeddings',
      SETTINGS: '/api/v2/settings',
      MIGRATION: '/api/v2/migration',
      RAG: '/api/v2/rag',
      ACTIVITY: '/api/v2/activity',
      AUTH: '/api/v2/auth',
      USERS: '/api/v2/users',
      HEALTH: '/api/v2/health',
    },
  },
  RESPONSE_LIMITS: {
    MAX_SOURCES: 10,
    MAX_RELATED_TOPICS: 5,
    MAX_CONTENT_LENGTH: 10000,
  },
} as const;

// LLM Configuration
export const LLM = {
  DEFAULT_SETTINGS: {
    TEMPERATURE: 0.1,
    MAX_TOKENS: 2048,
    TOP_P: 0.1,
    PRESENCE_PENALTY: 0,
    FREQUENCY_PENALTY: 0,
    RAG_WEIGHT: 100,
    LLM_KNOWLEDGE_WEIGHT: 0,
  },
  PROVIDERS: {
    OPENAI: 'openai',
    CLAUDE: 'claude',
    GEMINI: 'gemini',
    GROQ: 'groq',
    DEEPSEEK: 'deepseek',
  },
} as const;

// Database Configuration
export const DATABASE = {
  POOL: {
    SIZE: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    IDLE_TIMEOUT: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
    CONNECTION_TIMEOUT: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '30000', 10),
    MAX_USES: parseInt(process.env.DB_POOL_MAX_USES || '5000', 10),
  },
} as const;

// Redis Configuration
export const REDIS = {
  DEFAULT_DB: parseInt(process.env.REDIS_DB || '2', 10),
  DEFAULT_PORT: parseInt(process.env.REDIS_PORT || '6380', 10),
  DEFAULT_HOST: process.env.REDIS_HOST || 'localhost',
  DEFAULT_PASSWORD: process.env.REDIS_PASSWORD || 'redis_password_2025',
} as const;

// Rate Limiting
export const RATE_LIMIT = {
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
} as const;

// Search Configuration
export const SEARCH = {
  DEFAULT_LIMIT: 10,
  MAX_RESULTS: 50,
  SIMILARITY_THRESHOLD: 0.7,
  EMBEDDING_MODEL: 'text-embedding-ada-002',
} as const;

// Export all configurations
export const CONFIG = {
  tables: TABLES,
  server: SERVER,
  timeouts: TIMEOUTS,
  api: API,
  llm: LLM,
  database: DATABASE,
  redis: REDIS,
  rateLimit: RATE_LIMIT,
  search: SEARCH,
} as const;

export default CONFIG;