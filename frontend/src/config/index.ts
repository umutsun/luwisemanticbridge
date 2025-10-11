/**
 * Centralized Configuration for Alice Semantic Bridge
 * All hardcoded values should be moved here
 */

// Database Table Names - Use dynamic table names from database
// Import getDynamicTables from utils/table-names for dynamic table names
export const TABLES = {
  // Legacy support - these will be replaced with dynamic values
  // Use getDynamicTables() instead for new code
} as const;

// API Configuration
export const API = {
  TIMEOUTS: {
    DEFAULT: 30000,
    CHAT: 120000,
    SEARCH: 60000,
    LLM_CALL: 10000,
  },
  ENDPOINTS: {
    CHAT: '/api/chat',
    SEARCH: '/api/semantic-search',
    HEALTH: '/health',
    SEMANTIC_SEARCH: '/api/semantic-search',
    // Backend endpoints
    BACKEND: {
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
      },
    },
  },
} as const;

// Server Configuration
export const SERVER = {
  DEFAULT_PORTS: {
    BACKEND: parseInt(process.env.NEXT_PUBLIC_API_PORT || '8084', 10),
    FRONTEND: parseInt(process.env.NEXT_PUBLIC_PORT || '3002', 10),
    REDIS: 6379,
  },
  HOSTS: {
    LOCALHOST: process.env.NEXT_PUBLIC_API_HOST || 'localhost',
  },
} as const;

// UI Configuration
export const UI = {
  MESSAGE_LIMITS: {
    MAX_MESSAGES: 50,
    TRUNCATE_LENGTH: 200,
  },
  SCROLL: {
    AUTO_SCROLL_THRESHOLD: 100,
    SMOOTH_SCROLL_DELAY: 100,
  },
} as const;

// LLM Configuration
export const LLM = {
  DEFAULT_SETTINGS: {
    TEMPERATURE: 0.3,
    MAX_TOKENS: 4096,
    TOP_P: 0.1,
    PRESENCE_PENALTY: 0,
    FREQUENCY_PENALTY: 0,
    RAG_WEIGHT: 100,
    LLM_KNOWLEDGE_WEIGHT: 0,
  },
  MODELS: {
    DEFAULT: 'anthropic/claude-3-5-sonnet',
    FALLBACK: 'openai/gpt-4o-mini',
  },
  EMBEDDINGS: {
    DEFAULT_PROVIDER: 'google',
    DEFAULT_MODEL: 'text-embedding-004',
    MODELS: {
      OPENAI: 'text-embedding-3-large',
      GOOGLE: 'text-embedding-004',
    },
  },
} as const;

// Source Type Display Names - Use dynamic values from database
// Legacy support - these will be replaced with dynamic values
export const SOURCE_TYPE_DISPLAYS = {
  // Legacy support - these will be replaced with dynamic values
  // Use getDynamicTables() from utils/table-names instead
} as const;

// Default Configuration
export const DEFAULT_CONFIG = {
  tables: TABLES,
  api: API,
  server: SERVER,
  ui: UI,
  llm: LLM,
  sourceTypeDisplays: SOURCE_TYPE_DISPLAYS,
} as const;

export default DEFAULT_CONFIG;
