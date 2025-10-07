'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, buildApiUrl, API_CONFIG } from '../../../lib/config';
import { useToast } from '../../../hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Slider } from '../../../components/ui/slider';
import { Switch } from '../../../components/ui/switch';
import {
  Settings,
  Database,
  Key,
  Globe,
  Brain,
  Shield,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  Link,
  Server,
  Sparkles,
  Zap,
  MessageSquare,
  Play,
  Square,
  Terminal,
  Activity,
  Package,
  FileCode,
  Container,
  Bot,
  Palette,
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Download,
  Upload,
  FileText,
  HardDrive,
  Wifi,
  Cpu,
  Lock,
  Unlock,
  Eye,
  EyeOff
} from 'lucide-react';

interface SystemPrompt {
  id: string;
  name: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatbotSettings {
  title: string;
  subtitle: string;
  logoUrl: string;
  welcomeMessage: string;
  placeholder: string;
  primaryColor: string;
  suggestions: string;
}

interface Suggestion {
  icon: string;
  title: string;
  description: string;
}

interface Config {
  app: {
    name: string;
    description: string;
    logoUrl: string;
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
  cohere: {
    apiKey: string;
  };
  voyage: {
    apiKey: string;
  };
  google: {
    apiKey: string;
    projectId: string;
  };
  jina: {
    apiKey: string;
  };
  mistral?: {
    apiKey?: string;
  };
  smtp: {
    gmail: {
      enabled: boolean;
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    brevo: {
      enabled: boolean;
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
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
  };
  ragSettings: {
    similarityThreshold: number;
    maxResults: number;
    minResults: number;
    enableHybridSearch: boolean;
    enableKeywordBoost: boolean;
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

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [config, setConfig] = useState<Config>({
    app: {
      name: 'Alice Semantic Bridge',
      description: 'AI-Powered Knowledge Management System',
      logoUrl: '',
      locale: 'tr'
    },
    database: {
      host: 'localhost',
      port: 5432,
      name: 'alice_semantic_bridge',
      user: 'postgres',
      password: 'postgres',
      ssl: false,
      maxConnections: 20,
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
    },
    openai: {
      apiKey: typeof process.env.NEXT_PUBLIC_OPENAI_API_KEY === 'string' ? process.env.NEXT_PUBLIC_OPENAI_API_KEY : '',
      model: 'gpt-4-turbo-preview',
      embeddingModel: 'text-embedding-3-small',
      maxTokens: 4096,
      temperature: 0.7,
    },
    anthropic: {
      apiKey: typeof process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY === 'string' ? process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY : '',
      model: 'claude-3-opus-20240229',
      maxTokens: 4096,
    },
    deepseek: {
      apiKey: typeof process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY === 'string' ? process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY : '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-coder',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'llama2',
      embeddingModel: 'nomic-embed-text',
    },
    huggingface: {
      apiKey: typeof process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY === 'string' ? process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY : '',
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      endpoint: 'https://api-inference.huggingface.co/models/',
    },
    cohere: {
      apiKey: typeof process.env.NEXT_PUBLIC_COHERE_API_KEY === 'string' ? process.env.NEXT_PUBLIC_COHERE_API_KEY : '',
    },
    voyage: {
      apiKey: typeof process.env.NEXT_PUBLIC_VOYAGE_API_KEY === 'string' ? process.env.NEXT_PUBLIC_VOYAGE_API_KEY : '',
    },
    google: {
      apiKey: typeof process.env.NEXT_PUBLIC_GOOGLE_API_KEY === 'string' ? process.env.NEXT_PUBLIC_GOOGLE_API_KEY : '',
      projectId: typeof process.env.NEXT_PUBLIC_GOOGLE_PROJECT_ID === 'string' ? process.env.NEXT_PUBLIC_GOOGLE_PROJECT_ID : '',
    },
    jina: {
      apiKey: typeof process.env.NEXT_PUBLIC_JINA_API_KEY === 'string' ? process.env.NEXT_PUBLIC_JINA_API_KEY : '',
    },
    smtp: {
      gmail: {
        enabled: false,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: '',
        },
      },
      brevo: {
        enabled: false,
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: '',
        },
      },
    },
    n8n: {
      url: 'http://localhost:5678',
      apiKey: '',
    },
    scraper: {
      timeout: 30000,
      maxConcurrency: 3,
      userAgent: 'ASB Web Scraper',
    },
    embeddings: {
      chunkSize: 1000,
      chunkOverlap: 200,
      batchSize: 10,
      provider: 'google',
      model: 'google/text-embedding-004',
      normalizeEmbeddings: true,
      cacheEmbeddings: true,
    },
    dataSource: {
      useLocalDb: true,
      localDbPercentage: 100,
      externalApiPercentage: 0,
      hybridMode: false,
      prioritySource: 'local',
    },
    llmSettings: {
      embeddingProvider: 'google',
      embeddingModel: 'google/text-embedding-004',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaEmbeddingModel: 'nomic-embed-text',
      temperature: 0.1,
      topP: 0.9,
      maxTokens: 2048,
      presencePenalty: 0,
      frequencyPenalty: 0,
      ragWeight: 95,
      llmKnowledgeWeight: 5,
      streamResponse: true,
      systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
      activeChatModel: 'deepseek/deepseek-chat',
      activeEmbeddingModel: 'google/text-embedding-004',
      responseStyle: 'professional',
      language: 'tr',
    },
    ragSettings: {
      similarityThreshold: 0.001,
      maxResults: 10,
      minResults: 3,
      enableHybridSearch: true,
      enableKeywordBoost: true,
    },
    security: {
      enableAuth: false,
      jwtSecret: '',
      sessionTimeout: 3600,
      rateLimit: 100,
      corsOrigins: ['http://localhost:3000'],
    },
    logging: {
      level: 'info',
      file: 'logs/asb.log',
      maxSize: '10m',
      maxFiles: 5,
    },
  });

  const [serviceStatus, setServiceStatus] = useState<{[key: string]: boolean}>({});
  const [serviceLoading, setServiceLoading] = useState<{[key: string]: boolean}>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [promptName, setPromptName] = useState('');
  const [promptTemperature, setPromptTemperature] = useState(0.7);
  const [promptMaxTokens, setPromptMaxTokens] = useState(2048);
  const [chatbotSettings, setChatbotSettings] = useState<ChatbotSettings>({
    title: '',
    subtitle: '',
    logoUrl: '',
    welcomeMessage: '',
    placeholder: '',
    primaryColor: '#3b82f6',
    suggestions: '',
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showPassword, setShowPassword] = useState<{[key: string]: boolean}>({});

  const defaultPrompt = 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.';

  const fetchConfig = async () => {
    try {
      const url = getApiUrl('settings');
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();

        // Ensure required properties have default values if missing from API
        const enrichedConfig = {
          ...data,
          dataSource: {
            useLocalDb: data.dataSource?.useLocalDb ?? true,
            localDbPercentage: data.dataSource?.localDbPercentage ?? 100,
            externalApiPercentage: data.dataSource?.externalApiPercentage ?? 0,
            hybridMode: data.dataSource?.hybridMode ?? false,
            prioritySource: data.dataSource?.prioritySource ?? 'local',
          },
          llmSettings: {
            embeddingProvider: data.llmSettings?.embeddingProvider ?? 'google',
            embeddingModel: data.llmSettings?.embeddingModel ?? 'google/text-embedding-004',
            ollamaBaseUrl: data.llmSettings?.ollamaBaseUrl ?? 'http://localhost:11434',
            ollamaEmbeddingModel: data.llmSettings?.ollamaEmbeddingModel ?? 'nomic-embed-text',
            temperature: data.llmSettings?.temperature ?? 0.1,
            topP: data.llmSettings?.topP ?? 0.9,
            maxTokens: data.llmSettings?.maxTokens ?? 2048,
            presencePenalty: data.llmSettings?.presencePenalty ?? 0,
            frequencyPenalty: data.llmSettings?.frequencyPenalty ?? 0,
            ragWeight: data.llmSettings?.ragWeight ?? 95,
            llmKnowledgeWeight: data.llmSettings?.llmKnowledgeWeight ?? 5,
            streamResponse: data.llmSettings?.streamResponse ?? true,
            systemPrompt: data.llmSettings?.systemPrompt ?? 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
            activeChatModel: data.llmSettings?.activeChatModel ?? 'deepseek/deepseek-chat',
            activeEmbeddingModel: data.llmSettings?.activeEmbeddingModel ?? 'google/text-embedding-004',
            responseStyle: data.llmSettings?.responseStyle ?? 'professional',
            language: data.llmSettings?.language ?? 'tr',
          },
          ragSettings: {
            similarityThreshold: data.ragSettings?.similarityThreshold ?? 0.001,
            maxResults: data.ragSettings?.maxResults ?? 10,
            minResults: data.ragSettings?.minResults ?? 3,
            enableHybridSearch: data.ragSettings?.enableHybridSearch ?? true,
            enableKeywordBoost: data.ragSettings?.enableKeywordBoost ?? true,
          },
        };

        setConfig(enrichedConfig);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };


  
  const handleServiceAction = async (service: string, action: string) => {
    setServiceLoading({ ...serviceLoading, [service]: true });
    try {
      const response = await fetch(buildApiUrl('/api/v2/services', service, action), {
        method: 'POST',
      });
      if (response.ok) {
        await fetchServiceStatus();
        toast({
          title: 'Success',
          description: `${service} ${action} successful`,
        });
      } else {
        toast({
          title: 'Error',
          description: `Failed to ${action} ${service}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${action} ${service}`,
        variant: 'destructive',
      });
    }
    setServiceLoading({ ...serviceLoading, [service]: false });
  };

  const testConnection = async (service: string) => {
    setTesting(service);
    try {
      const response = await fetch(buildApiUrl('/api/v2/test', service));
      if (response.ok) {
        toast({
          title: 'Success',
          description: `${service} connection successful`,
        });
      } else {
        toast({
          title: 'Error',
          description: `${service} connection failed`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: `${service} connection failed`,
        variant: 'destructive',
      });
    }
    setTesting(null);
  };

  const validateConfig = () => {
    const errors: string[] = [];

    // Validate required fields
    if (!config.app.name.trim()) errors.push('Application name is required');
    if (!config.database.host.trim()) errors.push('Database host is required');
    if (!config.database.name.trim()) errors.push('Database name is required');
    if (!config.database.user.trim()) errors.push('Database username is required');
    if (config.database.port < 1 || config.database.port > 65535) errors.push('Database port must be between 1 and 65535');
    if (config.database.maxConnections < 1 || config.database.maxConnections > 1000) errors.push('Max connections must be between 1 and 1000');

    if (config.redis.port < 1 || config.redis.port > 65535) errors.push('Redis port must be between 1 and 65535');
    if (config.redis.db < 0 || config.redis.db > 15) errors.push('Redis DB must be between 0 and 15');

    // Validate API keys when provided
    if (config.openai.apiKey && !config.openai.apiKey.startsWith('sk-')) errors.push('OpenAI API key must start with "sk-"');
    if (config.anthropic.apiKey && !config.anthropic.apiKey.startsWith('sk-ant-')) errors.push('Anthropic API key must start with "sk-ant-"');
    if (config.google.apiKey && config.google.apiKey.length < 10) errors.push('Google API key is too short');

    // Validate embedding settings
    if (config.embeddings.chunkSize < 100 || config.embeddings.chunkSize > 8000) errors.push('Chunk size must be between 100 and 8000');
    if (config.embeddings.chunkOverlap < 0 || config.embeddings.chunkOverlap >= config.embeddings.chunkSize) errors.push('Chunk overlap must be less than chunk size');
    if (config.embeddings.batchSize < 1 || config.embeddings.batchSize > 100) errors.push('Batch size must be between 1 and 100');

    // Validate LLM settings
    if (config.llmSettings.temperature < 0 || config.llmSettings.temperature > 2) errors.push('Temperature must be between 0 and 2');
    if (config.llmSettings.maxTokens < 256 || config.llmSettings.maxTokens > 8192) errors.push('Max tokens must be between 256 and 8192');
    if (config.llmSettings.topP < 0 || config.llmSettings.topP > 1) errors.push('Top P must be between 0 and 1');

    // Validate RAG weights - handle undefined values
    const ragWeight = config.llmSettings.ragWeight ?? 95;
    const llmKnowledgeWeight = config.llmSettings.llmKnowledgeWeight ?? 5;
    if (ragWeight + llmKnowledgeWeight !== 100) errors.push('RAG weight + LLM knowledge weight must equal 100');

    // Validate data source - handle undefined values
    const localDbPercentage = config.dataSource.localDbPercentage ?? 100;
    const externalApiPercentage = config.dataSource.externalApiPercentage ?? 0;
    if (localDbPercentage + externalApiPercentage !== 100) {
      errors.push('Local DB percentage + External API percentage must equal 100');
    }

    // Validate security settings
    if (config.security.enableAuth) {
      if (!config.security.jwtSecret || config.security.jwtSecret.length < 32) errors.push('JWT secret must be at least 32 characters');
      if (config.security.sessionTimeout < 60 || config.security.sessionTimeout > 86400) errors.push('Session timeout must be between 60 and 86400 seconds');
      if (config.security.rateLimit < 1 || config.security.rateLimit > 10000) errors.push('Rate limit must be between 1 and 10000');
    }

    // Validate scraper settings
    if (config.scraper.timeout < 1000 || config.scraper.timeout > 300000) errors.push('Scraper timeout must be between 1000 and 300000 ms');
    if (config.scraper.maxConcurrency < 1 || config.scraper.maxConcurrency > 10) errors.push('Max concurrency must be between 1 and 10');

    return errors;
  };

  const handleSave = async () => {
    const errors = validateConfig();
    if (errors.length > 0) {
      toast({
        title: 'Validation Error',
        description: (
          <div className="space-y-1">
            <p>Please fix the following errors:</p>
            <ul className="list-disc list-inside text-sm">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        ),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(getApiUrl('settings'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setHasUnsavedChanges(false);
        toast({
          title: 'Success',
          description: 'Configuration saved successfully',
        });

        // Save prompts
        await fetch(getApiUrl('prompts'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompts: prompts.map(p => ({
              ...p,
              isActive: p.id === activePrompt?.id
            }))
          }),
        });

        // Save chatbot settings
        await fetch(getApiUrl('chatbotSettings'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chatbotSettings),
        });
      } else {
        const errorData = await response.json();
        toast({
          title: 'Error',
          description: errorData.message || 'Failed to save configuration',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save configuration. Please check your connection.',
        variant: 'destructive',
      });
    }
    setLoading(false);
  };

  const resetToDefaults = () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
      setConfig({
        app: {
          name: 'Alice Semantic Bridge',
          description: 'AI-Powered Knowledge Management System',
          logoUrl: '',
          locale: 'tr'
        },
        database: {
          host: 'localhost',
          port: 5432,
          name: 'alice_semantic_bridge',
          user: 'postgres',
          password: 'postgres',
          ssl: false,
          maxConnections: 20,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: '',
          db: 0,
        },
        openai: {
          apiKey: '',
          model: 'gpt-4-turbo-preview',
          embeddingModel: 'text-embedding-3-small',
          maxTokens: 4096,
          temperature: 0.7,
        },
        anthropic: {
          apiKey: '',
          model: 'claude-3-opus-20240229',
          maxTokens: 4096,
        },
        deepseek: {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-coder',
        },
        ollama: {
          baseUrl: 'http://localhost:11434',
          model: 'llama2',
          embeddingModel: 'nomic-embed-text',
        },
        huggingface: {
          apiKey: '',
          model: 'sentence-transformers/all-MiniLM-L6-v2',
          endpoint: 'https://api-inference.huggingface.co/models/',
        },
        google: {
          apiKey: '',
          projectId: '',
        },
        jina: {
          apiKey: '',
        },
        smtp: {
          gmail: {
            enabled: false,
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
              user: '',
              pass: '',
            },
          },
          brevo: {
            enabled: false,
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
              user: '',
              pass: '',
            },
          },
        },
        n8n: {
          url: 'http://localhost:5678',
          apiKey: '',
        },
        scraper: {
          timeout: 30000,
          maxConcurrency: 3,
          userAgent: 'ASB Web Scraper',
        },
        embeddings: {
          chunkSize: 1000,
          chunkOverlap: 200,
          batchSize: 10,
          provider: 'openai',
          model: 'text-embedding-3-small',
          normalizeEmbeddings: true,
          cacheEmbeddings: true,
        },
        dataSource: {
          useLocalDb: true,
          localDbPercentage: 100,
          externalApiPercentage: 0,
          hybridMode: false,
          prioritySource: 'local',
        },
        llmSettings: {
          embeddingProvider: 'openai',
          embeddingModel: 'openai/text-embedding-ada-002',
          ollamaBaseUrl: 'http://localhost:11434',
          ollamaEmbeddingModel: 'nomic-embed-text',
          temperature: 0.1,
          topP: 0.9,
          maxTokens: 2048,
          presencePenalty: 0,
          frequencyPenalty: 0,
          ragWeight: 95,
          llmKnowledgeWeight: 5,
          streamResponse: true,
          systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
          activeChatModel: 'google/gemini-pro',
          activeEmbeddingModel: 'google/text-embedding-004',
          responseStyle: 'professional',
          language: 'tr',
        },
        ragSettings: {
          similarityThreshold: 0.001,
          maxResults: 10,
          minResults: 3,
          enableHybridSearch: true,
          enableKeywordBoost: true,
        },
        security: {
          enableAuth: false,
          jwtSecret: '',
          sessionTimeout: 3600,
          rateLimit: 100,
          corsOrigins: ['http://localhost:3000'],
        },
        logging: {
          level: 'info',
          file: 'logs/asb.log',
          maxSize: '10m',
          maxFiles: 5,
        },
      });
      setHasUnsavedChanges(true);
      toast({
        title: 'Reset Complete',
        description: 'All settings have been reset to defaults',
      });
    }
  };

  const exportConfig = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'asb-config.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedConfig = JSON.parse(e.target?.result as string);
          setConfig(importedConfig);
          setHasUnsavedChanges(true);
          toast({
            title: 'Import Successful',
            description: 'Configuration has been imported',
          });
        } catch (error) {
          toast({
            title: 'Import Failed',
            description: 'Invalid configuration file',
            variant: 'destructive',
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const togglePasswordVisibility = (field: string) => {
    setShowPassword(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  useEffect(() => {
    fetchConfig();
    fetchPrompts();
    fetchChatbotSettings();
    fetchAISettings();
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = t('settings.title') + ' - Alice Semantic Bridge';
  }, [i18n.language, t]);

  const fetchPrompts = async () => {
    try {
      const response = await fetch(getApiUrl('prompts'));
      if (response.ok) {
        const data = await response.json();
        setPrompts(data.prompts || []);
        const active = data.prompts?.find((p: SystemPrompt) => p.isActive);
        if (active) {
          setActivePrompt(active);
          setEditingPrompt(active.prompt);
          setPromptTemperature(active.temperature);
          setPromptMaxTokens(active.maxTokens);
        } else {
          setEditingPrompt(defaultPrompt);
        }
      }
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
      setEditingPrompt(defaultPrompt);
    }
  };

  const fetchChatbotSettings = async () => {
    try {
      const response = await fetch(getApiUrl('chatbotSettings'));
      const data = await response.json();

      setChatbotSettings({
        title: data.title || '',
        subtitle: data.subtitle || '',
        logoUrl: data.logoUrl || '',
        welcomeMessage: data.welcomeMessage || '',
        placeholder: data.placeholder || '',
        primaryColor: data.primaryColor || '#3b82f6',
        suggestions: data.suggestions || '',
      });

      if (data.suggestions) {
        try {
          setSuggestions(JSON.parse(data.suggestions));
        } catch (e) {
          console.error('Failed to parse suggestions:', e);
        }
      }
    } catch (error) {
      console.error('Failed to fetch chatbot settings:', error);
    }
  };

  const fetchAISettings = async () => {
    try {
      const response = await fetch(getApiUrl('aiSettings'));
      const data = await response.json();

      if (data.llmSettings) {
        setConfig(prev => ({
          ...prev,
          llmSettings: {
            ...prev.llmSettings,
            ...data.llmSettings
          }
        }));
      }
    } catch (error) {
      console.error('Failed to fetch AI settings:', error);
    }
  };

  const addPrompt = () => {
    if (!promptName.trim() || !editingPrompt.trim()) return;

    const newPrompt: SystemPrompt = {
      id: Date.now().toString(),
      name: promptName,
      prompt: editingPrompt,
      temperature: promptTemperature,
      maxTokens: promptMaxTokens,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setPrompts([...prompts, newPrompt]);
    setPromptName('');
    setHasUnsavedChanges(true);
  };

  const deletePrompt = (id: string) => {
    setPrompts(prompts.filter(p => p.id !== id));
    if (activePrompt?.id === id) {
      setActivePrompt(null);
      setEditingPrompt(defaultPrompt);
    }
    setHasUnsavedChanges(true);
  };

  const setActivePromptById = (id: string) => {
    const prompt = prompts.find(p => p.id === id);
    if (prompt) {
      setActivePrompt(prompt);
      setEditingPrompt(prompt.prompt);
      setPromptTemperature(prompt.temperature);
      setPromptMaxTokens(prompt.maxTokens);
      setHasUnsavedChanges(true);
    }
  };

  const updatePrompt = () => {
    if (!activePrompt) return;

    setPrompts(prompts.map(p =>
      p.id === activePrompt.id
        ? {
            ...p,
            prompt: editingPrompt,
            temperature: promptTemperature,
            maxTokens: promptMaxTokens,
            updatedAt: new Date().toISOString()
          }
        : p
    ));
    setHasUnsavedChanges(true);
  };

  const addSuggestion = () => {
    const newSuggestion: Suggestion = {
      icon: 'MessageCircle',
      title: 'New Suggestion',
      description: 'Click to edit',
    };
    setSuggestions([...suggestions, newSuggestion]);
    updateChatbotSettings('suggestions', JSON.stringify(suggestions));
  };

  const updateSuggestion = (index: number, field: keyof Suggestion, value: string) => {
    const newSuggestions = [...suggestions];
    newSuggestions[index] = { ...newSuggestions[index], [field]: value };
    setSuggestions(newSuggestions);
    updateChatbotSettings('suggestions', JSON.stringify(newSuggestions));
  };

  const removeSuggestion = (index: number) => {
    const newSuggestions = suggestions.filter((_, i) => i !== index);
    setSuggestions(newSuggestions);
    updateChatbotSettings('suggestions', JSON.stringify(newSuggestions));
  };

  const updateChatbotSettings = (field: keyof ChatbotSettings, value: any) => {
    setChatbotSettings(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const updateConfig = (path: string, value: any) => {
    const keys = path.split('.');
    setConfig(prev => {
      const newConfig = JSON.parse(JSON.stringify(prev)); // Deep clone
      let current: any = newConfig;

      // Create nested objects if they don't exist
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = value;
      return newConfig;
    });
    setHasUnsavedChanges(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Configure your Alice Semantic Bridge instance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-orange-600">
              Unsaved Changes
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={exportConfig}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <label className="cursor-pointer">
            <Button variant="outline" className="gap-2" asChild>
              <span>
                <Upload className="h-4 w-4" />
                Import
              </span>
            </Button>
            <input
              type="file"
              accept=".json"
              onChange={importConfig}
              className="hidden"
            />
          </label>
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-11 gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="ai-services">AI Services</TabsTrigger>
          <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="chatbot">Chatbot</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="rag">RAG</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic application configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="appName">Application Name</Label>
                  <Input
                    id="appName"
                    value={config.app.name}
                    onChange={(e) => updateConfig('app.name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appLocale">Language</Label>
                  <Select
                    value={config.app.locale}
                    onValueChange={(value) => {
                      updateConfig('app.locale', value);
                      i18n.changeLanguage(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tr">Türkçe</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appDescription">Description</Label>
                <Textarea
                  id="appDescription"
                  value={config.app.description}
                  onChange={(e) => updateConfig('app.description', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input
                  id="logoUrl"
                  value={config.app.logoUrl}
                  onChange={(e) => updateConfig('app.logoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {['lightrag', 'embedder', 'fastapi', 'streamlit'].map((service) => (
              <Card key={service}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium capitalize">
                      {service}
                    </CardTitle>
                    <Badge
                      variant={serviceStatus[service] ? 'default' : 'secondary'}
                      className={
                        serviceStatus[service]
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }
                    >
                      {serviceStatus[service] ? 'Running' : 'Stopped'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleServiceAction(service, 'start')}
                      disabled={serviceLoading[service] || serviceStatus[service]}
                      className="flex-1"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleServiceAction(service, 'stop')}
                      disabled={serviceLoading[service] || !serviceStatus[service]}
                      className="flex-1"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <div><strong>Service Commands:</strong></div>
                <div>• LightRAG: python backend/lightrag_service.py --port 8083</div>
                <div>• Embedder: python backend/embedder_service.py --port 8086</div>
                <div>• FastAPI: uvicorn backend.main:app --port 8080 --reload</div>
                <div>• Streamlit: streamlit run backend/streamlit_app.py --server.port 8085</div>
                <div>• Docker: docker-compose up -d</div>
              </div>
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="database">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  PostgreSQL + pgvector
                </CardTitle>
                <CardDescription>
                  Database connection settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dbHost">Host</Label>
                    <Input
                      id="dbHost"
                      value={config.database.host}
                      onChange={(e) => updateConfig('database.host', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dbPort">Port</Label>
                    <Input
                      id="dbPort"
                      type="number"
                      value={config.database.port}
                      onChange={(e) => updateConfig('database.port', parseInt(e.target.value))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dbName">Database</Label>
                    <Input
                      id="dbName"
                      value={config.database.name}
                      onChange={(e) => updateConfig('database.name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dbUser">Username</Label>
                    <Input
                      id="dbUser"
                      value={config.database.user}
                      onChange={(e) => updateConfig('database.user', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dbPassword">Password</Label>
                  <div className="relative">
                    <Input
                      id="dbPassword"
                      type={showPassword.dbPassword ? 'text' : 'password'}
                      value={config.database.password}
                      onChange={(e) => updateConfig('database.password', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2"
                      onClick={() => togglePasswordVisibility('dbPassword')}
                    >
                      {showPassword.dbPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="dbSsl"
                    checked={config.database.ssl}
                    onCheckedChange={(checked) => updateConfig('database.ssl', checked)}
                  />
                  <Label htmlFor="dbSsl">Enable SSL</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxConnections">Max Connections</Label>
                  <Input
                    id="maxConnections"
                    type="number"
                    value={config.database.maxConnections}
                    onChange={(e) => updateConfig('database.maxConnections', parseInt(e.target.value))}
                  />
                </div>
                <Button
                  onClick={() => testConnection('database')}
                  disabled={testing === 'database'}
                  className="w-full"
                >
                  {testing === 'database' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Redis Cache
                </CardTitle>
                <CardDescription>
                  Redis configuration for caching and sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="redisHost">Host</Label>
                    <Input
                      id="redisHost"
                      value={config.redis.host}
                      onChange={(e) => updateConfig('redis.host', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="redisPort">Port</Label>
                    <Input
                      id="redisPort"
                      type="number"
                      value={config.redis.port}
                      onChange={(e) => updateConfig('redis.port', parseInt(e.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redisPassword">Password</Label>
                  <div className="relative">
                    <Input
                      id="redisPassword"
                      type={showPassword.redisPassword ? 'text' : 'password'}
                      value={config.redis.password}
                      onChange={(e) => updateConfig('redis.password', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2"
                      onClick={() => togglePasswordVisibility('redisPassword')}
                    >
                      {showPassword.redisPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redisDb">Database Number</Label>
                  <Input
                    id="redisDb"
                    type="number"
                    value={config.redis.db}
                    onChange={(e) => updateConfig('redis.db', parseInt(e.target.value))}
                  />
                </div>
                <Button
                  onClick={() => testConnection('redis')}
                  disabled={testing === 'redis'}
                  className="w-full"
                >
                  {testing === 'redis' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai-services" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - API Keys */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Keys
                </CardTitle>
                <CardDescription>
                  Configure API keys for AI service providers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">OpenAI</Label>
                    <div className="relative">
                      <Input
                          placeholder="sk-..."
                          type={showPassword.openaiKey ? 'text' : 'password'}
                          value={config.openai.apiKey}
                          onChange={(e) => updateConfig('openai.apiKey', e.target.value)}
                          className="pr-10"
                      />
                      <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2"
                          onClick={() => togglePasswordVisibility('openaiKey')}
                        >
                          {showPassword.openaiKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Google Gemini</Label>
                    <div className="relative">
                      <Input
                          placeholder="AIza..."
                          type={showPassword.googleKey ? 'text' : 'password'}
                          value={config.google.apiKey}
                          onChange={(e) => updateConfig('google.apiKey', e.target.value)}
                          className="pr-10"
                      />
                      <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2"
                          onClick={() => togglePasswordVisibility('googleKey')}
                        >
                          {showPassword.googleKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Anthropic Claude</Label>
                    <div className="relative">
                      <Input
                        placeholder="sk-ant-..."
                        type={showPassword.anthropicKey ? 'text' : 'password'}
                        value={config.anthropic.apiKey}
                        onChange={(e) => updateConfig('anthropic.apiKey', e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2"
                        onClick={() => togglePasswordVisibility('anthropicKey')}
                      >
                        {showPassword.anthropicKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">DeepSeek</Label>
                    <div className="relative">
                      <Input
                        placeholder="sk-..."
                        type={showPassword.deepseekKey ? 'text' : 'password'}
                        value={config.deepseek.apiKey}
                        onChange={(e) => updateConfig('deepseek.apiKey', e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2"
                        onClick={() => togglePasswordVisibility('deepseekKey')}
                      >
                        {showPassword.deepseekKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">HuggingFace</Label>
                    <div className="relative">
                      <Input
                        placeholder="hf_..."
                        type={showPassword.huggingfaceKey ? 'text' : 'password'}
                        value={config.huggingface.apiKey}
                        onChange={(e) => updateConfig('huggingface.apiKey', e.target.value)}
                        className="pr-10"
                      />
                      <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2"
                      onClick={() => togglePasswordVisibility('huggingfaceKey')}
                    >
                      {showPassword.huggingfaceKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                </div>
              </CardContent>
            </Card>

          {/* Right Column - LLM Settings */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Model Settings
                </CardTitle>
                <CardDescription>
                  Configure AI model parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Active Model</Label>
                    <Select
                      value={config.llmSettings.activeChatModel}
                      onValueChange={(value) => updateConfig('llmSettings.activeChatModel', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deepseek/deepseek-chat">DeepSeek Chat</SelectItem>
                        <SelectItem value="openai/gpt-4-turbo-preview">OpenAI GPT-4 Turbo</SelectItem>
                        <SelectItem value="openai/gpt-4">OpenAI GPT-4</SelectItem>
                        <SelectItem value="openai/gpt-3.5-turbo">OpenAI GPT-3.5 Turbo</SelectItem>
                        <SelectItem value="google/gemini-pro">Google Gemini Pro</SelectItem>
                        <SelectItem value="anthropic/claude-3-opus">Anthropic Claude 3 Opus</SelectItem>
                        <SelectItem value="anthropic/claude-3-sonnet">Anthropic Claude 3 Sonnet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="streamResponse"
                      checked={config.llmSettings.streamResponse}
                      onCheckedChange={(checked) => updateConfig('llmSettings.streamResponse', checked)}
                    />
                    <Label htmlFor="streamResponse">Stream Responses</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="embeddings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Embedding Settings
              </CardTitle>
              <CardDescription>
                Configure text chunking and embedding parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Chunk Size: {config.embeddings.chunkSize}</Label>
                    <Slider
                      value={[config.embeddings.chunkSize]}
                      onValueChange={(value) => updateConfig('embeddings.chunkSize', value[0])}
                      min={100}
                      max={4000}
                      step={100}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Size of text chunks for processing
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Chunk Overlap: {config.embeddings.chunkOverlap}</Label>
                    <Slider
                      value={[config.embeddings.chunkOverlap]}
                      onValueChange={(value) => updateConfig('embeddings.chunkOverlap', value[0])}
                      min={0}
                      max={1000}
                      step={50}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Overlap between chunks for context
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Batch Size: {config.embeddings.batchSize}</Label>
                    <Slider
                      value={[config.embeddings.batchSize]}
                      onValueChange={(value) => updateConfig('embeddings.batchSize', value[0])}
                      min={1}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Number of chunks processed together
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="embeddingProvider">Provider</Label>
                    <Select
                      value={config.embeddings.provider}
                      onValueChange={(value) => updateConfig('embeddings.provider', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="ollama">Ollama</SelectItem>
                        <SelectItem value="huggingface">HuggingFace</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="normalizeEmbeddings"
                      checked={config.embeddings.normalizeEmbeddings}
                      onCheckedChange={(checked) => updateConfig('embeddings.normalizeEmbeddings', checked)}
                    />
                    <Label htmlFor="normalizeEmbeddings">Normalize Embeddings</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="cacheEmbeddings"
                      checked={config.embeddings.cacheEmbeddings}
                      onCheckedChange={(checked) => updateConfig('embeddings.cacheEmbeddings', checked)}
                    />
                    <Label htmlFor="cacheEmbeddings">Cache Embeddings</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="embeddingModel">Model</Label>
                    <Input
                      id="embeddingModel"
                      value={config.embeddings.model}
                      onChange={(e) => updateConfig('embeddings.model', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  💡 These settings are automatically optimized for your selected model. Adjust manually based on your needs.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  n8n Integration
                </CardTitle>
                <CardDescription>
                  Connect with n8n for workflow automation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="n8nUrl">n8n URL</Label>
                    <Input
                      id="n8nUrl"
                      value={config.n8n.url}
                      onChange={(e) => updateConfig('n8n.url', e.target.value)}
                      placeholder="http://localhost:5678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="n8nKey">API Key</Label>
                    <div className="relative">
                      <Input
                        id="n8nKey"
                        type={showPassword.n8nKey ? 'text' : 'password'}
                        value={config.n8n.apiKey}
                        onChange={(e) => updateConfig('n8n.apiKey', e.target.value)}
                        placeholder="n8n API key"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2"
                        onClick={() => togglePasswordVisibility('n8nKey')}
                      >
                        {showPassword.n8nKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => testConnection('n8n')}
                  disabled={testing === 'n8n'}
                  className="w-full"
                >
                  {testing === 'n8n' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Email Configuration
                </CardTitle>
                <CardDescription>
                  Configure SMTP settings for email notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Gmail SMTP</Label>
                    <div className="flex items-center space-x-2 mb-2">
                      <Switch
                        id="gmailEnabled"
                        checked={config.smtp.gmail.enabled}
                        onCheckedChange={(checked) => updateConfig('smtp.gmail.enabled', checked)}
                      />
                      <Label htmlFor="gmailEnabled">Enable Gmail</Label>
                    </div>
                    {config.smtp.gmail.enabled && (
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label htmlFor="gmailUser">Email</Label>
                            <Input
                              id="gmailUser"
                              type="email"
                              value={config.smtp.gmail.auth.user}
                              onChange={(e) => updateConfig('smtp.gmail.auth.user', e.target.value)}
                              placeholder="your@gmail.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="gmailPass">App Password</Label>
                            <div className="relative">
                              <Input
                                id="gmailPass"
                                type={showPassword.gmailPass ? 'text' : 'password'}
                                value={config.smtp.gmail.auth.pass}
                                onChange={(e) => updateConfig('smtp.gmail.auth.pass', e.target.value)}
                                placeholder="app password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2"
                                onClick={() => togglePasswordVisibility('gmailPass')}
                              >
                                {showPassword.gmailPass ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Use App Password, not your regular password. Enable 2FA first.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Brevo SMTP</Label>
                    <div className="flex items-center space-x-2 mb-2">
                      <Switch
                        id="brevoEnabled"
                        checked={config.smtp.brevo.enabled}
                        onCheckedChange={(checked) => updateConfig('smtp.brevo.enabled', checked)}
                      />
                      <Label htmlFor="brevoEnabled">Enable Brevo</Label>
                    </div>
                    {config.smtp.brevo.enabled && (
                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label htmlFor="brevoUser">Sender Email</Label>
                            <Input
                              id="brevoUser"
                              type="email"
                              value={config.smtp.brevo.auth.user}
                              onChange={(e) => updateConfig('smtp.brevo.auth.user', e.target.value)}
                              placeholder="sender@yourdomain.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="brevoPass">API Key v3</Label>
                            <div className="relative">
                              <Input
                                id="brevoPass"
                                type={showPassword.brevoPass ? 'text' : 'password'}
                                value={config.smtp.brevo.auth.pass}
                                onChange={(e) => updateConfig('smtp.brevo.auth.pass', e.target.value)}
                                placeholder="xkeysib-..."
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2"
                                onClick={() => togglePasswordVisibility('brevoPass')}
                              >
                                {showPassword.brevoPass ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Get your API key from Brevo dashboard under SMTP & API settings.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="chatbot" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Chatbot Configuration
                  </CardTitle>
                  <CardDescription>
                    Customize the chatbot appearance and behavior
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="chatbotTitle">Title</Label>
                      <Input
                        id="chatbotTitle"
                        value={chatbotSettings.title}
                        onChange={(e) => updateChatbotSettings('title', e.target.value)}
                        placeholder="AI Assistant"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="chatbotSubtitle">Subtitle</Label>
                      <Input
                        id="chatbotSubtitle"
                        value={chatbotSettings.subtitle}
                        onChange={(e) => updateChatbotSettings('subtitle', e.target.value)}
                        placeholder="How can I help you?"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Welcome Message</Label>
                    <Textarea
                      id="welcomeMessage"
                      value={chatbotSettings.welcomeMessage}
                      onChange={(e) => updateChatbotSettings('welcomeMessage', e.target.value)}
                      placeholder="Hello! I'm your AI assistant. How can I help you today?"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="inputPlaceholder">Input Placeholder</Label>
                    <Input
                      id="inputPlaceholder"
                      value={chatbotSettings.placeholder}
                      onChange={(e) => updateChatbotSettings('placeholder', e.target.value)}
                      placeholder="Type your message..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="logoUrl">Logo URL</Label>
                      <Input
                        id="logoUrl"
                        value={chatbotSettings.logoUrl}
                        onChange={(e) => updateChatbotSettings('logoUrl', e.target.value)}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          value={chatbotSettings.primaryColor}
                          onChange={(e) => updateChatbotSettings('primaryColor', e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input
                          value={chatbotSettings.primaryColor}
                          onChange={(e) => updateChatbotSettings('primaryColor', e.target.value)}
                          placeholder="#3b82f6"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Quick Suggestions
                    </CardTitle>
                    <Button onClick={addSuggestion} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                      <Input
                        value={suggestion.title}
                        onChange={(e) => updateSuggestion(index, 'title', e.target.value)}
                        placeholder="Suggestion title"
                        className="flex-1"
                      />
                      <Input
                        value={suggestion.description}
                        onChange={(e) => updateSuggestion(index, 'description', e.target.value)}
                        placeholder="Description"
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSuggestion(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {suggestions.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      No suggestions added yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>
                    Chatbot appearance preview
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg" style={{ backgroundColor: chatbotSettings.primaryColor + '10' }}>
                      <div className="flex items-center gap-2 mb-2">
                        {chatbotSettings.logoUrl ? (
                          <img src={chatbotSettings.logoUrl} alt="Logo" className="h-8 w-8" />
                        ) : (
                          <Bot className="h-8 w-8" style={{ color: chatbotSettings.primaryColor }} />
                        )}
                        <div>
                          <h3 className="font-semibold">{chatbotSettings.title || 'AI Assistant'}</h3>
                          <p className="text-sm text-muted-foreground">{chatbotSettings.subtitle || 'How can I help you?'}</p>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded shadow-sm">
                        <p className="text-sm">{chatbotSettings.welcomeMessage || 'Hello! I\'m your AI assistant. How can I help you today?'}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {suggestions.slice(0, 3).map((suggestion, index) => (
                          <div
                            key={index}
                            className="px-2 py-1 bg-white border rounded text-xs"
                            style={{ borderColor: chatbotSettings.primaryColor }}
                          >
                            {suggestion.title}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <Input
                        placeholder={chatbotSettings.placeholder || 'Type your message...'}
                        className="pr-10"
                      />
                      <Button
                        size="sm"
                        className="absolute right-1 top-1 h-8"
                        style={{ backgroundColor: chatbotSettings.primaryColor }}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prompts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                System Prompts
              </CardTitle>
              <CardDescription>
                Manage and customize system prompts for different AI behaviors
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Prompt Templates</h3>
                    <Button onClick={addPrompt} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      New
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {prompts.map((prompt) => (
                      <div
                        key={prompt.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          activePrompt?.id === prompt.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setActivePromptById(prompt.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{prompt.name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {prompt.temperature} temp, {prompt.maxTokens} tokens
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {prompt.isActive && (
                              <Badge variant="default" className="text-xs">
                                Active
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePrompt(prompt.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {prompts.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No custom prompts yet
                      </p>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  {activePrompt ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Input
                          value={activePrompt.name}
                          onChange={(e) => {
                            setActivePrompt({ ...activePrompt, name: e.target.value });
                            setPrompts(prompts.map(p =>
                              p.id === activePrompt.id
                                ? { ...p, name: e.target.value }
                                : p
                            ));
                          }}
                          placeholder="Prompt name"
                          className="flex-1"
                      />
                      <Button onClick={updatePrompt} size="sm">
                          <Save className="h-4 w-4 mr-1" />
                          Update
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label>System Prompt</Label>
                        <Textarea
                          value={editingPrompt}
                          onChange={(e) => setEditingPrompt(e.target.value)}
                          rows={8}
                          placeholder="Enter your system prompt..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Temperature: {promptTemperature}</Label>
                          <Slider
                            value={[promptTemperature]}
                            onValueChange={(value) => setPromptTemperature(value[0])}
                            min={0}
                            max={2}
                            step={0.1}
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Max Tokens: {promptMaxTokens}</Label>
                          <Slider
                            value={[promptMaxTokens]}
                            onValueChange={(value) => setPromptMaxTokens(value[0])}
                            min={256}
                            max={4096}
                            step={256}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Select a prompt to edit or create a new one</p>
                    </div>
                  )}
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  All prompt settings are saved with the main "Save" button in the top right.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure authentication and security options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enableAuth"
                    checked={config.security.enableAuth}
                    onCheckedChange={(checked) => updateConfig('security.enableAuth', checked)}
                  />
                  <Label htmlFor="enableAuth">Enable Authentication</Label>
                </div>

                {config.security.enableAuth && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="jwtSecret">JWT Secret</Label>
                      <div className="relative">
                      <Input
                          id="jwtSecret"
                          type={showPassword.jwtSecret ? 'text' : 'password'}
                          value={config.security.jwtSecret}
                          onChange={(e) => updateConfig('security.jwtSecret', e.target.value)}
                      />
                      <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2"
                          onClick={() => togglePasswordVisibility('jwtSecret')}
                        >
                          {showPassword.jwtSecret ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sessionTimeout">Session Timeout (seconds)</Label>
                      <Input
                        id="sessionTimeout"
                        type="number"
                        value={config.security.sessionTimeout}
                        onChange={(e) => updateConfig('security.sessionTimeout', parseInt(e.target.value))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rateLimit">Rate Limit (requests per minute)</Label>
                      <Input
                        id="rateLimit"
                        type="number"
                        value={config.security.rateLimit}
                        onChange={(e) => updateConfig('security.rateLimit', parseInt(e.target.value))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="corsOrigins">CORS Origins (comma-separated)</Label>
                      <Input
                        id="corsOrigins"
                        value={config.security.corsOrigins.join(', ')}
                        onChange={(e) => updateConfig('security.corsOrigins', e.target.value.split(',').map(s => s.trim()))}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Web Scraper Settings
                </CardTitle>
                <CardDescription>
                  Configure web scraping parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scraperTimeout">Timeout (ms)</Label>
                    <Input
                      id="scraperTimeout"
                      type="number"
                      value={config.scraper.timeout}
                      onChange={(e) => updateConfig('scraper.timeout', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxConcurrency">Max Concurrency</Label>
                    <Input
                      id="maxConcurrency"
                      type="number"
                      value={config.scraper.maxConcurrency}
                      onChange={(e) => updateConfig('scraper.maxConcurrency', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="userAgent">User Agent</Label>
                    <Input
                      id="userAgent"
                      value={config.scraper.userAgent}
                      onChange={(e) => updateConfig('scraper.userAgent', e.target.value)}
                      placeholder="ASB Web Scraper"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Logging Configuration
                </CardTitle>
                <CardDescription>
                  Configure application logging
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="logLevel">Log Level</Label>
                    <Select
                      value={config.logging.level}
                      onValueChange={(value) => updateConfig('logging.level', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="error">Error</SelectItem>
                        <SelectItem value="warn">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="debug">Debug</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logFile">Log File</Label>
                    <Input
                      id="logFile"
                      value={config.logging.file}
                      onChange={(e) => updateConfig('logging.file', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxSize">Max Size</Label>
                    <Input
                      id="maxSize"
                      value={config.logging.maxSize}
                      onChange={(e) => updateConfig('logging.maxSize', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxFiles">Max Files</Label>
                    <Input
                      id="maxFiles"
                      type="number"
                      value={config.logging.maxFiles}
                      onChange={(e) => updateConfig('logging.maxFiles', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rag">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                RAG Settings
              </CardTitle>
              <CardDescription>
                Configure Retrieval-Augmented Generation parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Search Configuration</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="similarityThreshold">
                      Similarity Threshold: {(config.ragSettings?.similarityThreshold || 0.001).toFixed(3)}
                    </Label>
                    <Slider
                      id="similarityThreshold"
                      value={[config.ragSettings?.similarityThreshold || 0.001]}
                      onValueChange={(value) => updateConfig('ragSettings.similarityThreshold', value[0])}
                      min={0.001}
                      max={0.5}
                      step={0.001}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Minimum similarity score for vector search results (0.001 = very permissive, 0.1 = strict)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxResults">Max Results: {config.ragSettings?.maxResults || 10}</Label>
                    <Slider
                      id="maxResults"
                      value={[config.ragSettings?.maxResults || 10]}
                      onValueChange={(value) => updateConfig('ragSettings.maxResults', value[0])}
                      min={1}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Maximum number of documents to retrieve
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="minResults">Min Results: {config.ragSettings?.minResults || 3}</Label>
                    <Slider
                      id="minResults"
                      value={[config.ragSettings?.minResults || 3]}
                      onValueChange={(value) => updateConfig('ragSettings.minResults', value[0])}
                      min={1}
                      max={20}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      Minimum number of results required before falling back to keyword search
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Search Options</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableHybridSearch">Enable Hybrid Search</Label>
                    <p className="text-sm text-muted-foreground">
                      Combine vector search with keyword search for better results
                    </p>
                  </div>
                  <Switch
                    id="enableHybridSearch"
                    checked={config.ragSettings?.enableHybridSearch ?? true}
                    onCheckedChange={(checked) => updateConfig('ragSettings.enableHybridSearch', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableKeywordBoost">Enable Keyword Boost</Label>
                    <p className="text-sm text-muted-foreground">
                      Boost scores when query keywords appear in results
                    </p>
                  </div>
                  <Switch
                    id="enableKeywordBoost"
                    checked={config.ragSettings?.enableKeywordBoost ?? true}
                    onCheckedChange={(checked) => updateConfig('ragSettings.enableKeywordBoost', checked)}
                  />
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Tip:</strong> Lower similarity threshold values will return more results but may include less relevant documents.
                  Start with 0.01 and adjust based on your needs.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}