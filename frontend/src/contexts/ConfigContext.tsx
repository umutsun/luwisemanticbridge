'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchWithAuth, setStoredToken } from '@/lib/auth-fetch';

interface Config {
  app: {
    name: string;
    description: string;
    version: string;
    locale: string;
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
}

interface ConfigContextType {
  config: Config | null;
  loading: boolean;
  error: string | null;
  refreshConfig: () => Promise<void>;
  updateConfig: (newConfig: Config) => Promise<void>;
  isConfigurationComplete: (config: Config | null) => boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async (authToken?: string) => {
    try {
      setLoading(true);

      // Hardcoded URL to fix fetch issues
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

      if (authToken) {
        setStoredToken(authToken);
      }

      const response = await fetchWithAuth(`${API_BASE_URL}/api/v2/settings/?t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch configuration from backend');
      }
      const data = await response.json();

      // Transform backend settings to match Config interface
      const transformedConfig = {
        app: {
          name: data.app?.name || 'Alice Semantic Bridge',
          description: data.app?.description || 'AI-Powered Knowledge Management System',
          version: data.app?.version || '1.0.0',
          locale: data.app?.locale || 'tr'
        },
        database: data.database || {
          host: 'localhost',
          port: 5432,
          name: 'alice_semantic_bridge',
          user: 'postgres',
          password: 'postgres',
          ssl: false,
          maxConnections: 20,
        },
        redis: data.redis || {
          host: 'localhost',
          port: 6379,
          password: '',
          db: 0,
        },
        openai: data.openai || {
          apiKey: '',
          model: 'gpt-4-turbo-preview',
          embeddingModel: 'text-embedding-3-small',
          maxTokens: 4096,
          temperature: 0.7,
        },
        anthropic: data.anthropic || {
          apiKey: '',
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 4096,
        },
        deepseek: data.deepseek || {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-coder',
        },
        ollama: data.ollama || {
          baseUrl: 'http://localhost:11434',
          model: 'llama2',
          embeddingModel: 'nomic-embed-text',
        },
        huggingface: data.huggingface || {
          apiKey: '',
          model: 'sentence-transformers/all-MiniLM-L6-v2',
          endpoint: 'https://api-inference.huggingface.co/models/',
        },
        n8n: data.n8n || {
          url: 'http://localhost:5678',
          apiKey: '',
        },
        scraper: data.scraper || {
          timeout: 30000,
          maxConcurrency: 3,
          userAgent: 'LSEM Web Scraper',
        },
        embeddings: data.embeddings || {
          chunkSize: 1000,
          chunkOverlap: 200,
          batchSize: 10,
          provider: 'openai',
        },
        dataSource: data.dataSource || {
          useLocalDb: true,
          localDbPercentage: 100,
          externalApiPercentage: 0,
          hybridMode: false,
          prioritySource: 'local',
        },
        llmSettings: data.llmSettings || {
          temperature: 0.1,
          topP: 0.9,
          maxTokens: 2048,
          presencePenalty: 0,
          frequencyPenalty: 0,
          ragWeight: 95,
          llmKnowledgeWeight: 5,
          streamResponse: true,
          systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver.',
          activeChatModel: 'openai/gpt-4-turbo-preview',
          activeEmbeddingModel: 'openai/text-embedding-3-small',
          responseStyle: 'professional',
          language: 'tr',
        }
      };

      setConfig(transformedConfig);
      setError(null);
    } catch (err) {
      console.error('Error fetching config:', err);
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (newConfig: Config) => {
    try {
      // Hardcoded URL to fix fetch issues
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
      const response = await fetchWithAuth(`${API_BASE_URL}/api/v2/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) {
        throw new Error('Failed to update configuration');
      }

      const result = await response.json();
      setConfig(result.config);
      setError(null);

      // Dispatch event to notify components that settings have been updated
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated'));
      }
    } catch (err) {
      console.error('Error updating config:', err);
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
      throw err;
    }
  };

  // Function to check if configuration is complete
  const isConfigurationComplete = (config: Config | null): boolean => {
    if (!config) return false;

    // Check essential configuration fields
    const hasEssentialConfig =
      config.app?.name &&
      config.database?.host &&
      config.database?.name &&
      config.openai?.apiKey && // At least one LLM provider should be configured
      config.anthropic?.apiKey; // Check for another provider as backup

    return Boolean(hasEssentialConfig);
  };

  useEffect(() => {
    // Only try to fetch config if there's a token (user is authenticated)
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    if (token) {
      fetchConfig(token);
    } else {
      // Set loading to false if no token (user not authenticated)
      setLoading(false);
      // Set a default config for non-authenticated users (show app name, etc.)
      setConfig({
        app: {
          name: 'Mali Müşavir Asistanı',
          description: 'AI-Powered Knowledge Management System',
          version: '1.0.0',
          locale: 'tr'
        }
      });
    }
  }, []);

  // Listen for token changes to automatically refresh config
  useEffect(() => {
    const handleTokenChange = (e: StorageEvent | CustomEvent) => {
      if ('key' in e) {
        // Storage event - user logged in/out in another tab
        if (e.key === 'token') {
          const token = e.newValue;
          if (token) {
            fetchConfig(token);
          } else {
            // Token removed - set default config
            setLoading(false);
            setConfig({
              app: {
                name: 'Mali Müşavir Asistanı',
                description: 'AI-Powered Knowledge Management System',
                version: '1.0.0',
                locale: 'tr'
              }
            });
          }
        }
      } else {
        // Custom event - user logged in/out in same tab
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (token) {
          fetchConfig(token);
        } else {
          setLoading(false);
          setConfig({
            app: {
              name: 'Mali Müşavir Asistanı',
              description: 'AI-Powered Knowledge Management System',
              version: '1.0.0',
              locale: 'tr'
            }
          });
        }
      }
    };

    // Listen for storage events (cross-tab changes)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleTokenChange);
      // Listen for custom token change events (same-tab changes)
      window.addEventListener('tokenChanged', handleTokenChange as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleTokenChange);
        window.removeEventListener('tokenChanged', handleTokenChange as EventListener);
      }
    };
  }, []);

  return (
    <ConfigContext.Provider
      value={{
        config,
        loading,
        error,
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

