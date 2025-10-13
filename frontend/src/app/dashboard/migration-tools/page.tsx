'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Upload, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  XCircle,
  Zap,
  FileText,
  Hash,
  Brain,
  Sparkles,
  ArrowRight,
  Trash2,
  Globe,
  FileUp,
  DollarSign,
  Activity,
  AlertCircle,
  Clock
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface MigrationStats {
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  tables: {
    name: string;
    count: number;
    embedded: number;
  }[];
  tokenUsage?: {
    total_tokens: number;
    estimated_cost: number;
    savedTokens?: number;
    savedCost?: number;
    cacheHits?: number;
  };
}

interface EmbeddingProgress {
  current: number;
  total: number;
  percentage: number;
  status: string;
  currentTable?: string;
  currentRecord?: string;
  tokenUsage?: {
    total_tokens: number;
    estimated_cost: number;
  };
}

export default function MigrationToolsPage() {
  const [activeTab, setActiveTab] = useState('database');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Source selection
  const [sourceType, setSourceType] = useState<'database' | 'file' | 'url'>('database');
  const [sourceConfig, setSourceConfig] = useState({
    // Database source
    database: 'rag_chatbot',
    table: 'all',
    
    // File source
    file: null as File | null,
    
    // URL source
    url: '',
    selector: '',
    maxPages: 10
  });
  
  // Migration settings
  const [migrationConfig, setMigrationConfig] = useState({
    batchSize: 50,
    chunkSize: 1000,
    overlapSize: 200,
    optimizeTokens: true,
    useCache: true
  });

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/migration/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const startMigration = async () => {
    setIsLoading(true);
    setMessage(null);
    setProgress({ current: 0, total: 0, percentage: 0, status: 'Başlatılıyor...' });

    try {
      let endpoint = '';
      let body: any = {};
      
      switch(sourceType) {
        case 'database':
          endpoint = 'http://localhost:8083/api/v2/migration/start';
          body = {
            sourceTable: sourceConfig.table,
            ...migrationConfig
          };
          break;
          
        case 'file':
          if (!sourceConfig.file) {
            throw new Error('Lütfen bir dosya seçin');
          }
          endpoint = 'http://localhost:8083/api/v2/migration/file';
          const formData = new FormData();
          formData.append('file', sourceConfig.file);
          Object.entries(migrationConfig).forEach(([key, value]) => {
            formData.append(key, value.toString());
          });
          body = formData;
          break;
          
        case 'url':
          if (!sourceConfig.url) {
            throw new Error('Lütfen bir URL girin');
          }
          endpoint = 'http://localhost:8083/api/v2/migration/scrape';
          body = {
            url: sourceConfig.url,
            selector: sourceConfig.selector,
            maxPages: sourceConfig.maxPages,
            ...migrationConfig
          };
          break;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        ...(sourceType !== 'file' && { headers: { 'Content-Type': 'application/json' }}),
        body: sourceType === 'file' ? body : JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Migration failed');

      // Start polling for progress
      const pollInterval = setInterval(async () => {
        const progressResponse = await fetch('http://localhost:8083/api/v2/migration/progress');
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          setProgress(progressData);
          
          if (progressData.status === 'completed' || progressData.status === 'failed') {
            clearInterval(pollInterval);
            setIsLoading(false);
            
            if (progressData.status === 'completed') {
              setMessage({ 
                type: 'success', 
                text: `Migration tamamlandı! ${progressData.tokenUsage ? 
                  `Kullanılan Token: ${progressData.tokenUsage.total_tokens.toLocaleString()}, 
                   Maliyet: $${progressData.tokenUsage.estimated_cost.toFixed(4)}` : ''}` 
              });
              loadStats();
            } else {
              setMessage({ type: 'error', text: 'Migration başarısız oldu' });
            }
          }
        }
      }, 1000);

    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Migration başlatılamadı' });
      setIsLoading(false);
    }
  };

  const generateEmbeddings = async () => {
    setIsLoading(true);
    setMessage(null);
    setProgress({ current: 0, total: stats?.pendingRecords || 0, percentage: 0, status: 'Embedding oluşturuluyor...' });

    try {
      const response = await fetch('http://localhost:8083/api/v2/migration/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: migrationConfig.batchSize,
          useCache: migrationConfig.useCache,
          optimizeTokens: migrationConfig.optimizeTokens
        })
      });

      if (!response.ok) throw new Error('Embedding generation failed');

      // Stream progress updates
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = new TextDecoder().decode(value);
          const lines = text.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                setProgress(data);
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      setMessage({ type: 'success', text: 'Tüm embedding\'ler oluşturuldu!' });
      loadStats();
    } catch (error) {
      setMessage({ type: 'error', text: 'Embedding oluşturma başarısız' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSourceConfig(prev => ({ ...prev, file }));
      setMessage({ type: 'info', text: `Dosya seçildi: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` });
    }
  };

  return (
    <div className="p-6 lg:p-8 container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Database className="h-8 w-8" />
          Migration & Embedding Merkezi
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Veritabanı, doküman ve web içeriklerini embed edin
        </p>
      </div>

      {message && (
        <Alert className={'mb-6 ' + (
          message.type === 'error' ? 'border-red-500' : 
          message.type === 'success' ? 'border-green-500' : 
          'border-blue-500'
        )}>
          <AlertDescription className="flex items-center gap-2">
            {message.type === 'error' && <XCircle className="h-4 w-4" />}
            {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
            {message.type === 'info' && <AlertCircle className="h-4 w-4" />}
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Toplam Kayıt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRecords.toLocaleString()}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Embedding\'li</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.embeddedRecords.toLocaleString()}
              </div>
              <Progress 
                value={(stats.embeddedRecords / Math.max(stats.totalRecords, 1)) * 100} 
                className="mt-2 h-1"
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Bekleyen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {stats.pendingRecords.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Hash className="h-3 w-3" />
                Token Kullanım
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {stats.tokenUsage?.total_tokens?.toLocaleString() || '0'}
              </div>
              {stats.tokenUsage?.savedTokens && (
                <div className="text-xs text-green-600">
                  {stats.tokenUsage.savedTokens.toLocaleString()} tasarruf
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Maliyet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                ${stats.tokenUsage?.estimated_cost?.toFixed(4) || '0.00'}
              </div>
              {stats.tokenUsage?.savedCost && (
                <div className="text-xs text-green-600">
                  ${stats.tokenUsage.savedCost.toFixed(4)} tasarruf
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress Bar */}
      {progress && isLoading && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 animate-pulse" />
                  {progress.status}
                </span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              
              <Progress value={progress.percentage} className="h-3" />
              
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                {progress.currentTable && (
                  <div>
                    <span className="font-medium">Tablo:</span> {progress.currentTable}
                  </div>
                )}
                {progress.currentRecord && (
                  <div className="truncate">
                    <span className="font-medium">Kayıt:</span> {progress.currentRecord}
                  </div>
                )}
                {progress.tokenUsage && (
                  <>
                    <div>
                      <span className="font-medium">Token:</span> {progress.tokenUsage.total_tokens.toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Maliyet:</span> ${progress.tokenUsage.estimated_cost.toFixed(4)}
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Tahmini süre: {Math.ceil((progress.total - progress.current) / 10)} saniye</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="database">
            <Database className="h-4 w-4 mr-2" />
            Veritabanı
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileUp className="h-4 w-4 mr-2" />
            Dokümanlar
          </TabsTrigger>
          <TabsTrigger value="webscrape">
            <Globe className="h-4 w-4 mr-2" />
            Web Scraping
          </TabsTrigger>
          <TabsTrigger value="embeddings">
            <Sparkles className="h-4 w-4 mr-2" />
            Embeddings
          </TabsTrigger>
        </TabsList>

        {/* Database Migration Tab */}
        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Veritabanı Migration</CardTitle>
              <CardDescription>
                Mevcut veritabanı tablolarından veri aktarımı ve embedding
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Kaynak Veritabanı</Label>
                  <Select 
                    value={sourceConfig.database}
                    onValueChange={(value) => setSourceConfig(prev => ({ ...prev, database: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rag_chatbot">RAG Chatbot DB</SelectItem>
                      <SelectItem value="lsemb">ASEMB DB</SelectItem>
                      <SelectItem value="custom">Özel Veritabanı</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Tablo</Label>
                  <Select 
                    value={sourceConfig.table}
                    onValueChange={(value) => setSourceConfig(prev => ({ ...prev, table: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm Tablolar</SelectItem>
                      <SelectItem value="SORUCEVAP">Soru-Cevap</SelectItem>
                      <SelectItem value="OZELGELER">Özelgeler</SelectItem>
                      <SelectItem value="MAKALELER">Makaleler</SelectItem>
                      <SelectItem value="DANISTAYKARARLARI">Danıştay Kararları</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Batch Boyutu</Label>
                  <Input
                    type="number"
                    value={migrationConfig.batchSize}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      batchSize: parseInt(e.target.value) 
                    }))}
                  />
                </div>
                <div>
                  <Label>Chunk Boyutu</Label>
                  <Input
                    type="number"
                    value={migrationConfig.chunkSize}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      chunkSize: parseInt(e.target.value) 
                    }))}
                  />
                </div>
                <div>
                  <Label>Overlap</Label>
                  <Input
                    type="number"
                    value={migrationConfig.overlapSize}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      overlapSize: parseInt(e.target.value) 
                    }))}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={migrationConfig.optimizeTokens}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      optimizeTokens: e.target.checked 
                    }))}
                    className="mr-2"
                  />
                  Token Optimizasyonu
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={migrationConfig.useCache}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      useCache: e.target.checked 
                    }))}
                    className="mr-2"
                  />
                  Cache Kullan
                </label>
              </div>

              <Button 
                onClick={() => {
                  setSourceType('database');
                  startMigration();
                }}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Migration Devam Ediyor...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Migration Başlat
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Table Stats */}
          {stats && stats.tables.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tablo Durumları</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.tables.map(table => (
                    <div key={table.name} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <span className="font-medium">{table.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {table.count} kayıt
                        </Badge>
                        <Badge variant={table.embedded === table.count ? "success" : "secondary"}>
                          {table.embedded} embedded
                        </Badge>
                        <Progress 
                          value={(table.embedded / Math.max(table.count, 1)) * 100} 
                          className="w-20 h-2"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Doküman Yükleme</CardTitle>
              <CardDescription>
                PDF, Word, Excel veya metin dosyalarını yükleyin ve embed edin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Dosya seçmek için tıklayın veya sürükleyin
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, DOCX, XLSX, TXT, CSV (Max 50MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.txt,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {sourceConfig.file && (
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      <div>
                        <p className="font-medium">{sourceConfig.file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(sourceConfig.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSourceConfig(prev => ({ ...prev, file: null }))}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <Button 
                onClick={() => {
                  setSourceType('file');
                  startMigration();
                }}
                disabled={isLoading || !sourceConfig.file}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Doküman İşleniyor...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Dokümanı Embed Et
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Web Scraping Tab */}
        <TabsContent value="webscrape" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Web Scraping</CardTitle>
              <CardDescription>
                Web sitelerinden içerik çekin ve embed edin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={sourceConfig.url}
                  onChange={(e) => setSourceConfig(prev => ({ ...prev, url: e.target.value }))}
                />
              </div>

              <div>
                <Label>CSS Selector (Opsiyonel)</Label>
                <Input
                  placeholder=".content, article, main"
                  value={sourceConfig.selector}
                  onChange={(e) => setSourceConfig(prev => ({ ...prev, selector: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  İçeriği filtrelemek için CSS selector kullanın
                </p>
              </div>

              <div>
                <Label>Maksimum Sayfa Sayısı</Label>
                <Input
                  type="number"
                  value={sourceConfig.maxPages}
                  onChange={(e) => setSourceConfig(prev => ({ 
                    ...prev, 
                    maxPages: parseInt(e.target.value) 
                  }))}
                />
              </div>

              <Button 
                onClick={() => {
                  setSourceType('url');
                  startMigration();
                }}
                disabled={isLoading || !sourceConfig.url}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Web İçeriği Çekiliyor...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Scraping Başlat
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embeddings Tab */}
        <TabsContent value="embeddings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Embedding Oluşturma</CardTitle>
              <CardDescription>
                Bekleyen kayıtlar için vektör embedding oluşturun
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats && stats.pendingRecords > 0 ? (
                <>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{stats.pendingRecords.toLocaleString()}</strong> kayıt embedding bekliyor.
                      Tahmini maliyet: <strong>${((stats.pendingRecords * 500) / 1000 * 0.0001).toFixed(2)}</strong>
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Token Optimizasyonu</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Gereksiz kelimeleri temizler, %30\'a kadar tasarruf sağlar
                      </p>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Cache Sistemi</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Aynı içerikler için API çağrısı yapmaz
                      </p>
                    </div>
                  </div>

                  <Button 
                    onClick={generateEmbeddings}
                    disabled={isLoading}
                    className="w-full"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Embedding Oluşturuluyor...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        {stats.pendingRecords} Kayıt için Embedding Oluştur
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    Tüm kayıtlar embed edilmiş durumda!
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Token Stats */}
          {stats?.tokenUsage && (
            <Card>
              <CardHeader>
                <CardTitle>Token İstatistikleri</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Toplam Token</p>
                    <p className="text-2xl font-bold">
                      {stats.tokenUsage.total_tokens.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Toplam Maliyet</p>
                    <p className="text-2xl font-bold">
                      ${stats.tokenUsage.estimated_cost.toFixed(2)}
                    </p>
                  </div>
                  {stats.tokenUsage.savedTokens && (
                    <div>
                      <p className="text-sm text-muted-foreground">Tasarruf (Token)</p>
                      <p className="text-2xl font-bold text-green-600">
                        {stats.tokenUsage.savedTokens.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {stats.tokenUsage.cacheHits && (
                    <div>
                      <p className="text-sm text-muted-foreground">Cache Hit</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {stats.tokenUsage.cacheHits}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}