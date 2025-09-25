'use client';

import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import EmbeddingStats from '@/components/EmbeddingStats';
import VerticalProgressDisplay from '@/components/VerticalProgressDisplay';
import {
  Database,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Search,
  Play,
  Pause,
  Loader2,
  Settings,
  AlertTriangle,
  X,
  RotateCcw,
  ChevronDown,
  Circle,
  Eye
} from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TableInfo {
  name: string;
  displayName: string;
  database: string;
  totalRecords: number;
  embeddedRecords: number;
}

interface RecentRecord {
  [key: string]: any;
  isEmbedded: boolean;
}

interface MigrationStats {
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  databaseName?: string;
}

interface EmbeddingProgress {
  status: string;
  current: number;
  total: number;
  percentage: number;
  currentTable: string | null;
  error: string | null;
  tokensUsed?: number;
  tokensThisSession?: number;
  estimatedTotalTokens?: number;
  estimatedCost?: number;
  startTime?: number;
  estimatedTimeRemaining?: number;
  newlyEmbedded?: number;
  errorCount?: number;
  processingSpeed?: number;
  fallbackMode?: boolean;
  fallbackReason?: string;
  mightBeStuck?: boolean;
}

// Helper function to extract content preview from any record structure
function getContentPreview(record: any): string {
  if (!record) return '-';

  // Common field names for content, ordered by priority
  const contentFields = [
    'content', 'text', 'icerik', 'içerik', 'description', 'body',
    'message', 'baslik', 'title', 'question', 'soru', 'cevap', 'answer',
    'name', 'adi', 'ad', 'subject', 'konu', 'summary', 'ozet'
  ];

  // Try to find a suitable field
  for (const field of contentFields) {
    if (record[field] && typeof record[field] === 'string' && record[field].trim().length > 0) {
      return record[field].trim();
    }
  }

  // If no standard content field found, look for any string field that's not an id or metadata
  const excludedFields = ['id', 'created_at', 'updated_at', 'embedding', 'vector', 'metadata', 'isEmbedded'];
  const otherFields = Object.keys(record).filter(key =>
    !excludedFields.includes(key.toLowerCase()) &&
    typeof record[key] === 'string' &&
    record[key].trim().length > 0
  );

  if (otherFields.length > 0) {
    return record[otherFields[0]].trim();
  }

  // As a last resort, convert the first non-excluded field to string
  const otherNonStringFields = Object.keys(record).filter(key =>
    !excludedFields.includes(key.toLowerCase()) &&
    record[key] !== null &&
    record[key] !== undefined
  );

  if (otherNonStringFields.length > 0) {
    return String(record[otherNonStringFields[0]]);
  }

  return '-';
}

