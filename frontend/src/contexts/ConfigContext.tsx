'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import apiClient, { authenticatedFetch } from '@/lib/api/client';
import { initializeLogger } from '@/lib/logger';

interface Config {
  app: {
    name: string;
    description: string;
    version: string;
    locale: string;
    debugMode?: boolean;
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
  };
  dataSource: {
    useLocalDb: boolean;
    localDbPercentage: number;
    externalApiPercentage: number;
    hybridMode: boolean;
    prioritySource: string;
  };
  llmSettings: {
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
  chatbot?: {
    title?: string;
    subtitle?: string;
    logoUrl?: string;
    welcomeMessage?: string;
    placeholder?: string;
    primaryColor?: string;
  };
}

interface ConfigContextType {
  config: Config | null;
  loading: boolean;
  error: string | null;
  backendDown: boolean; // Flag to indicate backend/database is down
  refreshConfig: () => Promise<void>;
  updateConfig: (newConfig: Config) => Promise<void>;
  isConfigurationComplete: (config: Config | null) => boolean;
}

const DEFAULT_CONFIG: Config = {
  app: { name: 'LSEMB', description: 'AI-Powered Knowledge Management System', version: '1.0.0', locale: 'tr' },
  database: { host: 'localhost', port: 5432, name: 'lsemb', user: 'postgres', password: 'postgres', ssl: false, maxConnections: 20 },
  redis: { host: 'localhost', port: 6379, password: '', db: 0 },
  openai: { apiKey: '', model: 'gpt-4-turbo-preview', embeddingModel: 'text-embedding-3-small', maxTokens: 4096, temperature: 0.7 },
  anthropic: { apiKey: '', model: 'claude-3-5-sonnet-20241022', maxTokens: 4096 },
  deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-coder' },
  ollama: { baseUrl: 'http://localhost:11434', model: 'llama2', embeddingModel: 'nomic-embed-text' },
  huggingface: { apiKey: '', model: 'sentence-transformers/all-MiniLM-L6-v2', endpoint: 'https://api-inference.huggingface.co/models/' },
  n8n: { url: 'http://localhost:5678', apiKey: '' },
  scraper: { timeout: 30000, maxConcurrency: 3, userAgent: 'LSEM Web Scraper' },
  embeddings: { chunkSize: 1000, chunkOverlap: 200, batchSize: 10, provider: 'openai' },
  dataSource: { useLocalDb: true, localDbPercentage: 100, externalApiPercentage: 0, hybridMode: false, prioritySource: 'local' },
  llmSettings: { temperature: 0.1, topP: 0.9, maxTokens: 2048, presencePenalty: 0, frequencyPenalty: 0, ragWeight: 95, llmKnowledgeWeight: 5, streamResponse: true, systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver.', activeChatModel: 'openai/gpt-4-turbo-preview', activeEmbeddingModel: 'openai/text-embedding-3-small', responseStyle: 'professional', language: 'tr' }
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const fetchConfig = useCallback(async (authToken?: string) => {
    try {
      setLoading(true);

      // Force apiClient to use specific token if provided (e.g. initial load)
      if (authToken) {
        apiClient.setToken(authToken);
      }

      const response = await apiClient.get<Partial<Config>>('/api/v2/settings');
      const data = response.data;

      // Transform backend settings to match Config interface
      const transformedConfig: Config = {
        app: {
          name: data.app?.name || 'Luwi Semantic Bridge',
          description: data.app?.description || 'Intelligent RAG & Context Engine',
          version: data.app?.version || '1.0.0',
          locale: data.app?.locale || 'tr'
        },
        database: data.database || DEFAULT_CONFIG.database,
        redis: data.redis || DEFAULT_CONFIG.redis,
        openai: data.openai || DEFAULT_CONFIG.openai,
        anthropic: data.anthropic || DEFAULT_CONFIG.anthropic,
        deepseek: data.deepseek || DEFAULT_CONFIG.deepseek,
        ollama: data.ollama || DEFAULT_CONFIG.ollama,
        huggingface: data.huggingface || DEFAULT_CONFIG.huggingface,
        n8n: data.n8n || DEFAULT_CONFIG.n8n,
        scraper: data.scraper || DEFAULT_CONFIG.scraper,
        embeddings: data.embeddings || DEFAULT_CONFIG.embeddings,
        dataSource: data.dataSource || DEFAULT_CONFIG.dataSource,
        llmSettings: data.llmSettings || DEFAULT_CONFIG.llmSettings,
        chatbot: data.chatbot
      };

      // Fetch chatbot settings separately if not in main config and no error
      if (!data.chatbot) {
        try {
          const chatRes = await apiClient.get<any>('/api/v2/chatbot/settings');
          if (chatRes.data) {
            transformedConfig.chatbot = {
              title: chatRes.data.title,
              subtitle: chatRes.data.subtitle,
              logoUrl: chatRes.data.logoUrl,
              welcomeMessage: chatRes.data.welcomeMessage,
              placeholder: chatRes.data.placeholder,
              primaryColor: chatRes.data.primaryColor
            };
          }
        } catch (e) {
          console.warn('Chatbot settings fetch failed', e);
        }
      }

      setConfig(transformedConfig);
      initializeLogger(transformedConfig.app?.debugMode ?? false);
      setError(null);
      setBackendDown(false);
      setRetryCount(0);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching config:', err);
      const errorMessage = err.message || 'Failed to load configuration';

      // Check if it's a connection error (backend not ready)
      // Axios errors have codes like ERR_NETWORK or 503
      if (err.code === 'ERR_NETWORK' || (err.response && err.response.status >= 500)) {
        console.log(`⏳ Backend not ready yet (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        setError('Backend bağlantısı bekleniyor...');

        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(2000 * Math.pow(2, retryCount), 10000);
          setTimeout(() => {
            console.log(`🔄 Retrying backend connection (attempt ${retryCount + 2}/${MAX_RETRIES})...`);
            setRetryCount(prev => prev + 1);
            fetchConfig(authToken);
          }, delay);
        } else {
          console.error('❌ Backend/Database is down after multiple retries');
          setBackendDown(true);
          setError('Backend veya veritabanı bağlantısı başarısız. Lütfen sunucuyu kontrol edin.');
          setLoading(false);
        }
      } else {
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, [retryCount]);

  const updateConfig = async (newConfig: Config) => {
    try {
      const response = await apiClient.put<{ config: Config }>('/api/v2/settings', newConfig);

      if (response.data && response.data.config) {
        setConfig(response.data.config);
        setError(null);
      } else {
        throw new Error('Invalid response format');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated'));
      }
    } catch (err: any) {
      console.error('Error updating config:', err);
      setError(err.message || 'Failed to update configuration');
      throw err;
    }
  };

  const isConfigurationComplete = (config: Config | null): boolean => {
    if (!config) return false;
    const hasEssentialConfig =
      config.app?.name &&
      config.database?.host &&
      config.database?.name &&
      config.openai?.apiKey &&
      config.anthropic?.apiKey;
    return Boolean(hasEssentialConfig);
  };

  const fetchPublicChatbotSettings = async (): Promise<{ name: string; description: string }> => {
    try {
      // Unauthenticated request
      const response = await apiClient.get<any>('/api/v2/chatbot/settings');
      if (response.data) {
        return {
          name: response.data.title || 'LSEMB',
          description: response.data.subtitle || 'AI-Powered Knowledge Management System'
        };
      }
    } catch (error) {
      console.error('Error fetching public chatbot settings:', error);
    }
    return { name: 'LSEMB', description: 'AI-Powered Knowledge Management System' };
  };

  useEffect(() => {
    // Only try to fetch config if there's a token (user is authenticated)
    const token = apiClient.getToken();

    if (token) {
      fetchConfig(token);
    } else {
      fetchPublicChatbotSettings().then((settings) => {
        setConfig({
          ...DEFAULT_CONFIG,
          app: {
            ...DEFAULT_CONFIG.app,
            name: settings.name,
            description: settings.description,
          }
        });
        setLoading(false);
      });
    }
  }, [fetchConfig]);

  // Listen for token changes to automatically refresh config
  useEffect(() => {
    const handleTokenChange = (e: StorageEvent | CustomEvent) => {
      // If token changed, refresh config
      const token = apiClient.getToken();
      if (token) {
        fetchConfig(token);
      } else {
        // Token removed - fetch public settings
        fetchPublicChatbotSettings().then((settings) => {
          setConfig({
            ...DEFAULT_CONFIG,
            app: {
              ...DEFAULT_CONFIG.app,
              name: settings.name,
              description: settings.description,
            }
          });
          setLoading(false);
        });
      }
    };

    if (typeof window !== 'undefined') {
      // We can listen to localStorage changes for cross-tab, but apiClient might not update automatically
      // apiClient reads from localStorage on getToken() so it should be fine.
      window.addEventListener('storage', handleTokenChange);
      // Listen for custom token change events if valid
      window.addEventListener('tokenChanged', handleTokenChange as EventListener); // Legacy support

      const handleSettingsUpdate = (e: Event) => {
        if (e instanceof CustomEvent && e.detail && e.detail.category === 'app' && e.detail.settings) {
          setConfig(prev => {
            if (!prev) return null;
            return {
              ...prev,
              app: {
                ...prev.app,
                ...e.detail.settings
              }
            };
          });
        }
        const token = apiClient.getToken();
        if (token) fetchConfig(token);
      };
      window.addEventListener('settingsUpdated', handleSettingsUpdate);

      return () => {
        window.removeEventListener('storage', handleTokenChange);
        window.removeEventListener('tokenChanged', handleTokenChange as EventListener);
        window.removeEventListener('settingsUpdated', handleSettingsUpdate);
      };
    }
  }, [fetchConfig]);

  return (
    <ConfigContext.Provider
      value={{
        config,
        loading,
        error,
        backendDown,
        refreshConfig: (authToken?: string) => fetchConfig(authToken),
        updateConfig,
        isConfigurationComplete
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

