'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TaoProgressBar } from '@/components/ui/tao-progress-bar';
import { EmbeddingsManagerSkeleton, ListSkeleton, TableSkeleton, ChartSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { AdvancedControlPanel } from '@/components/controls/AdvancedControlPanel';
import { AdvancedTableViewer } from '@/components/tables/AdvancedTableViewer';
import { RealTimeChart } from '@/components/charts/RealTimeChart';
import { TokenChart } from '@/components/charts/TokenChart';
import {
  Database,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  Loader2,
  Settings,
  X,
  Activity,
  Zap,
  TrendingUp,
  Clock,
  BarChart3,
  Filter,
  Download,
  Eye
} from 'lucide-react';

interface TableInfo {
  name: string;
  displayName: string;
  totalRecords: number;
  embeddedRecords: number;
  lastUpdated?: string;
  avgTokens?: number;
  size?: number;
}

interface TableDataPreview {
  records: any[];
  count: number;
  columns: string[];
  tableName: string;
}

interface EmbeddingProgress {
  status: 'idle' | 'processing' | 'paused' | 'completed' | 'error';
  current: number;
  total: number;
  percentage: number;
  currentTable: string | null;
  error: string | null;
  tokensUsed?: number;
  tokensThisSession?: number;
  startTime?: number;
  estimatedTimeRemaining?: number;
  processingSpeed?: number;
  memoryUsage?: number;
  queueStatus?: string;
}

interface ControlSettings {
  batchSize: number;
  workerCount: number;
  provider: 'openai' | 'google' | 'local';
  similarityThreshold: number;
  maxTokens: number;
  autoRetry: boolean;
  concurrentTables: number;
}

interface AnalyticsData {
  totalProcessingTime: number;
  averageSpeed: number;
  successRate: number;
  errorCount: number;
  tokenEfficiency: number;
}

interface ChartDataPoint {
  timestamp: number;
  value: number;
}

export default function EmbeddingsManagerPage() {
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isStartingMigration, setIsStartingMigration] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [activeTab, setActiveTab] = useState('control');
  const [selectedTableForPreview, setSelectedTableForPreview] = useState<string | null>(null);
  const [tablePreviews, setTablePreviews] = useState<Record<string, TableDataPreview>>({});
  const [isLoadingPreview, setIsLoadingPreview] = useState<Record<string, boolean>>({});
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [performanceData, setPerformanceData] = useState<ChartDataPoint[]>([]);
  const [tokenData, setTokenData] = useState<ChartDataPoint[]>([]);
  const [memoryData, setMemoryData] = useState<ChartDataPoint[]>([]);
  const { toast } = useToast();
  const { api, endpoints, intervals } = useApi();

  // Settings state
  const [settings, setSettings] = useState<ControlSettings>({
    batchSize: 100,
    workerCount: 2,
    provider: 'openai',
    similarityThreshold: 0.7,
    maxTokens: 8000,
    autoRetry: true,
    concurrentTables: 1
  });

  const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/v2/embeddings-tables`;
  const API_MIGRATION = `${process.env.NEXT_PUBLIC_API_URL}/api/v2/embeddings`;
  const performanceIntervalRef = useRef<NodeJS.Timeout>();

  // Fetch available tables
  const fetchAvailableTables = useCallback(async () => {
    setIsLoadingTables(true);
    try {
      const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/v2/embeddings-tables/all?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTables(data.tables || []);
      } else {
        setError('Failed to fetch tables.');
      }
    } catch (error) {
      setError('Could not connect to the server to fetch tables.');
    } finally {
      setIsLoadingTables(false);
    }
  }, []);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_MIGRATION}/analytics`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchAvailableTables();
    fetchAnalytics();
    checkActiveMigration();
    startPerformanceMonitoring();
    return () => stopPerformanceMonitoring();
  }, [fetchAvailableTables, fetchAnalytics]);

  // Performance monitoring
  const startPerformanceMonitoring = () => {
    performanceIntervalRef.current = setInterval(() => {
      const now = Date.now();

      if (progress?.status === 'processing') {
        // Update performance data
        setPerformanceData(prev => {
          const newData = [...prev, {
            timestamp: now,
            value: progress.processingSpeed || 0
          }];
          return newData.slice(-100); // Keep last 100 points
        });

        // Update token data
        if (progress.tokensUsed) {
          setTokenData(prev => {
            const newData = [...prev, {
              timestamp: now,
              value: progress.tokensUsed || 0
            }];
            return newData.slice(-100);
          });
        }

        // Update memory data
        if (progress.memoryUsage) {
          setMemoryData(prev => {
            const newData = [...prev, {
              timestamp: now,
              value: progress.memoryUsage || 0
            }];
            return newData.slice(-100);
          });
        }
      }
    }, intervals.PERFORMANCE);
  };

  const stopPerformanceMonitoring = () => {
    if (performanceIntervalRef.current) {
      clearInterval(performanceIntervalRef.current);
    }
  };

  // Check for active migration
  const checkActiveMigration = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_MIGRATION}/progress`);
      if (response.ok) {
        const data = await response.json();
        if (data.status && data.status !== 'idle') {
          setProgress(data);
          if (data.tables) {
            setSelectedTables(data.tables);
          }
        }
      }
    } catch (error) {
      console.error('Error checking active migration:', error);
    }
  }, []);

  // Progress polling
  useEffect(() => {
    if (progress?.status === 'processing' || progress?.status === 'paused') {
      const interval = setInterval(async () => {
        try {
          const response = await fetchWithAuth(`${API_MIGRATION}/progress`);
          if (response.ok) {
            const data = await response.json();
            setProgress(data);

            if (data.status === 'completed') {
              toast({
                title: "Completed",
                description: `Migration completed! ${data.current || 0} records processed.`,
              });
              fetchAvailableTables();
              fetchAnalytics();
              setProgress(null);
              setSelectedTables([]);
            } else if (data.status === 'error') {
              toast({
                title: "Error",
                description: data.error || 'Migration failed',
                variant: "destructive",
              });
            }
          }
        } catch (error) {
          console.error('Error polling progress:', error);
        }
      }, intervals.PERFORMANCE);

      return () => clearInterval(interval);
    }
  }, [progress?.status, toast, fetchAvailableTables, fetchAnalytics]);

  const startMigration = async () => {
    if (selectedTables.length === 0) {
      setError('Please select at least one table.');
      toast({
        title: "Error",
        description: "Please select at least one table.",
        variant: "destructive",
      });
      return;
    }

    setError('');
    setSuccess('');
    setIsStartingMigration(true);

    try {
      const response = await fetchWithAuth(`${API_MIGRATION}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: selectedTables,
          ...settings
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to start migration.');
      } else {
        const data = await response.json();
        if (data.progress) {
          setProgress(data.progress);
        }
        toast({
          title: "Started",
          description: "Migration process started successfully.",
        });
      }
    } catch (error) {
      setError('An error occurred while starting the migration.');
    } finally {
      setIsStartingMigration(false);
    }
  };

  const stopMigration = async () => {
    try {
      const response = await fetchWithAuth(`${API_MIGRATION}/stop`, { method: 'POST' });
      if (response.ok) {
        setProgress(null);
        setSelectedTables([]);
        toast({
          title: "Stopped",
          description: "Migration stopped successfully.",
        });
      }
    } catch (error) {
      setError('Failed to stop migration.');
    }
  };

  // Fetch table preview data
  const fetchTablePreview = useCallback(async (tableName: string) => {
    if (tablePreviews[tableName] || isLoadingPreview[tableName]) {
      return;
    }

    setIsLoadingPreview(prev => ({ ...prev, [tableName]: true }));

    try {
      const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/v2/embeddings-tables/${tableName}/preview?limit=100`);
      if (response.ok) {
        const data = await response.json();
        setTablePreviews(prev => ({
          ...prev,
          [tableName]: {
            records: data.records || [],
            count: data.count || 0,
            columns: data.columns || [],
            tableName: tableName
          }
        }));
      } else {
        toast({
          title: "Error",
          description: `Failed to fetch preview for ${tableName}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Could not fetch preview for ${tableName}`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingPreview(prev => ({ ...prev, [tableName]: false }));
    }
  }, [tablePreviews, isLoadingPreview, toast]);

  // Calculate statistics
  const totalRecords = useMemo(() =>
    availableTables.reduce((acc, t) => acc + t.totalRecords, 0),
    [availableTables]
  );

  const totalEmbedded = useMemo(() =>
    availableTables.reduce((acc, t) => acc + t.embeddedRecords, 0),
    [availableTables]
  );

  const overallProgress = totalRecords > 0 ? (totalEmbedded / totalRecords) * 100 : 0;

  // Format ETA
  const formatETA = (seconds?: number) => {
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-600" />
              Embeddings Manager
            </h1>
            <p className="text-muted-foreground mt-2">
              Advanced control and analytics for your embedding operations
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant={progress?.status === 'processing' ? 'default' : 'secondary'}>
              <Activity className="w-3 h-3 mr-1" />
              {progress?.status || 'Idle'}
            </Badge>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Sol Kolon - Kontrol ve Sürek Merkezi */}
          <div className="lg:col-span-2 space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Total Records
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalRecords.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Embedded
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{totalEmbedded.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overallProgress.toFixed(1)}%</div>
                  <TaoProgressBar
                    value={overallProgress}
                    variant="zen"
                    size="sm"
                    className="mt-2"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Advanced Control Panel */}
            <AdvancedControlPanel
              settings={settings}
              onSettingsChange={setSettings}
              isProcessing={progress?.status === 'processing'}
              isPaused={progress?.status === 'paused'}
              onStart={startMigration}
              onPause={() => fetchWithAuth(`${API_MIGRATION}/pause`, { method: 'POST' })}
              onStop={stopMigration}
              onSavePreset={() => {
                // Save preset logic
                toast({
                  title: "Preset Saved",
                  description: "Settings preset saved successfully.",
                });
              }}
              onLoadPreset={() => {
                // Load preset logic
                toast({
                  title: "Preset Loaded",
                  description: "Settings preset loaded successfully.",
                });
              }}
              onExportProgress={() => {
                // Export progress logic
                const data = {
                  progress,
                  settings,
                  analytics,
                  timestamp: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `embeddings-progress-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              processingSpeed={progress?.processingSpeed}
              eta={formatETA(progress?.estimatedTimeRemaining)}
            />

            {/* Real-time Charts */}
            <Tabs defaultValue="performance" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="tokens">Tokens</TabsTrigger>
                <TabsTrigger value="memory">Memory</TabsTrigger>
              </TabsList>

              <TabsContent value="performance">
                <RealTimeChart
                  data={performanceData}
                  title="Processing Speed (records/min)"
                  color="#3b82f6"
                  height={200}
                  yAxisLabel="Records/min"
                />
              </TabsContent>

              <TabsContent value="tokens">
                <RealTimeChart
                  data={tokenData}
                  title="Token Usage Over Time"
                  color="#10b981"
                  height={200}
                  yAxisLabel="Tokens"
                />
              </TabsContent>

              <TabsContent value="memory">
                <RealTimeChart
                  data={memoryData}
                  title="Memory Usage"
                  color="#f59e0b"
                  height={200}
                  yAxisLabel="MB"
                />
              </TabsContent>
            </Tabs>

            {/* Token Usage Chart */}
            {progress?.tokensUsed && (
              <TokenChart
                data={{
                  used: progress.tokensUsed,
                  remaining: Math.max(0, 1000000 - progress.tokensUsed), // Example limit
                  limit: 1000000
                }}
              />
            )}
          </div>

          {/* Sağ Kolon - Veri Analiz Merkezi */}
          <div className="lg:col-span-3 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tables">Tables</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="tables" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Select Tables to Process</CardTitle>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchAvailableTables}
                          disabled={isLoadingTables}
                        >
                          <RefreshCw className={`w-4 h-4 ${isLoadingTables ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const allTables = availableTables.filter(t => t.embeddedRecords < t.totalRecords).map(t => t.name);
                            setSelectedTables(selectedTables.length === allTables.length ? [] : allTables);
                          }}
                          disabled={progress?.status === 'processing'}
                        >
                          {selectedTables.length > 0 ? 'Clear All' : 'Select All'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoadingTables ? (
                      <ListSkeleton items={5} />
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {availableTables.map((table) => {
                          const isCompleted = table.embeddedRecords === table.totalRecords;
                          const progress = table.totalRecords > 0 ? (table.embeddedRecords / table.totalRecords) * 100 : 0;

                          return (
                            <Card key={table.name} className={`border cursor-pointer transition-all ${
                              selectedTables.includes(table.name) ? 'border-blue-500 bg-blue-50' : ''
                            }`}>
                              <CardContent className="p-4">
                                <div className="flex items-center space-x-3">
                                  <input
                                    type="checkbox"
                                    id={`table-${table.name}`}
                                    checked={selectedTables.includes(table.name)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedTables([...selectedTables, table.name]);
                                      } else {
                                        setSelectedTables(selectedTables.filter(t => t !== table.name));
                                      }
                                    }}
                                    disabled={progress?.status === 'processing' || isCompleted}
                                    className="rounded"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <label
                                        htmlFor={`table-${table.name}`}
                                        className="font-medium cursor-pointer"
                                      >
                                        {table.displayName}
                                      </label>
                                      <div className="flex items-center gap-2">
                                        {isCompleted && <CheckCircle className="w-4 h-4 text-green-500" />}
                                        <Badge variant="outline" className="text-xs">
                                          {progress.toFixed(1)}%
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                      {table.embeddedRecords.toLocaleString()} / {table.totalRecords.toLocaleString()} records
                                    </div>
                                    <TaoProgressBar
                                      value={progress}
                                      variant="zen"
                                      size="sm"
                                      className="mt-2"
                                      showLabel={false}
                                    />

                                    {/* Additional info */}
                                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                      {table.avgTokens && (
                                        <span>Avg: {table.avgTokens} tokens</span>
                                      )}
                                      {table.size && (
                                        <span>Size: {(table.size / 1024 / 1024).toFixed(1)}MB</span>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedTableForPreview(table.name);
                                      fetchTablePreview(table.name);
                                    }}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analytics" className="space-y-4">
                {analytics ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Total Processing Time
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {(analytics.totalProcessingTime / 1000 / 60).toFixed(1)} min
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          Average Speed
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {analytics.averageSpeed.toFixed(1)} rec/min
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Success Rate
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                          {(analytics.successRate * 100).toFixed(1)}%
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" />
                          Token Efficiency
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {(analytics.tokenEfficiency * 100).toFixed(1)}%
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No analytics data available yet</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Table Preview Modal/Section */}
        {selectedTableForPreview && tablePreviews[selectedTableForPreview] && (
          <div className="mt-6">
            <AdvancedTableViewer
              tableData={tablePreviews[selectedTableForPreview]}
              isLoading={isLoadingPreview[selectedTableForPreview]}
              onRefresh={() => fetchTablePreview(selectedTableForPreview)}
              onExport={(format) => {
                // Export logic
                const data = tablePreviews[selectedTableForPreview];
                const blob = new Blob([
                  format === 'csv'
                    ? convertToCSV(data.records)
                    : JSON.stringify(data.records, null, 2)
                ], {
                  type: format === 'csv' ? 'text/csv' : 'application/json'
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${selectedTableForPreview}.${format}`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              onViewEmbeddings={(recordId) => {
                // View embeddings logic
                toast({
                  title: "Embeddings",
                  description: `Viewing embeddings for record ${recordId}`,
                });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function for CSV conversion
function convertToCSV(data: any[]) {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',')
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    }).join(',')
  );

  return [csvHeaders, ...csvRows].join('\n');
}