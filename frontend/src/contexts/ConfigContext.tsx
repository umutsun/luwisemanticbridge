'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchWithAuth, setStoredToken, getStoredToken, safeJsonParse } from '@/lib/auth-fetch';

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

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const fetchConfig = async (authToken?: string) => {
    try {
      setLoading(true);

      // Get API URL from environment variables (.env.lsemb)
      // Use relative path if NEXT_PUBLIC_API_URL is not set (leverages Next.js rewrites)
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL === undefined ? 'http://localhost:8083' : process.env.NEXT_PUBLIC_API_URL;

      if (authToken) {
        setStoredToken(authToken);
      }

      const headers: { [key: string]: string } = {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      };

      // Add Authorization header if token exists
      const token = authToken || getStoredToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/v2/settings?t=${Date.now()}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch configuration from backend');
      }
      const data = await safeJsonParse(response);
      if (!data) {
        throw new Error('Invalid JSON response from backend');
      }

      // Transform backend settings to match Config interface
      const transformedConfig = {
        app: {
          name: data.app?.name || 'Luwi Semantic Bridge',
          description: data.app?.description || 'Intelligent RAG & Context Engine',
          version: data.app?.version || '1.0.0',
          locale: data.app?.locale || 'tr'
        },
        database: data.database || {
          host: 'localhost',
          port: 5432,
          name: 'rag_chatbot',
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
        },
        // Chatbot settings for dynamic page title
        chatbot: data.chatbot || undefined
      };

      // Fetch chatbot settings separately if not in main config
      if (!data.chatbot) {
        try {
          const chatbotResponse = await fetch(`${API_BASE_URL}/api/v2/chatbot/settings`, { headers });
          if (chatbotResponse.ok) {
            const chatbotData = await safeJsonParse(chatbotResponse);
            if (chatbotData) {
              transformedConfig.chatbot = {
                title: chatbotData.title,
                subtitle: chatbotData.subtitle,
                logoUrl: chatbotData.logoUrl,
                welcomeMessage: chatbotData.welcomeMessage,
                placeholder: chatbotData.placeholder,
                primaryColor: chatbotData.primaryColor
              };
            }
          }
        } catch (chatbotErr) {
          console.warn('Could not fetch chatbot settings:', chatbotErr);
        }
      }

      setConfig(transformedConfig);
      setError(null);
      setBackendDown(false);
      setRetryCount(0);
      setLoading(false); // Backend başarıyla yüklendi, loading'i kapat
    } catch (err) {
      console.error('Error fetching config:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load configuration';

      // Check if it's a connection error (backend not ready)
      if (errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
        console.log(`⏳ Backend not ready yet (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        setError('Backend bağlantısı bekleniyor...');

        // Retry with exponential backoff
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(2000 * Math.pow(2, retryCount), 10000); // Max 10 seconds
          setTimeout(() => {
            console.log(`🔄 Retrying backend connection (attempt ${retryCount + 2}/${MAX_RETRIES})...`);
            setRetryCount(prev => prev + 1);
            fetchConfig(authToken);
          }, delay);
        } else {
          // Max retries reached - backend is definitely down
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
  };

  const updateConfig = async (newConfig: Config) => {
    try {
      // Get API URL from environment variables (.env.lsemb)
      // Use relative path if NEXT_PUBLIC_API_URL is not set (leverages Next.js rewrites)
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL === undefined ? 'http://localhost:8083' : process.env.NEXT_PUBLIC_API_URL;
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

      const result = await safeJsonParse(response);
      if (result && result.config) {
        setConfig(result.config);
        setError(null);
      } else {
        throw new Error('Invalid response format');
      }

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
      // Fetch public chatbot settings instead of using hardcoded values
      fetchPublicChatbotSettings().then((settings) => {
        setConfig({
          app: {
            name: settings.name,
            description: settings.description,
            version: '1.0.0',
            locale: 'tr'
          }
        });
        setLoading(false);
      });
    }
  }, []);

  // Helper function to fetch public chatbot settings for non-authenticated users
  const fetchPublicChatbotSettings = async (): Promise<{ name: string; description: string }> => {
    try {
      // Use relative path if NEXT_PUBLIC_API_URL is not set (leverages Next.js rewrites)
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL === undefined ? 'http://localhost:8083' : process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${API_BASE_URL}/api/v2/chatbot/settings`);
      if (response.ok) {
        const chatbotData = await safeJsonParse(response);
        if (chatbotData) {
          return {
            name: chatbotData.title || 'LSEMB',
            description: chatbotData.subtitle || 'AI-Powered Knowledge Management System'
          };
        }
      }
    } catch (error) {
      console.error('Error fetching public chatbot settings:', error);
    }
    return { name: 'LSEMB', description: 'AI-Powered Knowledge Management System' };
  };

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
            // Token removed - fetch public chatbot settings
            fetchPublicChatbotSettings().then((settings) => {
              setConfig({
                app: {
                  name: settings.name,
                  description: settings.description,
                  version: '1.0.0',
                  locale: 'tr'
                }
              });
              setLoading(false);
            });
          }
        }
      } else {
        // Custom event - user logged in/out in same tab
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (token) {
          fetchConfig(token);
        } else {
          // Fetch public chatbot settings
          fetchPublicChatbotSettings().then((settings) => {
            setConfig({
              app: {
                name: settings.name,
                description: settings.description,
                version: '1.0.0',
                locale: 'tr'
              }
            });
            setLoading(false);
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

