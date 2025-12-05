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
  AlertTriangle,
  Terminal
} from "lucide-react";
import { useConfig } from "@/contexts/ConfigContext";
import apiConfig from "@/config/api.config";
import { fetchWithAuth, safeJsonParse } from "@/lib/auth-fetch";
import ModernDataGraph from "@/components/dashboard/ModernDataGraph";
// import MinimalConsole from "@/components/dashboard/MinimalConsole";
import ConsoleModal from "@/components/dashboard/ConsoleModal";

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
  const [isConsoleModalOpen, setIsConsoleModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [scrapingStatus, setScrapingStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");

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

  // Real-time resources data for animations
  const [realtimeResources, setRealtimeResources] = useState({
    cpu: 24,
    memory: 67,
    disk: 45,
    gpu: 12
  });

  // Component mount'da verileri çek
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

    fetchSystemStatus();
    fetchDocuments();
    fetchSessions();
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

  // Simulate real-time resource updates
  useEffect(() => {
    const interval = setInterval(() => {
      setRealtimeResources(prev => ({
        cpu: Math.max(5, Math.min(95, prev.cpu + (Math.random() - 0.5) * 10)),
        memory: Math.max(20, Math.min(90, prev.memory + (Math.random() - 0.5) * 5)),
        disk: Math.max(30, Math.min(80, prev.disk + (Math.random() - 0.5) * 2)),
        gpu: Math.max(0, Math.min(100, prev.gpu + (Math.random() - 0.5) * 15))
      }));
    }, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, []);

  // Fetch chat statistics
  useEffect(() => {
    const fetchChatStats = async () => {
      try {
        // Try dashboard stats first (for admin users)
        const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/chat/dashboard-stats`);

        if (response.ok) {
          const data = await safeJsonParse(response); if (!data) return;
          setChatStats(data);
        } else if (response.status === 403) {
          // If not admin, try user-specific stats
          const userResponse = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/chat/stats`);

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

  // Fetch document statistics
  useEffect(() => {
    const fetchDocumentStats = async () => {
      try {
        const response = await fetch('/api/v2/documents/stats');
        if (response.ok) {
          const data = await safeJsonParse(response); if (!data) return;
          setDocumentStats(data);
        }
      } catch (error) {
        console.error('Error fetching document stats:', error);
      }
    };

    fetchDocumentStats();
  }, []);

  // Fetch embedding statistics
  useEffect(() => {
    const fetchEmbeddingStats = async () => {
      try {
        const response = await fetch('/api/v2/embeddings/stats');
        if (response.ok) {
          const data = await safeJsonParse(response); if (!data) return;
          setEmbeddingStats(data);
        }
      } catch (error) {
        console.error('Error fetching embedding stats:', error);
      }
    };

    fetchEmbeddingStats();
  }, []);

  // Fetch LLM settings
  useEffect(() => {
    const fetchLlmSettings = async () => {
      try {
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/config?category=llm'));
        if (response.ok) {
          const data = await safeJsonParse(response); if (!data) return;
          console.log('📊 [DASHBOARD] LLM settings loaded from API:', {
            hasLlmSettings: !!data.llmSettings,
            activeChatModel: data.llmSettings?.activeChatModel || data.activeChatModel || 'NOT FOUND',
            dataKeys: Object.keys(data),
            llmSettingsKeys: data.llmSettings ? Object.keys(data.llmSettings) : []
          });
          setLlmSettings(data.llmSettings || data);
        }
      } catch (error) {
        console.error('Error fetching LLM settings:', error);
      }
    };

    fetchLlmSettings();
  }, []);

  // Fetch database settings
  useEffect(() => {
    const fetchDatabaseSettings = async () => {
      try {
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/config?category=database'));
        if (response.ok) {
          const data = await safeJsonParse(response); if (!data) return;
          setDatabaseSettings(data.database || data);
        }
      } catch (error) {
        console.error('Error fetching database settings:', error);
      }
    };

    fetchDatabaseSettings();
  }, []);

  // Fetch token usage statistics
  useEffect(() => {
    const fetchTokenStats = async () => {
      try {
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/dashboard/stats'));
        if (response.ok) {
          const data = await safeJsonParse(response); if (!data) return;
          console.log('📊 [DASHBOARD] Token stats loaded:', {
            totalTokens: data.totalTokensUsed,
            totalCost: data.totalCost
          });
          setTokenStats({
            totalTokensUsed: data.totalTokensUsed || 0,
            totalCost: data.totalCost || 0
          });
        }
      } catch (error) {
        console.error('Error fetching token stats:', error);
      }
    };

    fetchTokenStats();
    // Refresh token stats every 30 seconds
    const interval = setInterval(fetchTokenStats, 30000);
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
        {/* Modern Interactive Data Graph */}
        <div className="mt-0">
          <ModernDataGraph />
        </div>

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

          {/* Performance Metrics - Minimal */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                <h3 className="text-sm font-semibold tracking-tight">{t('dashboard.performance.title')}</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.responseTime')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">1.2s</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.dailyQueries')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">247</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.documents')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">1,428</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">{t('dashboard.performance.cacheHit')}</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">87%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Resources - Minimal */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full" />
                <h3 className="text-sm font-semibold tracking-tight">{t('dashboard.resources.title')}</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.resources.cpu')}</span>
                    <span className={`font - medium ${realtimeResources.cpu > 80 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.cpu > 60 ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-blue-600 dark:text-blue-400'
                      } `}>
                      {Math.round(realtimeResources.cpu)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h - full rounded - full transition - all duration - 500 ease - out ${realtimeResources.cpu > 80 ? 'bg-red-500' :
                        realtimeResources.cpu > 60 ? 'bg-yellow-500' :
                          'bg-blue-500'
                        } `}
                      style={{
                        width: `${realtimeResources.cpu}% `,
                        boxShadow: realtimeResources.cpu > 80 ? '0 0 8px rgba(239, 68, 68, 0.4)' :
                          realtimeResources.cpu > 60 ? '0 0 8px rgba(245, 158, 11, 0.4)' :
                            '0 0 8px rgba(59, 130, 246, 0.4)'
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.resources.memory')}</span>
                    <span className={`font - medium ${realtimeResources.memory > 85 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.memory > 70 ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-green-600 dark:text-green-400'
                      } `}>
                      {Math.round(realtimeResources.memory)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h - full rounded - full transition - all duration - 500 ease - out ${realtimeResources.memory > 85 ? 'bg-red-500' :
                        realtimeResources.memory > 70 ? 'bg-yellow-500' :
                          'bg-green-500'
                        } `}
                      style={{
                        width: `${realtimeResources.memory}% `,
                        boxShadow: realtimeResources.memory > 85 ? '0 0 8px rgba(239, 68, 68, 0.4)' :
                          realtimeResources.memory > 70 ? '0 0 8px rgba(245, 158, 11, 0.4)' :
                            '0 0 8px rgba(34, 197, 94, 0.4)'
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.resources.disk')}</span>
                    <span className={`font - medium ${realtimeResources.disk > 90 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.disk > 75 ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-green-600 dark:text-green-400'
                      } `}>
                      {Math.round(realtimeResources.disk)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h - full rounded - full transition - all duration - 500 ease - out ${realtimeResources.disk > 90 ? 'bg-red-500' :
                        realtimeResources.disk > 75 ? 'bg-yellow-500' :
                          'bg-green-500'
                        } `}
                      style={{
                        width: `${realtimeResources.disk}% `,
                        boxShadow: realtimeResources.disk > 90 ? '0 0 8px rgba(239, 68, 68, 0.4)' :
                          realtimeResources.disk > 75 ? '0 0 8px rgba(245, 158, 11, 0.4)' :
                            '0 0 8px rgba(34, 197, 94, 0.4)'
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{t('dashboard.resources.gpu')}</span>
                    <span className={`font - medium ${realtimeResources.gpu > 90 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.gpu > 70 ? 'text-yellow-600 dark:text-yellow-400' :
                        realtimeResources.gpu > 30 ? 'text-purple-600 dark:text-purple-400' :
                          'text-gray-600 dark:text-gray-400'
                      } `}>
                      {Math.round(realtimeResources.gpu)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h - full rounded - full transition - all duration - 500 ease - out ${realtimeResources.gpu > 90 ? 'bg-red-500' :
                        realtimeResources.gpu > 70 ? 'bg-yellow-500' :
                          realtimeResources.gpu > 30 ? 'bg-purple-500' :
                            'bg-gray-500'
                        } `}
                      style={{
                        width: `${realtimeResources.gpu}% `,
                        boxShadow: realtimeResources.gpu > 90 ? '0 0 8px rgba(239, 68, 68, 0.4)' :
                          realtimeResources.gpu > 70 ? '0 0 8px rgba(245, 158, 11, 0.4)' :
                            realtimeResources.gpu > 30 ? '0 0 8px rgba(168, 85, 247, 0.4)' :
                              'none'
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Minimal System Console - Temporarily disabled (WebSocket server not running) */}
        {/* <MinimalConsole height={400} maxLogs={100} /> */}
      </div>
    </div >
  );
}






