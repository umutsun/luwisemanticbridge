'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { apiConfig } from '@/config/api.config';

const RealtimeSettings = () => {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch initial config
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch(apiConfig.getApiUrl('/settings'));
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  // Real-time update function
  const updateSetting = async (key: string, value: any) => {
    try {
      setLoading(true);

      // Update local state immediately
      setConfig(prev => {
        const keys = key.split('.');
        const newConfig = { ...prev };
        let current = newConfig;

        for (let i = 0; i < keys.length - 1; i++) {
          current[keys[i]] = { ...current[keys[i]] };
          current = current[keys[i]];
        }

        current[keys[keys.length - 1]] = value;
        return newConfig;
      });

      // Send to backend
      const response = await fetch(apiConfig.getApiUrl('/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });

      if (!response.ok) {
        throw new Error('Failed to update setting');
      }

      toast({
        title: 'Setting Updated',
        description: `${key} has been updated successfully`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to update ${key}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Unified Provider Selection
  const updateProvider = async (provider: string) => {
    const providerConfig = {
      'openai': {
        llmModel: 'gpt-4-turbo',
        embeddingModel: 'text-embedding-3-small'
      },
      'google': {
        llmModel: 'gemini-pro',
        embeddingModel: 'text-embedding-004'
      },
      'anthropic': {
        llmModel: 'claude-3-sonnet-20240229',
        embeddingModel: null
      },
      'deepseek': {
        llmModel: 'deepseek-chat',
        embeddingModel: null
      }
    };

    const config = providerConfig[provider as keyof typeof providerConfig];

    // Update all related settings at once
    await Promise.all([
      updateSetting('llmSettings.activeChatModel', `${provider}/${config.llmModel}`),
      config.embeddingModel && updateSetting('embeddings.provider', provider),
      config.embeddingModel && updateSetting('embeddings.model', config.embeddingModel)
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Unified AI Provider */}
      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>
            Select a single provider for all AI operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { id: 'openai', name: 'OpenAI', hasEmbeddings: true },
              { id: 'google', name: 'Google', hasEmbeddings: true },
              { id: 'anthropic', name: 'Anthropic', hasEmbeddings: false },
              { id: 'deepseek', name: 'DeepSeek', hasEmbeddings: false }
            ].map((provider) => (
              <div
                key={provider.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  config.llmSettings?.activeChatModel?.includes(provider.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => updateProvider(provider.id)}
              >
                <div className="text-center">
                  <div className="font-medium">{provider.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {provider.hasEmbeddings ? 'LLM + Embeddings' : 'LLM only'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Configure API keys (saves automatically)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>OpenAI API Key</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={config.openai?.apiKey || ''}
                onChange={(e) => updateSetting('openai.apiKey', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Google API Key</Label>
              <Input
                type="password"
                placeholder="AIza..."
                value={config.google?.apiKey || ''}
                onChange={(e) => updateSetting('google.apiKey', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Anthropic API Key</Label>
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={config.anthropic?.apiKey || ''}
                onChange={(e) => updateSetting('anthropic.apiKey', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>DeepSeek API Key</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={config.deepseek?.apiKey || ''}
                onChange={(e) => updateSetting('deepseek.apiKey', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RAG Settings */}
      <Card>
        <CardHeader>
          <CardTitle>RAG Configuration</CardTitle>
          <CardDescription>
            Retrieval-Augmented Generation settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Similarity Threshold: {config.ragSettings?.similarityThreshold?.toFixed(3) || 0.001}</Label>
            <Slider
              value={[config.ragSettings?.similarityThreshold || 0.001]}
              onValueChange={(value) => updateSetting('ragSettings.similarityThreshold', value[0])}
              min={0.001}
              max={0.5}
              step={0.001}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Results: {config.ragSettings?.minResults || 3}</Label>
              <Slider
                value={[config.ragSettings?.minResults || 3]}
                onValueChange={(value) => updateSetting('ragSettings.minResults', value[0])}
                min={1}
                max={20}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Results: {config.ragSettings?.maxResults || 10}</Label>
              <Slider
                value={[config.ragSettings?.maxResults || 10]}
                onValueChange={(value) => updateSetting('ragSettings.maxResults', value[0])}
                min={1}
                max={50}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={config.ragSettings?.enableHybridSearch || false}
              onCheckedChange={(checked) => updateSetting('ragSettings.enableHybridSearch', checked)}
            />
            <Label>Enable Hybrid Search</Label>
          </div>
        </CardContent>
      </Card>

      {/* Database */}
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>
            Database configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Host</Label>
              <Input
                value={config.database?.host || ''}
                onChange={(e) => updateSetting('database.host', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input
                type="number"
                value={config.database?.port || 5432}
                onChange={(e) => updateSetting('database.port', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Database</Label>
              <Input
                value={config.database?.name || ''}
                onChange={(e) => updateSetting('database.name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={config.database?.user || ''}
                onChange={(e) => updateSetting('database.user', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={config.database?.password || ''}
              onChange={(e) => updateSetting('database.password', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealtimeSettings;