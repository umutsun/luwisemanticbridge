"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart3,
  MessageSquare,
  Search,
  TrendingUp,
  Clock,
  Users,
  Brain,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  Activity,
  Zap,
  Database,
  Eye,
  EyeOff,
  Calendar,
  Hash,
  Target,
  Layers,
  ChevronRight,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import { fetchWithAuth } from "@/lib/auth-fetch";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface MessageStats {
  totalMessages: any[];
  totalSessions: any[];
  messageTypes: any[];
  dailyActivity: any[];
  topQueries: any[];
}

interface UserPatterns {
  total_sessions: number;
  total_messages: number;
  avg_messages_per_session: number;
  avg_session_duration: string;
  topics: any[];
}

interface Topic {
  word: string;
  frequency: number;
  answer_ratio: number;
}

interface Session {
  session_id: string;
  started_at: string;
  last_activity: string;
  message_count: number;
  message_types: number;
  questions: any[];
}

interface Message {
  id: string;
  session_id: string;
  message_type: string;
  content: string;
  created_at: string;
  metadata: any;
  similarity?: number;
  sources?: any[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function MessagesPage() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionMessages, setSessionMessages] = useState<any[]>([]);

  // Analytics data
  const [stats, setStats] = useState<MessageStats>({
    totalMessages: [],
    totalSessions: [],
    messageTypes: [],
    dailyActivity: [],
    topQueries: []
  });
  const [patterns, setPatterns] = useState<UserPatterns>({});
  const [topics, setTopics] = useState<Topic[]>([]);
  const [timeRange, setTimeRange] = useState("30");

  useEffect(() => {
    loadAnalytics();
    loadSessions();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth(`/api/v2/messages/analytics?timeRange=${timeRange}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setPatterns(data.patterns);
        setTopics(data.topics);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      const response = await fetchWithAuth('/api/v2/messages/sessions?limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    try {
      const response = await fetchWithAuth(`/api/v2/messages/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSessionMessages(data.interactions);
      }
    } catch (error) {
      console.error('Error loading session details:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const response = await fetchWithAuth('/api/v2/messages/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 20,
          includeSources: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.messages);
      }
    } catch (error) {
      console.error('Error searching messages:', error);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await fetchWithAuth(`/api/v2/messages/export?format=${format}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `messages.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting messages:', error);
    }
  };

  const handleFlushSession = async (sessionId: string) => {
    try {
      const response = await fetchWithAuth(`/api/v2/messages/sessions/${sessionId}/flush`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Session flushed to embeddings successfully!');
        loadSessions();
      }
    } catch (error) {
      console.error('Error flushing session:', error);
    }
  };

  const handleGenerateEmbeddings = async () => {
    try {
      const response = await fetchWithAuth('/api/v2/messages/embeddings/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        alert('Message embeddings generation started!');
        loadAnalytics();
      }
    } catch (error) {
      console.error('Error generating embeddings:', error);
    }
  };

