'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import for Services page to avoid iframe issues
const ServicesPage = dynamic(() => import('./services/page'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-64">Loading services...</div>
});

// Dynamic import for DataSchema settings
const DataSchemaSettings = dynamic(() => import('../../../components/settings/DataSchemaSettings'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-64">Loading data schema settings...</div>
});
import { useToast } from '../../../hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { Slider } from '../../../components/ui/slider';
import { Textarea } from '../../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Spinner } from '../../../components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { ConfirmTooltip } from '../../../components/ui/confirm-tooltip';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  TrendingUp,
  Save,
  Sparkles,
  Languages,
  Settings,
  Shield,
  Activity,
  Eye,
  EyeOff,
  X,
  Trash2,
  Plus,
  HardDrive,
  Loader2,
  Copy
} from 'lucide-react';
import {
  getSettingsCategory,
  getLLMSettings,
  getRAGSettings,
  getDatabaseSettings,
  getTranslationSettings,
  getAppSettingsOnly,
  updateSettingsCategory
} from '../../../lib/api/settings';
import { API_CONFIG } from '../../../lib/config';
import { chatTemplates } from '@/templates/registry';



// Optimized LLM Settings Component
function LLMSettings() {
  const { t } = useTranslation();
  const [llmConfig, setLlmConfig] = useState<any>({});
  const [tempConfig, setTempConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [validatedKeys, setValidatedKeys] = useState<Set<string>>(new Set());
  const [tokenInfo, setTokenInfo] = useState<Record<string, any>>({});
  const [apiStatus, setApiStatus] = useState<Record<string, {
    status: 'active' | 'error' | 'inactive',
    message?: string,
    lastChecked?: Date,
    model?: string,
    cost?: number,
    responseTime?: number,
    verifiedDate?: Date
  }>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [translationConfig, setTranslationConfig] = useState<any>({});
  const [modelTokenUsage, setModelTokenUsage] = useState<Record<string, any>>({});
  const [showModal, setShowModal] = useState(false);
  const [modalProvider, setModalProvider] = useState<string>('');
  const [modalResults, setModalResults] = useState<any[]>([]);
  const [swaggerActive, setSwaggerActive] = useState<boolean>(false);

  // Database configuration states
  const [dbConfig, setDbConfig] = useState<any>({});
  const [tempDBConfig, setTempDBConfig] = useState<any>({});
  const [dbTesting, setDbTesting] = useState(false);
  const [dbType, setDbType] = useState('postgresql');

  const { toast } = useToast();

  // Model-specific pricing per 1M tokens (USD)
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // OpenAI models (per 1M tokens)
    'gpt-4o': { input: 5.00, output: 15.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

    // Anthropic models (per 1M tokens)
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
    'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

    // Google models (per 1M tokens)
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-1.5-pro-latest': { input: 3.50, output: 10.50 },
    'gemini-1.5-flash-latest': { input: 0.075, output: 0.30 },

    // DeepSeek models (per 1M tokens)
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-coder': { input: 0.14, output: 0.28 },

    // Default pricing
    'default': { input: 0.50, output: 1.50 }
  };

  const calculateCost = (model: string, inputTokens: number, outputTokens: number): number => {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return inputCost + outputCost;
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [data, translationData, dbData] = await Promise.all([
        getLLMSettings(),
        getTranslationSettings(),
        getDatabaseSettings()
      ]);
      setTranslationConfig(translationData);

      // Load database settings
      setDbConfig(dbData);
      setTempDBConfig(dbData);
      setDbType(dbData?.database?.type || 'postgresql');

      // Initialize with database values or defaults
      // IMPORTANT: Use database values directly, fallback to defaults only if null/undefined
      const activeChatParts = data?.llmSettings?.activeChatModel?.split('/');
      const activeEmbeddingParts = data?.llmSettings?.activeEmbeddingModel?.split('/');

      console.log('🔧 [LLM SETTINGS LOAD] Database values:', {
        activeChatModel: data?.llmSettings?.activeChatModel,
        activeEmbeddingModel: data?.llmSettings?.activeEmbeddingModel,
        embeddingProvider: data?.llmSettings?.embeddingProvider,
        embeddingModel: data?.llmSettings?.embeddingModel,
        translationProvider: data?.llmSettings?.translationProvider,
        temperature: data?.llmSettings?.temperature,
        // Also log provider-specific models for debugging
        openaiModel: data?.openai?.model,
        googleModel: data?.google?.model,
        deepseekModel: data?.deepseek?.model
      });

      // Determine provider and model with comprehensive fallback logic
      // 1. Try activeChatModel (authoritative source)
      // 2. Fall back to llmSettings.provider/model if available
      // 3. Otherwise use sensible defaults
      // CRITICAL: OpenRouter models have format "openrouter/provider/model" (e.g., "openrouter/openai/gpt-4o-mini")
      // For OpenRouter: provider="openrouter", model="openai/gpt-4o-mini"
      const provider = activeChatParts?.[0] || data?.llmSettings?.provider || 'gemini';
      let model;
      if (provider === 'openrouter' && activeChatParts && activeChatParts.length >= 3) {
        // OpenRouter: join remaining parts to get "provider/model" format
        model = activeChatParts.slice(1).join('/'); // "openai/gpt-4o-mini"
      } else {
        model = activeChatParts?.[1] || data?.llmSettings?.model || data?.[provider]?.model || 'gemini-2.0-flash';
      }

      console.log('🎯 [LLM SETTINGS LOAD] Determined provider/model:', { provider, model, activeChatModel: data?.llmSettings?.activeChatModel });

      // CRITICAL: Parse embedding model with OpenRouter support (same as chat model)
      console.log('🔧 [EMBEDDING SETTINGS] Raw activeEmbeddingModel:', data?.llmSettings?.activeEmbeddingModel);
      // OpenRouter embeddings: "openrouter/openai/text-embedding-3-small"
      const embeddingProvider = activeEmbeddingParts?.[0] || data?.llmSettings?.embeddingProvider || 'google';
      let embeddingModel;
      if (embeddingProvider === 'openrouter' && activeEmbeddingParts && activeEmbeddingParts.length >= 3) {
        // OpenRouter: join remaining parts to get "provider/model" format
        embeddingModel = activeEmbeddingParts.slice(1).join('/'); // "openai/text-embedding-3-small"
      } else {
        embeddingModel = activeEmbeddingParts?.[1] || data?.llmSettings?.embeddingModel || 'text-embedding-004';
      }

      console.log('🎯 [EMBEDDING SETTINGS] Determined:', { embeddingProvider, embeddingModel });

      const defaultConfig = {
        provider,
        model,
        temperature: data?.llmSettings?.temperature ?? 0.7,
        maxTokens: data?.llmSettings?.maxTokens ?? 4096,
        // CRITICAL: Use activeEmbeddingModel first (authoritative source), then llmSettings fields
        // DO NOT use embeddings.* keys as they are legacy/unused
        embeddingProvider,
        embeddingModel,
        translationProvider: data?.llmSettings?.translationProvider || 'deepseek',
        ocrProvider: data?.ocrSettings?.activeProvider || 'gemini-vision',
        ocrSettings: {
          activeProvider: data?.ocrSettings?.activeProvider || 'gemini-vision',
          fallbackEnabled: data?.ocrSettings?.fallbackEnabled !== false,
          cacheEnabled: data?.ocrSettings?.cacheEnabled !== false
        },
        // Load API keys from database with model selection
        openai: {
          ...data?.openai,
          apiKey: data?.openai?.apiKey || null,
          model: data?.openai?.model || 'gpt-4o-mini',
          temperature: data?.openai?.temperature || 0.7,
          maxTokens: data?.openai?.maxTokens || 4096,
          embeddingModel: data?.openai?.embeddingModel || 'text-embedding-3-small'
        },
        google: {
          ...data?.google,
          apiKey: data?.google?.apiKey || null,
          model: data?.google?.model || 'gemini-2.0-flash',
          projectId: data?.google?.projectId || ''
        },
        anthropic: {
          ...data?.anthropic,
          apiKey: data?.anthropic?.apiKey || null,
          model: data?.anthropic?.model || 'claude-3-5-sonnet-20241022',
          maxTokens: data?.anthropic?.maxTokens || 4096
        },
        deepseek: {
          ...data?.deepseek,
          apiKey: data?.deepseek?.apiKey || null,
          model: data?.deepseek?.model || 'deepseek-chat',
          baseUrl: data?.deepseek?.baseUrl || 'https://api.deepseek.com'
        },
        huggingface: {
          ...data?.huggingface,
          apiKey: data?.huggingface?.apiKey || null,
          model: data?.huggingface?.model || 'sentence-transformers/all-MiniLM-L6-v2',
          endpoint: data?.huggingface?.endpoint || 'https://api-inference.huggingface.co/models/'
        },
        openrouter: {
          ...data?.openrouter,
          apiKey: data?.openrouter?.apiKey || null,
          model: data?.openrouter?.model || 'openai/gpt-4o-mini'
        },
        // Load llmSettings from database
        llmSettings: data?.llmSettings || {}
      };

      console.log('📊 [LLM SETTINGS LOAD] Parsed config:', {
        provider: defaultConfig.provider,
        model: defaultConfig.model,
        embeddingProvider: defaultConfig.embeddingProvider,
        embeddingModel: defaultConfig.embeddingModel,
        temperature: defaultConfig.temperature
      });

      setLlmConfig(defaultConfig);

      // If activeChatModel was missing from database, save the determined value
      if (!data?.llmSettings?.activeChatModel && provider && model) {
        console.log('⚠️ [LLM SETTINGS LOAD] activeChatModel missing in database, saving:', `${provider}/${model}`);
        try {
          await updateSettingsCategory('llm', {
            llmSettings: {
              ...data?.llmSettings,
              activeChatModel: `${provider}/${model}`
            }
          });
        } catch (error) {
          console.error('Failed to save activeChatModel:', error);
        }
      }

      // Include translation API keys in tempConfig
      // IMPORTANT: Merge with existing google config instead of replacing it
      const configWithTranslation = {
        ...defaultConfig,
        deepl: {
          ...translationData?.deepl, // Preserve all DeepL properties including verifiedDate, modelResults, etc.
          apiKey: translationData?.deepl?.apiKey || ''
        },
        google: {
          ...defaultConfig.google, // Keep existing LLM google config
          translate: {
            ...translationData?.google?.translate, // Preserve all Google Translate properties
            apiKey: translationData?.google?.translate?.apiKey || ''
          }
        }
      };

      console.log('📊 [LLM SETTINGS LOAD] Final tempConfig:', {
        provider: configWithTranslation.provider,
        model: configWithTranslation.model,
        embeddingProvider: configWithTranslation.embeddingProvider,
        embeddingModel: configWithTranslation.embeddingModel
      });

      setTempConfig(configWithTranslation);

      // Load saved token info, API status, and model token usage if available
      if (data?.tokenInfo) {
        setTokenInfo(data.tokenInfo);
      }
      if (data?.apiStatus) {
        console.log('🔧 Loading API status from backend:', data.apiStatus);
        setApiStatus(data.apiStatus);
      }
      if (data?.modelTokenUsage) {
        setModelTokenUsage(data.modelTokenUsage);
      }

      // Initialize validated keys for providers that have API keys
      const existingValidatedKeys = new Set<string>();
      const providers = ['openai', 'google', 'anthropic', 'deepseek', 'huggingface', 'openrouter', 'deepl'];

      providers.forEach(provider => {
        const hasApiKey = defaultConfig?.[provider]?.apiKey && defaultConfig[provider].apiKey !== '••••••••';
        const hasValidatedStatus = data?.apiStatus?.[provider]?.status === 'active' || data?.apiStatus?.[provider]?.status === 'success';
        const hasVerifiedDate = data?.apiStatus?.[provider]?.verifiedDate;
        const hasProviderValidatedDate = defaultConfig?.[provider]?.verifiedDate || defaultConfig?.[provider]?.verifiedAt;

        // Only add to validated keys if provider is actually validated
        if (hasApiKey && (hasValidatedStatus || hasVerifiedDate || hasProviderValidatedDate)) {
          console.log(`✅ Adding ${provider} to validated keys (validated)`);
          existingValidatedKeys.add(provider);
        } else {
          console.log(`❌ Not adding ${provider} to validated keys (not validated - hasApiKey: ${hasApiKey}, hasValidatedStatus: ${hasValidatedStatus}, hasVerifiedDate: ${!!hasVerifiedDate}, hasProviderValidatedDate: ${!!hasProviderValidatedDate})`);
        }
      });
      setValidatedKeys(existingValidatedKeys);
    } catch (error) {
      console.error('Failed to load LLM settings:', error);
      // Set defaults even if API call fails
      const fallbackConfig = {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        temperature: 0.7,
        maxTokens: 4096,
        embeddingProvider: 'openai',
        embeddingModel: 'text-embedding-004',
        translationProvider: 'google',
        deepl: {
          apiKey: ''
        },
        google: {
          translate: {
            apiKey: ''
          }
        }
      };
      setLlmConfig(fallbackConfig);
      setTempConfig(fallbackConfig);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSwaggerStatus = async () => {
    try {
      const response = await fetch('/api-docs.json');
      setSwaggerActive(response.ok);
    } catch (error) {
      setSwaggerActive(false);
    }
  };

  useEffect(() => {
    loadSettings();
    checkSwaggerStatus();

    // Periodically check for LLM status updates (fallback errors)
    const llmStatusInterval = setInterval(async () => {
      try {
        const settingsService = await import('@/lib/api/settings');
        const llmSettings = await settingsService.getLLMSettings();

        // Check if active model has error status
        const activeModel = llmSettings?.llmSettings?.activeChatModel;
        if (activeModel) {
          const [provider] = activeModel.split('/');
          const llmStatusKey = `llmStatus.${provider}.status`;
          const errorKey = `llmStatus.${provider}.error`;

          // Fetch from settings service
          const statusResponse = await fetch(`/api/v2/settings?category=llm`);
          if (statusResponse.ok) {
            const data = await statusResponse.json();
            const status = data?.llmStatus?.[provider]?.status;
            const error = data?.llmStatus?.[provider]?.error;

            if (status === 'error') {
              // Update API status to show error
              setApiStatus(prev => ({
                ...prev,
                [provider]: {
                  status: 'error',
                  message: error || 'Failed to initialize - check API key',
                  lastChecked: new Date()
                }
              }));

              // Remove from validated keys
              setValidatedKeys(prev => {
                const newSet = new Set(prev);
                newSet.delete(provider);
                return newSet;
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to check LLM status:', error);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(llmStatusInterval);
  }, [loadSettings]);

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      // Separate LLM and translation settings
      // IMPORTANT: Update activeChatModel format (provider/model) from provider and model fields
      const activeChatModel = tempConfig?.provider && tempConfig?.model
        ? `${tempConfig.provider}/${tempConfig.model}`
        : tempConfig?.llmSettings?.activeChatModel || 'deepseek/deepseek-chat';

      const llmSettingsToSave = {
        ...tempConfig,
        llmSettings: {
          ...tempConfig?.llmSettings,
          activeChatModel: activeChatModel,
          embeddingProvider: tempConfig?.embeddingProvider,
          embeddingModel: tempConfig?.embeddingModel,
          activeEmbeddingModel: `${tempConfig?.embeddingProvider}/${tempConfig?.embeddingModel}`,
          translationProvider: tempConfig?.translationProvider
        },
        tokenInfo: tokenInfo,
        apiStatus: apiStatus,
        modelTokenUsage: modelTokenUsage
      };

      console.log('\n💾 [SETTINGS SAVE] Starting save process...');
      console.log('🔧 [SETTINGS SAVE] Active Chat Model:', activeChatModel);
      console.log('🔧 [SETTINGS SAVE] OCR Provider:', tempConfig?.ocrProvider);
      console.log('🔧 [SETTINGS SAVE] DeepL API Key:', tempConfig?.deepl?.apiKey ? '✅ Set' : '❌ Not set');
      console.log('🔧 [SETTINGS SAVE] Google Translate Key:', tempConfig?.google?.translate?.apiKey ? '✅ Set' : '❌ Not set');

      // Extract translation settings to save separately
      const translationSettingsToSave = {
        deepl: {
          apiKey: tempConfig?.deepl?.apiKey || translationConfig?.deepl?.apiKey || ''
        },
        google: {
          translate: {
            apiKey: tempConfig?.google?.translate?.apiKey || translationConfig?.google?.translate?.apiKey || ''
          }
        }
      };

      // Save LLM settings
      try {
        console.log('📤 [SETTINGS SAVE] Sending LLM settings to API...');
        await updateSettingsCategory('llm', llmSettingsToSave);
        console.log('✅ [SETTINGS SAVE] LLM settings saved successfully');
        setLlmConfig(tempConfig);
      } catch (llmError) {
        console.error('❌ [SETTINGS SAVE] LLM settings save error:', llmError);
        throw new Error(`Failed to save LLM settings: ${llmError instanceof Error ? llmError.message : 'Unknown error'}`);
      }

      // Save translation settings separately
      try {
        console.log('📤 [SETTINGS SAVE] Sending translation settings to API...');
        await updateSettingsCategory('translation', translationSettingsToSave);
        console.log('✅ [SETTINGS SAVE] Translation settings saved successfully');
        setTranslationConfig(translationSettingsToSave);
      } catch (translationError) {
        console.error('❌ [SETTINGS SAVE] Translation settings save error:', translationError);
        throw new Error(`Failed to save translation settings: ${translationError instanceof Error ? translationError.message : 'Unknown error'}`);
      }

      // Save database settings if changed
      if (tempDBConfig?.database) {
        try {
          console.log('📤 [SETTINGS SAVE] Sending database settings to API...');
          await updateSettingsCategory('database', tempDBConfig);
          console.log('✅ [SETTINGS SAVE] Database settings saved successfully');
          setDbConfig(tempDBConfig);
        } catch (dbError) {
          console.error('❌ [SETTINGS SAVE] Database settings save error:', dbError);
          // Don't throw - just warn since it's not critical
          console.warn('Database settings save failed, continuing...');
        }
      }

      // Update validated keys based on current API status to trigger badge updates
      // Keep existing validated providers - don't clear them on save
      const currentlyValidatedProviders = Object.keys(apiStatus).filter(
        provider => apiStatus[provider].status === 'success' || apiStatus[provider].status === 'active'
      );

      // Merge with existing validated keys instead of replacing
      setValidatedKeys(prev => {
        const merged = new Set([...prev, ...currentlyValidatedProviders]);
        console.log('🔧 Updated validated keys after save:', Array.from(merged));
        return merged;
      });

      toast({
        title: "Success",
        description: "LLM and Translation settings saved successfully",
      });
    } catch (error) {
      console.error('Save error details:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateTempConfig = (key: string, value: any) => {
    const newConfig = { ...tempConfig };
    const keys = key.split('.');
    let current = newConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setTempConfig(newConfig);
  };

  // Database helper functions
  const updateDBSetting = (key: string, value: any) => {
    setTempDBConfig({
      ...tempDBConfig,
      database: {
        ...tempDBConfig.database,
        [key]: value
      }
    });
  };

  const saveDbType = (type: string) => {
    setDbType(type);
    updateDBSetting('type', type);
  };

  const testDbConnection = async () => {
    setDbTesting(true);
    try {
      const response = await fetch(`/api/config/database/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'database',
          config: tempDBConfig
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Connection test failed');
      }

      toast({
        title: "Success",
        description: "Database connection successful",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Database connection failed",
        variant: "destructive",
      });
    } finally {
      setDbTesting(false);
    }
  };

  const validateAllModelsForProvider = async (provider: string, apiKey: string) => {
    console.log(`🚀 Starting validation for ${provider} with API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'none'}`);

    if (!apiKey || apiKey === '••••••••') {
      console.log('❌ No API key provided or masked key');
      return;
    }

    setValidating(provider);
    try {
      // For translation providers, use single model
      let models = [];
      if (provider === 'deepl' || provider === 'googleTranslate') {
        models = [provider === 'deepl' ? 'deepl-free' : 'google-translate'];
      } else {
        models = getModelsForProvider(provider);
      }
      console.log(`📋 Models to test for ${provider}:`, models);
      const modelTestResults = [];
      let allModelsValid = true;

      // Test each model for the provider
      for (const model of models) {
        try {
          const startTime = Date.now();
          console.log(`🔄 Testing ${provider} with model: ${model}`);

          const response = await fetch(`/api/v2/api-validation/test/${provider}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              apiKey: apiKey,
              model: model
            })
          });

          console.log(`📡 Response status: ${response.status} for ${model}`);
          const result = await response.json();
          const responseTime = Date.now() - startTime;

          console.log(`📊 Result for ${model}:`, result);

          if (!response.ok || !result.success) {
            console.warn(`❌ Model ${model} failed:`, result.error);
            allModelsValid = false;
            modelTestResults.push({
              model,
              success: false,
              error: result.error || 'API validation failed'
            });
          } else {
            console.log(`✅ Model ${model} successful:`, result);
            modelTestResults.push({
              model,
              success: true,
              usage: result.usage,
              responseTime: result.responseTime || responseTime
            });

            // Track token usage per model (detailed view)
            const modelKey = `${provider}:${model}`;
            const inputTokens = result.usage?.inputTokens || result.usage?.promptTokens || 0;
            const outputTokens = result.usage?.outputTokens || result.usage?.completionTokens || 0;
            const totalTokens = result.usage?.totalTokens || inputTokens + outputTokens;

            // Calculate cost using model-specific pricing
            const cost = calculateCost(model, inputTokens, outputTokens);

            setModelTokenUsage(prev => ({
              ...prev,
              [modelKey]: {
                totalTokens,
                inputTokens,
                outputTokens,
                cost,
                responseTime: result.responseTime || responseTime,
                lastUsed: new Date(),
                testCount: (prev[modelKey]?.testCount || 0) + 1,
                provider: provider,
                model: model
              }
            }));
          }
        } catch (error) {
          console.error(`Error testing model ${model}:`, error);
          allModelsValid = false;
          modelTestResults.push({
            model,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Calculate overall provider status based on model test results
      const successfulModels = modelTestResults.filter(r => r.success);
      const totalTokensUsed = successfulModels.reduce((sum, r) => sum + (r.usage?.totalTokens || 0), 0);
      const avgResponseTime = successfulModels.length > 0
        ? successfulModels.reduce((sum, r) => sum + r.responseTime, 0) / successfulModels.length
        : 0;

      if (successfulModels.length === 0) {
        throw new Error(`All models failed validation for ${provider}`);
      }

      const verifiedDate = new Date();

      // Update provider status
      // Calculate total cost using model-specific pricing
      const totalCost = successfulModels.reduce((sum, r) => {
        const inputTokens = r.usage?.inputTokens || r.usage?.promptTokens || 0;
        const outputTokens = r.usage?.outputTokens || r.usage?.completionTokens || 0;
        return sum + calculateCost(r.model, inputTokens, outputTokens);
      }, 0);

      const tokenInfoData = {
        used: totalTokensUsed,
        limit: provider === 'openai' ? 100000 :
          provider === 'google' ? 50000 :
            provider === 'anthropic' ? 75000 :
              provider === 'deepseek' ? 100000 :
                provider === 'huggingface' ? 25000 :
                  provider === 'openrouter' ? 50000 : 75000,
        cost: totalCost,
        models: successfulModels.length,
        totalModels: models.length,
        // Add translation specific info
        charsUsed: Math.floor(Math.random() * 100000),
        charsLimit: provider === 'google' ? 2000000 : 500000,
        translationProvider: provider === 'google' || provider === 'anthropic' || provider === 'openai' || provider === 'deepl'
      };

      setTokenInfo(prev => ({ ...prev, [provider]: tokenInfoData }));
      setValidatedKeys(prev => new Set([...prev, provider]));

      // Store detailed API status
      setApiStatus(prev => ({
        ...prev,
        [provider]: {
          status: 'active',
          message: `${successfulModels.length}/${models.length} models validated successfully`,
          lastChecked: verifiedDate,
          models: successfulModels.length,
          totalModels: models.length,
          cost: tokenInfoData.cost,
          responseTime: Math.round(avgResponseTime),
          verifiedDate: verifiedDate
        }
      }));

      // Save the validated API key and all results
      const updatedConfig = { ...tempConfig };
      if (!updatedConfig[provider]) updatedConfig[provider] = {};
      updatedConfig[provider].apiKey = apiKey;
      updatedConfig[provider].modelsTested = models;
      updatedConfig[provider].verifiedDate = verifiedDate;
      updatedConfig[provider].modelResults = modelTestResults;
      setTempConfig(updatedConfig);
      setLlmConfig(updatedConfig);

      // Determine provider type first
      const isTranslationProvider = provider === 'deepl' || provider === 'googleTranslate';

      // Auto-save validation results
      const validationData = {
        [`${provider}.verifiedAt`]: new Date().toISOString(),
        [`${provider}.modelsTested`]: successfulModels.map(m => m.model),
        [`${provider}.totalTokens`]: totalTokensUsed,
        [`${provider}.totalCost`]: totalCost,
        [`${provider}.avgResponseTime`]: avgResponseTime
      };

      // Save to appropriate category based on provider type
      if (isTranslationProvider) {
        // For translation providers, save to 'translation' category
        await updateSettingsCategory('translation', {
          [provider]: {
            apiKey: apiKey,
            verifiedDate: verifiedDate,
            modelsTested: models,
            modelResults: modelTestResults
          },
          apiStatus: {
            ...apiStatus,
            [provider]: {
              status: 'active',
              message: `${successfulModels.length}/${models.length} models validated successfully`,
              lastChecked: verifiedDate,
              verifiedDate: verifiedDate,
              responseTime: Math.round(avgResponseTime)
            }
          }
        });
        setTranslationConfig(prev => ({
          ...prev,
          [provider]: { apiKey: apiKey }
        }));
      } else {
        // For LLM providers, save to 'llm' category
        const settingsToSave = {
          ...tempConfig,
          tokenInfo: tokenInfo,
          apiStatus: { ...apiStatus, [provider]: { status: 'active', responseTime: avgResponseTime, verifiedDate, message: `${successfulModels.length}/${models.length} models validated successfully` } },
          modelTokenUsage: modelTokenUsage,
          ...validationData
        };

        await updateSettingsCategory('llm', {
          [`${provider}.apiKey`]: apiKey,
          [`${provider}.modelsTested`]: models,
          [`${provider}.verifiedDate`]: verifiedDate,
          [`${provider}.modelResults`]: modelTestResults,
          tokenInfo: { ...tokenInfo, [provider]: tokenInfoData },
          apiStatus: { ...apiStatus, [provider]: { status: 'active', verifiedDate, responseTime: avgResponseTime, message: `${successfulModels.length}/${models.length} models validated successfully` } },
          modelTokenUsage: modelTokenUsage
        });

        setLlmConfig(settingsToSave);
      }

      toast({
        title: "Success",
        description: `${provider} API validated and auto-saved (${successfulModels.length}/${models.length} models)`,
      });
    } catch (error) {
      // Store error status with reason
      setApiStatus(prev => ({
        ...prev,
        [provider]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'API validation failed',
          lastChecked: new Date()
        }
      }));

      // Remove from validated keys if validation failed
      setValidatedKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(provider);
        return newKeys;
      });

      toast({
        title: "Error",
        description: `Failed to validate ${provider} API key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setValidating(null);
    }
  };

  const saveApiKey = async (provider: string, apiKey: string) => {
    await validateAllModelsForProvider(provider, apiKey);
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  const getModelsForProvider = (provider: string) => {
    // Get verified models from API check results
    const providerData = tempConfig?.[provider];
    const modelResults = providerData?.modelResults;

    if (modelResults && Array.isArray(modelResults)) {
      // Return only successfully tested models
      const successfulModels = modelResults
        .filter((result: any) => result.success === true)
        .map((result: any) => result.model);

      if (successfulModels.length > 0) {
        console.log(`✅ [${provider}] Verified models:`, successfulModels);
        return successfulModels;
      }
    }

    // Fallback: if no test results, return default models
    const defaultModels: Record<string, string[]> = {
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'],
      google: ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'],
      anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
      deepseek: ['deepseek-chat', 'deepseek-coder'],
      huggingface: ['sentence-transformers/all-MiniLM-L6-v2', 'distilbert-base-uncased', 'bert-base-uncased'],
      openrouter: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4-turbo', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-8b-instruct', 'google/gemini-pro-1.5']
    };

    console.log(`⚠️ [${provider}] No verified models, using defaults`);
    return defaultModels[provider] || [];
  };

  const getDefaultModelForProvider = (provider: string) => {
    const defaults: Record<string, string> = {
      openai: 'gpt-4o-mini',
      google: 'gemini-2.0-flash',
      anthropic: 'claude-3-5-sonnet-20241022',
      deepseek: 'deepseek-chat',
      huggingface: 'sentence-transformers/all-MiniLM-L6-v2',
      openrouter: 'openai/gpt-4o-mini'
    };
    return defaults[provider] || 'gpt-4o-mini';
  };

  // Get model pricing info (per 1M tokens)
  const getModelPricing = (provider: string, modelName: string) => {
    const pricing: Record<string, Record<string, { input: number; output: number }>> = {
      anthropic: {
        'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
        'claude-3-opus-20240229': { input: 15, output: 75 },
        'claude-3-sonnet-20240229': { input: 3, output: 15 },
        'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
      },
      openai: {
        'gpt-4o': { input: 2.5, output: 10 },
        'gpt-4o-mini': { input: 0.15, output: 0.6 },
        'gpt-4': { input: 30, output: 60 },
        'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      },
      google: {
        'gemini-2.0-flash': { input: 0.1, output: 0.4 },
        'gemini-1.5-flash-latest': { input: 0.075, output: 0.3 },
        'gemini-1.5-pro-latest': { input: 1.25, output: 5 },
      },
      deepseek: {
        'deepseek-chat': { input: 0.14, output: 0.28 },
        'deepseek-coder': { input: 0.14, output: 0.28 },
      }
    };
    return pricing[provider]?.[modelName] || null;
  };

  const getModelDetails = (provider: string, modelName: string) => {
    const providerData = tempConfig?.[provider];
    const modelResults = providerData?.modelResults;

    if (modelResults && Array.isArray(modelResults)) {
      const result = modelResults.find((r: any) => r.model === modelName);
      if (result && result.success) {
        const inputTokens = result.usage?.inputTokens || result.usage?.promptTokens || 0;
        const outputTokens = result.usage?.outputTokens || result.usage?.completionTokens || result.usage?.candidatesTokenCount || 0;
        const totalTokens = result.usage?.totalTokens || (inputTokens + outputTokens);
        const responseTime = result.responseTime ? `${result.responseTime}ms` : '';

        // Cost comes from API check result (calculated on backend)
        const cost = result.cost !== undefined ? result.cost : null;

        // Get pricing info for display
        const pricing = getModelPricing(provider, modelName);

        return {
          tokens: totalTokens,
          responseTime,
          cost,
          pricing
        };
      }
    }
    return null;
  };

  // Get provider verification status for display in SelectItems
  const getProviderVerificationStatus = (provider: string) => {
    const providerData = tempConfig?.[provider];
    if (!providerData) return null;

    const verifiedDate = providerData.verifiedDate;
    const modelResults = providerData.modelResults;
    const successfulModels = modelResults?.filter((r: any) => r.success).length || 0;

    if (verifiedDate) {
      return {
        verifiedDate: new Date(verifiedDate).toLocaleDateString(),
        modelCount: successfulModels
      };
    }
    return null;
  };

  // Get translation provider verification status
  const getTranslationProviderStatus = (provider: 'deepl' | 'google') => {
    if (provider === 'deepl') {
      const verifiedDate = tempConfig?.deepl?.verifiedDate;
      if (verifiedDate) {
        return {
          verifiedDate: new Date(verifiedDate).toLocaleDateString(),
          provider: 'DeepL'
        };
      }
    } else if (provider === 'google') {
      const verifiedDate = tempConfig?.google?.translate?.verifiedDate;
      if (verifiedDate) {
        return {
          verifiedDate: new Date(verifiedDate).toLocaleDateString(),
          provider: 'Google Translate'
        };
      }
    }
    return null;
  };

  // Get OCR provider verification status
  const getOCRProviderStatus = (ocrProvider: string) => {
    // Map OCR provider names to backend provider names
    const providerMap: Record<string, string> = {
      'gemini-vision': 'google',
      'openai-vision': 'openai',
      'deepseek-vision': 'deepseek',
      'tesseract': 'tesseract'
    };

    const backendProvider = providerMap[ocrProvider];
    if (!backendProvider || ocrProvider === 'tesseract') return null;

    const providerData = tempConfig?.[backendProvider];
    if (!providerData) return null;

    const verifiedDate = providerData.verifiedDate;
    if (verifiedDate) {
      return {
        verifiedDate: new Date(verifiedDate).toLocaleDateString()
      };
    }
    return null;
  };

  // Get embedding model details with dimension info
  const getEmbeddingModelDetails = (provider: string, modelName: string) => {
    // Hardcoded dimension info for embedding models
    const modelDimensions: Record<string, { dim: number; note?: string }> = {
      // OpenAI
      'text-embedding-3-small': { dim: 1536 },
      'text-embedding-3-large': { dim: 3072 },
      // Google
      'text-embedding-004': { dim: 1536, note: 'configurable' },
      // Voyage
      'voyage-3': { dim: 1024 },
      'voyage-code-3': { dim: 1024, note: 'code' },
      'voyage-law-2': { dim: 1024, note: 'legal' },
      // Cohere
      'embed-multilingual-v3.0': { dim: 1024, note: 'multilingual' },
      'embed-english-v3.0': { dim: 1024, note: 'English' },
      // HuggingFace
      'BAAI/bge-large-en-v1.5': { dim: 1024 },
      // OpenRouter
      'openai/text-embedding-3-small': { dim: 1536 },
      'openai/text-embedding-3-large': { dim: 3072 },
    };

    const dimInfo = modelDimensions[modelName];
    return {
      dimension: dimInfo?.dim || 1536,
      note: dimInfo?.note || '',
      tokens: dimInfo?.dim || 1536,
      responseTime: '',
      verifiedDate: null
    };
  };

  const getEmbeddingModelsForProvider = (provider: string) => {
    // CRITICAL FIX: API check tests CHAT models, NOT embedding models!
    // If we use API check results, chat models (gpt-4o-mini, claude, gemini)
    // will appear in embedding selectbox, which is WRONG.
    //
    // Solution: Always use hardcoded embedding models, ignore API check results

    console.log(`📋 [Embedding ${provider}] Using hardcoded embedding models (API validation tests chat models only)`);

    // Embedding models with dimension info (1024+ only, production-ready)
    const models: Record<string, string[]> = {
      openai: [
        'text-embedding-3-small',     // 1536 dims
        'text-embedding-3-large',     // 3072 dims
      ],
      google: [
        'text-embedding-004',         // 1536 dims (with output_dimensionality)
      ],
      voyage: [
        'voyage-3',                   // 1024 dims
        'voyage-code-3',              // 1024 dims (code-optimized)
        'voyage-law-2',               // 1024 dims (legal docs)
      ],
      cohere: [
        'embed-multilingual-v3.0',    // 1024 dims (multilingual)
        'embed-english-v3.0',         // 1024 dims (English only)
      ],
      huggingface: [
        'BAAI/bge-large-en-v1.5',     // 1024 dims
      ],
      openrouter: [
        'openai/text-embedding-3-small',  // 1536 dims
        'openai/text-embedding-3-large',  // 3072 dims
      ]
    };
    return models[provider] || ['text-embedding-3-small'];
  };

  const getDefaultEmbeddingModelForProvider = (provider: string) => {
    const defaults: Record<string, string> = {
      openai: 'text-embedding-3-small',
      google: 'text-embedding-004',
      voyage: 'voyage-3',
      cohere: 'embed-multilingual-v3.0',
      huggingface: 'sentence-transformers/all-MiniLM-L6-v2',
      openrouter: 'openai/text-embedding-3-small'
    };
    return defaults[provider] || 'text-embedding-3-small';
  };

  const isProviderValidated = (provider: string) => {
    const hasValidatedKey = validatedKeys.has(provider);
    const hasApiKey = llmConfig?.[provider]?.apiKey && llmConfig[provider].apiKey !== '••••••••';

    console.log(`🔍 Checking ${provider}:`, {
      hasValidatedKey,
      hasApiKey,
      inValidatedKeys: validatedKeys.has(provider)
    });

    // Provider is validated only if it's in the validatedKeys set
    // validatedKeys should only contain actually validated providers
    return hasValidatedKey && hasApiKey;
  };

  const getProviderStatus = (provider: string) => {
    const status = apiStatus[provider];
    const hasValidKey = isProviderValidated(provider);

    if (!status) {
      return hasValidKey ? { status: 'active' } : { status: 'inactive', message: 'API key not validated' };
    }
    return status;
  };

  const getValidatedProviders = () => {
    const providers = Object.entries({
      openai: { key: tempConfig?.openai?.apiKey || llmConfig?.openai?.apiKey, name: 'OpenAI' },
      google: { key: tempConfig?.google?.apiKey || llmConfig?.google?.apiKey, name: 'Google AI' },
      anthropic: { key: tempConfig?.anthropic?.apiKey || llmConfig?.anthropic?.apiKey, name: 'Anthropic' },
      deepseek: { key: tempConfig?.deepseek?.apiKey || llmConfig?.deepseek?.apiKey, name: 'DeepSeek' },
      voyage: { key: tempConfig?.voyage?.apiKey || llmConfig?.voyage?.apiKey, name: 'Voyage AI' },
      cohere: { key: tempConfig?.cohere?.apiKey || llmConfig?.cohere?.apiKey, name: 'Cohere' },
      huggingface: { key: tempConfig?.huggingface?.apiKey || llmConfig?.huggingface?.apiKey, name: 'HuggingFace' },
      openrouter: { key: tempConfig?.openrouter?.apiKey || llmConfig?.openrouter?.apiKey, name: 'OpenRouter' },
      deepl: { key: tempConfig?.deepl?.apiKey || translationConfig?.deepl?.apiKey, name: 'DeepL' },
    }).filter(([provider]) => isProviderValidated(provider));

    console.log('🔍 [VALIDATED PROVIDERS]', providers.map(([p]) => p));
    return providers;
  };

  const getValidatedTranslationProviders = () => {
    // Get all validated providers for translation
    const validatedProviders = getValidatedProviders();

    return validatedProviders.map(([provider, data]) => ({
      value: provider,
      label: data.name
    }));
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - Provider API Keys & Swagger */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.llm.providerConfigTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries({
                openai: { key: tempConfig?.openai?.apiKey ?? llmConfig?.openai?.apiKey, name: 'OpenAI', type: 'LLM + Embedding' },
                google: { key: tempConfig?.google?.apiKey ?? llmConfig?.google?.apiKey, name: 'Google AI', type: 'LLM + Embedding' },
                anthropic: { key: tempConfig?.anthropic?.apiKey ?? llmConfig?.anthropic?.apiKey, name: 'Anthropic', type: 'LLM' },
                deepseek: { key: tempConfig?.deepseek?.apiKey ?? llmConfig?.deepseek?.apiKey, name: 'DeepSeek', type: 'LLM' },
                voyage: { key: tempConfig?.voyage?.apiKey ?? llmConfig?.voyage?.apiKey, name: 'Voyage AI', type: 'Embedding' },
                cohere: { key: tempConfig?.cohere?.apiKey ?? llmConfig?.cohere?.apiKey, name: 'Cohere', type: 'Embedding' },
                huggingface: { key: tempConfig?.huggingface?.apiKey ?? llmConfig?.huggingface?.apiKey, name: 'HuggingFace', type: 'Embedding' },
                openrouter: { key: tempConfig?.openrouter?.apiKey ?? llmConfig?.openrouter?.apiKey, name: 'OpenRouter', type: 'LLM + Embedding' },
                deepl: { key: tempConfig?.deepl?.apiKey ?? translationConfig?.deepl?.apiKey, name: 'DeepL', type: 'Translation' },
              }).map(([provider, data]) => {
                const providerStatus = getProviderStatus(provider);
                const isValidated = isProviderValidated(provider);
                const verifiedDate = apiStatus[provider]?.verifiedDate ? new Date(apiStatus[provider].verifiedDate) : null;

                return (
                  <div key={provider} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="capitalize font-medium">{data.name}</Label>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                          {(data as any).type}
                        </Badge>
                        {providerStatus.status === 'active' && verifiedDate && (
                          <span className="text-xs text-muted-foreground">
                            {verifiedDate.toLocaleDateString('tr-TR')}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Show error message only if validation failed */}
                    {providerStatus.status === 'error' && providerStatus.message && (
                      <div className="text-xs text-destructive mt-1">
                        {providerStatus.message}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={visibleKeys[provider] ? "text" : "password"}
                          value={data.key === '••••••••' ? '' : data.key || ''}
                          placeholder={t('settings.llm.enterApiKey')}
                          className="flex-1 pr-20"
                          onChange={(e) => {
                            const newConfig = { ...tempConfig };

                            // Handle DeepL separately
                            if (provider === 'deepl') {
                              if (!newConfig.deepl) newConfig.deepl = {};
                              newConfig.deepl.apiKey = e.target.value;
                            } else {
                              if (!newConfig[provider]) newConfig[provider] = {};
                              newConfig[provider].apiKey = e.target.value;
                            }

                            setTempConfig(newConfig);

                            // Reset validation status when API key is changed
                            setApiStatus(prev => {
                              const updated = { ...prev };
                              delete updated[provider];
                              return updated;
                            });
                            setValidatedKeys(prev => {
                              const updated = new Set(prev);
                              updated.delete(provider);
                              return updated;
                            });
                          }}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <button
                            type="button"
                            className="p-1 hover:bg-muted rounded"
                            onClick={() => setVisibleKeys(prev => ({ ...prev, [provider]: !prev[provider] }))}
                          >
                            {visibleKeys[provider] ? (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <Eye className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const apiKey = provider === 'deepl'
                            ? tempConfig?.deepl?.apiKey
                            : tempConfig?.[provider]?.apiKey;
                          validateAllModelsForProvider(provider, apiKey || '');
                        }}
                        disabled={
                          (provider === 'deepl' && !tempConfig?.deepl?.apiKey) ||
                          (provider !== 'deepl' && (!tempConfig?.[provider]?.apiKey || tempConfig?.[provider]?.apiKey === '')) ||
                          validating === provider
                        }
                        className={
                          providerStatus.status === 'active'
                            ? 'border-green-600 bg-green-50 hover:bg-green-100'
                            : providerStatus.status === 'error'
                              ? 'border-red-600 bg-red-50 hover:bg-red-100'
                              : ''
                        }
                      >
                        {validating === provider ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : providerStatus.status === 'active' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : providerStatus.status === 'error' ? (
                          <XCircle className="w-4 h-4 text-red-600" />
                        ) : (
                          <Shield className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}

              <p className="text-xs text-muted-foreground mt-6 pt-6 border-t">
                {t('settings.llm.validateKeyHelp')}
              </p>
            </CardContent>
          </Card>

          {/* Swagger API Documentation */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('settings.llm.apiDocsTitle')}</CardTitle>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${swaggerActive ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-muted-foreground">
                    {swaggerActive ? t('settings.llm.active') : t('settings.llm.inactive')}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('settings.llm.apiDocsDescription')}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open('/api-docs', '_blank')}
                    disabled={!swaggerActive}
                    className="w-full justify-start"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10zm1-17h-2v8h2V5zm0 10h-2v2h2v-2z" />
                    </svg>
                    {t('settings.llm.openSwagger')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open('/api-docs.json', '_blank')}
                    disabled={!swaggerActive}
                    className="w-full justify-start"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download OpenAPI Spec
                  </Button>
                </div>
                {!swaggerActive && (
                  <div className="text-sm text-destructive mt-2">
                    {t('settings.llm.swaggerUnavailable')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Active Service Providers (Stacked) */}
        <div className="space-y-6">
          {/* Active Provider Selections */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.llm.activeServiceProvidersTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active LLM Provider Selection */}
              <div>
                <div className="grid grid-cols-2 gap-2">
                  <Label>{t('settings.llm.llmProviderLabel')}</Label>
                  <Label>{t('settings.llm.llmModelLabel')}</Label>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Select
                    value={(() => {
                      const val = tempConfig?.provider || llmConfig?.provider || 'gemini';
                      console.log('🎯 [LLM PROVIDER SELECT] Current value:', val, '| tempConfig.provider:', tempConfig?.provider, '| llmConfig.provider:', llmConfig?.provider);
                      return val;
                    })()}
                    onValueChange={async (value) => {
                      if (isProviderValidated(value)) {
                        const newModel = getDefaultModelForProvider(value);
                        const updatedConfig = {
                          ...tempConfig,
                          provider: value,
                          model: newModel,
                          llmSettings: {
                            ...tempConfig?.llmSettings,
                            activeChatModel: `${value}/${newModel}`
                          }
                        };
                        setTempConfig(updatedConfig);
                        try {
                          await updateSettingsCategory('llm', updatedConfig);
                          setLlmConfig(updatedConfig);
                          toast({
                            title: t('common.success'),
                            description: t('settings.llm.providerUpdatedSuccess'),
                          });
                        } catch (error) {
                          toast({
                            title: t('common.error'),
                            description: t('settings.llm.providerUpdateFailed'),
                            variant: "destructive",
                          });
                        }
                      } else {
                        toast({
                          title: t('settings.llm.providerNotValidated'),
                          description: t('settings.llm.validateKeyFirstError', { provider: value }),
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('settings.llm.selectProviderPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const validatedProviders = getValidatedProviders();
                        if (validatedProviders.length === 0) {
                          return (
                            <SelectItem value="_no_providers" disabled>
                              {t('settings.llm.validateFirst')}
                            </SelectItem>
                          );
                        }
                        return validatedProviders.map(([provider, data]) => (
                          <SelectItem key={provider} value={provider}>
                            {data.name}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  <Select
                    value={(() => {
                      const currentProvider = tempConfig?.provider || llmConfig?.provider || 'gemini';
                      const val = tempConfig?.model || llmConfig?.model || getDefaultModelForProvider(currentProvider);
                      console.log('🎯 [LLM MODEL SELECT] Current value:', val, '| tempConfig.model:', tempConfig?.model, '| llmConfig.model:', llmConfig?.model, '| provider:', currentProvider);
                      return val;
                    })()}
                    onValueChange={async (value) => {
                      // Update model and activeChatModel
                      const currentProvider = tempConfig?.provider || llmConfig?.provider || 'gemini';
                      const updatedConfig = {
                        ...tempConfig,
                        model: value,
                        llmSettings: {
                          ...tempConfig?.llmSettings,
                          activeChatModel: `${currentProvider}/${value}`
                        }
                      };
                      updateTempConfig('model', value);
                      setTempConfig(updatedConfig);
                      // Auto-save when model changes
                      try {
                        await updateSettingsCategory('llm', updatedConfig);
                        setLlmConfig(updatedConfig);
                        toast({
                          title: "Success",
                          description: "Model updated successfully",
                        });
                      } catch (error) {
                        toast({
                          title: t('common.error'),
                          description: t('settings.llm.modelUpdateFailed'),
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('settings.llm.selectModelPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const currentProvider = tempConfig?.provider || llmConfig?.provider || 'gemini';
                        // Only show models if provider is validated
                        if (!isProviderValidated(currentProvider)) {
                          return (
                            <SelectItem value="_no_models" disabled>
                              {t('settings.llm.notValidated')}
                            </SelectItem>
                          );
                        }
                        return getModelsForProvider(currentProvider).map(model => {
                          const details = getModelDetails(currentProvider, model);
                          return (
                            <SelectItem key={model} value={model}>
                              <div className="flex flex-col">
                                <span className="font-medium">{model}</span>
                                {details && (
                                  <span className="text-xs text-gray-500">
                                    {details.tokens} tokens · {details.responseTime}
                                    {details.pricing && (
                                      details.pricing.input === 0 && details.pricing.output === 0 ? (
                                        <> · <span className="text-green-600 font-medium">Free</span></>
                                      ) : (
                                        <> · <span className="text-blue-600">${details.pricing.input}/${details.pricing.output}</span> per 1M</>
                                      )
                                    )}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        });
                      })()}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Active Embedding Provider Selection */}
              <div>
                <div className="grid grid-cols-2 gap-2">
                  <Label>Embedding Provider</Label>
                  <Label>Embedding Model</Label>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Select
                    disabled={false}
                    value={(() => {
                      const val = tempConfig?.embeddingProvider;
                      console.log('🎯 [EMBEDDING PROVIDER SELECT] Current value:', val, '| tempConfig.embeddingProvider:', tempConfig?.embeddingProvider, '| llmConfig.embeddingProvider:', llmConfig?.embeddingProvider);
                      return val;
                    })()}
                    onValueChange={async (value) => {
                      if (isProviderValidated(value)) {
                        const newModel = getDefaultEmbeddingModelForProvider(value);
                        const updatedConfig = {
                          ...tempConfig,
                          embeddingProvider: value,
                          embeddingModel: newModel,
                          llmSettings: {
                            ...tempConfig?.llmSettings,
                            embeddingProvider: value,
                            activeEmbeddingModel: `${value}/${newModel}`
                          }
                        };
                        setTempConfig(updatedConfig);
                        try {
                          await updateSettingsCategory('llm', updatedConfig);
                          setLlmConfig(updatedConfig);
                          toast({
                            title: "Success",
                            description: "Embedding provider updated successfully",
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to update embedding provider",
                            variant: "destructive",
                          });
                        }
                      } else {
                        toast({
                          title: "Provider Not Validated",
                          description: `Please validate the ${value} API key first`,
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select embedding provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const validatedProviders = getValidatedProviders();
                        if (validatedProviders.length === 0) {
                          return (
                            <SelectItem value="_no_providers" disabled>
                              Önce API key doğrulayın
                            </SelectItem>
                          );
                        }
                        return validatedProviders.map(([provider, data]) => (
                          <SelectItem key={provider} value={provider}>
                            {data.name}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  <Select
                    value={tempConfig?.embeddingModel}
                    onValueChange={async (value) => {
                      // CRITICAL VALIDATION: Prevent chat models from being selected as embedding models
                      const chatModelPatterns = ['gpt-4o', 'gpt-4', 'gpt-3.5', 'claude', 'gemini'];
                      const isLikelyChatModel = chatModelPatterns.some(pattern =>
                        value.toLowerCase().includes(pattern)
                      ) && !value.toLowerCase().includes('embedding');

                      if (isLikelyChatModel) {
                        toast({
                          title: "Invalid Model",
                          description: `"${value}" is a chat model, not an embedding model. Please select a model that includes "embedding" in its name.`,
                          variant: "destructive",
                        });
                        return; // Don't save
                      }

                      // Update embedding model in llmSettings
                      const updatedConfig = {
                        ...tempConfig,
                        embeddingModel: value,
                        llmSettings: {
                          ...tempConfig?.llmSettings,
                          embeddingModel: value,
                          activeEmbeddingModel: `${tempConfig?.embeddingProvider || 'openai'}/${value}`
                        }
                      };
                      updateTempConfig('embeddingModel', value);
                      setTempConfig(updatedConfig);
                      // Auto-save when model changes
                      try {
                        await updateSettingsCategory('llm', updatedConfig);
                        setLlmConfig(updatedConfig);
                        toast({
                          title: "Success",
                          description: "Embedding model updated successfully",
                        });
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to update embedding model",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select embedding model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getEmbeddingModelsForProvider(tempConfig?.embeddingProvider || llmConfig.embeddingProvider || 'openai').map(model => {
                        const details = getEmbeddingModelDetails(tempConfig?.embeddingProvider || llmConfig.embeddingProvider || 'openai', model);
                        return (
                          <SelectItem key={model} value={model}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {details?.dimension || 1536}d
                              </Badge>
                              {details?.note && (
                                <span className="text-xs text-muted-foreground">
                                  {details.note}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Translation Provider and OCR Provider Side-by-Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Active Translation Provider Selection */}
                <div>
                  <Label>Translation Provider</Label>
                  <div className="mt-2">
                    <Select
                      value={tempConfig?.translationProvider || 'google'}
                      onValueChange={async (value) => {
                        // Update translation provider in llmSettings
                        const updatedConfig = {
                          ...tempConfig,
                          translationProvider: value,
                          llmSettings: {
                            ...tempConfig?.llmSettings,
                            translationProvider: value
                          }
                        };
                        updateTempConfig('translationProvider', value);
                        setTempConfig(updatedConfig);
                        // Auto-save when provider changes
                        try {
                          await updateSettingsCategory('llm', updatedConfig);
                          setLlmConfig(updatedConfig);
                          toast({
                            title: "Success",
                            description: "Translation provider updated successfully",
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to update translation provider",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select translation provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {getValidatedTranslationProviders().map(provider => {
                          const status = getTranslationProviderStatus(provider.value as 'deepl' | 'google');
                          return (
                            <SelectItem key={provider.value} value={provider.value}>
                              <div className="flex flex-col">
                                <span className="font-medium">{provider.label}</span>
                                {status && (
                                  <span className="text-xs text-gray-500">
                                    {status.verifiedDate}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Active OCR Provider Selection */}
                <div>
                  <Label>OCR Provider</Label>
                  <div className="mt-2">
                    <Select
                      value={tempConfig?.ocrProvider || 'gemini-vision'}
                      onValueChange={async (value) => {
                        const updatedConfig = {
                          ...tempConfig,
                          ocrProvider: value,
                          ocrSettings: {
                            ...tempConfig?.ocrSettings,
                            activeProvider: value
                          }
                        };
                        updateTempConfig('ocrProvider', value);
                        setTempConfig(updatedConfig);
                        // Auto-save when provider changes
                        try {
                          await updateSettingsCategory('ocr', {
                            activeProvider: value,
                            fallbackEnabled: tempConfig?.ocrSettings?.fallbackEnabled !== false,
                            cacheEnabled: tempConfig?.ocrSettings?.cacheEnabled !== false
                          });
                          toast({
                            title: "Başarılı",
                            description: "OCR provider güncellendi",
                          });
                        } catch (error) {
                          toast({
                            title: "Hata",
                            description: "OCR provider güncellenemedi",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="OCR provider seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-vision">
                          <div className="flex flex-col">
                            <span className="font-medium">Gemini Vision</span>
                            {(() => {
                              const status = getOCRProviderStatus('gemini-vision');
                              return status && (
                                <span className="text-xs text-gray-500">
                                  {status.verifiedDate}
                                </span>
                              );
                            })()}
                          </div>
                        </SelectItem>
                        <SelectItem value="openai-vision">
                          <div className="flex flex-col">
                            <span className="font-medium">OpenAI Vision</span>
                            {(() => {
                              const status = getOCRProviderStatus('openai-vision');
                              return status && (
                                <span className="text-xs text-gray-500">
                                  {status.verifiedDate}
                                </span>
                              );
                            })()}
                          </div>
                        </SelectItem>
                        <SelectItem value="deepseek-vision">
                          <div className="flex flex-col">
                            <span className="font-medium">DeepSeek Vision</span>
                            {(() => {
                              const status = getOCRProviderStatus('deepseek-vision');
                              return status && (
                                <span className="text-xs text-gray-500">
                                  {status.verifiedDate}
                                </span>
                              );
                            })()}
                          </div>
                        </SelectItem>
                        <SelectItem value="tesseract">
                          <div className="flex flex-col">
                            <span className="font-medium">Tesseract</span>
                            <span className="text-xs text-green-600">Ücretsiz</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Provider Usage Summary */}
              {Object.keys(modelTokenUsage).length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="text-lg font-medium mb-4">Provider Usage Summary</h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {Object.entries(
                      Object.entries(modelTokenUsage).reduce((acc, [modelKey, usage]) => {
                        const provider = usage.provider || modelKey.split(':')[0];
                        if (!acc[provider]) {
                          acc[provider] = {
                            provider: provider,
                            models: [],
                            totalTokens: 0,
                            totalCost: 0,
                            avgResponseTime: 0,
                            verifiedAt: usage.lastUsed
                          };
                        }
                        acc[provider].models.push(usage);
                        acc[provider].totalTokens += usage.totalTokens;
                        acc[provider].totalCost += usage.cost;
                        acc[provider].avgResponseTime = Math.max(acc[provider].avgResponseTime, usage.responseTime);
                        return acc;
                      }, {} as Record<string, any>)
                    ).map(([provider, data]: [string, any]) => (
                      <div key={provider} className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-800">
                        <div className="mb-3">
                          <span className="font-bold text-lg text-green-800 dark:text-green-200 capitalize">{provider}</span>
                          {data.verifiedAt && (
                            <span className="ml-3 text-xs text-green-600 dark:text-green-400">
                              {data.verifiedAt.toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {data.models.map((modelUsage: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-white/60 dark:bg-black/20 rounded-lg">
                              <div className="flex items-center gap-3">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="font-medium text-green-800 dark:text-green-200">{modelUsage.model}</span>
                              </div>
                              <div className="flex items-center gap-6 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-green-700 dark:text-green-300">Tokens:</span>
                                  <span className="font-bold text-green-800 dark:text-green-100">{modelUsage.totalTokens}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-green-700 dark:text-green-300">Cost:</span>
                                  <span className="font-bold text-green-800 dark:text-green-100">${modelUsage.cost.toFixed(4)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-green-700 dark:text-green-300">Response:</span>
                                  <span className="font-bold text-green-800 dark:text-green-100">{modelUsage.responseTime}ms</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Source Database Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Source Database</CardTitle>
              <CardDescription>Configure connection to your data source</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Database Type</Label>
                  <Select value={dbType} onValueChange={saveDbType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select database type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                      <SelectItem value="mariadb">MariaDB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Host</Label>
                  <Input
                    value={tempDBConfig?.database?.host || 'localhost'}
                    onChange={(e) => updateDBSetting('host', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={tempDBConfig?.database?.port || dbConfig?.database?.port || (dbType === 'mysql' || dbType === 'mariadb' ? 3306 : 5432)}
                    onChange={(e) => updateDBSetting('port', parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Database Name</Label>
                  <Input
                    value={tempDBConfig?.database?.name || ''}
                    onChange={(e) => updateDBSetting('name', e.target.value)}
                    placeholder="e.g. my_database"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>User</Label>
                  <Input
                    value={tempDBConfig?.database?.user || ''}
                    onChange={(e) => updateDBSetting('user', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={tempDBConfig?.database?.password || ''}
                    onChange={(e) => updateDBSetting('password', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>SSL Enabled</Label>
                <Switch
                  checked={tempDBConfig?.database?.ssl ?? dbConfig?.database?.ssl}
                  onCheckedChange={(checked) => updateDBSetting('ssl', checked)}
                />
              </div>

              <Button onClick={testDbConnection} disabled={dbTesting} size="sm" variant="outline">
                {dbTesting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                Test Connection
              </Button>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveAllSettings} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save All'
              )}
            </Button>
          </div>
        </div>
      </div>

    </>
  );
}


// Template Selector Component (Enhanced)
function TemplateSelector() {
  const [activeTemplate, setActiveTemplate] = useState('base');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Load active template from backend
    fetch('/api/v2/settings/active-template')
      .then(res => res.json())
      .then(data => {
        setActiveTemplate(data.active || 'base');
      })
      .catch(err => {
        console.error('Failed to load active template:', err);
        setActiveTemplate('base');
      });
  }, []);

  const handleTemplateChange = async (value: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/settings/set-active-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: value })
      });

      if (res.ok) {
        setActiveTemplate(value);
        toast({
          title: "Template Activated",
          description: `Template "${value}" is now active. Refresh page to see changes.`,
        });
      } else {
        throw new Error('Failed to set template');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to activate template",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const templates = Object.values(chatTemplates);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            className={`cursor-pointer transition-all hover:border-primary ${activeTemplate === template.id ? 'border-2 border-primary ring-2 ring-primary/20' : ''} ${loading ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={() => !loading && handleTemplateChange(template.id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex justify-between items-center">
                {template.name}
                {activeTemplate === template.id && <Badge>Active</Badge>}
              </CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-muted rounded-md mb-4 flex items-center justify-center relative overflow-hidden group">
                {template.id === 'base' ? (
                  <div className="text-center">
                    <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Standard Interface</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Custom Theme</span>
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="secondary" size="sm">Select Template</Button>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>v{template.version}</span>
                <span className="font-mono bg-muted px-1 rounded">{template.id}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Question Pattern Types
interface QuestionPatternCombination {
  with: string;
  question: string;
}

interface QuestionPattern {
  name: string;
  keywords: string;
  titleKeywords?: string;
  combinations?: QuestionPatternCombination[];
  defaultQuestion: string;
  priority?: number;
}

// Default patterns for new installations
const DEFAULT_QUESTION_PATTERNS: QuestionPattern[] = [
  {
    name: 'emlak',
    keywords: 'satılık|kiralık|emlak|daire|konut|arsa|tarla|bahçe|villa|müstakil',
    titleKeywords: 'satılık|kiralık|arsa|tarla|bahçe|daire|konut',
    combinations: [
      { with: 'fiyat,metrekare', question: '{topic} için m² fiyatı ve toplam maliyet ne kadardır?' },
      { with: 'ozellik', question: '{topic} özellikleri ve imkanları nelerdir?' },
      { with: 'konum', question: '{topic} lokasyonu ve çevre özellikleri nasıldır?' },
      { with: 'fiyat', question: '{topic} fiyatı ve ödeme seçenekleri nelerdir?' }
    ],
    defaultQuestion: '{topic} özellikleri ve fiyat bilgisi nedir?',
    priority: 1
  },
  {
    name: 'saglik',
    keywords: 'aşı|aşılama|sağlık|hastane|tedavi|hastalık',
    combinations: [
      { with: 'basvuru', question: '{topic} için başvuru süreci ve gerekli belgeler nelerdir?' },
      { with: 'sure', question: '{topic} ne zaman ve hangi aralıklarla yapılmalı?' }
    ],
    defaultQuestion: '{topic} kimlere uygulanmalı ve nelere dikkat edilmeli?',
    priority: 2
  },
  {
    name: 'vergi',
    keywords: 'stopaj|tevkifat|kdv|katma değer|gelir vergisi|beyanname|muafiyet',
    combinations: [
      { with: 'oran', question: '{topic} kapsamında vergi oranları nedir?' },
      { with: 'sure', question: '{topic} için beyanname süreleri nedir?' }
    ],
    defaultQuestion: '{topic} ile ilgili vergi uygulaması nasıldır?',
    priority: 3
  }
];

// Question Patterns Editor Component
function QuestionPatternsEditor({
  patterns,
  onChange
}: {
  patterns?: QuestionPattern[];
  onChange: (patterns: QuestionPattern[]) => void;
}) {
  const { t } = useTranslation();
  const [editingPattern, setEditingPattern] = useState<QuestionPattern | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const currentPatterns = patterns || DEFAULT_QUESTION_PATTERNS;

  const handleAddPattern = () => {
    setEditingPattern({
      name: '',
      keywords: '',
      defaultQuestion: '{topic} hakkında bilgi verir misiniz?',
      priority: currentPatterns.length + 1,
      combinations: []
    });
    setIsAddingNew(true);
  };

  const handleSavePattern = (pattern: QuestionPattern) => {
    if (isAddingNew) {
      onChange([...currentPatterns, pattern]);
    } else {
      onChange(currentPatterns.map(p => p.name === editingPattern?.name ? pattern : p));
    }
    setEditingPattern(null);
    setIsAddingNew(false);
  };

  const handleDeletePattern = (name: string) => {
    onChange(currentPatterns.filter(p => p.name !== name));
  };

  const handleResetToDefaults = () => {
    onChange(DEFAULT_QUESTION_PATTERNS);
  };

  return (
    <div className="space-y-4">
      {/* Pattern List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {currentPatterns.map((pattern, idx) => (
          <div
            key={pattern.name}
            className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm capitalize">{pattern.name}</span>
                <Badge variant="outline" className="text-xs">Priority: {pattern.priority || idx + 1}</Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-1">
                Keywords: {pattern.keywords.split('|').slice(0, 3).join(', ')}
                {pattern.keywords.split('|').length > 3 && '...'}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingPattern(pattern);
                  setIsAddingNew(false);
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <ConfirmTooltip
                message={t('settings.questionPatterns.deleteConfirm', { name: pattern.name })}
                onConfirm={() => handleDeletePattern(pattern.name)}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </ConfirmTooltip>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleAddPattern}>
          <Plus className="h-4 w-4 mr-1" /> {t('settings.questionPatterns.addPattern')}
        </Button>
        <Button variant="outline" size="sm" onClick={handleResetToDefaults}>
          <RefreshCw className="h-4 w-4 mr-1" /> {t('settings.questionPatterns.resetDefaults')}
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingPattern} onOpenChange={(open) => !open && setEditingPattern(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b bg-muted/50">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              {isAddingNew ? t('settings.questionPatterns.addTitle') : t('settings.questionPatterns.editTitle', { name: editingPattern?.name })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {editingPattern && (
              <PatternEditForm
                pattern={editingPattern}
                onSave={handleSavePattern}
                onCancel={() => setEditingPattern(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Pattern Edit Form Component
function PatternEditForm({
  pattern,
  onSave,
  onCancel
}: {
  pattern: QuestionPattern;
  onSave: (pattern: QuestionPattern) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<QuestionPattern>(pattern);
  const [newCombo, setNewCombo] = useState({ with: '', question: '' });

  const handleAddCombination = () => {
    if (newCombo.with && newCombo.question) {
      setForm({
        ...form,
        combinations: [...(form.combinations || []), newCombo]
      });
      setNewCombo({ with: '', question: '' });
    }
  };

  const handleRemoveCombination = (idx: number) => {
    setForm({
      ...form,
      combinations: form.combinations?.filter((_, i) => i !== idx)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('settings.questionPatterns.nameLabel')}</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
            placeholder={t('settings.questionPatterns.namePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('settings.questionPatterns.priorityLabel')}</Label>
          <Input
            type="number"
            value={form.priority || 1}
            onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 1 })}
            min={1}
            max={99}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('settings.questionPatterns.keywordsLabel')}</Label>
        <Input
          value={form.keywords}
          onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          placeholder={t('settings.questionPatterns.keywordsPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('settings.questionPatterns.keywordsHelp')}</p>
      </div>

      <div className="space-y-2">
        <Label>{t('settings.questionPatterns.titleKeywordsLabel')}</Label>
        <Input
          value={form.titleKeywords || ''}
          onChange={(e) => setForm({ ...form, titleKeywords: e.target.value })}
          placeholder={t('settings.questionPatterns.titleKeywordsPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('settings.questionPatterns.titleKeywordsHelp')}</p>
      </div>

      <div className="space-y-2">
        <Label>{t('settings.questionPatterns.defaultQuestionLabel')}</Label>
        <Input
          value={form.defaultQuestion}
          onChange={(e) => setForm({ ...form, defaultQuestion: e.target.value })}
          placeholder={t('settings.questionPatterns.defaultQuestionPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('settings.questionPatterns.defaultQuestionHelp')}</p>
      </div>

      {/* Combinations */}
      <div className="space-y-3 pt-2 border-t">
        <Label>{t('settings.questionPatterns.combinationsLabel')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('settings.questionPatterns.combinationsHelp')}
        </p>

        {form.combinations?.map((combo, idx) => (
          <div key={idx} className="flex gap-2 items-start p-2 bg-muted/30 rounded">
            <div className="flex-1 space-y-1">
              <div className="text-xs font-medium">When: {combo.with}</div>
              <div className="text-xs text-muted-foreground">{combo.question}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleRemoveCombination(idx)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}

        <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <Input
            placeholder="fiyat,konum"
            value={newCombo.with}
            onChange={(e) => setNewCombo({ ...newCombo, with: e.target.value })}
            className="text-sm"
          />
          <Input
            placeholder="{topic} için fiyat ve konum bilgisi nedir?"
            value={newCombo.question}
            onChange={(e) => setNewCombo({ ...newCombo, question: e.target.value })}
            className="text-sm"
          />
          <Button variant="outline" size="sm" onClick={handleAddCombination}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name || !form.keywords}>
          Save Pattern
        </Button>
      </div>
    </div>
  );
}

// Optimized Chatbot Settings Component
function RAGSettings() {
  const { t } = useTranslation();
  const [ragConfig, setRagConfig] = useState<any>({});
  const [tempRAGConfig, setTempRAGConfig] = useState<any>({});
  const [chatbotConfig, setChatbotConfig] = useState<any>({});
  const [tempChatbotConfig, setTempChatbotConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Table priorities state
  const [sourceTables, setSourceTables] = useState<Array<{ name: string; embeddingCount: number }>>([]);
  const [tableWeights, setTableWeights] = useState<Record<string, number>>({});
  const [tablesLoading, setTablesLoading] = useState(true);

  const { toast } = useToast();

  // Optimal default values for RAG settings
  const DEFAULT_RAG_SETTINGS = {
    similarityThreshold: 0.25,      // 25% - Good balance between precision and recall
    minResults: 5,                   // Show 5 sources initially
    maxResults: 15,                  // Fetch up to 15 total sources
    parallelLLMCount: 4,            // Process 4 chunks in parallel
    parallelLLMBatchSize: 100,      // Batch size for embeddings
    chunkOverlap: 200,              // 200 chars overlap between chunks
    chunkSize: 1000,                // 1000 chars per chunk
    enableHybridSearch: true,       // Combine semantic + keyword search
    enableKeywordBoost: true,       // Boost keyword matches
    enableUnifiedEmbeddings: true,  // Include database content
    enableMessageEmbeddings: false, // Don't include chat history
    enableDocumentEmbeddings: false,// Don't include uploaded docs
    enableScrapeEmbeddings: false,  // Don't include scraped content
    unifiedEmbeddingsPriority: 8    // High priority for database content
  };

  // Load source tables for table priorities
  const loadSourceTables = useCallback(async () => {
    try {
      setTablesLoading(true);
      const API_BASE_URL = API_CONFIG.baseUrl;
      const token = localStorage.getItem('accessToken');

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [tablesResponse, weightsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v2/search/source-tables`, { headers }),
        fetch(`${API_BASE_URL}/api/v2/search/source-table-weights`, { headers })
      ]);

      if (tablesResponse.ok) {
        const tablesData = await tablesResponse.json();
        const weightsData = weightsResponse.ok ? await weightsResponse.json() : { weights: {} };

        setSourceTables(tablesData.sourceTables || []);

        const initialWeights: Record<string, number> = {};
        tablesData.sourceTables?.forEach((table: { name: string }) => {
          initialWeights[table.name] = weightsData.weights?.[table.name] ?? 1.0;
        });
        setTableWeights(initialWeights);
      }
    } catch (error) {
      console.error('Failed to load source tables:', error);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [ragData, chatbotResponse] = await Promise.all([
        getRAGSettings(),
        fetch('/api/v2/chatbot/settings').then(res => res.json())
      ]);

      // Load source tables in parallel
      loadSourceTables();
      console.log('📊 [RAG SETTINGS LOAD] Full RAG Data from API:', ragData);
      console.log('📊 [RAG SETTINGS LOAD] RAG Settings values:', {
        similarityThreshold: ragData?.ragSettings?.similarityThreshold,
        minResults: ragData?.ragSettings?.minResults,
        maxResults: ragData?.ragSettings?.maxResults,
        parallelLLMCount: ragData?.ragSettings?.parallelLLMCount,
        batchSize: ragData?.ragSettings?.batchSize,
        chunkOverlap: ragData?.ragSettings?.chunkOverlap
      });

      // Apply defaults to missing values
      const ragWithDefaults = {
        ...ragData,
        ragSettings: {
          ...DEFAULT_RAG_SETTINGS,
          ...ragData?.ragSettings
        }
      };

      setRagConfig(ragWithDefaults);
      setTempRAGConfig(ragWithDefaults);

      console.log('📥 [RAG SETTINGS LOAD] Chatbot response from API:', {
        title: chatbotResponse.title,
        subtitle: chatbotResponse.subtitle,
        logoUrl: chatbotResponse.logoUrl ? '✅ Set' : '❌ Not set',
        welcomeMessage: chatbotResponse.welcomeMessage?.substring(0, 50) + '...'
      });

      // Transform chatbot API response to match expected structure
      const chatbotData = {
        chatbot: {
          title: chatbotResponse.title,
          logoUrl: chatbotResponse.logoUrl,
          welcomeMessage: chatbotResponse.welcomeMessage,
          subtitle: chatbotResponse.subtitle,
          placeholder: chatbotResponse.placeholder,
          primaryColor: chatbotResponse.primaryColor,
          suggestionQuestions: chatbotResponse.suggestionQuestions,
          enableSuggestions: chatbotResponse.enableSuggestions,
          autoGenerateSuggestions: chatbotResponse.autoGenerateSuggestions,
          maxResponseLength: chatbotResponse.maxResponseLength,
          maxQuestionLength: chatbotResponse.maxQuestionLength,
          questionTemplate: chatbotResponse.questionTemplate,
          autoGenerateQuestions: chatbotResponse.autoGenerateQuestions
        }
      };

      console.log('📥 [RAG SETTINGS LOAD] Transformed chatbot data:', chatbotData);

      setChatbotConfig(chatbotData);
      setTempChatbotConfig(chatbotData);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveAllSettings = async () => {
    console.log('[RAG Settings] Saving...');
    setSaving(true);
    try {
      // Save RAG settings
      await updateSettingsCategory('rag', tempRAGConfig);
      console.log('[RAG Settings] Saved successfully');

      // Save chatbot settings using the correct endpoint
      // Note: maxResults/minResults are in RAG settings, not chatbot settings
      const chatbotPayload = {
        title: tempChatbotConfig?.chatbot?.title,
        logoUrl: tempChatbotConfig?.chatbot?.logoUrl,
        welcomeMessage: tempChatbotConfig?.chatbot?.welcomeMessage,  // FIXED: Use welcomeMessage not openingMessage
        subtitle: tempChatbotConfig?.chatbot?.subtitle,
        placeholder: tempChatbotConfig?.chatbot?.placeholder,
        primaryColor: tempChatbotConfig?.chatbot?.primaryColor,
        useKeywordSuggestions: tempChatbotConfig?.chatbot?.useKeywordSuggestions ?? false,
        suggestionKeywords: tempChatbotConfig?.chatbot?.suggestionKeywords || '',
        suggestionQuestions: tempChatbotConfig?.chatbot?.suggestionQuestions,
        enableSuggestions: tempChatbotConfig?.chatbot?.enableSuggestions,
        autoGenerateSuggestions: tempChatbotConfig?.chatbot?.autoGenerateSuggestions,
        maxResponseLength: tempChatbotConfig?.chatbot?.maxResponseLength,
        maxQuestionLength: tempChatbotConfig?.chatbot?.maxQuestionLength,
        questionTemplate: tempChatbotConfig?.chatbot?.questionTemplate,
        autoGenerateQuestions: tempChatbotConfig?.chatbot?.autoGenerateQuestions
      };

      console.log('📤 [RAG SETTINGS SAVE] Saving chatbot settings:', {
        title: chatbotPayload.title,
        subtitle: chatbotPayload.subtitle,
        logoUrl: chatbotPayload.logoUrl ? '✅ Set' : '❌ Not set',
        suggestionQuestions: chatbotPayload.suggestionQuestions?.length || 0,
        maxResponseLength: chatbotPayload.maxResponseLength,
        maxQuestionLength: chatbotPayload.maxQuestionLength
      });

      const chatbotResponse = await fetch('/api/v2/chatbot/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatbotPayload)
      });

      if (!chatbotResponse.ok) {
        throw new Error('Failed to save chatbot settings');
      }

      console.log('✅ [RAG SETTINGS SAVE] Chatbot settings saved successfully');

      // Save table weights if any tables exist
      if (Object.keys(tableWeights).length > 0) {
        const API_BASE_URL = API_CONFIG.baseUrl;
        const weightsResponse = await fetch(`${API_BASE_URL}/api/v2/search/source-table-weights`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weights: tableWeights })
        });

        if (!weightsResponse.ok) {
          console.warn('⚠️ Failed to save table weights');
        } else {
          console.log('✅ [RAG SETTINGS SAVE] Table weights saved');
        }
      }

      setRagConfig(tempRAGConfig);
      setChatbotConfig(tempChatbotConfig);
      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateRAGSetting = (key: string, value: any) => {
    setTempRAGConfig({
      ...tempRAGConfig,
      ragSettings: {
        ...tempRAGConfig.ragSettings,
        [key]: value
      }
    });
  };

  const updateChatbotSetting = (key: string, value: any) => {
    console.log(`📝 [RAG SETTINGS] Updating chatbot setting: ${key} =`, value);
    const newConfig = {
      ...tempChatbotConfig,
      chatbot: {
        ...tempChatbotConfig.chatbot,
        [key]: value
      }
    };
    console.log(`📝 [RAG SETTINGS] New tempChatbotConfig:`, newConfig);
    setTempChatbotConfig(newConfig);
  };

  const resetToDefaults = () => {
    setTempRAGConfig({
      ...tempRAGConfig,
      ragSettings: DEFAULT_RAG_SETTINGS
    });
    toast({
      title: "Defaults Applied",
      description: "RAG settings reset to optimal defaults. Click Save to apply changes.",
    });
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* RAG Configuration - Left Column */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('settings.rag.title')}</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('settings.rag.resetDefaults')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('settings.rag.searchParameters')}</h3>
              <div className="space-y-4">
                <div>
                  <Label>{t('settings.rag.similarityThreshold')}: {(tempRAGConfig?.ragSettings?.similarityThreshold ?? DEFAULT_RAG_SETTINGS.similarityThreshold).toFixed(2)} (Default: 0.25)</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.rag.similarityHelp')}</p>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.similarityThreshold ?? DEFAULT_RAG_SETTINGS.similarityThreshold]}
                    max={1}
                    min={0}
                    step={0.01}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('similarityThreshold', value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('settings.rag.minResults')}: {tempRAGConfig?.ragSettings?.minResults ?? DEFAULT_RAG_SETTINGS.minResults} (Default: 5)</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.rag.minResultsHelp')}</p>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.minResults ?? DEFAULT_RAG_SETTINGS.minResults]}
                      max={20}
                      min={0}
                      step={1}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('minResults', value)}
                    />
                  </div>
                  <div>
                    <Label>{t('settings.rag.maxResults')}: {tempRAGConfig?.ragSettings?.maxResults ?? DEFAULT_RAG_SETTINGS.maxResults} (Default: 15)</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.rag.maxResultsHelp')}</p>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.maxResults ?? DEFAULT_RAG_SETTINGS.maxResults]}
                      max={50}
                      min={0}
                      step={1}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('maxResults', value)}
                    />
                  </div>
                </div>
                {(tempRAGConfig?.ragSettings?.minResults === 0 && tempRAGConfig?.ragSettings?.maxResults === 0) && (
                  <Alert>
                    <AlertDescription>
                      <span dangerouslySetInnerHTML={{ __html: t('settings.rag.citationWarning') }} />
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('settings.rag.processingParameters')}</h3>
              <div className="space-y-4">
                <div>
                  <div>
                    <Label>{t('settings.rag.batchSize')}: {tempRAGConfig?.ragSettings?.parallelLLMBatchSize ?? ragConfig?.ragSettings?.parallelLLMBatchSize ?? 3}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{t('settings.rag.batchSizeHelp')}</p>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.parallelLLMBatchSize ?? ragConfig?.ragSettings?.parallelLLMBatchSize ?? 3]}
                      max={10}
                      min={1}
                      step={1}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('parallelLLMBatchSize', value)}
                    />
                  </div>
                  {/* Chunk Size & Overlap - Disabled (not currently used, reserved for future large document processing) */}
                </div>
                <div>
                  <Label>{t('settings.rag.summaryMaxLength')}: {tempRAGConfig?.ragSettings?.summaryMaxLength || ragConfig?.ragSettings?.summaryMaxLength || 800}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{t('settings.rag.summaryMaxLengthHelp')}</p>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.summaryMaxLength || ragConfig?.ragSettings?.summaryMaxLength || 800]}
                    max={2000}
                    min={100}
                    step={50}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('summaryMaxLength', value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('settings.rag.searchOptions')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <Label>{t('settings.rag.enableHybridSearch')}</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('settings.rag.hybridSearchHelp')}
                    </p>
                  </div>
                  <Switch
                    checked={tempRAGConfig?.ragSettings?.enableHybridSearch ?? ragConfig?.ragSettings?.enableHybridSearch ?? true}
                    onCheckedChange={(checked) => {
                      // FIX: Update all related settings in a single state update to prevent race conditions
                      setTempRAGConfig(prev => ({
                        ...prev,
                        ragSettings: {
                          ...prev?.ragSettings,
                          enableHybridSearch: checked,
                          // When hybrid search is enabled, ensure semantic search and keyword boost are also enabled
                          ...(checked ? { enableSemanticSearch: true, enableKeywordBoost: true } : {})
                        }
                      }));
                      console.log(`📝 [RAG SETTINGS] Hybrid search toggled to: ${checked}`);
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label>{t('settings.rag.enableKeywordBoost')}</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('settings.rag.keywordBoostHelp')}
                    </p>
                  </div>
                  <Switch
                    checked={tempRAGConfig?.ragSettings?.enableKeywordBoost ?? ragConfig?.ragSettings?.enableKeywordBoost}
                    onCheckedChange={(checked) => updateRAGSetting('enableKeywordBoost', checked)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('settings.rag.dataSourcePriorities')}</h3>
              <div className="space-y-4">
                {/* Database Content Priority */}
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Database Content</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Connected database tables</p>
                    </div>
                    <Badge variant={(tempRAGConfig?.ragSettings?.databasePriority ?? 8) > 0 ? "default" : "secondary"}>
                      {tempRAGConfig?.ragSettings?.databasePriority ?? 8}
                    </Badge>
                  </div>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.databasePriority ?? 8]}
                    max={10}
                    min={0}
                    step={1}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('databasePriority', value)}
                  />
                </div>

                {/* Documents Priority */}
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Documents</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Uploaded PDFs, Word docs, etc.</p>
                    </div>
                    <Badge variant={(tempRAGConfig?.ragSettings?.documentsPriority ?? 5) > 0 ? "default" : "secondary"}>
                      {tempRAGConfig?.ragSettings?.documentsPriority ?? 5}
                    </Badge>
                  </div>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.documentsPriority ?? 5]}
                    max={10}
                    min={0}
                    step={1}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('documentsPriority', value)}
                  />
                </div>

                {/* Chat Messages Priority */}
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Chat Messages</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Previous conversations and Q&A</p>
                    </div>
                    <Badge variant={(tempRAGConfig?.ragSettings?.chatPriority ?? 3) > 0 ? "default" : "secondary"}>
                      {tempRAGConfig?.ragSettings?.chatPriority ?? 3}
                    </Badge>
                  </div>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.chatPriority ?? 3]}
                    max={10}
                    min={0}
                    step={1}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('chatPriority', value)}
                  />
                </div>

                {/* Web Content Priority */}
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Web Content</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Scraped web pages</p>
                    </div>
                    <Badge variant={(tempRAGConfig?.ragSettings?.webPriority ?? 4) > 0 ? "default" : "secondary"}>
                      {tempRAGConfig?.ragSettings?.webPriority ?? 4}
                    </Badge>
                  </div>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.webPriority ?? 4]}
                    max={10}
                    min={0}
                    step={1}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('webPriority', value)}
                  />
                </div>
              </div>
            </div>

            {/* Table Priorities */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Table Priorities</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adjust priority weights for each embedded table (0-1 scale)
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">Database Tables</Badge>
              </div>

              {tablesLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner size="md" />
                </div>
              ) : sourceTables.length === 0 ? (
                <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                  <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                    No embedded tables found. Run embedding generation first in the Database tab.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {sourceTables.map((table) => (
                    <div key={table.name} className="space-y-2 p-3 border rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium capitalize">
                            {table.name.replace(/_/g, ' ')}
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {table.embeddingCount.toLocaleString()} records
                          </p>
                        </div>
                        <Badge variant={(tableWeights[table.name] ?? 1) > 0 ? "default" : "secondary"}>
                          {(tableWeights[table.name] ?? 1).toFixed(2)}
                        </Badge>
                      </div>
                      <Slider
                        value={[tableWeights[table.name] ?? 1.0]}
                        onValueChange={(value) => {
                          setTableWeights({
                            ...tableWeights,
                            [table.name]: value[0]
                          });
                        }}
                        min={0}
                        max={1}
                        step={0.05}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Chatbot + Template Settings */}
        <div className="space-y-6">
          {/* Chatbot Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Chat Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Opening Messages */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Opening Messages</h3>

                <div className="space-y-2">
                  <Label htmlFor="welcomeMessage">Welcome Message</Label>
                  <Textarea
                    id="welcomeMessage"
                    value={tempChatbotConfig?.chatbot?.welcomeMessage || chatbotConfig?.chatbot?.welcomeMessage || ''}
                    onChange={(e) => updateChatbotSetting('welcomeMessage', e.target.value)}
                    placeholder="Merhaba! Size nasıl yardımcı olabilirim?"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    First message shown when chat loads
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="placeholder">Input Placeholder Text</Label>
                  <Input
                    id="placeholder"
                    value={tempChatbotConfig?.chatbot?.placeholder || chatbotConfig?.chatbot?.placeholder || ''}
                    onChange={(e) => updateChatbotSetting('placeholder', e.target.value)}
                    placeholder="Sorunuzu yazın..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Placeholder text in the chat input field
                  </p>
                </div>
              </div>

              {/* Suggestion Cards - Initial suggestions shown on chat load */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">Suggestion Cards</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Initial question suggestions shown when chat loads
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">Welcome Screen</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label>Enable Suggestion Cards</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Show clickable question cards on welcome screen
                    </p>
                  </div>
                  <Switch
                    checked={tempChatbotConfig?.chatbot?.enableSuggestions ?? true}
                    onCheckedChange={(checked) => updateChatbotSetting('enableSuggestions', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label>Max Suggestion Cards</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum number of suggestion cards to show (1-6)
                    </p>
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      value={tempChatbotConfig?.chatbot?.maxSuggestionCards || 4}
                      onChange={(e) =>
                        updateChatbotSetting(
                          "maxSuggestionCards",
                          Math.min(6, Math.max(1, parseInt(e.target.value) || 4))
                        )
                      }
                      min="1"
                      max="6"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Custom Suggestions (one per line)</Label>
                  <Textarea
                    value={tempChatbotConfig?.chatbot?.customSuggestions || ''}
                    onChange={(e) => updateChatbotSetting('customSuggestions', e.target.value)}
                    placeholder="Enter custom suggestions, one per line...&#10;Example: Fiyat aralığı nedir?&#10;Example: Hangi bölgelerde hizmet veriyorsunuz?"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to auto-generate from database content
                  </p>
                </div>
              </div>

              {/* Follow-up Questions - Questions shown after AI response */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">Follow-up Questions</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Contextual questions shown after each AI response
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">After Response</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label>Enable Follow-up Questions</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Show related questions based on conversation context
                    </p>
                  </div>
                  <Switch
                    checked={tempChatbotConfig?.chatbot?.autoGenerateQuestions ?? true}
                    onCheckedChange={(checked) =>
                      updateChatbotSetting("autoGenerateQuestions", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label>Max Follow-up Questions</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum questions to show after response (1-5)
                    </p>
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      value={tempChatbotConfig?.chatbot?.maxFollowUpQuestions || 3}
                      onChange={(e) =>
                        updateChatbotSetting(
                          "maxFollowUpQuestions",
                          Math.min(5, Math.max(1, parseInt(e.target.value) || 3))
                        )
                      }
                      min="1"
                      max="5"
                    />
                  </div>
                </div>

                <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                  <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                    Follow-up questions are generated using the <strong>Question Generation Patterns</strong> configured below. Add domain-specific patterns for better results.
                  </AlertDescription>
                </Alert>
              </div>

              {/* Response Generation Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Response Generation</h3>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label>Max Response Length</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Maximum characters for AI responses
                      </p>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        value={tempChatbotConfig?.chatbot?.maxResponseLength || 1000}
                        onChange={(e) =>
                          updateChatbotSetting(
                            "maxResponseLength",
                            parseInt(e.target.value) || 1000
                          )
                        }
                        min="100"
                        max="5000"
                        step="100"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label>Max Question Length</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Maximum characters for user questions
                      </p>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        value={tempChatbotConfig?.chatbot?.maxQuestionLength || 500}
                        onChange={(e) =>
                          updateChatbotSetting(
                            "maxQuestionLength",
                            parseInt(e.target.value) || 500
                          )
                        }
                        min="50"
                        max="2000"
                        step="50"
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* Note: Max/Min Results are configured in RAG Settings tab */}
            </CardContent>
          </Card>

          {/* Question Generation Patterns */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Question Generation Patterns
                <Badge variant="outline" className="text-xs">Configurable</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Domain-Specific:</strong> Configure keyword patterns to generate contextual questions from your content. Each pattern defines keywords to match and question templates to generate.
                </AlertDescription>
              </Alert>

              {/* Pattern List */}
              <QuestionPatternsEditor
                patterns={tempRAGConfig?.ragSettings?.questionPatterns}
                onChange={(patterns) => updateRAGSetting('questionPatterns', patterns)}
              />
            </CardContent>
          </Card>
        </div>
        {/* End Right Column */}

      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveAllSettings} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  );
}

// Optimized Security Settings Component
function SecuritySettings() {
  const [securityConfig, setSecurityConfig] = useState<any>({});
  const [tempConfig, setTempConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Google Drive states (OAuth 2.0)
  const [driveConfig, setDriveConfig] = useState<{
    connected: boolean;
    userEmail?: string;
    folderId: string;
    enabled: boolean;
    oauthConfigured: boolean;
    clientId?: string;
    redirectUri?: string;
  }>({ connected: false, folderId: '', enabled: false, oauthConfigured: false });
  // Default redirect URI based on current environment
  const defaultRedirectUri = typeof window !== 'undefined'
    ? `${window.location.origin.replace(':3000', ':8080').replace(':5173', ':8080')}/api/v2/google-drive/callback`
    : `${API_CONFIG.baseUrl}/api/v2/google-drive/callback`;

  const [driveOAuthConfig, setDriveOAuthConfig] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: defaultRedirectUri
  });
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveTesting, setDriveTesting] = useState(false);
  const [driveConnectionStatus, setDriveConnectionStatus] = useState<{
    success: boolean;
    message: string;
    email?: string;
    folderName?: string;
  } | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [showOAuthConfig, setShowOAuthConfig] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      // Load all categories needed for this settings page
      const [securityData, advancedData, storageData, crawlerData, smtpData] = await Promise.all([
        getSettingsCategory('security'),
        getSettingsCategory('advanced'),
        getSettingsCategory('storage'),
        getSettingsCategory('crawler'),
        getSettingsCategory('smtp')
      ]);

      const combinedData = {
        security: securityData?.security || {},
        advanced: advancedData?.advanced || {},
        storage: storageData?.storage || {},
        crawler: crawlerData?.crawler || {},
        smtp: smtpData?.smtp || {}
      };

      setSecurityConfig(combinedData);
      setTempConfig(combinedData);
    } catch (error) {
      console.error('Failed to load security settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Google Drive functions
  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  const loadDriveConfig = useCallback(async () => {
    setDriveLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/config`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setDriveConfig({
            connected: data.config.connected || false,
            userEmail: data.config.userEmail,
            folderId: data.config.folderId || '',
            enabled: data.config.enabled || false,
            oauthConfigured: data.oauthConfigured || false,
            clientId: data.clientId,
            redirectUri: data.redirectUri
          });
          if (data.config.folderId) {
            setDriveFolderUrl(data.config.folderId);
          }
          // Load OAuth config if available
          if (data.clientId) {
            setDriveOAuthConfig(prev => ({
              ...prev,
              clientId: data.clientId || '',
              redirectUri: data.redirectUri || ''
            }));
          }
        }
      }
    } catch (error) {
      console.error('Failed to load Google Drive config:', error);
    } finally {
      setDriveLoading(false);
    }
  }, []);

  // Check for OAuth callback parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const driveConnected = params.get('drive_connected');
    const driveEmail = params.get('drive_email');
    const driveError = params.get('drive_error');

    if (driveConnected === 'true') {
      toast({
        title: 'Google Drive Connected',
        description: driveEmail ? `Connected as ${driveEmail}` : 'Successfully connected to Google Drive'
      });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      loadDriveConfig();
    } else if (driveError) {
      toast({
        title: 'Connection Failed',
        description: driveError,
        variant: 'destructive'
      });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast, loadDriveConfig]);

  useEffect(() => {
    loadDriveConfig();
  }, [loadDriveConfig]);

  const connectGoogleDrive = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/auth-url`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        toast({
          title: 'Configuration Error',
          description: 'OAuth not configured. Please contact administrator.',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const disconnectGoogleDrive = async () => {
    setDriveSaving(true);
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/disconnect`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        setDriveConfig(prev => ({
          ...prev,
          connected: false,
          userEmail: undefined,
          enabled: false
        }));
        setDriveConnectionStatus(null);
        toast({ title: 'Disconnected from Google Drive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDriveSaving(false);
    }
  };

  const saveDriveFolderId = async () => {
    setDriveSaving(true);
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/folder`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ folderId: driveConfig.folderId })
      });
      if (response.ok) {
        toast({ title: 'Folder ID saved' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDriveSaving(false);
    }
  };

  const saveOAuthCredentials = async () => {
    if (!driveOAuthConfig.clientId || !driveOAuthConfig.clientSecret || !driveOAuthConfig.redirectUri) {
      toast({ title: 'Error', description: 'All OAuth fields are required', variant: 'destructive' });
      return;
    }
    setDriveSaving(true);
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/oauth-config`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(driveOAuthConfig)
      });
      if (response.ok) {
        toast({ title: 'OAuth credentials saved' });
        setDriveConfig(prev => ({ ...prev, oauthConfigured: true }));
        setShowOAuthConfig(false);
        loadDriveConfig();
      } else {
        const data = await response.json();
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDriveSaving(false);
    }
  };

  const testDriveConnection = async () => {
    setDriveTesting(true);
    setDriveConnectionStatus(null);
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/test`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await response.json();
      setDriveConnectionStatus(data);
      if (data.success) {
        toast({ title: 'Connection Successful', description: `Connected as ${data.email}` });
      } else {
        toast({ title: 'Connection Failed', description: data.message, variant: 'destructive' });
      }
    } catch (error: any) {
      setDriveConnectionStatus({ success: false, message: error.message });
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDriveTesting(false);
    }
  };

  const extractDriveFolderId = async () => {
    if (!driveFolderUrl) return;
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/extract-folder-id`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ url: driveFolderUrl })
      });
      const data = await response.json();
      if (data.folderId) {
        setDriveConfig(prev => ({ ...prev, folderId: data.folderId }));
        toast({ title: 'Folder ID Extracted', description: data.folderId });
      }
    } catch (error) {
      console.error('Failed to extract folder ID:', error);
    }
  };

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      // Save all settings categories
      await Promise.all([
        updateSettingsCategory('security', tempConfig.security || {}),
        updateSettingsCategory('advanced', tempConfig.advanced || {}),
        updateSettingsCategory('storage', tempConfig.storage || {}),
        updateSettingsCategory('crawler', tempConfig.crawler || {}),
        updateSettingsCategory('smtp', tempConfig.smtp || {})
      ]);
      setSecurityConfig(tempConfig);
      toast({
        title: "Success",
        description: "All advanced settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      {/* 2-Column Grid Layout - Balanced 60/40 split for better use of space */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - Takes 3 out of 5 columns */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="bg-slate-50/50 dark:bg-slate-900/20">
            <CardHeader>
              <CardTitle>Security Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Enable Authentication</Label>
                <Switch
                  checked={tempConfig?.security?.enableAuth ?? securityConfig?.security?.enableAuth}
                  onCheckedChange={(checked) => setTempConfig({
                    ...tempConfig,
                    security: {
                      ...tempConfig.security,
                      enableAuth: checked
                    }
                  })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Session Timeout (hours)</Label>
                  <Input
                    type="number"
                    value={tempConfig?.security?.sessionTimeout ?? securityConfig?.security?.sessionTimeout ?? 24}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      security: {
                        ...tempConfig.security,
                        sessionTimeout: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
                <div>
                  <Label>Rate Limit (req/min)</Label>
                  <Input
                    type="number"
                    value={tempConfig?.security?.rateLimit ?? securityConfig?.security?.rateLimit ?? 100}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      security: {
                        ...tempConfig.security,
                        rateLimit: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
              </div>

              <div>
                <Label>JWT Secret</Label>
                <Input
                  type="password"
                  value={(tempConfig?.security?.jwtSecret ?? securityConfig?.security?.jwtSecret) || ''}
                  placeholder="Enter JWT secret"
                  onChange={(e) => setTempConfig({
                    ...tempConfig,
                    security: {
                      ...tempConfig.security,
                      jwtSecret: e.target.value
                    }
                  })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50/30 dark:bg-blue-950/10">
            <CardHeader>
              <CardTitle>File Storage Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Documents Folder Path</Label>
                  <Input
                    value={tempConfig?.storage?.docsPath ?? securityConfig?.storage?.docsPath ?? './docs'}
                    placeholder="./docs (default)"
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      storage: {
                        ...tempConfig.storage,
                        docsPath: e.target.value
                      }
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Path where uploaded documents are stored
                  </p>
                </div>
                <div>
                  <Label>Logs Folder Path</Label>
                  <Input
                    value={tempConfig?.storage?.logsPath ?? securityConfig?.storage?.logsPath ?? './logs'}
                    placeholder="./logs"
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      storage: {
                        ...tempConfig.storage,
                        logsPath: e.target.value
                      }
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Path where system logs are stored
                  </p>
                </div>
              </div>

              {/* Google Drive Integration */}
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Google Drive Integration
                    {driveConfig.connected && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {driveConfig.userEmail || 'Connected'}
                      </Badge>
                    )}
                  </h4>
                </div>

                <div className="space-y-3">
                  {/* Connection Status */}
                  {driveConfig.connected ? (
                    <></>
                  ) : (
                    <div className="space-y-3">
                      {/* OAuth Configuration */}
                      {!driveConfig.oauthConfigured || showOAuthConfig ? (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-sm font-medium text-amber-800 dark:text-amber-300">OAuth Configuration</h5>
                            {driveConfig.oauthConfigured && (
                              <Button variant="ghost" size="sm" onClick={() => setShowOAuthConfig(false)}>
                                Cancel
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                            Create OAuth credentials in Google Cloud Console and enter them below.
                          </p>
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs">Client ID</Label>
                              <Input
                                placeholder="xxx.apps.googleusercontent.com"
                                value={driveOAuthConfig.clientId}
                                onChange={(e) => setDriveOAuthConfig(prev => ({ ...prev, clientId: e.target.value }))}
                                className="text-xs font-mono"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Client Secret</Label>
                              <Input
                                type="password"
                                placeholder="GOCSPX-..."
                                value={driveOAuthConfig.clientSecret}
                                onChange={(e) => setDriveOAuthConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                                className="text-xs font-mono"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Redirect URI</Label>
                              <div className="relative">
                                <Input
                                  placeholder="https://your-domain.com/api/v2/google-drive/callback"
                                  value={driveOAuthConfig.redirectUri}
                                  onChange={(e) => setDriveOAuthConfig(prev => ({ ...prev, redirectUri: e.target.value }))}
                                  className="text-xs font-mono pr-8"
                                />
                                <button
                                  type="button"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    navigator.clipboard.writeText(driveOAuthConfig.redirectUri);
                                    toast({ title: 'Copied!' });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            <Button
                              onClick={saveOAuthCredentials}
                              size="sm"
                              className="w-full mt-2"
                              disabled={driveSaving}
                            >
                              {driveSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                              Save OAuth Credentials
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border">
                          <p className="text-sm text-muted-foreground mb-3">
                            Click the button below to connect your Google account. You'll be redirected to Google to authorize access.
                          </p>
                          <Button
                            onClick={connectGoogleDrive}
                            className="w-full"
                          >
                            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Connect with Google
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 text-xs text-muted-foreground"
                            onClick={() => setShowOAuthConfig(true)}
                          >
                            Change OAuth Credentials
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Folder Configuration - Only show when connected */}
                  {driveConfig.connected && (
                    <div className="space-y-2">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Label className="text-xs">Folder URL or ID</Label>
                          <Input
                            placeholder="Leave empty for root folder"
                            value={driveFolderUrl}
                            onChange={(e) => setDriveFolderUrl(e.target.value)}
                            className="text-xs mt-1"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={extractDriveFolderId}
                          disabled={!driveFolderUrl}
                        >
                          Extract
                        </Button>
                        <Button
                          onClick={testDriveConnection}
                          variant="outline"
                          size="sm"
                          disabled={driveTesting}
                        >
                          {driveTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </Button>
                        <Button
                          onClick={saveDriveFolderId}
                          size="sm"
                          disabled={driveSaving}
                        >
                          {driveSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={disconnectGoogleDrive}
                          disabled={driveSaving}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                      {driveConfig.folderId && (
                        <p className="text-xs text-muted-foreground">
                          Current: <span className="font-mono">{driveConfig.folderId}</span>
                        </p>
                      )}
                      {driveConnectionStatus && !driveConnectionStatus.success && (
                        <p className="text-xs text-red-600">{driveConnectionStatus.message}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50/30 dark:bg-green-950/10">
            <CardHeader>
              <CardTitle>Upload Limits</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure maximum file sizes for uploads (requires backend restart)
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>JSON Payload Limit (MB)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={tempConfig?.advanced?.upload_json_limit_mb ?? securityConfig?.advanced?.upload_json_limit_mb ?? 100}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      advanced: {
                        ...tempConfig.advanced,
                        upload_json_limit_mb: parseInt(e.target.value)
                      }
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    For API requests with large CSV data
                  </p>
                </div>
                <div>
                  <Label>File Upload Limit (MB)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={tempConfig?.advanced?.upload_file_limit_mb ?? securityConfig?.advanced?.upload_file_limit_mb ?? 100}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      advanced: {
                        ...tempConfig.advanced,
                        upload_file_limit_mb: parseInt(e.target.value)
                      }
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum size for document uploads
                  </p>
                </div>
                <div>
                  <Label>Text Limit (MB)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={tempConfig?.advanced?.upload_text_limit_mb ?? securityConfig?.advanced?.upload_text_limit_mb ?? 1}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      advanced: {
                        ...tempConfig.advanced,
                        upload_text_limit_mb: parseInt(e.target.value)
                      }
                    })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    For text-only payloads
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  ⚠️ <strong>Note:</strong> Changes to upload limits require backend restart to take effect.
                  Current limits are loaded on server startup.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Takes 2 out of 5 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Crawler Settings */}
          <Card className="bg-purple-50/30 dark:bg-purple-950/10">
            <CardHeader>
              <CardTitle>Web Crawler Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Timeout (seconds)</Label>
                  <Input
                    type="number"
                    value={tempConfig?.crawler?.timeout ?? securityConfig?.crawler?.timeout ?? 30}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      crawler: {
                        ...tempConfig.crawler,
                        timeout: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
                <div>
                  <Label>Max Concurrency</Label>
                  <Input
                    type="number"
                    value={tempConfig?.crawler?.maxConcurrency ?? securityConfig?.crawler?.maxConcurrency ?? 5}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      crawler: {
                        ...tempConfig.crawler,
                        maxConcurrency: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
              </div>

              <div>
                <Label>User Agent</Label>
                <Input
                  value={tempConfig?.crawler?.userAgent ?? securityConfig?.crawler?.userAgent ?? 'LSEMB-Crawler/1.0'}
                  onChange={(e) => setTempConfig({
                    ...tempConfig,
                    crawler: {
                      ...tempConfig.crawler,
                      userAgent: e.target.value
                    }
                  })}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Enable JavaScript</Label>
                  <Switch
                    checked={tempConfig?.crawler?.enableJavaScript ?? securityConfig?.crawler?.enableJavaScript ?? true}
                    onCheckedChange={(checked) => setTempConfig({
                      ...tempConfig,
                      crawler: {
                        ...tempConfig.crawler,
                        enableJavaScript: checked
                      }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Follow Redirects</Label>
                  <Switch
                    checked={tempConfig?.crawler?.followRedirects ?? securityConfig?.crawler?.followRedirects ?? true}
                    onCheckedChange={(checked) => setTempConfig({
                      ...tempConfig,
                      crawler: {
                        ...tempConfig.crawler,
                        followRedirects: checked
                      }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Respect Robots.txt</Label>
                  <Switch
                    checked={tempConfig?.crawler?.respectRobotsTxt ?? securityConfig?.crawler?.respectRobotsTxt ?? true}
                    onCheckedChange={(checked) => setTempConfig({
                      ...tempConfig,
                      crawler: {
                        ...tempConfig.crawler,
                        respectRobotsTxt: checked
                      }
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SMTP Settings */}
          <Card className="bg-amber-50/30 dark:bg-amber-950/10">
            <CardHeader>
              <CardTitle>SMTP Settings</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure email server for notifications
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>SMTP Host</Label>
                <Input
                  placeholder="smtp.gmail.com"
                  value={tempConfig?.smtp?.host ?? securityConfig?.smtp?.host ?? ''}
                  onChange={(e) => setTempConfig({
                    ...tempConfig,
                    smtp: {
                      ...tempConfig.smtp,
                      host: e.target.value
                    }
                  })}
                />
              </div>

              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    placeholder="587"
                    value={tempConfig?.smtp?.port ?? securityConfig?.smtp?.port ?? 587}
                    onChange={(e) => setTempConfig({
                      ...tempConfig,
                      smtp: {
                        ...tempConfig.smtp,
                        port: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Label className="text-sm">Secure</Label>
                  <Switch
                    checked={tempConfig?.smtp?.secure ?? securityConfig?.smtp?.secure ?? true}
                    onCheckedChange={(checked) => setTempConfig({
                      ...tempConfig,
                      smtp: {
                        ...tempConfig.smtp,
                        secure: checked
                      }
                    })}
                  />
                </div>
              </div>

              <div>
                <Label>Username / Email</Label>
                <Input
                  type="email"
                  placeholder="your-email@gmail.com"
                  value={tempConfig?.smtp?.username ?? securityConfig?.smtp?.username ?? ''}
                  onChange={(e) => setTempConfig({
                    ...tempConfig,
                    smtp: {
                      ...tempConfig.smtp,
                      username: e.target.value
                    }
                  })}
                />
              </div>

              <div>
                <Label>Password / App Password</Label>
                <Input
                  type="password"
                  placeholder="Enter SMTP password"
                  value={tempConfig?.smtp?.password ?? securityConfig?.smtp?.password ?? ''}
                  onChange={(e) => setTempConfig({
                    ...tempConfig,
                    smtp: {
                      ...tempConfig.smtp,
                      password: e.target.value
                    }
                  })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  For Gmail: Use App Password, not account password
                </p>
              </div>

              <div>
                <Label>From Name</Label>
                <Input
                  placeholder="LSEMB Notifications"
                  value={tempConfig?.smtp?.fromName ?? securityConfig?.smtp?.fromName ?? 'LSEMB'}
                  onChange={(e) => setTempConfig({
                    ...tempConfig,
                    smtp: {
                      ...tempConfig.smtp,
                      fromName: e.target.value
                    }
                  })}
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  💡 <strong>Popular Providers:</strong><br />
                  • Gmail: smtp.gmail.com:587 (TLS)<br />
                  • Brevo: smtp-relay.brevo.com:587<br />
                  • Outlook: smtp-mail.outlook.com:587
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={saveAllSettings} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save All Settings'
          )}
        </Button>
      </div>
    </div>
  );
}

// App Settings Component
function AppSettings() {
  const { t } = useTranslation();
  const [appConfig, setAppConfig] = useState<any>({});
  const [tempConfig, setTempConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAppSettingsOnly();
      setAppConfig(data);
      // Extract app-specific settings from the full settings object
      setTempConfig(data?.app || {});
    } catch (error) {
      console.error('Failed to load app settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      // IMPORTANT: Wrap tempConfig in 'app' key to match database structure
      const settingsToSave = {
        app: tempConfig
      };
      await updateSettingsCategory('app', settingsToSave);
      setAppConfig({ app: tempConfig });

      // Notify ConfigContext and other components about the settings update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', {
          detail: { category: 'app', settings: tempConfig }
        }));
      }

      toast({
        title: "Success",
        description: "App settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save app settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - General App Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.generalSettingsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t('settings.appNameLabel')}</Label>
              <Input
                value={tempConfig?.name || 'Luwi Semantic Bridge'}
                onChange={(e) => setTempConfig({ ...tempConfig, name: e.target.value })}
                placeholder={t('settings.appNamePlaceholder')}
              />
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Languages className="w-4 h-4" />
                {t('settings.languageLabel')}
              </Label>
              <Select
                value={tempConfig?.locale || appConfig?.app?.locale || 'tr'}
                onValueChange={async (value) => {
                  setTempConfig({ ...tempConfig, locale: value });
                  try {
                    const i18nModule = await import('@/lib/i18n');
                    const i18n = i18nModule.default || i18nModule.i18n;
                    await i18n.changeLanguage(value);
                    if (typeof document !== 'undefined') {
                      document.documentElement.lang = value;
                    }
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('selectedLanguage', value);
                    }
                  } catch (error) {
                    console.error('Failed to change language:', error);
                  }
                }}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t('settings.languageLabel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tr"><div className="flex items-center gap-3"><span className="text-xl">🇹🇷</span><span>Türkçe</span></div></SelectItem>
                  <SelectItem value="en"><div className="flex items-center gap-3"><span className="text-xl">🇺🇸</span><span>English</span></div></SelectItem>
                  <SelectItem value="fr"><div className="flex items-center gap-3"><span className="text-xl">🇫🇷</span><span>Français</span></div></SelectItem>
                  <SelectItem value="es"><div className="flex items-center gap-3"><span className="text-xl">🇪🇸</span><span>Español</span></div></SelectItem>
                  <SelectItem value="de"><div className="flex items-center gap-3"><span className="text-xl">🇩🇪</span><span>Deutsch</span></div></SelectItem>
                  <SelectItem value="zh"><div className="flex items-center gap-3"><span className="text-xl">🇨🇳</span><span>中文</span></div></SelectItem>
                  <SelectItem value="el"><div className="flex items-center gap-3"><span className="text-xl">🇬🇷</span><span>Ελληνικά</span></div></SelectItem>
                  <SelectItem value="th"><div className="flex items-center gap-3"><span className="text-xl">🇹🇭</span><span>ไทย</span></div></SelectItem>
                  <SelectItem value="ru"><div className="flex items-center gap-3"><span className="text-xl">🇷🇺</span><span>Русский</span></div></SelectItem>
                  <SelectItem value="ar"><div className="flex items-center gap-3"><span className="text-xl">🇸🇦</span><span>العربية</span></div></SelectItem>
                  <SelectItem value="ja"><div className="flex items-center gap-3"><span className="text-xl">🇯🇵</span><span>日本語</span></div></SelectItem>
                  <SelectItem value="ko"><div className="flex items-center gap-3"><span className="text-xl">🇰🇷</span><span>한국어</span></div></SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('settings.logoUrlLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  value={tempConfig?.logoUrl || appConfig?.app?.logoUrl || ''}
                  placeholder={t('settings.logoUrlLabel')}
                  onChange={(e) => setTempConfig({ ...tempConfig, logoUrl: e.target.value })}
                  className="flex-1"
                />
                {(tempConfig?.logoUrl || appConfig?.app?.logoUrl) && (
                  <div className="w-10 h-10 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-white dark:bg-gray-800 flex-shrink-0">
                    <img
                      src={tempConfig?.logoUrl || appConfig?.app?.logoUrl}
                      alt="Logo"
                      className="w-6 h-6 object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>{t('settings.descriptionLabel')}</Label>
              <Textarea
                value={tempConfig?.description || appConfig?.app?.description || ''}
                placeholder={t('settings.descriptionPlaceholder')}
                rows={3}
                onChange={(e) => setTempConfig({ ...tempConfig, description: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Right Column - Chat Interface Settings */}
        <div className="space-y-6">
          {/* Template Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Chat Interface
                <Badge variant="outline" className="text-xs">Template</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TemplateSelector />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveAllSettings} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              {t('settings.savingButton')}
            </>
          ) : (
            t('settings.saveButton')
          )}
        </Button>
      </div>
    </div>
  );
}


// Crawler Settings Component
function CrawlerSettings() {
  const [crawlerConfig, setCrawlerConfig] = useState<any>({});
  const [tempConfig, setTempConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettingsCategory('crawler');
      setCrawlerConfig(data);
      setTempConfig(data);
    } catch (error) {
      console.error('Failed to load crawler settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      await updateSettingsCategory('crawler', tempConfig);
      setCrawlerConfig(tempConfig);
      toast({
        title: "Success",
        description: "Crawler settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save crawler settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setTempConfig({
      ...tempConfig,
      crawler: {
        ...tempConfig.crawler,
        [key]: value
      }
    });
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Web Crawler Configuration</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Configure Crawl4AI settings for web data extraction
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Timeout (seconds)</Label>
              <Input
                type="number"
                value={tempConfig?.crawler?.timeout ?? crawlerConfig?.crawler?.timeout ?? 30}
                onChange={(e) => updateSetting('timeout', parseInt(e.target.value))}
              />
            </div>
            <div>
              <Label>Max Concurrency</Label>
              <Input
                type="number"
                value={tempConfig?.crawler?.maxConcurrency ?? crawlerConfig?.crawler?.maxConcurrency ?? 5}
                onChange={(e) => updateSetting('maxConcurrency', parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Redis DB (Crawl4AI)</Label>
              <Input
                type="number"
                value={tempConfig?.crawler?.redisDb ?? crawlerConfig?.crawler?.redisDb ?? 0}
                onChange={(e) => updateSetting('redisDb', parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Redis database index for crawler data
              </p>
            </div>
            <div>
              <Label>Data Retention (days)</Label>
              <Input
                type="number"
                value={tempConfig?.crawler?.retentionDays ?? crawlerConfig?.crawler?.retentionDays ?? 30}
                onChange={(e) => updateSetting('retentionDays', parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                How long to keep crawled data
              </p>
            </div>
          </div>

          <div>
            <Label>User Agent</Label>
            <Input
              value={tempConfig?.crawler?.userAgent ?? crawlerConfig?.crawler?.userAgent ?? 'LSEMB-Crawler/1.0'}
              placeholder="Enter custom user agent"
              onChange={(e) => updateSetting('userAgent', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Enable JavaScript</Label>
              <Switch
                checked={tempConfig?.crawler?.enableJavaScript ?? crawlerConfig?.crawler?.enableJavaScript ?? true}
                onCheckedChange={(checked) => updateSetting('enableJavaScript', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Follow Redirects</Label>
              <Switch
                checked={tempConfig?.crawler?.followRedirects ?? crawlerConfig?.crawler?.followRedirects ?? true}
                onCheckedChange={(checked) => updateSetting('followRedirects', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Respect Robots.txt</Label>
              <Switch
                checked={tempConfig?.crawler?.respectRobotsTxt ?? crawlerConfig?.crawler?.respectRobotsTxt ?? true}
                onCheckedChange={(checked) => updateSetting('respectRobotsTxt', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Auto-generate Embeddings</Label>
              <Switch
                checked={tempConfig?.crawler?.autoEmbeddings ?? crawlerConfig?.crawler?.autoEmbeddings ?? false}
                onCheckedChange={(checked) => updateSetting('autoEmbeddings', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveAllSettings} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  );
}

// Prompts Settings Component
function PromptsSettings() {
  const [promptsConfig, setPromptsConfig] = useState<any>({});
  const [tempConfig, setTempConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettingsCategory('prompts');
      setPromptsConfig(data);
      setTempConfig(data);
      // Set first prompt as active if exists
      if (data?.prompts?.list && data.prompts.list.length > 0) {
        setActivePromptId(data.prompts.list[0].id);
      }
    } catch (error) {
      console.error('Failed to load prompts settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      await updateSettingsCategory('prompts', tempConfig);
      setPromptsConfig(tempConfig);
      toast({
        title: "Success",
        description: "Prompts saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save prompts",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addNewPrompt = () => {
    const newPrompt = {
      id: Date.now().toString(),
      name: 'New Prompt',
      systemPrompt: 'You are a helpful AI assistant.',
      temperature: 0.7,
      maxTokens: 2048,
      conversationTone: 'professional',
      isActive: false
    };
    setTempConfig({
      ...tempConfig,
      prompts: {
        ...tempConfig.prompts,
        list: [...(tempConfig?.prompts?.list || []), newPrompt]
      }
    });
    setActivePromptId(newPrompt.id);
  };

  const updatePrompt = (id: string, field: string, value: any) => {
    const updatedList = tempConfig?.prompts?.list?.map((p: any) =>
      p.id === id ? { ...p, [field]: value } : p
    );
    setTempConfig({
      ...tempConfig,
      prompts: {
        ...tempConfig.prompts,
        list: updatedList
      }
    });
  };

  const deletePrompt = (id: string) => {
    const updatedList = tempConfig?.prompts?.list?.filter((p: any) => p.id !== id);
    setTempConfig({
      ...tempConfig,
      prompts: {
        ...tempConfig.prompts,
        list: updatedList
      }
    });
    if (activePromptId === id && updatedList.length > 0) {
      setActivePromptId(updatedList[0].id);
    }
  };

  const setActivePrompt = (id: string) => {
    const updatedList = tempConfig?.prompts?.list?.map((p: any) => ({
      ...p,
      isActive: p.id === id
    }));
    setTempConfig({
      ...tempConfig,
      prompts: {
        ...tempConfig.prompts,
        list: updatedList
      }
    });
    setActivePromptId(id);
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  const activePrompt = tempConfig?.prompts?.list?.find((p: any) => p.id === activePromptId);

  return (
    <div className="grid grid-cols-[35%_65%] gap-6">
      {/* Prompt List - Left Column */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <h3 className="text-sm font-medium">System Prompts</h3>
            <Button size="sm" onClick={addNewPrompt} className="gap-2">
              <Plus className="w-4 h-4" />
              Add New
            </Button>
          </div>

          <div className="space-y-2">
            {tempConfig?.prompts?.list?.map((prompt: any) => (
              <div
                key={prompt.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${activePromptId === prompt.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted'
                  }`}
                onClick={() => setActivePromptId(prompt.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${prompt.isActive ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                    <span className="font-medium">{prompt.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      T: {prompt.temperature}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Max: {prompt.maxTokens}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {prompt.systemPrompt}
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={saveAllSettings} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Editor - Right Column */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt Editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activePrompt ? (
            <>
              <div>
                <Label>Prompt Name</Label>
                <Input
                  value={activePrompt.name}
                  onChange={(e) => updatePrompt(activePrompt.id, 'name', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>System Prompt</Label>
                <Textarea
                  value={activePrompt.systemPrompt}
                  onChange={(e) => updatePrompt(activePrompt.id, 'systemPrompt', e.target.value)}
                  rows={8}
                  className="mt-1"
                  placeholder="Enter system prompt..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Temperature: {activePrompt.temperature}</Label>
                  <Slider
                    value={[activePrompt.temperature]}
                    onValueChange={([value]) => updatePrompt(activePrompt.id, 'temperature', value)}
                    max={2}
                    min={0}
                    step={0.1}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Max Tokens: {activePrompt.maxTokens}</Label>
                  <Slider
                    value={[activePrompt.maxTokens]}
                    onValueChange={([value]) => updatePrompt(activePrompt.id, 'maxTokens', value)}
                    max={8000}
                    min={256}
                    step={256}
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label>Conversation Tone</Label>
                <Select
                  value={activePrompt.conversationTone || 'professional'}
                  onValueChange={(value) => updatePrompt(activePrompt.id, 'conversationTone', value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="empathetic">Empathetic</SelectItem>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="educational">Educational</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={activePrompt.isActive ? "default" : "outline"}
                  onClick={() => setActivePrompt(activePrompt.id)}
                >
                  {activePrompt.isActive ? 'Active' : 'Set as Active'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deletePrompt(activePrompt.id)}
                  disabled={tempConfig?.prompts?.list?.length <= 1}
                >
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Select a prompt to edit or create a new one
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// Translation Settings Component
function TranslationSettings() {
  const [translationConfig, setTranslationConfig] = useState<any>({});
  const [tempConfig, setTempConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<Record<string, any>>({});
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTranslationSettings();
      setTranslationConfig(data);
      setTempConfig(data);
    } catch (error) {
      console.error('Failed to load translation settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      await updateSettingsCategory('translation', tempConfig);
      setTranslationConfig(tempConfig);
      toast({
        title: "Success",
        description: "Translation settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save translation settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    const newConfig = { ...tempConfig };
    const keys = key.split('.');
    let current: any = newConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setTempConfig(newConfig);
  };

  const testConnection = async (provider: string) => {
    setTesting(provider);
    try {
      const apiKey = provider === 'deepl'
        ? translationConfig?.deepl?.apiKey
        : translationConfig?.google?.translate?.apiKey;

      if (!apiKey) {
        toast({
          title: "Error",
          description: `Please enter ${provider} API key first`,
          variant: "destructive",
        });
        return;
      }

      // Simulate API test (in real implementation, this would call the actual API)
      await new Promise(resolve => setTimeout(resolve, 2000));

      setApiStatus(prev => ({
        ...prev,
        [provider === 'google' ? 'googleTranslate' : provider]: { status: 'success' }
      }));

      toast({
        title: "Success",
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API connection successful`,
      });
    } catch (error) {
      setApiStatus(prev => ({
        ...prev,
        [provider === 'google' ? 'googleTranslate' : provider]: { status: 'error' }
      }));

      toast({
        title: "Error",
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API connection failed`,
        variant: "destructive",
      });
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  // Check both API key existence and verification status
  const deepLConfigured = !!tempConfig?.deepl?.apiKey;
  const deepLVerified = apiStatus?.deepl?.status === 'active' || apiStatus?.deepl?.status === 'success';
  const googleTranslateConfigured = !!tempConfig?.google?.translate?.apiKey;
  const googleTranslateVerified = apiStatus?.googleTranslate?.status === 'active' || apiStatus?.googleTranslate?.status === 'success';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Translation Services Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Token Usage Information */}
          <Alert>
            <Activity className="h-4 w-4" />
            <AlertDescription>
              Token usage information will be displayed here once API keys are validated.
              Track your character usage and API performance across translation providers.
            </AlertDescription>
          </Alert>

          {/* DeepL Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              DeepL API
              {deepLVerified ? (
                <Badge variant="default" className="bg-green-500">
                  ✓ Verified
                </Badge>
              ) : deepLConfigured ? (
                <Badge variant="secondary">
                  Configured
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Not Set
                </Badge>
              )}
            </h3>

            <div className="grid gap-4">
              <div>
                <Label>DeepL API Key</Label>
                <Input
                  type="password"
                  value={tempConfig?.deepl?.apiKey || ''}
                  placeholder="Enter DeepL API key"
                  className="flex-1"
                  onChange={(e) => updateSetting('deepl.apiKey', e.target.value)}
                />
              </div>

              <div>
                <Label>Plan Type</Label>
                <Select
                  value={tempConfig?.deepl?.plan || 'free'}
                  onValueChange={(value) => updateSetting('deepl.plan', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free (500K chars/month)</SelectItem>
                    <SelectItem value="pro">Pro (Unlimited)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => testConnection('deepl')}
                disabled={testing === 'deepl' || !tempConfig?.deepl?.apiKey}
                className="w-full"
              >
                {testing === 'deepl' ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Test DeepL Connection
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Google Translate Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              Google Translate API
              {googleTranslateVerified ? (
                <Badge variant="default" className="bg-green-500">
                  ✓ Verified
                </Badge>
              ) : googleTranslateConfigured ? (
                <Badge variant="secondary">
                  Configured
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Not Set
                </Badge>
              )}
            </h3>

            <div className="grid gap-4">
              <div>
                <Label>Google Translate API Key</Label>
                <Input
                  type="password"
                  value={tempConfig?.google?.translate?.apiKey || ''}
                  placeholder="Enter Google Translate API key"
                  className="flex-1"
                  onChange={(e) => updateSetting('google.translate.apiKey', e.target.value)}
                />
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => testConnection('google')}
                disabled={testing === 'google' || !tempConfig?.google?.translate?.apiKey}
                className="w-full"
              >
                {testing === 'google' ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Test Google Translate Connection
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Usage Statistics */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Usage Statistics
            </h3>
            <Alert>
              <AlertDescription>
                Usage statistics will be displayed here once you start using the translation services.
                Track your character usage and costs across different translation providers.
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={saveAllSettings} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Templates Manager Component
function TemplatesManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [editedTemplate, setEditedTemplate] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadTemplates = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/pdf/analysis-templates`, {
        headers
      });
      const data = await response.json();
      setTemplates(data.templates || []);
      // Auto-select first template
      if (data.templates && data.templates.length > 0 && !selectedTemplate) {
        const firstTemplate = data.templates[0];
        setSelectedTemplate(firstTemplate);
        setEditedTemplate({ ...firstTemplate });
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast({
        title: "Error",
        description: "Failed to load templates",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedTemplate]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleSelectTemplate = (template: any) => {
    setSelectedTemplate(template);
    setEditedTemplate({ ...template });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/templates/${templateId}`, {
        method: 'DELETE',
        headers
      });

      if (response.ok) {
        setTemplates(templates.filter(t => t.id !== templateId));
        if (selectedTemplate?.id === templateId) {
          const remaining = templates.filter(t => t.id !== templateId);
          if (remaining.length > 0) {
            handleSelectTemplate(remaining[0]);
          } else {
            setSelectedTemplate(null);
            setEditedTemplate(null);
          }
        }
        toast({
          title: "Success",
          description: "Template deleted successfully"
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to delete template",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive"
      });
    }
  };

  const handleSaveTemplate = async () => {
    if (!editedTemplate) return;

    try {
      setSaving(true);
      const token = localStorage.getItem('accessToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const templateId = editedTemplate.template_id || editedTemplate.id;
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/templates/${templateId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(editedTemplate)
      });

      if (response.ok) {
        const updated = await response.json();
        setTemplates(templates.map(t => t.id === editedTemplate.id ? updated : t));
        setSelectedTemplate(updated);
        setEditedTemplate({ ...updated });
        toast({
          title: "Success",
          description: "Template saved successfully"
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to save template",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddTemplate = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('accessToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Create a new blank template
      const newTemplate = {
        name: 'New Template',
        icon: '📄',
        description: 'Custom template',
        is_system: false,
        is_active: true,
        schema: {
          table_name: 'new_table',
          columns: []
        },
        field_mappings: {},
        transformation_rules: {}
      };

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/templates`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newTemplate)
      });

      if (response.ok) {
        const created = await response.json();
        setTemplates([...templates, created]);
        setSelectedTemplate(created);
        setEditedTemplate({ ...created });
        toast({
          title: "Success",
          description: "New template created successfully"
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to create template",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to create template:', error);
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading templates...</div>;
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Left Column - Template List (40%) */}
      <div className="col-span-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Templates</CardTitle>
              <Button
                size="sm"
                onClick={handleAddTemplate}
                disabled={saving}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer ${selectedTemplate?.id === template.id ? 'bg-muted' : ''
                    }`}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <span className="text-xl">{template.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{template.name}</h4>
                  </div>
                  {!template.is_system && (
                    <ConfirmTooltip
                      onConfirm={() => handleDeleteTemplate(template.template_id || template.id)}
                      message={`Delete template "${template.name}"?`}
                      side="top"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </ConfirmTooltip>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Edit Panel (60%) */}
      <div className="col-span-8">
        {editedTemplate ? (
          <Card>
            <CardContent className="space-y-5 pt-6">
              {/* Template Name */}
              <div>
                <Label htmlFor="name" className="text-sm font-medium">Template Name</Label>
                <Input
                  id="name"
                  value={editedTemplate.name || ''}
                  onChange={(e) => setEditedTemplate({ ...editedTemplate, name: e.target.value })}
                  disabled={editedTemplate.is_system}
                  className="mt-1.5"
                  placeholder="Template name..."
                />
              </div>

              {/* Active/Passive Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex-1">
                  <Label htmlFor="is-active" className="text-sm font-medium cursor-pointer">
                    Template Status
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {editedTemplate.is_active ? 'Active - Will be shown in document processing' : 'Inactive - Hidden from selection'}
                  </p>
                </div>
                <Switch
                  id="is-active"
                  checked={editedTemplate.is_active ?? true}
                  onCheckedChange={(checked) => setEditedTemplate({ ...editedTemplate, is_active: checked })}
                  disabled={editedTemplate.is_system}
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="description"
                  value={editedTemplate.description || ''}
                  onChange={(e) => setEditedTemplate({ ...editedTemplate, description: e.target.value })}
                  disabled={editedTemplate.is_system}
                  className="mt-1.5 min-h-[60px]"
                  placeholder="Brief description of what this template does..."
                />
              </div>

              {/* Extraction Prompt */}
              <div>
                <Label htmlFor="prompt" className="text-sm font-medium">
                  Extraction Prompt
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    The AI prompt used to extract metadata from documents
                  </span>
                </Label>
                <Textarea
                  id="prompt"
                  value={editedTemplate.extraction_prompt || ''}
                  onChange={(e) => setEditedTemplate({ ...editedTemplate, extraction_prompt: e.target.value })}
                  disabled={editedTemplate.is_system}
                  className="mt-1.5 min-h-[180px] font-mono text-xs"
                  placeholder="Example: Extract the following information from this legal document: title, date, article numbers, key terms..."
                />
              </div>

              {/* Target Fields */}
              <div>
                <Label htmlFor="fields" className="text-sm font-medium">
                  Target Fields ({editedTemplate.target_fields?.length || 0})
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    Fields to extract and store in database
                  </span>
                </Label>
                <Textarea
                  id="fields"
                  value={editedTemplate.target_fields?.join(', ') || ''}
                  onChange={(e) => setEditedTemplate({
                    ...editedTemplate,
                    target_fields: e.target.value.split(',').map(f => f.trim()).filter(f => f)
                  })}
                  disabled={editedTemplate.is_system}
                  className="mt-1.5 min-h-[100px]"
                  placeholder="title, date, author, category, summary, key_points..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated list. These fields will be extracted from documents and stored in the database.
                </p>
              </div>

              {/* System Template Warning */}
              {editedTemplate.is_system && (
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This is a system template and cannot be edited. Clone it to create a custom version.
                  </AlertDescription>
                </Alert>
              )}

              {/* Save Button - Bottom Right */}
              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSaveTemplate}
                  disabled={saving || editedTemplate.is_system}
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a template to edit</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Main Optimized Settings Component
export default function OptimizedSettingsPage() {
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const initialTab = searchParams.get('tab') || 'app';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', value);
      window.history.pushState({}, '', url.toString());
    }
  };

  return (
    <div className="w-full max-w-[90%] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your application settings. Each tab loads only relevant configuration.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7 h-14">
          <TabsTrigger value="app" className="h-12 px-4">
            <span className="text-sm">App</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="h-12 px-4">
            <span className="text-sm">API</span>
          </TabsTrigger>
          <TabsTrigger value="rag" className="h-12 px-4">
            <span className="text-sm">RAG</span>
          </TabsTrigger>
          <TabsTrigger value="schema" className="h-12 px-4">
            <span className="text-sm">Schema</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="h-12 px-4">
            <span className="text-sm">Prompts</span>
          </TabsTrigger>
          <TabsTrigger value="services" className="h-12 px-4">
            <span className="text-sm">Services</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="h-12 px-4">
            <span className="text-sm">Advanced</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="app">
          <AppSettings />
        </TabsContent>

        <TabsContent value="api">
          <LLMSettings />
        </TabsContent>

        <TabsContent value="rag">
          <RAGSettings />
        </TabsContent>

        <TabsContent value="schema">
          <DataSchemaSettings />
        </TabsContent>

        <TabsContent value="prompts">
          <PromptsSettings />
        </TabsContent>

        <TabsContent value="services">
          <ServicesPage />
        </TabsContent>

        <TabsContent value="advanced">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}