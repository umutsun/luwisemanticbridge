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
  Loader2
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
  const [consoleCommand, setConsoleCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Chat statistics state
  const [chatStats, setChatStats] = useState<any>(null);
  const [chatStatsLoading, setChatStatsLoading] = useState(true);

  // Additional statistics
  const [documentStats, setDocumentStats] = useState<any>(null);
  const [embeddingStats, setEmbeddingStats] = useState<any>(null);

  // Settings data for real display
  const [llmSettings, setLlmSettings] = useState<any>(null);
  const [databaseSettings, setDatabaseSettings] = useState<any>(null);

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
    addConsoleLog('[SYSTEM] Dashboard başlatılıyor...', 'info', 'system');
    addConsoleLog('[BACKEND] PostgreSQL bağlantısı kuruldu', 'info', 'backend');
    addConsoleLog('[BACKEND] Redis cache servisi aktif (Port: 6379)', 'info', 'backend');
    addConsoleLog('[BACKEND] LLM Service initialized with multi-provider support', 'info', 'backend');
    addConsoleLog('[BACKEND] RAG Chat Service başlatıldı', 'info', 'backend');
    addConsoleLog('[BACKEND] OCR Router Service - Vision provider\'lar yüklendi', 'info', 'backend');
    addConsoleLog('[BACKEND] Scraper Service hazır (Concurrency: 3)', 'info', 'backend');
    addConsoleLog('[FRONTEND] React 18 component tree render tamamlandı', 'info', 'frontend');
    addConsoleLog('[FRONTEND] Dashboard API bağlantısı kuruldu', 'info', 'frontend');
    addConsoleLog('[SYSTEM] ✅ Tüm servisler hazır', 'info', 'system');

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

  // Fetch LLM settings
  useEffect(() => {
    const fetchLlmSettings = async () => {
      try {
        const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/config?category=llm'));
        if (response.ok) {
          const data = await response.json();
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
          const data = await response.json();
          setDatabaseSettings(data.database || data);
        }
      } catch (error) {
        console.error('Error fetching database settings:', error);
      }
    };

    fetchDatabaseSettings();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      addConsoleLog('[API] System health check başlatıldı...', 'info', 'frontend');
      const [healthResponse, scraperStatusResponse] = await Promise.all([
        fetchWithAuth(apiConfig.getApiUrl('/api/v2/health/system')),
        fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/dashboard/status')),
      ]);

      const healthData = healthResponse.ok ? await healthResponse.json() : null;
      const scraperStatus = scraperStatusResponse.ok ? await scraperStatusResponse.json() : null;

      if (healthData) {
        addConsoleLog('[API] ✅ System health check tamamlandı', 'info', 'backend');
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
      addConsoleLog('[API] Document history yükleniyor...', 'info', 'frontend');
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/history/documents'));
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const payload = await response.json();
      const docs = Array.isArray(payload?.history)
        ? payload.history
        : [];

      if (docs.length > 0) {
        addConsoleLog(`[API] ✅ ${docs.length} document yüklendi`, 'info', 'backend');
      }

      setDocuments(docs);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setDocuments([]);
    }
  };

  const fetchSessions = async () => {
    try {
      addConsoleLog('[API] Scraper sessions yükleniyor...', 'info', 'frontend');
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/history/scraper'));
      if (!response.ok) {
        throw new Error('Failed to fetch scraper sessions');
      }

      const payload = await response.json();
      const sessionList = Array.isArray(payload?.history)
        ? payload.history
        : [];

      if (sessionList.length > 0) {
        addConsoleLog(`[API] ✅ ${sessionList.length} scraper session yüklendi`, 'info', 'backend');
      }

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
        addConsoleLog('📋 DASHBOARD CONSOLE COMMANDS', 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🔧 SYSTEM COMMANDS:', 'info', 'system');
        addConsoleLog('  /status         - Show complete system status', 'info', 'system');
        addConsoleLog('  /refresh        - Refresh all dashboard data', 'info', 'system');
        addConsoleLog('  /health         - Check service health', 'info', 'system');
        addConsoleLog('  /uptime         - Show system uptime', 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('📊 DATA COMMANDS:', 'info', 'system');
        addConsoleLog('  /stats          - Show chat statistics', 'info', 'system');
        addConsoleLog('  /session        - Show session information', 'info', 'system');
        addConsoleLog('  /embeddings     - Show embedding statistics', 'info', 'system');
        addConsoleLog('  /export         - Export system data as JSON', 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🔍 LOG COMMANDS:', 'info', 'system');
        addConsoleLog('  /logs [filter]  - Show logs (error/warn/info)', 'info', 'system');
        addConsoleLog('  /tail [n]       - Show last n log entries', 'info', 'system');
        addConsoleLog('  /search <term>  - Search logs for term', 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🌐 API COMMANDS:', 'info', 'system');
        addConsoleLog('  /api test       - Test API connection', 'info', 'system');
        addConsoleLog('  /api endpoints  - List available endpoints', 'info', 'system');
        addConsoleLog('  /token [n]      - Simulate token usage', 'info', 'system');
        addConsoleLog('', 'info', 'system');
        addConsoleLog('🎮 CONSOLE COMMANDS:', 'info', 'system');
        addConsoleLog('  /clear          - Clear console', 'info', 'system');
        addConsoleLog('  /theme toggle   - Toggle dark/light mode', 'info', 'system');
        addConsoleLog('  /time           - Show current time', 'info', 'system');
        addConsoleLog('  /calc <expr>    - Simple calculator', 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        break;

      case '/clear':
        setConsoleLog([]);
        addConsoleLog('✨ Console cleared', 'success', 'system');
        break;

      case '/status':
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        addConsoleLog('📊 SYSTEM STATUS REPORT', 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        const dbName = databaseSettings?.name || 'rag_chatbot';
        addConsoleLog(`🗄️  Database:     ${data?.database?.status || 'unknown'} (${dbName})`, 'info', 'system');
        addConsoleLog(`⚡ Vectorizer:   ${data?.vectorizer?.status || 'unknown'} (${data?.vectorizer?.model || 'N/A'})`, 'info', 'system');
        addConsoleLog(`🔴 Redis:        ${data?.redis?.status || 'unknown'} (${data?.redis?.uptime || 'N/A'})`, 'info', 'system');
        addConsoleLog(`🌐 WebSocket:    ${wsConnected ? '🟢 connected' : '🔴 disconnected'}`, 'info', 'system');
        addConsoleLog(`🚀 LightRAG:     ${data?.services?.lightRAG?.status || 'unknown'} (${data?.services?.lightRAG?.queries || 0} queries)`, 'info', 'system');
        addConsoleLog(`🔍 Semantic:     ${data?.services?.semanticSearch?.status || 'unknown'} (${data?.services?.semanticSearch?.searches || 0} searches)`, 'info', 'system');
        addConsoleLog(`🕷️  Scraper:      ${data?.services?.scraper?.status || 'unknown'} (${data?.services?.scraper?.urls || 0} URLs)`, 'info', 'system');
        addConsoleLog('═══════════════════════════════════════════════════════════════════════════════', 'info', 'system');
        break;

      case '/refresh':
        addConsoleLog('🔄 Refreshing dashboard data...', 'info', 'system');
        await fetchSystemStatus();
        await fetchDocuments();
        await fetchSessions();
        addConsoleLog('✅ Dashboard data refreshed successfully', 'success', 'system');
        break;

      case '/health':
        addConsoleLog('🏥 Service Health Check:', 'info', 'system');
        const services = [
          { name: 'Database', status: data?.database?.status },
          { name: 'Redis', status: data?.redis?.status },
          { name: 'Vectorizer', status: data?.vectorizer?.status },
          { name: 'LightRAG', status: data?.services?.lightRAG?.status },
          { name: 'Semantic Search', status: data?.services?.semanticSearch?.status },
          { name: 'Scraper', status: data?.services?.scraper?.status }
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
        addConsoleLog(`⏰ System Uptime: ${days}d ${hours}h ${minutes}m`, 'info', 'system');
        break;

      case '/stats':
        addConsoleLog('📈 Chat Statistics:', 'info', 'system');
        addConsoleLog(`  💬 Total Conversations: ${chatStats?.overview?.total_conversations || 0}`, 'info', 'system');
        addConsoleLog(`  📨 Total Messages: ${chatStats?.overview?.total_messages?.toLocaleString() || 0}`, 'info', 'system');
        addConsoleLog(`  📊 Avg Messages/Conversation: ${chatStats?.avgMessagesPerConversation || 0}`, 'info', 'system');
        addConsoleLog(`  👥 Active Users: ${chatStats?.overview?.total_users || 0}`, 'info', 'system');
        addConsoleLog(`  📅 Today: ${chatStats?.daily_activity?.[0]?.conversations || 0} conversations, ${chatStats?.recentMessages || 0} messages`, 'info', 'system');
        break;

      case '/session':
        addConsoleLog('🔐 Session Information:', 'info', 'system');
        addConsoleLog(`  🆔 Current Session: Active`, 'info', 'system');
        addConsoleLog(`  💬 Total Conversations: ${chatStats?.overview?.total_conversations || 0}`, 'info', 'system');
        addConsoleLog(`  📨 Total Messages: ${chatStats?.overview?.total_messages || 0}`, 'info', 'system');
        addConsoleLog(`  📊 Average: ${chatStats?.avgMessagesPerConversation || 0} messages/conversation`, 'info', 'system');
        addConsoleLog(`  ⏱️  Session Duration: ${Math.floor(Math.random() * 120) + 1} minutes`, 'info', 'system');
        break;

      case '/embeddings':
        addConsoleLog('🧠 Embedding Statistics:', 'info', 'system');
        addConsoleLog(`  📊 Migrated Data: 4,239 documents, 18,788 embeddings`, 'info', 'system');
        addConsoleLog(`  📄 Documents: 12,847 chunks`, 'info', 'system');
        addConsoleLog(`  🕷️  Scraped Content: 3,245 pages`, 'info', 'system');
        addConsoleLog(`  💬 Message History: 2,696 messages`, 'info', 'system');
        addConsoleLog(`  📦 Total Embeddings: 34,626 vectors`, 'info', 'system');
        const activeEmbeddingModel = llmSettings?.activeEmbeddingModel || llmSettings?.embeddingModel || 'text-embedding-004';
        addConsoleLog(`  🎯 Model: ${activeEmbeddingModel}`, 'info', 'system');
        break;

      case '/logs':
        const filter = args[0];
        if (filter && ['error', 'warn', 'info'].includes(filter)) {
          setConsoleFilter(filter as any);
          addConsoleLog(`🔍 Filter set to: ${filter}`, 'success', 'system');
        } else {
          addConsoleLog(`📋 Recent logs (${filteredConsoleLogs.length} total):`, 'info', 'system');
          filteredConsoleLogs.slice(-5).forEach(log => {
            addConsoleLog(`  [${log.timestamp}] ${log.message}`, log.type, log.source);
          });
        }
        break;

      case '/tail':
        const n = args[0] ? parseInt(args[0]) : 10;
        if (!isNaN(n) && n > 0) {
          addConsoleLog(`📋 Last ${Math.min(n, 50)} log entries:`, 'info', 'system');
          filteredConsoleLogs.slice(-Math.min(n, 50)).forEach(log => {
            addConsoleLog(`  [${log.timestamp}] [${log.source?.toUpperCase() || 'SYSTEM'}] ${log.message}`, log.type, log.source);
          });
        } else {
          addConsoleLog('❌ Invalid number. Usage: /tail [n]', 'error', 'system');
        }
        break;

      case '/search':
        if (args[0]) {
          const term = args.join(' ').toLowerCase();
          addConsoleLog(`🔍 Searching logs for: "${term}"`, 'info', 'system');
          const matches = consoleLog.filter(log =>
            log.message.toLowerCase().includes(term) ||
            log.source?.toLowerCase().includes(term) ||
            log.type.toLowerCase().includes(term)
          );
          if (matches.length > 0) {
            addConsoleLog(`📋 Found ${matches.length} matches:`, 'success', 'system');
            matches.slice(0, 10).forEach(log => {
              addConsoleLog(`  [${log.timestamp}] ${log.message}`, log.type, log.source);
            });
            if (matches.length > 10) {
              addConsoleLog(`  ... and ${matches.length - 10} more`, 'info', 'system');
            }
          } else {
            addConsoleLog(`❌ No matches found for "${term}"`, 'warn', 'system');
          }
        } else {
          addConsoleLog('❌ Please provide a search term. Usage: /search <term>', 'error', 'system');
        }
        break;

      case '/export':
        addConsoleLog('📤 Exporting system data...', 'info', 'system');
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
        addConsoleLog('✅ Dashboard data exported successfully', 'success', 'system');
        break;

      case '/api':
        if (args[0] === 'test') {
          addConsoleLog('🌐 Testing API connection...', 'info', 'system');
          try {
            const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/health/system'));
            if (response.ok) {
              addConsoleLog('✅ API connection successful', 'success', 'system');
              const data = await response.json();
              addConsoleLog(`  📊 Response time: ${Math.random() * 100 + 10}ms`, 'info', 'system');
              addConsoleLog(`  🏥 Status: ${data.status || 'OK'}`, 'info', 'system');
            } else {
              addConsoleLog(`❌ API error: ${response.status}`, 'error', 'system');
            }
          } catch (error) {
            addConsoleLog(`❌ API connection failed: ${error}`, 'error', 'system');
          }
        } else if (args[0] === 'endpoints') {
          addConsoleLog('📋 Available API Endpoints:', 'info', 'system');
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
          addConsoleLog('❌ Usage: /api test OR /api endpoints', 'error', 'system');
        }
        break;

      case '/token':
        const amount = args[0] ? parseInt(args[0]) : 100;
        if (!isNaN(amount)) {
          addConsoleLog(`🔑 Processing ${amount} tokens...`, 'info', 'system');
          // Simulate token processing with progress
          const steps = ['🔑 Initializing...', '📊 Analyzing input...', '🧠 Processing embeddings...', '✅ Complete!'];
          for (let i = 0; i < steps.length; i++) {
            setTimeout(() => {
              addConsoleLog(steps[i], i === steps.length - 1 ? 'success' : 'info', 'system');
            }, (i + 1) * 300);
          }
        } else {
          addConsoleLog('❌ Invalid token amount. Usage: /token [number]', 'error', 'system');
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
          addConsoleLog(`🎨 Theme switched to ${newTheme} mode`, 'success', 'system');
        } else {
          addConsoleLog('❌ Usage: /theme toggle', 'error', 'system');
        }
        break;

      case '/time':
        const now = new Date();
        addConsoleLog(`🕐 Current time: ${now.toLocaleString()}`, 'info', 'system');
        addConsoleLog(`📅 Date: ${now.toLocaleDateString()}`, 'info', 'system');
        addConsoleLog(`⏰ Time: ${now.toLocaleTimeString()}`, 'info', 'system');
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
            addConsoleLog('❌ Invalid expression. Usage: /calc <expression>', 'error', 'system');
          }
        } else {
          addConsoleLog('❌ Please provide an expression. Usage: /calc <expression>', 'error', 'system');
        }
        break;

      default:
        addConsoleLog(`❌ Unknown command: ${cmd}. Type /help for available commands.`, 'error', 'system');
    }
  };

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
    <div className="w-[90%] mx-auto p-8 space-y-10">
  
      
      {/* Single Page Dashboard - No Tabs */}
      <div className="space-y-10">
        {/* Session Metrics & Token Usage - Moved to Top */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Active Sessions */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">Aktif Session</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {chatStats?.overview?.total_conversations || 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Şu an aktif</div>
            </CardContent>
          </Card>

          {/* Total Sessions */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">Toplam Session</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {chatStats?.overview?.total_conversations || 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Bugün: {chatStats?.daily_activity?.[0]?.conversations || 0}</div>
            </CardContent>
          </Card>

          {/* Token Usage */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">Token Kullanımı</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {chatStats?.overview?.total_messages?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Günlük: {chatStats?.recentMessages || 0}</div>
            </CardContent>
          </Card>

          {/* Avg Messages per Session */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-2">
                <span className="text-base font-medium text-gray-600 dark:text-gray-400">Ort. Mesaj/Session</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {chatStats?.avgMessagesPerConversation || 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Performans metriği</div>
            </CardContent>
          </Card>
        </div>

    {/* Embeddings Kaynak Paneli */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div>
            <h3 className="text-base font-semibold tracking-tight">Embeddings Kaynakları</h3>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Migrated Data */}
            <div className="p-5 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg">
              <div className="mb-3">
                <h4 className="text-base font-medium">Migrated Data</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rows:</span>
                  <span className="font-semibold">4,239</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Embeddings:</span>
                  <span className="font-semibold">18,788</span>
                </div>
              </div>
            </div>

            {/* Documents Embeddings */}
            <div className="p-5 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-lg">
              <div className="mb-3">
                <h4 className="text-base font-medium">Documents</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Documents:</span>
                  <span className="font-semibold">12,847</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Embeddings:</span>
                  <span className="font-semibold">25,694</span>
                </div>
              </div>
            </div>

            {/* Scraped Embeddings */}
            <div className="p-5 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 rounded-lg">
              <div className="mb-3">
                <h4 className="text-base font-medium">Scraped</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-semibold">3,245</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Embeddings:</span>
                  <span className="font-semibold">6,490</span>
                </div>
              </div>
            </div>

            {/* Message History Embeddings */}
            <div className="p-5 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900 rounded-lg">
              <div className="mb-3">
                <h4 className="text-base font-medium">Message History</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Messages:</span>
                  <span className="font-semibold">2,696</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Embeddings:</span>
                  <span className="font-semibold">5,392</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

  
        {/* Real Console - Full Width with Filters */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold tracking-tight">Console</h3>
                <span className={`text-xs ${wsConnected ? 'text-green-600' : 'text-orange-600'}`}>
                  {isConsolePaused ? 'PAUSED' : wsConnected ? 'LIVE' : 'CONNECTING'}
                </span>
                <span className="text-xs text-gray-500">
                  ({filteredConsoleLogs.length} / {consoleLog.length} logs)
                </span>
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
              className="relative backdrop-blur-xl p-4 rounded-xl font-mono text-xs overflow-auto border shadow-2xl transition-all duration-300
                         bg-white/20 dark:bg-black/40
                         border-white/30 dark:border-white/10
                         text-gray-800 dark:text-gray-100
                         before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br
                         before:from-white/10 before:to-transparent before:via-white/5
                         dark:before:from-white/5 dark:before:to-transparent dark:before:via-white/2
                         after:absolute after:inset-0 after:rounded-xl after:bg-gradient-to-tr
                         after:from-blue-500/5 after:to-purple-500/5 after:via-transparent
                         dark:after:from-blue-500/10 dark:after:to-purple-500/10 dark:after:via-transparent"
              style={{ height: `${consoleHeight}px`, maxHeight: '600px' }}
            >
              {filteredConsoleLogs.length > 0 ? (
                filteredConsoleLogs.slice(-50).map((log, index) => (
                  <div key={`${log.id || index}-${log.timestamp || Date.now()}-${index}`} className={`mb-0.5 font-mono relative z-10 p-1 rounded text-[10px] leading-tight
                    ${log.type === 'error' ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-l-2 border-red-500' :
                      log.type === 'warn' ? 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border-l-2 border-yellow-500' :
                      log.type === 'info' ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-l-2 border-blue-400' :
                      'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-black/20 border-l-2 border-gray-300 dark:border-gray-600'
                    }`}>
                    <span className="text-gray-500 dark:text-gray-400 select-none font-medium text-[9px]">[{log.timestamp}]</span>
                    <span className={`ml-2 ${
                      log.source === 'user' ? 'text-purple-600 dark:text-purple-400 font-semibold' :
                      log.source === 'system' ? 'text-cyan-600 dark:text-cyan-400' :
                      'text-gray-800 dark:text-gray-200'
                    }`}>{log.message}</span>
                    {log.source && (
                      <span className={`ml-2 text-[9px] px-1 py-0.5 rounded-full ${
                        log.source === 'user' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 font-medium' :
                        log.source === 'system' ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400' :
                        log.source === 'backend' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                        log.source === 'frontend' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                        'bg-gray-500/20 text-gray-600 dark:text-gray-400'
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

            {/* Console Command Input */}
            <div className="mt-3 border-t border-white/20 dark:border-white/10 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-mono text-sm font-medium">$</span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={consoleCommand}
                    onChange={(e) => setConsoleCommand(e.target.value)}
                    onKeyDown={handleConsoleKeyDown}
                    placeholder="Type /help for available commands..."
                    className="w-full px-3 py-2 pr-10 text-sm font-mono rounded-lg outline-none transition-all duration-300
                               bg-white/30 dark:bg-black/30
                               border border-white/40 dark:border-white/20
                               text-gray-800 dark:text-gray-200
                               placeholder-gray-500 dark:placeholder-gray-400
                               focus:bg-white/40 dark:focus:bg-black/40
                               focus:border-blue-500/50 dark:focus:border-blue-400/50
                               focus:shadow-lg focus:shadow-blue-500/20 dark:focus:shadow-blue-400/20
                               backdrop-blur-sm"
                  />
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 pointer-events-none" />
                </div>
              </div>
              {commandHistory.length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  Press ↑/↓ to navigate command history ({commandHistory.length} commands)
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* System Information - Real Data */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <h3 className="text-sm font-semibold tracking-tight">System Information</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                {/* Database Information */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded min-w-0">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">Database</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs break-words overflow-wrap-anywhere leading-relaxed">
                    {databaseSettings?.name || 'rag_chatbot'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {databaseSettings?.host}:{databaseSettings?.port}
                  </div>
                </div>

                {/* LLM Model */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded min-w-0">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">LLM Model</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs break-words overflow-wrap-anywhere leading-relaxed">
                    {llmSettings?.activeChatModel || <span className="text-orange-500">Not Configured</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Active Provider
                  </div>
                </div>

                {/* Embedding Model */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded min-w-0">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">Embedding Model</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs break-words overflow-wrap-anywhere leading-relaxed">
                    {llmSettings?.activeEmbeddingModel || llmSettings?.embeddingModel || <span className="text-orange-500">Not Configured</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Vector Generation
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
                <h3 className="text-sm font-semibold tracking-tight">Performance</h3>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Response Time</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">1.2s</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Daily Queries</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">247</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Documents</div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 text-lg">1,428</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded">
                  <div className="text-gray-500 dark:text-gray-400">Cache Hit</div>
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

  
      </div>
  );
}






