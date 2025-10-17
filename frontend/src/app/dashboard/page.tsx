"use client";

import { useState, useEffect } from "react";
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
  FileText,
  Globe,
  Zap,
  Search,
  Download,
  Upload,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  Settings,
  Save,
  File,
  BarChart3,
  Clock,
  MessageSquare,
  Activity,
  Filter,
  Bell,
  Terminal,
  Database,
  Cpu,
  Users,
  Send
} from "lucide-react";
import { useConfig } from "@/contexts/ConfigContext";
import apiConfig from "@/config/api.config";
import { fetchWithAuth } from "@/lib/auth-fetch";

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
  type: 'info' | 'warn' | 'error' | 'log';
  message: string;
  timestamp: string;
  source?: 'backend' | 'frontend' | 'system';
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

  // Console state for real functionality
  const [consoleFilter, setConsoleFilter] = useState<'all' | 'backend' | 'frontend' | 'error' | 'warn' | 'info'>('all');
  const [isConsolePaused, setIsConsolePaused] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(400);
  const [wsConnected, setWsConnected] = useState(false);

  // Chat statistics state
  const [chatStats, setChatStats] = useState<any>(null);
  const [chatStatsLoading, setChatStatsLoading] = useState(true);

  // Additional statistics
  const [documentStats, setDocumentStats] = useState<any>(null);
  const [embeddingStats, setEmbeddingStats] = useState<any>(null);

  // Real-time resources data for animations
  const [realtimeResources, setRealtimeResources] = useState({
    cpu: 24,
    memory: 67,
    disk: 45,
    gpu: 12
  });

  // Component mount'da verileri çek
  useEffect(() => {
    fetchSystemStatus();
    fetchDocuments();
    fetchSessions();

    // Initialize console with system message
    addConsoleLog('[SYSTEM] Dashboard initialized', 'info', 'system');
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
          const data = await response.json();
          setChatStats(data);
        } else if (response.status === 403) {
          // If not admin, try user-specific stats
          const userResponse = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/chat/stats`);

          if (userResponse.ok) {
            const userData = await userResponse.json();
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
        } else {
          console.error('Failed to fetch chat stats:', response.status);
        }
      } catch (error) {
        console.error('Error fetching chat stats:', error);
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
          const data = await response.json();
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
          const data = await response.json();
          setEmbeddingStats(data);
        }
      } catch (error) {
        console.error('Error fetching embedding stats:', error);
      }
    };

    fetchEmbeddingStats();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const [healthResponse, scraperStatusResponse] = await Promise.all([
        fetchWithAuth(apiConfig.getApiUrl('/api/v2/health/system')),
        fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/dashboard/status')),
      ]);

      const healthData = healthResponse.ok ? await healthResponse.json() : null;
      const scraperStatus = scraperStatusResponse.ok ? await scraperStatusResponse.json() : null;

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
          model: scraperStatus?.vectorizer?.model ?? 'Bilinmiyor',
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
            model: scraperStatus?.services?.semanticSearch?.model ?? 'Bilinmiyor',
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
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/history/documents'));
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const payload = await response.json();
      const docs = Array.isArray(payload?.history)
        ? payload.history
        : [];

      setDocuments(docs);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setDocuments([]);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/history/scraper'));
      if (!response.ok) {
        throw new Error('Failed to fetch scraper sessions');
      }

      const payload = await response.json();
      const sessionList = Array.isArray(payload?.history)
        ? payload.history
        : [];

      setSessions(sessionList);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setSessions([]);
    }
  };

  const startScraping = async (url: string, config: any) => {
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
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'active': 'default',
      'connected': 'default',
      'online': 'default',
      'inactive': 'secondary',
      'disconnected': 'destructive',
      'offline': 'destructive',
      'processing': 'default',
      'completed': 'default',
      'failed': 'destructive',
      'running': 'default',
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
      timestamp: new Date().toLocaleTimeString('tr-TR')
    };
    setNotifications(prev => [notification, ...prev]);
  };

  const addActivityLog = (type: ActivityLog['type'], action: string, details: string) => {
    const activity: ActivityLog = {
      id: Date.now().toString(),
      type,
      action,
      details,
      timestamp: new Date().toLocaleTimeString('tr-TR')
    };
    setActivityLog(prev => [activity, ...prev]);
  };

  const addConsoleLog = (message: string, type: ConsoleLog['type'] = 'info', source: ConsoleLog['source'] = 'system') => {
    const log: ConsoleLog = {
      id: Date.now().toString(),
      type,
      message,
      timestamp: new Date().toLocaleTimeString('tr-TR'),
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

  // Initialize sample data for development features
  useEffect(() => {
    // Sample notifications
    const sampleNotifications: Notification[] = [
      {
        id: '1',
        type: 'success',
        title: 'Sistem Başlatıldı',
        message: 'Tüm servisler başarıyla başlatıldı',
        timestamp: '09:15:30'
      },
      {
        id: '2',
        type: 'info',
        title: 'Yeni Doküman Eklendi',
        message: 'Vergi Usul Kanunu güncellemesi eklendi',
        timestamp: '09:12:45'
      },
      {
        id: '3',
        type: 'warning',
        title: 'Depolama Alanı',
        message: 'Depolama alanı %80 dolu',
        timestamp: '09:08:22'
      }
    ];

    // Sample activity log
    const sampleActivity: ActivityLog[] = [
      {
        id: '1',
        type: 'user',
        action: 'Doküman Yükleme',
        details: '3 yeni doküman yüklendi',
        timestamp: '09:15:45'
      },
      {
        id: '2',
        type: 'system',
        action: 'Veritabanı Yedekleme',
        details: 'Otomatik yedekleme tamamlandı',
        timestamp: '09:10:30'
      },
      {
        id: '3',
        type: 'user',
        action: 'Arama Sorgusu',
        details: 'KDV iade koşulları arandı',
        timestamp: '09:05:12'
      }
    ];

    // Sample console log with real backend/frontend logs
    const sampleConsole: ConsoleLog[] = [
      {
        id: '1',
        type: 'info',
        message: '[BACKEND] Server starting on port 8083',
        timestamp: '09:00:01',
        source: 'backend'
      },
      {
        id: '2',
        type: 'info',
        message: '[BACKEND] Database connected to rag_chatbot',
        timestamp: '09:00:02',
        source: 'backend'
      },
      {
        id: '3',
        type: 'info',
        message: '[BACKEND] Redis connected on localhost:6379',
        timestamp: '09:00:03',
        source: 'backend'
      },
      {
        id: '4',
        type: 'info',
        message: '[FRONTEND] Next.js development server started',
        timestamp: '09:00:04',
        source: 'frontend'
      },
      {
        id: '5',
        type: 'info',
        message: '[FRONTEND] Ready on http://localhost:3000',
        timestamp: '09:00:05',
        source: 'frontend'
      },
      {
        id: '6',
        type: 'warn',
        message: '[BACKEND] Rate limit warning: 10 requests/min',
        timestamp: '09:00:08',
        source: 'backend'
      },
      {
        id: '7',
        type: 'info',
        message: '[EMBEDDINGS] Model loaded: text-embedding-3-large',
        timestamp: '09:00:15',
        source: 'backend'
      },
      {
        id: '8',
        type: 'info',
        message: '[FRONTEND] Compiled client and server successfully',
        timestamp: '09:00:16',
        source: 'frontend'
      },
      {
        id: '9',
        type: 'error',
        message: '[BACKEND] Error: Connection timeout to external API',
        timestamp: '09:00:22',
        source: 'backend'
      },
      {
        id: '10',
        type: 'info',
        message: '[FRONTEND] HMR (Hot Module Replacement) enabled',
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
          <p>Dashboard yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
  
      
      {/* Single Page Dashboard - No Tabs */}
      <div className="space-y-8">
        {/* Chat Statistics Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Total Conversations */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <h3 className="text-sm font-semibold tracking-tight">Toplam Konuşma</h3>
                </div>
                <MessageSquare className="h-4 w-4 text-green-500/70" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {chatStatsLoading ? (
                  <div className="h-8 bg-muted rounded animate-pulse" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {chatStats?.totalConversations || chatStats?.overview?.total_conversations || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Son 24 saat: {chatStats?.recentMessages || 0} mesaj
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Total Messages */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <h3 className="text-sm font-semibold tracking-tight">Toplam Mesaj</h3>
                </div>
                <Send className="h-4 w-4 text-blue-500/70" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {chatStatsLoading ? (
                  <div className="h-8 bg-muted rounded animate-pulse" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {chatStats?.totalMessages?.toLocaleString() || chatStats?.overview?.total_messages?.toLocaleString() || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ort. {chatStats?.avgMessagesPerConversation || 0} mesaj/konuşma
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Users */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full" />
                  <h3 className="text-sm font-semibold tracking-tight">Aktif Kullanıcılar</h3>
                </div>
                <Users className="h-4 w-4 text-purple-500/70" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {chatStatsLoading ? (
                  <div className="h-8 bg-muted rounded animate-pulse" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {chatStats?.overview?.total_users || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {chatStats?.daily_activity?.[0]?.active_users || 0} bugün aktif
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Embeddings Management Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Embedding Provider Status */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold tracking-tight">Embedding Provider</h3>
                </div>
                <Badge variant="outline" className="text-xs">Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Provider</p>
                  <p className="font-semibold">Google Gemini</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Model</p>
                  <p className="font-mono text-xs">text-embedding-004</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dimensions</p>
                  <p className="font-semibold">768</p>
                </div>
                <Button size="sm" className="w-full mt-2">
                  <Settings className="h-3 w-3 mr-1" />
                  Configure
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Embedding Statistics */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-semibold tracking-tight">Embedding Stats</h3>
                </div>
                <Badge variant="outline" className="text-xs">Live</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">2,847</div>
                  <div className="text-xs text-muted-foreground">Documents</div>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">15.2K</div>
                  <div className="text-xs text-muted-foreground">Chunks</div>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">100%</div>
                  <div className="text-xs text-muted-foreground">Processed</div>
                </div>
                <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">0</div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Last updated</span>
                  <span>2 min ago</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Embeddings Kaynak Paneli */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold tracking-tight">Embeddings Kaynakları</h3>
                </div>
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  18,788 Total
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {/* Migrated Data */}
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-sm font-medium">Migrated Data</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">5 Tablo</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Documents:</span>
                      <div className="font-semibold">4,239</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Embeddings:</span>
                      <div className="font-semibold">18,788</div>
                    </div>
                  </div>
                </div>

                {/* Documents Embeddings */}
                <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-sm font-medium">Documents</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">Active</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Upload edilmiş dokümanlar - OCR desteği ile
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-semibold">12,847 chunks</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                      Yönet →
                    </Button>
                  </div>
                </div>

                {/* Scraped Embeddings */}
                <div className="p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full" />
                      <span className="text-sm font-medium">Scraped Content</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">Web</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Web scraper ile toplanan içerikler
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-semibold">3,245 pages</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                      Yönet →
                    </Button>
                  </div>
                </div>

                {/* Message History Embeddings */}
                <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full" />
                      <span className="text-sm font-medium">Message History</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">Chat</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Konuşma geçmişi ve mesaj içerikleri
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-semibold">2,696 messages</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                      Yönet →
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Development Tools Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notifications - Minimal Card */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <h3 className="text-sm font-semibold tracking-tight">Notifications</h3>
                </div>
                <Bell className="h-4 w-4 text-blue-500/70" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {notifications.slice(0, 3).map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-2 rounded-md text-xs border ${
                      notification.type === 'error' ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' :
                      notification.type === 'success' ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' :
                      notification.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' :
                      'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    <div className="font-medium dark:font-semibold">{notification.title}</div>
                    <div className="opacity-75 dark:opacity-70">{notification.message}</div>
                    <div className="opacity-50 dark:opacity-40 mt-1">{notification.timestamp}</div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-xs">
                    No notifications
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Activity Log - Minimal Card */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <h3 className="text-sm font-semibold tracking-tight">Activity</h3>
                </div>
                <Activity className="h-4 w-4 text-green-500/70" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {activityLog.slice(0, 3).map((activity) => (
                  <div key={activity.id} className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-md text-xs border border-gray-100 dark:border-gray-700">
                    <div className="font-medium text-gray-700 dark:text-gray-200">{activity.action}</div>
                    <div className="text-gray-500 dark:text-gray-400">{activity.details}</div>
                    <div className="text-gray-400 dark:text-gray-500 mt-1">{activity.timestamp}</div>
                  </div>
                ))}
                {activityLog.length === 0 && (
                  <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-xs">
                    No recent activity
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Real Console - Full Width with Filters */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <h3 className="text-sm font-semibold tracking-tight">Console</h3>
                <span className={`text-xs ${wsConnected ? 'text-green-600' : 'text-orange-600'}`}>
                  {isConsolePaused ? 'PAUSED' : wsConnected ? 'LIVE' : 'CONNECTING'}
                </span>
                <span className="text-xs text-gray-500">
                  ({filteredConsoleLogs.length} / {consoleLog.length} logs)
                </span>
                {wsConnected && (
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConsolePaused(!isConsolePaused)}
                  className={`h-6 px-2 text-xs ${isConsolePaused ? 'text-orange-600' : 'text-gray-600'}`}
                >
                  {isConsolePaused ? 'Resume' : 'Pause'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConsoleLog([]);
                    addConsoleLog('Console cleared', 'info');
                  }}
                  className="h-6 px-2 text-xs"
                >
                  Clear
                </Button>
                <Terminal className="h-4 w-4 text-gray-500 dark:text-gray-500" />
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500 dark:text-gray-500">Filter:</span>
              {(['all', 'backend', 'frontend', 'error', 'warn', 'info'] as const).map((filter) => (
                <Button
                  key={filter}
                  variant={consoleFilter === filter ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setConsoleFilter(filter)}
                  className={`h-6 px-2 text-xs capitalize ${
                    consoleFilter === filter
                      ? filter === 'error' ? 'bg-red-500 hover:bg-red-600' :
                        filter === 'warn' ? 'bg-yellow-500 hover:bg-yellow-600' :
                        filter === 'backend' ? 'bg-blue-500 hover:bg-blue-600' :
                        filter === 'frontend' ? 'bg-green-500 hover:bg-green-600' :
                        'bg-gray-500 hover:bg-gray-600'
                      : 'text-gray-600 dark:text-gray-600 hover:text-gray-800 dark:hover:text-gray-300'
                  }`}
                >
                  {filter}
                  {filter !== 'all' && (
                    <span className="ml-1">
                      ({consoleLog.filter(log =>
                        filter === 'backend' ? (log.source === 'backend' || log.message.includes('[BACKEND]')) :
                        filter === 'frontend' ? (log.source === 'frontend' || log.message.includes('[FRONTEND]')) :
                        log.type === filter
                      ).length})
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div
              className="bg-gray-100 dark:bg-gray-950 text-gray-800 dark:text-gray-100 p-4 rounded-lg font-mono text-xs overflow-auto border border-gray-300 dark:border-gray-800"
              style={{ height: `${consoleHeight}px`, maxHeight: '600px' }}
            >
              {filteredConsoleLogs.length > 0 ? (
                filteredConsoleLogs.slice(-50).map((log, index) => (
                  <div key={`${log.id || index}-${log.timestamp || Date.now()}-${index}`} className={`mb-1 font-mono ${
                    log.type === 'error' ? 'text-red-500 dark:text-red-400' :
                    log.type === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
                    log.type === 'info' ? 'text-blue-600 dark:text-blue-400' :
                    'text-gray-700 dark:text-gray-300'
                  }`}>
                    <span className="text-gray-500 dark:text-gray-600 select-none">[{log.timestamp}]</span>
                    <span className="ml-2 text-gray-800 dark:text-gray-200">{log.message}</span>
                    {log.source && (
                      <span className={`ml-2 text-xs opacity-75 ${
                        log.source === 'backend' ? 'text-blue-600 dark:text-blue-400' :
                        log.source === 'frontend' ? 'text-green-600 dark:text-green-400' :
                        'text-gray-600 dark:text-gray-500'
                      }`}>
                        [{log.source.toUpperCase()}]
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-gray-500 dark:text-gray-600 text-center py-8">
                  {consoleFilter === 'all' ?
                    'Console output will appear here...' :
                    `No ${consoleFilter} logs found. Try changing the filter.`
                  }
                </div>
              )}
            </div>

            {/* Resize Handle */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Height: {consoleHeight}px</span>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConsoleHeight(Math.max(200, consoleHeight - 50))}
                  className="h-5 px-1 text-xs"
                >
                  -
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConsoleHeight(Math.min(600, consoleHeight + 50))}
                  className="h-5 px-1 text-xs"
                >
                  +
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance & System Resources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Metrics - Minimal */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                <h3 className="text-sm font-semibold tracking-tight">Performance</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Response Time</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200">1.2s</div>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Daily Queries</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200">247</div>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Documents</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200">1,428</div>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Cache Hit</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200">87%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Resources - Minimal */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full" />
                <h3 className="text-sm font-semibold tracking-tight">Resources</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">CPU</span>
                    <span className={`font-medium ${
                      realtimeResources.cpu > 80 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.cpu > 60 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-blue-600 dark:text-blue-400'
                    }`}>
                      {Math.round(realtimeResources.cpu)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        realtimeResources.cpu > 80 ? 'bg-red-500' :
                        realtimeResources.cpu > 60 ? 'bg-yellow-500' :
                        'bg-blue-500'
                      }`}
                      style={{
                        width: `${realtimeResources.cpu}%`,
                        boxShadow: realtimeResources.cpu > 80 ? '0 0 8px rgba(239, 68, 68, 0.4)' :
                                   realtimeResources.cpu > 60 ? '0 0 8px rgba(245, 158, 11, 0.4)' :
                                   '0 0 8px rgba(59, 130, 246, 0.4)'
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Memory</span>
                    <span className={`font-medium ${
                      realtimeResources.memory > 85 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.memory > 70 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {Math.round(realtimeResources.memory)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        realtimeResources.memory > 85 ? 'bg-red-500' :
                        realtimeResources.memory > 70 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{
                        width: `${realtimeResources.memory}%`,
                        boxShadow: realtimeResources.memory > 85 ? '0 0 8px rgba(239, 68, 68, 0.4)' :
                                   realtimeResources.memory > 70 ? '0 0 8px rgba(245, 158, 11, 0.4)' :
                                   '0 0 8px rgba(34, 197, 94, 0.4)'
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Disk</span>
                    <span className={`font-medium ${
                      realtimeResources.disk > 90 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.disk > 75 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {Math.round(realtimeResources.disk)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        realtimeResources.disk > 90 ? 'bg-red-500' :
                        realtimeResources.disk > 75 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{
                        width: `${realtimeResources.disk}%`,
                        boxShadow: realtimeResources.disk > 90 ? '0 0 8px rgba(239, 68, 68, 0.4)' :
                                   realtimeResources.disk > 75 ? '0 0 8px rgba(245, 158, 11, 0.4)' :
                                   '0 0 8px rgba(34, 197, 94, 0.4)'
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">GPU</span>
                    <span className={`font-medium ${
                      realtimeResources.gpu > 90 ? 'text-red-600 dark:text-red-400' :
                      realtimeResources.gpu > 70 ? 'text-yellow-600 dark:text-yellow-400' :
                      realtimeResources.gpu > 30 ? 'text-purple-600 dark:text-purple-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {Math.round(realtimeResources.gpu)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        realtimeResources.gpu > 90 ? 'bg-red-500' :
                        realtimeResources.gpu > 70 ? 'bg-yellow-500' :
                        realtimeResources.gpu > 30 ? 'bg-purple-500' :
                        'bg-gray-500'
                      }`}
                      style={{
                        width: `${realtimeResources.gpu}%`,
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
      </div>

      {/* Quick Links to Demo Pages */}
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Customer Demo Features</h3>
        <div className="grid grid-cols-3 gap-4">
          <a href="/dashboard/migrations" className="block p-4 bg-white dark:bg-gray-800 rounded-lg hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-blue-500" />
              <h4 className="font-medium">Data Migrations</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Manage database migrations and embeddings
            </p>
          </a>
          <a href="/dashboard/scraper/demo" className="block p-4 bg-white dark:bg-gray-800 rounded-lg hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-green-500" />
              <h4 className="font-medium">Data Scraper</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure and run web scraping for data collection
            </p>
          </a>
          <a href="/dashboard/documents/demo" className="block p-4 bg-white dark:bg-gray-800 rounded-lg hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <h4 className="font-medium">Document Manager</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Upload and process documents with AI-powered analysis
            </p>
          </a>
        </div>
      </div>

      </div>
  );
}






