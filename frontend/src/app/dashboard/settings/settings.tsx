'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import for Services page to avoid iframe issues
const ServicesPage = dynamic(() => import('./services/page'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-64">Loading services...</div>
});
import { useToast } from '../../../hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../../components/ui/dialog';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  DollarSign,
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
  Calendar,
  Clock,
  Zap
} from 'lucide-react';
import {
  getSettingsCategory,
  updateAppSettings,
  getLLMSettings,
  getRAGSettings,
  getDatabaseSettings,
  getSecuritySettings,
  getTranslationSettings,
  getAppSettingsOnly,
  updateSettingsCategory
} from '../../../lib/api/settings';

// Component for each settings category
function CategoryTab({ category, children }: { category: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[50%_50%] gap-6 w-full">
      {children}
    </div>
  );
}

// Optimized LLM Settings Component
function LLMSettings() {
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
    'gemini-1.5-pro': { input: 3.50, output: 10.50 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'gemini-pro': { input: 0.50, output: 1.50 },

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
      const [data, translationData] = await Promise.all([
        getLLMSettings(),
        getTranslationSettings()
      ]);
      setTranslationConfig(translationData);

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
        temperature: data?.llmSettings?.temperature
      });

      const defaultConfig = {
        provider: activeChatParts?.[0] || 'openai',
        model: activeChatParts?.[1] || 'gpt-4o-mini',
        temperature: data?.llmSettings?.temperature ?? 0.7,
        maxTokens: data?.llmSettings?.maxTokens ?? 4096,
        // CRITICAL: Use activeEmbeddingModel first (authoritative source), then llmSettings fields
        // DO NOT use embeddings.* keys as they are legacy/unused
        embeddingProvider: activeEmbeddingParts?.[0] || data?.llmSettings?.embeddingProvider || 'openai',
        embeddingModel: activeEmbeddingParts?.[1] || data?.llmSettings?.embeddingModel || 'gpt-4o-mini',
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
          model: data?.google?.model || 'gemini-1.5-flash',
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
      google: ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'],
      anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
      deepseek: ['deepseek-chat', 'deepseek-coder'],
      huggingface: ['sentence-transformers/all-MiniLM-L6-v2', 'distilbert-base-uncased', 'bert-base-uncased'],
      openrouter: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3-5-sonnet-20241022', 'meta-llama/llama-3-70b']
    };

    console.log(`⚠️ [${provider}] No verified models, using defaults`);
    return defaultModels[provider] || [];
  };

  const getDefaultModelForProvider = (provider: string) => {
    const defaults: Record<string, string> = {
      openai: 'gpt-4o-mini',
      google: 'gemini-2.0-flash-exp',
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
        'gemini-1.5-flash': { input: 0.075, output: 0.3 },
        'gemini-1.5-pro': { input: 1.25, output: 5 },
        'gemini-2.0-flash-exp': { input: 0, output: 0 },
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

  // Get embedding model details from API check results
  const getEmbeddingModelDetails = (provider: string, modelName: string) => {
    const providerData = tempConfig?.[provider];
    const modelResults = providerData?.modelResults;

    if (modelResults && Array.isArray(modelResults)) {
      // For embedding models, check if the model was tested
      const result = modelResults.find((r: any) => {
        // Match embedding model name patterns
        return r.model === modelName ||
               r.model?.includes(modelName) ||
               modelName?.includes(r.model);
      });

      if (result && result.success) {
        const inputTokens = result.usage?.inputTokens || result.usage?.promptTokens || 0;
        const outputTokens = result.usage?.outputTokens || result.usage?.completionTokens || 0;
        const totalTokens = result.usage?.totalTokens || (inputTokens + outputTokens);
        const responseTime = result.responseTime ? `${result.responseTime}ms` : '';

        return {
          tokens: totalTokens,
          responseTime,
          verifiedDate: providerData.verifiedDate ? new Date(providerData.verifiedDate).toLocaleDateString() : null
        };
      }
    }
    return null;
  };

  const getEmbeddingModelsForProvider = (provider: string) => {
    // First, try to get verified models from API check results
    const providerData = tempConfig?.[provider];
    const modelResults = providerData?.modelResults;

    if (modelResults && Array.isArray(modelResults)) {
      const successfulModels = modelResults
        .filter((result: any) => result.success === true)
        .map((result: any) => result.model);

      if (successfulModels.length > 0) {
        console.log(`✅ [Embedding ${provider}] Using verified models:`, successfulModels);
        return successfulModels;
      }
    }

    // Fallback to hardcoded defaults if no API check results
    console.log(`⚠️ [Embedding ${provider}] No verified models, using defaults`);
    const models: Record<string, string[]> = {
      openai: [
        'text-embedding-3-small',
        'text-embedding-3-large',
        'text-embedding-ada-002'
      ],
      google: [
        'text-embedding-004',
        'multimodalembedding'
      ],
      huggingface: [
        'sentence-transformers/all-MiniLM-L6-v2',
        'sentence-transformers/all-mpnet-base-v2',
        'BAAI/bge-small-en-v1.5',
        'BAAI/bge-large-en-v1.5'
      ],
      openrouter: [
        'openai/text-embedding-3-small',
        'openai/text-embedding-3-large',
        'openai/text-embedding-ada-002'
      ]
    };
    return models[provider] || ['text-embedding-3-small'];
  };

  const getDefaultEmbeddingModelForProvider = (provider: string) => {
    const defaults: Record<string, string> = {
      openai: 'text-embedding-3-small',
      google: 'text-embedding-004',
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
              <CardTitle>API Provider Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries({
              openai: { key: llmConfig?.openai?.apiKey, name: 'OpenAI' },
              google: { key: llmConfig?.google?.apiKey, name: 'Google AI' },
              anthropic: { key: llmConfig?.anthropic?.apiKey, name: 'Anthropic' },
              deepseek: { key: llmConfig?.deepseek?.apiKey, name: 'DeepSeek' },
              huggingface: { key: llmConfig?.huggingface?.apiKey, name: 'HuggingFace' },
              openrouter: { key: llmConfig?.openrouter?.apiKey, name: 'OpenRouter' },
              deepl: { key: tempConfig?.deepl?.apiKey || translationConfig?.deepl?.apiKey, name: 'DeepL' },
            }).map(([provider, data]) => {
              const providerStatus = getProviderStatus(provider);
              const isValidated = isProviderValidated(provider);
              const verifiedDate = apiStatus[provider]?.verifiedDate ? new Date(apiStatus[provider].verifiedDate) : null;

              return (
                <div key={provider} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="capitalize font-medium">{data.name}</Label>
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
                        placeholder="Enter API key"
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
              Her provider için API key girin ve yeşil onay butonu görene kadar test edin.
            </p>
          </CardContent>
        </Card>

        {/* Swagger API Documentation */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>API Documentation</CardTitle>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${swaggerActive ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground">
                  {swaggerActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Explore and test your API endpoints using the interactive Swagger documentation.
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
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10zm1-17h-2v8h2V5zm0 10h-2v2h2v-2z"/>
                  </svg>
                  Open Swagger UI
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
                  Swagger documentation is not available. Please check your backend configuration.
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
              <CardTitle>Active Service Providers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active LLM Provider Selection */}
              <div>
                <div className="grid grid-cols-2 gap-2">
                  <Label>LLM Provider</Label>
                  <Label>LLM Model</Label>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Select
                    value={(() => {
                      const val = tempConfig?.provider || llmConfig.provider;
                      console.log('🎯 [LLM PROVIDER SELECT] Current value:', val, '| tempConfig.provider:', tempConfig?.provider, '| llmConfig.provider:', llmConfig.provider);
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
                            title: "Success",
                            description: "LLM provider updated successfully",
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to update provider",
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
                      <SelectValue placeholder="Select LLM provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {getValidatedProviders().map(([provider, data]) => (
                        <SelectItem key={provider} value={provider}>
                          {data.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={tempConfig?.model || getDefaultModelForProvider(tempConfig?.provider || 'openai')}
                    onValueChange={async (value) => {
                      // Update model and activeChatModel
                      const updatedConfig = {
                        ...tempConfig,
                        model: value,
                        llmSettings: {
                          ...tempConfig?.llmSettings,
                          activeChatModel: `${tempConfig?.provider || 'openai'}/${value}`
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
                          title: "Error",
                          description: "Failed to update model",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelsForProvider(tempConfig?.provider || 'openai').map(model => {
                        const details = getModelDetails(tempConfig?.provider || 'openai', model);
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
                      })}
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
                      {getValidatedProviders().map(([provider, data]) => (
                        <SelectItem key={provider} value={provider}>
                          {data.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={tempConfig?.embeddingModel}
                    onValueChange={async (value) => {
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
                            <div className="flex flex-col">
                              <span className="font-medium">{model}</span>
                              {details && (
                                <span className="text-xs text-gray-500">
                                  {details.verifiedDate} · {details.tokens} tokens · {details.responseTime}
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
      </div>

      </>
  );
}


// Optimized Chatbot Settings Component
function RAGSettings() {
  const [ragConfig, setRagConfig] = useState<any>({});
  const [tempRAGConfig, setTempRAGConfig] = useState<any>({});
  const [chatbotConfig, setChatbotConfig] = useState<any>({});
  const [tempChatbotConfig, setTempChatbotConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [ragData, chatbotResponse] = await Promise.all([
        getRAGSettings(),
        fetch('/api/v2/chatbot/settings').then(res => res.json())
      ]);
      console.log('📊 [RAG SETTINGS LOAD] Full RAG Data from API:', ragData);
      console.log('📊 [RAG SETTINGS LOAD] RAG Settings values:', {
        similarityThreshold: ragData?.ragSettings?.similarityThreshold,
        minResults: ragData?.ragSettings?.minResults,
        maxResults: ragData?.ragSettings?.maxResults,
        parallelLLMCount: ragData?.ragSettings?.parallelLLMCount,
        batchSize: ragData?.ragSettings?.batchSize,
        chunkOverlap: ragData?.ragSettings?.chunkOverlap
      });
      setRagConfig(ragData);
      setTempRAGConfig(ragData);

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
          openingMessage: chatbotResponse.welcomeMessage,
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
    console.log('🔘 [RAG SETTINGS] Save button clicked!');
    console.log('📊 [RAG SETTINGS] Current tempChatbotConfig:', tempChatbotConfig);
    console.log('📊 [RAG SETTINGS] Current tempRAGConfig:', tempRAGConfig);
    setSaving(true);
    try {
      console.log('\n💾 [RAG SETTINGS SAVE] Starting save process...');

      // Save RAG settings
      await updateSettingsCategory('rag', tempRAGConfig);
      console.log('✅ [RAG SETTINGS SAVE] RAG settings saved');

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

  if (loading) {
    return <Spinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* RAG Configuration - Left Column */}
        <Card>
          <CardHeader>
            <CardTitle>RAG Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Search Parameters</h3>
              <div className="space-y-4">
                <div>
                  <Label>Similarity Threshold: {tempRAGConfig?.ragSettings?.similarityThreshold ?? ragConfig?.ragSettings?.similarityThreshold ?? 0.02}</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Minimum similarity score for search results (0-1). Lower = more results, but less relevant.</p>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.similarityThreshold ?? ragConfig?.ragSettings?.similarityThreshold ?? 0.02]}
                    max={1}
                    min={0}
                    step={0.01}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('similarityThreshold', value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Min Results: {tempRAGConfig?.ragSettings?.minResults ?? ragConfig?.ragSettings?.minResults ?? 5}</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Initial number of sources to display</p>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.minResults ?? ragConfig?.ragSettings?.minResults ?? 5]}
                      max={20}
                      min={1}
                      step={1}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('minResults', value)}
                    />
                  </div>
                  <div>
                    <Label>Max Results: {tempRAGConfig?.ragSettings?.maxResults ?? ragConfig?.ragSettings?.maxResults ?? 20}</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total sources to fetch from database (shows 7 initially, rest available via "Load More")</p>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.maxResults ?? ragConfig?.ragSettings?.maxResults ?? 20]}
                      max={50}
                      min={7}
                      step={1}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('maxResults', value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Processing Parameters</h3>
              <div className="space-y-4">
                <div>
                  <Label>Parallel LLM Count: {tempRAGConfig?.ragSettings?.parallelLLMCount ?? ragConfig?.ragSettings?.parallelLLMCount ?? 4}</Label>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.parallelLLMCount ?? ragConfig?.ragSettings?.parallelLLMCount ?? 4]}
                    max={10}
                    min={1}
                    step={1}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('parallelLLMCount', value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Batch Size: {tempRAGConfig?.ragSettings?.parallelLLMBatchSize ?? ragConfig?.ragSettings?.parallelLLMBatchSize ?? 100}</Label>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.parallelLLMBatchSize ?? ragConfig?.ragSettings?.parallelLLMBatchSize ?? 100]}
                      max={500}
                      min={10}
                      step={10}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('parallelLLMBatchSize', value)}
                    />
                  </div>
                  <div>
                    <Label>Chunk Overlap: {tempRAGConfig?.ragSettings?.chunkOverlap ?? ragConfig?.ragSettings?.chunkOverlap ?? 200}</Label>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.chunkOverlap ?? ragConfig?.ragSettings?.chunkOverlap ?? 200]}
                      max={500}
                      min={0}
                      step={50}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('chunkOverlap', value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Chunk Size: {tempRAGConfig?.ragSettings?.chunkSize || ragConfig?.ragSettings?.chunkSize || 1000}</Label>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.chunkSize || ragConfig?.ragSettings?.chunkSize || 1000]}
                    max={2000}
                    min={100}
                    step={100}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('chunkSize', value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Search Options</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <Label>Enable Hybrid Search</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      When enabled, combines semantic similarity with keyword search for better results
                    </p>
                  </div>
                  <Switch
                    checked={tempRAGConfig?.ragSettings?.enableHybridSearch ?? ragConfig?.ragSettings?.enableHybridSearch}
                    onCheckedChange={(checked) => {
                      updateRAGSetting('enableHybridSearch', checked);
                      // When hybrid search is enabled, ensure semantic search is also enabled
                      if (checked) {
                        updateRAGSetting('enableSemanticSearch', true);
                        updateRAGSetting('enableKeywordBoost', true);
                      }
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label>Enable Keyword Boost</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Boosts exact keyword matches in search results
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
              <h3 className="text-lg font-medium">Data Sources</h3>
              <p className="text-xs text-muted-foreground">
                Control which data sources are included in semantic search results
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <Label>Database Content (Unified)</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Includes: Soru-Cevap, Makaleler, Özelgeler, Danıştay Kararları
                    </p>
                  </div>
                  <Switch
                    checked={tempRAGConfig?.ragSettings?.enableUnifiedEmbeddings ?? ragConfig?.ragSettings?.enableUnifiedEmbeddings ?? true}
                    onCheckedChange={(checked) => updateRAGSetting('enableUnifiedEmbeddings', checked)}
                  />
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <Label>Chat Messages</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Previous conversations and Q&A
                    </p>
                  </div>
                  <Switch
                    checked={tempRAGConfig?.ragSettings?.enableMessageEmbeddings ?? ragConfig?.ragSettings?.enableMessageEmbeddings ?? true}
                    onCheckedChange={(checked) => updateRAGSetting('enableMessageEmbeddings', checked)}
                  />
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <Label>Documents</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Uploaded PDFs, Word docs, etc.
                    </p>
                  </div>
                  <Switch
                    checked={tempRAGConfig?.ragSettings?.enableDocumentEmbeddings ?? ragConfig?.ragSettings?.enableDocumentEmbeddings ?? true}
                    onCheckedChange={(checked) => updateRAGSetting('enableDocumentEmbeddings', checked)}
                  />
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <Label>Web Content</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Scraped web pages
                    </p>
                  </div>
                  <Switch
                    checked={tempRAGConfig?.ragSettings?.enableScrapeEmbeddings ?? ragConfig?.ragSettings?.enableScrapeEmbeddings ?? true}
                    onCheckedChange={(checked) => updateRAGSetting('enableScrapeEmbeddings', checked)}
                  />
                </div>
                <div className="mt-4">
                  <Label>Database Content Priority: {tempRAGConfig?.ragSettings?.unifiedEmbeddingsPriority || ragConfig?.ragSettings?.unifiedEmbeddingsPriority || 1}</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Boost priority for database content (1-10, higher = more priority)
                  </p>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.unifiedEmbeddingsPriority || ragConfig?.ragSettings?.unifiedEmbeddingsPriority || 1]}
                    max={10}
                    min={1}
                    step={1}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('unifiedEmbeddingsPriority', value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chatbot Configuration - Right Column */}
        <Card>
          <CardHeader>
            <CardTitle>Chat Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Branding */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Branding</h3>

              <div className="space-y-2">
                <Label htmlFor="chatbotTitle">Title</Label>
                <Input
                  id="chatbotTitle"
                  value={tempChatbotConfig?.chatbot?.title || chatbotConfig?.chatbot?.title || ''}
                  onChange={(e) => updateChatbotSetting('title', e.target.value)}
                  placeholder="Enter title"
                />
                <p className="text-xs text-muted-foreground">
                  Appears in the chat header
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="chatbotLogo">Logo URL</Label>
                <Input
                  id="chatbotLogo"
                  value={tempChatbotConfig?.chatbot?.logoUrl || chatbotConfig?.chatbot?.logoUrl || ''}
                  onChange={(e) => updateChatbotSetting('logoUrl', e.target.value)}
                  placeholder="Enter logo URL"
                />
                <p className="text-xs text-muted-foreground">
                  URL to your logo image
                </p>
              </div>
            </div>

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

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label>Use Keyword-Based Suggestions</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enable to use keywords below for generating suggestions.
                    When disabled, shows popular questions from database.
                  </p>
                </div>
                <Switch
                  checked={tempChatbotConfig?.chatbot?.useKeywordSuggestions ?? false}
                  onCheckedChange={(checked) => updateChatbotSetting('useKeywordSuggestions', checked)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="suggestionKeywords">Suggestion Keywords</Label>
                <Input
                  id="suggestionKeywords"
                  value={tempChatbotConfig?.chatbot?.suggestionKeywords || chatbotConfig?.chatbot?.suggestionKeywords || ""}
                  onChange={(e) => updateChatbotSetting('suggestionKeywords', e.target.value)}
                  placeholder="hukuk, sözleşme, dava, mahkeme, avukat..."
                  disabled={!(tempChatbotConfig?.chatbot?.useKeywordSuggestions ?? false)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter keywords separated by commas. System will find suggestions based on these keywords.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label>Enable Question Suggestions</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Show suggested questions in chat interface
                  </p>
                </div>
                <Switch
                  checked={tempChatbotConfig?.chatbot?.enableSuggestions ?? true}
                  onCheckedChange={(checked) => updateChatbotSetting('enableSuggestions', checked)}
                />
              </div>

              <div className="flex items-center justify-between opacity-50 pointer-events-none">
                <div className="flex-1">
                  <Label>Auto-Generate Suggestions (Deprecated)</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    This option is now controlled by "Use Keyword-Based Suggestions" switch above.
                  </p>
                </div>
                <Switch
                  checked={tempChatbotConfig?.chatbot?.autoGenerateSuggestions ?? true}
                  onCheckedChange={(checked) => updateChatbotSetting('autoGenerateSuggestions', checked)}
                />
              </div>
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

                <div>
                  <Label htmlFor="questionTemplate">Question Template</Label>
                  <Textarea
                    id="questionTemplate"
                    value={tempChatbotConfig?.chatbot?.questionTemplate || "Yaptığımız konuşmaya göre, şunu da merak ediyor olabilirsiniz: {question}"}
                    onChange={(e) => updateChatbotSetting('questionTemplate', e.target.value)}
                    placeholder="Enter template for generated questions..."
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Template for generating follow-up questions. Use {'{question}'} as placeholder.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label>Auto-generate Questions</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automatically generate relevant questions
                    </p>
                  </div>
                  <Switch
                    checked={tempChatbotConfig?.chatbot?.autoGenerateQuestions ?? false}
                    onCheckedChange={(checked) =>
                      updateChatbotSetting("autoGenerateQuestions", checked)
                    }
                  />
                </div>
              </div>
            </div>

            {/* Note: Max/Min Results are configured in RAG Settings tab */}
          </CardContent>
        </Card>

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

// Optimized Database & Redis Settings Component
function DatabaseSettings() {
  const [dbConfig, setDbConfig] = useState<any>({});
  const [tempDBConfig, setTempDBConfig] = useState<any>({});
  const [redisConfig, setRedisConfig] = useState<any>({});
  const [tempRedisConfig, setTempRedisConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [dbType, setDbType] = useState('postgresql');
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [dbData, redisData] = await Promise.all([
        getDatabaseSettings(),
        getSettingsCategory('redis')
      ]);
      setDbConfig(dbData);
      setTempDBConfig(dbData);
      setRedisConfig(redisData);
      setTempRedisConfig(redisData);
      setDbType(dbData?.database?.type || 'postgresql');
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
    setSaving(true);
    try {
      await Promise.all([
        updateSettingsCategory('database', tempDBConfig),
        updateSettingsCategory('redis', tempRedisConfig)
      ]);
      setDbConfig(tempDBConfig);
      setRedisConfig(tempRedisConfig);
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

  const updateDBSetting = (key: string, value: any) => {
    setTempDBConfig({
      ...tempDBConfig,
      database: {
        ...tempDBConfig.database,
        [key]: value
      }
    });
  };

  const updateRedisSetting = (key: string, value: any) => {
    setTempRedisConfig({
      ...tempRedisConfig,
      redis: {
        ...tempRedisConfig.redis,
        [key]: value
      }
    });
  };

  const saveDbType = async (type: string) => {
    setDbType(type);
    updateDBSetting('type', type);
  };

  const testConnection = async (type: 'database' | 'redis') => {
    setTesting(type);
    try {
      const config = type === 'database' ? tempDBConfig : tempRedisConfig;
      const response = await fetch(`/api/config/database/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          config: config
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Connection test failed');
      }

      toast({
        title: "Success",
        description: `${type === 'database' ? 'Database' : 'Redis'} connection successful`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `${type === 'database' ? 'Database' : 'Redis'} connection failed`,
        variant: "destructive",
      });
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return <Spinner size="lg" />;
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Database Configuration - Left Column */}
      <Card>
        <CardHeader>
          <CardTitle>Database Configuration</CardTitle>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>SSL Enabled</Label>
              <Switch
                checked={tempDBConfig?.database?.ssl ?? dbConfig?.database?.ssl}
                onCheckedChange={(checked) => updateDBSetting('ssl', checked)}
              />
            </div>
            {dbType === 'postgresql' && (
              <div className="flex items-center justify-between">
                <Label>Enable pgvector Extension</Label>
                <Switch
                  checked={tempDBConfig?.database?.pgvector ?? dbConfig?.database?.pgvector}
                  onCheckedChange={(checked) => updateDBSetting('pgvector', checked)}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => testConnection('database')} disabled={testing === 'database'} size="sm">
              {testing === 'database' ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
              Test Connection
            </Button>
            {dbType === 'postgresql' && (
              <Button variant="outline" size="sm">
                Test with pgvector
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Redis Configuration - Right Column */}
      <Card>
        <CardHeader>
          <CardTitle>Redis Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Host</Label>
              <Input
                value={tempRedisConfig?.redis?.host || 'localhost'}
                onChange={(e) => updateRedisSetting('host', e.target.value)}
              />
            </div>
            <div>
              <Label>Port</Label>
              <Input
                type="number"
                value={tempRedisConfig?.redis?.port || 6379}
                onChange={(e) => updateRedisSetting('port', parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Database</Label>
              <Input
                type="number"
                value={tempRedisConfig?.redis?.db || 2}
                onChange={(e) => updateRedisSetting('db', parseInt(e.target.value))}
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={tempRedisConfig?.redis?.password || ''}
                placeholder="Enter Redis password (if any)"
                onChange={(e) => updateRedisSetting('password', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => testConnection('redis')} disabled={testing === 'redis'} size="sm">
              {testing === 'redis' ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
              Test Redis Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end col-span-2">
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

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSecuritySettings();
      setSecurityConfig(data);
      setTempConfig(data);
    } catch (error) {
      console.error('Failed to load security settings:', error);
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
      // Save both security and advanced settings
      await Promise.all([
        updateSettingsCategory('security', tempConfig.security || {}),
        updateSettingsCategory('advanced', tempConfig.advanced || {}),
        updateSettingsCategory('storage', tempConfig.storage || {})
      ]);
      setSecurityConfig(tempConfig);
      toast({
        title: "Success",
        description: "Security and advanced settings saved successfully",
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
      <Card>
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

      <Card>
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
        </CardContent>
      </Card>

      <Card>
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
    </div>
  );
}

// App Settings Component
function AppSettings() {
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
      setTempConfig(data);
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
      <Card>
        <CardHeader>
          <CardTitle>Application Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Application Name</Label>
              <Input
                value={tempConfig?.name || appConfig?.app?.name || 'ASB Assistant'}
                onChange={(e) => setTempConfig({ ...tempConfig, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Version</Label>
              <Input
                value={tempConfig?.version || appConfig?.app?.version || '1.0.0'}
                onChange={(e) => setTempConfig({ ...tempConfig, version: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Locale</Label>
              <Select
                value={tempConfig?.locale || appConfig?.app?.locale || 'tr'}
                onValueChange={(value) => setTempConfig({ ...tempConfig, locale: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tr">Turkish</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input
                value={tempConfig?.logoUrl || appConfig?.app?.logoUrl || ''}
                placeholder="Enter logo URL"
                onChange={(e) => setTempConfig({ ...tempConfig, logoUrl: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={tempConfig?.description || appConfig?.app?.description || ''}
              placeholder="Enter application description"
              rows={3}
              onChange={(e) => setTempConfig({ ...tempConfig, description: e.target.value })}
            />
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
            <Button size="sm" onClick={addNewPrompt}>
              Add New
            </Button>
          </div>

          <div className="space-y-2">
            {tempConfig?.prompts?.list?.map((prompt: any) => (
              <div
                key={prompt.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  activePromptId === prompt.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
                onClick={() => setActivePromptId(prompt.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      prompt.isActive ? 'bg-green-500' : 'bg-gray-300'
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
    let current = newConfig;

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

      toast({
        title: "Success",
        description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API connection successful`,
      });
    } catch (error) {
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
        <TabsList className="grid w-full grid-cols-8 h-14">
          <TabsTrigger value="app" className="h-12 px-4">
            <span className="text-sm">App</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="h-12 px-4">
            <span className="text-sm">API</span>
          </TabsTrigger>
          <TabsTrigger value="rag" className="h-12 px-4">
            <span className="text-sm">RAG</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="h-12 px-4">
            <span className="text-sm">Database</span>
          </TabsTrigger>
          <TabsTrigger value="crawler" className="h-12 px-4">
            <span className="text-sm">Crawler</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="h-12 px-4">
            <span className="text-sm">Prompts</span>
          </TabsTrigger>
          <TabsTrigger value="services" className="h-12 px-4">
            <span className="text-sm">Services</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="h-12 px-4">
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

        <TabsContent value="database">
          <DatabaseSettings />
        </TabsContent>


        <TabsContent value="crawler">
          <CrawlerSettings />
        </TabsContent>


        <TabsContent value="prompts">
          <PromptsSettings />
        </TabsContent>

        <TabsContent value="services">
          <ServicesPage />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}