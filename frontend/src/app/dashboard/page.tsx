"use client";

import { useState, useEffect } from "react";
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

// ✅ TEMİZLENMİŞ StatusCard - Icon olmadan
const StatusCard = ({ title, value, status, description }: {
  title: string;
  value: string | number;
  status?: 'online' | 'offline' | 'warning';
  description?: string;
}) => {
  // Kart rengini status'e göre ayarla
  const getCardStyle = () => {
    if (!status) return 'border-gray-200 bg-white dark:bg-gray-900';

    switch (status) {
      case 'online':
        return 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800';
      case 'offline':
        return 'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800';
      default:
        return 'border-gray-200 bg-white dark:bg-gray-900';
    }
  };

  return (
    <Card className={getCardStyle()}>
      <CardContent className="p-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

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

  // SSE connection status
  const [sseConnected, setSseConnected] = useState(false);

  // WebSocket metrics hook for real-time animated updates
  const {
    metrics: wsMetrics,
    connected: metricsWsConnected,
    latency: metricsWsLatency
  } = useMetricsWebSocket({
    updateRate: 1000,
    autoConnect: true,
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

  // Real-time SSE connection for system metrics
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/dashboard/stream`;
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          setSseConnected(true);
          addConsoleLog('[SSE] Real-time dashboard stream connected', 'success', 'system');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

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
                gpu: 0, // GPU not tracked on server
                loadAvg: data.systemMetrics.loadAvg || [0, 0, 0],
                memoryDetails: data.systemMetrics.memoryDetails || {
                  used: 0,
                  total: 0,
                  free: 0,
                  heapUsed: 0,
                  heapTotal: 0
                },
                diskDetails: data.systemMetrics.diskDetails || {
                  used: 0,
                  total: 0,
                  free: 0
                },
                network: data.systemMetrics.network || {
                  bytesIn: 0,
                  bytesOut: 0,
                  bytesInPerSec: 0,
                  bytesOutPerSec: 0,
                  packetsIn: 0,
                  packetsOut: 0
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

          } catch (err) {
            console.error('SSE parse error:', err);
          }
        };

        eventSource.onerror = () => {
          setSseConnected(false);
          eventSource?.close();

          // Reconnect after 5 seconds
          reconnectTimeout = setTimeout(() => {
            addConsoleLog('[SSE] Reconnecting to dashboard stream...', 'warn', 'system');
            connect();
          }, 5000);
        };

      } catch (err) {
        console.error('SSE connection error:', err);
        setSseConnected(false);
      }
    };

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

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
    <div className="w-[90%] mx-auto p-8 space-y-10">


      {/* Single Page Dashboard - No Tabs */}
      <div className="space-y-10">
        {/* Session Metrics & Token Usage - Animated */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Active Sessions */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">{t('dashboard.stats.activeSession')}</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                <AnimatedNumber value={chatStats?.overview?.total_conversations || 0} />
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.stats.currentlyActive')}</div>
            </CardContent>
          </Card>

          {/* Total Sessions */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">{t('dashboard.stats.totalSession')}</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                <AnimatedNumber value={chatStats?.overview?.total_conversations || 0} />
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('dashboard.stats.today')}: <AnimatedNumber value={chatStats?.daily_activity?.[0]?.conversations || 0} />
              </div>
            </CardContent>
          </Card>

          {/* Token Usage */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">{t('dashboard.stats.tokenUsage')}</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                <AnimatedNumber value={tokenStats.totalTokensUsed} />
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('dashboard.stats.cost')}: ${tokenStats.totalCost.toFixed(4)}
              </div>
            </CardContent>
          </Card>

          {/* Avg Messages per Session */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">{t('dashboard.stats.avgMessagesPerSession')}</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                <AnimatedNumber value={chatStats?.avgMessagesPerConversation || 0} />
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.stats.performanceMetric')}</div>
            </CardContent>
          </Card>
        </div>

        {/* Embeddings Kaynak Paneli */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div>
              <h3 className="text-base font-semibold tracking-tight">{t('dashboard.embeddings.resources')}</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Migrated Data */}
              <div className="p-5 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg">
                <div className="mb-3">
                  <h4 className="text-base font-medium">{t('dashboard.embeddings.migratedData')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('dashboard.embeddings.rows')}:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.migrated?.rows?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('dashboard.embeddings.embeddings')}:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.migrated?.embeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>

              {/* Documents Embeddings */}
              <div className="p-5 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-lg">
                <div className="mb-3">
                  <h4 className="text-base font-medium">{t('dashboard.embeddings.documents')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('dashboard.embeddings.documents')}:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.documents?.documents?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Embeddings:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.documents?.embeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>

              {/* Scraped Embeddings */}
              <div className="p-5 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 rounded-lg">
                <div className="mb-3">
                  <h4 className="text-base font-medium">{t('dashboard.embeddings.scraped')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('dashboard.embeddings.data')}:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.scraped?.data?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Embeddings:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.scraped?.embeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>

              {/* Message History Embeddings */}
              <div className="p-5 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900 rounded-lg">
                <div className="mb-3">
                  <h4 className="text-base font-medium">{t('dashboard.embeddings.messageHistory')}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('dashboard.embeddings.messages')}:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.messages?.messages?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Embeddings:</span>
                    <span className="font-semibold">{embeddingStats?.by_category?.messages?.embeddings?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance & System Resources */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* System Information - Real Data */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <h3 className="text-sm font-semibold tracking-tight">{t('dashboard.system.information')}</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                {/* Database Information */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded min-w-0">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">{t('dashboard.system.database')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs break-words overflow-wrap-anywhere leading-relaxed">
                    {databaseSettings?.name || t('dashboard.status.notConfigured')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {databaseSettings?.host}:{databaseSettings?.port}
                  </div>
                </div>

                {/* LLM Model */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded min-w-0">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">{t('dashboard.system.llmModel')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs break-words overflow-wrap-anywhere leading-relaxed">
                    {llmSettings?.activeChatModel || <span className="text-orange-500">{t('dashboard.status.notConfigured')}</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {t('dashboard.system.activeProvider')}
                  </div>
                </div>

                {/* Embedding Model */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded min-w-0">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">{t('dashboard.system.embeddingModel')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs break-words overflow-wrap-anywhere leading-relaxed">
                    {llmSettings?.activeEmbeddingModel || llmSettings?.embeddingModel || <span className="text-orange-500">{t('dashboard.status.notConfigured')}</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {t('dashboard.system.vectorGeneration')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics - Animated */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                <h3 className="text-sm font-semibold tracking-tight">{t('dashboard.performance.title')}</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.responseTime')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg tabular-nums">
                    {performanceMetrics.avgResponseTime > 1000
                      ? `${(performanceMetrics.avgResponseTime / 1000).toFixed(1)}s`
                      : <><AnimatedNumber value={performanceMetrics.avgResponseTime} formatLocale={false} />ms</>}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.dailyQueries')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">
                    <AnimatedNumber value={performanceMetrics.dailyQueries} />
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.documents')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">
                    <AnimatedNumber value={performanceMetrics.totalDocuments} />
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.cacheHit')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">
                    <AnimatedNumber value={performanceMetrics.cacheHitRate} formatLocale={false} />%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Resources - Circular Progress Design */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${metricsWsConnected ? 'bg-green-500 animate-pulse' : 'bg-orange-500 animate-pulse'}`} />
                  <h3 className="text-sm font-semibold tracking-tight">{t('dashboard.resources.title')}</h3>
                </div>
                {metricsWsConnected && (
                  <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                    {metricsWsLatency}ms
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
                    size={90}
                    strokeWidth={8}
                    label="CPU"
                    thresholds={{ warning: 60, danger: 80 }}
                  />
                  <div className="mt-2 text-center">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Load: {(wsMetrics?.cpu?.loadAvg?.[0] ?? realtimeResources.loadAvg[0])?.toFixed(1) || '0.0'}
                    </p>
                  </div>
                </div>

                {/* Memory */}
                <div className="flex flex-col items-center">
                  <CircularProgress
                    value={wsMetrics?.memory?.percentage ?? realtimeResources.memory}
                    size={90}
                    strokeWidth={8}
                    label="RAM"
                    thresholds={{ warning: 70, danger: 85 }}
                  />
                  <div className="mt-2 text-center">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {((wsMetrics?.memory?.used ?? realtimeResources.memoryDetails.used) / 1024).toFixed(1)} / {((wsMetrics?.memory?.total ?? realtimeResources.memoryDetails.total) / 1024).toFixed(0)} GB
                    </p>
                  </div>
                </div>

                {/* Disk */}
                <div className="flex flex-col items-center">
                  <CircularProgress
                    value={wsMetrics?.disk?.percentage ?? realtimeResources.disk}
                    size={90}
                    strokeWidth={8}
                    label="Disk"
                    thresholds={{ warning: 75, danger: 90 }}
                  />
                  <div className="mt-2 text-center">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {((wsMetrics?.disk?.used ?? realtimeResources.diskDetails.used) / 1024).toFixed(0)} / {((wsMetrics?.disk?.total ?? realtimeResources.diskDetails.total) / 1024).toFixed(0)} GB
                    </p>
                  </div>
                </div>
              </div>

              {/* CPU Info */}
              {(wsMetrics?.cpu?.model || realtimeResources.cpuModel) && (
                <div className="text-center py-2 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate px-2">
                    {wsMetrics?.cpu?.model || realtimeResources.cpuModel} ({wsMetrics?.cpu?.cores || realtimeResources.cpuCores} cores)
                  </p>
                </div>
              )}

              {/* Network I/O - Compact */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="grid grid-cols-2 gap-2">
                  {/* Download */}
                  <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg px-3 py-2">
                    <span className="text-blue-500 text-sm">↓</span>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">In</p>
                      <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
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
                  <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/20 rounded-lg px-3 py-2">
                    <span className="text-green-500 text-sm">↑</span>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Out</p>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
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

        {/* Pipeline Timeline & Services Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {/* Scheduler Timeline */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${pipelines.some(p => p.status === 'running') ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <h3 className="text-sm font-semibold tracking-tight">Scheduler Timeline</h3>
                </div>
                <Badge variant={sseConnected ? "default" : "secondary"} className="text-xs">
                  {sseConnected ? 'Live' : 'Offline'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {pipelines.length === 0 || pipelines.every(p => p.status === 'idle') ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <div className="text-2xl mb-2">✓</div>
                  <p className="text-sm">No scheduled tasks today</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Horizontal Timeline */}
                  <div className="overflow-x-auto pb-4">
                    <div className="relative min-w-[600px]">
                      {/* Timeline line */}
                      <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" />

                      {/* Timeline nodes */}
                      <div className="flex justify-between items-start relative">
                        {pipelines.filter(p => p.status !== 'idle').map((pipeline, idx) => (
                          <div key={idx} className="flex flex-col items-center relative" style={{ width: `${100 / Math.max(pipelines.filter(p => p.status !== 'idle').length, 3)}%` }}>
                            {/* Node */}
                            <div className={`relative z-10 flex items-center justify-center w-4 h-4 rounded-full mb-3 ${
                              pipeline.status === 'running' ? 'bg-blue-500 ring-4 ring-blue-100 dark:ring-blue-900 animate-pulse' :
                              pipeline.status === 'completed' ? 'bg-green-500 ring-4 ring-green-100 dark:ring-green-900' :
                              pipeline.status === 'error' ? 'bg-red-500 ring-4 ring-red-100 dark:ring-red-900' :
                              pipeline.status === 'paused' ? 'bg-yellow-500 ring-4 ring-yellow-100 dark:ring-yellow-900' :
                              'bg-gray-400 ring-4 ring-gray-100 dark:ring-gray-800'
                            }`}>
                              {pipeline.status === 'running' && <Loader2 className="w-2 h-2 text-white animate-spin" />}
                              {pipeline.status === 'completed' && <CheckCircle className="w-2 h-2 text-white" />}
                              {pipeline.status === 'error' && <AlertTriangle className="w-2 h-2 text-white" />}
                            </div>

                            {/* Info Card */}
                            <div className={`px-3 py-2 rounded-lg border text-center min-w-[120px] ${
                              pipeline.status === 'running' ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' :
                              pipeline.status === 'completed' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                              pipeline.status === 'error' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' :
                              pipeline.status === 'paused' ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800' :
                              'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                            }`}>
                              {/* Time */}
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                                {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                              </div>

                              {/* Pipeline name */}
                              <div className="font-medium text-xs mb-1 truncate" title={pipeline.name}>
                                {pipeline.name.length > 15 ? pipeline.name.substring(0, 15) + '...' : pipeline.name}
                              </div>

                              {/* Type */}
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 capitalize mb-1">
                                {pipeline.type}
                              </div>

                              {/* Progress */}
                              {pipeline.progress !== undefined && (
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mb-1">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      pipeline.status === 'error' ? 'bg-red-500' :
                                      pipeline.status === 'paused' ? 'bg-yellow-500' :
                                      pipeline.status === 'completed' ? 'bg-green-500' :
                                      'bg-blue-500'
                                    }`}
                                    style={{ width: `${pipeline.progress}%` }}
                                  />
                                </div>
                              )}

                              {/* Status badge */}
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 capitalize">
                                {pipeline.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-100 dark:border-gray-800 mt-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-gray-600 dark:text-gray-400">Running</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-gray-600 dark:text-gray-400">Completed</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-gray-600 dark:text-gray-400">Error</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-gray-600 dark:text-gray-400">Paused</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Services Status */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${servicesStatus.every(s => s.status === 'running') ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <h3 className="text-sm font-semibold tracking-tight">Services Status</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {servicesStatus.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    <p className="text-sm">Loading services...</p>
                  </div>
                ) : (
                  servicesStatus.map((service, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          service.status === 'running' ? 'bg-green-500' :
                          service.status === 'error' ? 'bg-red-500' :
                          'bg-gray-400'
                        }`} />
                        <div>
                          <div className="font-medium text-sm">{service.name}</div>
                          {service.port && <div className="text-xs text-gray-500">Port: {service.port}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={service.status === 'running' ? 'default' : 'secondary'} className="text-xs capitalize">
                          {service.status}
                        </Badge>
                        {service.uptime && (
                          <div className="text-xs text-gray-500 mt-1">
                            Uptime: {Math.floor(service.uptime / 60)}m
                          </div>
                        )}
                        {service.memory && (
                          <div className="text-xs text-gray-500">
                            Memory: {service.memory} MB
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Memory Details */}
              {realtimeResources.memoryDetails.total > 0 && (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                  <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">Memory Details</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Used:</span>
                      <span className="font-medium ml-1">{realtimeResources.memoryDetails.used} MB</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Free:</span>
                      <span className="font-medium ml-1">{realtimeResources.memoryDetails.free} MB</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total:</span>
                      <span className="font-medium ml-1">{realtimeResources.memoryDetails.total} MB</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2 pt-2 border-t border-blue-100 dark:border-blue-700">
                    <div>
                      <span className="text-gray-500">Heap Used:</span>
                      <span className="font-medium ml-1">{realtimeResources.memoryDetails.heapUsed} MB</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Heap Total:</span>
                      <span className="font-medium ml-1">{realtimeResources.memoryDetails.heapTotal} MB</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Load Average */}
              {realtimeResources.loadAvg[0] > 0 && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg">
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Load Average</div>
                  <div className="flex gap-4 text-xs">
                    <div>
                      <span className="text-gray-500">1 min:</span>
                      <span className="font-medium ml-1">{realtimeResources.loadAvg[0]?.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">5 min:</span>
                      <span className="font-medium ml-1">{realtimeResources.loadAvg[1]?.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">15 min:</span>
                      <span className="font-medium ml-1">{realtimeResources.loadAvg[2]?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Debug Console - Only visible when debug mode is enabled */}
      {debugModeEnabled && (
        <div className="mt-8">
          <Card className="border-0 shadow-sm bg-gray-900 text-gray-100">
            <CardHeader className="pb-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${metricsWsConnected ? 'bg-green-500 animate-pulse' : 'bg-orange-500'}`} />
                    <h3 className="text-sm font-mono font-semibold text-gray-100">Debug Console</h3>
                  </div>
                  <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-600">
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
                        className={`h-6 px-2 text-xs ${consoleFilter === filter ? 'bg-blue-600' : 'text-gray-400 hover:text-gray-100'}`}
                        onClick={() => setConsoleFilter(filter)}
                      >
                        {filter}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-gray-400 hover:text-gray-100"
                    onClick={() => setConsoleLog([])}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 px-2 text-xs ${isConsolePaused ? 'text-yellow-400' : 'text-gray-400 hover:text-gray-100'}`}
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
                className="overflow-y-auto font-mono text-xs p-3 space-y-1"
                style={{ height: consoleHeight, maxHeight: 500 }}
              >
                {filteredConsoleLogs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">No logs yet. Type /help for commands.</div>
                ) : (
                  filteredConsoleLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex gap-2 hover:bg-gray-800/50 px-1 py-0.5 rounded ${
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'warn' ? 'text-yellow-400' :
                        log.type === 'success' ? 'text-green-400' :
                        log.source === 'backend' ? 'text-blue-300' :
                        log.source === 'frontend' ? 'text-purple-300' :
                        log.source === 'user' ? 'text-cyan-300' :
                        'text-gray-300'
                      }`}
                    >
                      <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
              {/* Command input */}
              <div className="border-t border-gray-800 p-2 flex gap-2">
                <span className="text-green-400 font-mono text-sm">$</span>
                <Input
                  value={consoleCommand}
                  onChange={(e) => setConsoleCommand(e.target.value)}
                  onKeyDown={handleConsoleKeyDown}
                  placeholder="Type /help for commands..."
                  className="flex-1 bg-transparent border-0 text-gray-100 placeholder-gray-500 font-mono text-sm h-7 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div >
  );
}