  // Prepare chart data
  const dailyActivityData = stats.dailyActivity?.map((d: any) => ({
    date: new Date(d.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
    messages: d.messages,
    sessions: d.sessions
  })) || [];

  const messageTypesData = stats.messageTypes?.map((m: any) => ({
    name: m.message_type === 'question' ? 'Sorular' :
          m.message_type === 'answer' ? 'Cevaplar' :
          m.message_type === 'search_result' ? 'Arama Sonuçları' : m.message_type,
    value: parseInt(m.count),
    color: m.message_type === 'question' ? '#3B82F6' :
           m.message_type === 'answer' ? '#10B981' : '#F59E0B'
  })) || [];

  const topicsData = topics.slice(0, 10).map((t, i) => ({
    name: t.word,
    frequency: t.frequency,
    ratio: Math.round(t.answer_ratio * 100)
  }));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mesaj Analizleri</h1>
          <p className="text-muted-foreground mt-1">
            Kullanıcı mesajlaşmaları, arama sonuçları ve öğrenme verileri
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Son 7 gün</SelectItem>
              <SelectItem value="30">Son 30 gün</SelectItem>
              <SelectItem value="90">Son 90 gün</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => handleExport('json')}>
            <Download className="w-4 h-4 mr-2" />
            İndir (JSON)
          </Button>
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="w-4 h-4 mr-2" />
            İndir (CSV)
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Genel Bakış
          </TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Oturumlar
          </TabsTrigger>
          <TabsTrigger value="topics" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Konular
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Araştırma
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Analitik
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900">
                    <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Toplam Mesaj</p>
                    <p className="text-2xl font-bold">{stats.totalMessages[0]?.count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900">
                    <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Oturum Sayısı</p>
                    <p className="text-2xl font-bold">{stats.totalSessions[0]?.count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg dark:bg-purple-900">
                    <Activity className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ortalama/Oturum</p>
                    <p className="text-2xl font-bold">{patterns.avg_messages_per_session ? Math.round(patterns.avg_messages_per_session) : 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg dark:bg-orange-900">
                    <Database className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Embeddings</p>
                    <p className="text-2xl font-bold">{stats.messageTypes?.reduce((sum: number, m: any) => sum + parseInt(m.count), 0) || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Günlük Aktivite
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyActivityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="messages" stroke="#3B82F6" strokeWidth={2} />
                    <Line type="monotone" dataKey="sessions" stroke="#10B981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Mesaj Türleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={messageTypesData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {messageTypesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Popüler Sorular
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topQueries?.slice(0, 10).map((query: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                      <p className="text-sm">{query.content}</p>
                    </div>
                    <Badge variant="secondary">{query.frequency}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Oturum Geçmişi</CardTitle>
              <CardDescription>
                Kullanıcı oturumları ve mesaj detayları
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div
                    key={session.session_id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedSession?.session_id === session.session_id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setSelectedSession(session);
                      loadSessionDetails(session.session_id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium">{session.session_id}</h3>
                          <Badge variant="outline">{session.message_count} mesaj</Badge>
                          <Badge variant="secondary">{session.message_types} tür</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>Başlangıç: {new Date(session.started_at).toLocaleString('tr-TR')}</span>
                          <span>Son aktivite: {new Date(session.last_activity).toLocaleString('tr-TR')}</span>
                        </div>
                        {session.questions?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-muted-foreground">Son soru:</p>
                            <p className="text-sm">{session.questions[0].content}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFlushSession(session.session_id);
                          }}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedSession && (
            <Card>
              <CardHeader>
                <CardTitle>Oturum Detayları</CardTitle>
                <CardDescription>
                  {selectedSession.session_id} - {sessionMessages.length} etkileşim
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {sessionMessages.map((interaction: any) => (
                      <div key={interaction.id} className="p-4 border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={interaction.messages[0].message_type === 'question' ? 'default' : 'secondary'}>
                            {interaction.messages[0].message_type === 'question' ? 'Soru' : 'Cevap'}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {new Date(interaction.timestamp).toLocaleString('tr-TR')}
                          </span>
                        </div>
                        {interaction.messages.map((msg: any, idx: number) => (
                          <div key={idx} className="mt-2">
                            <p className="text-sm">{msg.content}</p>
                            {msg.metadata?.sources && msg.metadata.sources.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground mb-1">Kaynaklar:</p>
                                <div className="flex flex-wrap gap-1">
                                  {msg.metadata.sources.slice(0, 3).map((source: any, sidx: number) => (
                                    <Badge key={sidx} variant="outline" className="text-xs">
                                      {source.sourceType || 'Kaynak'}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="topics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="w-5 h-5" />
                Popüler Konular
              </CardTitle>
              <CardDescription>
                En çok konuşulan konular ve sıklıkları
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Konu Frekansları</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={topicsData} layout="horizontal">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={80} />
                      <Tooltip />
                      <Bar dataKey="frequency" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-4">Konu Listesi</h3>
                  <div className="space-y-3">
                    {topics.map((topic, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-muted-foreground">#{idx + 1}</span>
                          <span className="font-medium">{topic.word}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{topic.frequency} kez</Badge>
                          <Badge variant="outline">{topic.ratio}% cevap</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Mesaj İçinde Ara</CardTitle>
              <CardDescription>
                Geçmiş mesajlarda anlamsal arama yapın
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Aranacak kelime veya cümle..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch}>
                  <Search className="w-4 h-4 mr-2" />
                  Ara
                </Button>
              </div>
            </CardContent>
          </Card>

          {searchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Arama Sonuçları ({searchResults.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {searchResults.map((result) => (
                    <div key={result.id} className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{result.message_type}</Badge>
                        {result.similarity && (
                          <Badge variant="secondary">
                            %{Math.round(result.similarity * 100)} benzerlik
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {new Date(result.created_at).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <p className="text-sm mb-2">{result.content}</p>
                      {result.sources && result.sources.length > 0 && (
                        <div className="flex gap-1">
                          {result.sources.slice(0, 3).map((source: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {source.sourceType || 'Kaynak'}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Kullanıcı Desenleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Toplam Oturum</span>
                    <span className="font-medium">{patterns.total_sessions || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Toplam Mesaj</span>
                    <span className="font-medium">{patterns.total_messages || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Oturum Başına Ortalama</span>
                    <span className="font-medium">
                      {patterns.avg_messages_per_session ? Math.round(patterns.avg_messages_per_session) : 0} mesaj
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ortalama Oturum Süresi</span>
                    <span className="font-medium">{patterns.avg_session_duration || 'N/A'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Öğrenme Metrikleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">Embedding Durumu</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mesajlar otomatik olarak vektörlere dönüştürülüyor
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Brain className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">Öğrenme Modu</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Kullanıcı etkileşimlerinden öğreniliyor
                    </p>
                    <Button size="sm" variant="outline" onClick={handleGenerateEmbeddings} className="mt-2">
                      Embeddings Oluştur
                    </Button>
                  </div>
                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium">Otomatik Temizlik</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      7 günden sonra Redis'ten otomatik siliniyor
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {user?.role === 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle>Yönetici İşlemleri</CardTitle>
                <CardDescription>
                  Sistem bakım ve temizlik işlemleri
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={() => {
                    if (confirm('90 günden eski tüm mesajları silmek istediğinize emin misiniz?')) {
                      fetchWithAuth('/api/v2/messages/cleanup', {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ daysToKeep: 90 })
                      }).then(() => {
                        alert('Temizlik işlemi başlatıldı');
                        loadAnalytics();
                      });
                    }
                  }}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eski Mesajları Temizle
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}