'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertCircle, Save, RotateCcw, Copy, Check, Bot, MessageSquare, Palette, Plus, Trash2, Settings, Brain, Database } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

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

interface LLMProvider {
  id: string;
  name: string;
  available: boolean;
  model?: string;
}

interface UnifiedEmbeddings {
  enabled: boolean;
  totalRecords: number;
  embeddedRecords: number;
  lastEmbedded?: string;
}

const defaultPrompt = `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.
    
GÖREV:
- Aşağıdaki bağlamda verilen bilgilere dayanarak cevap ver
- ÖNEMLİ: Bağlamın BAŞINDAKİ konulara öncelik ver (çünkü en ilgili olanlar başta)
- İlk 3-5 konudan gelen bilgileri kullanarak kapsamlı bir cevap oluştur
- Kaynak referanslarını mutlaka [Kaynak 1], [Kaynak 2] formatında belirt
- Eğer bağlam boşsa veya ilgili bilgi yoksa "Bu konuda veritabanımda bilgi bulunmuyor" de
- Tahmin yapma, sadece verilen bağlamdaki bilgileri kullan
- Cevabını Türkçe olarak ver ve profesyonel bir dil kullan
- Özellikle [Kaynak 1], [Kaynak 2] ve [Kaynak 3]'teki bilgilere odaklan`;

