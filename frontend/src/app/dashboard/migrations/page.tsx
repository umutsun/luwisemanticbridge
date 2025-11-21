'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TaoProgressBar } from '@/components/ui/tao-progress-bar';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { ProgressCircle } from '@/components/ui/progress-circle';
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
  Eye,
  Trash2,
  MoreHorizontal,
  Filter
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import { cn } from '@/lib/utils';

interface TableInfo {
  name: string;
  displayName: string;
  totalRecords: number;
  embeddedRecords: number;
  skippedRecords?: number;
  lastUpdated?: string;
  avgTokens?: number;
  size?: number;
  embeddingModel?: string;
  sourceId?: string;
  tokensUsed?: number;
  isFullyEmbedded?: boolean;
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

  const [progress, setProgress] = useState<EmbeddingProgress | null>({
    status: 'idle',
    current: 0,
    total: 0,
    percentage: 0,
    currentTable: null,
    error: null,
    tokensUsed: 0,
    message: 'Ready to start migration'
  });
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTableRows, setSelectedTableRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>('');
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
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [skippedRecords, setSkippedRecords] = useState<any[]>([]);
  const [isLoadingSkipped, setIsLoadingSkipped] = useState(false);
  const [selectedTableForSkipped, setSelectedTableForSkipped] = useState<string | null>(null);
  const [selectedSkippedIds, setSelectedSkippedIds] = useState<Set<number>>(new Set());
  const [isDeletingSkipped, setIsDeletingSkipped] = useState(false);
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

          const totalRecords = table.count || 0;
          const embeddedRecords = table.embedded || 0;
          const skippedRecords = table.skipped || 0;
          const isFullyEmbedded = totalRecords > 0 && (embeddedRecords + skippedRecords) >= totalRecords;

