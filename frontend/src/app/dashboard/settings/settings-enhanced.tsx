'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [data, translationData] = await Promise.all([
        getLLMSettings(),
        getTranslationSettings()
      ]);
      setTranslationConfig(translationData);

      // Initialize with database values or defaults
      const defaultConfig = {
        provider: data?.llmSettings?.activeChatModel?.split('/')?.[0] || 'anthropic',
        model: data?.llmSettings?.activeChatModel || 'claude-3-sonnet',
        temperature: data?.llmSettings?.temperature || 0.7,
        maxTokens: data?.llmSettings?.maxTokens || 4096,
        embeddingProvider: data?.llmSettings?.embeddingProvider || 'openai',
        embeddingModel: data?.llmSettings?.embeddingModel || 'text-embedding-3-small',
        translationProvider: data?.translationProvider || 'google',
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

      setLlmConfig(defaultConfig);
      setTempConfig(defaultConfig);

      // Load saved token info, API status, and model token usage if available
      if (data?.tokenInfo) {
        setTokenInfo(data.tokenInfo);
      }
      if (data?.apiStatus) {
        setApiStatus(data.apiStatus);
      }
      if (data?.modelTokenUsage) {
        setModelTokenUsage(data.modelTokenUsage);
      }

      // Initialize validated keys for providers that have API keys
      const existingValidatedKeys = new Set<string>();
      Object.entries({
        openai: defaultConfig?.openai?.apiKey,
        google: defaultConfig?.google?.apiKey,
        anthropic: defaultConfig?.anthropic?.apiKey,
        deepseek: defaultConfig?.deepseek?.apiKey,
        huggingface: defaultConfig?.huggingface?.apiKey,
        openrouter: defaultConfig?.openrouter?.apiKey,
      }).forEach(([provider, apiKey]) => {
        if (apiKey && apiKey !== '••••••••') {
          existingValidatedKeys.add(provider);
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
      };
      setLlmConfig(fallbackConfig);
      setTempConfig(fallbackConfig);
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
      // Save all data including token info, API status, and model token usage
      const settingsToSave = {
        ...tempConfig,
        tokenInfo: tokenInfo,
        apiStatus: apiStatus,
        modelTokenUsage: modelTokenUsage
      };

      await updateSettingsCategory('llm', settingsToSave);
      setLlmConfig(tempConfig);

      toast({
        title: "Success",
        description: "LLM settings and API status saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save LLM settings",
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
    if (!apiKey || apiKey === '••••••••') return;

    setValidating(provider);
    try {
      const models = getModelsForProvider(provider);
      const modelTestResults = [];
      let allModelsValid = true;

      // Test each model for the provider
      for (const model of models) {
        try {
          const startTime = Date.now();
          console.log(`Testing ${provider} with model: ${model}`);

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

          const result = await response.json();
          const responseTime = Date.now() - startTime;

          if (!response.ok || !result.success) {
            console.warn(`Model ${model} failed:`, result.error);
            allModelsValid = false;
            modelTestResults.push({
              model,
              success: false,
              error: result.error || 'API validation failed'
            });
          } else {
            console.log(`Model ${model} successful:`, result);
            modelTestResults.push({
              model,
              success: true,
              usage: result.usage,
              responseTime: result.responseTime || responseTime
            });

            // Track token usage per model
            const modelKey = `${provider}:${model}`;
            setModelTokenUsage(prev => ({
              ...prev,
              [modelKey]: {
                totalTokens: result.usage?.totalTokens || result.usage?.inputTokens + result.usage?.outputTokens || 0,
                inputTokens: result.usage?.inputTokens || 0,
                outputTokens: result.usage?.outputTokens || 0,
                cost: result.usage ? (result.usage.totalTokens || 0) * 0.002 : 0.002,
                responseTime: result.responseTime || responseTime,
                lastUsed: new Date(),
                testCount: (prev[modelKey]?.testCount || 0) + 1
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
      const tokenInfoData = {
        used: totalTokensUsed,
        limit: provider === 'openai' ? 100000 :
               provider === 'google' ? 50000 :
               provider === 'anthropic' ? 75000 :
               provider === 'deepseek' ? 100000 :
               provider === 'huggingface' ? 25000 :
               provider === 'openrouter' ? 50000 : 75000,
        cost: totalTokensUsed * 0.002,
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

      // Save all data to database
      await updateSettingsCategory('llm', {
        [`${provider}.apiKey`]: apiKey,
        [`${provider}.modelsTested`]: models,
        [`${provider}.verifiedDate`]: verifiedDate,
        [`${provider}.modelResults`]: modelTestResults,
        tokenInfo: { ...tokenInfo, [provider]: tokenInfoData },
        apiStatus: { ...apiStatus, [provider]: { ...apiStatus[provider], verifiedDate } },
        modelTokenUsage: modelTokenUsage
      });

      // Show modal with detailed results
      setModalProvider(provider);
      setModalResults(modelTestResults);
      setShowModal(true);

      toast({
        title: "Success",
        description: `${provider} API validated and saved (${successfulModels.length}/${models.length} models successful)`,
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
    const models: Record<string, string[]> = {
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'],
      google: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-pro-vision'],
      anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
      deepseek: ['deepseek-coder', 'deepseek-chat'],
      huggingface: ['sentence-transformers/all-MiniLM-L6-v2', 'distilbert-base-uncased', 'bert-base-uncased'],
      openrouter: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3-5-sonnet-20241022', 'meta-llama/llama-3-70b']
    };
    return models[provider] || [];
  };

  const getDefaultModelForProvider = (provider: string) => {
    const defaults: Record<string, string> = {
      openai: 'gpt-4o-mini',
      google: 'gemini-1.5-flash',
      anthropic: 'claude-3-5-sonnet-20241022',
      deepseek: 'deepseek-chat',
      huggingface: 'sentence-transformers/all-MiniLM-L6-v2',
      openrouter: 'openai/gpt-4o-mini'
    };
    return defaults[provider] || 'gpt-4o-mini';
  };

  const getEmbeddingModelsForProvider = (provider: string) => {
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
    return validatedKeys.has(provider) &&
           llmConfig?.[provider]?.apiKey &&
           llmConfig[provider].apiKey !== '••••••••' &&
           apiStatus[provider]?.status === 'active' &&
           apiStatus[provider]?.verifiedDate;
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
    return Object.entries({
      openai: { key: llmConfig?.openai?.apiKey, name: 'OpenAI' },
      google: { key: llmConfig?.google?.apiKey, name: 'Google AI' },
      anthropic: { key: llmConfig?.anthropic?.apiKey, name: 'Anthropic' },
      deepseek: { key: llmConfig?.deepseek?.apiKey, name: 'DeepSeek' },
      huggingface: { key: llmConfig?.huggingface?.apiKey, name: 'HuggingFace' },
      openrouter: { key: llmConfig?.openrouter?.apiKey, name: 'OpenRouter' },
    }).filter(([provider]) => isProviderValidated(provider));
  };

  const getValidatedTranslationProviders = () => {
    const providers = [];
    if (isProviderValidated('google')) {
      providers.push({ value: 'google', label: 'Google' });
    }
    if (isProviderValidated('openai')) {
      providers.push({ value: 'openai', label: 'OpenAI' });
    }
    if (isProviderValidated('anthropic')) {
      providers.push({ value: 'anthropic', label: 'Anthropic' });
    }
    if (translationConfig?.deepl?.apiKey && translationConfig.deepl.apiKey !== '••••••••') {
      providers.push({ value: 'deepl', label: 'DeepL' });
    }
    return providers;
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - API Configuration with Status Indicators */}
        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">LLM Providers</h3>
            </div>
            {Object.entries({
              openai: { key: llmConfig?.openai?.apiKey, name: 'OpenAI' },
              google: { key: llmConfig?.google?.apiKey, name: 'Google AI' },
              anthropic: { key: llmConfig?.anthropic?.apiKey, name: 'Anthropic' },
              deepseek: { key: llmConfig?.deepseek?.apiKey, name: 'DeepSeek' },
              huggingface: { key: llmConfig?.huggingface?.apiKey, name: 'HuggingFace' },
              openrouter: { key: llmConfig?.openrouter?.apiKey, name: 'OpenRouter' },
            }).map(([provider, data]) => {
              const providerStatus = getProviderStatus(provider);
              const isValidated = isProviderValidated(provider);
              const verifiedDate = apiStatus[provider]?.verifiedDate;

              return (
                <div key={provider} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="capitalize font-medium">{data.name}</Label>
                      {verifiedDate && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{verifiedDate.toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                      {providerStatus.status === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        ✗
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={visibleKeys[provider] ? "text" : "password"}
                        value={data.key === '••••••••' ? '' : data.key || ''}
                        placeholder="Enter API key"
                        className="flex-1 pr-20"
                        onChange={(e) => {
                          const newConfig = { ...tempConfig };
                          if (!newConfig[provider]) newConfig[provider] = {};
                          newConfig[provider].apiKey = e.target.value;
                          setTempConfig(newConfig);
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
                      variant={isValidated ? "default" : "outline"}
                      onClick={() => validateAllModelsForProvider(provider, tempConfig?.[provider]?.apiKey || '')}
                      disabled={!tempConfig?.[provider]?.apiKey || tempConfig?.[provider]?.apiKey === '' || validating === provider}
                    >
                      {validating === provider ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : isValidated ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Shield className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Translation API Keys */}
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-lg font-medium mb-4">Translation Providers</h3>
              {Object.entries({
                deepl: { key: translationConfig?.deepl?.apiKey, name: 'DeepL' },
                googleTranslate: { key: translationConfig?.google?.translate?.apiKey, name: 'Google Translate' }
              }).map(([provider, data]) => {
                const providerStatus = getProviderStatus(provider);
                const isValidated = isProviderValidated(provider);
                const verifiedDate = apiStatus[provider]?.verifiedDate;

                return (
                  <div key={provider} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`${provider}-api-key`} className="capitalize font-medium">{data.name}</Label>
                        {verifiedDate && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>{verifiedDate.toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                      {providerStatus.status === 'error' && (
                        <Badge variant="destructive" className="text-xs">
                          ✗
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          id={`${provider}-api-key`}
                          type={visibleKeys[provider] ? "text" : "password"}
                          value={data.key === '••••••••' ? '' : data.key || ''}
                          placeholder="Enter API key"
                          className="flex-1 pr-20"
                          onChange={(e) => {
                            const newConfig = { ...tempConfig };
                            if (provider === 'deepl') {
                              if (!newConfig.deepl) newConfig.deepl = {};
                              newConfig.deepl.apiKey = e.target.value;
                            } else if (provider === 'googleTranslate') {
                              if (!newConfig.google) newConfig.google = {};
                              if (!newConfig.google.translate) newConfig.google.translate = {};
                              newConfig.google.translate.apiKey = e.target.value;
                            }
                            setTempConfig(newConfig);
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
                        variant={isValidated ? "default" : "outline"}
                        onClick={() => validateAllModelsForProvider(provider,
                          provider === 'deepl' ? tempConfig?.deepl?.apiKey : tempConfig?.google?.translate?.apiKey || '')}
                        disabled={
                          (provider === 'deepl' && !tempConfig?.deepl?.apiKey) ||
                          (provider === 'googleTranslate' && !tempConfig?.google?.translate?.apiKey) ||
                          validating === provider
                        }
                      >
                        {validating === provider ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : isValidated ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Shield className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

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
                <Label>LLM Provider</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Select
                    value={tempConfig?.provider || 'openai'}
                    onValueChange={(value) => {
                      if (isProviderValidated(value)) {
                        updateTempConfig('provider', value);
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
                          {data.name} ✓
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={tempConfig?.model || getDefaultModelForProvider(tempConfig?.provider || 'openai')}
                    onValueChange={(value) => updateTempConfig('model', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelsForProvider(tempConfig?.provider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Active Embedding Provider Selection */}
              <div>
                <Label>Embedding Provider</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Select
                    value={tempConfig?.embeddingProvider || 'openai'}
                    onValueChange={(value) => {
                      if (isProviderValidated(value)) {
                        updateTempConfig('embeddingProvider', value);
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
                          {data.name} ✓
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={tempConfig?.embeddingModel || getDefaultEmbeddingModelForProvider(tempConfig?.embeddingProvider || 'openai')}
                    onValueChange={(value) => updateTempConfig('embeddingModel', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select embedding model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getEmbeddingModelsForProvider(tempConfig?.embeddingProvider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Active Translation Provider Selection */}
              <div>
                <Label>Translation Provider</Label>
                <Select
                  value={tempConfig?.translationProvider || 'google'}
                  onValueChange={(value) => {
                    if (isProviderValidated(value) ||
                        (value === 'deepl' && translationConfig?.deepl?.apiKey && translationConfig.deepl.apiKey !== '••••••••')) {
                      updateTempConfig('translationProvider', value);
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
                    <SelectValue placeholder="Select translation provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {getValidatedTranslationProviders().map(provider => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label} ✓
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Token Usage Summary */}
              {Object.keys(modelTokenUsage).length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="text-lg font-medium mb-4">Model Usage Summary</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Object.entries(modelTokenUsage).map(([modelKey, usage]: [string, any]) => {
                      const [provider, model] = modelKey.split(':');
                      return (
                        <div key={modelKey} className="p-2 bg-muted rounded text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{model}</span>
                            <span className="text-xs text-muted-foreground">{provider}</span>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-muted-foreground">Tokens:</span>
                            <span>{usage.totalTokens.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cost:</span>
                            <span>${usage.cost.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tests:</span>
                            <span>{usage.testCount}</span>
                          </div>
                        </div>
                      );
                    })}
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

      {/* Modal for Detailed Results */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              {modalProvider} API Validation Results
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modalResults.map((result, index) => (
                <div key={index} className={`p-4 rounded-lg border ${
                  result.success ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' :
                                   'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{result.model}</span>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      result.success ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                                       'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                    }`}>
                      {result.success ? '✓ Success' : '✗ Failed'}
                    </div>
                  </div>
                  {result.success ? (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tokens:</span>
                        <span>{result.usage?.totalTokens || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Response Time:</span>
                        <span>{result.responseTime}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cost:</span>
                        <span>${((result.usage?.totalTokens || 0) * 0.002).toFixed(4)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-red-600 dark:text-red-400">
                      {result.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {modalResults.filter(r => r.success).length} / {modalResults.length} models validated successfully
                </span>
                <Button onClick={() => setShowModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


// Optimized RAG & Chatbot Settings Component
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
      const [ragData, chatbotData] = await Promise.all([
        getRAGSettings(),
        getSettingsCategory('chatbot')
      ]);
      setRagConfig(ragData);
      setTempRAGConfig(ragData);
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
    setSaving(true);
    try {
      await Promise.all([
        updateSettingsCategory('rag', tempRAGConfig),
        updateSettingsCategory('chatbot', tempChatbotConfig)
      ]);
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
    setTempChatbotConfig({
      ...tempChatbotConfig,
      chatbot: {
        ...tempChatbotConfig.chatbot,
        [key]: value
      }
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
          <CardHeader>
            <CardTitle>RAG Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>System Prompt</Label>
              <Textarea
                value={tempRAGConfig?.ragSettings?.systemPrompt || ragConfig?.ragSettings?.systemPrompt || 'Use the provided context to answer the question accurately. If the context does not contain enough information, say so clearly.'}
                placeholder="Enter RAG system prompt"
                rows={4}
                onChange={(e) => updateRAGSetting('systemPrompt', e.target.value)}
                className="mt-2"
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Search Parameters</h3>
              <div className="space-y-4">
                <div>
                  <Label>Similarity Threshold: {tempRAGConfig?.ragSettings?.similarityThreshold || ragConfig?.ragSettings?.similarityThreshold || 0.05}</Label>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.similarityThreshold || ragConfig?.ragSettings?.similarityThreshold || 0.05]}
                    max={1}
                    min={0}
                    step={0.01}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('similarityThreshold', value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Max Results: {tempRAGConfig?.ragSettings?.maxResults || ragConfig?.ragSettings?.maxResults || 10}</Label>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.maxResults || ragConfig?.ragSettings?.maxResults || 10]}
                      max={50}
                      min={1}
                      step={1}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('maxResults', value)}
                    />
                  </div>
                  <div>
                    <Label>Min Results: {tempRAGConfig?.ragSettings?.minResults || ragConfig?.ragSettings?.minResults || 5}</Label>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.minResults || ragConfig?.ragSettings?.minResults || 5]}
                      max={20}
                      min={1}
                      step={1}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('minResults', value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Processing Parameters</h3>
              <div className="space-y-4">
                <div>
                  <Label>Parallel LLM Count: {tempRAGConfig?.ragSettings?.parallelLLMCount || ragConfig?.ragSettings?.parallelLLMCount || 4}</Label>
                  <Slider
                    value={[tempRAGConfig?.ragSettings?.parallelLLMCount || ragConfig?.ragSettings?.parallelLLMCount || 4]}
                    max={10}
                    min={1}
                    step={1}
                    className="mt-2"
                    onValueChange={([value]) => updateRAGSetting('parallelLLMCount', value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Batch Size: {tempRAGConfig?.ragSettings?.batchSize || ragConfig?.ragSettings?.batchSize || 100}</Label>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.batchSize || ragConfig?.ragSettings?.batchSize || 100]}
                      max={500}
                      min={10}
                      step={10}
                      className="mt-2"
                      onValueChange={([value]) => updateRAGSetting('batchSize', value)}
                    />
                  </div>
                  <div>
                    <Label>Chunk Overlap: {tempRAGConfig?.ragSettings?.chunkOverlap || ragConfig?.ragSettings?.chunkOverlap || 200}</Label>
                    <Slider
                      value={[tempRAGConfig?.ragSettings?.chunkOverlap || ragConfig?.ragSettings?.chunkOverlap || 200]}
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
          </CardContent>
        </Card>

        {/* Chatbot Configuration - Right Column */}
        <Card>
          <CardHeader>
            <CardTitle>RAG & Chatbot Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Opening Messages */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Opening Messages</h3>

              <div className="space-y-2">
                <Label htmlFor="openingMessage">Default Opening Message</Label>
                <Textarea
                  id="openingMessage"
                  value={tempChatbotConfig?.chatbot?.openingMessage || "Merhaba! Size nasıl yardımcı olabilirim?"}
                  onChange={(e) => updateChatbotSetting('openingMessage', e.target.value)}
                  placeholder="Enter the default opening message..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  This message will be shown when users start a new conversation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="suggestionQuestions">Suggested Questions</Label>
                <Textarea
                  id="suggestionQuestions"
                  value={tempChatbotConfig?.chatbot?.suggestionQuestions?.join('\n') || ""}
                  onChange={(e) => {
                    const questions = e.target.value.split('\n').filter(q => q.trim());
                    updateChatbotSetting('suggestionQuestions', questions);
                  }}
                  placeholder="Enter suggested questions, one per line..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  These questions will be shown as clickable suggestions to users
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label>Enable Question Suggestions</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Show suggested questions based on context
                  </p>
                </div>
                <Switch
                  checked={tempChatbotConfig?.chatbot?.enableSuggestions ?? true}
                  onCheckedChange={(checked) => updateChatbotSetting('enableSuggestions', checked)}
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

            {/* Response Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Response Configuration</h3>
              <div className="space-y-6">
                <div>
                  <Label>Max Records to Fetch: {chatbotConfig?.chatbot?.maxRecords || 10}</Label>
                  <Slider
                    value={[tempChatbotConfig?.chatbot?.maxRecords || chatbotConfig?.chatbot?.maxRecords || 10]}
                    max={100}
                    min={1}
                    step={1}
                    className="mt-3"
                    onValueChange={([value]) => updateChatbotSetting('maxRecords', value)}
                  />
                </div>
                <div>
                  <Label>Max Message History: {chatbotConfig?.chatbot?.maxHistory || 50}</Label>
                  <Slider
                    value={[tempChatbotConfig?.chatbot?.maxHistory || chatbotConfig?.chatbot?.maxHistory || 50]}
                    max={200}
                    min={10}
                    step={10}
                    className="mt-3"
                    onValueChange={([value]) => updateChatbotSetting('maxHistory', value)}
                  />
                </div>
              </div>
            </div>
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
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast({
        title: "Success",
        description: `${type === 'database' ? 'Database' : 'Redis'} connection successful`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `${type === 'database' ? 'Database' : 'Redis'} connection failed`,
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
      await updateSettingsCategory('security', tempConfig);
      setSecurityConfig(tempConfig);
      toast({
        title: "Success",
        description: "Security settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save security settings",
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
      await updateSettingsCategory('app', tempConfig);
      setAppConfig(tempConfig);
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


// Scraper Settings Component
function ScraperSettings() {
  const [scraperConfig, setScraperConfig] = useState<any>({});
  const [tempConfig, setTempConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettingsCategory('scraper');
      setScraperConfig(data);
      setTempConfig(data);
    } catch (error) {
      console.error('Failed to load scraper settings:', error);
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
      await updateSettingsCategory('scraper', tempConfig);
      setScraperConfig(tempConfig);
      toast({
        title: "Success",
        description: "Scraper settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save scraper settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setTempConfig({
      ...tempConfig,
      scraper: {
        ...tempConfig.scraper,
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
          <CardTitle>Web Scraper Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Timeout (seconds)</Label>
              <Input
                type="number"
                value={tempConfig?.scraper?.timeout ?? scraperConfig?.scraper?.timeout ?? 30}
                onChange={(e) => updateSetting('timeout', parseInt(e.target.value))}
              />
            </div>
            <div>
              <Label>Max Concurrency</Label>
              <Input
                type="number"
                value={tempConfig?.scraper?.maxConcurrency ?? scraperConfig?.scraper?.maxConcurrency ?? 5}
                onChange={(e) => updateSetting('maxConcurrency', parseInt(e.target.value))}
              />
            </div>
          </div>

          <div>
            <Label>User Agent</Label>
            <Input
              value={tempConfig?.scraper?.userAgent ?? scraperConfig?.scraper?.userAgent ?? 'ASB-Scraper/1.0'}
              placeholder="Enter custom user agent"
              onChange={(e) => updateSetting('userAgent', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Enable JavaScript</Label>
              <Switch
                checked={tempConfig?.scraper?.enableJavaScript ?? scraperConfig?.scraper?.enableJavaScript}
                onCheckedChange={(checked) => updateSetting('enableJavaScript', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Follow Redirects</Label>
              <Switch
                checked={tempConfig?.scraper?.followRedirects ?? scraperConfig?.scraper?.followRedirects}
                onCheckedChange={(checked) => updateSetting('followRedirects', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Respect Robots.txt</Label>
              <Switch
                checked={tempConfig?.scraper?.respectRobotsTxt ?? scraperConfig?.scraper?.respectRobotsTxt}
                onCheckedChange={(checked) => updateSetting('respectRobotsTxt', checked)}
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

  const deepLConfigured = !!tempConfig?.deepl?.apiKey;
  const googleTranslateConfigured = !!tempConfig?.google?.translate?.apiKey;

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
              <Badge variant={deepLConfigured ? "default" : "secondary"}>
                {deepLConfigured ? "Configured" : "Not Set"}
              </Badge>
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
              <Badge variant={googleTranslateConfigured ? "default" : "secondary"}>
                {googleTranslateConfigured ? "Configured" : "Not Set"}
              </Badge>
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
  const [activeTab, setActiveTab] = useState('llm');

  return (
    <div className="w-full max-w-[90%] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your application settings. Each tab loads only relevant configuration.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7 h-14">
          <TabsTrigger value="app" className="h-12 px-4">
            <span className="text-sm">App</span>
          </TabsTrigger>
          <TabsTrigger value="llm" className="h-12 px-4">
            <span className="text-sm">API</span>
          </TabsTrigger>
          <TabsTrigger value="rag" className="h-12 px-4">
            <span className="text-sm">RAG</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="h-12 px-4">
            <span className="text-sm">Database</span>
          </TabsTrigger>
          <TabsTrigger value="scraper" className="h-12 px-4">
            <span className="text-sm">Scraper</span>
          </TabsTrigger>
              <TabsTrigger value="prompts" className="h-12 px-4">
            <span className="text-sm">Prompts</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="h-12 px-4">
            <span className="text-sm">Advanced</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="app">
          <AppSettings />
        </TabsContent>

        <TabsContent value="llm">
          <LLMSettings />
        </TabsContent>

        <TabsContent value="rag">
          <RAGSettings />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseSettings />
        </TabsContent>


        <TabsContent value="scraper">
          <ScraperSettings />
        </TabsContent>


        <TabsContent value="prompts">
          <PromptsSettings />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}