export default function PromptsPage() {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.1);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
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

  // LLM Provider settings
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [savingLlmSettings, setSavingLlmSettings] = useState(false);

  // Unified embeddings settings
  const [unifiedEmbeddings, setUnifiedEmbeddings] = useState<UnifiedEmbeddings>({
    enabled: false,
    totalRecords: 0,
    embeddedRecords: 0
  });
  const [loadingEmbeddings, setLoadingEmbeddings] = useState(false);
  const [togglingEmbeddings, setTogglingEmbeddings] = useState(false);

  useEffect(() => {
    fetchPrompts();
    fetchChatbotSettings();
    fetchLlmProviders();
    fetchUnifiedEmbeddings();
  }, []);

  const fetchPrompts = async () => {
    try {
      const response = await fetch('/api/config/prompts');
      if (response.ok) {
        const data = await response.json();
        setPrompts(data.prompts || []);
        const active = data.prompts?.find((p: SystemPrompt) => p.isActive);
        if (active) {
          setActivePrompt(active);
          setEditingPrompt(active.prompt);
          setTemperature(active.temperature);
          setMaxTokens(active.maxTokens);
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

  const fetchLlmProviders = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/rag/config');
      if (response.ok) {
        const data = await response.json();
        setLlmProviders([
          { id: 'gemini', name: 'Google Gemini', available: data.apiKeys?.gemini || false },
          { id: 'claude', name: 'Anthropic Claude', available: data.apiKeys?.claude || false },
          { id: 'openai', name: 'OpenAI', available: data.apiKeys?.openai || false }
        ]);
        setSelectedProvider(data.aiProvider || 'gemini');
        setFallbackEnabled(data.fallbackEnabled || false);
      }
    } catch (error) {
      console.error('Failed to fetch LLM providers:', error);
    }
  };

  const fetchUnifiedEmbeddings = async () => {
    setLoadingEmbeddings(true);
    try {
      // Check if unified embeddings setting exists
      const response = await fetch('http://localhost:8083/api/v2/chatbot/settings');
      if (response.ok) {
        const data = await response.json();

        // Try to get unified embeddings stats from a specific endpoint
        try {
          const embedResponse = await fetch('http://localhost:8083/api/v2/embeddings/stats');
          if (embedResponse.ok) {
            const embedData = await embedResponse.json();
            setUnifiedEmbeddings({
              enabled: data.useUnifiedEmbeddings || false,
              totalRecords: embedData.totalRecords || 0,
              embeddedRecords: embedData.embeddedRecords || 0,
              lastEmbedded: embedData.lastEmbedded
            });
          } else {
            // Fallback to RAG config
            const ragResponse = await fetch('http://localhost:8083/api/v2/rag/config');
            if (ragResponse.ok) {
              const ragData = await ragResponse.json();
              const tableStats = ragData.tables || [];
              const unifiedTable = tableStats.find((t: any) => t.tableName === 'unified_embeddings');

              setUnifiedEmbeddings({
                enabled: data.useUnifiedEmbeddings || false,
                totalRecords: unifiedTable?.totalRecords || 0,
                embeddedRecords: unifiedTable?.embeddedRecords || 0,
                lastEmbedded: unifiedTable?.lastEmbedded
              });
            }
          }
        } catch (error) {
          console.warn('Failed to fetch embeddings stats, using defaults:', error);
          setUnifiedEmbeddings({
            enabled: data.useUnifiedEmbeddings || false,
            totalRecords: 0,
            embeddedRecords: 0
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch unified embeddings:', error);
      setUnifiedEmbeddings({
        enabled: false,
        totalRecords: 0,
        embeddedRecords: 0
      });
    } finally {
      setLoadingEmbeddings(false);
    }
  };

  const handleSavePrompt = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/config/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editingPrompt,
          temperature,
          maxTokens,
          name: 'Custom System Prompt'
        })
      });

      if (response.ok) {
        setSuccess(t('prompts.successUpdate'));
        fetchPrompts();
      } else {
        setError(t('prompts.failUpdate'));
      }
    } catch (error) {
      setError(t('prompts.connectionError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChatbot = async () => {
    setSavingChatbot(true);
    setError('');
    setSuccess('');
    
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
        setSuccess(t('prompts.chatbotSettingsSaved'));
        setTimeout(() => {
          setSuccess('');
        }, 3000);
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setError(t('prompts.settingsSaveFailed'));
    } finally {
      setSavingChatbot(false);
    }
  };

  const handleSaveLlmProvider = async () => {
    setSavingLlmSettings(true);
    const originalProvider = selectedProvider;
    const originalFallback = fallbackEnabled;

    try {
      const response = await fetch('http://localhost:8083/api/v2/rag/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: selectedProvider,
          fallbackEnabled
        })
      });

      if (response.ok) {
        setSuccess('LLM provider settings saved');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || 'Failed to save LLM provider settings');
      }
    } catch (error) {
      console.error('Failed to save LLM provider:', error);
      setError('Network error while saving LLM provider settings');
    } finally {
      setSavingLlmSettings(false);
    }
  };

  const handleToggleUnifiedEmbeddings = async () => {
    const newEnabled = !unifiedEmbeddings.enabled;
    const originalEnabled = unifiedEmbeddings.enabled;

    setTogglingEmbeddings(true);
    // Optimistic update
    setUnifiedEmbeddings({ ...unifiedEmbeddings, enabled: newEnabled });

    try {
      const response = await fetch('http://localhost:8083/api/v2/chatbot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...chatbotSettings,
          useUnifiedEmbeddings: newEnabled,
          suggestions: JSON.stringify(suggestions)
        })
      });

      if (response.ok) {
        setSuccess(`Unified embeddings ${newEnabled ? 'enabled' : 'disabled'}`);
        setTimeout(() => setSuccess(''), 3000);

        // Refresh embeddings data after enabling
        if (newEnabled) {
          fetchUnifiedEmbeddings();
        }
      } else {
        // Revert on error
        setUnifiedEmbeddings({ ...unifiedEmbeddings, enabled: originalEnabled });
        setError('Failed to update unified embeddings setting');
      }
    } catch (error) {
      console.error('Failed to toggle unified embeddings:', error);
      // Revert on error
      setUnifiedEmbeddings({ ...unifiedEmbeddings, enabled: originalEnabled });
      setError('Network error while updating unified embeddings setting');
    } finally {
      setTogglingEmbeddings(false);
    }
  };

  const handleResetPrompt = () => {
    setEditingPrompt(defaultPrompt);
    setTemperature(0.1);
    setMaxTokens(2048);
  };

  const handleResetChatbot = async () => {
    if (!confirm(t('prompts.confirmReset'))) {
      return;
    }
    
    try {
      const response = await fetch('http://localhost:8083/api/v2/chatbot/settings', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setSuccess(t('prompts.settingsReset'));
        fetchChatbotSettings();
      }
    } catch (error) {
      console.error('Failed to reset settings:', error);
      setError(t('prompts.settingsResetFailed'));
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editingPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const promptTemplates = [
    {
      name: t('prompts.templates.detailed'),
      prompt: 'Detaylı ve açıklayıcı cevaplar ver. Her konuyu örneklerle açıkla.',
      temp: 0.3
    },
    {
      name: t('prompts.templates.concise'),
      prompt: 'Kısa, net ve öz cevaplar ver. Sadece en önemli bilgileri paylaş.',
      temp: 0.1
    },
    {
      name: t('prompts.templates.creative'),
      prompt: 'Yaratıcı ve farklı bakış açıları sun. Alternatif çözümler öner.',
      temp: 0.7
    }
  ];

  return (
    <div className="p-6 lg:p-8 container mx-auto p-6 max-w-7xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">{t('prompts.title')}</h1>
        <Button onClick={() => { fetchPrompts(); fetchChatbotSettings(); fetchLlmProviders(); fetchUnifiedEmbeddings(); }} variant="outline" size="sm">
          <RotateCcw className="w-4 h-4 mr-2" />
          {t('prompts.refreshButton')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="chatbot" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="chatbot">
            <Bot className="w-4 h-4 mr-2" />
            {t('prompts.chatbotTab')}
          </TabsTrigger>
          <TabsTrigger value="prompt">
            <Settings className="w-4 h-4 mr-2" />
            {t('prompts.promptTab')}
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Brain className="w-4 h-4 mr-2" />
            AI Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chatbot" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('prompts.generalSettings.title')}</CardTitle>
                  <CardDescription>{t('prompts.generalSettings.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title">{t('prompts.labels.chatbotTitle')}</Label>
                    <Input
                      id="title"
                      value={chatbotSettings.title}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, title: e.target.value })}
                      placeholder={t('prompts.placeholders.chatbotTitle')}
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="logoUrl">{t('prompts.labels.logoUrl')}</Label>
                    <Input
                      id="logoUrl"
                      value={chatbotSettings.logoUrl}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, logoUrl: e.target.value })}
                      placeholder={t('prompts.placeholders.logoUrl')}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('prompts.placeholders.logoDescription')}</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="welcomeMessage">{t('prompts.labels.welcomeMessage')}</Label>
                    <Textarea
                      id="welcomeMessage"
                      value={chatbotSettings.welcomeMessage}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, welcomeMessage: e.target.value })}
                      placeholder={t('prompts.placeholders.welcomeMessage')}
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="placeholder">{t('prompts.labels.inputPlaceholder')}</Label>
                    <Input
                      id="placeholder"
                      value={chatbotSettings.placeholder}
                      onChange={(e) => setChatbotSettings({ ...chatbotSettings, placeholder: e.target.value })}
                      placeholder={t('prompts.placeholders.inputPlaceholder')}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="primaryColor">{t('prompts.labels.primaryColor')}</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="primaryColor"
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

                  <div className="flex gap-2">
                    <Button onClick={handleSaveChatbot} disabled={savingChatbot}>
                      <Save className="w-4 h-4 mr-2" />
                      {savingChatbot ? t('prompts.buttons.saving') : t('prompts.buttons.save')}
                    </Button>
                    <Button onClick={handleResetChatbot} variant="outline">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {t('prompts.buttons.resetToDefault')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('prompts.suggestions.title')}</CardTitle>
                  <CardDescription>{t('prompts.suggestions.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium">{t('prompts.suggestions.suggestion')} {index + 1}</span>
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
                            placeholder={t('prompts.labels.chatbotTitle')}
                          />
                        </div>
                        <div className="col-span-6">
                          <Input
                            value={suggestion.description}
                            onChange={(e) => updateSuggestion(index, 'description', e.target.value)}
                            placeholder={t('prompts.generalSettings.description')}
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
                    {t('prompts.buttons.addNewSuggestion')}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('prompts.preview.title')}</CardTitle>
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
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                        {chatbotSettings.title || t('prompts.preview.defaultTitle')}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {chatbotSettings.welcomeMessage || t('prompts.preview.defaultWelcome')}
                      </p>
                      {suggestions.length > 0 && (
                        <div className="space-y-2 text-left">
                          {suggestions.slice(0, 3).map((suggestion, index) => (
                            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow border text-sm">
                              <p className="font-medium">
                                {suggestion.icon} {suggestion.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
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

              <Card>
                <CardHeader>
                  <CardTitle>{t('prompts.palettes.title')}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatbotSettings({ ...chatbotSettings, primaryColor: '#3B82F6' })}
                  >
                    <div className="w-4 h-4 bg-blue-500 rounded mr-2" />
                    {t('prompts.palettes.blue')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatbotSettings({ ...chatbotSettings, primaryColor: '#10B981' })}
                  >
                    <div className="w-4 h-4 bg-green-500 rounded mr-2" />
                    {t('prompts.palettes.green')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatbotSettings({ ...chatbotSettings, primaryColor: '#8B5CF6' })}
                  >
                    <div className="w-4 h-4 bg-purple-500 rounded mr-2" />
                    {t('prompts.palettes.purple')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatbotSettings({ ...chatbotSettings, primaryColor: '#F59E0B' })}
                  >
                    <div className="w-4 h-4 bg-amber-500 rounded mr-2" />
                    {t('prompts.palettes.orange')}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prompt" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t('prompts.systemPrompt.title')}</CardTitle>
                  <CardDescription>{t('prompts.systemPrompt.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="prompt">{t('prompts.systemPrompt.promptText')}</Label>
                    <Textarea
                      id="prompt"
                      value={editingPrompt}
                      onChange={(e) => setEditingPrompt(e.target.value)}
                      rows={15}
                      className="font-mono text-sm"
                      placeholder="Sistem prompt'unu buraya yazın..."
                    />
                    <p className="text-sm text-muted-foreground">
                      {editingPrompt.length} {t('prompts.systemPrompt.characters')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="temperature">
                        {t('prompts.systemPrompt.temperature')}: {temperature}
                      </Label>
                      <Slider
                        id="temperature"
                        min={0}
                        max={1}
                        step={0.1}
                        value={[temperature]}
                        onValueChange={(v) => setTemperature(v[0])}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.systemPrompt.tempDescription')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxTokens">
                        {t('prompts.systemPrompt.maxTokens')}: {maxTokens}
                      </Label>
                      <Slider
                        id="maxTokens"
                        min={256}
                        max={8192}
                        step={256}
                        value={[maxTokens]}
                        onValueChange={(v) => setMaxTokens(v[0])}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('prompts.systemPrompt.maxTokensDescription')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSavePrompt} disabled={saving}>
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? t('prompts.buttons.saving') : t('prompts.buttons.save')}
                    </Button>
                    <Button onClick={handleResetPrompt} variant="outline">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {t('prompts.buttons.resetToDefault')}
                    </Button>
                    <Button onClick={handleCopy} variant="outline">
                      {copied ? (
                        <Check className="w-4 h-4 mr-2" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      {copied ? t('prompts.copied') : t('prompts.copy')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('prompts.templates.title')}</CardTitle>
                  <CardDescription>{t('prompts.templates.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {promptTemplates.map((template) => (
                    <Button
                      key={template.name}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        setEditingPrompt(defaultPrompt + '\n\n' + template.prompt);
                        setTemperature(template.temp);
                      }}
                    >
                      {template.name}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('prompts.tips.title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">{t('prompts.tips.references')}</p>
                    <p className="text-muted-foreground">{t('prompts.tips.referencesDesc')}</p>
                  </div>
                  <div>
                    <p className="font-medium">{t('prompts.tips.context')}</p>
                    <p className="text-muted-foreground">{t('prompts.tips.contextDesc')}</p>
                  </div>
                  <div>
                    <p className="font-medium">{t('prompts.tips.temperature')}</p>
                    <p className="text-muted-foreground">{t('prompts.tips.temperatureDesc')}</p>
                  </div>
                </CardContent>
              </Card>

              {activePrompt && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('prompts.activePrompt.title')}</CardTitle>
                    <CardDescription>{t('prompts.activePrompt.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">
                      <span className="font-medium">{t('prompts.activePrompt.name')}:</span> {activePrompt.name}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">{t('prompts.systemPrompt.temperature')}:</span> {activePrompt.temperature}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">{t('prompts.systemPrompt.maxTokens')}:</span> {activePrompt.maxTokens}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">{t('prompts.activePrompt.updated')}:</span>{' '}
                      {new Date(activePrompt.updatedAt).toLocaleString('tr-TR')}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* LLM Provider Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    LLM Provider Settings
                  </CardTitle>
                  <CardDescription>
                    Select and configure the AI provider for chatbot responses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="provider">Primary AI Provider</Label>
                    <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {llmProviders.map((provider) => (
                          <SelectItem
                            key={provider.id}
                            value={provider.id}
                            disabled={!provider.available}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${provider.available ? 'bg-green-500' : 'bg-red-500'}`} />
                              {provider.name}
                              {!provider.available && <span className="text-xs text-muted-foreground">(Not configured)</span>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Fallback Providers</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically use other providers if primary fails
                      </p>
                    </div>
                    <Switch
                      checked={fallbackEnabled}
                      onCheckedChange={setFallbackEnabled}
                    />
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Provider Priority
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      1. {selectedProvider} (Primary){'\n'}
                      {fallbackEnabled && (
                        <>
                          2. {llmProviders.find(p => p.id !== selectedProvider && p.available)?.name || 'Other'} (Fallback){'\n'}
                          3. {llmProviders.find(p => p.id !== selectedProvider && p.id !== llmProviders.find(p2 => p2.id !== selectedProvider && p2.available)?.id && p.available)?.name || 'Remaining'} (Last Resort)
                        </>
                      )}
                    </p>
                  </div>

                  <Button onClick={handleSaveLlmProvider} disabled={savingLlmSettings}>
                    {savingLlmSettings ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Provider Settings
                  </Button>
                </CardContent>
              </Card>

              {/* Unified Embeddings Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Unified Embeddings
                  </CardTitle>
                  <CardDescription>
                    Configure semantic search using unified embeddings table
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Use Unified Embeddings</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable semantic search from unified_embeddings table
                      </p>
                    </div>
                    <Switch
                      checked={unifiedEmbeddings.enabled}
                      onCheckedChange={handleToggleUnifiedEmbeddings}
                      disabled={loadingEmbeddings || togglingEmbeddings}
                    />
                  </div>

                  {unifiedEmbeddings.enabled && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                          <p className="text-2xl font-bold">{unifiedEmbeddings.embeddedRecords.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">Embedded Records</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                          <p className="text-2xl font-bold">{unifiedEmbeddings.totalRecords.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">Total Records</p>
                        </div>
                      </div>

                      {unifiedEmbeddings.lastEmbedded && (
                        <p className="text-xs text-muted-foreground">
                          Last embedded: {new Date(unifiedEmbeddings.lastEmbedded).toLocaleString()}
                        </p>
                      )}

                      {unifiedEmbeddings.embeddedRecords > 0 ? (
                        <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            ✓ Semantic search is active
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                            The chatbot will perform vector similarity search to find relevant documents before generating responses.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg">
                          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                            ⚠ No embedded documents found
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            Unified embeddings is enabled but no documents have been embedded yet. Run the embedding process to populate the knowledge base.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {!unifiedEmbeddings.enabled && (
                    <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg">
                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                        Semantic search is disabled
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                        Enable unified embeddings to allow the chatbot to find and reference relevant documents from the knowledge base.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {/* AI Provider Status */}
              <Card>
                <CardHeader>
                  <CardTitle>Provider Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {llmProviders.map((provider) => (
                    <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${provider.available ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className="text-xs text-muted-foreground">{provider.id}</p>
                        </div>
                      </div>
                      <Badge variant={provider.available ? 'default' : 'secondary'}>
                        {provider.available ? 'Available' : 'Not Configured'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Semantic Search Info */}
              <Card>
                <CardHeader>
                  <CardTitle>How Semantic Search Works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold">1</span>
                    </div>
                    <p>User question is converted to vector embedding</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold">2</span>
                    </div>
                    <p>System finds similar documents using vector similarity</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold">3</span>
                    </div>
                    <p>Relevant sources are added to the context</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold">4</span>
                    </div>
                    <p>LLM generates response using the context</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
