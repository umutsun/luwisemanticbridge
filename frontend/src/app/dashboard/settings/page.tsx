'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
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
  RotateCcw
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
    provider: string; // openai, ollama, huggingface
  };
  dataSource: {
    useLocalDb: boolean;
    localDbPercentage: number; // 0-100, verilerin yüzde kaçı local DB'den
    externalApiPercentage: number; // 0-100, verilerin yüzde kaçı external API'den
    hybridMode: boolean;
    prioritySource: string; // 'local' | 'external' | 'balanced'
  };
  llmSettings: {
    embeddingProvider: string; // 'openai' | 'ollama' | 'lightrag'
    embeddingModel: string; // aktif embedding modeli
    ollamaBaseUrl?: string; // Ollama base URL
    ollamaEmbeddingModel?: string; // Ollama embedding modeli
    temperature: number; // 0-1, yaratıcılık seviyesi
    topP: number; // 0-1, kelime seçim çeşitliliği
    maxTokens: number; // maksimum token sayısı
    presencePenalty: number; // -2 to 2, tekrar cezası
    frequencyPenalty: number; // -2 to 2, sıklık cezası
    ragWeight: number; // 0-100, RAG data ağırlığı
    llmKnowledgeWeight: number; // 0-100, LLM kendi bilgisi ağırlığı
    streamResponse: boolean;
    systemPrompt: string;
    activeChatModel: string; // Chatbot için aktif model
    activeEmbeddingModel: string; // Embedding için aktif model
    responseStyle: string; // professional, casual, academic, technical, friendly
    language: string; // tr, en, auto
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
      apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
      model: 'gpt-4-turbo-preview',
      embeddingModel: 'text-embedding-3-small',
      maxTokens: 4096,
      temperature: 0.7,
    },
    anthropic: {
      apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
      model: 'claude-3-opus-20240229',
      maxTokens: 4096,
    },
    deepseek: {
      apiKey: process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY || '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-coder',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'llama2',
      embeddingModel: 'nomic-embed-text',
    },
    huggingface: {
      apiKey: process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY || '',
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      endpoint: 'https://api-inference.huggingface.co/models/',
    },
    cohere: {
      apiKey: process.env.NEXT_PUBLIC_COHERE_API_KEY || '',
    },
    voyage: {
      apiKey: process.env.NEXT_PUBLIC_VOYAGE_API_KEY || '',
    },
    google: {
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '',
      projectId: process.env.NEXT_PUBLIC_GOOGLE_PROJECT_ID || '',
    },
    jina: {
      apiKey: process.env.NEXT_PUBLIC_JINA_API_KEY || '',
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
      localDbPercentage: 100, // %100 local DB - sadece RAG_DATA kullan
      externalApiPercentage: 0, // %0 external API
      hybridMode: false,
      prioritySource: 'local',
    },
    llmSettings: {
      embeddingProvider: 'openai', // Varsayılan embedding provider
      embeddingModel: 'openai/text-embedding-ada-002', // Varsayılan embedding modeli
      ollamaBaseUrl: 'http://localhost:11434', // Ollama varsayılan URL
      ollamaEmbeddingModel: 'nomic-embed-text', // Ollama varsayılan model
      temperature: 0.1, // Düşük = RAG'e sadık kalır
      topP: 0.9,
      maxTokens: 2048,
      presencePenalty: 0,
      frequencyPenalty: 0,
      ragWeight: 95, // %95 RAG data
      llmKnowledgeWeight: 5, // %5 LLM kendi bilgisi
      streamResponse: true,
      systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
      activeChatModel: 'google/gemini-pro',
      activeEmbeddingModel: 'google/text-embedding-004',
      responseStyle: 'professional',
      language: 'tr',
    },
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  // Services state
  // Prompt and Chatbot States
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [promptTemperature, setPromptTemperature] = useState(0.1);
  const [promptMaxTokens, setPromptMaxTokens] = useState(2048);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  
  const [chatbotSettings, setChatbotSettings] = useState<ChatbotSettings>({
    title: '',
    subtitle: '',
    logoUrl: '',
    welcomeMessage: '',
    placeholder: '',
    primaryColor: '#3B82F6',
    suggestions: '[]'
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [savingChatbot, setSavingChatbot] = useState(false);

  // AI Provider Priority state
  const [aiProviderPriority, setAiProviderPriority] = useState<string[]>(['gemini', 'claude', 'openai', 'fallback']);
  const [savingAiProvider, setSavingAiProvider] = useState(false);

  // Gemini model state
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');
  const [savingGeminiModel, setSavingGeminiModel] = useState(false);
  
  const defaultPrompt = `You are an expert assistant.
    
TASK:
- Answer based on the context provided below
- IMPORTANT: Prioritize sources at the BEGINNING of context (most relevant)
- Create comprehensive answers using information from the first 3-5 sources
- Always cite sources in [Source 1], [Source 2] format
- If context is empty or no relevant info, say "No information available in database"
- Don't guess, only use information from context
- Be professional in your response`;

  const [services, setServices] = useState<Record<string, any>>({
    lightrag: { status: 'stopped' },
    raganything: { status: 'stopped' },
    embedder: { status: 'stopped' },
    postgres: { status: 'stopped' },
    redis: { status: 'stopped' }
  });

  const [serviceLoading, setServiceLoading] = useState<Record<string, boolean>>({
    lightrag: false,
    raganything: false,
    embedder: false,
    postgres: false,
    redis: false
  });

  const handleServiceAction = async (service: string, action: string) => {
    setServiceLoading({ ...serviceLoading, [service]: true });
    try {
      const response = await fetch(`http://localhost:8083/api/v2/services/${service}/${action}`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        setServices({ ...services, [service]: { ...services[service], status: result.status } });

        const actionText = action === 'start' ? 'başlatıldı' : action === 'stop' ? 'durduruldu' : 'yeniden başlatıldı';
        const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
        
        toast({
          title: "İşlem Başarılı",
          description: `${serviceName} servisi ${actionText}.`,
          duration: 2500,
        });
      } else {
        const failText = action === 'start' ? 'başlatılamadı' : action === 'stop' ? 'durdurulamadı' : 'yeniden başlatılamadı';
        const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
        
        toast({
          title: "İşlem Başarısız",
          description: `${serviceName} servisi ${failText}.`,
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Hata Oluştu",
        description: `${service.charAt(0).toUpperCase() + service.slice(1)} servisiyle iletişim kurulamadı.`,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setServiceLoading({ ...serviceLoading, [service]: false });
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchServiceStatus();
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
      const response = await fetch('http://localhost:8083/api/v2/config/prompts');
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
      const response = await fetch('http://localhost:8083/api/v2/chatbot/settings');
      const data = await response.json();
      
      setChatbotSettings({
        title: data.title || '',
        subtitle: data.subtitle || '',
        logoUrl: data.logoUrl || '',
        welcomeMessage: data.welcomeMessage || '',
        placeholder: data.placeholder || '',
        primaryColor: data.primaryColor || '#3B82F6',
        suggestions: data.suggestions || '[]'
      });
      
      try {
        const parsedSuggestions = JSON.parse(data.suggestions || '[]');
        setSuggestions(Array.isArray(parsedSuggestions) ? parsedSuggestions : []);
      } catch {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to fetch chatbot settings:', error);
    }
  };

  const fetchAISettings = async () => {
    try {
      const response = await fetch('/api/settings/ai');
      if (response.ok) {
        const data = await response.json();

        // Update config with AI settings
        setConfig(prev => ({
          ...prev,
          llmSettings: {
            ...prev.llmSettings,
            activeChatModel: data.activeChatModel,
            activeEmbeddingModel: data.activeEmbeddingModel,
            temperature: data.temperature,
            topP: data.topP,
            maxTokens: data.maxTokens,
            presencePenalty: data.presencePenalty,
            frequencyPenalty: data.frequencyPenalty,
            ragWeight: data.ragWeight,
            llmKnowledgeWeight: data.llmKnowledgeWeight,
            streamResponse: data.streamResponse,
            systemPrompt: data.systemPrompt,
            responseStyle: data.responseStyle,
            language: data.language
          }
        }));
      }
    } catch (error) {
      console.error('Failed to fetch AI settings:', error);
    }
  };

  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/config/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editingPrompt,
          temperature: promptTemperature,
          maxTokens: promptMaxTokens,
          name: 'Custom System Prompt'
        })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "System prompt updated successfully",
          duration: 3000,
        });
        fetchPrompts();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update prompt",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSaveChatbot = async () => {
    setSavingChatbot(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/chatbot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...chatbotSettings,
          suggestions: JSON.stringify(suggestions)
        })
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Chatbot settings saved successfully",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save chatbot settings",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setSavingChatbot(false);
    }
  };

  // AI Provider Priority handlers
  const moveProviderUp = (index: number) => {
    if (index === 0) return;
    const newPriority = [...aiProviderPriority];
    [newPriority[index - 1], newPriority[index]] = [newPriority[index], newPriority[index - 1]];
    setAiProviderPriority(newPriority);
  };

  const moveProviderDown = (index: number) => {
    if (index === aiProviderPriority.length - 1) return;
    const newPriority = [...aiProviderPriority];
    [newPriority[index], newPriority[index + 1]] = [newPriority[index + 1], newPriority[index]];
    setAiProviderPriority(newPriority);
  };

  const handleSaveAiProviderPriority = async () => {
    setSavingAiProvider(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/settings/ai-provider-priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: aiProviderPriority
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'AI provider priority saved successfully',
        });
      } else {
        throw new Error('Failed to save AI provider priority');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save AI provider priority',
        variant: 'destructive',
      });
    } finally {
      setSavingAiProvider(false);
    }
  };

  // Load AI provider priority on mount
  useEffect(() => {
    const loadAiProviderPriority = async () => {
      try {
        const response = await fetch('http://localhost:8083/api/v2/settings/ai-provider-priority');
        if (response.ok) {
          const data = await response.json();
          if (data.priority) {
            setAiProviderPriority(data.priority);
          }
        }
      } catch (error) {
        // Use default priority
      }
    };

    loadAiProviderPriority();
  }, []);

  // Load Gemini model on mount
  useEffect(() => {
    const loadGeminiModel = async () => {
      try {
        const response = await fetch('http://localhost:8083/api/v2/settings/gemini-model');
        if (response.ok) {
          const data = await response.json();
          if (data.model) {
            setGeminiModel(data.model);
          }
        }
      } catch (error) {
        // Use default model
      }
    };

    loadGeminiModel();
  }, []);

  const handleSaveGeminiModel = async () => {
    setSavingGeminiModel(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/settings/gemini-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: geminiModel
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Gemini model saved successfully',
        });
      } else {
        throw new Error('Failed to save Gemini model');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save Gemini model',
        variant: 'destructive',
      });
    } finally {
      setSavingGeminiModel(false);
    }
  };

  const handleResetPrompt = () => {
    setEditingPrompt(defaultPrompt);
    setPromptTemperature(0.1);
    setPromptMaxTokens(2048);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(editingPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const addSuggestion = () => {
    setSuggestions([
      ...suggestions,
      { icon: '📌', title: '', description: '' }
    ]);
  };

  const updateSuggestion = (index: number, field: keyof Suggestion, value: string) => {
    const updated = [...suggestions];
    updated[index] = { ...updated[index], [field]: value };
    setSuggestions(updated);
  };

  const removeSuggestion = (index: number) => {
    setSuggestions(suggestions.filter((_, i) => i !== index));
  };

  const fetchServiceStatus = async () => {
    try {
      // Check PostgreSQL
      const pgResponse = await fetch('http://localhost:8083/api/v2/services/postgres/status');
      if (pgResponse.ok) {
        const pgData = await pgResponse.json();
        setServices(prev => ({ ...prev, postgres: { status: pgData.status || 'running' } }));
      }

      // Check Redis
      const redisResponse = await fetch('http://localhost:8083/api/v2/services/redis/status');
      if (redisResponse.ok) {
        const redisData = await redisResponse.json();
        setServices(prev => ({ ...prev, redis: { status: redisData.status || 'running' } }));
      }

      // Check other services
      const servicesResponse = await fetch('http://localhost:8083/api/dashboard');
      if (servicesResponse.ok) {
        const data = await servicesResponse.json();
        setServices(prev => ({
          ...prev,
          lightrag: { status: data.lightrag?.initialized ? 'running' : 'stopped' },
          postgres: { status: data.database ? 'running' : 'stopped' },
          redis: { status: data.redis?.connected ? 'running' : 'stopped' }
        }));
      }
    } catch (error) {
      console.error('Failed to fetch service status:', error);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      // Merge fetched config with default config to ensure all properties exist
      setConfig(prevConfig => ({
        ...prevConfig,
        ...data,
        // Ensure new provider configs are preserved
        cohere: data.cohere || prevConfig.cohere,
        voyage: data.voyage || prevConfig.voyage,
        google: data.google || prevConfig.google,
        jina: data.jina || prevConfig.jina,
      }));
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save embedding settings to database
      try {
        const embeddingResponse = await fetch('http://localhost:8083/api/v2/settings/embedding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeddingProvider: config.embeddings.provider,
            embeddingModel: config.embeddings.model,
            ollamaBaseUrl: config.llmSettings.ollamaBaseUrl,
            ollamaEmbeddingModel: config.embeddings.model, // Use the same model for consistency
            huggingfaceApiKey: config.huggingface.apiKey,
            mistralApiKey: config.mistral?.apiKey || '',
            chunkSize: config.embeddings.chunkSize,
            chunkOverlap: config.embeddings.chunkOverlap,
            batchSize: config.embeddings.batchSize,
            normalizeEmbeddings: config.embeddings.normalizeEmbeddings,
            cacheEmbeddings: config.embeddings.cacheEmbeddings
          }),
        });

        if (embeddingResponse.ok) {
          toast({
            title: "Embedding Ayarları",
            description: "Embedding ayarları başarıyla kaydedildi.",
            duration: 3000,
          });
        }
      } catch (error) {
        console.error('Failed to save embedding settings:', error);
      }

      // Save OpenAI API key separately
      if (config.openai.apiKey) {
        try {
          const openaiResponse = await fetch('/api/settings/openai-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: config.openai.apiKey }),
          });

          if (openaiResponse.ok) {
            toast({
              title: "OpenAI API Key",
              description: "OpenAI API anahtarı başarıyla kaydedildi.",
              duration: 3000,
            });
          }
        } catch (error) {
          console.error('Failed to save OpenAI API key:', error);
          toast({
            title: "OpenAI API Key Hatası",
            description: "OpenAI API anahtarı kaydedilemedi.",
            variant: "destructive",
            duration: 4000,
          });
        }
      }

      // Save Cohere API key
      if (config.cohere.apiKey) {
        try {
          await fetch('/api/settings/cohere-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: config.cohere.apiKey }),
          });
        } catch (error) {
          console.error('Failed to save Cohere API key:', error);
        }
      }

      // Save Voyage AI API key
      if (config.voyage.apiKey) {
        try {
          await fetch('/api/settings/voyage-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: config.voyage.apiKey }),
          });
        } catch (error) {
          console.error('Failed to save Voyage AI API key:', error);
        }
      }

      // Save Google API key and project ID
      if (config.google.apiKey || config.google.projectId) {
        try {
          await fetch('/api/settings/google-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: config.google.apiKey,
              projectId: config.google.projectId
            }),
          });
        } catch (error) {
          console.error('Failed to save Google API settings:', error);
        }
      }

      // Save Jina AI API key
      if (config.jina.apiKey) {
        try {
          await fetch('/api/settings/jina-api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: config.jina.apiKey }),
          });
        } catch (error) {
          console.error('Failed to save Jina AI API key:', error);
        }
      }

      // Save general config
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        toast({
          title: t('toasts.settingsSavedSuccessTitle'),
          description: t('toasts.settingsSavedSuccess'),
          duration: 3000,
        });
      } else {
        // It's good practice to also handle non-ok responses
        toast({
          title: t('toasts.settingsSavedErrorTitle'),
          description: t('toasts.settingsSavedError'),
          variant: "destructive",
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast({
        title: t('toasts.settingsSavedErrorTitle'),
        description: t('toasts.settingsSavedError'),
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (service: string) => {
    setTesting(service);
    try {
      if (service === 'database') {
        // Use Next proxy which maps to backend /api/v2/settings/database/test
        const payload = {
          host: config.database.host || 'localhost',
          port: Number(config.database.port || 5432),
          database: config.database.name || 'rag_chatbot',
          user: config.database.user || 'postgres',
          password: config.database.password || '',
          // Treat boolean ssl as required/enabled
          ssl: !!config.database.ssl,
        };

        const resp = await fetch('/api/settings/database/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await resp.json();
        setTestResults({ ...testResults, database: !!result.success });

        if (resp.ok && result.success) {
          toast({
            title: 'Bağlantı Başarılı',
            description: `Veritabanı: ${result.database || payload.database} • Versiyon: ${result.version || ''}`,
            duration: 2500,
          });
        } else {
          toast({
            title: 'Bağlantı Başarısız',
            description: result.error || 'Database servisine bağlanılamadı. Ayarları kontrol edin.',
            variant: 'destructive',
            duration: 3000,
          });
        }
      } else {
        // Fallback for other services keeps previous behavior
        const response = await fetch(`http://localhost:8083/api/v2/config/test/${service}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config[service as keyof Config]),
        });
        const result = await response.json();
        setTestResults({ ...testResults, [service]: !!result.success });
      }
    } catch (error) {
      setTestResults({ ...testResults, [service]: false });
      toast({
        title: 'Test Hatası',
        description: service.charAt(0).toUpperCase() + service.slice(1) + ' servisi test edilemedi. Bağlantı ayarlarını kontrol edin.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setTesting(null);
    }
  };

  const updateConfig = async (section: keyof Config, field: string, value: any) => {
    // Update local state first
    setConfig({
      ...config,
      [section]: {
        ...config[section],
        [field]: value,
      },
    });

    // If it's an LLM setting, save to backend
    if (section === 'llmSettings') {
      try {
        const response = await fetch('/api/settings/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...config.llmSettings,
            [field]: value
          })
        });

        if (response.ok) {
          toast({
            title: "Başarılı",
            description: "AI ayarı güncellendi",
            duration: 2000,
          });
        } else {
          toast({
            title: "Hata",
            description: "AI ayarı kaydedilemedi",
            variant: "destructive",
            duration: 3000,
          });
        }
      } catch (error) {
        console.error('Failed to save AI setting:', error);
        toast({
          title: "Hata",
          description: "AI ayarı kaydedilemedi",
          variant: "destructive",
          duration: 3000,
        });
      }
    }
  };

  const handleLanguageChange = (newLang: string) => {
    updateConfig('app', 'locale', newLang);
    i18n.changeLanguage(newLang);
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('settings.description')}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              {t('settings.savingButton')}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {t('settings.saveButton')}
            </>
          )}
        </Button>
      </div>

      {/* Configuration Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-9 gap-1">
          <TabsTrigger value="general">{t('settings.generalTab')}</TabsTrigger>
          <TabsTrigger value="services">{t('settings.servicesTab')}</TabsTrigger>
          <TabsTrigger value="database">{t('settings.databaseTab')}</TabsTrigger>
          <TabsTrigger value="ai-services">{t('settings.aiServicesTab')}</TabsTrigger>
          <TabsTrigger value="embeddings">{t('settings.embeddingsTab')}</TabsTrigger>
          <TabsTrigger value="integrations">{t('settings.integrationsTab')}</TabsTrigger>
          <TabsTrigger value="chatbot">Chatbot</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="advanced">{t('settings.advancedTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {t('settings.generalSettingsTitle')}
              </CardTitle>
              <CardDescription>
                {t('settings.generalSettingsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('settings.appNameLabel')}</label>
                <Input
                  value={config.app.name}
                  onChange={(e) => updateConfig('app', 'name', e.target.value)}
                  placeholder={t('settings.appNamePlaceholder')}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.appNameDescription')}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.appDescriptionLabel')}</label>
                <Input
                  value={config.app.description}
                  onChange={(e) => updateConfig('app', 'description', e.target.value)}
                  placeholder={t('settings.appDescriptionPlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.logoUrlLabel') || 'Logo URL'}</label>
                <Input
                  value={config.app.logoUrl}
                  onChange={(e) => updateConfig('app', 'logoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.logoUrlDescription') || 'Upload your company logo URL to customize the dashboard'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.languageLabel')}</label>
                <select
                  value={i18n.language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="tr">{t('settings.languageOptions.tr')}</option>
                  <option value="en">{t('settings.languageOptions.en')}</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Management Tab */}
        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* LightRAG Service */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">LightRAG</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.lightrag?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.lightrag?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    {services.lightrag?.status === 'stopped' || !services.lightrag ? (
                      <Button
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleServiceAction('lightrag', 'start')}
                        disabled={serviceLoading.lightrag}
                      >
                        Başlat
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1 h-7 text-xs"
                          onClick={() => handleServiceAction('lightrag', 'stop')}
                          disabled={serviceLoading.lightrag}
                        >
                          Durdur
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleServiceAction('lightrag', 'restart')}
                          disabled={serviceLoading.lightrag}
                        >
                          ↻
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PostgreSQL */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">PostgreSQL</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.postgres?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.postgres?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      disabled
                    >
                      5432
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Redis */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Redis</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.redis?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.redis?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      disabled
                    >
                      6379
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Embedder Service */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Embedder</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.embedder?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.embedder?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    {services.embedder?.status === 'stopped' || !services.embedder ? (
                      <Button
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleServiceAction('embedder', 'start')}
                        disabled={serviceLoading.embedder}
                      >
                        Başlat
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1 h-7 text-xs"
                          onClick={() => handleServiceAction('embedder', 'stop')}
                          disabled={serviceLoading.embedder}
                        >
                          Durdur
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleServiceAction('embedder', 'restart')}
                          disabled={serviceLoading.embedder}
                        >
                          ↻
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RAGAnything Service */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">RAGAnything</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.raganything?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.raganything?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    {services.raganything?.status === 'stopped' || !services.raganything ? (
                      <Button
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleServiceAction('raganything', 'start')}
                        disabled={serviceLoading.raganything}
                      >
                        Başlat
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1 h-7 text-xs"
                          onClick={() => handleServiceAction('raganything', 'stop')}
                          disabled={serviceLoading.raganything}
                        >
                          Durdur
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleServiceAction('raganything', 'restart')}
                          disabled={serviceLoading.raganything}
                        >
                          ↻
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Komut Referansları:</strong>
              <div className="mt-2 space-y-1 text-xs font-mono">
                <div>• LightRAG: python backend/lightrag_api.py --port 8084</div>
                <div>• RAGAnything: python backend/raganything_server.py --port 8085</div>
                <div>• Embedder: python backend/embedder_service.py --port 8086</div>
                <div>• Docker: docker-compose up -d</div>
              </div>
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                PostgreSQL + pgvector
              </CardTitle>
              <CardDescription>
                Vektör veritabanı bağlantı ayarları
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Host</label>
                  <Input
                    value={config.database.host}
                    onChange={(e) => updateConfig('database', 'host', e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Port</label>
                  <Input
                    type="number"
                    value={config.database.port}
                    onChange={(e) => updateConfig('database', 'port', parseInt(e.target.value))}
                    placeholder="5432"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Database</label>
                  <Input
                    value={config.database.name}
                    onChange={(e) => updateConfig('database', 'name', e.target.value)}
                    placeholder="alice_semantic_bridge"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">User</label>
                  <Input
                    value={config.database.user}
                    onChange={(e) => updateConfig('database', 'user', e.target.value)}
                    placeholder="postgres"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    value={config.database.password}
                    onChange={(e) => updateConfig('database', 'password', e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  {testResults.database !== undefined && (
                    testResults.database ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Bağlantı Başarılı
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Bağlantı Başarısız
                      </Badge>
                    )
                  )}
                </div>
                <Button
                  onClick={() => testConnection('database')}
                  disabled={testing === 'database'}
                  variant="outline"
                >
                  {testing === 'database' ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Redis Cache
              </CardTitle>
              <CardDescription>
                Cache sunucu bağlantı ayarları
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Host</label>
                  <Input
                    value={config.redis.host}
                    onChange={(e) => updateConfig('redis', 'host', e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Port</label>
                  <Input
                    type="number"
                    value={config.redis.port}
                    onChange={(e) => updateConfig('redis', 'port', parseInt(e.target.value))}
                    placeholder="6379"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Password (Opsiyonel)</label>
                  <Input
                    type="password"
                    value={config.redis.password}
                    onChange={(e) => updateConfig('redis', 'password', e.target.value)}
                    placeholder="Şifre yoksa boş bırakın"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  {testResults.redis !== undefined && (
                    testResults.redis ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Bağlantı Başarılı
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Bağlantı Başarısız
                      </Badge>
                    )
                  )}
                </div>
                <Button
                  onClick={() => testConnection('redis')}
                  disabled={testing === 'redis'}
                  variant="outline"
                >
                  {testing === 'redis' ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Services Tab */}
        <TabsContent value="ai-services" className="space-y-4">
          {/* Data Source Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Veri Kaynağı Ayarları
              </CardTitle>
              <CardDescription>
                Verilerin nereden çekileceğini yönetin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.dataSource.useLocalDb}
                      onChange={(e) => updateConfig('dataSource', 'useLocalDb', e.target.checked)}
                      className="rounded"
                    />
                    Local Database Kullan
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.dataSource.hybridMode}
                      onChange={(e) => updateConfig('dataSource', 'hybridMode', e.target.checked)}
                      className="rounded"
                    />
                    Hybrid Mod (Karışık)
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Local DB Kullanım Oranı: %{config.dataSource.localDbPercentage}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.dataSource.localDbPercentage}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      updateConfig('dataSource', 'localDbPercentage', value);
                      updateConfig('dataSource', 'externalApiPercentage', 100 - value);
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0% (Sadece API)</span>
                    <span>50% (Dengeli)</span>
                    <span>100% (Sadece DB)</span>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-blue-500" />
                      Local Database
                    </span>
                    <Badge variant="outline" className="text-blue-600">
                      %{config.dataSource.localDbPercentage}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-green-500" />
                      External API
                    </span>
                    <Badge variant="outline" className="text-green-600">
                      %{config.dataSource.externalApiPercentage}
                    </Badge>
                  </div>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>%100 Local DB:</strong> Tüm veriler kendi veritabanınızdan gelir (hızlı, güvenli)<br />
                    <strong>%70 Local / %30 API:</strong> Önce local DB, bulunamazsa API kullanılır<br />
                    <strong>%0 Local DB:</strong> Sadece external API kullanılır (OpenAI, Claude vb.)
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* LLM Response Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                LLM Yanıt Kontrolleri
              </CardTitle>
              <CardDescription>
                Model'in RAG data'ya ne kadar sadık kalacağını ayarlayın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active Model Selection */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-purple-500" />
                    Chatbot Modeli
                  </label>
                  <select
                    value={config.llmSettings.activeChatModel}
                    onChange={(e) => updateConfig('llmSettings', 'activeChatModel', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm mt-1"
                  >
                    <optgroup label="Google (Default)">
                      <option value="google/gemini-pro">Gemini Pro</option>
                      <option value="google/gemini-1.5-pro">Gemini 1.5 Pro</option>
                    </optgroup>
                    <optgroup label="OpenAI">
                      <option value="openai/gpt-4-turbo-preview">GPT-4 Turbo</option>
                      <option value="openai/gpt-4">GPT-4</option>
                      <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </optgroup>
                    <optgroup label="Anthropic">
                      <option value="anthropic/claude-3-opus">Claude 3 Opus</option>
                      <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet</option>
                      <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
                    </optgroup>
                    <optgroup label="DeepSeek">
                      <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
                      <option value="deepseek/deepseek-coder">DeepSeek Coder</option>
                    </optgroup>
                    <optgroup label="HuggingFace">
                      <option value="huggingface/mistralai/Mistral-7B-Instruct-v0.2">Mistral 7B Instruct</option>
                      <option value="huggingface/meta-llama/Llama-2-7b-chat-hf">Llama 2 7B Chat</option>
                      <option value="huggingface/microsoft/DialoGPT-medium">DialoGPT Medium</option>
                    </optgroup>
                    <optgroup label="Ollama (Local)">
                      <option value="ollama/llama2">Llama 2</option>
                      <option value="ollama/mistral">Mistral</option>
                      <option value="ollama/codellama">Code Llama</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    Embedding Modeli
                  </label>
                  <select
                    value={config.llmSettings.activeEmbeddingModel}
                    onChange={(e) => updateConfig('llmSettings', 'activeEmbeddingModel', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm mt-1"
                  >
                    <optgroup label="OpenAI">
                      <option value="openai/text-embedding-3-small">text-embedding-3-small (Hızlı)</option>
                      <option value="openai/text-embedding-3-large">text-embedding-3-large (Kaliteli)</option>
                      <option value="openai/text-embedding-ada-002">text-embedding-ada-002 (Klasik)</option>
                    </optgroup>
                    <optgroup label="Ollama (Local)">
                      <option value="ollama/nomic-embed-text">Nomic Embed Text</option>
                      <option value="ollama/mxbai-embed-large">mxbai-embed-large</option>
                    </optgroup>
                    <optgroup label="LightRAG">
                      <option value="lightrag/default">LightRAG Default</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Response Style & Language */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Yanıt Tonu/Üslubu</label>
                  <select
                    value={config.llmSettings.responseStyle}
                    onChange={(e) => updateConfig('llmSettings', 'responseStyle', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm"
                  >
                    <option value="professional">Profesyonel</option>
                    <option value="casual">Samimi/Rahat</option>
                    <option value="academic">Akademik</option>
                    <option value="technical">Teknik</option>
                    <option value="friendly">Arkadaşça</option>
                    <option value="concise">Kısa ve Öz</option>
                    <option value="detailed">Detaylı</option>
                    <option value="empathetic">Empatik</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Chatbot'un konuşma tarzı
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">Yanıt Dili</label>
                  <select
                    value={config.llmSettings.language}
                    onChange={(e) => updateConfig('llmSettings', 'language', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm"
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                    <option value="auto">Otomatik (Soruya göre)</option>
                    <option value="tr-formal">Türkçe (Resmi)</option>
                    <option value="tr-casual">Türkçe (Günlük)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Yanıt dili tercihi
                  </p>
                </div>
              </div>
              {/* RAG vs LLM Weight */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">RAG Data Ağırlığı: %{config.llmSettings.ragWeight}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.llmSettings.ragWeight}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      updateConfig('llmSettings', 'ragWeight', value);
                      updateConfig('llmSettings', 'llmKnowledgeWeight', 100 - value);
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0% (Serbest LLM)</span>
                    <span>95% (Önerilen)</span>
                    <span>100% (Tam RAG)</span>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-cyan-500" />
                      RAG Data (Veritabanı)
                    </span>
                    <Badge variant="outline" className="text-cyan-600">
                      %{config.llmSettings.ragWeight}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      LLM Bilgisi (GPT/Claude)
                    </span>
                    <Badge variant="outline" className="text-purple-600">
                      %{config.llmSettings.llmKnowledgeWeight}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Temperature Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Temperature: {config.llmSettings.temperature.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.llmSettings.temperature}
                    onChange={(e) => updateConfig('llmSettings', 'temperature', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    0 = Deterministik, 1 = Yaratıcı
                  </p>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-1">
                    {config.llmSettings.temperature <= 0.3 && '🎯 Kesin - RAG verilerine sadık'}
                    {config.llmSettings.temperature > 0.3 && config.llmSettings.temperature <= 0.6 && '⚖️ Dengeli - Hem doğru hem akıcı'}
                    {config.llmSettings.temperature > 0.6 && config.llmSettings.temperature <= 0.8 && '💡 Yaratıcı - Geniş yorumlama'}
                    {config.llmSettings.temperature > 0.8 && '🚀 Çok yaratıcı - Serbest'}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Top-P: {config.llmSettings.topP.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.llmSettings.topP}
                    onChange={(e) => updateConfig('llmSettings', 'topP', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Kelime seçim çeşitliliği
                  </p>
                </div>
              </div>

              {/* Penalty Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Presence Penalty: {config.llmSettings.presencePenalty}</label>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={config.llmSettings.presencePenalty}
                    onChange={(e) => updateConfig('llmSettings', 'presencePenalty', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Frequency Penalty: {config.llmSettings.frequencyPenalty}</label>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={config.llmSettings.frequencyPenalty}
                    onChange={(e) => updateConfig('llmSettings', 'frequencyPenalty', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="text-sm font-medium">System Prompt (RAG Talimatı)</label>
                <Textarea
                  value={config.llmSettings.systemPrompt}
                  onChange={(e) => updateConfig('llmSettings', 'systemPrompt', e.target.value)}
                  placeholder="LLM'e RAG context'i nasıl kullanacağını anlatan prompt..."
                  className="h-20 text-xs"
                />
              </div>

              <Alert className="bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200">
                <Info className="h-4 w-4 text-cyan-600" />
                <AlertDescription>
                  <strong>%100 RAG:</strong> Sadece veritabanındaki bilgiler kullanılır<br />
                  <strong>%95 RAG (Önerilen):</strong> RAG öncelikli, az format düzeltmesi<br />
                  <strong>Temperature 0.1:</strong> RAG'e maksimum sadakat<br />
                  <strong>Temperature 0.7:</strong> Dengeli yanıt
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Compact API Keys Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Anahtarları
              </CardTitle>
              <CardDescription>
                Tüm AI servislerinin API anahtarlarını buradan yönetin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* OpenAI */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      OpenAI
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.openai.apiKey}
                      onChange={(e) => updateConfig('openai', 'apiKey', e.target.value)}
                      placeholder="sk-proj-..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('openai')}
                      disabled={testing === 'openai'}
                      className="w-full h-8"
                    >
                      {testing === 'openai' ? '...' : 'Test'}
                    </Button>
                  </div>
                </div>

                {/* Anthropic */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-purple-500" />
                      Anthropic
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.anthropic.apiKey}
                      onChange={(e) => updateConfig('anthropic', 'apiKey', e.target.value)}
                      placeholder="sk-ant-..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('anthropic')}
                      disabled={testing === 'anthropic'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* DeepSeek */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      DeepSeek
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.deepseek.apiKey}
                      onChange={(e) => updateConfig('deepseek', 'apiKey', e.target.value)}
                      placeholder="API Key"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('deepseek')}
                      disabled={testing === 'deepseek'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* HuggingFace */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      HuggingFace
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.huggingface.apiKey}
                      onChange={(e) => updateConfig('huggingface', 'apiKey', e.target.value)}
                      placeholder="hf_..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('huggingface')}
                      disabled={testing === 'huggingface'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Ollama (Local) */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-gray-500" />
                      Ollama (Local)
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      value={config.ollama.baseUrl}
                      onChange={(e) => updateConfig('ollama', 'baseUrl', e.target.value)}
                      placeholder="http://localhost:11434"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('ollama')}
                      disabled={testing === 'ollama'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Cohere */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                      Cohere
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.cohere.apiKey}
                      onChange={(e) => updateConfig('cohere', 'apiKey', e.target.value)}
                      placeholder="API Key"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('cohere')}
                      disabled={testing === 'cohere'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Voyage AI */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-indigo-500" />
                      Voyage AI
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.voyage.apiKey}
                      onChange={(e) => updateConfig('voyage', 'apiKey', e.target.value)}
                      placeholder="API Key"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('voyage')}
                      disabled={testing === 'voyage'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Google */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-600" />
                      Google
                    </label>
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="password"
                      value={config.google.apiKey}
                      onChange={(e) => updateConfig('google', 'apiKey', e.target.value)}
                      placeholder="API Key"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={config.google.projectId}
                      onChange={(e) => updateConfig('google', 'projectId', e.target.value)}
                      placeholder="Project ID"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('google')}
                      disabled={testing === 'google'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Jina AI */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-teal-500" />
                      Jina AI
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.jina.apiKey}
                      onChange={(e) => updateConfig('jina', 'apiKey', e.target.value)}
                      placeholder="API Key"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('jina')}
                      disabled={testing === 'jina'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>
              </div>

              {/* API Key Help */}
              <Alert className="mt-4">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <div className="space-y-1">
                    <p><strong>OpenAI:</strong> <a href="https://platform.openai.com/api-keys" target="_blank" className="underline">platform.openai.com</a></p>
                    <p><strong>Anthropic:</strong> <a href="https://console.anthropic.com" target="_blank" className="underline">console.anthropic.com</a></p>
                    <p><strong>HuggingFace:</strong> <a href="https://huggingface.co/settings/tokens" target="_blank" className="underline">huggingface.co/settings</a></p>
                    <p><strong>Cohere:</strong> <a href="https://dashboard.cohere.com/api-keys" target="_blank" className="underline">dashboard.cohere.com</a></p>
                    <p><strong>Voyage AI:</strong> <a href="https://dash.voyageai.com/api-keys" target="_blank" className="underline">dash.voyageai.com</a></p>
                    <p><strong>Google:</strong> <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="underline">console.cloud.google.com</a></p>
                    <p><strong>Jina AI:</strong> <a href="https://jina.ai/api-keys" target="_blank" className="underline">jina.ai/api-keys</a></p>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          {/* n8n Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                n8n Integration
              </CardTitle>
              <CardDescription>
                Workflow otomasyon bağlantı ayarları
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">n8n URL</label>
                <Input
                  value={config.n8n.url}
                  onChange={(e) => updateConfig('n8n', 'url', e.target.value)}
                  placeholder="http://localhost:5678"
                />
              </div>
              <div>
                <label className="text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  value={config.n8n.apiKey}
                  onChange={(e) => updateConfig('n8n', 'apiKey', e.target.value)}
                  placeholder="n8n API key"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced">
          {/* Web Scraper Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Web Scraper
              </CardTitle>
              <CardDescription>
                Web scraping ayarları ve limitleri
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Timeout (ms)</label>
                <Input
                  type="number"
                  value={config.scraper.timeout}
                  onChange={(e) => updateConfig('scraper', 'timeout', parseInt(e.target.value))}
                  placeholder="30000"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Concurrency</label>
                <Input
                  type="number"
                  value={config.scraper.maxConcurrency}
                  onChange={(e) => updateConfig('scraper', 'maxConcurrency', parseInt(e.target.value))}
                  placeholder="3"
                />
              </div>
              <div>
                <label className="text-sm font-medium">User Agent</label>
                <Input
                  value={config.scraper.userAgent}
                  onChange={(e) => updateConfig('scraper', 'userAgent', e.target.value)}
                  placeholder="ASB Web Scraper"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="embeddings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Embedding Ayarları
              </CardTitle>
              <CardDescription>
                Text processing ve vektörleştirme parametreleri
                <div className="mt-2 p-3 bg-blue-50 rounded-md border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Not:</strong> Embedding provider ve model seçimi artık "Embedding İşlemleri" sayfasından yönetilmektedir.
                    Bu sayfada sadece diğer embedding ayarlarını (chunk size, overlap vb.) düzenleyebilirsiniz.
                  </p>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider Selection - Disabled (Managed from Embeddings Manager) */}
              <div>
                <label className="text-sm font-medium mb-2 block">Embedding Provider</label>
                <select
                  value={config.embeddings.provider}
                  disabled
                  className="w-full p-2 border rounded-md bg-gray-100 cursor-not-allowed"
                >
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openai">OpenAI (Bulut)</option>
                  <option value="mistral">Mistral (Bulut)</option>
                  <option value="huggingface">HuggingFace (Bulut)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Embedding provider'ı "Embedding İşlemleri" sayfasından yönetilir
                </p>
              </div>

              {/* Model Selection - Disabled (Managed from Embeddings Manager) */}
              <div>
                <label className="text-sm font-medium mb-2 block">Embedding Modeli</label>
                {config.embeddings.provider === 'mistral' && (
                  <select
                    value={config.embeddings.model}
                    disabled
                    className="w-full p-2 border rounded-md bg-gray-100 cursor-not-allowed"
                  >
                    <option value="mistral-embed">mistral-embed (1024 dim)</option>
                  </select>
                )}
                {config.embeddings.provider === 'openai' && (
                  <select
                    value={config.embeddings.model}
                    disabled
                    className="w-full p-2 border rounded-md bg-gray-100 cursor-not-allowed"
                  >
                    <option value="text-embedding-3-small">text-embedding-3-small (Hızlı, 1536 dim)</option>
                    <option value="text-embedding-3-large">text-embedding-3-large (Kaliteli, 3072 dim)</option>
                    <option value="text-embedding-ada-002">text-embedding-ada-002 (Klasik, 1536 dim)</option>
                  </select>
                )}
                {config.embeddings.provider === 'ollama' && (
                  <select
                    value={config.embeddings.model}
                    disabled
                    className="w-full p-2 border rounded-md bg-gray-100 cursor-not-allowed"
                  >
                    <option value="bge-m3">bge-m3 (1024 dim)</option>
                    <option value="e5-mistral-7b-instruct">e5-mistral-7b-instruct (4096 dim)</option>
                    <option value="nomic-embed-text">nomic-embed-text (768 dim)</option>
                    <option value="mxbai-embed-large">mxbai-embed-large (1024 dim)</option>
                    <option value="all-minilm">all-minilm (384 dim)</option>
                  </select>
                )}
                {config.embeddings.provider === 'huggingface' && (
                  <select
                    value={config.embeddings.model}
                    disabled
                    className="w-full p-2 border rounded-md bg-gray-100 cursor-not-allowed"
                  >
                    <option value="sentence-transformers/all-MiniLM-L6-v2">all-MiniLM-L6-v2 (384 dim)</option>
                    <option value="sentence-transformers/all-mpnet-base-v2">all-mpnet-base-v2 (768 dim)</option>
                    <option value="sentence-transformers/multi-qa-mpnet-base-dot-v1">multi-qa-mpnet-base-dot-v1 (768 dim)</option>
                    <option value="intfloat/e5-mistral-7b-instruct">e5-mistral-7b-instruct (4096 dim)</option>
                  </select>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Embedding modeli "Embedding İşlemleri" sayfasından yönetilir
                </p>
              </div>

              {/* Text Processing Settings */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Chunk Size</label>
                  <Input
                    type="number"
                    value={config.embeddings.chunkSize}
                    onChange={(e) => updateConfig('embeddings', 'chunkSize', parseInt(e.target.value) || 1000)}
                    placeholder="1000"
                    min="100"
                    max="8000"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maksimum karakter/parça
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Chunk Overlap</label>
                  <Input
                    type="number"
                    value={config.embeddings.chunkOverlap}
                    onChange={(e) => updateConfig('embeddings', 'chunkOverlap', parseInt(e.target.value) || 200)}
                    placeholder="200"
                    min="0"
                    max="1000"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Örtüşme miktarı
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Batch Size</label>
                  <Input
                    type="number"
                    value={config.embeddings.batchSize}
                    onChange={(e) => updateConfig('embeddings', 'batchSize', parseInt(e.target.value) || 10)}
                    placeholder="10"
                    min="1"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    API çağrısı/grup
                  </p>
                </div>
              </div>

              {/* Provider-specific Settings */}
              {config.embeddings.provider === 'ollama' && (
                <div>
                  <label className="text-sm font-medium">Ollama Base URL</label>
                  <Input
                    value={config.llmSettings.ollamaBaseUrl || 'http://localhost:11434'}
                    onChange={(e) => updateConfig('llmSettings', 'ollamaBaseUrl', e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Ollama servisinin çalıştığı adres
                  </p>
                </div>
              )}

              {config.embeddings.provider === 'huggingface' && (
                <div>
                  <label className="text-sm font-medium">HuggingFace API Key</label>
                  <Input
                    type="password"
                    value={config.huggingface.apiKey}
                    onChange={(e) => updateConfig('huggingface', 'apiKey', e.target.value)}
                    placeholder="hf_..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    HuggingFace API anahtarı (isteğe bağlı)
                  </p>
                </div>
              )}

              {/* Advanced Settings */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="text-sm font-medium mb-3">Gelişmiş Ayarlar</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="normalize-embeddings"
                      checked={config.embeddings.normalizeEmbeddings || false}
                      onChange={(e) => updateConfig('embeddings', 'normalizeEmbeddings', e.target.checked)}
                    />
                    <label htmlFor="normalize-embeddings" className="text-sm">
                      Vektörleri normalize et (L2 normalization)
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="cache-embeddings"
                      checked={config.embeddings.cacheEmbeddings !== false}
                      onChange={(e) => updateConfig('embeddings', 'cacheEmbeddings', e.target.checked)}
                    />
                    <label htmlFor="cache-embeddings" className="text-sm">
                      Embedding'leri Redis'te cache'le
                    </label>
                  </div>
                </div>
              </div>

              {/* Test Button */}
              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    setTesting('embedding');
                    try {
                      const response = await fetch('http://localhost:8083/api/v2/settings/embedding/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          embeddingProvider: config.embeddings.provider,
                          embeddingModel: config.embeddings.model,
                          ollamaBaseUrl: config.llmSettings.ollamaBaseUrl,
                          huggingfaceApiKey: config.huggingface.apiKey
                        }),
                      });
                      const result = await response.json();

                      if (result.success) {
                        toast({
                          title: "Bağlantı Başarılı",
                          description: result.message,
                          duration: 3000,
                        });
                      } else {
                        toast({
                          title: "Bağlantı Başarısız",
                          description: result.error || 'Embedding servisi test edilemedi.',
                          variant: "destructive",
                          duration: 4000,
                        });
                      }
                    } catch (error) {
                      toast({
                        title: "Test Hatası",
                        description: 'Embedding servisiyle iletişim kurulamadı.',
                        variant: "destructive",
                        duration: 3000,
                      });
                    } finally {
                      setTesting(null);
                    }
                  }}
                  disabled={testing === 'embedding'}
                  variant="outline"
                  size="sm"
                >
                  {testing === 'embedding' ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                </Button>
              </div>

              {/* Current Optimal Settings */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-lg border border-blue-200">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-600" />
                  Modelinize Göre Optimal Ayarlar
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                    <div className="font-medium text-gray-600 dark:text-gray-400">Chunk Size</div>
                    <div className="text-lg font-semibold text-blue-600">{config.embeddings.chunkSize}</div>
                    <div className="text-xs text-gray-500">karakter/parça</div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                    <div className="font-medium text-gray-600 dark:text-gray-400">Chunk Overlap</div>
                    <div className="text-lg font-semibold text-purple-600">{config.embeddings.chunkOverlap}</div>
                    <div className="text-xs text-gray-500">örtüşme</div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                    <div className="font-medium text-gray-600 dark:text-gray-400">Batch Size</div>
                    <div className="text-lg font-semibold text-green-600">{config.embeddings.batchSize}</div>
                    <div className="text-xs text-gray-500">API çağrısı/grup</div>
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                  💡 Bu ayarlar seçtiğiniz model için otomatik optimize edilmiştir. İhtiyaçlarınıza göre manuel olarak ayarlayabilirsiniz.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chatbot Settings Tab */}
        <TabsContent value="chatbot" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Chatbot Appearance
                  </CardTitle>
                  <CardDescription>
                    Customize chatbot title, messages and appearance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Chatbot Title</Label>
                    <Input
                      value={chatbotSettings.title}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, title: e.target.value })}
                      placeholder="e.g., Assistant"
                    />
                  </div>
                  
                  <div>
                    <Label>Logo URL</Label>
                    <Input
                      value={chatbotSettings.logoUrl}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, logoUrl: e.target.value })}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  
                  <div>
                    <Label>Welcome Message</Label>
                    <Textarea
                      value={chatbotSettings.welcomeMessage}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, welcomeMessage: e.target.value })}
                      placeholder="Welcome message for users..."
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <Label>Input Placeholder</Label>
                    <Input
                      value={chatbotSettings.placeholder}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, placeholder: e.target.value })}
                      placeholder="e.g., Type your question..."
                    />
                  </div>

                  <div>
                    <Label>Primary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={chatbotSettings.primaryColor}
                        onChange={(e) => setChatbotSettings({ ...chatbotSettings, primaryColor: e.target.value })}
                        className="w-20 h-10"
                      />
                      <Input
                        value={chatbotSettings.primaryColor}
                        onChange={(e) => setChatbotSettings({ ...chatbotSettings, primaryColor: e.target.value })}
                        placeholder="#3B82F6"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSaveChatbot} disabled={savingChatbot}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingChatbot ? 'Saving...' : 'Save Chatbot Settings'}
                  </Button>
                </CardContent>
              </Card>

              {/* AI Provider Priority */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    AI Provider Priority
                  </CardTitle>
                  <CardDescription>
                    Choose which AI providers to use for chat responses and their priority order
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground mb-4">
                    Drag and drop to reorder priority. The system will try providers in order from top to bottom.
                  </div>

                  <div className="space-y-2">
                    {aiProviderPriority.map((provider, index) => (
                      <div
                        key={provider}
                        className="flex items-center gap-3 p-3 border rounded-lg bg-background"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm font-medium w-20">
                            {provider === 'gemini' && 'Gemini'}
                            {provider === 'claude' && 'Claude'}
                            {provider === 'openai' && 'OpenAI'}
                            {provider === 'fallback' && 'Demo'}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {index + 1}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveProviderUp(index)}
                            disabled={index === 0}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveProviderDown(index)}
                            disabled={index === aiProviderPriority.length - 1}
                          >
                            ↓
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <Button onClick={handleSaveAiProviderPriority} disabled={savingAiProvider}>
                      <Save className="mr-2 h-4 w-4" />
                      {savingAiProvider ? 'Saving...' : 'Save Priority'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Gemini Model Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Gemini Model Settings
                  </CardTitle>
                  <CardDescription>
                    Choose which Gemini model to use for chat responses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label> Gemini Model</Label>
                    <Select
                      value={geminiModel}
                      onValueChange={setGeminiModel}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Gemini model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</SelectItem>
                        <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro (Powerful)</SelectItem>
                        <SelectItem value="gemini-pro">Gemini Pro (Legacy)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Flash is faster and good for most use cases, Pro is more capable
                    </p>
                  </div>

                  <div>
                    <Button onClick={handleSaveGeminiModel} disabled={savingGeminiModel}>
                      <Save className="mr-2 h-4 w-4" />
                      {savingGeminiModel ? 'Saving...' : 'Save Model'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Suggestion Cards
                  </CardTitle>
                  <CardDescription>
                    Edit suggestion cards shown to users
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium">Suggestion {index + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSuggestion(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-2">
                          <Input
                            value={suggestion.icon}
                            onChange={(e) => updateSuggestion(index, 'icon', e.target.value)}
                            placeholder="📚"
                            className="text-center"
                          />
                        </div>
                        <div className="col-span-4">
                          <Input
                            value={suggestion.title}
                            onChange={(e) => updateSuggestion(index, 'title', e.target.value)}
                            placeholder="Title"
                          />
                        </div>
                        <div className="col-span-6">
                          <Input
                            value={suggestion.description}
                            onChange={(e) => updateSuggestion(index, 'description', e.target.value)}
                            placeholder="Description"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <Button
                    variant="outline"
                    onClick={addSuggestion}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Suggestion
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Preview */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                    <div className="text-center">
                      <div 
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
                        style={{ backgroundColor: chatbotSettings.primaryColor }}
                      >
                        <Bot className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-bold mb-2">
                        {chatbotSettings.title || 'Chatbot Title'}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {chatbotSettings.welcomeMessage || 'Welcome message'}
                      </p>
                      {suggestions.length > 0 && (
                        <div className="space-y-2 text-left">
                          {suggestions.slice(0, 3).map((suggestion, index) => (
                            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow border text-sm">
                              <p className="font-medium">
                                {suggestion.icon} {suggestion.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {suggestion.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Prompts Tab */}
        <TabsContent value="prompts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                System Prompts
              </CardTitle>
              <CardDescription>
                Yapay zeka modelinin davranışını ve RAG'e ne kadar sadık kalacağını yöneten ana talimatlar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* System Prompt */}
              <div>
                <Label htmlFor="system-prompt-textarea">System Prompt (RAG Talimatı)</Label>
                <Textarea
                  id="system-prompt-textarea"
                  value={config.llmSettings.systemPrompt}
                  onChange={(e) => updateConfig('llmSettings', 'systemPrompt', e.target.value)}
                  placeholder="LLM'e RAG context'i nasıl kullanacağını anlatan prompt..."
                  className="h-40 text-xs font-mono"
                />
              </div>

              {/* Temperature Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Temperature: {config.llmSettings.temperature.toFixed(1)}</Label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={[config.llmSettings.temperature]}
                    onValueChange={(value) => updateConfig('llmSettings', 'temperature', value[0])}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    0 = Deterministik, 1 = Yaratıcı
                  </p>
                </div>

                <div>
                  <Label>Max Tokens: {config.llmSettings.maxTokens}</Label>
                   <Slider
                    min={256}
                    max={8192}
                    step={256}
                    value={[config.llmSettings.maxTokens]}
                    onValueChange={(value) => updateConfig('llmSettings', 'maxTokens', value[0])}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maksimum yanıt uzunluğu
                  </p>
                </div>
              </div>
               <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Tüm prompt ayarları, sağ üst köşedeki ana "Kaydet" butonu ile kaydedilir.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
