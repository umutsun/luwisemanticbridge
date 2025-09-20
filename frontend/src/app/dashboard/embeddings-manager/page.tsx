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
  Circle
} from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  const [batchSize, setBatchSize] = useState(50);
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
  const [showCleanupAlert, setShowCleanupAlert] = useState(false);
  const [cleanupIssues, setCleanupIssues] = useState<any[]>([]);
  const [cleanupRecommendations, setCleanupRecommendations] = useState<string[]>([]);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const { toast } = useToast();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL + '/api/v2/embeddings';

  // Check and recover from stuck process
  const checkAndRecoverStuckProcess = async () => {
    if (!progress || progress.status !== 'processing') return;

    try {
      const response = await fetch(`${API_BASE}/recover`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();

        if (data.action === 'paused') {
          // Process was stuck and has been paused
          toast({
            title: "İşlem Duraklatıldı",
            description: "Embedding işlemi aktif değil olduğu için otomatik olarak duraklatıldı.",
            variant: "default",
          });

          // Update progress to reflect paused state
          setProgress(data.progress);
          setDisplayProgress(data.progress);
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

  // Refresh recent records for a table
  const refreshRecentRecords = async (tableName: string) => {
    // Clear cached records first
    setRecentRecords(prev => {
      const newRecords = { ...prev };
      delete newRecords[tableName];
      return newRecords;
    });
    // Fetch fresh records
    await fetchRecentRecords(tableName);
  };

  // Toggle table expansion
  const toggleTableExpansion = (tableName: string) => {
    setExpandedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
        // Fetch recent records if not already loaded
        if (!recentRecords[tableName]) {
          fetchRecentRecords(tableName);
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

    // Update display progress directly for immediate UI feedback
    setDisplayProgress(progress);
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
            console.log('Found active process, updating progress:', data);
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
    let eventSourceExists = false;

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
      }, 10000); // Check every 10 seconds when might be stuck
    } else if (progress?.status === 'processing') {
      // Regular check when processing
      stuckCheckInterval = setInterval(async () => {
        await checkAndRecoverStuckProcess();
      }, 30000); // Check every 30 seconds
    }

    return () => {
      if (stuckCheckInterval) {
        clearInterval(stuckCheckInterval);
      }
    };
  }, [progress?.status, progress?.mightBeStuck]);

  const startMigration = async (resume = false) => {
    console.log('Starting migration:', { resume, selectedTables, migrationTables });
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
                                            <div className="text-center py-4">
                                                <Loader2 className="h-4 w-4 animate-spin inline" />
                                                <span className="text-sm text-muted-foreground ml-2">Loading recent records...</span>
                                            </div>
                                        ) : recentRecords[table.name] && recentRecords[table.name].length > 0 ? (
                                            <div>
                                                <h4 className="text-sm font-medium mb-2">Recent 20 Records</h4>
                                                <div className="overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-16">ID</TableHead>
                                                                <TableHead>Status</TableHead>
                                                                <TableHead>Content Preview</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {recentRecords[table.name].slice(0, 20).map((record, index) => (
                                                                <TableRow key={record.id || index}>
                                                                    <TableCell className="text-sm">
                                                                        {record.id || '-'}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        {record.isEmbedded ? (
                                                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                                                        ) : (
                                                                            <Circle className="h-4 w-4 text-gray-400" />
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-sm max-w-md truncate">
                                                                        {record.content || record.baslik || record.title || record.question || record.soru || '-'}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-sm text-muted-foreground">
                                                No recent records found
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
                        <tr className="border-b">
                          <th className="text-left p-2">Tarih</th>
                          <th className="text-left p-2">Model</th>
                          <th className="text-left p-2">Tablolar</th>
                          <th className="text-right p-2">İşlenen</th>
                          <th className="text-right p-2">Başarılı / Hatalı</th>
                          <th className="text-right p-2">Batch / Worker</th>
                          <th className="text-center p-2">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {embeddingHistory.map((record: any, index: number) => (
                          <tr key={record.id || index} className="border-b hover:bg-muted/50">
                            <td className="p-2">
                              {new Date(record.started_at || record.created_at).toLocaleString('tr-TR')}
                            </td>
                            <td className="p-2 font-mono text-xs">
                              {record.embedding_model || '-'}
                            </td>
                            <td className="p-2">
                              <div className="flex flex-wrap gap-1">
                                {record.source_table?.map((table: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {table}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="p-2 text-right">
                              {record.records_processed?.toLocaleString('tr-TR') || '0'}
                            </td>
                            <td className="p-2 text-right">
                              {record.records_success?.toLocaleString('tr-TR') || '0'} / {record.records_failed?.toLocaleString('tr-TR') || '0'}
                            </td>
                            <td className="p-2 text-right">
                              {record.batch_size || '-'} / {record.worker_count || '-'}
                            </td>
                            <td className="p-2 text-center">
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
                <CardHeader><CardTitle>İşlem Ayarları</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Embedding Provider</Label>
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
                        disabled={progress?.status === 'processing' || progress?.status === 'paused'}
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

                  <div>
                    <Label>Batch Size</Label>
                    {progress?.status === 'processing' ? (
                      <div className="p-2 border rounded-md bg-muted">
                        {currentBatchSize || batchSize}
                      </div>
                    ) : (
                      <Select
                        value={batchSize.toString()}
                        onValueChange={(v) => setBatchSize(parseInt(v))}
                        disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="30">30</SelectItem>
                          <SelectItem value="40">40</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <Label>Paralel Embedder</Label>
                    {progress?.status === 'processing' ? (
                      <div className="p-2 border rounded-md bg-muted">
                        {currentWorkerCount || workerCount}
                      </div>
                    ) : (
                      <Select
                        value={workerCount.toString()}
                        onValueChange={(v) => setWorkerCount(parseInt(v))}
                        disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                          <SelectItem value="5">5</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {!progress || progress?.status === 'idle' || progress?.status === 'completed' || progress?.status === 'error' ?
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
                  progress?.status === 'paused' ?
                    <div className="space-y-2">
                      <div className="space-y-2">
                        <Button onClick={() => startMigration(true)} className="w-full">
                          <Play className="w-4 h-4 mr-2" />Devam Et
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
                    <div className="space-y-2">
                      <Button onClick={pauseMigration} variant="secondary" className="w-full">
                        <Pause className="w-4 h-4 mr-2" />Duraklat
                      </Button>
                      <Button onClick={() => { abortMigration(); resetMigration(); }} variant="destructive" className="w-full">
                        <X className="w-4 h-4 mr-2" />İptal Et
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        {progress.currentTable ? `${progress.currentTable} işleniyor...` : "İşlem devam ediyor..."}
                      </p>
                    </div> :
                  null
                  }
                </CardContent>
              </Card>
              {displayProgress && (displayProgress.status === 'processing' || displayProgress.status === 'paused') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {displayProgress.status === 'processing' ? 'Aktif Embedding İşlemi' : 'Duraklatılmış Embedding İşlemi'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <VerticalProgressDisplay
                      progress={displayProgress}
                      getCurrentTableInfo={getCurrentTableInfo}
                      migrationTables={migrationTables}
                    />
                  </CardContent>
                </Card>
              )}
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
                        if (selectedTables.length === availableTables.length) {
                          setSelectedTables([]);
                        } else {
                          setSelectedTables(availableTables.map(t => t.name));
                        }
                      }}
                      disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                    >
                      {selectedTables.length === availableTables.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingTables ? <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> :
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {availableTables.map((table) => (
                      <div key={table.name} className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
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
                          disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                          className="mt-1 rounded"
                        />
                        <label htmlFor={`table-${table.name}`} className="text-sm cursor-pointer flex-1">
                          <div className="font-medium">
                            {table.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {table.totalRecords?.toLocaleString('tr-TR') || '0'} kayıt
                            {table.embeddedRecords > 0 && (
                              <span className="text-green-600 dark:text-green-400">
                                {' • '}{table.embeddedRecords?.toLocaleString('tr-TR') || '0'} embed edilmiş
                                ({Math.round((table.embeddedRecords / table.totalRecords) * 100)}%)
                              </span>
                            )}
                            {table.pendingRecords > 0 && (
                              <span className="text-orange-600 dark:text-orange-400">
                                {' • '}{table.pendingRecords?.toLocaleString('tr-TR') || '0'} bekliyor
                              </span>
                            )}
                          </div>
                        </label>
                      </div>
                    ))}
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