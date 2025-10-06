import apiClient from './client';

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
  logging: {
    level: string;
    file: string;
    maxSize: string;
    maxFiles: number;
  };
}

export async function getAppSettings(): Promise<AppSettings> {
  // Use the main settings endpoint that returns nested config format
  const response = await apiClient.get('/api/v2/settings/');

  // The backend returns data directly, not wrapped in a success/data object
  if (response.data.error) {
    throw new Error(response.data.error || 'Failed to load settings');
  }

  // Return the data directly, transforming it to match AppSettings interface if needed
  return response.data as AppSettings;
}

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