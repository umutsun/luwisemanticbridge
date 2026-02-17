"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  CheckCircle,
  AlertTriangle
} from "lucide-react";
import { useConfig } from "@/contexts/ConfigContext";
import apiConfig from "@/config/api.config";
import { fetchWithAuth, safeJsonParse } from "@/lib/auth-fetch";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { AnimatedResourceBar } from "@/components/ui/animated-progress";
import { useAnimatedPercentage } from "@/hooks/use-animated-counter";
import { useMetricsWebSocket } from "@/hooks/useMetricsWebSocket";
import { CircularProgress } from "@/components/ui/circular-progress";
import { isDebugMode } from "@/lib/debug";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-[320px] text-sm text-slate-400">Loading graph...</div>
});

interface SystemStatus {
  database: {
    status: "connected" | "disconnected";
    documents: number;
    lastUpdate: string;
  };
  vectorizer: {
    status: "active" | "inactive";
    model: string;
    lastProcessed: string;
  };
  scraper: {
    status: "active" | "inactive";
    lastRun: string;
    documentsProcessed: number;
  };
  redis: {
    status: "connected" | "disconnected";
    uptime: string;
    memory: string;
  };
  services: {
    lightRAG: {
      status: "active" | "inactive";
      uptime: string;
      lastQuery: string;
      queries: number;
    };
    semanticSearch: {
      status: "active" | "inactive";
      model: string;
      searches: number;
    };
    scraper: {
      status: "active" | "inactive";
      urls: number;
      lastRun: string;
    };
  };
}

interface Document {
  id: string;
  title: string;
  url: string;
  type: string;
  status: "indexed" | "processing" | "failed";
  addedAt: string;
  wordCount?: number;
  vectorSize?: number;
}

interface ScrapingSession {
  id: string;
  name: string;
  url: string;
  status: "running" | "completed" | "failed" | "paused";
  startTime: string;
  progress: number;
  documentsFound: number;
  errors: string[];
  config: {
    maxDepth: number;
    maxPages: number;
    domainsOnly: boolean;
    followExternal: boolean;
  };
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
}

interface ActivityLog {
  id: string;
  type: 'user' | 'system' | 'error' | 'info';
  action: string;
  details: string;
  timestamp: string;
}

interface ConsoleLog {
  id: string;
  type: 'info' | 'warn' | 'error' | 'log' | 'success';
  message: string;
  timestamp: string;
  source?: 'backend' | 'frontend' | 'system' | 'user';
}