export default function EmbeddingsManagerPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [migrationStats, setMigrationStats] = useState<MigrationStats | null>(null);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [progressUpdateCount, setProgressUpdateCount] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isStartingMigration, setIsStartingMigration] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [embeddingStats, setEmbeddingStats] = useState<any>(null);
  const [batchSize, setBatchSize] = useState(100);
  const [workerCount, setWorkerCount] = useState(2);
  const [embeddingMethod, setEmbeddingMethod] = useState('google-text-embedding-004');
  const [currentEmbeddingMethod, setCurrentEmbeddingMethod] = useState<string | null>(null);
  const [currentBatchSize, setCurrentBatchSize] = useState<number | null>(null);
  const [currentWorkerCount, setCurrentWorkerCount] = useState<number | null>(null);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [displayProgress, setDisplayProgress] = useState<EmbeddingProgress | null>(null);
  const [migrationTables, setMigrationTables] = useState<string[]>([]);
  const [embeddingHistory, setEmbeddingHistory] = useState<any[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [recentRecords, setRecentRecords] = useState<{ [tableName: string]: RecentRecord[] }>({});
  const [loadingRecentRecords, setLoadingRecentRecords] = useState<Set<string>>(new Set());
  const [previewContent, setPreviewContent] = useState<{ title: string; content: string } | null>(null);
  const [showCleanupAlert, setShowCleanupAlert] = useState(false);
  const [cleanupIssues, setCleanupIssues] = useState<any[]>([]);
  const [cleanupRecommendations, setCleanupRecommendations] = useState<string[]>([]);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const { toast } = useToast();
  const userPausedRef = useRef(false);
  const lastAutoResumeRef = useRef(0); // Track last auto-resume timestamp
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverMessage, setRecoverMessage] = useState('');

  // Load saved settings from localStorage
  useEffect(() => {
    const savedBatchSize = localStorage.getItem('embeddingBatchSize');
    const savedWorkerCount = localStorage.getItem('embeddingWorkerCount');
    const savedEmbeddingMethod = localStorage.getItem('embeddingEmbeddingMethod');

    if (savedBatchSize) {
      setBatchSize(parseInt(savedBatchSize));
    }
    if (savedWorkerCount) {
      setWorkerCount(parseInt(savedWorkerCount));
    }
    if (savedEmbeddingMethod) {
      setEmbeddingMethod(savedEmbeddingMethod);
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('embeddingBatchSize', batchSize.toString());
  }, [batchSize]);

  useEffect(() => {
    localStorage.setItem('embeddingWorkerCount', workerCount.toString());
  }, [workerCount]);

  useEffect(() => {
    localStorage.setItem('embeddingEmbeddingMethod', embeddingMethod);
  }, [embeddingMethod]);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL + '/api/v2/embeddings';

  // Check and recover from stuck process
  const checkAndRecoverStuckProcess = async () => {
    if (!progress || progress.status !== 'processing') return;

    // Check if we're in cooldown period (5 minutes since last auto-resume)
    const now = Date.now();
    if (now - lastAutoResumeRef.current < 300000) { // 5 minutes cooldown
      console.log('Skipping stuck check - in cooldown period');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/recover`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();

        if (data.action === 'paused') {
          // Process was stuck and has been paused
          console.log('Process was stuck, pausing and will auto-resume...');

          // Check if progress data is valid (total should not be 0)
          if (data.progress?.total === 0) {
            console.warn('Invalid progress data detected (total: 0), skipping auto-resume');
            toast({
              title: "Hata",
              description: "İşlem verileri hatalı. Lütfen işlemi yeniden başlatın.",
              variant: "destructive",
            });
            return;
          }

          toast({
            title: "İşlem Duraklatıldı",
            description: "Embedding işlemi aktif değil olduğu için otomatik olarak duraklatıldı. Otomatik devam ediliyor...",
            variant: "default",
          });

          // Update progress to reflect paused state
          setProgress(data.progress);
          setDisplayProgress(data.progress);

          // Auto-resume after a short delay
          setTimeout(async () => {
            try {
              const resumeResponse = await fetch(`${API_BASE}/resume`, {
                method: 'POST'
              });

              if (resumeResponse.ok) {
                lastAutoResumeRef.current = Date.now(); // Update last auto-resume timestamp
                toast({
                  title: "Otomatik Devam Edildi",
                  description: "Embedding işlemi otomatik olarak devam ettirildi.",
                  variant: "default",
                });
              }
            } catch (error) {
              console.error('Auto-resume failed:', error);
              toast({
                title: "Otomatik Devam Başarısız",
                description: "İşlemi manuel olarak devam ettirmeniz gerekebilir.",
                variant: "destructive",
              });
            }
          }, 5000); // Wait 5 seconds before resuming (increased from 2)
        }
      }
    } catch (error) {
      console.error('Error checking stuck process:', error);
    }
  };

  // Fetch recent records for a table
  const fetchRecentRecords = async (tableName: string) => {
    setLoadingRecentRecords(prev => new Set(prev).add(tableName));
    try {
      const response = await fetch(`${API_BASE}/table/${tableName}/details`);
      if (response.ok) {
        const data = await response.json();
        console.log('Recent records data for', tableName, ':', data.recentRecords?.[0]);
        setRecentRecords(prev => ({
          ...prev,
          [tableName]: data.recentRecords || []
        }));
      }
    } catch (error) {
      console.error('Failed to fetch recent records:', error);
    } finally {
      setLoadingRecentRecords(prev => {
        const newSet = new Set(prev);
        newSet.delete(tableName);
        return newSet;
      });
    }
  };

  // Fetch embedded records for a table
  const fetchEmbeddedRecords = async (tableName: string) => {
    setLoadingRecentRecords(prev => new Set(prev).add(tableName));
    try {
      const response = await fetch(`${API_BASE}/table/${tableName}/embedded-recent`);
      if (response.ok) {
        const data = await response.json();
        console.log('Embedded records data for', tableName, ':', data.embeddedRecords?.[0]);
        setRecentRecords(prev => ({
          ...prev,
          [tableName]: data.embeddedRecords || []
        }));
      }
    } catch (error) {
      console.error('Failed to fetch embedded records:', error);
    } finally {
      setLoadingRecentRecords(prev => {
        const newSet = new Set(prev);
        newSet.delete(tableName);
        return newSet;
      });
    }
  };

  // Refresh recent records for a table
  const refreshRecentRecords = async (tableName: string) => {
    // Clear cached records first
    setRecentRecords(prev => {
      const newRecords = { ...prev };
      delete newRecords[tableName];
      return newRecords;
    });
    // Fetch fresh embedded records
    await fetchEmbeddedRecords(tableName);
  };

  // Toggle table expansion
  const toggleTableExpansion = (tableName: string) => {
    setExpandedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
        // Fetch embedded records if not already loaded
        if (!recentRecords[tableName]) {
          fetchEmbeddedRecords(tableName);
        }
      }
      return newSet;
    });
  };

  // Initial consistency check when component mounts
  useEffect(() => {
    const checkConsistency = async () => {
      try {
        console.log('🔍 Running initial consistency check...');
        const response = await fetch(`${API_BASE}/check-consistency`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Consistency check result:', data);

          if (data.status === 'needs_cleanup') {
            setShowCleanupAlert(true);
            setCleanupIssues(data.issues || []);
            setCleanupRecommendations(data.recommendations || []);
            toast({
              title: "Embedding System Issues Detected",
              description: "Some inconsistencies were found. Consider running cleanup.",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error('Consistency check failed:', error);
      }
    };

    checkConsistency();

    // Component cleanup - ensure state is properly reset when component unmounts
    return () => {
      // Clean up any pending state
      cleanupMigrationState();
    };
  }, []);

  // Direct progress update without smoothing for immediate feedback
  useEffect(() => {
    if (!progress) {
      setDisplayProgress(null);
      return;
    }

    // Fix total value if it's 0 but tableProgress has values
    const fixedProgress = { ...progress };
    if (progress.total === 0 && progress.tableProgress && progress.currentTable) {
      const tableInfo = progress.tableProgress[progress.currentTable];
      if (tableInfo && tableInfo.total > 0) {
        fixedProgress.total = tableInfo.total;
      }
    }

    // Update display progress directly for immediate UI feedback
    setDisplayProgress(fixedProgress);
  }, [progress]);

  const fetchAvailableTablesAndStats = async () => {
    setIsLoadingTables(true);
    try {
      const response = await fetch(`${API_BASE}/tables-fixed?t=${Date.now()}&force=${Math.random()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableTables(data.tables || []);
        const totalRecords = data.tables.reduce((acc: number, t: TableInfo) => acc + t.totalRecords, 0);
        const embeddedRecords = data.tables.reduce((acc: number, t: TableInfo) => acc + t.embeddedRecords, 0);

        // Debug: Log the actual values from backend
        console.log('DEBUG Frontend - Tables data:', data.tables);
        console.log('DEBUG Frontend - Calculated totalRecords:', totalRecords);
        console.log('DEBUG Frontend - Calculated embeddedRecords:', embeddedRecords);

        setMigrationStats({
            totalRecords,
            embeddedRecords,
            pendingRecords: totalRecords - embeddedRecords,
            databaseName: data.databaseName,
        });

        // Fetch embedding statistics
        try {
          const statsResponse = await fetch(`${API_BASE}/stats`);
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            setEmbeddingStats(statsData);
          }
        } catch (statsError) {
          console.error('Failed to fetch embedding stats:', statsError);
        }

        // Fetch embedding history
        try {
          const historyResponse = await fetch('/api/embedding-history?limit=100');
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            setEmbeddingHistory(historyData.history || []);
          }
        } catch (historyError) {
          console.error('Error fetching embedding history:', historyError);
        }
      } else {
        setError('Failed to fetch tables.');
      }
    } catch (error) {
      setError('Could not connect to the server to fetch tables.');
    } finally {
      setIsLoadingTables(false);
    }
  };

  // Cleanup function to reset all migration-related state
  const cleanupMigrationState = () => {
    setProgress(null);
    setDisplayProgress(null);
    setSelectedTables([]);
    setMigrationTables([]);
    setCurrentEmbeddingMethod(null);
    setCurrentBatchSize(null);
    setCurrentWorkerCount(null);
    setProgressUpdateCount(0);
    // Note: Not refreshing tables here to avoid unnecessary API calls
  };

  // Run embedding system cleanup
  const runCleanup = async () => {
    if (!confirm('Are you sure you want to run cleanup? This will clear all progress data.')) {
      return;
    }

    setIsCleaningUp(true);
    try {
      const response = await fetch(`${API_BASE}/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Cleanup result:', data);

        // Reset state after cleanup
        cleanupMigrationState();
        setShowCleanupAlert(false);
        setCleanupIssues([]);
        setCleanupRecommendations([]);

        // Refresh tables
        await fetchAvailableTablesAndStats();

        toast({
          title: "Cleanup Completed",
          description: "Embedding system has been cleaned up successfully.",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Cleanup Failed",
          description: errorData.error || 'Failed to run cleanup.',
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      toast({
        title: "Cleanup Error",
        description: "Failed to run cleanup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  const resetMigration = async () => {
    try {
      const response = await fetch(`${API_BASE}/reset`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to reset migration.');
        toast({
          title: "Hata",
          description: errorData.error || 'Migration sıfırlanamadı.',
          variant: "destructive",
        });
      } else {
        // Clear frontend state
        cleanupMigrationState();
        setProgress(null);
        setDisplayProgress(null);

        toast({
          title: "Sıfırlandı",
          description: "Migration durumu tamamen sıfırlandı.",
        });
      }
    } catch (error) {
      setError('An error occurred while resetting the migration.');
      toast({
        title: "Hata",
        description: "Migration sıfırlanırken bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  // Custom hook for SSE progress updates
  const useProgressStream = () => {
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    useEffect(() => {
      // Only connect if there's an active process AND no existing connection
      if ((progress?.status === 'processing' || progress?.status === 'paused') && !eventSourceRef.current) {
        console.log('🔌 Opening SSE connection...');
        const eventSource = new EventSource(process.env.NEXT_PUBLIC_API_URL + '/api/v2/embeddings/progress/stream');
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          console.log('📡 SSE connection established');
          reconnectAttemptsRef.current = 0; // Reset reconnection attempts
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📡 SSE Progress update:', data);

            // Handle connection confirmation
            if (data.status === 'connected') {
              console.log('SSE connection confirmed');
              return;
            }

            // Handle fallback mode indicator
            if (data.fallback) {
              console.warn('SSE in fallback mode:', data.error);
              return;
            }

            if (data.status && data.status !== 'idle') {
              // Update progress immediately for real-time UI updates
              setProgress(data);
              // Also update display progress directly
              setDisplayProgress(data);

              // Update progress and potentially refresh tables
              if (data.status === 'processing') {
                const newCount = progressUpdateCount + 1;
                setProgressUpdateCount(newCount);
              }

              if (data.status === 'completed' || data.status === 'error') {
                console.log('🔄 Process completed');
                setProgressUpdateCount(0);

                // Show completion notification
                if (data.status === 'completed') {
                  toast({
                    title: "Completed",
                    description: `Embedding process completed successfully. ${data.current || 0} records processed.`,
                  });

                  // Refresh tables and stats after completion
                  fetchAvailableTablesAndStats();

                  // Keep progress visible for 5 seconds after completion
                  setTimeout(() => {
                    setProgress(null);
                    setDisplayProgress(null);
                  }, 5000);
                } else if (data.status === 'error' && data.error) {
                  toast({
                    title: "Error Occurred",
                    description: `Embedding process failed: ${data.error}`,
                    variant: "destructive",
                  });
                  // Keep progress visible for 5 seconds after error
                  setTimeout(() => {
                    setProgress(null);
                    setDisplayProgress(null);
                  }, 5000);
                }
              }
            }
          } catch (error) {
            console.error('Error parsing SSE message:', error, event.data);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          // Close the current connection
          eventSource.close();
          eventSourceRef.current = null;

          // Try to reconnect if still processing and haven't exceeded max attempts
          if ((progress?.status === 'processing' || progress?.status === 'paused') &&
              reconnectAttemptsRef.current < maxReconnectAttempts) {

            reconnectAttemptsRef.current++;
            console.log(`Attempting to reconnect SSE... Attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);

            setTimeout(() => {
              if ((progress?.status === 'processing' || progress?.status === 'paused') &&
                  !eventSourceRef.current) {
                try {
                  const newEventSource = new EventSource(process.env.NEXT_PUBLIC_API_URL + '/api/v2/embeddings/progress/stream');
                  eventSourceRef.current = newEventSource;

                  newEventSource.onopen = eventSource.onopen;
                  newEventSource.onmessage = eventSource.onmessage;
                  newEventSource.onerror = eventSource.onerror;
                } catch (reconnectError) {
                  console.error('Failed to create new EventSource:', reconnectError);
                  eventSourceRef.current = null;
                }
              }
            }, reconnectDelay * reconnectAttemptsRef.current); // Exponential backoff
          } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.warn('Max SSE reconnection attempts reached, switching to polling mode');
            // Fallback to polling mode will be handled by the existing polling useEffect
          }
        };

        return () => {
          console.log('🔌 Closing SSE connection...');
          eventSource.close();
          eventSourceRef.current = null;
        };
      }
    }, [progress?.status, progressUpdateCount]);
  };

  // Use the SSE hook
  useProgressStream();

  // Additional effect to check for active processes and update progress
  useEffect(() => {
    const checkForActiveProcess = async () => {
      try {
        const response = await fetch(`${API_BASE}/progress`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'processing' || data.status === 'paused') {
            console.log('Found active process, updating progress:', JSON.stringify(data, null, 2));
            setProgress(data);
            setDisplayProgress(data);
          }
        }
      } catch (error) {
        console.error('Error checking for active process:', error);
      }
    };

    // Check immediately and then periodically
    checkForActiveProcess();
    const interval = setInterval(checkForActiveProcess, 5000);

    return () => clearInterval(interval);
  }, []);

  // Effect to update selected tables when progress is active
  useEffect(() => {
    if (progress?.status === 'processing' || progress?.status === 'paused') {
      // Get tables from progress data
      const tablesFromProgress = progress.tables || [];
      if (tablesFromProgress.length > 0) {
        console.log('Updating selected tables from progress:', tablesFromProgress);
        setSelectedTables(tablesFromProgress);
        setMigrationTables(tablesFromProgress);
      } else if (progress.currentTable) {
        // Fallback to currentTable if tables array is empty
        console.log('Updating selected tables from currentTable:', [progress.currentTable]);
        setSelectedTables([progress.currentTable]);
        setMigrationTables([progress.currentTable]);
      }
    }
  }, [progress?.status, progress?.tables, progress?.currentTable]);

  // Auto-recovery effect for paused processes
  useEffect(() => {
    if (progress?.status === 'paused' && !userPausedRef.current) {
      console.log('🔄 Auto-recovering paused process...');

      // Show recovering state
      setIsRecovering(true);
      setRecoverMessage('Sistem kontrol ediliyor...');

      // Attempt to recover after a short delay
      const recoverTimer = setTimeout(async () => {
        try {
          setRecoverMessage('Otomatik devam ettiriliyor...');
          const response = await fetch(`${API_BASE}/recover`, { method: 'POST' });
          const data = await response.json();

          if (data.success && data.action === 'paused') {
            // Show notification that process was paused due to inactivity
            toast({
              title: "Otomatik Duraklatma",
              description: "İşlem aktivite olmaması nedeniyle duraklatıldı. Devam etmek için butona basın.",
              duration: 5000,
            });
            setIsRecovering(false);
            setRecoverMessage('');
          } else if (data.success && data.action === 'resumed') {
            // Successfully resumed
            toast({
              title: "Otomatik Devam Etme",
              description: "İşlem otomatik olarak devam ettiriliyor.",
              duration: 3000,
            });
            setIsRecovering(false);
            setRecoverMessage('');
          }
        } catch (error) {
          console.error('Auto-recovery failed:', error);
          // Reset UI state on error
          setIsRecovering(false);
          setRecoverMessage('');
        } finally {
          // Always reset UI state after attempt
          setIsRecovering(false);
          setRecoverMessage('');
        }
      }, 5000); // Increased delay to prevent rapid loops

      return () => clearTimeout(recoverTimer);
    }
  }, [progress?.status]);

  // Reset recovering state when status changes
  useEffect(() => {
    if (progress?.status === 'processing' || progress?.status === 'error') {
      setIsRecovering(false);
      setRecoverMessage('');
    }
  }, [progress?.status]);

  useEffect(() => {
    fetchAvailableTablesAndStats();

    // Initial progress check
    const checkInitialProgress = async () => {
      try {
        const response = await fetch(`${API_BASE}/progress`);
        if (response.ok) {
          const data = await response.json();
          console.log('Initial progress check:', data);
          if (data.status && data.status !== 'idle') {
            setProgress(data);
            setDisplayProgress(data);
            // If there's an active migration (processing or paused), restore the selected tables
            if (data.status === 'processing' || data.status === 'paused') {
              // Use currentTable first, then fallback to tables/processedTables
              let tablesToRestore: string[] = [];
              if (data.currentTable) {
                tablesToRestore = [data.currentTable];
              } else {
                tablesToRestore = data.tables || data.processedTables || [];
              }
              console.log('Restoring tables for active migration:', tablesToRestore);
              if (tablesToRestore.length > 0) {
                setSelectedTables(tablesToRestore);
                setMigrationTables(tablesToRestore);
              }

              // Restore worker count if available
              if (data.workerCount) {
                setCurrentWorkerCount(data.workerCount);
                setWorkerCount(data.workerCount);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking initial progress:', error);
      }
    };

    checkInitialProgress();
  }, []);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    const eventSourceExists = false;

    // Check if EventSource is available and if we should use SSE
    const shouldUseSSE = typeof EventSource !== 'undefined' &&
                        (progress?.status === 'processing' || progress?.status === 'paused');

    // Only use polling if SSE is not available or has failed
    const shouldUsePolling = !shouldUseSSE || eventSourceExists;

    const pollProgress = async () => {
      try {
        const response = await fetch(`${API_BASE}/progress`);
        if (response.ok) {
          const data = await response.json();
          console.log('🔄 Progress update (polling):', data);

          if (data.status && data.status !== 'idle') {
            // Update progress immediately for real-time UI updates
            setProgress(data);

            // Check for quota exceeded error, which now pauses the process
            if ((data.status === 'paused' || data.status === 'error') && data.error &&
                (data.error.includes('OpenAI API kotası aşıldı') ||
                 data.error.includes('You exceeded your current quota') ||
                 data.error.includes('insufficient_quota'))) {
              toast({
                title: "OpenAI Quota Exceeded",
                description: "Process paused. Please check your OpenAI billing and continue.",
                variant: "destructive",
              });
            }

            // Update progress and potentially refresh tables
            if (data.status === 'processing') {
              const newCount = progressUpdateCount + 1;
              setProgressUpdateCount(newCount);
            }

            if (data.status === 'completed' || data.status === 'error') {
              console.log('🔄 Process completed (polling)');
              setProgressUpdateCount(0);

              // Show completion notification
              if (data.status === 'completed') {
                toast({
                  title: "Completed",
                  description: `Embedding process completed successfully. ${data.current || 0} records processed.`,
                });

                // Refresh tables and stats after completion
                fetchAvailableTablesAndStats();

                // Keep progress visible for 5 seconds after completion
                setTimeout(() => {
                  setProgress(null);
                  setDisplayProgress(null);
                }, 5000);
              } else if (data.status === 'error' && data.error) {
                toast({
                  title: "Error Occurred",
                  description: `Embedding process failed: ${data.error}`,
                  variant: "destructive",
                });
                // Keep progress visible for 5 seconds after error
                setTimeout(() => {
                  setProgress(null);
                  setDisplayProgress(null);
                }, 5000);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    };

    // Only poll if there's an active process AND SSE is not the primary method
    if (shouldUsePolling && (progress?.status === 'processing' || progress?.status === 'paused')) {
      console.log('🔄 Using polling for progress updates...');
      // Initial check
      pollProgress();

      // Start polling less frequently since SSE is preferred
      pollInterval = setInterval(pollProgress, 2000); // Poll every 2 seconds as fallback
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [progress?.status, progressUpdateCount]);

  // Effect to monitor for stuck processes
  useEffect(() => {
    let stuckCheckInterval: NodeJS.Timeout;

    if (progress?.status === 'processing' && progress.mightBeStuck) {
      // Check more frequently when process might be stuck
      stuckCheckInterval = setInterval(async () => {
        await checkAndRecoverStuckProcess();
      }, 60000); // Check every 60 seconds when might be stuck
    } else if (progress?.status === 'processing') {
      // Regular check when processing - make it less frequent to avoid rapid cycles
      stuckCheckInterval = setInterval(async () => {
        await checkAndRecoverStuckProcess();
      }, 120000); // Check every 2 minutes (matching backend threshold)
    }

    return () => {
      if (stuckCheckInterval) {
        clearInterval(stuckCheckInterval);
      }
    };
  }, [progress?.status, progress?.mightBeStuck]);

  const startMigration = async (resume = false) => {
    console.log('Starting migration:', { resume, selectedTables, migrationTables });
    userPausedRef.current = false; // Reset user pause flag when starting migration
    if (selectedTables.length === 0 && !resume) {
        setError('Please select at least one table.');
        toast({
          title: "Hata",
          description: "Lütfen en az bir tablo seçin.",
          variant: "destructive",
        });
        return;
    }

    // If resuming, use migrationTables instead of selectedTables
    const tablesToUse = resume ? migrationTables : selectedTables;
    console.log('Tables to use:', tablesToUse);
    setError('');
    setSuccess('');
    setIsStartingMigration(true);

    // Save current settings when starting or resuming migration
    setCurrentEmbeddingMethod(embeddingMethod);
    setCurrentBatchSize(batchSize);
    setCurrentWorkerCount(workerCount);
    setMigrationTables(tablesToUse);

    try {
      const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: tablesToUse,
          batchSize,
          workerCount,
          resume,
          options: { embeddingMethod }
        })
      });
      if (!response.ok) {
        if (response.status === 401) {
          toast({
            title: "Geçersiz API Anahtarı",
            description: "Lütfen ayarlar'dan OpenAI API anahtarınızı güncelleyin.",
            variant: "destructive",
          });
          setError('Invalid API Key. Please update your OpenAI API key in settings.');
        } else {
          const errorData = await response.json();
          const errorMessage = errorData.error || 'Failed to start migration.';
          setError(errorMessage);

          // Detailed error messages
          let detailedMessage = errorMessage;
          if (errorMessage.includes('HuggingFace API key')) {
            detailedMessage = "HuggingFace API key not found. Please add it in settings.";
          } else if (errorMessage.includes('Invalid credentials')) {
            detailedMessage = "HuggingFace API key is invalid. Please check it.";
          } else if (errorMessage.includes('quota')) {
            detailedMessage = "API quota exceeded. Please check your billing.";
          }

          toast({
            title: "Error",
            description: detailedMessage,
            variant: "destructive",
          });
        }
      } else {
        const data = await response.json();

        // Embedder bilgisini al
        const embedderInfo = data.progress?.embeddingSettings
          ? `${data.progress.embeddingSettings.provider} (${data.progress.embeddingSettings.model})`
          : currentEmbeddingMethod || 'Seçili Embedder';

        // Start toast
        toast({
          title: resume ? "Resuming" : "Started",
          description: resume
            ? `Embedding process is being resumed. (${embedderInfo})`
            : `Embedding process is starting... (${embedderInfo})`,
        });

        // Backend'den gelen progress durumunu ayarla
        if (data.progress) {
          setProgress(data.progress);
          setDisplayProgress(data.progress);
        } else {
          // Eğer progress yoksa, manuel olarak ayarla
          const newProgress = {
            status: 'processing',
            current: 0,
            total: 100, // Varsayılan değer
            percentage: 0,
            currentTable: selectedTables[0],
            error: null,
            tokensUsed: 0,
            tokensThisSession: 0,
            estimatedTotalTokens: 0,
            estimatedCost: 0,
            startTime: Date.now(),
            estimatedTimeRemaining: null,
            processedTables: [],
            currentBatch: 0,
            totalBatches: 0,
            migrationId: data.migrationId,
            newlyEmbedded: 0,
            tables: selectedTables,
            embeddingSettings: { provider: 'huggingface', model: 'intfloat/multilingual-e5-small' }
          };
          setProgress(newProgress);
          setDisplayProgress(newProgress);
        }
      }
    } catch (error) {
      setError('An error occurred while starting the migration.');
      toast({
        title: "Hata",
        description: "Migration başlatılırken bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setIsStartingMigration(false);
    }
  };

  const abortMigration = async () => {
    try {
      // If migration is processing, try to stop it first
      if (progress?.status === 'processing') {
        const stopResponse = await fetch(`${API_BASE}/stop`, { method: 'POST' });
        // If stop fails with 400, it might already be paused, which is ok
        if (!stopResponse.ok && stopResponse.status !== 400) {
          throw new Error('Failed to stop migration');
        }
      }

      // Always clear the progress completely
      const clearResponse = await fetch(`${API_BASE}/clear`, { method: 'POST' });
      if (!clearResponse.ok) {
        throw new Error('Failed to clear migration progress');
      }

      // Clear frontend state
      cleanupMigrationState();

      // Manually set progress to null to ensure UI updates immediately
      setProgress(null);

      toast({
        title: "Cancelled",
        description: "Embedding process has been completely cancelled.",
      });

      // Note: Automatic table refresh disabled per user request
      // User will manually refresh tables when needed
    } catch (error) {
      console.error('Failed to abort migration:', error);
      toast({
        title: "Error",
        description: "Migration could not be cancelled.",
        variant: "destructive",
      });
    }
  };

  const pauseMigration = async () => {
    try {
      const response = await fetch(`${API_BASE}/pause`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to pause migration.');
        toast({
          title: "Error",
          description: errorData.error || 'Migration could not be paused.',
          variant: "destructive",
        });
      } else {
        userPausedRef.current = true; // Track that user manually paused
        toast({
          title: "Paused",
          description: "Embedding process has been paused.",
        });

        // Manually update progress status to update UI
        if (progress) {
          setProgress({
            ...progress,
            status: 'paused'
          });
        }
      }
    } catch (error) {
      setError('An error occurred while pausing the migration.');
      toast({
        title: "Error",
        description: "An error occurred while pausing the migration.",
        variant: "destructive",
      });
    }
  };

  const handleResume = async () => {
    try {
      const response = await fetch(`${API_BASE}/resume`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to resume migration.');
        toast({
          title: "Error",
          description: errorData.error || 'Migration could not be resumed.',
          variant: "destructive",
        });
      } else {
        userPausedRef.current = false; // Reset user pause flag
        toast({
          title: "Resumed",
          description: "Embedding process has been resumed.",
        });

        // The SSE connection will automatically reconnect when status changes to processing
        // through the useProgressStream hook's effect dependency on progress.status
      }
    } catch (error) {
      setError('An error occurred while resuming the migration.');
      toast({
        title: "Error",
        description: "An error occurred while resuming the migration.",
        variant: "destructive",
      });
    }
  };

  const stopMigration = async () => {
    try {
      const response = await fetch(`${API_BASE}/stop`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to stop migration.');
        toast({
          title: "Error",
          description: errorData.error || 'Migration could not be paused.',
          variant: "destructive",
        });
      } else {
        toast({
          title: "Stopped",
          description: "Embedding process has been completely stopped.",
        });

        // Clear progress status
        cleanupMigrationState();
        // Note: Automatic table refresh disabled per user request
      }
    } catch (error) {
      setError('An error occurred while stopping the migration.');
      toast({
        title: "Error",
        description: "An error occurred while pausing the migration.",
        variant: "destructive",
      });
    }
  };

  
  
  const searchEmbeddings = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 5 })
      });
      if (response.ok) {
        setSearchResults(await response.json());
      } else {
        setError('Search failed.');
      }
    } catch (error) {
      setError('An error occurred during search.');
    } finally {
      setIsSearching(false);
    }
  };

  const getCurrentTableInfo = () => availableTables.find(t => t.name === displayProgress?.currentTable);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">RAG & Embeddings Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Vector Database Operations</p>
        </div>
        <Link href="/dashboard/settings?tab=database"><Button variant="outline" size="sm"><Settings className="w-4 h-4 mr-2" />Database Settings</Button></Link>
      </div>

      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert><CheckCircle className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}

      {/* Cleanup Alert */}
      {showCleanupAlert && (
        <Alert variant="destructive" className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">Embedding System Issues Detected</p>
              <ul className="text-sm space-y-1">
                {cleanupIssues.map((issue, index) => (
                  <li key={index}>• {issue.message}</li>
                ))}
              </ul>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={runCleanup}
                  disabled={isCleaningUp}
                >
                  {isCleaningUp ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cleaning...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Run Cleanup
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCleanupAlert(false)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="overview">RAG Status</TabsTrigger>
          <TabsTrigger value="migration">Embedding Operations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="search">Test & Search</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
            {/* Summary Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Records</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{migrationStats?.totalRecords.toLocaleString('tr-TR') || '0'}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">Processed</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">{migrationStats?.embeddedRecords.toLocaleString('tr-TR') || '0'}</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Pending</p>
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{migrationStats?.pendingRecords.toLocaleString('tr-TR') || '0'}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Completed</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                        {migrationStats?.totalRecords > 0 ? Math.round((migrationStats.embeddedRecords / migrationStats.totalRecords) * 100) : 0}%
                    </p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">Estimated Cost</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-300">
                        ${(((migrationStats?.pendingRecords || 0) * 250) / 1000 * 0.0001).toFixed(2)}
                    </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-300 dark:border-gray-700">
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Database</p>
                    <p className="text-lg font-bold text-gray-700 dark:text-gray-300 truncate">
                        {migrationStats?.databaseName || 'rag_chatbot'}
                    </p>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Data Tables</CardTitle>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchAvailableTablesAndStats}
                            disabled={isLoadingTables}
                        >
                            {isLoadingTables ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            <span className="ml-2">Refresh</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const response = await fetch(`${API_BASE}/refresh-tables`, {
                                method: 'POST'
                              });
                              if (response.ok) {
                                toast({
                                  title: "Success",
                                  description: "Cache cleared. Tables will refresh.",
                                });
                                // Refresh after clearing cache
                                setTimeout(fetchAvailableTablesAndStats, 500);
                              }
                            } catch (error) {
                              toast({
                                title: "Error",
                                description: "Failed to clear cache",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Database className="h-4 w-4" />
                          <span className="ml-2">Clear Cache</span>
                        </Button>
                    </div>
                    {migrationStats?.databaseName && (
                        <CardDescription className="text-sm">
                            Database: {migrationStats.databaseName}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent>
                    {isLoadingTables ? <div className="text-center"><Loader2 className="h-8 w-8 animate-spin" /></div> :
                    <div className="space-y-4">
                        {availableTables.map(table => (
                            <div key={table.name} className="border rounded-lg p-4">
                                <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleTableExpansion(table.name)}>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{table.displayName}</span>
                                        <ChevronDown
                                            className={`h-4 w-4 transition-transform ${expandedTables.has(table.name) ? 'rotate-180' : ''}`}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">
                                            {table.embeddedRecords?.toLocaleString('tr-TR') || '0'} / {table.totalRecords?.toLocaleString('tr-TR') || '0'}
                                        </span>
                                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                                            {table.totalRecords > 0 ? Math.round((table.embeddedRecords / table.totalRecords) * 100) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <Progress value={(table.totalRecords > 0 ? (table.embeddedRecords / table.totalRecords) * 100 : 100)} className="h-2 mt-2" />

                                {/* Recent Records Section */}
                                {expandedTables.has(table.name) && (
                                    <div className="mt-4 pt-4 border-t">
                                        {loadingRecentRecords.has(table.name) ? (
                                            <div className="text-center py-8">
                                                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                                                <p className="text-sm text-muted-foreground">Loading embedded records...</p>
                                            </div>
                                        ) : recentRecords[table.name] && recentRecords[table.name].length > 0 ? (
                                            <div>
                                                <h4 className="text-sm font-medium mb-3">Recently Embedded Records (Last 20)</h4>
                                                <div className="border rounded-lg">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/50">
                                                                <TableHead className="w-16 text-xs font-medium text-muted-foreground">ID</TableHead>
                                                                <TableHead className="w-24 text-xs font-medium text-muted-foreground">Source ID</TableHead>
                                                                <TableHead className="text-xs font-medium text-muted-foreground">Created</TableHead>
                                                                <TableHead className="text-xs font-medium text-muted-foreground">Updated</TableHead>
                                                                <TableHead className="w-24 text-xs font-medium text-muted-foreground">Model</TableHead>
                                                                <TableHead className="w-20 text-xs font-medium text-muted-foreground">Tokens</TableHead>
                                                                <TableHead className="text-xs font-medium text-muted-foreground">Preview</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {recentRecords[table.name].slice(0, 20).map((record, index) => (
                                                                <TableRow key={record.id || record.source_id || index}>
                                                                    <TableCell className="text-sm font-mono">
                                                                        {record.id || '-'}
                                                                    </TableCell>
                                                                    <TableCell className="text-sm font-mono">
                                                                        {record.source_id || '-'}
                                                                    </TableCell>
                                                                    <TableCell className="text-xs text-muted-foreground">
                                                                        {record.created_at ? new Date(record.created_at).toLocaleDateString('tr-TR') : '-'}
                                                                    </TableCell>
                                                                    <TableCell className="text-xs text-muted-foreground">
                                                                        {record.updated_at ? new Date(record.updated_at).toLocaleDateString('tr-TR') : (record.created_at ? new Date(record.created_at).toLocaleDateString('tr-TR') : '-')}
                                                                    </TableCell>
                                                                    <TableCell className="text-xs text-muted-foreground font-mono">
                                                                        {record.model_used || record.model || 'text-embedding-004'}
                                                                    </TableCell>
                                                                    <TableCell className="text-xs text-muted-foreground">
                                                                        {record.tokens_used || record.tokens || record.metadata?.tokens || '-'}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-8 w-8 p-0"
                                                                            onClick={() => {
                                                                                setPreviewContent({
                                                                                    title: `Record ${record.source_id}`,
                                                                                    content: record.content || record.metadata?.content || 'No content available'
                                                                                });
                                                                            }}
                                                                        >
                                                                            <Eye className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>

                                                {/* Preview Dialog */}
                                                <Dialog open={!!previewContent} onOpenChange={() => setPreviewContent(null)}>
                                                    <DialogContent className="max-w-4xl max-h-[80vh]">
                                                        <DialogHeader>
                                                            <DialogTitle>{previewContent?.title}</DialogTitle>
                                                        </DialogHeader>
                                                        <div className="space-y-4">
                                                            <ScrollArea className="max-h-[60vh] p-4 border rounded-lg bg-muted/50">
                                                                <pre className="whitespace-pre-wrap text-sm font-mono">
                                                                    {previewContent?.content}
                                                                </pre>
                                                            </ScrollArea>
                                                            <div className="flex justify-end">
                                                                <Button variant="outline" onClick={() => setPreviewContent(null)}>
                                                                    Close
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-sm text-muted-foreground">
                                                No embedded records found for this table
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>}
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Embedding Geçmişi</CardTitle>
              <CardDescription>Yapılan embedding işlemlerinin detaylı kayıtları</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {embeddingHistory && embeddingHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Tarih</th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Model</th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Tablolar</th>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">İşlenen</th>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Başarılı / Hatalı</th>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Batch / Worker</th>
                          <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {embeddingHistory.map((record: any, index: number) => (
                          <tr key={record.id || index} className="border-b hover:bg-muted/50">
                            <td className="px-3 py-3">
                              {new Date(record.started_at || record.created_at).toLocaleString('tr-TR')}
                            </td>
                            <td className="px-3 py-3 font-mono text-xs">
                              {record.embedding_model || '-'}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {record.source_table?.map((table: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {table}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              {record.records_processed?.toLocaleString('tr-TR') || '0'}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {record.records_success?.toLocaleString('tr-TR') || '0'} / {record.records_failed?.toLocaleString('tr-TR') || '0'}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {record.batch_size || '-'} / {record.worker_count || '-'}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <Badge variant={
                                record.status === 'completed' ? 'default' :
                                record.status === 'error' ? 'destructive' :
                                record.status === 'processing' ? 'default' :
                                record.status === 'paused' ? 'secondary' :
                                'secondary'
                              }>
                                {record.status === 'completed' ? 'Tamamlandı' :
                                 record.status === 'error' ? 'Hata' :
                                 record.status === 'processing' ? 'İşleniyor' :
                                 record.status === 'paused' ? 'Duraklatıldı' :
                                 record.status === 'started' ? 'Başlatıldı' : record.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Henüz embedding geçmişi bulunmuyor
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="migration" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-1 space-y-6">
              <Card>
                <CardHeader className="pb-4"><CardTitle>İşlem Ayarları</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Embedding Provider</Label>
                    {progress?.status === 'processing' || progress?.status === 'paused' ? (
                      <div className="p-2 border rounded-md bg-muted">
                        {currentEmbeddingMethod === 'e5-mistral' && 'E5-Mistral-7B (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'bge-m3' && 'BGE-M3 (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'mistral' && 'Mistral-7B (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'openai-text-embedding-3-large' && 'OpenAI text-embedding-3-large (Ücretli)'}
                        {currentEmbeddingMethod === 'openai-text-embedding-3-small' && 'OpenAI text-embedding-3-small (Ücretli)'}
                        {currentEmbeddingMethod === 'cohere-embed-v3' && 'Cohere embed-v3.0 (Ücretli)'}
                        {currentEmbeddingMethod === 'voyage-large-2' && 'Voyage AI voyage-large-2 (Ücretli)'}
                        {currentEmbeddingMethod === 'google-text-embedding-004' && 'Google text-embedding-004 (Ücretli)'}
                        {currentEmbeddingMethod === 'jina-embeddings-v2' && 'Jina AI jina-embeddings-v2 (API - Ücretli)'}
                        {currentEmbeddingMethod === 'jina-embeddings-v2-small' && 'Jina AI jina-embeddings-v2-small (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'all-mpnet-base-v2' && 'all-mpnet-base-v2 (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'local' && 'Local (Basit)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'e5-mistral' && 'E5-Mistral-7B (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'bge-m3' && 'BGE-M3 (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'mistral' && 'Mistral-7B (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'openai-text-embedding-3-large' && 'OpenAI text-embedding-3-large (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'openai-text-embedding-3-small' && 'OpenAI text-embedding-3-small (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'cohere-embed-v3' && 'Cohere embed-v3.0 (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'voyage-large-2' && 'Voyage AI voyage-large-2 (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'google-text-embedding-004' && 'Google text-embedding-004 (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'jina-embeddings-v2' && 'Jina AI jina-embeddings-v2 (API - Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'jina-embeddings-v2-small' && 'Jina AI jina-embeddings-v2-small (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'all-mpnet-base-v2' && 'all-mpnet-base-v2 (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'local' && 'Local (Basit)'}
                      </div>
                    ) : (
                      <Select
                        value={embeddingMethod}
                        onValueChange={setEmbeddingMethod}
                        disabled={progress?.status === 'processing'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="e5-mistral">E5-Multilingual (HuggingFace - Türkçe Destekli)</SelectItem>
                          <SelectItem value="bge-m3">BGE-M3 (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="mistral">Mistral-7B (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="openai-text-embedding-3-large">OpenAI text-embedding-3-large (Ücretli)</SelectItem>
                          <SelectItem value="openai-text-embedding-3-small">OpenAI text-embedding-3-small (Ücretli)</SelectItem>
                          <SelectItem value="cohere-embed-v3">Cohere embed-v3.0 (Ücretli)</SelectItem>
                          <SelectItem value="voyage-large-2">Voyage AI voyage-large-2 (Ücretli)</SelectItem>
                          <SelectItem value="google-text-embedding-004">Google text-embedding-004 (Ücretli)</SelectItem>
                          <SelectItem value="jina-embeddings-v2">Jina AI jina-embeddings-v2 (API - Ücretli)</SelectItem>
                          <SelectItem value="jina-embeddings-v2-small">Jina AI jina-embeddings-v2-small (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="all-mpnet-base-v2">all-mpnet-base-v2 (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="local">Local (Test)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Batch Size</Label>
                    <div className="space-y-1">
                      <input
                        type="range"
                        min="5"
                        max="200"
                        step="5"
                        value={currentBatchSize || batchSize}
                        onChange={(e) => setBatchSize(parseInt(e.target.value))}
                        disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary disabled:[&::-webkit-slider-thumb]:bg-muted-foreground/50"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>5</span>
                        <span className="font-mono text-foreground">{currentBatchSize || batchSize}</span>
                        <span>200</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Paralel Embedder</Label>
                    <div className="space-y-1">
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        value={currentWorkerCount || workerCount}
                        onChange={(e) => setWorkerCount(parseInt(e.target.value))}
                        disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary disabled:[&::-webkit-slider-thumb]:bg-muted-foreground/50"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1</span>
                        <span className="font-mono text-foreground">{currentWorkerCount || workerCount}</span>
                        <span>20</span>
                      </div>
                    </div>
                  </div>
                  {!progress || progress?.status === 'idle' || progress?.status === 'completed' ?
                    <div className="space-y-2">
                      <Button
                        onClick={() => startMigration(false)}
                        disabled={selectedTables.length === 0 || isStartingMigration}
                        className="w-full"
                      >
                        {isStartingMigration ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {isStartingMigration ? "Başlatılıyor..." : selectedTables.length === 0 ? "Tablo Seçin" : "Migration Başlat"}
                      </Button>
                      {selectedTables.length > 0 && (
                        <p className="text-xs text-muted-foreground text-center">
                          {selectedTables.length} tablo seçildi
                        </p>
                      )}
                    </div> :
                  progress?.status === 'error' ?
                    <div className="space-y-2">
                      <div className="space-y-2">
                        <Button onClick={async () => {
                          try {
                            const response = await fetch(`${API_BASE}/reset`, {
                              method: 'POST'
                            });
                            if (response.ok) {
                              toast({
                                title: "Success",
                                description: "Embedding progress reset successfully",
                              });
                              resetMigration();
                            }
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: "Failed to reset progress",
                              variant: "destructive",
                            });
                          }
                        }} variant="outline" className="w-full">
                          <RotateCcw className="w-4 h-4 mr-2" />Sıfırla
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          {progress.error || "İşlemde hata oluştu"}
                        </p>
                      </div>
                    </div> :
                  progress?.status === 'paused' ?
                    <div className="space-y-2">
                      <div className="space-y-2">
                        <Button
                          onClick={handleResume}
                          className="w-full"
                          disabled={isRecovering}
                        >
                          {isRecovering ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {recoverMessage || 'Devam Ediliyor...'}
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />Devam Et
                            </>
                          )}
                        </Button>
                        <Button onClick={() => { abortMigration(); resetMigration(); }} variant="destructive" className="w-full">
                          <X className="w-4 h-4 mr-2" />İptal Et
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          {progress.currentTable ? `${progress.currentTable} duraklatıldı` : "İşlem duraklatıldı"}
                        </p>
                      </div>
                    </div> :
                  progress?.status === 'processing' ?
                    <div className="space-y-4">
                      <Button onClick={pauseMigration} variant="secondary" className="w-full">
                        <Pause className="w-4 h-4 mr-2" />Duraklat
                      </Button>
                      <Button onClick={() => { abortMigration(); resetMigration(); }} variant="destructive" className="w-full">
                        <X className="w-4 h-4 mr-2" />İptal Et
                      </Button>
                      {displayProgress && (displayProgress.status === 'processing' || displayProgress.status === 'paused') && (
                        <div className="pt-4 border-t">
                          <VerticalProgressDisplay
                            progress={displayProgress}
                            getCurrentTableInfo={getCurrentTableInfo}
                            migrationTables={migrationTables}
                          />
                        </div>
                      )}
                    </div> :
                  null
                  }
                </CardContent>
              </Card>
              </div>
            <div className="xl:col-span-3">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Tablo Seçimi</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchAvailableTablesAndStats}
                      disabled={isLoadingTables}
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingTables ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const tablesToSelect = availableTables.filter(t =>
                          t.name !== 'migration_history' && // Exclude system tables
                          !(t.totalRecords > 0 && t.embeddedRecords === t.totalRecords)
                        );
                        const tablesToSelectNames = tablesToSelect.map(t => t.name);

                        if (selectedTables.length === tablesToSelectNames.length) {
                          setSelectedTables([]);
                        } else {
                          setSelectedTables(tablesToSelectNames);
                        }
                      }}
                      disabled={progress?.status === 'processing'}
                    >
                      {selectedTables.length === availableTables.filter(t =>
                        t.name !== 'migration_history' &&
                        !(t.totalRecords > 0 && t.embeddedRecords === t.totalRecords)
                      ).length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingTables ? <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> :
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {availableTables.map((table) => {
                      // Skip system tables like migration_history
                      const isSystemTable = table.name === 'migration_history';
                      const isFullyEmbedded = table.totalRecords > 0 &&
                                             table.embeddedRecords === table.totalRecords;
                      const completionPercentage = table.totalRecords > 0 ?
                                              Math.round((table.embeddedRecords / table.totalRecords) * 100) : 0;

                      // Don't show system tables
                      if (isSystemTable) {
                        return null;
                      }

                      return (
                        <div
                          key={table.name}
                          className={`flex items-start space-x-2 p-3 border rounded-lg transition-colors ${
                            isFullyEmbedded
                              ? 'bg-gray-100 dark:bg-gray-800/50 opacity-75'
                              : 'hover:bg-accent/50'
                          }`}
                        >
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
                            disabled={
                              progress?.status === 'processing' ||
                              progress?.status === 'paused' ||
                              isFullyEmbedded
                            }
                            className="mt-1 rounded"
                          />
                          <label
                            htmlFor={`table-${table.name}`}
                            className={`text-sm cursor-pointer flex-1 ${
                              isFullyEmbedded ? 'cursor-default' : ''
                            }`}
                          >
                            <div className="font-medium flex items-center gap-2">
                              {table.displayName}
                              {isFullyEmbedded && (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {table.totalRecords?.toLocaleString('tr-TR') || '0'} kayıt
                              {table.embeddedRecords > 0 && (
                                <span className={isFullyEmbedded
                                  ? 'text-green-700 dark:text-green-400 font-medium'
                                  : 'text-green-600 dark:text-green-400'
                                }>
                                  {' • '}{table.embeddedRecords?.toLocaleString('tr-TR') || '0'} embed edilmiş
                                  ({completionPercentage}%)
                                </span>
                              )}
                              {table.pendingRecords > 0 && !isFullyEmbedded && (
                                <span className="text-orange-600 dark:text-orange-400">
                                  {' • '}{table.pendingRecords?.toLocaleString('tr-TR') || '0'} bekliyor
                                </span>
                              )}
                              {isFullyEmbedded && (
                                <span className="text-green-600 dark:text-green-400 font-medium">
                                  {' • Tamamlandı'}
                                </span>
                              )}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="statistics">
          <Card>
            <CardHeader>
              <CardTitle>İstatistikler Taşındı</CardTitle>
              <CardDescription>
                Embedding istatistikleri artık RAG Durumu sayfasında bulunmaktadır.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/rag?tab=embeddings">
                <Button>
                  İstatistikleri Görüntüle
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
            <Card>
                <CardHeader><CardTitle>Test & Arama</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search query..." />
                        <Button onClick={searchEmbeddings} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</Button>
                    </div>
                    {searchResults.map((result, i) => <div key={i} className="p-2 border rounded">...</div>)}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}