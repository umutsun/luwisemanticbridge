import apiClient from './client';
import { settingsCache, withCache } from '../settings-cache';

export interface AppSettings {
  app: {
    name: string;
    description: string;
    version: string;
    locale: string;
    logoUrl?: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    maxConnections: number;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
  };
  openai: {
    apiKey: string;
    model: string;
    embeddingModel: string;
    maxTokens: number;
    temperature: number;
  };
  google: {
    apiKey: string;
    projectId: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  deepseek: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
    embeddingModel: string;
  };
  huggingface: {
    apiKey: string;
    model: string;
    endpoint: string;
  };
  n8n: {
    url: string;
    apiKey: string;
  };
  scraper: {
    timeout: number;
    maxConcurrency: number;
    userAgent: string;
  };
  embeddings: {
    chunkSize: number;
    chunkOverlap: number;
    batchSize: number;
    provider: string;
    model: string;
    normalizeEmbeddings: boolean;
    cacheEmbeddings: boolean;
    // Backend fields
    enabled: boolean;
    useLocal: boolean;
    dimension: number;
    maxTokens: number;
    localModel: string;
  };
  dataSource: {
    useLocalDb: boolean;
    localDbPercentage: number;
    externalApiPercentage: number;
    hybridMode: boolean;
    prioritySource: string;
  };
  llmSettings: {
    embeddingProvider: string;
    embeddingModel: string;
    ollamaBaseUrl?: string;
    ollamaEmbeddingModel?: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    presencePenalty: number;
    frequencyPenalty: number;
    ragWeight: number;
    llmKnowledgeWeight: number;
    streamResponse: boolean;
    systemPrompt: string;
    activeChatModel: string;
    activeEmbeddingModel: string;
    responseStyle: string;
    language: string;
  };
  security: {
    enableAuth: boolean;
    jwtSecret: string;
    sessionTimeout: number;
    rateLimit: number;
    corsOrigins: string[];
  };
  deepl: {
    apiKey: string;
    plan: string;
  };
  google: {
    apiKey: string;
    projectId: string;
    translate: {
      apiKey: string;
    };
  };
  logging: {
    level: string;
    file: string;
    maxSize: string;
    maxFiles: number;
  };
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    // Use the main settings endpoint that returns nested config format
    const response = await apiClient.get('/api/v2/settings/', {
      timeout: 5000 // 5 second timeout to prevent hanging
    });

    // The backend returns data directly, not wrapped in a success/data object
    if (response.data && response.data.error) {
      throw new Error(response.data.error || 'Failed to load settings');
    }

    // Return the data directly, transforming it to match AppSettings interface if needed
    // Return empty object if response.data is empty or null
    return response.data || {} as AppSettings;
  } catch (error: any) {
    // Log the error but don't throw to prevent breaking the UI
    console.warn('Settings endpoint unavailable, returning defaults:', error.message);
    // Return empty settings object to prevent errors
    return {} as AppSettings;
  }
}

// Base category fetch function
async function fetchSettingsCategory(category: string): Promise<any> {
  try {
    const response = await apiClient.get(`/api/v2/settings?category=${category}`, {
      timeout: 3000 // 3 second timeout for category requests
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error || `Failed to load ${category} settings`);
    }

    return response.data || {};
  } catch (error: any) {
    console.warn(`${category} settings endpoint unavailable:`, error.message);
    return {};
  }
}

// Cached category-based settings loading for performance
export const getSettingsCategory = withCache(
  fetchSettingsCategory,
  (category: string) => `settings:${category}`,
  30000 // 30 seconds TTL for category settings
);

// Specific category getters for better performance (with caching)
export const getLLMSettings = () => getSettingsCategory('llm');
export const getEmbeddingsSettings = () => getSettingsCategory('embeddings');
export const getRAGSettings = () => getSettingsCategory('rag');
export const getDatabaseSettings = () => getSettingsCategory('database');
export const getSecuritySettings = () => getSettingsCategory('security');
export const getAppSettingsOnly = () => getSettingsCategory('app');
export const getTranslationSettings = () => getSettingsCategory('translation');

export async function getLLMProviders() {
  const response = await apiClient.get('/api/v2/settings/llm');

  if (response.data.error) {
    throw new Error(response.data.error || 'Failed to load LLM providers');
  }

  return response.data;
}

export async function getAppConfig() {
  const response = await apiClient.get('/api/v2/settings/app');

  if (response.data.error) {
    throw new Error(response.data.error || 'Failed to load app configuration');
  }

  return response.data;
}

export async function updateAppSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const response = await apiClient.put('/api/v2/settings/', settings);

  if (response.data.error) {
    throw new Error(response.data.error || 'Failed to update settings');
  }

  // Invalidate relevant cache entries
  Object.keys(settings).forEach(key => {
    settingsCache.invalidate(key);
  });

  return response.data as AppSettings;
}

export async function updateSettingsCategory(category: string, settings: any): Promise<any> {
  const response = await apiClient.put(`/api/v2/settings/${category}`, {
    value: JSON.stringify(settings)
  });

  if (response.data.error) {
    throw new Error(response.data.error || `Failed to update ${category} settings`);
  }

  return response.data;
}