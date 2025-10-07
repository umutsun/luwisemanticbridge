"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfig } from "@/contexts/ConfigContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  // FileText, Database, Globe, Zap - TEMİZLENDİ
  Search,
  Download,
  Upload,
  Plus,
  Trash2,
  RefreshCw,
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
  Filter
} from "lucide-react";

// API endpoint'leri
const API_BASE_URL = "http://localhost:8084";
const WS_BASE_URL = "ws://localhost:8084";

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
  const [newUrl, setNewUrl] = useState("");
  const [scrapingStatus, setScrapingStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");

  // Component mount'da verileri çek
  useEffect(() => {
    fetchSystemStatus();
    fetchDocuments();
    fetchSessions();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard/status`);
      if (response.ok) {
        const statusData = await response.json();
        setData(statusData);
      }
    } catch (err) {
      console.error("Failed to fetch system status:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents`);
      if (response.ok) {
        const docs = await response.json();
        setDocuments(docs);
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scraper/sessions`);
      if (response.ok) {
        const sessionData = await response.json();
        setSessions(sessionData);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  const startScraping = async (url: string, config: any) => {
    try {
      setScrapingStatus("running");
      const response = await fetch(`${API_BASE_URL}/api/scraper/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, config })
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
      await fetch(`${API_BASE_URL}/api/scraper/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      await fetchSessions();
    } catch (err) {
      console.error("Failed to pause scraping:", err);
    }
  };

  const deleteDocument = async (docId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/documents/${docId}`, {
        method: 'DELETE'
      });
      await fetchDocuments();
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const filteredDocuments = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.url.toLowerCase().includes(searchTerm.toLowerCase())
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Dashboard yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{config?.app_name || 'ALICE RAG Dashboard'}</h1>
          <p className="text-muted-foreground">RAG sistemi ve web scraper kontrol paneli</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>
      </div>

      {/* Sistem Durum Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard
          title="Veritabanı"
          value={data?.database.status === 'connected' ? 'Aktif' : 'Pasif'}
          status={data?.database.status === 'connected' ? 'online' : 'offline'}
          description={`${data?.database.documents || 0} doküman`}
        />
        <StatusCard
          title="Vectorizer"
          value={data?.vectorizer.status === 'active' ? 'Aktif' : 'Pasif'}
          status={data?.vectorizer.status === 'active' ? 'online' : 'offline'}
          description={data?.vectorizer.model || 'Bilinmiyor'}
        />
        <StatusCard
          title="Redis"
          value={data?.redis.status === 'connected' ? 'Aktif' : 'Pasif'}
          status={data?.redis.status === 'connected' ? 'online' : 'offline'}
          description={data?.redis.uptime || 'Bilinmiyor'}
        />
        <StatusCard
          title="Scraper"
          value={data?.scraper.status === 'active' ? 'Aktif' : 'Pasif'}
          status={data?.scraper.status === 'active' ? 'online' : 'offline'}
          description={`${data?.scraper.documentsProcessed || 0} işlendi`}
        />
      </div>

      {/* Ana Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="documents">Dokümanlar</TabsTrigger>
          <TabsTrigger value="scraper">Scraper</TabsTrigger>
          <TabsTrigger value="rag">RAG Ayarları</TabsTrigger>
          <TabsTrigger value="monitoring">İzleme</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Servis Durumları */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Servis Durumları
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data?.services && Object.entries(data.services).map(([service, info]: [string, any]) => (
                  <div key={service} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(info.status)}
                      <span className="font-medium">{service}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(info.status)}
                      {info.uptime && <span className="text-sm text-muted-foreground">{info.uptime}</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Hızlı İşlemler */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Hızlı İşlemler
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Hızlı Ekle</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        placeholder="URL girin..."
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        className="flex-1"
                      />
                      <Button 
                        size="sm"
                        onClick={() => newUrl && startScraping(newUrl, {
                          maxDepth: 1,
                          maxPages: 10,
                          domainsOnly: true,
                          followExternal: false
                        })}
                        disabled={scrapingStatus !== "idle"}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="justify-start">
                      <Download className="h-4 w-4 mr-2" />
                      Veri İçe Aktar
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start">
                      <Upload className="h-4 w-4 mr-2" />
                      Veri Dışa Aktar
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start">
                      <Settings className="h-4 w-4 mr-2" />
                      Ayarlar
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      İstatistikler
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Son Aktiviteler */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Son Aktiviteler
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="font-medium">Wikipedia scrape tamamlandı</p>
                      <p className="text-sm text-muted-foreground">142 doküman işlendi</p>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">2 dk önce</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="font-medium">Yeni dokümanlar indeksleniyor</p>
                      <p className="text-sm text-muted-foreground">8 doküman beklemede</p>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">5 dk önce</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="font-medium">Model güncellendi</p>
                      <p className="text-sm text-muted-foreground">text-embedding-3-large</p>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">15 dk önce</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Dokümanlar ({filteredDocuments.length})
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Doküman ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filtrele
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <File className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <h4 className="font-medium">{doc.title}</h4>
                        <p className="text-sm text-muted-foreground">{doc.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(doc.status)}
                      <span className="text-sm text-muted-foreground">
                        {doc.wordCount && `${doc.wordCount} kelimeler`}
                      </span>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scraper Tab */}
        <TabsContent value="scraper" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Scraping Oturumları
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div key={session.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{session.name}</h4>
                        <p className="text-sm text-muted-foreground">{session.url}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(session.status)}
                        <span className="text-sm text-muted-foreground">{session.progress}%</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-muted-foreground">Başlangıç:</span>
                        <p>{new Date(session.startTime).toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Dokümanlar:</span>
                        <p>{session.documentsFound} bulundu</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Derinlik:</span>
                        <p>{session.config.maxDepth}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Max Sayfa:</span>
                        <p>{session.config.maxPages}</p>
                      </div>
                    </div>
                    {session.status === 'running' && (
                      <div className="w-full bg-muted rounded-full h-2 mb-3">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all" 
                          style={{ width: `${session.progress}%` }}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      {session.status === 'running' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => pauseScraping(session.id)}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Duraklat
                        </Button>
                      )}
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Sil
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RAG Settings Tab */}
        <TabsContent value="rag" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chat Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Chat Ayarları
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select defaultValue="gpt-4">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">GPT-4</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                      <SelectItem value="claude-3">Claude 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Max Token</Label>
                  <Input type="number" defaultValue="2000" />
                </div>

                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <Input type="number" step="0.1" min="0" max="1" defaultValue="0.7" />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Stream yanıtlar</Label>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>

            {/* Search Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Arama Ayarları
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Embedding Modeli</Label>
                  <Select defaultValue="text-embedding-3-large">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text-embedding-3-large">text-embedding-3-large</SelectItem>
                      <SelectItem value="text-embedding-3-small">text-embedding-3-small</SelectItem>
                      <SelectItem value="text-embedding-ada-002">text-embedding-ada-002</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Max Results</Label>
                  <Input type="number" defaultValue="5" min="1" max="20" />
                </div>

                <div className="space-y-2">
                  <Label>Threshold</Label>
                  <Input type="number" step="0.1" min="0" max="1" defaultValue="0.7" />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Hybrid arama</Label>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* System Prompts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Sistem Promptları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea 
                  placeholder="Sistem prompt'unuzu buraya girin..."
                  rows={4}
                  defaultValue="Sen yardımcı bir asistansın. Verilen dokümanlara dayanarak soruları cevapla."
                />
              </div>

              <div className="space-y-2">
                <Label>Query Prefix</Label>
                <Textarea 
                  placeholder="Query prefix..."
                  rows={2}
                  defaultValue="Aşağıdaki bağlama göre:"
                />
              </div>

              <Button className="w-full">
                <Save className="h-4 w-4 mr-2" />
                Ayarları Kaydet
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Performans Metrikleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span>Ortalama Cevap Süresi</span>
                    <span className="font-medium">1.2s</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span>Günlük Sorgu Sayısı</span>
                    <span className="font-medium">247</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span>İndekslenmiş Doküman</span>
                    <span className="font-medium">1,428</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span>Cache Hit Rate</span>
                    <span className="font-medium">87%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Resources */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Sistem Kaynakları
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>CPU Kullanımı</span>
                      <span>24%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: '24%' }} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Bellek Kullanımı</span>
                      <span>67%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '67%' }} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Disk Kullanımı</span>
                      <span>45%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '45%' }} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>GPU Kullanımı</span>
                      <span>12%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: '12%' }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Error Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Hata Kayıtları
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-sm">
                <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded">
                  <span className="text-red-600 dark:text-red-400">[ERROR]</span> 2024-01-15 14:32:15 - Connection timeout to database
                </div>
                <div className="p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded">
                  <span className="text-yellow-600 dark:text-yellow-400">[WARN]</span> 2024-01-15 14:31:42 - High memory usage detected
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded">
                  <span className="text-red-600 dark:text-red-400">[ERROR]</span> 2024-01-15 14:30:28 - Failed to process document: https://example.com
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}