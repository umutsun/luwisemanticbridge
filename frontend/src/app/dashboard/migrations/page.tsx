'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TaoProgressBar } from '@/components/ui/tao-progress-bar';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { ProgressCircle } from '@/components/ui/progress-circle';
import { useToast } from '@/hooks/use-toast';
import { AnimatedNumber } from '@/components/ui/animated-number';
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
  Filter,
  Plus,
  ChevronLeft,
  ChevronRight
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
  const [embeddingDimension, setEmbeddingDimension] = useState<number>(1536);
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewHasMore, setPreviewHasMore] = useState(true);
  const [isLoadingMorePreview, setIsLoadingMorePreview] = useState(false);
  const [skippedRecords, setSkippedRecords] = useState<any[]>([]);
  const [isLoadingSkipped, setIsLoadingSkipped] = useState(false);
  const [selectedTableForSkipped, setSelectedTableForSkipped] = useState<string | null>(null);
  const [selectedSkippedIds, setSelectedSkippedIds] = useState<Set<number>>(new Set());
  const [isDeletingSkipped, setIsDeletingSkipped] = useState(false);
  const [isReembedding, setIsReembedding] = useState(false);
  // Skipped records pagination
  const [skippedPage, setSkippedPage] = useState(1);
  const [skippedTotalCount, setSkippedTotalCount] = useState(0);
  const SKIPPED_PAGE_SIZE = 100;

  // Data Health state
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [healthProgress, setHealthProgress] = useState(0);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState<{
    status: 'idle' | 'processing' | 'completed' | 'error';
    currentTable: string;
    tablesProcessed: number;
    totalTables: number;
    orphansDeleted: number;
    duplicatesDeleted: number;
    metadataFixed: number;
    message: string;
  }>({
    status: 'idle',
    currentTable: '',
    tablesProcessed: 0,
    totalTables: 0,
    orphansDeleted: 0,
    duplicatesDeleted: 0,
    metadataFixed: 0,
    message: ''
  });
  const [healthReport, setHealthReport] = useState<{
    summary: { total_embeddings: number; orphan_count: number; missing_metadata_count: number; duplicate_count: number; health_score: number };
    tables: Record<string, any>;
    recommendations: string[];
  } | null>(null);

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

  // Fetch available tables with retry logic
  const fetchAvailableTables = useCallback(async (retryCount = 0) => {
    setIsLoadingTables(true);
    const maxRetries = 4; // Increased from 2 to 4 for database startup
    try {
      // Add initial delay on first load to let database initialize
      if (retryCount === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Use refresh=true on first load to ensure pools are initialized
      const isFirstLoad = retryCount === 0;
      const url = `${config.api.baseUrl}/api/v2/migration/stats?t=${Date.now()}${isFirstLoad ? '&refresh=true' : ''}`;
      console.log('Fetching tables from:', url);
      const response = await fetchWithAuth(url);

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

        // Set embedding provider, model and dimension from API response
        if (data.embeddingProvider) {
          setEmbeddingProvider(data.embeddingProvider);
        }
        if (data.embeddingModel) {
          setEmbeddingModel(data.embeddingModel);
        }
        if (data.embeddingDimension) {
          setEmbeddingDimension(data.embeddingDimension);
        }

        if (!data.tables || data.tables.length === 0) {
          toast({
            title: "Warning",
            description: "No tables found. Please check database connection.",
            variant: "destructive",
          });
        }
      } else if (response.status === 401) {
        toast({
          title: "Authentication Error",
          description: "Authentication required. Please log in again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to fetch tables. Status: ${response.status}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching tables:', error);

      // Retry logic for connection errors
      if (retryCount < maxRetries) {
        // Longer delays for database startup: 2s, 3s, 4s, 5s
        const delayMs = 2000 + (1000 * retryCount);
        console.log(`Retrying fetch tables (attempt ${retryCount + 2}/${maxRetries + 1}) in ${delayMs}ms...`);
        setTimeout(() => {
          fetchAvailableTables(retryCount + 1);
        }, delayMs);
        return;
      }

      toast({
        title: "Connection Error",
        description: "Could not connect to the server to fetch tables.",
        variant: "destructive",
      });
    } finally {
      if (retryCount >= maxRetries || retryCount === 0) {
        setIsLoadingTables(false);
      }
    }
  }, [toast]);

  // Fetch table preview data with pagination
  const PREVIEW_PAGE_SIZE = 10;

  const fetchTablePreview = useCallback(async (tableName: string, offset: number = 0, append: boolean = false) => {
    if (append) {
      setIsLoadingMorePreview(true);
    } else {
      setIsLoadingPreview(true);
      setPreviewOffset(0);
      setPreviewHasMore(true);
    }

    try {
      // Fetch with sort=desc to get most recent first
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/embeddings/unified-preview?source_table=${tableName}&limit=${PREVIEW_PAGE_SIZE}&offset=${offset}&sort=desc`
      );

      if (response.ok) {
        const data = await response.json();
        const records = data.data || [];

        if (append) {
          setTablePreviewData(prev => [...prev, ...records]);
        } else {
          setTablePreviewData(records);
        }

        // Check if there are more records
        setPreviewHasMore(records.length === PREVIEW_PAGE_SIZE);
        setPreviewOffset(offset + records.length);
      } else {
        if (!append) setTablePreviewData([]);
        setPreviewHasMore(false);
      }
    } catch (error) {
      console.log(`Could not fetch preview for ${tableName}:`, error);
      if (!append) setTablePreviewData([]);
      setPreviewHasMore(false);
    } finally {
      setIsLoadingPreview(false);
      setIsLoadingMorePreview(false);
    }
  }, []);

  // Fetch total tokens used (defined before connectToProgressStream to avoid circular dep)
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

  // Polling interval ref for cleanup
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch progress via polling (more reliable than SSE through Nginx)
  const fetchProgressPolling = useCallback(async () => {
    try {
      // Use the non-streaming progress endpoint
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/embeddings/progress`);
      if (!response.ok) return;

      const data = await response.json();
      console.log('📡 Progress Poll:', data);

      // Treat as idle if: status is idle, OR status is paused but no actual work (total=0, no tables)
      const isEffectivelyIdle = data.status === 'idle' ||
        (data.status === 'paused' && data.total === 0 && (!data.tables || data.tables.length === 0));

      if (isEffectivelyIdle) {
        // No active migration - clear progress and stop polling
        setProgress(null);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          console.log('📡 Polling stopped - status is idle/effectively idle');
        }
        return;
      }

      // Update progress in real-time
      setProgress({
        status: data.status || 'processing',
        current: data.current || 0,
        total: data.total || 0,
        percentage: data.percentage || 0,
        currentTable: data.currentTable || null,
        error: data.error || null,
        tokensUsed: data.tokenUsage?.total || data.tokensUsed || 0,
        message: data.message || null
      });

      // Update selected tables if available
      if (data.tables) {
        setSelectedTables(data.tables);
      }

      // Handle completion
      if (data.status === 'completed') {
        fetchAvailableTables();
        fetchTokenStats();
        // Stop polling on completion
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (e) {
      console.error('Error fetching progress:', e);
    }
  }, [fetchAvailableTables, fetchTokenStats]);

  // Start polling for progress updates
  const startProgressPolling = useCallback(() => {
    // Clear existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log('📡 Starting progress polling (every 2s)');

    // Fetch immediately
    fetchProgressPolling();

    // Then poll every 2 seconds
    pollingIntervalRef.current = setInterval(fetchProgressPolling, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [fetchProgressPolling]);

  // Alias for backward compatibility
  const connectToProgressStream = startProgressPolling;

  // Check for active migration (initial check only)
  const checkActiveMigration = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_MIGRATION}/progress`);
      if (response.ok) {
        const data = await response.json();
        // Treat as idle if: status is idle, OR status is paused but no actual work
        const isEffectivelyIdle = data.status === 'idle' ||
          (data.status === 'paused' && data.total === 0 && (!data.tables || data.tables.length === 0));

        if (data.status && !isEffectivelyIdle) {
          setProgress(data);
          if (data.tables) {
            setSelectedTables(data.tables);
          }
          // If there's an active migration, connect to SSE stream
          connectToProgressStream();
        }
      }
    } catch (error) {
      console.error('Error checking active migration:', error);
    }
  }, [connectToProgressStream]);

  // Fetch skipped records for a table with pagination
  const fetchSkippedRecords = useCallback(async (tableName: string, page: number = 1) => {
    setIsLoadingSkipped(true);
    if (page === 1) {
      setSelectedSkippedIds(new Set());
    }
    try {
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/migration/skipped?table=${encodeURIComponent(tableName)}&page=${page}&limit=${SKIPPED_PAGE_SIZE}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log('Skipped records received:', data);
        setSkippedRecords(data.records || []);
        setSkippedTotalCount(data.total || data.records?.length || 0);
        setSkippedPage(page);
        setSelectedTableForSkipped(tableName);

        // Pre-select all records on current page
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

  // Delete ALL skipped records for the current table
  const deleteAllSkippedRecords = useCallback(async () => {
    if (!selectedTableForSkipped) return;

    if (!confirm(`Delete ALL ${skippedTotalCount.toLocaleString()} skipped records for "${selectedTableForSkipped}"?`)) {
      return;
    }

    setIsDeletingSkipped(true);
    try {
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/migration/skipped?table=${encodeURIComponent(selectedTableForSkipped)}&bulkDelete=true`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Success",
          description: data.message || `Deleted all skipped records`,
        });

        setSkippedRecords([]);
        setSkippedTotalCount(0);
        setSelectedSkippedIds(new Set());
        setShowSkippedModal(false);
        fetchAvailableTables();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete skipped records",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error deleting all skipped records:', error);
      toast({
        title: "Error",
        description: "Failed to delete skipped records",
        variant: "destructive",
      });
    } finally {
      setIsDeletingSkipped(false);
    }
  }, [selectedTableForSkipped, skippedTotalCount, toast, fetchAvailableTables]);

  // Re-embed selected skipped records
  const reembedSkippedRecords = useCallback(async () => {
    if (selectedSkippedIds.size === 0 || !selectedTableForSkipped) {
      toast({
        title: "No records selected",
        description: "Please select records to re-embed",
        variant: "destructive",
      });
      return;
    }

    setIsReembedding(true);
    try {
      // First delete the selected records from skipped_embeddings
      const deleteResponse = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/migration/skipped`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: Array.from(selectedSkippedIds) })
        }
      );

      if (deleteResponse.ok) {
        // Remove deleted records from state
        setSkippedRecords(prev =>
          prev.filter(record => !selectedSkippedIds.has(record.id))
        );
        setSelectedSkippedIds(new Set());

        // Close modal
        setShowSkippedModal(false);

        // Add the table to selected tables and start migration
        setSelectedTables([selectedTableForSkipped]);

        toast({
          title: "Re-embedding started",
          description: `${selectedSkippedIds.size} record(s) will be re-processed`,
        });

        // Refresh table stats
        fetchAvailableTables();
      } else {
        toast({
          title: "Error",
          description: "Failed to prepare records for re-embedding",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error re-embedding skipped records:', error);
      toast({
        title: "Error",
        description: "Failed to re-embed skipped records",
        variant: "destructive",
      });
    } finally {
      setIsReembedding(false);
    }
  }, [selectedSkippedIds, selectedTableForSkipped, toast, fetchAvailableTables, setSelectedTables]);

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

  // Initial data fetch and SSE connection
  useEffect(() => {
    fetchAvailableTables();
    fetchTokenStats();

    // Load health report silently for left card (inline to avoid hoisting issues)
    const loadHealthReport = async () => {
      try {
        const response = await fetchWithAuth('/api/data-health/report');
        if (response.ok) {
          const data = await response.json();
          if (!data.error) {
            setHealthReport(data);
          }
        }
      } catch (error) {
        console.log('Health report fetch failed:', error);
      }
    };
    loadHealthReport();

    // Connect to SSE progress stream for real-time updates
    connectToProgressStream();

    // Polling fallback - check progress every 3 seconds (SSE backup)
    const pollingInterval = setInterval(async () => {
      try {
        const response = await fetchWithAuth(`${API_MIGRATION}/progress`);
        if (response.ok) {
          const data = await response.json();
          if (data.status && data.status !== 'idle') {
            setProgress({
              status: data.status,
              current: data.current || 0,
              total: data.total || 0,
              percentage: data.percentage || 0,
              currentTable: data.currentTable || null,
              error: data.error || null,
              tokensUsed: data.tokenUsage?.total_tokens || data.tokenUsage?.total || 0,
              message: data.message || null
            });
          }
        }
      } catch (e) {
        // Polling failed, SSE should handle it
      }
    }, 3000);

    // Cleanup on unmount
    return () => {
      clearInterval(pollingInterval);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [fetchAvailableTables, fetchTokenStats, connectToProgressStream]);

  // Note: Progress updates now come from polling (SSE doesn't work reliably through Nginx)

  const startMigration = async () => {
    // Merge queued tables with currently selected table rows (checkboxes)
    const tablesToProcess = Array.from(new Set([
      ...selectedTables,
      ...Array.from(selectedTableRows)
    ]));

    console.log('Starting migration with tables:', tablesToProcess);
    console.log('From queue:', selectedTables);
    console.log('From checkboxes:', Array.from(selectedTableRows));
    console.log('Available tables:', availableTables.map(t => ({name: t.name, total: t.totalRecords, embedded: t.embeddedRecords})));

    if (tablesToProcess.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one table.",
        variant: "destructive",
      });
      return;
    }

    // Add checkbox selections to queue automatically
    if (selectedTableRows.size > 0) {
      setSelectedTables(tablesToProcess);
      setSelectedTableRows(new Set()); // Clear checkboxes after adding to queue
    }

    setIsStartingMigration(true);

    try {
      // Calculate real total from selected tables
      const selectedTotal = availableTables
        .filter(t => tablesToProcess.includes(t.name))
        .reduce((sum, t) => sum + (t.totalRecords - t.embeddedRecords), 0);

      // Set initial progress state immediately with real total
      setProgress({
        status: 'processing',
        current: 0,
        total: selectedTotal || 1, // Avoid division by zero
        percentage: 0,
        currentTable: tablesToProcess[0] || null,
        error: null,
        tokensUsed: 0,
        startTime: Date.now()
      });

      const response = await fetchWithAuth(`${API_MIGRATION}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: tablesToProcess,
          ...settings
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        // "Migration already in progress" is info, not error
        if (errorData.error?.includes('already in progress') || errorData.error?.includes('zaten')) {
          toast({
            title: "Migration Running",
            description: "Migration is already running. Progress will update automatically.",
          });
          setIsStartingMigration(false);
          return;
        }

        toast({
          title: "Migration Error",
          description: errorData.error || 'Failed to start migration.',
          variant: "destructive",
        });
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
      toast({
        title: "Error",
        description: 'An error occurred while starting the migration.',
        variant: "destructive",
      });
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
      toast({
        title: "Error",
        description: 'Failed to stop migration.',
        variant: "destructive",
      });
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
    // Check if this table is currently being processed
    const isActivelyProcessing = progress?.status === 'processing' && progress?.currentTable === table.name;

    if (isCompleted) {
      return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';
    } else if (isActivelyProcessing) {
      return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';  // Active processing - blue
    } else if (hasEmbedded) {
      return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300';  // Partial - amber/yellow
    } else {
      return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300';
    }
  };

  const getStatusText = (table: TableInfo) => {
    const isCompleted = table.isFullyEmbedded;
    const hasEmbedded = table.embeddedRecords > 0;
    // Check if this table is currently being processed
    const isActivelyProcessing = progress?.status === 'processing' && progress?.currentTable === table.name;

    if (isCompleted) {
      return 'Completed';
    } else if (isActivelyProcessing) {
      return 'Processing';  // Only show "Processing" when actively being embedded
    } else if (hasEmbedded) {
      return 'Partial';  // Has some embeddings but not complete - NOT actively processing
    } else {
      return 'Pending';
    }
  };

  const handleAddToQueue = () => {
    if (selectedTableRows.size === 0) {
      toast({
        title: 'No Tables Selected',
        description: 'Please select at least one table',
        variant: 'destructive'
      });
      return;
    }

    const tablesToAdd = Array.from(selectedTableRows);
    // Add to selectedTables without duplicates
    setSelectedTables(prev => {
      const newSet = new Set([...prev, ...tablesToAdd]);
      return Array.from(newSet);
    });
    setSelectedTableRows(new Set()); // Clear row selection
    toast({
      title: 'Added to Queue',
      description: `${tablesToAdd.length} table(s) added to migration queue`,
    });
  };

  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const handleBulkDelete = async () => {
    const tablesToDelete = Array.from(selectedTableRows);
    console.log('Bulk delete for tables:', tablesToDelete);

    if (tablesToDelete.length === 0) {
      toast({
        title: 'No Tables Selected',
        description: 'Please select at least one table to delete',
        variant: 'destructive'
      });
      return;
    }

    setIsBulkDeleting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Delete embeddings for each selected table
      for (const table of tablesToDelete) {
        try {
          const response = await fetchWithAuth(
            `${config.api.baseUrl}/api/v2/migration/clear/${encodeURIComponent(table)}`,
            { method: 'DELETE' }
          );

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Failed to delete ${table}:`, await response.text());
          }
        } catch (error) {
          errorCount++;
          console.error(`Error deleting ${table}:`, error);
        }
      }

      // Show result
      if (successCount > 0) {
        toast({
          title: 'Deleted Successfully',
          description: `${successCount} table(s) cleared${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        });
      } else if (errorCount > 0) {
        toast({
          title: 'Delete Failed',
          description: `Failed to delete ${errorCount} table(s)`,
          variant: 'destructive'
        });
      }

      // Clear selection and refresh
      setSelectedTableRows(new Set());
      fetchAvailableTables();

    } catch (error) {
      console.error('Bulk delete error:', error);
      toast({
        title: 'Error',
        description: 'An error occurred during bulk delete',
        variant: 'destructive'
      });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Fetch health report silently (without modal)
  const fetchHealthReport = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/data-health/report');
      if (response.ok) {
        const data = await response.json();
        if (!data.error) {
          setHealthReport(data);
        }
      }
    } catch (error) {
      console.log('Health report fetch failed:', error);
    }
  }, []);

  // Run Data Health Check (with animation and toast)
  const runHealthCheck = async () => {
    setIsHealthChecking(true);
    setHealthProgress(0);
    setHealthReport(null);

    try {
      // Simulate progress animation while waiting for API
      const progressInterval = setInterval(() => {
        setHealthProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 300);

      const response = await fetchWithAuth('/api/data-health/report');
      clearInterval(progressInterval);

      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        setHealthProgress(100);
        setHealthReport(data);
        // Don't show modal - data will be shown in left card

        // Show toast with summary
        const { summary } = data;
        const issues = summary.orphan_count + summary.missing_metadata_count + summary.duplicate_count;

        toast({
          title: `Veri Sağlığı: ${summary.health_score.toFixed(0)}%`,
          description: issues > 0
            ? `${summary.total_embeddings.toLocaleString()} kayıt tarandı. ${issues.toLocaleString()} sorun bulundu.`
            : `${summary.total_embeddings.toLocaleString()} kayıt tarandı. Sorun bulunamadı.`,
          variant: issues > 100 ? 'destructive' : 'default'
        });
      } else {
        throw new Error('Health check failed');
      }
    } catch (error: any) {
      toast({
        title: 'Sağlık Kontrolü Başarısız',
        description: error.message || 'Python servise bağlanılamadı',
        variant: 'destructive'
      });
    } finally {
      setTimeout(() => {
        setIsHealthChecking(false);
        setHealthProgress(0);
      }, 500);
    }
  };

  const handlePreviewTable = (table: TableInfo) => {
    // Normalize table name to lowercase for API query
    const normalizedName = table.name.toLowerCase();
    setSelectedTableForPreview(table.name);
    fetchTablePreview(normalizedName);
    setShowPreviewModal(true);
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
          <div className="lg:col-span-1 space-y-4">
            {/* Migration Settings Card with Progress */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Progress Circle - Always visible, above Batch Size */}
                <div className="flex flex-col items-center gap-3 pb-2">
                  <ProgressCircle
                    progress={
                      isOptimizing
                        ? (optimizeProgress.totalTables > 0
                            ? Math.round((optimizeProgress.tablesProcessed / optimizeProgress.totalTables) * 100)
                            : 0)
                        : Math.round(progress?.percentage || 0)
                    }
                    showPulse={isOptimizing || progress?.status === 'processing'}
                    size={120}
                    statusText={
                      isOptimizing ? "Optimizing" :
                      optimizeProgress.status === 'completed' ? "Optimized" :
                      progress?.status === 'processing' ? "Processing" :
                      progress?.status === 'completed' ? "Complete" :
                      progress?.status === 'idle' ? "Ready" :
                      "Paused"
                    }
                  />

                  {/* Optimize Mode - Processing */}
                  {isOptimizing && (
                    <div className="w-full space-y-1.5 text-sm bg-violet-50 dark:bg-violet-950/30 rounded-lg p-3 border border-violet-200 dark:border-violet-800">
                      <div className="flex justify-between">
                        <span className="text-violet-600 dark:text-violet-400">Durum:</span>
                        <span className="font-medium text-violet-900 dark:text-violet-100">Veri Optimizasyonu</span>
                      </div>
                      {optimizeProgress.currentTable && (
                        <div className="flex justify-between">
                          <span className="text-violet-600 dark:text-violet-400">Tablo:</span>
                          <span className="font-medium text-violet-900 dark:text-violet-100">{optimizeProgress.currentTable}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-violet-600 dark:text-violet-400">İlerleme:</span>
                        <span className="font-medium text-violet-900 dark:text-violet-100">
                          {optimizeProgress.tablesProcessed} / {optimizeProgress.totalTables} tablo
                        </span>
                      </div>
                      {optimizeProgress.message && (
                        <div className="text-xs text-violet-700 dark:text-violet-300 mt-2 pt-2 border-t border-violet-200 dark:border-violet-700">
                          {optimizeProgress.message}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optimize Completed */}
                  {!isOptimizing && optimizeProgress.status === 'completed' && (
                    <div className="w-full space-y-1.5 text-sm bg-violet-50 dark:bg-violet-950/30 rounded-lg p-3 border border-violet-200 dark:border-violet-800">
                      <div className="flex justify-between">
                        <span className="text-violet-600 dark:text-violet-400">Durum:</span>
                        <span className="font-medium text-violet-900 dark:text-violet-100">Optimizasyon Tamamlandı</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-violet-600 dark:text-violet-400">Orphan:</span>
                        <span className="font-medium text-violet-900 dark:text-violet-100">{optimizeProgress.orphansDeleted} silindi</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-violet-600 dark:text-violet-400">Duplicate:</span>
                        <span className="font-medium text-violet-900 dark:text-violet-100">{optimizeProgress.duplicatesDeleted} silindi</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-violet-600 dark:text-violet-400">Metadata:</span>
                        <span className="font-medium text-violet-900 dark:text-violet-100">{optimizeProgress.metadataFixed} düzeltildi</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full mt-2 text-violet-600 hover:text-violet-700"
                        onClick={() => setOptimizeProgress(prev => ({ ...prev, status: 'idle' }))}
                      >
                        Kapat
                      </Button>
                    </div>
                  )}

                  {/* Real-time Status Info - Processing */}
                  {!isOptimizing && optimizeProgress.status !== 'completed' && progress?.status === 'processing' && (
                    <div className="w-full space-y-1.5 text-sm bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                      {progress.currentTable && (
                        <div className="flex justify-between">
                          <span className="text-blue-600 dark:text-blue-400">Table:</span>
                          <span className="font-medium text-blue-900 dark:text-blue-100">{progress.currentTable}</span>
                        </div>
                      )}
                      {progress.current !== undefined && progress.total !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-blue-600 dark:text-blue-400">Records:</span>
                          <span className="font-medium text-blue-900 dark:text-blue-100">
                            <AnimatedNumber value={progress.current} duration={500} /> / <AnimatedNumber value={progress.total} duration={500} />
                          </span>
                        </div>
                      )}
                      {progress.tokensUsed !== undefined && progress.tokensUsed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-blue-600 dark:text-blue-400">Tokens:</span>
                          <span className="font-medium text-blue-900 dark:text-blue-100">
                            <AnimatedNumber value={progress.tokensUsed} duration={500} />
                          </span>
                        </div>
                      )}
                      {progress.message && (
                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                          {progress.message}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Completed Status */}
                  {!isOptimizing && optimizeProgress.status !== 'completed' && progress?.status === 'completed' && (
                    <div className="w-full space-y-1.5 text-sm bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
                      <div className="flex justify-between">
                        <span className="text-green-600 dark:text-green-400">Status:</span>
                        <span className="font-medium text-green-900 dark:text-green-100">Completed</span>
                      </div>
                      {progress.current !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-green-600 dark:text-green-400">Processed:</span>
                          <span className="font-medium text-green-900 dark:text-green-100">
                            <AnimatedNumber value={progress.current} duration={500} /> records
                          </span>
                        </div>
                      )}
                      {progress.message && (
                        <div className="text-xs text-green-700 dark:text-green-300 mt-2 pt-2 border-t border-green-200 dark:border-green-700">
                          {progress.message}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Tables Info - Only show when idle with selections */}
                  {(!progress || progress.status === 'idle') && selectedTables.length > 0 && (
                    <div className="w-full bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {selectedTables.length} table{selectedTables.length > 1 ? 's' : ''} queued
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {availableTables
                          .filter(t => selectedTables.includes(t.name))
                          .reduce((sum, t) => sum + (t.totalRecords - t.embeddedRecords), 0)
                          .toLocaleString()} records to process
                      </div>
                    </div>
                  )}

                  {/* Data Health Summary - Show when idle and health report available */}
                  {(!progress || progress.status === 'idle') && !isOptimizing && optimizeProgress.status !== 'completed' && healthReport && (
                    <div className="w-full bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Veri Sağlığı</span>
                        <span className={cn(
                          "text-sm font-bold",
                          healthReport.summary.health_score >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                          healthReport.summary.health_score >= 50 ? "text-amber-600 dark:text-amber-400" :
                          "text-rose-600 dark:text-rose-400"
                        )}>
                          {Math.round(healthReport.summary.health_score)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Metadata Eksik:</span>
                          <span className="font-medium text-amber-600 dark:text-amber-400">
                            {healthReport.summary.missing_metadata_count.toLocaleString('tr-TR')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Duplicate:</span>
                          <span className="font-medium text-rose-600 dark:text-rose-400">
                            {healthReport.summary.duplicate_count.toLocaleString('tr-TR')}
                          </span>
                        </div>
                      </div>
                      {healthReport.summary.health_score < 95 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-2 h-7 text-xs"
                          disabled={isOptimizing}
                          onClick={async () => {
                            setIsOptimizing(true);
                            const tableCount = Object.keys(healthReport?.tables || {}).length || 1;
                            setOptimizeProgress({
                              status: 'processing',
                              currentTable: 'Başlatılıyor...',
                              tablesProcessed: 0,
                              totalTables: tableCount,
                              orphansDeleted: 0,
                              duplicatesDeleted: 0,
                              metadataFixed: 0,
                              message: 'Veri optimizasyonu başlatıldı'
                            });

                            try {
                              const response = await fetchWithAuth('/api/data-health/optimize?dry_run=false', {
                                method: 'POST',
                              });
                              if (response.ok) {
                                const result = await response.json();
                                setOptimizeProgress({
                                  status: 'completed',
                                  currentTable: '',
                                  tablesProcessed: result.tables_processed?.length || tableCount,
                                  totalTables: result.tables_processed?.length || tableCount,
                                  orphansDeleted: result.orphans_deleted || 0,
                                  duplicatesDeleted: result.duplicates_deleted || 0,
                                  metadataFixed: result.metadata_fixed || 0,
                                  message: ''
                                });
                                fetchHealthReport();
                                fetchAvailableTables();
                                toast({
                                  title: 'Başarılı',
                                  description: 'Veri optimizasyonu tamamlandı',
                                });
                              } else {
                                throw new Error('Optimizasyon başarısız');
                              }
                            } catch (error) {
                              setOptimizeProgress(prev => ({
                                ...prev,
                                status: 'error',
                                message: 'Optimizasyon sırasında hata oluştu'
                              }));
                              toast({
                                title: 'Hata',
                                description: 'Optimizasyon sırasında bir hata oluştu.',
                                variant: 'destructive',
                              });
                            } finally {
                              setIsOptimizing(false);
                            }
                          }}
                        >
                          Optimize Et
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Embedding Model - Read from DB Settings */}
                <div className="p-3 bg-gray-50 dark:bg-gray-950/50 border border-gray-200 dark:border-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-gray-900 dark:text-gray-100">
                        {embeddingProvider}/{embeddingModel}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                        {embeddingDimension}d
                      </Badge>
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
                      <Button variant="outline" className="w-full" onClick={async () => {
                        await fetchWithAuth(`${API_MIGRATION}/pause`, { method: 'POST' });
                        toast({ title: "Paused", description: "Migration paused" });
                      }}>
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </Button>
                      <Button variant="destructive" className="w-full" onClick={stopMigration}>
                        <Square className="w-4 h-4 mr-2" />
                        Stop
                      </Button>
                    </div>
                  ) : progress?.status === 'paused' ? (
                    <div className="space-y-2">
                      <Button variant="default" className="w-full" onClick={async () => {
                        await fetchWithAuth(`${API_MIGRATION}/resume`, { method: 'POST' });
                        toast({ title: "Resumed", description: "Migration resumed" });
                      }}>
                        <Play className="w-4 h-4 mr-2" />
                        Resume
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

          {/* Right Column - Tables */}
          <div className="lg:col-span-2 space-y-2">
            {/* Search, Filter and Stats */}
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
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {availableTables.length} tables
                  </span>
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
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-48">Progress</TableHead>
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

                          {/* Combined Progress column: embedded/total + progress bar + skipped */}
                          <TableCell>
                            <div className="space-y-1">
                              {/* Progress counts: embedded / total */}
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-medium text-green-600 dark:text-green-500">
                                  {table.embeddedRecords.toLocaleString()}
                                </span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-muted-foreground">
                                  {table.totalRecords.toLocaleString()}
                                </span>
                                {skipped > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fetchSkippedRecords(table.name);
                                    }}
                                    className="ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
                                    title="View skipped records"
                                  >
                                    {skipped} skipped
                                  </button>
                                )}
                                {isCompleted && (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-500 ml-auto" />
                                )}
                              </div>
                              {/* Progress bar */}
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                  className={cn(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    isCompleted ? "bg-green-500" : "bg-blue-600"
                                  )}
                                  style={{ width: `${tableProgress}%` }}
                                />
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

              {/* Selection Footer - Shows when rows selected */}
              {selectedTableRows.size > 0 && (
                <div className="border-t border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 rounded-b-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        {selectedTableRows.size} table(s) selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const tablesToAdd = Array.from(selectedTableRows);
                          setSelectedTables(prev => {
                            const newSet = new Set([...prev, ...tablesToAdd]);
                            return Array.from(newSet);
                          });
                          setSelectedTableRows(new Set());
                          toast({
                            title: 'Kuyruğa Eklendi',
                            description: `${tablesToAdd.length} tablo migration kuyruğuna eklendi. Sol panelden başlatabilirsiniz.`,
                          });
                        }}
                        className="h-7 text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Kuyruğa Ekle
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={runHealthCheck}
                        disabled={isHealthChecking}
                        className="h-7 text-xs"
                      >
                        {isHealthChecking ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            %{healthProgress.toFixed(0)}
                          </>
                        ) : (
                          'Veri Sağlığı'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedTableRows(new Set())}
                        className="h-7 text-xs text-muted-foreground"
                      >
                        Temizle
                      </Button>
                      <ConfirmTooltip
                        onConfirm={handleBulkDelete}
                        title="Seçili Tabloların Embeddinglerini Sil"
                        description={`${selectedTableRows.size} tablo için tüm embedding kayıtlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                          disabled={isBulkDeleting}
                        >
                          {isBulkDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </ConfirmTooltip>
                    </div>
                  </div>
                </div>
              )}
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

      {/* Embed Preview Modal - Minimal Design */}
      <Dialog open={showPreviewModal} onOpenChange={() => {
        setShowPreviewModal(false);
        setTablePreviewData([]);
        setSelectedTableForPreview(null);
        setPreviewOffset(0);
        setPreviewHasMore(true);
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
            <DialogTitle className="text-sm font-medium">
              Embed Preview
              {selectedTableForPreview && (
                <span className="ml-2 font-normal text-muted-foreground">
                  — {selectedTableForPreview}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Yükleniyor...</span>
              </div>
            ) : tablePreviewData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">Bu tablo için embed kaydı bulunamadı.</p>
                <p className="text-xs mt-1">Migration çalıştırarak embedding oluşturabilirsiniz.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tablePreviewData.map((record, idx) => (
                  <div
                    key={`${record.id}-${idx}`}
                    className="border rounded p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {record.source_name || record.title || `Kayıt #${record.source_id || record.id}`}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <span>ID: {record.source_id || record.id}</span>
                          {record.source_type && (
                            <>
                              <span>•</span>
                              <span>{record.source_type}</span>
                            </>
                          )}
                          {record.metadata?.tokens_used && (
                            <>
                              <span>•</span>
                              <span>{record.metadata.tokens_used} token</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-green-600 dark:text-green-500 whitespace-nowrap">
                        ✓ embedded
                      </span>
                    </div>

                    <div className="bg-muted/50 rounded p-2">
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed max-h-24 overflow-y-auto text-muted-foreground">
                        {record.content?.substring(0, 400)}{record.content?.length > 400 ? '...' : ''}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer with pagination */}
          {tablePreviewData.length > 0 && (
            <div className="px-4 py-3 border-t flex-shrink-0 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {tablePreviewData.length} kayıt gösteriliyor
              </span>
              {previewHasMore && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (selectedTableForPreview) {
                      fetchTablePreview(selectedTableForPreview.toLowerCase(), previewOffset, true);
                    }
                  }}
                  disabled={isLoadingMorePreview}
                  className="h-7 text-xs"
                >
                  {isLoadingMorePreview ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      Yükleniyor...
                    </>
                  ) : (
                    'Daha Fazla Yükle'
                  )}
                </Button>
              )}
            </div>
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
          {/* Minimal Header */}
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <DialogTitle className="text-sm font-medium">
              Skipped Records
              {selectedTableForSkipped && (
                <span className="ml-2 font-normal text-muted-foreground">
                  — {selectedTableForSkipped}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

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
                      key={`${record.id}-${index}`}
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

          {/* Footer with pagination and actions */}
          {(skippedRecords.length > 0 || skippedTotalCount > 0) && (
            <div className="px-6 py-3 border-t flex-shrink-0 flex items-center justify-between">
              {/* Left: Count info */}
              <span className="text-xs text-muted-foreground">
                {selectedSkippedIds.size > 0 ? (
                  <span className="font-medium">{selectedSkippedIds.size} selected</span>
                ) : (
                  <span>{skippedTotalCount > SKIPPED_PAGE_SIZE ? `${skippedTotalCount.toLocaleString()} total` : `${skippedRecords.length}`}</span>
                )}
              </span>

              {/* Center: Pagination */}
              {skippedTotalCount > SKIPPED_PAGE_SIZE && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => selectedTableForSkipped && fetchSkippedRecords(selectedTableForSkipped, skippedPage - 1)}
                    disabled={skippedPage <= 1 || isLoadingSkipped}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[80px] text-center">
                    {skippedPage} / {Math.ceil(skippedTotalCount / SKIPPED_PAGE_SIZE)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => selectedTableForSkipped && fetchSkippedRecords(selectedTableForSkipped, skippedPage + 1)}
                    disabled={skippedPage >= Math.ceil(skippedTotalCount / SKIPPED_PAGE_SIZE) || isLoadingSkipped}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Right: Actions */}
              <div className="flex items-center gap-1">
                {/* Delete All button - always visible */}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={deleteAllSkippedRecords}
                  disabled={isDeletingSkipped || skippedTotalCount === 0}
                  className="h-7 px-2 text-xs hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                  title={`Delete all ${skippedTotalCount.toLocaleString()} records`}
                >
                  {isDeletingSkipped ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1" />
                  )}
                  Delete All
                </Button>
                {/* Selected actions */}
                {selectedSkippedIds.size > 0 && (
                  <>
                    <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={reembedSkippedRecords}
                      disabled={isReembedding}
                      className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-600"
                      title="Re-embed selected"
                    >
                      {isReembedding ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={deleteSkippedRecords}
                      disabled={isDeletingSkipped}
                      className="h-7 w-7 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                      title="Delete selected"
                    >
                      {isDeletingSkipped ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </>
                )}
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