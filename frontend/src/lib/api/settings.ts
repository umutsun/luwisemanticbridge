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
    // Use direct fetch without authentication for settings
    const baseURL = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.NEXT_PUBLIC_API_PORT || '8083'}`;
    const response = await fetch(`${baseURL}/api/v2/settings?category=${category}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.error || `Failed to load ${category} settings (Status: ${response.status})`);
    }

    if (responseData.error) {
      throw new Error(responseData.error || `Failed to load ${category} settings`);
    }

    return responseData || {};
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
  try {
    console.log(`🔧 Updating ${category} settings:`, settings);
    // Use direct fetch without authentication for settings
    const baseURL = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.NEXT_PUBLIC_API_PORT || '8083'}`;
    const response = await fetch(`${baseURL}/api/v2/settings/${category}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings)
    });

    const responseData = await response.json();
    console.log(`✅ ${category} settings response:`, responseData);

    if (!response.ok) {
      throw new Error(responseData.error || `Failed to update ${category} settings (Status: ${response.status})`);
    }

    if (responseData.error) {
      throw new Error(responseData.error || `Failed to update ${category} settings`);
    }

    return responseData;
  } catch (error: any) {
    console.error(`❌ Error updating ${category} settings:`, error);

    // More detailed error information
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
      console.error('Error response headers:', error.response.headers);
      throw new Error(error.response.data?.error || `Server error: ${error.response.status}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Error request:', error.request);
      throw new Error('Network error: No response from server');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
      throw new Error(error.message || `Failed to update ${category} settings`);
    }
  }
}