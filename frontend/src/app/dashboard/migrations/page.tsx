'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TaoProgressBar } from '@/components/ui/tao-progress-bar';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import ProtectedRoute from '@/components/ProtectedRoute';
import config from '@/config/api.config';
import {
  Database,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  Square,
  Loader2,
  Activity,
  TrendingUp,
  X,
  Eye
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TableInfo {
  name: string;
  displayName: string;
  totalRecords: number;
  embeddedRecords: number;
  lastUpdated?: string;
  avgTokens?: number;
  size?: number;
  embeddingModel?: string;
  sourceId?: string;
  tokensUsed?: number;
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
  const [selectedTableForPreview, setSelectedTableForPreview] = useState<string | null>(null);
  const [tablePreviewData, setTablePreviewData] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showContentModal, setShowContentModal] = useState(false);
  const [totalTokensUsed, setTotalTokensUsed] = useState<number>(0);
  const [embeddingProvider, setEmbeddingProvider] = useState<string>('openai');
  const [embeddingModel, setEmbeddingModel] = useState<string>('text-embedding-ada-002');
  const { toast } = useToast();

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

  const API_BASE = config.api.baseUrl;
  const API_MIGRATION = `${config.api.baseUrl}/api/v2/migration`;
  const performanceIntervalRef = useRef<NodeJS.Timeout>();

  // Constants for intervals
  const intervals = {
    PERFORMANCE: 1000,
    PROGRESS: 2000,
    ANALYTICS: 5000
  };

  // Fetch available tables
  const fetchAvailableTables = useCallback(async () => {
    setIsLoadingTables(true);
    setError('');
    try {
      console.log('Fetching tables from:', `${config.api.baseUrl}/api/v2/migration/stats?t=${Date.now()}`);
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/migration/stats?t=${Date.now()}`);

      if (response.ok) {
        const data = await response.json();
        console.log('Tables data received:', data);
        console.log('Table details:', data.tables);

        // Transform API response to match frontend expectations
        const transformedTables = (data.tables || []).map(table => {
          // Create display name from table name
          const displayName = table.name
            .replace(/_/g, ' ')  // Replace underscores with spaces
            .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter

          return {
            name: table.name,
            displayName: displayName,
            totalRecords: table.count || 0,
            embeddedRecords: table.embedded || 0,
            tokensUsed: 0 // Will be updated during migration
          };
        });

        console.log('Transformed tables:', transformedTables);
        setAvailableTables(transformedTables);

        // Set token usage from API response
        if (data.tokenUsage) {
          setTotalTokensUsed(data.tokenUsage.total_tokens || 0);
        }

        // Set embedding provider and model from API response
        if (data.embeddingProvider) {
          setEmbeddingProvider(data.embeddingProvider);
        }
        if (data.embeddingModel) {
          setEmbeddingModel(data.embeddingModel);
        }

        if (!data.tables || data.tables.length === 0) {
          setError('No tables found. Please check database connection.');
        }
      } else if (response.status === 401) {
        setError('Authentication required. Please log in again.');
      } else {
        setError(`Failed to fetch tables. Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching tables:', error);
      setError('Could not connect to the server to fetch tables.');
    } finally {
      setIsLoadingTables(false);
    }
  }, []);

  // Fetch table preview data
  const fetchTablePreview = useCallback(async (tableName: string) => {
    setIsLoadingPreview(true);
    try {
      console.log(`Fetching preview for ${tableName}...`);

      // Try the required endpoint format - this needs to be created in backend
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/embeddings/unified-preview?source_table=${tableName}&source_name=rag_chatbot&limit=10`);
      if (response.ok) {
        const data = await response.json();
        console.log(`Success! Unified preview data for ${tableName}:`, data);
        setTablePreviewData(data.records || []);
      } else {
        console.log(`Required endpoint not found, trying fallback... Status: ${response.status}`);

        // Fallback to working endpoint
        const fallbackResponse = await fetchWithAuth(`${config.api.baseUrl}/api/v2/embeddings/table/${tableName}/embedded-recent`);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          console.log(`Fallback success! Data for ${tableName}:`, fallbackData);
          console.log('Embedded records sample:', fallbackData.embeddedRecords?.[0]);
          setTablePreviewData(fallbackData.embeddedRecords || []);
        } else {
          console.log(`Both endpoints failed for ${tableName}`);
          setTablePreviewData([]);
        }
      }

    } catch (error) {
      console.log(`Could not fetch preview for ${tableName}:`, error);
      setTablePreviewData([]);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

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

  // Fetch total tokens used
  const fetchTokenStats = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/migration/stats`);
      if (response.ok) {
        const data = await response.json();
        console.log('Token stats received:', data);
        setTotalTokensUsed(data.totalTokensUsed || 0);
      }
    } catch (error) {
      console.log('Error fetching token stats:', error);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchAvailableTables();
    checkActiveMigration();
    fetchTokenStats();
  }, [fetchAvailableTables, checkActiveMigration, fetchTokenStats]);

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
              fetchTokenStats(); // Refresh token stats after completion
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
  }, [progress?.status, toast, fetchAvailableTables]);

  const startMigration = async () => {
    console.log('Starting migration with selectedTables:', selectedTables);
    console.log('Available tables:', availableTables.map(t => ({name: t.name, total: t.totalRecords, embedded: t.embeddedRecords})));

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
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="w-[90%] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              Migrations
            </h1>
            <p className="text-muted-foreground mt-2">
              Advanced control and analytics for your embedding operations
            </p>
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

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {isLoadingTables ? (
            // Skeleton Loading for Statistics
            [...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              {/* Total Records - Yellow Pastel */}
              <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border-yellow-200 dark:border-yellow-800">
                <CardContent className="p-4">
                  <div className="text-sm text-yellow-700 dark:text-yellow-300 font-medium mb-1">Total Records</div>
                  <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{totalRecords.toLocaleString()}</div>
                </CardContent>
              </Card>

              {/* Embedded Records - Green Pastel */}
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
                <CardContent className="p-4">
                  <div className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">Embedded Records</div>
                  <div className="text-2xl font-bold text-green-900 dark:text-green-100">{totalEmbedded.toLocaleString()}</div>
                </CardContent>
              </Card>

              {/* Embedding Progress - Pink Pastel */}
              <Card className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 border-pink-200 dark:border-pink-800">
                <CardContent className="p-4">
                  <div className="text-sm text-pink-700 dark:text-pink-300 font-medium mb-1">Embedding Progress</div>
                  <div className="text-2xl font-bold text-pink-900 dark:text-pink-100">{overallProgress.toFixed(1)}%</div>
                  <div className="text-xs text-pink-600 dark:text-pink-400 mt-1">
                    <span className="font-mono">{(totalRecords - totalEmbedded).toLocaleString()}</span>
                    <span className="opacity-75 ml-1">pending</span>
                  </div>
                </CardContent>
              </Card>

              {/* Total Tokens - Gray Background with Black Text */}
              <Card className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <CardContent className="p-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">Total Tokens Used</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {totalTokensUsed.toLocaleString()}
                  </div>
                  {embeddingProvider === 'openai' && totalTokensUsed > 0 && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      <span className="font-mono">~${((totalTokensUsed / 1000) * 0.0001).toFixed(4)}</span>
                      <span className="opacity-75 ml-1">estimated cost</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Migration Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Embedding Model - Read from DB Settings */}
                <div className="p-4 bg-gray-900 dark:bg-gray-950 border border-gray-700 dark:border-gray-800 rounded-lg">
                  <div className="text-xs font-semibold text-gray-100 uppercase tracking-wider mb-3">
                    Embedding Model
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Provider:</span>
                      <span className="text-sm font-mono font-semibold text-gray-100">
                        {embeddingProvider}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Model:</span>
                      <span className="text-xs font-mono text-gray-100 truncate">
                        {embeddingModel}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Batch Size: {settings.batchSize}</label>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="10"
                    value={settings.batchSize}
                    onChange={(e) => setSettings({...settings, batchSize: parseInt(e.target.value)})}
                    className="w-full mt-1"
                    disabled={progress?.status === 'processing'}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>10</span>
                    <span>200</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Worker Count: {settings.workerCount}</label>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={settings.workerCount}
                    onChange={(e) => setSettings({...settings, workerCount: parseInt(e.target.value)})}
                    className="w-full mt-1"
                    disabled={progress?.status === 'processing'}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>1</span>
                    <span>16</span>
                  </div>
                </div>

                <div className="pt-4 space-y-2 border-t">
                  {progress?.status === 'processing' ? (
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full" onClick={() => fetchWithAuth(`${API_MIGRATION}/pause`, { method: 'POST' })}>
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </Button>
                      <Button variant="destructive" className="w-full" onClick={stopMigration}>
                        <Square className="w-4 h-4 mr-2" />
                        Stop
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={startMigration}
                      disabled={selectedTables.length === 0 || isStartingMigration}
                    >
                      {isStartingMigration ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Start Migration
                    </Button>
                  )}
                </div>

                {progress && (
                  <div className="pt-4 border-t">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <Badge variant={progress.status === 'processing' ? 'default' : 'secondary'}>
                          {progress.status}
                        </Badge>
                      </div>
                      {progress.current && progress.total && (
                        <div className="flex justify-between">
                          <span>Progress:</span>
                          <span>{progress.current} / {progress.total}</span>
                        </div>
                      )}
                      {progress.processingSpeed && (
                        <div className="flex justify-between">
                          <span>Speed:</span>
                          <span>{progress.processingSpeed.toFixed(1)} rec/min</span>
                        </div>
                      )}
                      {progress.estimatedTimeRemaining && (
                        <div className="flex justify-between">
                          <span>ETA:</span>
                          <span>{formatETA(progress.estimatedTimeRemaining)}</span>
                        </div>
                      )}
                    </div>
                    <TaoProgressBar
                      value={progress.percentage || 0}
                      variant="zen"
                      className="mt-2"
                      showPercentage={false}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tables List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                {/* Header removed - no Select All or Refresh buttons */}
              </CardHeader>
              <CardContent>
                {isLoadingTables ? (
                  <ListSkeleton items={5} />
                ) : (
                  <div className="space-y-2">
                    {availableTables.map((table) => {
                      const isCompleted = table.embeddedRecords === table.totalRecords;
                      const tableProgress = table.totalRecords > 0 ? (table.embeddedRecords / table.totalRecords) * 100 : 0;

                      return (
                        <div key={table.name} className="border rounded-lg overflow-hidden transition-all">
                          <div
                            className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                              selectedTables.includes(table.name) ? 'bg-blue-50 dark:bg-blue-950' : ''
                            } ${expandedTables.has(table.name) ? 'border-b' : ''}`}
                            onClick={() => {
                              const newExpanded = new Set(expandedTables);
                              if (expandedTables.has(table.name)) {
                                newExpanded.delete(table.name);
                              } else {
                                newExpanded.add(table.name);
                                setSelectedTableForPreview(table.name);
                                fetchTablePreview(table.name);
                              }
                              setExpandedTables(newExpanded);
                            }}
                          >
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                id={`table-${table.name}`}
                                checked={isCompleted ? true : selectedTables.includes(table.name)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (!isCompleted) {
                                    if (e.target.checked) {
                                      setSelectedTables([...selectedTables, table.name]);
                                    } else {
                                      setSelectedTables(selectedTables.filter(t => t !== table.name));
                                    }
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
                                    <span className="text-sm text-muted-foreground">
                                      {tableProgress.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {table.embeddedRecords.toLocaleString()} / {table.totalRecords.toLocaleString()}
                                </div>
                                <TaoProgressBar
                                  value={tableProgress}
                                  variant="zen"
                                  size="sm"
                                  className="mt-2"
                                  showPercentage={false}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Expanded Details - Just Records Table */}
                          {expandedTables.has(table.name) && (
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t">
  
                              {tablePreviewData.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left p-2 font-medium">Source ID</th>
                                        <th className="text-left p-2 font-medium">Created</th>
                                        <th className="text-left p-2 font-medium">Tokens</th>
                                        <th className="text-left p-2 font-medium">Model</th>
                                        <th className="text-center p-2 font-medium w-20"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {tablePreviewData.slice(0, 10).map((record, index) => (
                                        <tr key={index} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                          <td className="p-3 text-sm font-medium">{record.source_id || '-'}</td>
                                          <td className="p-3 text-sm">
                                            {record.created_at ?
                                              new Date(record.created_at).toLocaleDateString() + ' ' +
                                              new Date(record.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                                              : '-'
                                            }
                                          </td>
                                          <td className="p-3 text-sm">
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
                                              <Database className="w-3.5 h-3.5" />
                                              {record.tokens || record.token_used || '-'}
                                            </div>
                                          </td>
                                          <td className="p-3 text-sm">
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 border border-green-200/50 dark:border-green-800/50 shadow-sm">
                                              <Activity className="w-3.5 h-3.5" />
                                              {record.model || record.model_used || '-'}
                                            </div>
                                          </td>
                                          <td className="p-3 text-center">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedRecord(record);
                                                setShowContentModal(true);
                                              }}
                                              className="group inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-all duration-200 hover:scale-105"
                                              title="View content"
                                            >
                                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors" />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {isLoadingPreview && (
                                <div className="space-y-3">
                                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                                  <div className="space-y-2">
                                    {[...Array(5)].map((_, i) => (
                                      <div key={i} className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Content Modal - Simple Preview */}
      <Dialog open={showContentModal} onOpenChange={() => {
        setShowContentModal(false);
        setSelectedRecord(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-center">
                <Eye className="w-3 h-3 text-white" />
              </div>
              Content Preview
            </DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <>
              <div className="flex-1 overflow-y-auto max-h-[60vh]">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedRecord.content || selectedRecord.content || 'No content available'}
                  </pre>
                </div>
              </div>

              {/* Model and Token Info at Bottom */}
              <div className="mt-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-medium">{selectedRecord.model || selectedRecord.model_used || '-'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-muted-foreground">Tokens:</span>
                    <span className="font-medium">{selectedRecord.tokens || selectedRecord.token_used || '-'}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </ProtectedRoute>
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