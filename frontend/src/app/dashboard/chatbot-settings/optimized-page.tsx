'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Bot,
  Settings,
  Save,
  RefreshCw,
  MessageSquare,
  Brain,
  Key,
  CheckCircle,
  AlertCircle,
  Zap
} from 'lucide-react';
import { getLLMSettings, getSettingsCategory } from '@/lib/api/settings';

// Optimized LLM Configuration Tab
function LLMConfiguration() {
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
    setSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      toast({
        title: "Success",
        description: "Setting saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save setting",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading LLM settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Provider Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Primary Provider</Label>
              <Select defaultValue={llmConfig?.openai?.model ? 'openai' : 'google'}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="google">Google Gemini</SelectItem>
                  <SelectItem value="anthropic">Claude</SelectItem>
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
          <div className="space-y-3">
            <Label>API Keys</Label>
            <div className="grid gap-3">
              {[
                { provider: 'openai', key: llmConfig?.openai?.apiKey },
                { provider: 'google', key: llmConfig?.google?.apiKey },
                { provider: 'anthropic', key: llmConfig?.anthropic?.apiKey },
                { provider: 'deepseek', key: llmConfig?.deepseek?.apiKey }
              ].map(({ provider, key }) => (
                <div key={provider} className="flex items-center gap-3">
                  <Label className="w-24 capitalize">{provider}</Label>
                  <Input
                    type="password"
                    value={key ? '••••••••••••' : ''}
                    placeholder={`Enter ${provider} API key`}
                    className="flex-1"
                  />
                  <Badge variant={key ? "default" : "secondary"}>
                    {key ? "Configured" : "Not Set"}
                  </Badge>
                  <Button size="sm" variant="outline">
                    Test
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Model Parameters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperature: {llmConfig?.openai?.temperature || 0.7}</Label>
              <Slider
                value={[llmConfig?.openai?.temperature || 0.7]}
                onValueChange={([value]) => saveSetting('temperature', value)}
                max={2}
                min={0}
                step={0.1}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground">
                Controls randomness. Lower = more focused, Higher = more creative
              </p>
            </div>
            <div className="space-y-2">
              <Label>Max Tokens: {llmConfig?.openai?.maxTokens || 4096}</Label>
              <Slider
                value={[llmConfig?.openai?.maxTokens || 4096]}
                onValueChange={([value]) => saveSetting('maxTokens', value)}
                max={8000}
                min={512}
                step={512}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground">
                Maximum response length
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Embedding Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Embedding Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Embedding Provider</Label>
              <Select defaultValue={llmConfig?.embeddings?.provider || 'openai'}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="local">Local (Ollama)</SelectItem>
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
        </CardContent>
      </Card>
    </div>
  );
}

// Chat Interface Settings
function ChatInterfaceSettings() {
  const [chatSettings, setChatSettings] = useState({
    title: 'Mali Müşavir Asistanı',
    welcomeMessage: 'Merhaba! Size nasıl yardımcı olabilirim?',
    placeholder: 'Sorunuzu yazın...',
    primaryColor: '#3B82F6',
    suggestions: [
      { icon: '💼', title: 'Vergi Dilimi', description: '2024 yılı vergi dilimleri' },
      { icon: '📊', title: 'KDV Oranları', description: 'Mevcut KDV oranları' },
      { icon: '📝', title: 'Defter Tutma', description: 'Defter tutma yükümlülükleri' },
      { icon: '📅', title: 'Beyanname', description: 'Beyanname tarihleri' }
    ]
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Chat Interface
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Chatbot Title</Label>
            <Input
              value={chatSettings.title}
              onChange={(e) => setChatSettings(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter chatbot title"
            />
          </div>

          <div>
            <Label>Welcome Message</Label>
            <Textarea
              value={chatSettings.welcomeMessage}
              onChange={(e) => setChatSettings(prev => ({ ...prev, welcomeMessage: e.target.value }))}
              placeholder="Enter welcome message"
              rows={3}
            />
          </div>

          <div>
            <Label>Input Placeholder</Label>
            <Input
              value={chatSettings.placeholder}
              onChange={(e) => setChatSettings(prev => ({ ...prev, placeholder: e.target.value }))}
              placeholder="Enter input placeholder"
            />
          </div>

          <div>
            <Label>Primary Color</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={chatSettings.primaryColor}
                onChange={(e) => setChatSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-20 h-10"
              />
              <Input
                value={chatSettings.primaryColor}
                onChange={(e) => setChatSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                placeholder="#3B82F6"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {chatSettings.suggestions.map((suggestion, index) => (
              <div key={index} className="flex items-center gap-2 p-2 border rounded">
                <span className="text-lg">{suggestion.icon}</span>
                <div className="flex-1">
                  <p className="font-medium">{suggestion.title}</p>
                  <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                </div>
                <Button size="sm" variant="ghost">
                  Edit
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full mt-3">
            Add Suggestion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Advanced Settings
function AdvancedSettings() {
  const [advancedConfig, setAdvancedConfig] = useState({
    streaming: true,
    showSources: true,
    enableRAG: true,
    contextWindow: 10,
    responseTimeout: 30
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Advanced Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Stream Responses</Label>
              <p className="text-sm text-muted-foreground">
                Show responses as they are being generated
              </p>
            </div>
            <Switch
              checked={advancedConfig.streaming}
              onCheckedChange={(checked) =>
                setAdvancedConfig(prev => ({ ...prev, streaming: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Show Sources</Label>
              <p className="text-sm text-muted-foreground">
                Display source documents in responses
              </p>
            </div>
            <Switch
              checked={advancedConfig.showSources}
              onCheckedChange={(checked) =>
                setAdvancedConfig(prev => ({ ...prev, showSources: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Enable RAG</Label>
              <p className="text-sm text-muted-foreground">
                Use retrieval-augmented generation
              </p>
            </div>
            <Switch
              checked={advancedConfig.enableRAG}
              onCheckedChange={(checked) =>
                setAdvancedConfig(prev => ({ ...prev, enableRAG: checked }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Context Window: {advancedConfig.contextWindow}</Label>
              <Slider
                value={[advancedConfig.contextWindow]}
                onValueChange={([value]) =>
                  setAdvancedConfig(prev => ({ ...prev, contextWindow: value }))
                }
                max={20}
                min={5}
                step={1}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground">
                Number of previous messages to consider
              </p>
            </div>
            <div>
              <Label>Response Timeout: {advancedConfig.responseTimeout}s</Label>
              <Slider
                value={[advancedConfig.responseTimeout]}
                onValueChange={([value]) =>
                  setAdvancedConfig(prev => ({ ...prev, responseTimeout: value }))
                }
                max={60}
                min={10}
                step={5}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground">
                Maximum wait time for responses
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main Chatbot Settings Component
export default function OptimizedChatbotSettingsPage() {
  const [activeTab, setActiveTab] = useState('llm');
  const [hasChanges, setHasChanges] = useState(false);

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Bot className="w-8 h-8" />
          Chatbot Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure your AI chatbot behavior and appearance. Only LLM settings are loaded for optimal performance.
        </p>
      </div>

      {hasChanges && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Remember to save your settings before leaving.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="llm" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            LLM Settings
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Chat Interface
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="llm">
          <LLMConfiguration />
        </TabsContent>

        <TabsContent value="chat">
          <ChatInterfaceSettings />
        </TabsContent>

        <TabsContent value="advanced">
          <AdvancedSettings />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Reset
        </Button>
        <Button>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}