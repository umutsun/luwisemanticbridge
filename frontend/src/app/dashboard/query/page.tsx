'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Search,
  Loader2,
  Brain,
  Database,
  Zap,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  FileText,
  Hash,
  Cpu
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

// API endpoint'leri
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8083";

interface QueryResult {
  answer?: string;
  results?: any[];
  sources?: any[];
  confidence?: number;
  executionTime?: string;
  tokensUsed?: number;
  provider?: string;
}

export default function UnifiedQueryPage() {

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  
  // Query settings
  const [queryMode, setQueryMode] = useState('hybrid');
  const [temperature, setTemperature] = useState([0.3]);
  const [topK, setTopK] = useState([5]);
  const [useCache, setUseCache] = useState(true);
  
  // System stats
  const [systemStats, setSystemStats] = useState<any>(null);

  useEffect(() => {
    fetchSystemStats();
  }, []);

  const fetchSystemStats = async () => {
    try {
      const [lightragRes, dashboardRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v2/lightrag/stats`),
        fetch(`${API_BASE_URL}/api/v2/dashboard`)
      ]);
      
      const lightrag = await lightragRes.json();
      const dashboard = await dashboardRes.json();
      
      setSystemStats({
        lightrag,
        dashboard,
        totalDocuments: (lightrag.documentCount || 0) + (dashboard.database?.documents || 0)
      });
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
    }
  };

  const handleQuery = async () => {
    if (!query.trim()) {
      toast.error('Lütfen bir soru girin');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      let endpoint = '';
      let body: any = {
        query: query.trim(),
        temperature: temperature[0],
        k: topK[0],
        use_cache: useCache
      };

      // Determine endpoint based on mode
      switch (queryMode) {
        case 'lightrag':
          endpoint = `${API_BASE_URL}/api/v2/lightrag/query`;
          break;
        case 'semantic':
          endpoint = `${API_BASE_URL}/api/v2/search/semantic`;
          body = {
            query: query.trim(),
            limit: topK[0],
            threshold: 0.7
          };
          break;
        case 'hybrid':
          endpoint = `${API_BASE_URL}/api/v2/search/hybrid`;
          body = {
            query: query.trim(),
            limit: topK[0],
            semantic_weight: 0.7,
            keyword_weight: 0.3
          };
          break;
        case 'raganything':
          endpoint = `${API_BASE_URL}/api/v2/raganything/query`;
          break;
        default:
          endpoint = `${API_BASE_URL}/api/v2/chat`;
      }

      const startTime = Date.now();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      const executionTime = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;

      if (response.ok) {
        setResult({
          answer: data.answer || data.response || formatSemanticResults(data.results),
          results: data.results || data.documents,
          sources: data.sources || extractSources(data.results),
          confidence: data.confidence || calculateConfidence(data.results),
          executionTime,
          tokensUsed: data.tokens_used || data.tokensUsed || estimateTokens(data),
          provider: data.provider || queryMode
        });
        
        toast.success('Sorgu başarıyla tamamlandı');
      } else {
        setError(data.error || 'Sorgu başarısız oldu');
        toast.error(data.error || 'Sorgu başarısız oldu');
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası');
      toast.error('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  const formatSemanticResults = (results: any[]) => {
    if (!results || results.length === 0) return 'Sonuç bulunamadı.';
    
    return results
      .map((r, i) => `${i + 1}. ${r.content || r.text}`)
      .join('\n\n');
  };

  const extractSources = (results: any[]) => {
    if (!results) return [];
    
    return results.map(r => ({
      title: r.document_type || r.source || 'Unknown',
      url: r.url || '#',
      relevance: r.similarity || r.score || 0
    }));
  };

  const calculateConfidence = (results: any[]) => {
    if (!results || results.length === 0) return 0;
    
    const avgScore = results.reduce((acc, r) => 
      acc + (r.similarity || r.score || 0), 0) / results.length;
    
    return Math.round(avgScore * 100);
  };

  const estimateTokens = (data: any) => {
    const text = JSON.stringify(data);
    return Math.ceil(text.length / 4);
  };

  const queryModes = [
    { value: 'hybrid', label: 'Hybrid RAG', icon: Sparkles, description: 'Semantic + Keyword' },
    { value: 'lightrag', label: 'LightRAG', icon: Brain, description: 'Graph-based RAG' },
    { value: 'semantic', label: 'Semantic', icon: Hash, description: 'Vector search' },
    { value: 'raganything', label: 'RAGAnything', icon: Zap, description: 'Universal RAG' }
  ];

  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Unified RAG Query</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tüm RAG sistemlerini tek yerden sorgulayın
          </p>
        </div>
        <div className="flex gap-2">
          {systemStats && (
            <>
              <Badge variant="outline" className="gap-1">
                <FileText className="h-3 w-3" />
                {systemStats.totalDocuments} Doküman
              </Badge>
              <Badge variant={systemStats.lightrag?.initialized ? "success" : "secondary"} className="gap-1">
                <Brain className="h-3 w-3" />
                LightRAG
              </Badge>
              <Badge variant="success" className="gap-1">
                <Database className="h-3 w-3" />
                pgvector
              </Badge>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Query Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Soru Sorun</CardTitle>
              <CardDescription>
                Dokümanlarınızdan bilgi almak için soru sorun
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Query Mode</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {queryModes.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.value}
                        onClick={() => setQueryMode(mode.value)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          queryMode === mode.value 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <div className="text-left">
                            <p className="font-medium text-sm">{mode.label}</p>
                            <p className="text-xs text-muted-foreground">{mode.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>Sorunuz</Label>
                <Textarea
                  placeholder="Örn: Vergi indirimi koşulları nelerdir?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {query.length} karakter
                </p>
              </div>

              {/* Advanced Settings */}
              <div className="space-y-3 pt-3 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Temperature: {temperature[0]}</Label>
                  <Slider
                    value={temperature}
                    onValueChange={setTemperature}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-32"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Top K: {topK[0]}</Label>
                  <Slider
                    value={topK}
                    onValueChange={setTopK}
                    min={1}
                    max={10}
                    step={1}
                    className="w-32"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Cache Kullan</Label>
                  <Switch
                    checked={useCache}
                    onCheckedChange={setUseCache}
                  />
                </div>
              </div>

              <Button 
                onClick={handleQuery}
                disabled={loading || !query.trim()}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sorgulanıyor...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Sorgula
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <Card className="border-green-200">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <CardTitle>Sorgu Sonucu</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{result.provider}</Badge>
                    <Badge variant="outline">{result.executionTime}</Badge>
                    {result.tokensUsed && (
                      <Badge variant="outline">{result.tokensUsed} token</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    {result.answer}
                  </div>
                </div>

                {result.confidence !== undefined && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Güven Skoru</span>
                      <span>{result.confidence}%</span>
                    </div>
                    <Progress value={result.confidence} />
                  </div>
                )}

                {result.sources && result.sources.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">Kaynaklar</Label>
                    <div className="space-y-1">
                      {result.sources.map((source, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                          <span>{source.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {(source.relevance * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sistem Durumu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>LightRAG</span>
                  <Badge variant={systemStats?.lightrag?.initialized ? "success" : "secondary"}>
                    {systemStats?.lightrag?.initialized ? 'Aktif' : 'Pasif'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>pgvector</span>
                  <Badge variant="success">Aktif</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Toplam Doküman</span>
                  <span className="font-mono">{systemStats?.totalDocuments || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Embeddings</span>
                  <span className="font-mono">{systemStats?.dashboard?.database?.embeddings || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Query Mode Özellikleri</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {queryMode === 'hybrid' && (
                  <div className="space-y-2">
                    <p className="font-medium">Hybrid RAG</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Semantic + Keyword search</li>
                      <li>• En iyi sonuçlar için</li>
                      <li>• pgvector + FTS kullanır</li>
                    </ul>
                  </div>
                )}
                {queryMode === 'lightrag' && (
                  <div className="space-y-2">
                    <p className="font-medium">LightRAG</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Graph-based RAG</li>
                      <li>• İlişkisel sorgular için</li>
                      <li>• Langchain kullanır</li>
                    </ul>
                  </div>
                )}
                {queryMode === 'semantic' && (
                  <div className="space-y-2">
                    <p className="font-medium">Semantic Search</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Vektör benzerliği</li>
                      <li>• Anlamsal arama</li>
                      <li>• OpenAI embeddings</li>
                    </ul>
                  </div>
                )}
                {queryMode === 'raganything' && (
                  <div className="space-y-2">
                    <p className="font-medium">RAGAnything</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Universal RAG</li>
                      <li>• Multi-modal destekli</li>
                      <li>• Otomatik indeksleme</li>
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Örnek Sorular</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  'KDV indirimi şartları nelerdir?',
                  'E-fatura zorunluluğu kimleri kapsar?',
                  'Vergi cezası affı nasıl yapılır?'
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(example)}
                    className="w-full text-left p-2 text-sm hover:bg-muted rounded-lg transition-colors"
                  >
                    <ArrowRight className="h-3 w-3 inline mr-2" />
                    {example}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}