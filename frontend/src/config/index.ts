/**
 * Centralized Configuration for Alice Semantic Bridge
 * All hardcoded values should be moved here
 */

// Database Table Names
export const TABLES = {
  OZELGELER: 'OZELGELER',
  DANISTAY_KARARLARI: 'DANISTAYKARARLARI',
  MEVZUAT: 'MEVZUAT',
  MAKALELER: 'Makaleler',
  DOKUMAN: 'Dokümanlar',
  SORU_CEVAP: 'sorucevap',
  DOCUMENTS: 'documents',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
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
    BACKEND: 8083,
    FRONTEND: 3000,
    REDIS: 6379,
  },
  HOSTS: {
    LOCALHOST: 'localhost',
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
    TEMPERATURE: 0.1,
    MAX_TOKENS: 2048,
    TOP_P: 0.1,
    PRESENCE_PENALTY: 0,
    FREQUENCY_PENALTY: 0,
    RAG_WEIGHT: 100,
    LLM_KNOWLEDGE_WEIGHT: 0,
  },
  MODELS: {
    DEFAULT: 'anthropic/claude-3-sonnet',
    FALLBACK: 'openai/gpt-3.5-turbo',
  },
} as const;

// Source Type Display Names
export const SOURCE_TYPE_DISPLAYS = {
  OZELGELER: 'Özelgeler',
  DANISTAYKARARLARI: 'Danıştay',
  MAKALELER: 'Makaleler',
  DOKUMAN: 'Dokümanlar',
  MEVZUAT: 'Mevzuat',
  sorucevap: 'Soru-Cevap',
  documents: 'Dokümanlar',
  conversations: 'Sohbetler',
  messages: 'Mesajlar',
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