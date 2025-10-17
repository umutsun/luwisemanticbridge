'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Brain, 
  Database,
  Play,
  Pause,
  StopCircle,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  DollarSign,
  Zap,
  RefreshCw,
  Info,
  TrendingUp,
  Activity,
  FileText,
  Hash
} from 'lucide-react';

interface TableInfo {
  name: string;
  displayName: string;
  database: string;
  totalRecords: number;
  embeddedRecords: number;
  textColumns: number;
}

interface MigrationProgress {
  status: string;
  current: number;
  total: number;
  percentage: number;
  currentTable: string | null;
  error: string | null;
  tokensUsed: number;
  estimatedCost: number;
  startTime: number | null;
  estimatedTimeRemaining: string | null;
}

interface MigrationHistory {
  migration_id: string;
  table_name: string;
  total_records: number;
  processed_records: number;
  successful_records: number;
  tokens_used: number;
  estimated_cost: number;
  status: string;
  model_used: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  progress_percentage: number;
}

export default function EmbeddingsPage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [migrationHistory, setMigrationHistory] = useState<MigrationHistory[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [totalStats, setTotalStats] = useState({
    totalRecords: 0,
    totalEmbedded: 0,
    totalPending: 0,
    totalTokens: 0,
    totalCost: 0,
    avgTokensPerRecord: 0
  });

  useEffect(() => {
    fetchTables();
    fetchMigrationHistory();
    fetchMigrationProgress();
    
    const interval = setInterval(() => {
      if (migrationProgress?.status === 'processing') {
        fetchMigrationProgress();
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [migrationProgress?.status]);

  useEffect(() => {
    // Calculate total stats
    const stats = tables.reduce((acc, table) => ({
      totalRecords: acc.totalRecords + table.totalRecords,
      totalEmbedded: acc.totalEmbedded + table.embeddedRecords,
      totalPending: acc.totalPending + (table.totalRecords - table.embeddedRecords)
    }), { totalRecords: 0, totalEmbedded: 0, totalPending: 0 });

    const historyStats = migrationHistory
      .filter(h => h.status === 'completed')
      .reduce((acc, h) => ({
        totalTokens: acc.totalTokens + (h.tokens_used || 0),
        totalCost: acc.totalCost + (h.estimated_cost || 0)
      }), { totalTokens: 0, totalCost: 0 });

    setTotalStats({
      ...stats,
      totalTokens: historyStats.totalTokens,
      totalCost: historyStats.totalCost,
      avgTokensPerRecord: stats.totalEmbedded > 0 
        ? Math.round(historyStats.totalTokens / stats.totalEmbedded)
        : 0
    });
  }, [tables, migrationHistory]);

  const fetchTables = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/embeddings/tables');
      const data = await response.json();
      setTables(data.tables || []);
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    }
  };

  const fetchMigrationProgress = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/embeddings/progress');
      const data = await response.json();
      setMigrationProgress(data.progress);
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
  };

  const fetchMigrationHistory = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/embeddings/history');
      const data = await response.json();
      setMigrationHistory(data.history || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const startMigration = async () => {
    if (selectedTables.length === 0) {
      alert('Lütfen en az bir tablo seçin');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/embeddings/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: selectedTables,
          batchSize
        })
      });

      if (response.ok) {
        fetchMigrationProgress();
        fetchMigrationHistory();
      }
    } catch (error) {
      console.error('Failed to start migration:', error);
    } finally {
      setLoading(false);
    }
  };

  const pauseMigration = async () => {
    try {
      await fetch('http://localhost:8083/api/v2/embeddings/pause', { method: 'POST' });
      fetchMigrationProgress();
    } catch (error) {
      console.error('Failed to pause migration:', error);
    }
  };

  const resumeMigration = async () => {
    try {
      await fetch('http://localhost:8083/api/v2/embeddings/resume', { method: 'POST' });
      fetchMigrationProgress();
    } catch (error) {
      console.error('Failed to resume migration:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}s ${minutes}d ${secs}sn`;
    if (minutes > 0) return `${minutes}d ${secs}sn`;
    return `${secs}sn`;
  };

  const formatCost = (cost: number) => {
    if (!cost) return '$0.00';
    return `$${cost.toFixed(4)}`;
  };

  const formatTokens = (tokens: number) => {
    if (!tokens) return '0';
    if (tokens > 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Embeddings Migration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Veritabanı tablolarından embedding oluşturun ve yönetin
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2">
            <Database className="h-4 w-4" />
            {tables.find(t => t.database)?.database || 'rag_chatbot'}
          </Badge>
          <Badge variant="outline" className="gap-2">
            <Brain className="h-4 w-4" />
            text-embedding-ada-002
          </Badge>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Kayıt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalRecords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Tüm tablolar</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Embed Edilmiş
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalStats.totalEmbedded.toLocaleString()}
            </div>
            <Progress 
              value={(totalStats.totalEmbedded / totalStats.totalRecords) * 100} 
              className="mt-1 h-1"
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bekleyen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {totalStats.totalPending.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((totalStats.totalPending / totalStats.totalRecords) * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Token Kullanımı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokens(totalStats.totalTokens)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ~{totalStats.avgTokensPerRecord} token/kayıt
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Maliyet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCost(totalStats.totalCost)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ada-002 model
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Durum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {migrationProgress?.status === 'processing' ? (
                <>
                  <Activity className="h-5 w-5 text-green-500 animate-pulse" />
                  <span className="font-semibold">Aktif</span>
                </>
              ) : migrationProgress?.status === 'paused' ? (
                <>
                  <Pause className="h-5 w-5 text-yellow-500" />
                  <span className="font-semibold">Duraklatıldı</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 text-gray-400" />
                  <span className="font-semibold">Hazır</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Migration Progress */}
      {migrationProgress && migrationProgress.status !== 'idle' && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Migration İlerlemesi
              </CardTitle>
              <div className="flex gap-2">
                {migrationProgress.status === 'processing' ? (
                  <Button onClick={pauseMigration} variant="outline" size="sm">
                    <Pause className="h-4 w-4 mr-2" />
                    Duraklat
                  </Button>
                ) : (
                  <Button onClick={resumeMigration} variant="outline" size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Devam Et
                  </Button>
                )}
                <Button variant="destructive" size="sm">
                  <StopCircle className="h-4 w-4 mr-2" />
                  İptal
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Tablo: {migrationProgress.currentTable}</span>
                <span>{migrationProgress.current} / {migrationProgress.total}</span>
              </div>
              <Progress value={migrationProgress.percentage} className="h-2" />
            </div>
            
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Token Kullanımı:</span>
                <p className="font-semibold">{formatTokens(migrationProgress.tokensUsed)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Tahmini Maliyet:</span>
                <p className="font-semibold">{formatCost(migrationProgress.estimatedCost)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Kalan Süre:</span>
                <p className="font-semibold">{migrationProgress.estimatedTimeRemaining || 'Hesaplanıyor...'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Hız:</span>
                <p className="font-semibold">
                  {migrationProgress.startTime 
                    ? `${Math.round(migrationProgress.current / ((Date.now() - migrationProgress.startTime) / 1000))} kayıt/sn`
                    : '-'}
                </p>
              </div>
            </div>
            
            {migrationProgress.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{migrationProgress.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>Veri Kaynakları ve Migration</CardTitle>
          <CardDescription>
            Embedding oluşturmak için tabloları seçin ve migration başlatın
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
              <TabsTrigger value="tables">Tablolar</TabsTrigger>
              <TabsTrigger value="history">Geçmiş</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {tables.map((table) => (
                  <Card key={table.name} className="cursor-pointer hover:border-blue-400 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{table.displayName}</CardTitle>
                        <Badge variant={table.embeddedRecords === table.totalRecords ? "success" : "secondary"}>
                          {table.embeddedRecords === table.totalRecords ? "Tamamlandı" : "Eksik"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Toplam Kayıt:</span>
                          <span className="font-medium">{table.totalRecords.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Embed Edilmiş:</span>
                          <span className="font-medium text-green-600">
                            {table.embeddedRecords.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Bekleyen:</span>
                          <span className="font-medium text-orange-600">
                            {(table.totalRecords - table.embeddedRecords).toLocaleString()}
                          </span>
                        </div>
                        <Progress 
                          value={(table.embeddedRecords / table.totalRecords) * 100} 
                          className="mt-2"
                        />
                        <p className="text-xs text-muted-foreground text-right">
                          {((table.embeddedRecords / table.totalRecords) * 100).toFixed(1)}% tamamlandı
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="tables">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="text-sm font-medium">Batch Boyutu</label>
                      <input
                        type="number"
                        value={batchSize}
                        onChange={(e) => setBatchSize(Number(e.target.value))}
                        className="ml-2 w-20 p-1 border rounded"
                        min="1"
                        max="100"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={startMigration} 
                    disabled={loading || selectedTables.length === 0 || migrationProgress?.status === 'processing'}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Başlatılıyor...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Migration Başlat
                      </>
                    )}
                  </Button>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTables(tables.map(t => t.name));
                            } else {
                              setSelectedTables([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Tablo</TableHead>
                      <TableHead>Veritabanı</TableHead>
                      <TableHead>Toplam</TableHead>
                      <TableHead>Embed</TableHead>
                      <TableHead>Bekleyen</TableHead>
                      <TableHead>İlerleme</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tables.map((table) => (
                      <TableRow key={table.name}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedTables.includes(table.name)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTables([...selectedTables, table.name]);
                              } else {
                                setSelectedTables(selectedTables.filter(t => t !== table.name));
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{table.displayName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{table.database}</Badge>
                        </TableCell>
                        <TableCell>{table.totalRecords.toLocaleString()}</TableCell>
                        <TableCell className="text-green-600">
                          {table.embeddedRecords.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-orange-600">
                          {(table.totalRecords - table.embeddedRecords).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={(table.embeddedRecords / table.totalRecords) * 100} 
                              className="w-20"
                            />
                            <span className="text-xs text-muted-foreground">
                              {((table.embeddedRecords / table.totalRecords) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="history">
              {migrationHistory.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">Henüz migration geçmişi yok</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tablo</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Kayıtlar</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead>Maliyet</TableHead>
                      <TableHead>Süre</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {migrationHistory.map((history) => (
                      <TableRow key={history.migration_id}>
                        <TableCell className="font-medium">{history.table_name}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              history.status === 'completed' ? 'success' : 
                              history.status === 'failed' ? 'destructive' : 
                              'secondary'
                            }
                          >
                            {history.status === 'completed' ? 'Tamamlandı' :
                             history.status === 'failed' ? 'Başarısız' :
                             history.status === 'processing' ? 'İşleniyor' : history.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {history.processed_records}/{history.total_records}
                          {history.progress_percentage && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({history.progress_percentage}%)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{formatTokens(history.tokens_used)}</TableCell>
                        <TableCell className="text-blue-600">
                          {formatCost(history.estimated_cost)}
                        </TableCell>
                        <TableCell>{formatDuration(history.duration_seconds)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {history.model_used || 'ada-002'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(history.started_at).toLocaleString('tr-TR')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Migration Bilgileri:</strong> Embedding oluşturma işlemi OpenAI text-embedding-ada-002 modeli kullanır. 
          Her 1000 token için yaklaşık $0.0001 maliyet oluşur. Ortalama bir kayıt 2000-3000 token kullanır.
          Tüm embeddings lsemb veritabanındaki unified_embeddings tablosuna kaydedilir.
        </AlertDescription>
      </Alert>
    </div>
  );
}