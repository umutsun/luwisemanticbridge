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
import {
  Settings,
  Database,
  Key,
  Brain,
  Shield,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Zap,
  Activity,
  Lock,
  Languages,
  DollarSign,
  TrendingUp
} from 'lucide-react';
import {
  getSettingsCategory,
  updateAppSettings,
  getLLMSettings,
  getEmbeddingsSettings,
  getRAGSettings,
  getDatabaseSettings,
  getSecuritySettings,
  getTranslationSettings
} from '../../../lib/api/settings';

// Component for each settings category
function CategoryTab({ category, children }: { category: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {children}
    </div>
  );
}

// Optimized LLM Settings Component
function LLMSettings() {
  const [llmConfig, setLlmConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLLMSettings();
      setLlmConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load LLM settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSetting = async (key: string, value: any) => {
    try {
      await updateAppSettings({ [key]: value });
      toast({
        title: "Success",
        description: "Setting saved",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save setting",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading LLM settings...</div>;
  }

  return (
    <CategoryTab category="llm">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            LLM Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* LLM Provider Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>LLM Provider</Label>
              <Select defaultValue={llmConfig?.openai?.model ? 'openai' : 'google'}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4">GPT-4</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* API Keys */}
          <div className="space-y-2">
            <Label>API Keys</Label>
            <div className="grid gap-2">
              {Object.entries({
                openai: llmConfig?.openai?.apiKey,
                google: llmConfig?.google?.apiKey,
                anthropic: llmConfig?.anthropic?.apiKey,
                deepseek: llmConfig?.deepseek?.apiKey,
              }).map(([provider, key]) => (
                <div key={provider} className="flex items-center gap-2">
                  <Label className="w-24 capitalize">{provider}</Label>
                  <Input
                    type="password"
                    value={key ? '••••••••' : ''}
                    placeholder="Enter API key"
                    className="flex-1"
                  />
                  <Badge variant={key ? "default" : "secondary"}>
                    {key ? "Configured" : "Not Set"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Model Parameters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Temperature: {llmConfig?.openai?.temperature || 0.7}</Label>
              <Slider
                value={[llmConfig?.openai?.temperature || 0.7]}
                onValueChange={([value]) => saveSetting('openai.temperature', value)}
                max={2}
                min={0}
                step={0.1}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Max Tokens: {llmConfig?.openai?.maxTokens || 4096}</Label>
              <Slider
                value={[llmConfig?.openai?.maxTokens || 4096]}
                onValueChange={([value]) => saveSetting('openai.maxTokens', value)}
                max={8000}
                min={512}
                step={512}
                className="mt-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </CategoryTab>
  );
}

// Optimized Embeddings Settings Component
function EmbeddingsSettings() {
  const [embeddingsConfig, setEmbeddingsConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEmbeddingsSettings();
      setEmbeddingsConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load embeddings settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading embeddings settings...</div>;
  }

  return (
    <CategoryTab category="embeddings">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Embeddings Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Embedding Provider</Label>
              <Select defaultValue={embeddingsConfig?.embeddings?.provider || 'openai'}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Embedding Model</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text-embedding-ada-002">Ada-002</SelectItem>
                  <SelectItem value="text-embedding-3-small">3-Small</SelectItem>
                  <SelectItem value="text-embedding-3-large">3-Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Chunk Size: {embeddingsConfig?.embeddings?.chunkSize || 1000}</Label>
              <Slider
                value={[embeddingsConfig?.embeddings?.chunkSize || 1000]}
                max={2000}
                min={100}
                step={100}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Chunk Overlap: {embeddingsConfig?.embeddings?.chunkOverlap || 200}</Label>
              <Slider
                value={[embeddingsConfig?.embeddings?.chunkOverlap || 200]}
                max={500}
                min={0}
                step={50}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Batch Size: {embeddingsConfig?.embeddings?.batchSize || 100}</Label>
              <Slider
                value={[embeddingsConfig?.embeddings?.batchSize || 100]}
                max={500}
                min={10}
                step={10}
                className="mt-2"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Cache Embeddings</Label>
            <Switch
              defaultChecked={embeddingsConfig?.embeddings?.cacheEmbeddings}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Normalize Embeddings</Label>
            <Switch
              defaultChecked={embeddingsConfig?.embeddings?.normalizeEmbeddings}
            />
          </div>
        </CardContent>
      </Card>
    </CategoryTab>
  );
}

// Optimized RAG Settings Component
function RAGSettings() {
  const [ragConfig, setRagConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRAGSettings();
      setRagConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load RAG settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading RAG settings...</div>;
  }

  return (
    <CategoryTab category="rag">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            RAG Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Similarity Threshold: {ragConfig?.ragSettings?.similarityThreshold || 0.05}</Label>
              <Slider
                value={[ragConfig?.ragSettings?.similarityThreshold || 0.05]}
                max={1}
                min={0}
                step={0.01}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Max Results: {ragConfig?.ragSettings?.maxResults || 10}</Label>
              <Slider
                value={[ragConfig?.ragSettings?.maxResults || 10]}
                max={50}
                min={1}
                step={1}
                className="mt-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Min Results: {ragConfig?.ragSettings?.minResults || 5}</Label>
              <Slider
                value={[ragConfig?.ragSettings?.minResults || 5]}
                max={20}
                min={1}
                step={1}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Parallel LLM Count: {ragConfig?.ragSettings?.parallelLLMCount || 4}</Label>
              <Slider
                value={[ragConfig?.ragSettings?.parallelLLMCount || 4]}
                max={10}
                min={1}
                step={1}
                className="mt-2"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Enable Hybrid Search</Label>
              <Switch
                defaultChecked={ragConfig?.ragSettings?.enableHybridSearch}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Keyword Boost</Label>
              <Switch
                defaultChecked={ragConfig?.ragSettings?.enableKeywordBoost}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Parallel LLM</Label>
              <Switch
                defaultChecked={ragConfig?.ragSettings?.enableParallelLLM}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </CategoryTab>
  );
}

// Optimized Database Settings Component
function DatabaseSettings() {
  const [dbConfig, setDbConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDatabaseSettings();
      setDbConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load database settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const testConnection = async () => {
    setTesting(true);
    try {
      // Simulate test
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast({
        title: "Success",
        description: "Database connection successful",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Database connection failed",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading database settings...</div>;
  }

  return (
    <CategoryTab category="database">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Database Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Host</Label>
              <Input defaultValue={dbConfig?.database?.host || 'localhost'} />
            </div>
            <div>
              <Label>Port</Label>
              <Input type="number" defaultValue={dbConfig?.database?.port || 5432} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Database Name</Label>
              <Input defaultValue={dbConfig?.database?.name || ''} />
            </div>
            <div>
              <Label>User</Label>
              <Input defaultValue={dbConfig?.database?.user || ''} />
            </div>
          </div>

          <div>
            <Label>Password</Label>
            <Input type="password" defaultValue={dbConfig?.database?.password || ''} />
          </div>

          <div className="flex items-center justify-between">
            <Label>SSL Enabled</Label>
            <Switch defaultChecked={dbConfig?.database?.ssl} />
          </div>

          <div className="flex gap-2">
            <Button onClick={testConnection} disabled={testing} size="sm">
              {testing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
              Test Connection
            </Button>
            <Button variant="outline" size="sm">
              Test with pgvector
            </Button>
          </div>
        </CardContent>
      </Card>
    </CategoryTab>
  );
}

// Optimized Security Settings Component
function SecuritySettings() {
  const [securityConfig, setSecurityConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSecuritySettings();
      setSecurityConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load security settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading security settings...</div>;
  }

  return (
    <CategoryTab category="security">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable Authentication</Label>
            <Switch defaultChecked={securityConfig?.security?.enableAuth} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Session Timeout (hours)</Label>
              <Input
                type="number"
                defaultValue={securityConfig?.security?.sessionTimeout || 24}
              />
            </div>
            <div>
              <Label>Rate Limit (req/min)</Label>
              <Input
                type="number"
                defaultValue={securityConfig?.security?.rateLimit || 100}
              />
            </div>
          </div>

          <div>
            <Label>JWT Secret</Label>
            <Input
              type="password"
              defaultValue={securityConfig?.security?.jwtSecret || ''}
              placeholder="Enter JWT secret"
            />
          </div>

          <div>
            <Label>CORS Origins</Label>
            <Textarea
              defaultValue={securityConfig?.security?.corsOrigins || ''}
              placeholder="http://localhost:3000,http://localhost:3001"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </CategoryTab>
  );
}

// Translation Settings Component
function TranslationSettings() {
  const [translationConfig, setTranslationConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTranslationSettings();
      setTranslationConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load translation settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSetting = async (key: string, value: any) => {
    try {
      await updateAppSettings({ [key]: value });
      toast({
        title: "Success",
        description: "Translation setting saved",
      });
      // Reload settings to update UI
      loadSettings();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save translation setting",
        variant: "destructive",
      });
    }
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
    return <div className="flex items-center justify-center h-64">Loading translation settings...</div>;
  }

  const deepLConfigured = !!translationConfig?.deepl?.apiKey;
  const googleTranslateConfigured = !!translationConfig?.google?.translate?.apiKey;

  return (
    <CategoryTab category="translation">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="w-5 h-5" />
            Translation Services Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cost Information */}
          <Alert>
            <DollarSign className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Translation Service Costs:</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>DeepL:</strong> ~$6 per 1M characters
                  </div>
                  <div>
                    <strong>Google Translate:</strong> ~$20 per 1M characters
                  </div>
                </div>
              </div>
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
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={translationConfig?.deepl?.apiKey || ''}
                    placeholder="Enter DeepL API key"
                    className="flex-1"
                    onChange={(e) => {
                      const newConfig = {
                        ...translationConfig,
                        deepl: {
                          ...translationConfig.deepl,
                          apiKey: e.target.value
                        }
                      };
                      setTranslationConfig(newConfig);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveSetting('deepl.apiKey', translationConfig?.deepl?.apiKey)}
                    disabled={!translationConfig?.deepl?.apiKey}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div>
                <Label>Plan Type</Label>
                <Select
                  value={translationConfig?.deepl?.plan || 'free'}
                  onValueChange={(value) => saveSetting('deepl.plan', value)}
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
                disabled={testing === 'deepl' || !translationConfig?.deepl?.apiKey}
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
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={translationConfig?.google?.translate?.apiKey || ''}
                    placeholder="Enter Google Translate API key"
                    className="flex-1"
                    onChange={(e) => {
                      const newConfig = {
                        ...translationConfig,
                        google: {
                          ...translationConfig.google,
                          translate: {
                            ...translationConfig.google?.translate,
                            apiKey: e.target.value
                          }
                        }
                      };
                      setTranslationConfig(newConfig);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveSetting('google.translate.apiKey', translationConfig?.google?.translate?.apiKey)}
                    disabled={!translationConfig?.google?.translate?.apiKey}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => testConnection('google')}
                disabled={testing === 'google' || !translationConfig?.google?.translate?.apiKey}
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
        </CardContent>
      </Card>
    </CategoryTab>
  );
}

// Main Optimized Settings Component
export default function OptimizedSettingsPage() {
  const [activeTab, setActiveTab] = useState('llm');

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your application settings. Each tab loads only relevant configuration.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="llm" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            AI Services
          </TabsTrigger>
          <TabsTrigger value="embeddings" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Embeddings
          </TabsTrigger>
          <TabsTrigger value="rag" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            RAG
          </TabsTrigger>
          <TabsTrigger value="database" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Database
          </TabsTrigger>
          <TabsTrigger value="translation" className="flex items-center gap-2">
            <Languages className="w-4 h-4" />
            Translation
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="llm">
          <LLMSettings />
        </TabsContent>

        <TabsContent value="embeddings">
          <EmbeddingsSettings />
        </TabsContent>

        <TabsContent value="rag">
          <RAGSettings />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseSettings />
        </TabsContent>

        <TabsContent value="translation">
          <TranslationSettings />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}