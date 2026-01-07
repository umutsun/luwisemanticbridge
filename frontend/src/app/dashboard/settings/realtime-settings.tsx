'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiConfig } from '@/config/api.config';
import { Download, Upload, Copy, Check } from 'lucide-react';

const RealtimeSettings = () => {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

      {/* Evidence Gate - Quality Control */}
      <Card>
        <CardHeader>
          <CardTitle>Evidence Gate (Quality Control)</CardTitle>
          <CardDescription>
            Prevents showing irrelevant citations when search results don't meet quality threshold.
            When gate fails: Returns clean refusal without any sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={config.ragSettings?.evidenceGateEnabled !== false}
              onCheckedChange={(checked) => updateSetting('ragSettings.evidenceGateEnabled', checked)}
            />
            <Label>Enable Evidence Gate</Label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Score: {((config.ragSettings?.evidenceGateMinScore || 0.55) * 100).toFixed(0)}%</Label>
              <Slider
                value={[config.ragSettings?.evidenceGateMinScore || 0.55]}
                onValueChange={(value) => updateSetting('ragSettings.evidenceGateMinScore', value[0])}
                min={0.1}
                max={0.9}
                step={0.05}
                disabled={config.ragSettings?.evidenceGateEnabled === false}
              />
              <p className="text-xs text-muted-foreground">
                Minimum similarity score for a result to be considered "quality"
              </p>
            </div>
            <div className="space-y-2">
              <Label>Min Quality Chunks: {config.ragSettings?.evidenceGateMinChunks || 2}</Label>
              <Slider
                value={[config.ragSettings?.evidenceGateMinChunks || 2]}
                onValueChange={(value) => updateSetting('ragSettings.evidenceGateMinChunks', value[0])}
                min={1}
                max={5}
                step={1}
                disabled={config.ragSettings?.evidenceGateEnabled === false}
              />
              <p className="text-xs text-muted-foreground">
                Minimum number of quality results required to pass gate
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Refusal Message (TR)</Label>
            <Input
              value={config.ragSettings?.evidenceGateRefusalTr || 'Bu konuda yeterince güvenilir kaynak bulunamadı.'}
              onChange={(e) => updateSetting('ragSettings.evidenceGateRefusalTr', e.target.value)}
              disabled={config.ragSettings?.evidenceGateEnabled === false}
            />
          </div>

          <div className="space-y-2">
            <Label>Refusal Message (EN)</Label>
            <Input
              value={config.ragSettings?.evidenceGateRefusalEn || 'No sufficiently relevant sources found for this topic.'}
              onChange={(e) => updateSetting('ragSettings.evidenceGateRefusalEn', e.target.value)}
              disabled={config.ragSettings?.evidenceGateEnabled === false}
            />
          </div>
        </CardContent>
      </Card>

      {/* Settings Import/Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Settings Import/Export</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportExport(!showImportExport)}
            >
              {showImportExport ? 'Hide' : 'Show'}
            </Button>
          </CardTitle>
          <CardDescription>
            Export settings as JSON to backup or share between instances.
            Import settings from JSON file or paste directly.
          </CardDescription>
        </CardHeader>
        {showImportExport && (
          <CardContent className="space-y-4">
            {/* Export Section */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Export Settings</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const exportData = {
                      exportDate: new Date().toISOString(),
                      version: '1.0',
                      settings: {
                        ragSettings: config.ragSettings || {},
                        llmSettings: config.llmSettings || {},
                        embeddings: config.embeddings || {},
                      }
                    };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `settings-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: 'Settings Exported', description: 'Settings JSON file downloaded' });
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const exportData = {
                      exportDate: new Date().toISOString(),
                      version: '1.0',
                      settings: {
                        ragSettings: config.ragSettings || {},
                        llmSettings: config.llmSettings || {},
                        embeddings: config.embeddings || {},
                      }
                    };
                    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                    toast({ title: 'Copied!', description: 'Settings JSON copied to clipboard' });
                  }}
                >
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </Button>
              </div>
            </div>

            {/* Import Section */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Import Settings</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const content = event.target?.result as string;
                        setImportJson(content);
                        toast({ title: 'File Loaded', description: 'Review and click Import to apply' });
                      } catch {
                        toast({ title: 'Error', description: 'Failed to read file', variant: 'destructive' });
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Load from File
                </Button>
              </div>
              <Textarea
                placeholder="Paste JSON settings here or load from file..."
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="font-mono text-xs h-32"
              />
              <div className="flex gap-2">
                <Button
                  variant="default"
                  disabled={!importJson || loading}
                  onClick={async () => {
                    try {
                      const parsed = JSON.parse(importJson);
                      const settings = parsed.settings || parsed;

                      // Apply each setting
                      const updates: Promise<void>[] = [];

                      if (settings.ragSettings) {
                        Object.entries(settings.ragSettings).forEach(([key, value]) => {
                          updates.push(updateSetting(`ragSettings.${key}`, value));
                        });
                      }
                      if (settings.llmSettings) {
                        Object.entries(settings.llmSettings).forEach(([key, value]) => {
                          updates.push(updateSetting(`llmSettings.${key}`, value));
                        });
                      }
                      if (settings.embeddings) {
                        Object.entries(settings.embeddings).forEach(([key, value]) => {
                          updates.push(updateSetting(`embeddings.${key}`, value));
                        });
                      }

                      await Promise.all(updates);
                      toast({ title: 'Settings Imported', description: `${updates.length} settings applied successfully` });
                      setImportJson('');
                      fetchConfig(); // Refresh
                    } catch (error) {
                      toast({ title: 'Import Error', description: 'Invalid JSON format', variant: 'destructive' });
                    }
                  }}
                >
                  Import Settings
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setImportJson('')}
                  disabled={!importJson}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Preview */}
            {importJson && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Preview</Label>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-40">
                  {(() => {
                    try {
                      const parsed = JSON.parse(importJson);
                      const settings = parsed.settings || parsed;
                      return `RAG Settings: ${Object.keys(settings.ragSettings || {}).length} keys\n` +
                             `LLM Settings: ${Object.keys(settings.llmSettings || {}).length} keys\n` +
                             `Embeddings: ${Object.keys(settings.embeddings || {}).length} keys`;
                    } catch {
                      return 'Invalid JSON';
                    }
                  })()}
                </pre>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default RealtimeSettings;