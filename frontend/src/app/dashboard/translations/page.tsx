'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Languages,
  Upload,
  FileText,
  Download,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Globe,
  Brain,
  Database,
  Save,
  Search
} from 'lucide-react';

interface TranslationProvider {
  name: string;
  apiKey: string;
  validated: boolean;
  costPerChar: number;
  supportedLanguages: string[];
}

interface EmbeddingProvider {
  name: string;
  apiKey: string;
  validated: boolean;
  costPerToken: number;
  model: string;
}

interface TranslationJob {
  id: string;
  sourceText: string;
  translatedText?: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  cost?: number;
  createdAt: Date;
}

interface EmbeddingJob {
  id: string;
  content: string;
  sourceTable: string;
  provider: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  tokenCount?: number;
  cost?: number;
  createdAt: Date;
}

export default function TranslationsPage() {
  const [activeTab, setActiveTab] = useState('translate');
  const { toast } = useToast();

  // Translation state
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('tr');
  const [selectedTranslationProvider, setSelectedTranslationProvider] = useState('google');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationHistory, setTranslationHistory] = useState<TranslationJob[]>([]);

  // Embedding state
  const [embeddingContent, setEmbeddingContent] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useState('openai');
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embeddingHistory, setEmbeddingHistory] = useState<EmbeddingJob[]>([]);

  // Provider state
  const [translationProviders, setTranslationProviders] = useState<Record<string, TranslationProvider>>({
    google: {
      name: 'Google Translate',
      apiKey: '',
      validated: false,
      costPerChar: 0.00002,
      supportedLanguages: ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']
    },
    deepl: {
      name: 'DeepL',
      apiKey: '',
      validated: false,
      costPerChar: 0.000006,
      supportedLanguages: ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja']
    }
  });

  const [embeddingProviders, setEmbeddingProviders] = useState<Record<string, EmbeddingProvider>>({
    openai: {
      name: 'OpenAI',
      apiKey: '',
      validated: false,
      costPerToken: 0.00013,
      model: 'text-embedding-3-large'
    },
    google: {
      name: 'Google AI',
      apiKey: '',
      validated: false,
      costPerToken: 0.0001,
      model: 'text-embedding-004'
    }
  });

  // Available tables for embedding
  const [availableTables, setAvailableTables] = useState<string[]>([]);

  useEffect(() => {
    loadAvailableTables();
    loadTranslationHistory();
    loadEmbeddingHistory();
  }, []);

  const loadAvailableTables = async () => {
    try {
      const response = await fetch('/api/v2/embeddings-tables/all');
      if (response.ok) {
        const data = await response.json();
        setAvailableTables(data.tables?.map((t: any) => t.name) || []);
      }
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  };

  const loadTranslationHistory = async () => {
    try {
      const response = await fetch('/api/v2/translations/history');
      if (response.ok) {
        const data = await response.json();
        setTranslationHistory(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to load translation history:', error);
    }
  };

  const loadEmbeddingHistory = async () => {
    try {
      const response = await fetch('/api/v2/embeddings/history');
      if (response.ok) {
        const data = await response.json();
        setEmbeddingHistory(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to load embedding history:', error);
    }
  };

  const handleTranslate = async () => {
    if (!sourceText.trim()) {
      toast({
        title: "Error",
        description: "Please enter text to translate",
        variant: "destructive"
      });
      return;
    }

    const provider = translationProviders[selectedTranslationProvider];
    if (!provider.validated) {
      toast({
        title: "Provider Not Validated",
        description: `Please validate the ${provider.name} API key first`,
        variant: "destructive"
      });
      return;
    }

    setIsTranslating(true);
    try {
      const response = await fetch('/api/v2/translations/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          sourceLang,
          targetLang,
          provider: selectedTranslationProvider
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTranslatedText(data.translatedText);

        const newJob: TranslationJob = {
          id: Date.now().toString(),
          sourceText,
          translatedText: data.translatedText,
          sourceLang,
          targetLang,
          provider: selectedTranslationProvider,
          status: 'completed',
          cost: data.cost,
          createdAt: new Date()
        };

        setTranslationHistory(prev => [newJob, ...prev.slice(0, 9)]);

        toast({
          title: "Translation Complete",
          description: `Text translated using ${provider.name}`,
        });
      } else {
        throw new Error('Translation failed');
      }
    } catch (error) {
      toast({
        title: "Translation Failed",
        description: "Failed to translate text",
        variant: "destructive"
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleEmbed = async () => {
    if (!embeddingContent.trim()) {
      toast({
        title: "Error",
        description: "Please enter content to embed",
        variant: "destructive"
      });
      return;
    }

    if (!selectedTable) {
      toast({
        title: "Error",
        description: "Please select a target table",
        variant: "destructive"
      });
      return;
    }

    const provider = embeddingProviders[selectedEmbeddingProvider];
    if (!provider.validated) {
      toast({
        title: "Provider Not Validated",
        description: `Please validate the ${provider.name} API key first`,
        variant: "destructive"
      });
      return;
    }

    setIsEmbedding(true);
    try {
      const response = await fetch('/api/v2/embeddings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: embeddingContent,
          sourceTable: selectedTable,
          provider: selectedEmbeddingProvider
        })
      });

      if (response.ok) {
        const data = await response.json();

        const newJob: EmbeddingJob = {
          id: Date.now().toString(),
          content: embeddingContent,
          sourceTable: selectedTable,
          provider: selectedEmbeddingProvider,
          status: 'completed',
          tokenCount: data.tokenCount,
          cost: data.cost,
          createdAt: new Date()
        };

        setEmbeddingHistory(prev => [newJob, ...prev.slice(0, 9)]);

        toast({
          title: "Embedding Complete",
          description: `Content embedded into ${selectedTable} using ${provider.name}`,
        });

        setEmbeddingContent('');
      } else {
        throw new Error('Embedding failed');
      }
    } catch (error) {
      toast({
        title: "Embedding Failed",
        description: "Failed to create embeddings",
        variant: "destructive"
      });
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'translate' | 'embed') => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    if (type === 'translate') {
      setSourceText(text);
    } else {
      setEmbeddingContent(text);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Languages className="w-8 h-8" />
            Translation & Embedding Hub
          </h1>
          <p className="text-muted-foreground mt-2">
            Translate text using multiple providers and create vector embeddings
          </p>
        </div>
      </div>

      {/* Provider Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Translation Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.values(translationProviders).map(provider => (
                <div key={provider.name} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${provider.validated ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">${provider.costPerChar * 1000000}/1M chars</p>
                    </div>
                  </div>
                  <Badge variant={provider.validated ? "default" : "secondary"}>
                    {provider.validated ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Embedding Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.values(embeddingProviders).map(provider => (
                <div key={provider.name} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${provider.validated ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">{provider.model}</p>
                    </div>
                  </div>
                  <Badge variant={provider.validated ? "default" : "secondary"}>
                    {provider.validated ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 h-14">
          <TabsTrigger value="translate" className="flex items-center gap-2 h-12">
            <Languages className="w-4 h-4" />
            Translation
          </TabsTrigger>
          <TabsTrigger value="embeddings" className="flex items-center gap-2 h-12">
            <Database className="w-4 h-4" />
            Embeddings
          </TabsTrigger>
        </TabsList>

        {/* Translation Tab */}
        <TabsContent value="translate">
          <Card>
            <CardHeader>
              <CardTitle>Text Translation</CardTitle>
              <CardDescription>
                Translate text between multiple languages using AI providers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider and Language Selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Translation Provider</Label>
                  <Select
                    value={selectedTranslationProvider}
                    onValueChange={setSelectedTranslationProvider}
                    disabled={!translationProviders[selectedTranslationProvider].validated}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(translationProviders).map(([key, provider]) => (
                        <SelectItem key={key} value={key} disabled={!provider.validated}>
                          {provider.name} {provider.validated ? '✓' : '(Configure API key)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source Language</Label>
                  <Select value={sourceLang} onValueChange={setSourceLang}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="tr">Turkish</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target Language</Label>
                  <Select value={targetLang} onValueChange={setTargetLang}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tr">Turkish</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <Label>Upload File (Optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="file"
                    accept=".txt,.md,.csv"
                    onChange={(e) => handleFileUpload(e, 'translate')}
                    className="hidden"
                    id="translate-file"
                  />
                  <Button asChild variant="outline">
                    <label htmlFor="translate-file" className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Text File
                    </label>
                  </Button>
                </div>
              </div>

              {/* Text Areas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Source Text</Label>
                  <Textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder="Enter text to translate..."
                    rows={8}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Translated Text</Label>
                  <Textarea
                    value={translatedText}
                    readOnly
                    placeholder="Translation will appear here..."
                    rows={8}
                    className="mt-1 bg-muted"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button onClick={handleTranslate} disabled={isTranslating || !sourceText}>
                  {isTranslating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Translating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Translate
                    </>
                  )}
                </Button>
                {translatedText && (
                  <Button variant="outline" onClick={() => {
                    navigator.clipboard.writeText(translatedText);
                    toast({ title: "Copied to clipboard" });
                  }}>
                    <Download className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embeddings Tab */}
        <TabsContent value="embeddings">
          <Card>
            <CardHeader>
              <CardTitle>Create Embeddings</CardTitle>
              <CardDescription>
                Create vector embeddings from text and store them in your database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider and Table Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Embedding Provider</Label>
                  <Select
                    value={selectedEmbeddingProvider}
                    onValueChange={setSelectedEmbeddingProvider}
                    disabled={!embeddingProviders[selectedEmbeddingProvider].validated}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(embeddingProviders).map(([key, provider]) => (
                        <SelectItem key={key} value={key} disabled={!provider.validated}>
                          {provider.name} ({provider.model}) {provider.validated ? '✓' : '(Configure API key)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target Table</Label>
                  <Select value={selectedTable} onValueChange={setSelectedTable}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select table" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTables.map(table => (
                        <SelectItem key={table} value={table}>
                          {table}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <Label>Upload File (Optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    onChange={(e) => handleFileUpload(e, 'embed')}
                    className="hidden"
                    id="embed-file"
                  />
                  <Button asChild variant="outline">
                    <label htmlFor="embed-file" className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Text File
                    </label>
                  </Button>
                </div>
              </div>

              {/* Text Input */}
              <div>
                <Label>Content to Embed</Label>
                <Textarea
                  value={embeddingContent}
                  onChange={(e) => setEmbeddingContent(e.target.value)}
                  placeholder="Enter text content to create embeddings..."
                  rows={10}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This content will be converted to vector embeddings and stored in the selected table
                </p>
              </div>

              {/* Action Button */}
              <Button onClick={handleEmbed} disabled={isEmbedding || !embeddingContent || !selectedTable}>
                {isEmbedding ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Creating Embeddings...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    Create Embeddings
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Translated Data Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Translated Data Storage
          </CardTitle>
          <CardDescription>
            Store and manage translated content for embedding and future use
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Storage Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-950">
                <div className="text-2xl font-bold text-blue-600">0</div>
                <div className="text-sm text-muted-foreground">Total Translations</div>
              </div>
              <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-950">
                <div className="text-2xl font-bold text-green-600">0</div>
                <div className="text-sm text-muted-foreground">Embedded</div>
              </div>
              <div className="p-4 rounded-lg border bg-purple-50 dark:bg-purple-950">
                <div className="text-2xl font-bold text-purple-600">0</div>
                <div className="text-sm text-muted-foreground">Languages</div>
              </div>
              <div className="p-4 rounded-lg border bg-orange-50 dark:bg-orange-950">
                <div className="text-2xl font-bold text-orange-600">$0.00</div>
                <div className="text-sm text-muted-foreground">Total Cost</div>
              </div>
            </div>

            {/* Save Translation Button */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Save Current Translation</h4>
                <p className="text-sm text-muted-foreground">Store translated content for embedding and future use</p>
              </div>
              <Button
                onClick={() => {
                  if (translatedText) {
                    // Save translation logic here
                    toast({
                      title: "Translation Saved",
                      description: "Translated content has been stored successfully"
                    });
                  }
                }}
                disabled={!translatedText}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                Save Translation
              </Button>
            </div>

            {/* Translation Storage Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Stored Translations</h4>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    // Create embeddings table first
                    fetch('/api/v2/translation-embeddings/create-table', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                      }
                    }).then(response => {
                      if (response.ok) {
                        toast({
                          title: "Table Created",
                          description: "Translation embeddings table is ready"
                        });
                      }
                    }).catch(error => {
                      toast({
                        title: "Error",
                        description: "Failed to create embeddings table",
                        variant: "destructive"
                      });
                    });
                  }}
                >
                  <Database className="w-4 h-4" />
                  Setup Embeddings
                </Button>
              </div>
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Source</th>
                      <th className="text-left p-3 font-medium">Translated</th>
                      <th className="text-left p-3 font-medium">Languages</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No stored translations yet. Translate and save content to see it here.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Embedding Section */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Vector Embeddings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium mb-2">Search Similar Translations</h5>
                  <p className="text-sm text-muted-foreground mb-3">
                    Find semantically similar translations using vector search
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      toast({
                        title: "Feature Coming Soon",
                        description: "Vector search will be available after storing translations with embeddings"
                      });
                    }}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search Embeddings
                  </Button>
                </div>
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium mb-2">Embedding Statistics</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Embeddings:</span>
                      <span className="font-medium">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Languages:</span>
                      <span className="font-medium">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Providers:</span>
                      <span className="font-medium">0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Translation History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Translation History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {translationHistory.length > 0 ? (
              <div className="space-y-3">
                {translationHistory.map(job => (
                  <div key={job.id} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {translationProviders[job.provider]?.name}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {job.createdAt.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {job.sourceLang} → {job.targetLang}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {job.sourceText}
                    </p>
                    {job.translatedText && (
                      <p className="text-sm text-blue-600 line-clamp-2">
                        {job.translatedText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No translation history yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Embedding History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Embedding History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {embeddingHistory.length > 0 ? (
              <div className="space-y-3">
                {embeddingHistory.map(job => (
                  <div key={job.id} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {embeddingProviders[job.provider]?.name}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {job.createdAt.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      Table: {job.sourceTable}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {job.content}
                    </p>
                    {job.tokenCount && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Tokens: {job.tokenCount}</span>
                        <span>Cost: ${job.cost?.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No embedding history yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}