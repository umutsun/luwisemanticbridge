'use client';

import { useState, useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
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
  Clock,
  HeartPulse,
  Wrench,
  AlertTriangle,
  Copy,
  Ghost,
  Scissors
} from 'lucide-react';
import { ProgressCircle } from '@/components/ui/progress-circle';
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

interface DataHealthReport {
  generated_at: string;
  summary: {
    total_embeddings: number;
    orphan_count: number;
    missing_metadata_count: number;
    duplicate_count: number;
    stale_count: number;
    healthy_count: number;
    health_score: number;
  };
  tables: Record<string, {
    total_embeddings: number;
    orphan_count: number;
    missing_metadata_count: number;
    duplicate_count: number;
    stale_count: number;
    healthy_count: number;
    health_score: number;
  }>;
  recommendations: string[];
}

interface FixResult {
  table: string;
  dry_run: boolean;
  orphans?: { orphans_found: number; deleted_count: number };
  duplicates?: { duplicates_found: number; deleted_count: number };
  metadata?: { total_records: number; fixed_count: number; skipped_count: number; error_count: number };
}

export default function MigrationToolsPage() {

  const [activeTab, setActiveTab] = useState('database');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data Health State
  const [healthReport, setHealthReport] = useState<DataHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [fixLoading, setFixLoading] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [selectedHealthTable, setSelectedHealthTable] = useState<string>('all');
  const [dryRun, setDryRun] = useState(true);

  // Document Optimization State
  const [docOptStatus, setDocOptStatus] = useState<{
    is_running: boolean;
    is_paused: boolean;
    current_job: string | null;
    phase: string;
    progress: number;
    total: number;
    processed: number;
    chunk_fixes: number;
    meta_fixes: number;
    llm_fixes: number;
    errors: number;
    elapsed_seconds: number;
    message: string;
    samples: Array<{
      id: number;
      document_id: number;
      before: string;
      after: string;
      fix_types: string[];
      meta_changes: string[];
      changed: boolean;
    }>;
    analysis: {
      total_records: number;
      affected_records: number;
      clean_records: number;
      issues: {
        spaced_letters: number;
        word_breaks: number;
        concatenated: number;
        html: number;
        metadata: number;
      };
      samples: any[];
    } | null;
  } | null>(null);
  const [docOptPolling, setDocOptPolling] = useState(false);

  // Law Chunking State
  const [chunkingLoading, setChunkingLoading] = useState(false);
  const [chunkingStatus, setChunkingStatus] = useState<{
    running: boolean;
    progress: number;
    total: number;
    processed: number;
    chunks_created: number;
    last_law?: string;
    errors: string[];
  } | null>(null);
  
  // Source selection
  const [sourceType, setSourceType] = useState<'database' | 'file' | 'url'>('database');
  const [sourceConfig, setSourceConfig] = useState({
    // Database source
    database: 'lsemb', // Default to LSEMB database
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
      const response = await fetch(`${API_URL}/api/v2/migration/stats`);
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
          endpoint = `${API_URL}/api/v2/migration/start`;
          body = {
            sourceTable: sourceConfig.table,
            ...migrationConfig
          };
          break;
          
        case 'file':
          if (!sourceConfig.file) {
            throw new Error('Lütfen bir dosya seçin');
          }
          endpoint = `${API_URL}/api/v2/migration/file`;
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
          endpoint = `${API_URL}/api/v2/migration/scrape`;
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
        const progressResponse = await fetch(`${API_URL}/api/v2/migration/progress`);
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
      const response = await fetch(`${API_URL}/api/v2/migration/generate`, {
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

  // ==================== LAW CHUNKING FUNCTIONS ====================

  const startLawChunking = async (dryRun: boolean = false) => {
    setChunkingLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/v2/source/chunk-laws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTable: 'vergilex_mevzuat_kanunlar',
          dryRun: dryRun,
          limit: null
        })
      });

      if (!response.ok) throw new Error('Chunking başlatılamadı');

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: dryRun ? 'Simülasyon başlatıldı...' : 'Kanun chunking başlatıldı...' });
        // Start polling for status
        pollChunkingStatus();
      } else {
        throw new Error(data.error || 'Chunking başarısız');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Chunking başlatılamadı' });
      setChunkingLoading(false);
    }
  };

  const pollChunkingStatus = async () => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v2/source/chunk-laws/status`);
        if (response.ok) {
          const data = await response.json();
          setChunkingStatus(data);

          if (data.running) {
            setTimeout(poll, 2000);
          } else {
            setChunkingLoading(false);
            if (data.chunks_created > 0) {
              setMessage({ type: 'success', text: `Chunking tamamlandı! ${data.chunks_created} madde oluşturuldu.` });
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        setChunkingLoading(false);
      }
    };
    poll();
  };

  const stopChunking = async () => {
    try {
      const response = await fetch(`${API_URL}/api/v2/source/chunk-laws/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      if (response.ok) {
        setMessage({ type: 'info', text: 'Chunking durduruluyor...' });
      }
    } catch (error) {
      console.error('Stop error:', error);
    }
  };

  // ==================== DATA HEALTH FUNCTIONS ====================

  const loadHealthReport = async () => {
    setHealthLoading(true);
    try {
      const response = await fetch('/api/python/data-health?endpoint=report');
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setHealthReport(data);
      } else {
        throw new Error('Failed to load health report');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Sağlık raporu yüklenemedi: ${error.message}` });
    } finally {
      setHealthLoading(false);
    }
  };

  const runQuickFix = async (tableName: string) => {
    setFixLoading(tableName);
    setFixResult(null);
    try {
      const response = await fetch(`/api/python/data-health?action=quick-fix&table=${tableName}&dry_run=${dryRun}`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setFixResult(data);
        setMessage({
          type: 'success',
          text: dryRun
            ? `${tableName} için simülasyon tamamlandı (değişiklik yapılmadı)`
            : `${tableName} için temizlik tamamlandı!`
        });
        // Reload health report after fix
        if (!dryRun) {
          await loadHealthReport();
        }
      } else {
        throw new Error('Quick fix failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Düzeltme başarısız: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  const runMetadataFix = async (tableName: string) => {
    setFixLoading(`metadata-${tableName}`);
    try {
      const response = await fetch('/api/python/data-health?action=fix-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          dry_run: dryRun,
          batch_size: 100,
          limit: 5000
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setMessage({
          type: 'success',
          text: dryRun
            ? `${data.fixed_count} kayıt düzeltilecek (simülasyon)`
            : `${data.fixed_count} kayıt düzeltildi!`
        });
        if (!dryRun) await loadHealthReport();
      } else {
        throw new Error('Metadata fix failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Metadata düzeltme başarısız: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  const runOrphanDelete = async (tableName: string) => {
    setFixLoading(`orphan-${tableName}`);
    try {
      const response = await fetch('/api/python/data-health?action=delete-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          dry_run: dryRun,
          limit: 5000
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setMessage({
          type: 'success',
          text: dryRun
            ? `${data.orphans_found} orphan kayıt bulundu (simülasyon)`
            : `${data.deleted_count} orphan kayıt silindi!`
        });
        if (!dryRun) await loadHealthReport();
      } else {
        throw new Error('Orphan delete failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Orphan silme başarısız: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  const runDuplicateDelete = async (tableName: string) => {
    setFixLoading(`duplicate-${tableName}`);
    try {
      const response = await fetch('/api/python/data-health?action=delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          dry_run: dryRun,
          keep: 'newest'
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setMessage({
          type: 'success',
          text: dryRun
            ? `${data.duplicates_found} duplicate kayıt bulundu (simülasyon)`
            : `${data.deleted_count} duplicate kayıt silindi!`
        });
        if (!dryRun) await loadHealthReport();
      } else {
        throw new Error('Duplicate delete failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Duplicate silme başarısız: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  // Load health report when switching to health tab
  useEffect(() => {
    if (activeTab === 'health' && !healthReport) {
      loadHealthReport();
    }
  }, [activeTab]);

  // Document Optimization functions
  const docOptFetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/doc-optimization/status`);
      if (res.ok) {
        const data = await res.json();
        setDocOptStatus(data);
        return data;
      }
    } catch (e) {
      // Service might not be running
    }
    return null;
  };

  const docOptStartAnalyze = async () => {
    try {
      const res = await fetch(`${API_URL}/api/doc-optimization/analyze/start`, { method: 'POST' });
      if (res.ok) {
        setDocOptPolling(true);
        setMessage({ type: 'info', text: 'Doküman analizi başlatıldı...' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Analiz başlatılamadı' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Bağlantı hatası: ${e.message}` });
    }
  };

  const docOptStartOptimize = async (useLlm: boolean = false) => {
    try {
      const res = await fetch(`${API_URL}/api/doc-optimization/optimize/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_llm: useLlm, batch_size: 100 })
      });
      if (res.ok) {
        setDocOptPolling(true);
        setMessage({ type: 'info', text: `OCR düzeltme başlatıldı${useLlm ? ' (LLM destekli)' : ''}...` });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Optimizasyon başlatılamadı' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Bağlantı hatası: ${e.message}` });
    }
  };

  const docOptControl = async (action: 'pause' | 'resume' | 'stop') => {
    try {
      await fetch(`${API_URL}/api/doc-optimization/${action}`, { method: 'POST' });
      if (action === 'stop') setDocOptPolling(false);
    } catch (e) {}
  };

  // Poll document optimization status
  useEffect(() => {
    if (!docOptPolling) return;
    const interval = setInterval(async () => {
      const status = await docOptFetchStatus();
      if (status && !status.is_running && status.phase !== 'idle') {
        setDocOptPolling(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [docOptPolling]);

  // Load status when switching to doc-opt tab
  useEffect(() => {
    if (activeTab === 'doc-optimization') {
      docOptFetchStatus();
    }
  }, [activeTab]);

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
            <div className="grid grid-cols-[180px_1fr] gap-6">
              {/* Progress Circle */}
              <div className="flex flex-col items-center justify-center">
                <ProgressCircle
                  progress={progress.percentage || 0}
                  showPulse={true}
                  size={150}
                />
                <div className="text-center mt-2">
                  <div className="text-sm font-medium flex items-center gap-1 justify-center">
                    <Activity className="h-3 w-3" />
                    {progress.status}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {progress.current} / {progress.total}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground content-center">
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
            </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Tahmini süre: {Math.ceil((progress.total - progress.current) / 10)} saniye</span>
              </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
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
          <TabsTrigger value="health">
            <HeartPulse className="h-4 w-4 mr-2" />
            Veri Sağlığı
          </TabsTrigger>
          <TabsTrigger value="doc-optimization">
            <Scissors className="h-4 w-4 mr-2" />
            OCR Düzeltme
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
                      <SelectItem value="lsemb">LSEMB DB</SelectItem>
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

          {/* Law Chunking Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scissors className="h-5 w-5" />
                Kanun Madde Chunking
              </CardTitle>
              <CardDescription>
                Kanun metinlerini maddelere ayırarak semantic search kalitesini artırın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Kanun metinleri "Madde 1", "Madde 2", vb. şeklinde bölünerek her madde ayrı bir kayıt olarak embed edilir.
                  Bu sayede "VUK 114" gibi sorgulamalar daha doğru sonuç verir.
                </AlertDescription>
              </Alert>

              {/* Chunking Progress */}
              {chunkingStatus?.running && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">İşleniyor...</span>
                    <span className="text-sm text-muted-foreground">
                      %{chunkingStatus.progress.toFixed(1)}
                    </span>
                  </div>
                  <Progress value={chunkingStatus.progress} className="mb-2" />
                  <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                    <div>İşlenen: {chunkingStatus.processed}/{chunkingStatus.total}</div>
                    <div>Oluşturulan: {chunkingStatus.chunks_created}</div>
                    <div className="truncate">Son: {chunkingStatus.last_law}</div>
                  </div>
                </div>
              )}

              {/* Chunking Result */}
              {chunkingStatus && !chunkingStatus.running && chunkingStatus.chunks_created > 0 && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Chunking tamamlandı! {chunkingStatus.chunks_created} madde oluşturuldu.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => startLawChunking(false)}
                  disabled={chunkingLoading}
                  className="flex-1"
                >
                  {chunkingLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Chunking Devam Ediyor...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      Kanunları Maddelere Böl
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => startLawChunking(true)}
                  disabled={chunkingLoading}
                >
                  Simülasyon
                </Button>
                {chunkingStatus?.running && (
                  <Button
                    variant="destructive"
                    onClick={stopChunking}
                  >
                    Durdur
                  </Button>
                )}
              </div>
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

        {/* Data Health Tab */}
        <TabsContent value="health" className="space-y-4">
          {/* Health Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <HeartPulse className="h-5 w-5" />
                    Veri Sağlığı Raporu
                  </CardTitle>
                  <CardDescription>
                    Embedding verilerinin sağlık durumu ve temizlik araçları
                  </CardDescription>
                </div>
                <Button
                  onClick={loadHealthReport}
                  disabled={healthLoading}
                  variant="outline"
                  size="sm"
                >
                  {healthLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {healthLoading && !healthReport ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : healthReport ? (
                <div className="space-y-6">
                  {/* Health Score */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <ProgressCircle
                        progress={healthReport.summary.health_score}
                        size={100}
                        showPulse={healthReport.summary.health_score < 80}
                      />
                    </div>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Toplam</p>
                        <p className="text-lg font-bold">{healthReport.summary.total_embeddings.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-600">Sağlıklı</p>
                        <p className="text-lg font-bold text-green-700">{healthReport.summary.healthy_count.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <p className="text-xs text-orange-600 flex items-center justify-center gap-1">
                          <Ghost className="h-3 w-3" /> Orphan
                        </p>
                        <p className="text-lg font-bold text-orange-700">{healthReport.summary.orphan_count.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-yellow-50 rounded-lg">
                        <p className="text-xs text-yellow-600 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Eksik Meta
                        </p>
                        <p className="text-lg font-bold text-yellow-700">{healthReport.summary.missing_metadata_count.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-xs text-purple-600 flex items-center justify-center gap-1">
                          <Copy className="h-3 w-3" /> Duplicate
                        </p>
                        <p className="text-lg font-bold text-purple-700">{healthReport.summary.duplicate_count.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {healthReport.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Öneriler</h4>
                      <div className="space-y-1">
                        {healthReport.recommendations.map((rec, idx) => (
                          <p key={idx} className="text-sm text-muted-foreground">
                            {rec}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Sağlık raporu yüklemek için yukarıdaki butona tıklayın.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Quick Fix Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Hızlı Düzeltme
              </CardTitle>
              <CardDescription>
                Tablo bazlı veri temizleme ve düzeltme işlemleri
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dry Run Toggle */}
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Simülasyon Modu</p>
                    <p className="text-xs text-amber-600">
                      Açık: Değişiklik yapmaz, sadece raporlar | Kapalı: Gerçek silme/düzeltme yapar
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="w-5 h-5"
                  />
                  <span className="text-sm font-medium text-amber-800">
                    {dryRun ? 'Simülasyon' : 'GERÇEK İŞLEM'}
                  </span>
                </label>
              </div>

              {/* Table Selection */}
              {healthReport && Object.keys(healthReport.tables).length > 0 && (
                <div className="space-y-3">
                  <Label>Tablo Seçin</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(healthReport.tables).map(([tableName, tableStats]) => (
                      <div
                        key={tableName}
                        className={`p-4 border rounded-lg cursor-pointer transition-all ${
                          selectedHealthTable === tableName
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-gray-400'
                        }`}
                        onClick={() => setSelectedHealthTable(tableName)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{tableName}</span>
                          <Badge
                            variant={tableStats.health_score >= 80 ? 'default' : tableStats.health_score >= 50 ? 'secondary' : 'destructive'}
                          >
                            {tableStats.health_score.toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-xs text-muted-foreground">
                          <div title="Toplam">{tableStats.total_embeddings}</div>
                          <div className="text-orange-600" title="Orphan">{tableStats.orphan_count}</div>
                          <div className="text-yellow-600" title="Eksik Meta">{tableStats.missing_metadata_count}</div>
                          <div className="text-purple-600" title="Duplicate">{tableStats.duplicate_count}</div>
                        </div>
                        <Progress
                          value={tableStats.health_score}
                          className="mt-2 h-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selectedHealthTable && selectedHealthTable !== 'all' && (
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-sm font-medium">
                    İşlemler: <span className="text-primary">{selectedHealthTable}</span>
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Button
                      onClick={() => runQuickFix(selectedHealthTable)}
                      disabled={!!fixLoading}
                      className="flex items-center gap-2"
                    >
                      {fixLoading === selectedHealthTable ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                      Hızlı Düzelt
                    </Button>

                    <Button
                      onClick={() => runMetadataFix(selectedHealthTable)}
                      disabled={!!fixLoading}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      {fixLoading === `metadata-${selectedHealthTable}` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Metadata Düzelt
                    </Button>

                    <Button
                      onClick={() => runOrphanDelete(selectedHealthTable)}
                      disabled={!!fixLoading}
                      variant="outline"
                      className="flex items-center gap-2 text-orange-600 hover:text-orange-700"
                    >
                      {fixLoading === `orphan-${selectedHealthTable}` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ghost className="h-4 w-4" />
                      )}
                      Orphan Sil
                    </Button>

                    <Button
                      onClick={() => runDuplicateDelete(selectedHealthTable)}
                      disabled={!!fixLoading}
                      variant="outline"
                      className="flex items-center gap-2 text-purple-600 hover:text-purple-700"
                    >
                      {fixLoading === `duplicate-${selectedHealthTable}` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      Duplicate Sil
                    </Button>
                  </div>
                </div>
              )}

              {/* Fix Result */}
              {fixResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">
                    İşlem Sonucu {fixResult.dry_run && <Badge variant="secondary">Simülasyon</Badge>}
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {fixResult.orphans && (
                      <div>
                        <p className="text-muted-foreground">Orphan</p>
                        <p className="font-medium">
                          {fixResult.orphans.orphans_found} bulundu
                          {!fixResult.dry_run && ` → ${fixResult.orphans.deleted_count} silindi`}
                        </p>
                      </div>
                    )}
                    {fixResult.duplicates && (
                      <div>
                        <p className="text-muted-foreground">Duplicate</p>
                        <p className="font-medium">
                          {fixResult.duplicates.duplicates_found} bulundu
                          {!fixResult.dry_run && ` → ${fixResult.duplicates.deleted_count} silindi`}
                        </p>
                      </div>
                    )}
                    {fixResult.metadata && (
                      <div>
                        <p className="text-muted-foreground">Metadata</p>
                        <p className="font-medium">
                          {fixResult.metadata.fixed_count} / {fixResult.metadata.total_records}
                          {!fixResult.dry_run && ' düzeltildi'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Document Optimization Tab */}
        <TabsContent value="doc-optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Scissors className="h-5 w-5" />
                    Doküman OCR Düzeltme
                  </CardTitle>
                  <CardDescription>
                    document_embeddings tablosundaki OCR sorunlarını analiz et ve düzelt
                  </CardDescription>
                </div>
                {!docOptStatus?.is_running && (
                  <div className="flex gap-2">
                    <Button onClick={docOptStartAnalyze} variant="outline" size="sm">
                      <Activity className="h-4 w-4 mr-1" />
                      Analiz Et
                    </Button>
                    <Button onClick={() => docOptStartOptimize(false)} size="sm">
                      <Wrench className="h-4 w-4 mr-1" />
                      Düzelt (Regex)
                    </Button>
                    <Button onClick={() => docOptStartOptimize(true)} size="sm" variant="secondary">
                      <Brain className="h-4 w-4 mr-1" />
                      Düzelt (LLM)
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Running: ProgressCircle + stats */}
              {docOptStatus?.is_running && (
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <ProgressCircle
                      progress={docOptStatus.progress || 0}
                      showPulse={!docOptStatus.is_paused}
                      size={120}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      {docOptStatus.processed.toLocaleString()} / {docOptStatus.total.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{docOptStatus.message}</span>
                      <div className="flex gap-2">
                        {docOptStatus.is_paused ? (
                          <Button size="sm" variant="outline" onClick={() => docOptControl('resume')}>Devam Et</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => docOptControl('pause')}>Duraklat</Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => docOptControl('stop')}>Durdur</Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-xs text-center">
                      <div className="p-2 bg-green-50 rounded">
                        <p className="text-green-600">Chunk Fix</p>
                        <p className="font-bold text-green-700">{docOptStatus.chunk_fixes.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-purple-50 rounded">
                        <p className="text-purple-600">Meta Fix</p>
                        <p className="font-bold text-purple-700">{docOptStatus.meta_fixes.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-orange-50 rounded">
                        <p className="text-orange-600">LLM Fix</p>
                        <p className="font-bold text-orange-700">{docOptStatus.llm_fixes.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-gray-50 rounded">
                        <p className="text-muted-foreground">Süre</p>
                        <p className="font-bold">{Math.round(docOptStatus.elapsed_seconds)}s</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed / Error alerts */}
              {docOptStatus?.phase === 'completed' && !docOptStatus.is_running && (
                <Alert className="mb-4">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>{docOptStatus.message}</AlertDescription>
                </Alert>
              )}
              {docOptStatus?.phase === 'error' && !docOptStatus.is_running && (
                <Alert className="mb-4" variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{docOptStatus.message}</AlertDescription>
                </Alert>
              )}

              {/* Analysis Results: ProgressCircle (clean %) + compact stats */}
              {docOptStatus?.analysis && !docOptStatus.is_running && (
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <ProgressCircle
                      progress={docOptStatus.analysis.total_records > 0
                        ? Math.round((docOptStatus.analysis.clean_records / docOptStatus.analysis.total_records) * 100)
                        : 0}
                      size={100}
                      showPulse={docOptStatus.analysis.affected_records > 0}
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-2 bg-gray-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Toplam</p>
                        <p className="text-lg font-bold">{docOptStatus.analysis.total_records.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-600">Sorunlu</p>
                        <p className="text-lg font-bold text-red-700">{docOptStatus.analysis.affected_records.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-600">Temiz</p>
                        <p className="text-lg font-bold text-green-700">{docOptStatus.analysis.clean_records.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {docOptStatus.analysis.issues.spaced_letters > 0 && (
                        <Badge variant="outline">Boşluklu Harf: {docOptStatus.analysis.issues.spaced_letters}</Badge>
                      )}
                      {docOptStatus.analysis.issues.word_breaks > 0 && (
                        <Badge variant="outline">Kelime Kırılma: {docOptStatus.analysis.issues.word_breaks}</Badge>
                      )}
                      {docOptStatus.analysis.issues.concatenated > 0 && (
                        <Badge variant="outline">Birleşik Metin: {docOptStatus.analysis.issues.concatenated}</Badge>
                      )}
                      {docOptStatus.analysis.issues.html > 0 && (
                        <Badge variant="outline">HTML: {docOptStatus.analysis.issues.html}</Badge>
                      )}
                      {docOptStatus.analysis.issues.metadata > 0 && (
                        <Badge variant="outline">Metadata: {docOptStatus.analysis.issues.metadata}</Badge>
                      )}
                    </div>
                    {/* Compact samples */}
                    {docOptStatus.analysis.samples.filter(s => s.changed).length > 0 && (
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {docOptStatus.analysis.samples.filter(s => s.changed).slice(0, 3).map((sample) => (
                          <div key={sample.id} className="p-2 bg-gray-50 rounded text-xs">
                            <p className="text-red-600 line-through truncate">{sample.before}</p>
                            <p className="text-green-700 truncate">{sample.after}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!docOptStatus?.is_running && !docOptStatus?.analysis && docOptStatus?.phase !== 'completed' && docOptStatus?.phase !== 'error' && (
                <div className="text-center py-6 text-muted-foreground">
                  <Scissors className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">OCR sorunlarını tespit etmek için &quot;Analiz Et&quot; butonuna tıklayın.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}