          return {
            name: table.name,
            displayName: displayName,
            totalRecords: totalRecords,
            embeddedRecords: embeddedRecords,
            skippedRecords: skippedRecords,
            tokensUsed: 0, // Will be updated during migration
            isFullyEmbedded: isFullyEmbedded
          };
        });

        console.log('All tables with embedding status:', transformedTables);
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

      // Try the unified embeddings endpoint (no source_name needed)
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/embeddings/unified-preview?source_table=${tableName}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        console.log(`Success! Unified preview data for ${tableName}:`, data);
        setTablePreviewData(data.data || []);
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
        setTotalTokensUsed(data.tokenUsage?.total_tokens || 0);
      }
    } catch (error) {
      console.log('Error fetching token stats:', error);
    }
  }, []);

  // Fetch skipped records for a table
  const fetchSkippedRecords = useCallback(async (tableName: string) => {
    setIsLoadingSkipped(true);
    setSelectedSkippedIds(new Set());
    try {
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/migration/skipped?table=${encodeURIComponent(tableName)}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log('Skipped records received:', data);
        setSkippedRecords(data.records || []);
        setSelectedTableForSkipped(tableName);

        // Pre-select all records by default
        const allIds = new Set((data.records || []).map((r: any) => r.id));
        setSelectedSkippedIds(allIds);

        setShowSkippedModal(true);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch skipped records",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching skipped records:', error);
      toast({
        title: "Error",
        description: "Failed to fetch skipped records",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSkipped(false);
    }
  }, [toast]);

  // Delete selected skipped records
  const deleteSkippedRecords = useCallback(async () => {
    if (selectedSkippedIds.size === 0) {
      toast({
        title: "No records selected",
        description: "Please select records to delete",
        variant: "destructive",
      });
      return;
    }

    setIsDeletingSkipped(true);
    try {
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/migration/skipped`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: Array.from(selectedSkippedIds) })
        }
      );

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Success",
          description: data.message || `Deleted ${selectedSkippedIds.size} record(s)`,
        });

        // Remove deleted records from state
        setSkippedRecords(prev =>
          prev.filter(record => !selectedSkippedIds.has(record.id))
        );
        setSelectedSkippedIds(new Set());

        // Refresh table stats
        fetchAvailableTables();

        // Close modal if no records left
        if (skippedRecords.length === selectedSkippedIds.size) {
          setShowSkippedModal(false);
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to delete skipped records",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error deleting skipped records:', error);
      toast({
        title: "Error",
        description: "Failed to delete skipped records",
        variant: "destructive",
      });
    } finally {
      setIsDeletingSkipped(false);
    }
  }, [selectedSkippedIds, skippedRecords.length, toast, fetchAvailableTables]);

  // Toggle individual skipped record selection
  const toggleSkippedRecord = useCallback((id: number) => {
    setSelectedSkippedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Toggle all skipped records selection
  const toggleAllSkippedRecords = useCallback(() => {
    if (selectedSkippedIds.size === skippedRecords.length) {
      setSelectedSkippedIds(new Set());
    } else {
      setSelectedSkippedIds(new Set(skippedRecords.map(r => r.id)));
    }
  }, [selectedSkippedIds.size, skippedRecords]);

  // Initial data fetch
  useEffect(() => {
    fetchAvailableTables();
    checkActiveMigration();
    fetchTokenStats();
  }, [fetchAvailableTables, checkActiveMigration, fetchTokenStats]);

  // Note: Progress polling removed - now using real-time SSE updates from startMigration()

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
      // Set initial progress state immediately
      setProgress({
        status: 'processing',
        current: 0,
        total: 100,
        percentage: 0,
        currentTable: selectedTables[0] || null,
        error: null,
        tokensUsed: 0,
        startTime: Date.now()
      });

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
        setProgress(null);
        setIsStartingMigration(false);
        return;
      }

      // Read SSE stream for real-time updates
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        toast({
          title: "Started",
          description: "Migration process started. Listening for updates...",
        });
        setIsStartingMigration(false);

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('SSE stream ended');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                console.log('📡 SSE Update:', data);

                // Update progress in real-time
                setProgress({
                  status: data.status || 'processing',
                  current: data.current || 0,
                  total: data.total || 0,
                  percentage: data.percentage || 0,
                  currentTable: data.currentTable || null,
                  error: data.error || null,
                  tokensUsed: data.tokenUsage?.total || 0,
                  message: data.message || null
                });

                // Handle completion
                if (data.status === 'completed') {
                  const isAlreadyEmbedded = data.total === 0 && data.current === 0;
                  toast({
                    title: isAlreadyEmbedded ? "Already Completed" : "Completed",
                    description: data.message || `Migration completed! ${data.current || 0} records processed.`,
                  });

                  fetchAvailableTables();
                  fetchTokenStats();

                  // Keep progress visible - don't auto-hide
                  // User can start a new migration to clear it

                  break;
                }

                // Handle errors
                if (data.status === 'failed' || data.status === 'error') {
                  toast({
                    title: "Error",
                    description: data.error || data.message || 'Migration failed',
                    variant: "destructive",
                  });

                  // Keep error progress visible - don't auto-hide

                  break;
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Migration start error:', error);
      setError('An error occurred while starting the migration.');
      setProgress(null);
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

  // Helper function for status badge colors
  const getStatusBadgeClass = (table: TableInfo) => {
    const isCompleted = table.isFullyEmbedded;
    const hasEmbedded = table.embeddedRecords > 0;

    if (isCompleted) {
      return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';
    } else if (hasEmbedded) {
      return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';
    } else {
      return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300';
    }
  };

  const getStatusText = (table: TableInfo) => {
    const isCompleted = table.isFullyEmbedded;
    const hasEmbedded = table.embeddedRecords > 0;

    if (isCompleted) {
      return 'Completed';
    } else if (hasEmbedded) {
      return 'Processing';
    } else {
      return 'Pending';
    }
  };

  const handleBatchMigration = async () => {
    if (selectedTableRows.size === 0) {
      toast({
        title: 'No Tables Selected',
        description: 'Please select at least one table',
        variant: 'destructive'
      });
      return;
    }

    const tablesToMigrate = Array.from(selectedTableRows);
    setSelectedTables(tablesToMigrate);
    await startMigration();
  };

  const handleBulkDelete = async () => {
    console.log('Bulk delete for tables:', Array.from(selectedTableRows));
    toast({
      title: 'Not Implemented',
      description: 'Bulk delete functionality will be added soon',
      variant: 'default'
    });
  };

  const handlePreviewTable = (table: TableInfo) => {
    setSelectedTableForPreview(table.name);
    fetchTablePreview(table.name);
    const newExpanded = new Set(expandedTables);
    if (expandedTables.has(table.name)) {
      newExpanded.delete(table.name);
    } else {
      newExpanded.add(table.name);
    }
    setExpandedTables(newExpanded);
  };

  const handleStartSingleMigration = (table: TableInfo) => {
    if (table.isFullyEmbedded) {
      toast({
        title: 'Already Completed',
        description: 'This table is fully embedded',
        variant: 'default'
      });
      return;
    }
    setSelectedTables([table.name]);
    startMigration();
  };

  const handleDeleteTable = (table: TableInfo) => {
    console.log('Delete table:', table);
    toast({
      title: 'Not Implemented',
      description: 'Table deletion will be added soon',
      variant: 'default'
    });
  };

  // Filter tables based on search and status
  const filteredTables = availableTables.filter(table => {
    const matchesSearch = table.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         table.name.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter !== 'all') {
      const status = getStatusText(table).toLowerCase();
      matchesStatus = status === statusFilter.toLowerCase();
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="w-full max-w-[1400px] mx-auto space-y-6">
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

        {/* Progress Card moved to right column below Migration Settings */}
        {false && progress && (progress.status === 'processing' || progress.status === 'completed') && (
          <Card className={`border-primary/30 ${
            progress.status === 'completed'
              ? 'bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/20 dark:via-emerald-950/20 dark:to-teal-950/20'
              : 'bg-gradient-to-br from-primary/5 via-blue-50 to-purple-50 dark:from-primary/10 dark:via-blue-950/20 dark:to-purple-950/20'
          }`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-6">
                {/* Progress Circle */}
                <div className="flex-shrink-0">
                  <ProgressCircle
                    progress={Math.round(progress.percentage || 0)}
                    showPulse={progress.status === 'processing'}
                    size={120}
                    statusText={progress.status === 'completed' ? 'Completed' : 'Processing'}
                  />
                </div>

                {/* Stats Grid */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                    <Badge
                      variant={progress.status === 'completed' ? 'default' : 'default'}
                      className={progress.status === 'processing' ? 'animate-pulse bg-slate-500 dark:bg-slate-600' : 'bg-green-500'}
                    >
                      {progress.status === 'completed' ? (
                        <><CheckCircle className="w-3 h-3 mr-1" /> Completed</>
                      ) : (
                        <><Activity className="w-3 h-3 mr-1" /> Processing</>
                      )}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Progress</div>
                    <div className="text-lg font-semibold">
                      {progress.current?.toLocaleString() || 0} / {progress.total?.toLocaleString() || 0}
                    </div>
                  </div>
                  {progress.currentTable && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Current Table</div>
                      <div className="text-sm font-medium truncate" title={progress.currentTable}>
                        {progress.currentTable}
                      </div>
                    </div>
                  )}
                  {progress.tokensUsed !== undefined && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Tokens Used</div>
                      <div className="text-lg font-semibold">{progress.tokensUsed.toLocaleString()}</div>
                    </div>
                  )}
                  {progress.message && progress.status === 'completed' && (
                    <div className="col-span-2 md:col-span-4">
                      <div className="text-sm text-muted-foreground mt-2 p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                        {progress.message}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
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

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Migration Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Embedding Model - Read from DB Settings */}
                <div className="p-4 bg-gray-100 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-100 uppercase tracking-wider mb-3">
                    Embedding Model
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Provider:</span>
                      <span className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {embeddingProvider}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                      <span className="text-xs font-mono text-gray-900 dark:text-gray-100 truncate">
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
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Progress + Tables */}
          <div className="lg:col-span-2 space-y-2">
            {/* Progress Card */}
            {progress && (
              <Card className="border-0 shadow-none bg-transparent">
                <CardContent className="p-0">
                  <div className="border rounded-lg p-4 bg-white dark:bg-slate-900/30 border-slate-200 dark:border-slate-700/50">
                    <div className="flex items-center gap-6">
                      <div className="flex-shrink-0">
                        <ProgressCircle
                          progress={Math.round(progress.percentage || 0)}
                          showPulse={progress.status === 'processing'}
                          size={120}
                          statusText={
                            progress.status === 'processing' ? "Processing" :
                            progress.status === 'completed' ? "Complete" :
                            progress.status === 'idle' ? "Ready" :
                            "Paused"
                          }
                        />
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Migration Progress
                          </h3>
                        </div>

                      {/* Selected Tables Info - Only show when idle with selections */}
                      {progress.status === 'idle' && selectedTables.length > 0 && (
                        <div className="bg-white dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                              Selected: {selectedTables.length} table{selectedTables.length > 1 ? 's' : ''}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {availableTables
                                .filter(t => selectedTables.includes(t.name))
                                .reduce((sum, t) => sum + (t.totalRecords - t.embeddedRecords), 0)
                                .toLocaleString()} records to process
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {selectedTables.slice(0, 3).map(tableName => (
                              <span key={tableName} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-200/80 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300">
                                {tableName}
                              </span>
                            ))}
                            {selectedTables.length > 3 && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-200 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400">
                                +{selectedTables.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Processing/Completed Info */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {progress.current !== undefined && progress.total !== undefined && progress.status !== 'idle' && (
                          <div>
                            <span className="text-slate-600 dark:text-slate-400">Records:</span>
                            <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">
                              {progress.current} / {progress.total}
                            </span>
                          </div>
                        )}
                        {progress.currentTable && (
                          <div>
                            <span className="text-slate-600 dark:text-slate-400">Table:</span>
                            <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">
                              {progress.currentTable}
                            </span>
                          </div>
                        )}
                        {progress.tokensUsed !== undefined && progress.tokensUsed > 0 && (
                          <div>
                            <span className="text-slate-600 dark:text-slate-400">Tokens:</span>
                            <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">
                              {progress.tokensUsed.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {progress.processingSpeed && (
                          <div>
                            <span className="text-slate-600 dark:text-slate-400">Speed:</span>
                            <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">
                              {progress.processingSpeed.toFixed(1)} rec/min
                            </span>
                          </div>
                        )}
                      </div>

                      {progress.message && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                          {progress.message}
                        </p>
                      )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Batch Toolbar */}
            {selectedTableRows.size > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      {selectedTableRows.size} table(s) selected
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedTableRows(new Set())}
                      className="h-7 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBatchMigration}
                      className="h-7 text-xs"
                      disabled={progress?.status === 'processing'}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Start Migration
                    </Button>
                    <ConfirmTooltip
                      onConfirm={handleBulkDelete}
                      title="Delete Selected Tables"
                      description={`Are you sure you want to delete ${selectedTableRows.size} table(s)?`}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete Selected
                      </Button>
                    </ConfirmTooltip>
                  </div>
                </div>
              </div>
            )}

            {/* Search and Filter */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      placeholder="Search tables..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px] h-9">
                      <Filter className="w-3 h-3 mr-2" />
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tables</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Tables List */}
            <Card>
              <CardContent className="pt-4 pb-4">
                {isLoadingTables ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"><Skeleton className="h-4 w-4" /></TableHead>
                        <TableHead className="w-64"><Skeleton className="h-4 w-32" /></TableHead>
                        <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
                        <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
                        <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
                        <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
                        <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...Array(7)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Skeleton className="h-2 w-full rounded-full" />
                              <Skeleton className="h-3 w-12" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedTableRows.size === filteredTables.length && filteredTables.length > 0}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTableRows(new Set(filteredTables.map(t => t.name)));
                              } else {
                                setSelectedTableRows(new Set());
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead className="w-64">Table Name</TableHead>
                        <TableHead className="w-32">Database</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-24">Total</TableHead>
                        <TableHead className="w-24">Embedded</TableHead>
                        <TableHead className="w-32">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredTables.map((table) => {
                      const skipped = table.skippedRecords || 0;
                      const isCompleted = (table.embeddedRecords + skipped) === table.totalRecords;
                      const tableProgress = table.totalRecords > 0 ? (table.embeddedRecords / table.totalRecords) * 100 : 0;
                      const isSelected = selectedTableRows.has(table.name);

                      return (
                        <TableRow
                          key={table.name}
                          className={cn(
                            "hover:bg-muted/50 transition-colors duration-150 cursor-pointer",
                            isSelected && "bg-blue-50 dark:bg-blue-950/30"
                          )}
                        >
                          {/* Checkbox column */}
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedTableRows);
                                if (checked) {
                                  newSelected.add(table.name);
                                } else {
                                  newSelected.delete(table.name);
                                }
                                setSelectedTableRows(newSelected);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>

                          {/* Table Name column */}
                          <TableCell className="font-medium">
                            <div className="truncate max-w-xs" title={table.name}>
                              {table.displayName}
                            </div>
                          </TableCell>

                          {/* Database column */}
                          <TableCell className="text-sm text-muted-foreground">
                            scriptus_lsemb
                          </TableCell>

                          {/* Status column with dropdown */}
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <div className="flex items-center gap-1 cursor-pointer group">
                                  <Badge variant="outline" className={cn(
                                    "text-xs font-medium border transition-all duration-150",
                                    getStatusBadgeClass(table)
                                  )}>
                                    {getStatusText(table)}
                                  </Badge>
                                  <MoreHorizontal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handlePreviewTable(table)}>
                                  <Eye className="w-3 h-3 mr-2" />
                                  Preview
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleStartSingleMigration(table)}
                                  disabled={table.isFullyEmbedded}
                                >
                                  <Play className="w-3 h-3 mr-2" />
                                  Start Migration
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteTable(table)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="w-3 h-3 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>

                          {/* Total column */}
                          <TableCell className="text-sm">{table.totalRecords.toLocaleString()}</TableCell>

                          {/* Embedded column */}
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2">
                              <span>{table.embeddedRecords.toLocaleString()}</span>
                              {skipped > 0 && (
                                <>
                                  <span className="text-xs text-yellow-600 dark:text-yellow-500">
                                    ({skipped} skipped)
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fetchSkippedRecords(table.name);
                                    }}
                                    className="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded p-0.5 transition-colors"
                                    title="View skipped records"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </TableCell>

                          {/* Progress column */}
                          <TableCell>
                            <div className="space-y-1">
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${tableProgress}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{tableProgress.toFixed(1)}%</span>
                                {isCompleted && (
                                  <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-500" />
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    </TableBody>
                  </Table>
                )}

                {/* Expanded Details - Commented out for now, can be added back later as a modal
                */}
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
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                    {(() => {
                      try {
                        const content = selectedRecord.content || 'No content available';
                        // Try to parse and format as JSON
                        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
                        return JSON.stringify(parsed, null, 2);
                      } catch {
                        // If not JSON, display as-is
                        return selectedRecord.content || 'No content available';
                      }
                    })()}
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

      {/* Skipped Records Modal - Minimal Table Design */}
      <Dialog open={showSkippedModal} onOpenChange={() => {
        setShowSkippedModal(false);
        setSkippedRecords([]);
        setSelectedTableForSkipped(null);
        setSelectedSkippedIds(new Set());
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          {/* Glassmorphic Header */}
          <div className="relative bg-gradient-to-br from-white/95 via-white/90 to-white/95 dark:from-gray-900/95 dark:via-gray-900/90 dark:to-gray-900/95 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 flex-shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-orange-500/5 dark:from-yellow-500/10 dark:to-orange-500/10" />
            <div className="relative px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">
                    Skipped Records
                    {selectedTableForSkipped && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {selectedTableForSkipped}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {skippedRecords.length} record{skippedRecords.length !== 1 ? 's' : ''} could not be embedded
                  </div>
                </div>
                {selectedSkippedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteSkippedRecords}
                    disabled={isDeletingSkipped}
                    className="shadow-lg"
                  >
                    {isDeletingSkipped ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        Delete ({selectedSkippedIds.size})
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {isLoadingSkipped ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : skippedRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mb-3 opacity-40 text-green-600" />
              <p className="text-sm font-medium">No skipped records</p>
              <p className="text-xs mt-1">All records were successfully embedded</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="text-left p-3 font-semibold w-10">
                      <input
                        type="checkbox"
                        checked={selectedSkippedIds.size === skippedRecords.length && skippedRecords.length > 0}
                        onChange={toggleAllSkippedRecords}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
                      />
                    </th>
                    <th className="text-left p-3 font-semibold">Name</th>
                    <th className="text-left p-3 font-semibold">Reason</th>
                    <th className="text-left p-3 font-semibold">ID</th>
                    <th className="text-left p-3 font-semibold">Type</th>
                    <th className="text-left p-3 font-semibold">Date</th>
                    <th className="text-left p-3 font-semibold">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {skippedRecords.map((record, index) => (
                    <tr
                      key={record.id || index}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedSkippedIds.has(record.id)}
                          onChange={() => toggleSkippedRecord(record.id)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="p-3 font-medium max-w-[200px] truncate">
                        {record.source_name || `Record #${record.source_id}`}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
                          {record.skip_reason === 'empty_embedding'
                            ? 'No content to embed'
                            : record.skip_reason?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono">
                        {record.source_id}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {record.source_type}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(record.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: '2-digit'
                        })}
                      </td>
                      <td className="p-3 max-w-[300px]">
                        {record.content_preview ? (
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            {record.content_preview.substring(0, 80)}
                            {record.content_preview.length > 80 && '...'}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">No preview</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Glassmorphic Footer */}
          {skippedRecords.length > 0 && (
            <div className="relative bg-gradient-to-br from-white/95 via-white/90 to-white/95 dark:from-gray-900/95 dark:via-gray-900/90 dark:to-gray-900/95 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-orange-500/5 dark:from-yellow-500/10 dark:to-orange-500/10" />
              <div className="relative px-6 py-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="text-muted-foreground">
                    Total: <span className="font-semibold text-yellow-600 dark:text-yellow-500">{skippedRecords.length}</span> skipped record{skippedRecords.length !== 1 ? 's' : ''}
                  </div>
                  <div className="text-muted-foreground">
                    Selected: <span className="font-semibold">{selectedSkippedIds.size}</span>
                  </div>
                </div>
              </div>
            </div>
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