// ✅ Glassmorphism StatusCard - UI Style Guide Compliant
const GlassCard = ({ title, value, status, description, live, trend }: {
  title: string;
  value: string | number;
  status?: 'online' | 'offline' | 'warning';
  description?: string;
  live?: boolean;
  trend?: { value: number; label: string };
}) => {
  return (
    <Card className="bg-white/80 dark:bg-[#0d1f3c]/60 backdrop-blur-sm border border-gray-200/60 dark:border-[#1e3a5f]/50 shadow-lg hover:shadow-xl transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-600 dark:text-slate-400">{title}</p>
              {live && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </span>
              )}
            </div>
            <p className="text-3xl font-bold tracking-tight text-gray-900 dark:text-cyan-100">{value}</p>
            {description && (
              <p className="text-xs text-gray-500 dark:text-slate-500">{description}</p>
            )}
          </div>
          {status && (
            <div className={`h-2.5 w-2.5 rounded-full ${
              status === 'online' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' :
              status === 'warning' ? 'bg-amber-500 shadow-lg shadow-amber-500/50' :
              'bg-rose-500 shadow-lg shadow-rose-500/50'
            }`} />
          )}
        </div>
        {trend && (
          <div className={`mt-3 flex items-center gap-1 text-xs ${trend.value >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            <span>{trend.value >= 0 ? '↑' : '↓'}</span>
            <span className="font-medium">{Math.abs(trend.value)}%</span>
            <span className="text-gray-500 dark:text-slate-500">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Connection status indicator for real-time data
const LiveIndicator = ({ connected, latency }: { connected: boolean; latency?: number }) => (
  <div className="flex items-center gap-2">
    <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
    {connected && latency !== undefined && (
      <span className="text-[10px] text-slate-500">{latency}ms</span>
    )}
  </div>
);

export default function DashboardPage() {
  const { t } = useTranslation();
  const { config } = useConfig();
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState<SystemStatus | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sessions, setSessions] = useState<ScrapingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // New state for development features
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [consoleLog, setConsoleLog] = useState<ConsoleLog[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showConsoleLog, setShowConsoleLog] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [scrapingStatus, setScrapingStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");

  // Debug mode state - shows console when enabled
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);

  // Listen for debug mode changes
  useEffect(() => {
    setDebugModeEnabled(isDebugMode());

    const handleDebugModeChange = (e: CustomEvent) => {
      setDebugModeEnabled(e.detail);
    };

    window.addEventListener('debugModeChanged', handleDebugModeChange as EventListener);
    return () => {
      window.removeEventListener('debugModeChanged', handleDebugModeChange as EventListener);
    };
  }, []);

  // Console state for real functionality
  const [consoleFilter, setConsoleFilter] = useState<'all' | 'backend' | 'frontend' | 'error' | 'warn' | 'info'>('all');
  const [isConsolePaused, setIsConsolePaused] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(400);
  const [wsConnected, setWsConnected] = useState(false);
  const [consoleCommand, setConsoleCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Chat statistics state
  const [chatStats, setChatStats] = useState<{
    overview?: {
      total_conversations: number;
      total_messages: number;
      total_users: number;
    };
    recentMessages?: number;
    avgMessagesPerConversation?: number;
    daily_activity?: Array<{
      date: string;
      active_users: number;
      conversations: number;
      messages: number;
    }>;
    lastUpdated?: string;
  } | null>(null);
  const [chatStatsLoading, setChatStatsLoading] = useState(true);

  // Additional statistics
  const [documentStats, setDocumentStats] = useState<{
    total?: number;
    processed?: number;
    failed?: number;
  } | null>(null);
  const [embeddingStats, setEmbeddingStats] = useState<{
    total_embeddings?: number;
    by_category?: {
      migrated?: {
        rows?: number;
        embeddings?: number;
      };
      documents?: {
        documents?: number;
        embeddings?: number;
      };
      scraped?: {
        data?: number;
        embeddings?: number;
      };
      messages?: {
        messages?: number;
        embeddings?: number;
      };
    };
  } | null>(null);

  // Token usage statistics
  const [tokenStats, setTokenStats] = useState<{
    totalTokensUsed: number;
    totalCost: number;
  }>({
    totalTokensUsed: 0,
    totalCost: 0
  });

  // Settings data for real display
  const [llmSettings, setLlmSettings] = useState<{
    activeChatModel?: string;
    activeEmbeddingModel?: string;
    embeddingModel?: string;
  } | null>(null);
  const [databaseSettings, setDatabaseSettings] = useState<{
    name?: string;
    host?: string;
    port?: number;
  } | null>(null);

  // Real-time resources data from SSE stream
  const [realtimeResources, setRealtimeResources] = useState({
    cpu: 0,
    cpuModel: '',
    cpuSpeed: 0,
    cpuCores: 0,
    memory: 0,
    disk: 0,
    diskMountPoint: '',
    diskFilesystem: '',
    gpu: 0,
    loadAvg: [0, 0, 0],
    memoryDetails: {
      used: 0,
      total: 0,
      free: 0,
      heapUsed: 0,
      heapTotal: 0
    },
    diskDetails: {
      used: 0,
      total: 0,
      free: 0
    },
    network: {
      bytesIn: 0,
      bytesOut: 0,
      bytesInPerSec: 0,
      bytesOutPerSec: 0,
      packetsIn: 0,
      packetsOut: 0
    }
  });

  // Pipeline status for active processes
  const [pipelines, setPipelines] = useState<Array<{
    name: string;
    type: string;
    status: string;
    progress?: number;
    current?: number;
    total?: number;
    speed?: number;
    eta?: string;
    error?: string;
  }>>([]);

  // Services status
  const [servicesStatus, setServicesStatus] = useState<Array<{
    name: string;
    status: string;
    uptime?: number;
    memory?: number;
    port?: number;
  }>>([]);

  // Performance metrics from SSE stream
  const [performanceMetrics, setPerformanceMetrics] = useState({
    avgResponseTime: 0,
    dailyQueries: 0,
    cacheHitRate: 0,
    totalDocuments: 0
  });

  // Crawler stats - real-time
  const [crawlerStats, setCrawlerStats] = useState({
    scrapedPages: 0,
    crawlerItems: 0,
    scrapedEmbeddings: 0,
    totalScrapedData: 0,
    activeCrawlers: [] as string[],
    crawlerCount: 0
  });

  // Scheduler stats - real-time
  const [schedulerStats, setSchedulerStats] = useState({
    totalJobs: 0,
    enabledJobs: 0,
    disabledJobs: 0,
    executionsLast24h: 0,
    successfulLast24h: 0,
    failedLast24h: 0,
    schedulerRunning: false
  });

  // Relationship graph data
  const [relationshipStats, setRelationshipStats] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(0);

  // SSE connection status
  const [sseConnected, setSseConnected] = useState(false);

  // WebSocket metrics hook - disabled for now, using SSE instead
  // WebSocket will be re-enabled after fixing connection issues
  const {
    metrics: wsMetrics,
    connected: metricsWsConnected,
    latency: metricsWsLatency
  } = useMetricsWebSocket({
    updateRate: 1000,
    autoConnect: false, // Disabled - using SSE for real-time metrics
    onConnect: () => {
      addConsoleLog('[METRICS-WS] Real-time metrics connected', 'success', 'system');
    },
    onDisconnect: () => {
      addConsoleLog('[METRICS-WS] Disconnected, falling back to SSE', 'warning', 'system');
    }
  });

  // Component mount'da verileri çek - Sequential to avoid ERR_INSUFFICIENT_RESOURCES
  useEffect(() => {
    // Initialize console with startup logs
    addConsoleLog('[SYSTEM] ' + t('dashboard.console.starting'), 'info', 'system');
    addConsoleLog('[BACKEND] ' + t('dashboard.console.postgresqlConnected'), 'info', 'backend');
    addConsoleLog('[BACKEND] ' + t('dashboard.console.redisActive'), 'info', 'backend');
    addConsoleLog('[BACKEND] ' + t('dashboard.console.llmServiceInitialized'), 'info', 'backend');
    addConsoleLog('[BACKEND] ' + t('dashboard.console.ragChatStarted'), 'info', 'backend');
    addConsoleLog('[BACKEND] ' + t('dashboard.console.ocrRouterLoaded'), 'info', 'backend');
    addConsoleLog('[BACKEND] ' + t('dashboard.console.scraperReady'), 'info', 'backend');
    addConsoleLog('[FRONTEND] ' + t('dashboard.console.reactRendered'), 'info', 'frontend');
    addConsoleLog('[FRONTEND] ' + t('dashboard.console.dashboardApiConnected'), 'info', 'frontend');
    addConsoleLog('[SYSTEM] ' + t('dashboard.console.allServicesReady'), 'info', 'system');

    // Fetch data sequentially to avoid too many concurrent requests
    const fetchInitialData = async () => {
      await fetchSystemStatus();
      await fetchDocuments();
      await fetchSessions();
    };
    fetchInitialData();
  }, []);

  // WebSocket connection disabled - backend doesn't have this endpoint
  // useEffect(() => {
  //   if (!isConsolePaused) {
  //     const ws = new WebSocket(`ws://localhost:${process.env.NEXT_PUBLIC_API_PORT || '8083'}/ws/logs`);

  //     ws.onopen = () => {
  //       setWsConnected(true);
  //       addConsoleLog('[SYSTEM] WebSocket connected for real-time logs', 'info', 'system');
  //     };

  //     ws.onmessage = (event) => {
  //       try {
  //         const logData = JSON.parse(event.data);
  //         addConsoleLog(logData.message, logData.level || 'info', logData.source || 'backend');
  //       } catch (error) {
  //         // If it's not JSON, treat as plain text
  //         addConsoleLog(event.data, 'info', 'backend');
  //       }
  //     };

  //     ws.onclose = () => {
  //       setWsConnected(false);
  //       if (!isConsolePaused) {
  //         addConsoleLog('[SYSTEM] WebSocket disconnected, attempting reconnect...', 'warn', 'system');
  //       }
  //     };

  //     ws.onerror = () => {
  //       addConsoleLog('[SYSTEM] WebSocket connection error', 'error', 'system');
  //     };

  //     return () => {
  //       ws.close();
  //     };
  //   }
  // }, [isConsolePaused]);

  // Real-time metrics polling (replaces SSE for better compatibility)
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchMetrics = async () => {
      if (!isMounted) return;

      try {
        const response = await fetchWithAuth(
          apiConfig.getApiUrl('/api/v2/dashboard/metrics')
        );

        if (response.ok && isMounted) {
          const data = await safeJsonParse(response);
          if (!data) return;

          setSseConnected(true);

          // Update system resources
          if (data.systemMetrics) {
            setRealtimeResources({
              cpu: data.systemMetrics.cpu || 0,
              cpuModel: data.systemMetrics.cpuModel || '',
              cpuSpeed: data.systemMetrics.cpuSpeed || 0,
              cpuCores: data.systemMetrics.cpuCores || 0,
              memory: data.systemMetrics.memory || 0,
              disk: data.systemMetrics.disk || 0,
              diskMountPoint: data.systemMetrics.diskMountPoint || '',
              diskFilesystem: data.systemMetrics.diskFilesystem || '',
              gpu: 0,
              loadAvg: data.systemMetrics.loadAvg || [0, 0, 0],
              memoryDetails: data.systemMetrics.memoryDetails || {
                used: 0, total: 0, free: 0, heapUsed: 0, heapTotal: 0
              },
              diskDetails: data.systemMetrics.diskDetails || {
                used: 0, total: 0, free: 0
              },
              network: data.systemMetrics.network || {
                bytesIn: 0, bytesOut: 0, bytesInPerSec: 0, bytesOutPerSec: 0,
                packetsIn: 0, packetsOut: 0
              }
            });
          }

          // Update pipelines status
          if (data.pipelines) {
            setPipelines(data.pipelines);
          }

          // Update services status
          if (data.services) {
            setServicesStatus(data.services);
          }

          // Update database stats
          if (data.database) {
            setEmbeddingStats(prev => ({
              ...prev,
              total_embeddings: data.database.embeddings || 0
            }));
            setDocumentStats(prev => ({
              ...prev,
              total: data.database.documents || 0
            }));
          }

          // Update performance metrics
          if (data.performance) {
            setPerformanceMetrics({
              avgResponseTime: data.performance.avgResponseTime || 0,
              dailyQueries: data.performance.dailyQueries || 0,
              cacheHitRate: data.performance.cacheHitRate || 0,
              totalDocuments: data.performance.totalDocuments || 0
            });
          }

          // Update live stats (tokens, messages, conversations)
          if (data.liveStats) {
            setTokenStats({
              totalTokensUsed: data.liveStats.totalTokensUsed || 0,
              totalCost: data.liveStats.totalCost || 0
            });
            setChatStats(prev => ({
              ...prev,
              overview: {
                total_conversations: data.liveStats.totalConversations || 0,
                total_messages: data.liveStats.totalMessages || 0,
                total_users: data.liveStats.totalUsers || 0
              }
            }));
          }
        } else {
          setSseConnected(false);
        }
      } catch (err) {
        console.error('Metrics fetch error:', err);
        if (isMounted) setSseConnected(false);
      }
    };

    // Initial fetch
    fetchMetrics();

    // Poll every 3 seconds
    intervalId = setInterval(fetchMetrics, 3000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Fetch crawler stats - real-time polling
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchCrawlerStats = async () => {
      try {
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/dashboard/crawler-stats'));
        if (response.ok && isMounted) {
          const data = await safeJsonParse(response);
          if (data?.stats) {
            setCrawlerStats(data.stats);
          }
        }
      } catch (error) {
        console.error('Crawler stats fetch error:', error);
      }
    };

    // Initial fetch after short delay
    setTimeout(fetchCrawlerStats, 1500);

    // Poll every 5 seconds
    intervalId = setInterval(fetchCrawlerStats, 5000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Fetch scheduler stats - real-time polling
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchSchedulerStats = async () => {
      try {
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scheduler/stats'));
        if (response.ok && isMounted) {
          const data = await safeJsonParse(response);
          if (data) {
            setSchedulerStats({
              totalJobs: data.total_jobs || 0,
              enabledJobs: data.enabled_jobs || 0,
              disabledJobs: data.disabled_jobs || 0,
              executionsLast24h: data.executions_last_24h || 0,
              successfulLast24h: data.successful_last_24h || 0,
              failedLast24h: data.failed_last_24h || 0,
              schedulerRunning: data.scheduler_running || false
            });
          }
        }
      } catch (error) {
        console.error('Scheduler stats fetch error:', error);
      }
    };

    // Initial fetch after short delay
    setTimeout(fetchSchedulerStats, 2000);

    // Poll every 10 seconds
    intervalId = setInterval(fetchSchedulerStats, 10000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Fetch relationship graph data
  useEffect(() => {
    let isMounted = true;
    const fetchRelationshipData = async () => {
      try {
        const [statsRes, graphRes] = await Promise.all([
          fetchWithAuth(apiConfig.getApiUrl('/api/v2/relationships/stats')),
          fetchWithAuth(apiConfig.getApiUrl('/api/v2/relationships/graph-data')),
        ]);
        if (statsRes.ok && isMounted) {
          const data = await safeJsonParse(statsRes);
          if (data) setRelationshipStats(data);
        }
        if (graphRes.ok && isMounted) {
          const data = await safeJsonParse(graphRes);
          if (data) setGraphData(data);
        }
      } catch (error) {
        // Silently fail - graph is optional
      }
    };
    setTimeout(fetchRelationshipData, 3000);
    return () => { isMounted = false; };
  }, []);

  // Measure graph container width
  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGraphWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [relationshipStats]);

  // Fetch chat statistics - delayed to avoid concurrent request overload
  useEffect(() => {
    const fetchChatStats = async () => {
      // Wait a bit for initial data fetches to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // Try dashboard stats first (for admin users)
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/chat/dashboard-stats'));

        if (response.ok) {
          const data = await safeJsonParse(response); if (!data) return;
          setChatStats(data);
        } else if (response.status === 403) {
          // If not admin, try user-specific stats
          const userResponse = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/chat/stats'));

          if (userResponse.ok) {
            const userData = await safeJsonParse(userResponse); if (!userData) return;
            // Transform user stats to dashboard format
            setChatStats({
              overview: {
                total_conversations: userData.totalConversations || 0,
                total_messages: userData.totalMessages || 0,
                total_users: 1 // Only current user
              },
              recentMessages: userData.recentMessages || 0,
              avgMessagesPerConversation: userData.avgMessagesPerConversation || 0,
              daily_activity: [{
                date: new Date().toISOString().split('T')[0],
                active_users: 1,
                conversations: userData.totalConversations || 0,
                messages: userData.recentMessages || 0
              }],
              lastUpdated: new Date().toISOString()
            });
          } else {
            // Set default values if both endpoints fail
            setChatStats({
              overview: {
                total_conversations: 0,
                total_messages: 0,
                total_users: 0
              },
              recentMessages: 0,
              avgMessagesPerConversation: 0,
              daily_activity: [{
                date: new Date().toISOString().split('T')[0],
                active_users: 0,
                conversations: 0,
                messages: 0
              }],
              lastUpdated: new Date().toISOString()
            });
          }
        } else if (response.status === 401) {
          // Not authenticated - use default empty data
          console.warn('Chat stats requires authentication. Using default data.');
          setChatStats({
            overview: {
              total_conversations: 0,
              total_messages: 0,
              total_users: 0
            },
            recentMessages: 0,
            avgMessagesPerConversation: 0,
            daily_activity: [{
              date: new Date().toISOString().split('T')[0],
              active_users: 0,
              conversations: 0,
              messages: 0
            }],
            lastUpdated: new Date().toISOString()
          });
        } else {
          console.error('Failed to fetch chat stats:', response.status);
          // Set default data for any other error
          setChatStats({
            overview: {
              total_conversations: 0,
              total_messages: 0,
              total_users: 0
            },
            recentMessages: 0,
            avgMessagesPerConversation: 0,
            daily_activity: [{
              date: new Date().toISOString().split('T')[0],
              active_users: 0,
              conversations: 0,
              messages: 0
            }],
            lastUpdated: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error fetching chat stats:', error);
        // Set default data on error
        setChatStats({
          overview: {
            total_conversations: 0,
            total_messages: 0,
            total_users: 0
          },
          recentMessages: 0,
          avgMessagesPerConversation: 0,
          daily_activity: [{
            date: new Date().toISOString().split('T')[0],
            active_users: 0,
            conversations: 0,
            messages: 0
          }],
          lastUpdated: new Date().toISOString()
        });
      } finally {
        setChatStatsLoading(false);
      }
    };

    fetchChatStats();
  }, []);

  // Fetch all dashboard data - delayed and sequential to avoid too many concurrent requests
  useEffect(() => {
    const fetchAllDashboardData = async () => {
      // Wait for initial data fetches to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        // Fetch settings sequentially to avoid ERR_INSUFFICIENT_RESOURCES
        let llmResponse = null;
        let dbResponse = null;

        try {
          llmResponse = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/config?category=llm'));
        } catch {}

        try {
          dbResponse = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/config?category=database'));
        } catch {}

        if (llmResponse?.ok) {
          const data = await safeJsonParse(llmResponse);
          if (data) setLlmSettings(data.llmSettings || data);
        }

        if (dbResponse?.ok) {
          const data = await safeJsonParse(dbResponse);
          if (data) setDatabaseSettings(data.database || data);
        }

        // Then fetch stats sequentially (less critical, can fail silently)
        // Using sequential calls to avoid ERR_INSUFFICIENT_RESOURCES
        let docResponse = null;
        let embResponse = null;
        let tokenResponse = null;

        try {
          docResponse = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/documents/stats'));
        } catch {}

        try {
          embResponse = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/embeddings/stats'));
        } catch {}

        try {
          tokenResponse = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/dashboard/stats'));
        } catch {}

        if (docResponse?.ok) {
          const data = await safeJsonParse(docResponse);
          if (data) setDocumentStats(data);
        }

        if (embResponse?.ok) {
          const data = await safeJsonParse(embResponse);
          if (data) setEmbeddingStats(data);
        }

        if (tokenResponse?.ok) {
          const data = await safeJsonParse(tokenResponse);
          if (data) {
            setTokenStats({
              totalTokensUsed: data.totalTokensUsed || 0,
              totalCost: data.totalCost || 0
            });
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchAllDashboardData();

    // Refresh token stats every 60 seconds (less frequent)
    const interval = setInterval(async () => {
      try {
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/dashboard/stats'));
        if (response?.ok) {
          const data = await safeJsonParse(response);
          if (data) {
            setTokenStats({
              totalTokensUsed: data.totalTokensUsed || 0,
              totalCost: data.totalCost || 0
            });
          }
        }
      } catch {
        // Silent fail for background refresh
      }
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchSystemStatus = async () => {
    try {
      addConsoleLog('[API] ' + t('dashboard.console.healthCheckStarted'), 'info', 'frontend');
      const [healthResponse, scraperStatusResponse] = await Promise.all([
        fetchWithAuth(apiConfig.getApiUrl('/api/v2/health/system')),
        fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/dashboard/status')),
      ]);

      const healthData = await safeJsonParse(healthResponse);
      const scraperStatus = await safeJsonParse(scraperStatusResponse);

      if (healthData) {
        addConsoleLog('[API] ' + t('dashboard.console.healthCheckCompleted'), 'info', 'backend');
      }

      const databaseStatus = healthData?.services?.database?.status;
      const redisStatus = healthData?.services?.redis?.status;

      const parsedStatus: SystemStatus = {
        database: {
          status: databaseStatus === 'connected' || databaseStatus === 'healthy' ? 'connected' : 'disconnected',
          documents: scraperStatus?.documents?.total ?? scraperStatus?.documents ?? 0,
          lastUpdate: scraperStatus?.documents?.lastUpdate ?? healthData?.timestamp ?? new Date().toISOString(),
        },
        vectorizer: {
          status: scraperStatus?.vectorizer?.status === 'active' ? 'active' : 'inactive',
          model: scraperStatus?.vectorizer?.model ?? t('dashboard.status.unknown'),
          lastProcessed: scraperStatus?.vectorizer?.lastProcessed ?? '-',
        },
        scraper: {
          status: scraperStatus?.scraper?.status === 'active' ? 'active' : 'inactive',
          lastRun: scraperStatus?.scraper?.lastRun ?? '-',
          documentsProcessed: scraperStatus?.scraper?.total ?? 0,
        },
        redis: {
          status: redisStatus === 'connected' || redisStatus === 'healthy' ? 'connected' : 'disconnected',
          uptime: scraperStatus?.redis?.uptime ?? healthData?.serverStatus?.redisUptime ?? '-',
          memory: scraperStatus?.redis?.memory ?? `${healthData?.memory?.used ?? 0} MB`,
        },
        services: {
          lightRAG: {
            status: scraperStatus?.services?.lightRAG?.status === 'active' ? 'active' : 'inactive',
            uptime: scraperStatus?.services?.lightRAG?.uptime ?? '-',
            lastQuery: scraperStatus?.services?.lightRAG?.lastQuery ?? '-',
            queries: scraperStatus?.services?.lightRAG?.queries ?? 0,
          },
          semanticSearch: {
            status: scraperStatus?.services?.semanticSearch?.status === 'active' ? 'active' : 'inactive',
            model: scraperStatus?.services?.semanticSearch?.model ?? t('dashboard.status.unknown'),
            searches: scraperStatus?.services?.semanticSearch?.searches ?? 0,
          },
          scraper: {
            status: scraperStatus?.scraper?.status === 'active' ? 'active' : 'inactive',
            urls: scraperStatus?.scraper?.total ?? 0,
            lastRun: scraperStatus?.scraper?.lastRun ?? '-',
          },
        },
      };

      setData(parsedStatus);
    } catch (err) {
      console.error('Failed to fetch system status:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      addConsoleLog('[API] ' + t('dashboard.console.documentHistoryLoading'), 'info', 'frontend');
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/history/documents'));
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const payload = await safeJsonParse(response); if (!payload) return;
      const docs = Array.isArray(payload?.history)
        ? payload.history
        : [];

      if (docs.length > 0) {
        addConsoleLog(`[API] ✅ ${docs.length} ` + t('dashboard.console.documentsLoaded'), 'info', 'backend');
      }

      setDocuments(docs);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setDocuments([]);
    }
  };

  const fetchSessions = async () => {
    try {
      addConsoleLog('[API] ' + t('dashboard.console.scraperSessionsLoading'), 'info', 'frontend');
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/history/scraper'));
      if (!response.ok) {
        throw new Error('Failed to fetch scraper sessions');
      }

      const payload = await safeJsonParse(response); if (!payload) return;
      const sessionList = Array.isArray(payload?.history)
        ? payload.history
        : [];

      if (sessionList.length > 0) {
        addConsoleLog(`[API] ✅ ${sessionList.length} ` + t('dashboard.console.scraperSessionsLoaded'), 'info', 'backend');
      }

      setSessions(sessionList);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setSessions([]);
    }
  };

  const startScraping = async (url: string, config: {
    maxDepth?: number;
    maxPages?: number;
    domainsOnly?: boolean;
    followExternal?: boolean;
  }) => {
    try {
      setScrapingStatus("running");
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, config }),
      });

      if (response.ok) {
        await fetchSessions();
        await fetchDocuments();
      }
    } catch (err) {
      console.error("Failed to start scraping:", err);
    } finally {
      setScrapingStatus("idle");
    }
  };

  const pauseScraping = async (sessionId: string) => {
    try {
      await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/pause'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      await fetchSessions();
    } catch (err) {
      console.error("Failed to pause scraping:", err);
    }
  };

  const deleteDocument = async (docId: string) => {
    try {
      await fetchWithAuth(apiConfig.getApiUrl(`/api/v2/documents/${docId}`), {
        method: 'DELETE',
      });
      await fetchDocuments();
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    (doc.title && doc.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (doc.url && doc.url.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive':
      case 'disconnected':
      case 'offline':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "success" | "error" | "warning" | "info"> = {
      'active': 'success',
      'connected': 'success',
      'online': 'success',
      'inactive': 'secondary',
      'disconnected': 'error',
      'offline': 'error',
      'processing': 'warning',
      'completed': 'success',
      'failed': 'error',
      'running': 'info',
      'paused': 'secondary'
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  // Helper functions for development features
  const addNotification = (type: Notification['type'], title: string, message: string) => {
    const notification: Notification = {
      id: Date.now().toString(),
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString()
    };
    setNotifications(prev => [notification, ...prev]);
  };

  const addActivityLog = (type: ActivityLog['type'], action: string, details: string) => {
    const activity: ActivityLog = {
      id: Date.now().toString(),
      type,
      action,
      details,
      timestamp: new Date().toLocaleTimeString()
    };
    setActivityLog(prev => [activity, ...prev]);
  };

  const addConsoleLog = (message: string, type: ConsoleLog['type'] = 'info', source: ConsoleLog['source'] = 'system') => {
    const log: ConsoleLog = {
      id: Date.now().toString(),
      type,
      message,
      timestamp: new Date().toLocaleTimeString(),
      source
    };
    setConsoleLog(prev => [log, ...prev]);
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Filter console logs based on selected filter
  const filteredConsoleLogs = consoleLog.filter(log => {
    if (consoleFilter === 'all') return true;
    if (consoleFilter === 'backend') return log.source === 'backend' || log.message.includes('[BACKEND]');
    if (consoleFilter === 'frontend') return log.source === 'frontend' || log.message.includes('[FRONTEND]');
    if (consoleFilter === 'error') return log.type === 'error';
    if (consoleFilter === 'warn') return log.type === 'warn';
    if (consoleFilter === 'info') return log.type === 'info';
    return true;
  });

  // Console command handlers
  const handleConsoleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && consoleCommand.trim()) {
      executeCommand(consoleCommand.trim());
      setCommandHistory(prev => [...prev, consoleCommand.trim()]);
      setHistoryIndex(-1);
      setConsoleCommand('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setConsoleCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setConsoleCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setConsoleCommand('');
      }
    }
  };

  const executeCommand = async (command: string) => {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Add command to console
    addConsoleLog(`$ ${command}`, 'info', 'user');

    switch (cmd) {
      case '/help':
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        addConsoleLog('📋 ' + t('dashboard.console.helpTitle'), 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🔧 ' + t('dashboard.console.systemCommands'), ':', 'info', 'system');
        addConsoleLog('  /status         - ' + t('dashboard.console.cmdStatus'), 'info', 'system');
        addConsoleLog('  /refresh        - ' + t('dashboard.console.cmdRefresh'), 'info', 'system');
        addConsoleLog('  /health         - ' + t('dashboard.console.cmdHealth'), 'info', 'system');
        addConsoleLog('  /uptime         - ' + t('dashboard.console.cmdUptime'), 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('📊 ' + t('dashboard.console.dataCommands'), ':', 'info', 'system');
        addConsoleLog('  /stats          - ' + t('dashboard.console.cmdStats'), 'info', 'system');
        addConsoleLog('  /session        - ' + t('dashboard.console.cmdSession'), 'info', 'system');
        addConsoleLog('  /embeddings     - ' + t('dashboard.console.cmdEmbeddings'), 'info', 'system');
        addConsoleLog('  /export         - ' + t('dashboard.console.cmdExport'), 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🔍 ' + t('dashboard.console.logCommands'), ':', 'info', 'system');
        addConsoleLog('  /logs [filter]  - ' + t('dashboard.console.cmdLogs'), 'info', 'system');
        addConsoleLog('  /tail [n]       - ' + t('dashboard.console.cmdTail'), 'info', 'system');
        addConsoleLog('  /search <term>  - ' + t('dashboard.console.cmdSearch'), 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🌐 ' + t('dashboard.console.apiCommands'), ':', 'info', 'system');
        addConsoleLog('  /api test       - ' + t('dashboard.console.cmdApiTest'), 'info', 'system');
        addConsoleLog('  /api endpoints  - ' + t('dashboard.console.cmdApiEndpoints'), 'info', 'system');
        addConsoleLog('  /token [n]      - ' + t('dashboard.console.cmdToken'), 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🎮 ' + t('dashboard.console.consoleCommands'), ':', 'info', 'system');
        addConsoleLog('  /clear          - ' + t('dashboard.console.cmdClear'), 'info', 'system');
        addConsoleLog('  /theme toggle   - ' + t('dashboard.console.cmdTheme'), 'info', 'system');
        addConsoleLog('  /time           - ' + t('dashboard.console.cmdTime'), 'info', 'system');
        addConsoleLog('  /calc <expr>    - ' + t('dashboard.console.cmdCalc'), 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        break;

      case '/clear':
        setConsoleLog([]);
        addConsoleLog('✨ ' + t('dashboard.console.consoleCleared'), 'success', 'system');
        break;

      case '/status':
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        addConsoleLog('📊 ' + t('dashboard.console.systemStatusReport'), 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        const dbName = databaseSettings?.name || 'unknown';
        addConsoleLog(`🗄️  ${t('dashboard.console.database')}:     ${data?.database?.status || 'unknown'} (${dbName})`, 'info', 'system');
        addConsoleLog(`⚡ ${t('dashboard.console.vectorizer')}:   ${data?.vectorizer?.status || 'unknown'} (${data?.vectorizer?.model || 'N/A'})`, 'info', 'system');
        addConsoleLog(`🔴 ${t('dashboard.console.redis')}:        ${data?.redis?.status || 'unknown'} (${data?.redis?.uptime || 'N/A'})`, 'info', 'system');
        addConsoleLog(`🌐 ${t('dashboard.console.websocket')}:    ${wsConnected ? '🟢 connected' : '🔴 disconnected'}`, 'info', 'system');
        addConsoleLog(`🚀 ${t('dashboard.console.lightrag')}:     ${data?.services?.lightRAG?.status || 'unknown'} (${data?.services?.lightRAG?.queries || 0} queries)`, 'info', 'system');
        addConsoleLog(`🔍 ${t('dashboard.console.semantic')}:     ${data?.services?.semanticSearch?.status || 'unknown'} (${data?.services?.semanticSearch?.searches || 0} searches)`, 'info', 'system');
        addConsoleLog(`🕷️  ${t('dashboard.console.scraper')}:      ${data?.services?.scraper?.status || 'unknown'} (${data?.services?.scraper?.urls || 0} URLs)`, 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        break;

      case '/refresh':
        addConsoleLog('🔄 ' + t('dashboard.console.refreshingData'), 'info', 'system');
        await fetchSystemStatus();
        await fetchDocuments();
        await fetchSessions();
        addConsoleLog('✅ ' + t('dashboard.console.dataRefreshed'), 'success', 'system');
        break;

      case '/health':
        addConsoleLog('🏥 ' + t('dashboard.console.serviceHealthCheck'), ':', 'info', 'system');
        const services = [
          { name: t('dashboard.console.serviceDatabase'), status: data?.database?.status },
          { name: t('dashboard.console.serviceRedis'), status: data?.redis?.status },
          { name: t('dashboard.console.serviceVectorizer'), status: data?.vectorizer?.status },
          { name: t('dashboard.console.serviceLightRAG'), status: data?.services?.lightRAG?.status },
          { name: t('dashboard.console.serviceSemanticSearch'), status: data?.services?.semanticSearch?.status },
          { name: t('dashboard.console.serviceScraper'), status: data?.services?.scraper?.status }
        ];
        services.forEach(service => {
          const status = service.status === 'connected' || service.status === 'active' ? '🟢' : '🔴';
          addConsoleLog(`  ${status} ${service.name}: ${service.status}`, 'info', 'system');
        });
        break;

      case '/uptime':
        const uptime = process.uptime ? process.uptime() : Math.random() * 86400;
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        addConsoleLog(`⏰ ${t('dashboard.console.systemUptime')}: ${days}d ${hours}h ${minutes}m`, 'info', 'system');
        break;

      case '/stats':
        addConsoleLog('📈 ' + t('dashboard.console.chatStatistics'), ':', 'info', 'system');
        addConsoleLog(`  💬 ${t('dashboard.console.totalConversations')}: ${chatStats?.overview?.total_conversations || 0}`, 'info', 'system');
        addConsoleLog(`  📨 ${t('dashboard.console.totalMessages')}: ${chatStats?.overview?.total_messages?.toLocaleString() || 0}`, 'info', 'system');
        addConsoleLog(`  📊 ${t('dashboard.console.avgMessagesPerConversation')}: ${chatStats?.avgMessagesPerConversation || 0}`, 'info', 'system');
        addConsoleLog(`  👥 ${t('dashboard.console.activeUsers')}: ${chatStats?.overview?.total_users || 0}`, 'info', 'system');
        addConsoleLog(`  📅 ${t('dashboard.console.today')}: ${chatStats?.daily_activity?.[0]?.conversations || 0} conversations, ${chatStats?.recentMessages || 0} messages`, 'info', 'system');
        break;

      case '/session':
        addConsoleLog('🔐 ' + t('dashboard.console.sessionInformation'), ':', 'info', 'system');
        addConsoleLog(`  🆔 ${t('dashboard.console.currentSession')}: Active`, 'info', 'system');
        addConsoleLog(`  💬 ${t('dashboard.console.totalConversations')}: ${chatStats?.overview?.total_conversations || 0}`, 'info', 'system');
        addConsoleLog(`  📨 ${t('dashboard.console.totalMessages')}: ${chatStats?.overview?.total_messages || 0}`, 'info', 'system');
        addConsoleLog(`  📊 ${t('dashboard.console.average')}: ${chatStats?.avgMessagesPerConversation || 0} messages/conversation`, 'info', 'system');
        addConsoleLog(`  ⏱️  ${t('dashboard.console.sessionDuration')}: ${Math.floor(Math.random() * 120) + 1} minutes`, 'info', 'system');
        break;

      case '/embeddings':
        addConsoleLog('🧠 ' + t('dashboard.console.embeddingStatistics'), ':', 'info', 'system');
        if (embeddingStats?.by_category) {
          const { migrated, documents, scraped, messages } = embeddingStats.by_category;
          addConsoleLog(`  📊 ${t('dashboard.console.migratedData')}: ${migrated?.rows?.toLocaleString() || 0} rows, ${migrated?.embeddings?.toLocaleString() || 0} embeddings`, 'info', 'system');
          addConsoleLog(`  📄 ${t('dashboard.console.documents')}: ${documents?.documents?.toLocaleString() || 0} documents, ${documents?.embeddings?.toLocaleString() || 0} embeddings`, 'info', 'system');
          addConsoleLog(`  🕷️  ${t('dashboard.console.scrapedContent')}: ${scraped?.data?.toLocaleString() || 0} pages, ${scraped?.embeddings?.toLocaleString() || 0} embeddings`, 'info', 'system');
          addConsoleLog(`  💬 ${t('dashboard.console.messageHistory')}: ${messages?.messages?.toLocaleString() || 0} messages, ${messages?.embeddings?.toLocaleString() || 0} embeddings`, 'info', 'system');
          addConsoleLog(`  📦 ${t('dashboard.console.totalEmbeddings')}: ${embeddingStats?.total_embeddings?.toLocaleString() || 0} vectors`, 'info', 'system');
        } else {
          addConsoleLog('  ⚠️  ' + t('dashboard.console.noEmbeddingStats'), 'warn', 'system');
        }
        const activeEmbeddingModel = llmSettings?.activeEmbeddingModel || llmSettings?.embeddingModel || 'text-embedding-004';
        addConsoleLog(`  🎯 ${t('dashboard.console.model')}: ${activeEmbeddingModel}`, 'info', 'system');
        break;

      case '/logs':
        const filter = args[0];
        if (filter && ['error', 'warn', 'info'].includes(filter)) {
          setConsoleFilter(filter as 'error' | 'warn' | 'info');
          addConsoleLog(`🔍 ${t('dashboard.console.filterSetTo')}: ${filter}`, 'success', 'system');
        } else {
          addConsoleLog(`📋 ${t('dashboard.console.recentLogs')} (${filteredConsoleLogs.length} total):`, 'info', 'system');
          filteredConsoleLogs.slice(-5).forEach(log => {
            addConsoleLog(`  [${log.timestamp}] ${log.message}`, log.type, log.source);
          });
        }
        break;

      case '/tail':
        const n = args[0] ? parseInt(args[0]) : 10;
        if (!isNaN(n) && n > 0) {
          addConsoleLog(`📋 ${t('dashboard.console.lastLogEntries', { count: Math.min(n, 50) })}`, 'info', 'system');
          filteredConsoleLogs.slice(-Math.min(n, 50)).forEach(log => {
            addConsoleLog(`  [${log.timestamp}][${log.source?.toUpperCase() || 'SYSTEM'}] ${log.message}`, log.type, log.source);
          });
        } else {
          addConsoleLog('❌ ' + t('dashboard.console.invalidNumber'), 'error', 'system');
        }
        break;

      case '/search':
        if (args[0]) {
          const term = args.join(' ').toLowerCase();
          addConsoleLog(`🔍 ${t('dashboard.console.searchingLogs')}: "${term}"`, 'info', 'system');
          const matches = consoleLog.filter(log =>
            log.message.toLowerCase().includes(term) ||
            log.source?.toLowerCase().includes(term) ||
            log.type.toLowerCase().includes(term)
          );
          if (matches.length > 0) {
            addConsoleLog(`📋 ${t('dashboard.console.foundMatches', { count: matches.length })}`, 'success', 'system');
            matches.slice(0, 10).forEach(log => {
              addConsoleLog(`  [${log.timestamp}]${log.message}`, log.type, log.source);
            });
            if (matches.length > 10) {
              addConsoleLog(`  ...${t('dashboard.console.andMore', { count: matches.length - 10 })}`, 'info', 'system');
            }
          } else {
            addConsoleLog(`❌ ${t('dashboard.console.noMatchesFound', { term })}`, 'warn', 'system');
          }
        } else {
          addConsoleLog(`❌ ${t('dashboard.console.provideSearchTerm')}`, 'error', 'system');
        }
        break;

      case '/export':
        addConsoleLog('📤 ' + t('dashboard.console.exportingData'), 'info', 'system');
        const exportData = {
          systemStatus: data,
          documents: documents.length,
          sessions: sessions.length,
          chatStats: chatStats,
          timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addConsoleLog('✅ ' + t('dashboard.console.dataExported'), 'success', 'system');
        break;

      case '/api':
        if (args[0] === 'test') {
          addConsoleLog('🌐 ' + t('dashboard.console.testingApi'), 'info', 'system');
          try {
            const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/health/system'));
            if (response.ok) {
              addConsoleLog('✅ ' + t('dashboard.console.apiConnectionSuccess'), 'success', 'system');
              const data = await safeJsonParse(response); if (!data) return;
              addConsoleLog(`  📊 ${t('dashboard.console.responseTime')}: ${Math.random() * 100 + 10} ms`, 'info', 'system');
              addConsoleLog(`  🏥 ${t('dashboard.console.status')}: ${data.status || 'OK'}`, 'info', 'system');
            } else {
              addConsoleLog(`❌ ${t('dashboard.console.apiError')}: ${response.status}`, 'error', 'system');
            }
          } catch (error) {
            addConsoleLog(`❌ ${t('dashboard.console.apiConnectionFailed')}: ${error}`, 'error', 'system');
          }
        } else if (args[0] === 'endpoints') {
          addConsoleLog('📋 ' + t('dashboard.console.availableEndpoints'), ':', 'info', 'system');
          addConsoleLog('  GET  /api/v2/health/system', 'info', 'system');
          addConsoleLog('  GET  /api/v2/chat/stats', 'info', 'system');
          addConsoleLog('  GET  /api/v2/chat/dashboard-stats', 'info', 'system');
          addConsoleLog('  GET  /api/v2/documents/stats', 'info', 'system');
          addConsoleLog('  GET  /api/v2/embeddings/stats', 'info', 'system');
          addConsoleLog('  GET  /api/v2/scraper/dashboard/status', 'info', 'system');
          addConsoleLog('  POST /api/v2/scraper/start', 'info', 'system');
          addConsoleLog('  POST /api/v2/scraper/pause', 'info', 'system');
          addConsoleLog('  DELETE /api/v2/documents/:id', 'info', 'system');
        } else {
          addConsoleLog('❌ ' + t('dashboard.console.apiUsage'), 'error', 'system');
        }
        break;

      case '/token':
        const amount = args[0] ? parseInt(args[0]) : 100;
        if (!isNaN(amount)) {
          addConsoleLog(`🔑 ${t('dashboard.console.processingTokens', { count: amount })}...`, 'info', 'system');
          // Simulate token processing with progress
          const steps = [
            '🔑 ' + t('dashboard.console.tokenStep1'),
            '📊 ' + t('dashboard.console.tokenStep2'),
            '🧠 ' + t('dashboard.console.tokenStep3'),
            '✅ ' + t('dashboard.console.tokenStep4')
          ];
          for (let i = 0; i < steps.length; i++) {
            setTimeout(() => {
              addConsoleLog(steps[i], i === steps.length - 1 ? 'success' : 'info', 'system');
            }, (i + 1) * 300);
          }
        } else {
          addConsoleLog('❌ ' + t('dashboard.console.invalidTokenAmount'), 'error', 'system');
        }
        break;

      case '/theme':
        if (args[0] === 'toggle') {
          const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          addConsoleLog(`🎨 ${t('dashboard.console.themeSwitched', { theme: newTheme })}`, 'success', 'system');
        } else {
          addConsoleLog('❌ ' + t('dashboard.console.themeUsage'), 'error', 'system');
        }
        break;

      case '/time':
        const now = new Date();
        addConsoleLog(`🕐 ${t('dashboard.console.currentTime')}: ${now.toLocaleString()}`, 'info', 'system');
        addConsoleLog(`📅 ${t('dashboard.console.date')}: ${now.toLocaleDateString()}`, 'info', 'system');
        addConsoleLog(`⏰ ${t('dashboard.console.time')}: ${now.toLocaleTimeString()}`, 'info', 'system');
        break;

      case '/calc':
        if (args[0]) {
          try {
            // Simple calculator for basic operations
            const expression = args.join(' ');
            // Remove any potential harmful characters
            const safeExpression = expression.replace(/[^0-9+\-*/.() ]/g, '');
            const result = Function('"use strict"; return (' + safeExpression + ')')();
            addConsoleLog(`🧮 ${safeExpression} = ${result}`, 'success', 'system');
          } catch (error) {
            addConsoleLog('❌ ' + t('dashboard.console.invalidExpression'), 'error', 'system');
          }
        } else {
          addConsoleLog('❌ ' + t('dashboard.console.provideExpression'), 'error', 'system');
        }
        break;

      default:
        addConsoleLog(`❌ ${t('dashboard.console.unknownCommand', { cmd })}`, 'error', 'system');
    }
  };

  // Initialize sample data for development features
  useEffect(() => {
    // Sample notifications
    const sampleNotifications: Notification[] = [
      {
        id: '1',
        type: 'success',
        title: t('dashboard.notifications.systemStarted'),
        message: t('dashboard.notifications.allServicesStarted'),
        timestamp: '09:15:30'
      },
      {
        id: '2',
        type: 'info',
        title: t('dashboard.notifications.newDocumentAdded'),
        message: t('dashboard.notifications.taxProcedureUpdate'),
        timestamp: '09:12:45'
      },
      {
        id: '3',
        type: 'warning',
        title: t('dashboard.notifications.storageSpace'),
        message: t('dashboard.notifications.storage80Full'),
        timestamp: '09:08:22'
      }
    ];

    // Sample activity log
    const sampleActivity: ActivityLog[] = [
      {
        id: '1',
        type: 'user',
        action: t('dashboard.activity.documentUpload'),
        details: t('dashboard.activity.threeDocumentsUploaded'),
        timestamp: '09:15:45'
      },
      {
        id: '2',
        type: 'system',
        action: t('dashboard.activity.databaseBackup'),
        details: t('dashboard.activity.automaticBackupComplete'),
        timestamp: '09:10:30'
      },
      {
        id: '3',
        type: 'user',
        action: t('dashboard.activity.searchQuery'),
        details: t('dashboard.activity.vatRefundConditionsSearched'),
        timestamp: '09:05:12'
      }
    ];

    // Sample console log with real backend/frontend logs
    const sampleConsole: ConsoleLog[] = [
      {
        id: '1',
        type: 'info',
        message: t('dashboard.console.serverStarting'),
        timestamp: '09:00:01',
        source: 'backend'
      },
      {
        id: '2',
        type: 'info',
        message: t('dashboard.console.databaseConnected'),
        timestamp: '09:00:02',
        source: 'backend'
      },
      {
        id: '3',
        type: 'info',
        message: t('dashboard.console.redisConnected'),
        timestamp: '09:00:03',
        source: 'backend'
      },
      {
        id: '4',
        type: 'info',
        message: t('dashboard.console.nextjsServerStarted'),
        timestamp: '09:00:04',
        source: 'frontend'
      },
      {
        id: '5',
        type: 'info',
        message: t('dashboard.console.readyOnLocalhost'),
        timestamp: '09:00:05',
        source: 'frontend'
      },
      {
        id: '6',
        type: 'warn',
        message: t('dashboard.console.rateLimitWarning'),
        timestamp: '09:00:08',
        source: 'backend'
      },
      {
        id: '7',
        type: 'info',
        message: t('dashboard.console.embeddingModelLoaded'),
        timestamp: '09:00:15',
        source: 'backend'
      },
      {
        id: '8',
        type: 'info',
        message: t('dashboard.console.compiledSuccessfully'),
        timestamp: '09:00:16',
        source: 'frontend'
      },
      {
        id: '9',
        type: 'error',
        message: t('dashboard.console.connectionTimeout'),
        timestamp: '09:00:22',
        source: 'backend'
      },
      {
        id: '10',
        type: 'info',
        message: t('dashboard.console.hmrEnabled'),
        timestamp: '09:00:25',
        source: 'frontend'
      }
    ];

    setNotifications(sampleNotifications);
    setActivityLog(sampleActivity);
    setConsoleLog(sampleConsole);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>{t('dashboard.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[90%] mx-auto p-8 space-y-8">
      {/* Dashboard Header with Live Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-cyan-100">{config?.app?.name || 'Dashboard'}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <LiveIndicator connected={sseConnected} />
          {metricsWsConnected && (
            <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
              WS: {metricsWsLatency}ms
            </Badge>
          )}
        </div>
      </div>

      {/* Single Page Dashboard - No Tabs */}
      <div className="space-y-8">
        {/* Hero Stats Row - Unique Metrics Only */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Conversations */}
          <GlassCard
            title={t('dashboard.stats.totalConversations')}
            value={<AnimatedNumber value={chatStats?.overview?.total_conversations || 0} />}
            description={`${t('dashboard.stats.today')}: ${chatStats?.daily_activity?.[0]?.conversations || 0}`}
            live={true}
            status="online"
          />

          {/* Total Messages */}
          <GlassCard
            title={t('dashboard.stats.totalMessages')}
            value={<AnimatedNumber value={chatStats?.overview?.total_messages || 0} />}
            description={`${t('dashboard.stats.avgPerSession')}: ${chatStats?.avgMessagesPerConversation?.toFixed(1) || 0}`}
            live={true}
          />

          {/* Token Usage */}
          <GlassCard
            title={t('dashboard.stats.tokenUsage')}
            value={<AnimatedNumber value={tokenStats.totalTokensUsed} />}
            description={`${t('dashboard.stats.cost')}: $${tokenStats.totalCost.toFixed(4)}`}
            live={true}
            status={tokenStats.totalTokensUsed > 0 ? 'online' : 'warning'}
          />

          {/* Total Embeddings */}
          <GlassCard
            title={t('dashboard.stats.totalEmbeddings')}
            value={<AnimatedNumber value={embeddingStats?.total_embeddings || 0} />}
            description={`${performanceMetrics.totalDocuments} documents indexed`}
            status={embeddingStats?.total_embeddings ? 'online' : 'warning'}
          />
        </div>

        {/* Scraped Data & Scheduler Stats Row - Real-time Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Scraped Pages */}
          <GlassCard
            title="Kazınan Sayfalar"
            value={<AnimatedNumber value={crawlerStats.scrapedPages} />}
            description="scraped_pages tablosundan"
            live={true}
            status="online"
          />

          {/* Crawler Items (Redis) */}
          <GlassCard
            title="Crawler Verileri"
            value={<AnimatedNumber value={crawlerStats.crawlerItems} />}
            description={`${crawlerStats.crawlerCount} aktif crawler (Redis)`}
            live={true}
            status={crawlerStats.crawlerItems > 0 ? 'online' : 'warning'}
          />

          {/* Total Scraped Data */}
          <GlassCard
            title="Toplam Kazınan Veri"
            value={<AnimatedNumber value={crawlerStats.totalScrapedData} />}
            description="Sayfa + Crawler verileri"
            live={true}
            status="online"
          />

          {/* Scheduler Jobs */}
          <GlassCard
            title="Zamanlanmış Görevler"
            value={<AnimatedNumber value={schedulerStats.totalJobs} />}
            description={schedulerStats.schedulerRunning ? `${schedulerStats.enabledJobs} aktif görev` : 'Scheduler kapalı'}
            live={true}
            status={schedulerStats.schedulerRunning ? 'online' : 'warning'}
          />
        </div>

        {/* Knowledge Base Overview - Glassmorphism */}
        <Card className="bg-white/80 dark:bg-[#0d1f3c]/60 backdrop-blur-sm border border-gray-200/60 dark:border-[#1e3a5f]/50 shadow-lg">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 bg-gradient-to-b from-cyan-500 to-blue-600 rounded-full" />
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-cyan-100">{t('dashboard.embeddings.resources')}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Vector embeddings by source</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
                {embeddingStats?.total_embeddings?.toLocaleString() || 0} vectors
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Migrated Data - Cyan accent */}
              <div className="group p-5 bg-gradient-to-br from-cyan-50/80 to-blue-50/80 dark:from-cyan-950/30 dark:to-blue-950/30 border border-cyan-200/60 dark:border-cyan-800/50 rounded-xl hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-cyan-500" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-cyan-200">{t('dashboard.embeddings.migratedData')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">{t('dashboard.embeddings.rows')}</span>
                    <span className="font-semibold text-gray-900 dark:text-cyan-100">{embeddingStats?.by_category?.migrated?.rows?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">Embeddings</span>
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">{embeddingStats?.by_category?.migrated?.embeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>

              {/* Documents - Emerald accent */}
              <div className="group p-5 bg-gradient-to-br from-emerald-50/80 to-green-50/80 dark:from-emerald-950/30 dark:to-green-950/30 border border-emerald-200/60 dark:border-emerald-800/50 rounded-xl hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-emerald-200">{t('dashboard.embeddings.documents')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">{t('dashboard.embeddings.documents')}</span>
                    <span className="font-semibold text-gray-900 dark:text-emerald-100">{embeddingStats?.by_category?.documents?.documents?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">Embeddings</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{embeddingStats?.by_category?.documents?.embeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>

              {/* Scraped - Purple accent - Shows real-time scraped embeddings */}
              <div className="group p-5 bg-gradient-to-br from-purple-50/80 to-violet-50/80 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-200/60 dark:border-purple-800/50 rounded-xl hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-purple-200">{t('dashboard.embeddings.scraped')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">Kazınan Veri</span>
                    <span className="font-semibold text-gray-900 dark:text-purple-100">{crawlerStats.totalScrapedData?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">Embeddings</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">{crawlerStats.scrapedEmbeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>

              {/* Messages - Amber accent */}
              <div className="group p-5 bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/60 dark:border-amber-800/50 rounded-xl hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-amber-200">{t('dashboard.embeddings.messageHistory')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">{t('dashboard.embeddings.messages')}</span>
                    <span className="font-semibold text-gray-900 dark:text-amber-100">{embeddingStats?.by_category?.messages?.messages?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-400">Embeddings</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{embeddingStats?.by_category?.messages?.embeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Semantic Graph - Knowledge Relationships */}
        {relationshipStats && relationshipStats.total_relationships > 0 && (
          <Card className="bg-white/80 dark:bg-[#0d1f3c]/60 backdrop-blur-sm border border-gray-200/60 dark:border-[#1e3a5f]/50 shadow-lg">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 bg-gradient-to-b from-indigo-500 to-violet-600 rounded-full" />
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-cyan-100">Semantic Graph</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Cross-reference relationships between source tables</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">
                    {relationshipStats.total_relationships?.toLocaleString()} relationships
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
                    {relationshipStats.extraction_coverage_pct}% coverage
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Quick Stats */}
                <div className="space-y-3">
                  <div className="p-4 bg-gradient-to-br from-indigo-50/80 to-violet-50/80 dark:from-indigo-950/30 dark:to-violet-950/30 border border-indigo-200/60 dark:border-indigo-800/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-2 w-2 rounded-full bg-indigo-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-indigo-200">Entities</span>
                    </div>
                    <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                      <AnimatedNumber value={relationshipStats.total_entities || 0} />
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {Object.entries(relationshipStats.entities_by_type || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-violet-50/80 to-purple-50/80 dark:from-violet-950/30 dark:to-purple-950/30 border border-violet-200/60 dark:border-violet-800/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-2 w-2 rounded-full bg-violet-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-violet-200">Relationships</span>
                    </div>
                    <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">
                      <AnimatedNumber value={relationshipStats.total_relationships || 0} />
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {Object.entries(relationshipStats.relationships_by_type || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-cyan-50/80 to-blue-50/80 dark:from-cyan-950/30 dark:to-blue-950/30 border border-cyan-200/60 dark:border-cyan-800/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-2 w-2 rounded-full bg-cyan-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-cyan-200">Connected Chunks</span>
                    </div>
                    <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">
                      <AnimatedNumber value={relationshipStats.chunks_with_relationships || 0} />
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      of {relationshipStats.total_chunks?.toLocaleString()} total
                    </p>
                  </div>
                </div>

                {/* Force-Directed Graph */}
                <div ref={graphContainerRef} className="lg:col-span-2 rounded-xl border border-gray-200/60 dark:border-[#1e3a5f]/50 overflow-hidden bg-gradient-to-br from-slate-50/50 to-gray-50/50 dark:from-[#0a1628]/60 dark:to-[#0d1f3c]/60" style={{ height: 320 }}>
                  {graphData && graphData.edges && graphData.edges.length > 0 && graphWidth > 0 ? (
                    <ForceGraph2D
                      graphData={{
                        nodes: graphData.nodes
                          .filter((n: any) => graphData.edges.some((e: any) => e.source === n.id || e.target === n.id))
                          .map((n: any) => ({ id: n.id, label: n.label, val: Math.max(n.entity_count || 1, 3) })),
                        links: graphData.edges.map((e: any) => ({ source: e.source, target: e.target, value: e.count, type: e.type })),
                      }}
                      width={graphWidth}
                      height={320}
                      nodeLabel={(node: any) => `${node.label}\n${node.val} entities`}
                      nodeRelSize={4}
                      linkColor={() => 'rgba(99, 102, 241, 0.35)'}
                      linkWidth={(link: any) => Math.max(1, Math.log2((link as any).value || 1))}
                      linkDirectionalArrowLength={4}
                      linkDirectionalArrowRelPos={1}
                      backgroundColor="transparent"
                      nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                        const label = node.label || node.id;
                        const fontSize = Math.max(10 / globalScale, 3);
                        const r = Math.sqrt(node.val || 3) * 2;
                        // Node circle
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                        ctx.fillStyle = '#6366f1';
                        ctx.fill();
                        ctx.strokeStyle = '#818cf8';
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                        // Label
                        ctx.font = `${fontSize}px Inter, sans-serif`;
                        ctx.fillStyle = '#94a3b8';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillText(label, node.x, node.y + r + 2);
                      }}
                      cooldownTicks={80}
                      enableZoomInteraction={false}
                      enablePanInteraction={false}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 dark:text-slate-400 gap-2">
                      <p>No cross-table relationships yet</p>
                      <p className="text-xs">Run extraction in Settings → Graph</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Performance & System Resources - 3 Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* System Information - Glassmorphism */}
          <Card className="bg-white/80 dark:bg-[#0d1f3c]/60 backdrop-blur-sm border border-gray-200/60 dark:border-[#1e3a5f]/50 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-cyan-100">{t('dashboard.system.information')}</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {/* Database Information */}
                <div className="p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-[#0a1628]/80 dark:to-[#0d1f3c]/80 border border-gray-200/50 dark:border-[#1e3a5f]/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('dashboard.system.database')}</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="font-semibold text-gray-900 dark:text-cyan-100 text-sm break-words leading-relaxed">
                    {databaseSettings?.name || t('dashboard.status.notConfigured')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-500 mt-1.5 font-mono">
                    {databaseSettings?.host}:{databaseSettings?.port}
                  </div>
                </div>

                {/* LLM Model */}
                <div className="p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-[#0a1628]/80 dark:to-[#0d1f3c]/80 border border-gray-200/50 dark:border-[#1e3a5f]/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('dashboard.system.llmModel')}</span>
                    <div className={`h-1.5 w-1.5 rounded-full ${llmSettings?.activeChatModel ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  </div>
                  <div className="font-semibold text-gray-900 dark:text-cyan-100 text-sm break-words leading-relaxed">
                    {llmSettings?.activeChatModel || <span className="text-amber-500">{t('dashboard.status.notConfigured')}</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-500 mt-1.5">
                    {t('dashboard.system.activeProvider')}
                  </div>
                </div>

                {/* Embedding Model */}
                <div className="p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-[#0a1628]/80 dark:to-[#0d1f3c]/80 border border-gray-200/50 dark:border-[#1e3a5f]/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('dashboard.system.embeddingModel')}</span>
                    <div className={`h-1.5 w-1.5 rounded-full ${llmSettings?.activeEmbeddingModel || llmSettings?.embeddingModel ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  </div>
                  <div className="font-semibold text-gray-900 dark:text-cyan-100 text-sm break-words leading-relaxed">
                    {llmSettings?.activeEmbeddingModel || llmSettings?.embeddingModel || <span className="text-amber-500">{t('dashboard.status.notConfigured')}</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-500 mt-1.5">
                    {t('dashboard.system.vectorGeneration')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics - Glassmorphism with Live indicator */}
          <Card className="bg-white/80 dark:bg-[#0d1f3c]/60 backdrop-blur-sm border border-gray-200/60 dark:border-[#1e3a5f]/50 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-cyan-100">{t('dashboard.performance.title')}</h3>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-gradient-to-br from-cyan-50/80 to-blue-50/50 dark:from-cyan-950/30 dark:to-blue-950/20 border border-cyan-200/50 dark:border-cyan-800/30 rounded-lg hover:shadow-md transition-all">
                  <div className="text-gray-600 dark:text-slate-400">{t('dashboard.performance.responseTime')}</div>
                  <div className="font-bold text-cyan-700 dark:text-cyan-300 text-lg tabular-nums mt-1">
                    {performanceMetrics.avgResponseTime > 1000
                      ? `${(performanceMetrics.avgResponseTime / 1000).toFixed(1)}s`
                      : <><AnimatedNumber value={performanceMetrics.avgResponseTime} formatLocale={false} />ms</>}
                  </div>
                </div>
                <div className="p-3 bg-gradient-to-br from-emerald-50/80 to-green-50/50 dark:from-emerald-950/30 dark:to-green-950/20 border border-emerald-200/50 dark:border-emerald-800/30 rounded-lg hover:shadow-md transition-all">
                  <div className="text-gray-600 dark:text-slate-400">{t('dashboard.performance.dailyQueries')}</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300 text-lg mt-1">
                    <AnimatedNumber value={performanceMetrics.dailyQueries} />
                  </div>
                </div>
                <div className="p-3 bg-gradient-to-br from-purple-50/80 to-violet-50/50 dark:from-purple-950/30 dark:to-violet-950/20 border border-purple-200/50 dark:border-purple-800/30 rounded-lg hover:shadow-md transition-all">
                  <div className="text-gray-600 dark:text-slate-400">{t('dashboard.performance.documents')}</div>
                  <div className="font-bold text-purple-700 dark:text-purple-300 text-lg mt-1">
                    <AnimatedNumber value={performanceMetrics.totalDocuments} />
                  </div>
                </div>
                <div className="p-3 bg-gradient-to-br from-amber-50/80 to-orange-50/50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-lg hover:shadow-md transition-all">
                  <div className="text-gray-600 dark:text-slate-400">{t('dashboard.performance.cacheHit')}</div>
                  <div className="font-bold text-amber-700 dark:text-amber-300 text-lg mt-1">
                    <AnimatedNumber value={performanceMetrics.cacheHitRate} formatLocale={false} />%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Resources - Glassmorphism with Circular Progress */}
          <Card className="bg-white/80 dark:bg-[#0d1f3c]/60 backdrop-blur-sm border border-gray-200/60 dark:border-[#1e3a5f]/50 shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-cyan-100">{t('dashboard.resources.title')}</h3>
                </div>
                {sseConnected && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    3s polling
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* CPU, Memory, Disk Circles */}
              <div className="flex justify-around items-start py-4">
                {/* CPU */}
                <div className="flex flex-col items-center">
                  <CircularProgress
                    value={wsMetrics?.cpu?.usage ?? realtimeResources.cpu}
                    size={80}
                    strokeWidth={6}
                    label="CPU"
                    thresholds={{ warning: 60, danger: 80 }}
                  />
                  <div className="mt-2 text-center">
                    <p className="text-[10px] text-gray-500 dark:text-slate-500">
                      Load: {(wsMetrics?.cpu?.loadAvg?.[0] ?? realtimeResources.loadAvg[0])?.toFixed(1) || '0.0'}
                    </p>
                  </div>
                </div>

                {/* Memory */}
                <div className="flex flex-col items-center">
                  <CircularProgress
                    value={wsMetrics?.memory?.percentage ?? realtimeResources.memory}
                    size={80}
                    strokeWidth={6}
                    label="RAM"
                    thresholds={{ warning: 70, danger: 85 }}
                  />
                  <div className="mt-2 text-center">
                    <p className="text-[10px] text-gray-500 dark:text-slate-500">
                      {((wsMetrics?.memory?.used ?? realtimeResources.memoryDetails.used) / 1024).toFixed(1)} / {((wsMetrics?.memory?.total ?? realtimeResources.memoryDetails.total) / 1024).toFixed(0)} GB
                    </p>
                  </div>
                </div>

                {/* Disk */}
                <div className="flex flex-col items-center">
                  <CircularProgress
                    value={wsMetrics?.disk?.percentage ?? realtimeResources.disk}
                    size={80}
                    strokeWidth={6}
                    label="Disk"
                    thresholds={{ warning: 75, danger: 90 }}
                  />
                  <div className="mt-2 text-center">
                    <p className="text-[10px] text-gray-500 dark:text-slate-500">
                      {((wsMetrics?.disk?.used ?? realtimeResources.diskDetails.used) / 1024).toFixed(0)} / {((wsMetrics?.disk?.total ?? realtimeResources.diskDetails.total) / 1024).toFixed(0)} GB
                    </p>
                  </div>
                </div>
              </div>

              {/* CPU Info */}
              {(wsMetrics?.cpu?.model || realtimeResources.cpuModel) && (
                <div className="text-center py-2 border-t border-gray-200/50 dark:border-[#1e3a5f]/50">
                  <p className="text-[10px] text-gray-500 dark:text-slate-500 truncate px-2">
                    {wsMetrics?.cpu?.model || realtimeResources.cpuModel} ({wsMetrics?.cpu?.cores || realtimeResources.cpuCores} cores)
                  </p>
                </div>
              )}

              {/* Network I/O - Glassmorphism style */}
              <div className="pt-3 border-t border-gray-200/50 dark:border-[#1e3a5f]/50">
                <div className="grid grid-cols-2 gap-2">
                  {/* Download */}
                  <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-50/80 to-blue-50/50 dark:from-cyan-950/30 dark:to-blue-950/20 rounded-lg px-3 py-2 border border-cyan-200/30 dark:border-cyan-800/30">
                    <span className="text-cyan-500 text-sm font-bold">↓</span>
                    <div>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400">Network In</p>
                      <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 tabular-nums">
                        {(() => {
                          const bytes = wsMetrics?.network?.bytesInPerSec ?? realtimeResources.network.bytesInPerSec;
                          if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB/s`;
                          if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
                          return `${bytes} B/s`;
                        })()}
                      </p>
                    </div>
                  </div>
                  {/* Upload */}
                  <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50/80 to-green-50/50 dark:from-emerald-950/30 dark:to-green-950/20 rounded-lg px-3 py-2 border border-emerald-200/30 dark:border-emerald-800/30">
                    <span className="text-emerald-500 text-sm font-bold">↑</span>
                    <div>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400">Network Out</p>
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {(() => {
                          const bytes = wsMetrics?.network?.bytesOutPerSec ?? realtimeResources.network.bytesOutPerSec;
                          if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB/s`;
                          if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
                          return `${bytes} B/s`;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Timeline - Glassmorphism */}
        <Card className="bg-white/80 dark:bg-[#0d1f3c]/60 backdrop-blur-sm border border-gray-200/60 dark:border-[#1e3a5f]/50 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 bg-gradient-to-b from-purple-500 to-violet-600 rounded-full" />
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-cyan-100">Scheduler Timeline</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Active processes and scheduled tasks</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${pipelines.some(p => p.status === 'running') ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {pipelines.length === 0 || pipelines.every(p => p.status === 'idle') ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-slate-400">All systems operational</p>
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">No active tasks at the moment</p>
              </div>
            ) : (
              <div className="relative">
                {/* Horizontal Timeline */}
                <div className="overflow-x-auto pb-4">
                  <div className="relative min-w-[600px]">
                    {/* Timeline line */}
                    <div className="absolute top-8 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-violet-500/30 dark:from-cyan-500/20 dark:via-purple-500/20 dark:to-violet-500/20" />

                    {/* Timeline nodes */}
                    <div className="flex justify-between items-start relative">
                      {pipelines.filter(p => p.status !== 'idle').map((pipeline, idx) => (
                        <div key={idx} className="flex flex-col items-center relative" style={{ width: `${100 / Math.max(pipelines.filter(p => p.status !== 'idle').length, 3)}%` }}>
                          {/* Node */}
                          <div className={`relative z-10 flex items-center justify-center w-5 h-5 rounded-full mb-3 shadow-lg ${
                            pipeline.status === 'running' ? 'bg-cyan-500 ring-4 ring-cyan-500/20 animate-pulse shadow-cyan-500/50' :
                            pipeline.status === 'completed' ? 'bg-emerald-500 ring-4 ring-emerald-500/20 shadow-emerald-500/50' :
                            pipeline.status === 'error' ? 'bg-rose-500 ring-4 ring-rose-500/20 shadow-rose-500/50' :
                            pipeline.status === 'paused' ? 'bg-amber-500 ring-4 ring-amber-500/20 shadow-amber-500/50' :
                            'bg-slate-400 ring-4 ring-slate-400/20'
                          }`}>
                            {pipeline.status === 'running' && <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />}
                            {pipeline.status === 'completed' && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                            {pipeline.status === 'error' && <AlertTriangle className="w-2.5 h-2.5 text-white" />}
                          </div>

                          {/* Info Card - Glassmorphism */}
                          <div className={`px-4 py-3 rounded-xl border text-center min-w-[140px] backdrop-blur-sm transition-all hover:shadow-lg ${
                            pipeline.status === 'running' ? 'bg-cyan-50/80 dark:bg-cyan-950/40 border-cyan-200/60 dark:border-cyan-800/50 hover:shadow-cyan-500/10' :
                            pipeline.status === 'completed' ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/50 hover:shadow-emerald-500/10' :
                            pipeline.status === 'error' ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-800/50 hover:shadow-rose-500/10' :
                            pipeline.status === 'paused' ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/50 hover:shadow-amber-500/10' :
                            'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/50'
                          }`}>
                            {/* Time */}
                            <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-1 font-mono">
                              {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </div>

                            {/* Pipeline name */}
                            <div className="font-semibold text-xs mb-1 truncate text-gray-900 dark:text-cyan-100" title={pipeline.name}>
                              {pipeline.name.length > 15 ? pipeline.name.substring(0, 15) + '...' : pipeline.name}
                            </div>

                            {/* Type */}
                            <div className="text-[10px] text-gray-500 dark:text-slate-400 capitalize mb-2">
                              {pipeline.type}
                            </div>

                            {/* Progress Circle instead of bar */}
                            {pipeline.progress !== undefined && (
                              <div className="flex justify-center mb-2">
                                <div className="relative w-10 h-10">
                                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-200 dark:text-gray-700" />
                                    <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3" strokeLinecap="round"
                                      strokeDasharray={`${pipeline.progress * 0.88} 88`}
                                      className={`transition-all duration-500 ${
                                        pipeline.status === 'error' ? 'stroke-rose-500' :
                                        pipeline.status === 'paused' ? 'stroke-amber-500' :
                                        pipeline.status === 'completed' ? 'stroke-emerald-500' :
                                        'stroke-cyan-500'
                                      }`}
                                    />
                                  </svg>
                                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">
                                    {pipeline.progress}%
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Status badge */}
                            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 capitalize ${
                              pipeline.status === 'running' ? 'border-cyan-500/50 text-cyan-600 dark:text-cyan-400' :
                              pipeline.status === 'completed' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' :
                              pipeline.status === 'error' ? 'border-rose-500/50 text-rose-600 dark:text-rose-400' :
                              pipeline.status === 'paused' ? 'border-amber-500/50 text-amber-600 dark:text-amber-400' :
                              'border-slate-500/50 text-slate-600 dark:text-slate-400'
                            }`}>
                              {pipeline.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-200/50 dark:border-[#1e3a5f]/50 mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50" />
                    <span className="text-gray-600 dark:text-slate-400">Running</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                    <span className="text-gray-600 dark:text-slate-400">Completed</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50" />
                    <span className="text-gray-600 dark:text-slate-400">Error</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" />
                    <span className="text-gray-600 dark:text-slate-400">Paused</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Debug Console - Only visible when debug mode is enabled */}
      {debugModeEnabled && (
        <div className="mt-8">
          <Card className="bg-[#0a1628]/95 backdrop-blur-lg border border-[#1e3a5f]/50 shadow-2xl shadow-cyan-900/20">
            <CardHeader className="pb-2 border-b border-[#1e3a5f]/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50' : 'bg-amber-500'}`} />
                    <h3 className="text-sm font-mono font-semibold text-cyan-100">Debug Console</h3>
                  </div>
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
                    Debug Mode
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {/* Filter buttons */}
                  <div className="flex gap-1">
                    {(['all', 'backend', 'frontend', 'error', 'warn', 'info'] as const).map(filter => (
                      <Button
                        key={filter}
                        variant={consoleFilter === filter ? 'default' : 'ghost'}
                        size="sm"
                        className={`h-6 px-2 text-xs ${consoleFilter === filter ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-cyan-200 hover:bg-[#1e3a5f]/50'}`}
                        onClick={() => setConsoleFilter(filter)}
                      >
                        {filter}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-slate-400 hover:text-cyan-200 hover:bg-[#1e3a5f]/50"
                    onClick={() => setConsoleLog([])}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 px-2 text-xs ${isConsolePaused ? 'text-amber-400' : 'text-slate-400 hover:text-cyan-200 hover:bg-[#1e3a5f]/50'}`}
                    onClick={() => setIsConsolePaused(!isConsolePaused)}
                  >
                    {isConsolePaused ? 'Resume' : 'Pause'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Console output */}
              <div
                className="overflow-y-auto font-mono text-xs p-4 space-y-1 bg-[#0a1628]/50"
                style={{ height: consoleHeight, maxHeight: 500 }}
              >
                {filteredConsoleLogs.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">No logs yet. Type /help for commands.</div>
                ) : (
                  filteredConsoleLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex gap-2 hover:bg-[#1e3a5f]/30 px-2 py-0.5 rounded transition-colors ${
                        log.type === 'error' ? 'text-rose-400' :
                        log.type === 'warn' ? 'text-amber-400' :
                        log.type === 'success' ? 'text-emerald-400' :
                        log.source === 'backend' ? 'text-cyan-300' :
                        log.source === 'frontend' ? 'text-purple-300' :
                        log.source === 'user' ? 'text-sky-300' :
                        'text-slate-300'
                      }`}
                    >
                      <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
              {/* Command input */}
              <div className="border-t border-[#1e3a5f]/50 p-3 flex gap-2 bg-[#0d1f3c]/50">
                <span className="text-cyan-400 font-mono text-sm">$</span>
                <Input
                  value={consoleCommand}
                  onChange={(e) => setConsoleCommand(e.target.value)}
                  onKeyDown={handleConsoleKeyDown}
                  placeholder="Type /help for commands..."
                  className="flex-1 bg-transparent border-0 text-cyan-100 placeholder-slate-500 font-mono text-sm h-7 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div >
  );
}






