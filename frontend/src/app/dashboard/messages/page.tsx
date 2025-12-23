"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/api/client";
import {
  MessageSquare,
  Users,
  Clock,
  Download,
  RefreshCw,
  Search,
  Trash2,
  Send,
  Brain,
  ChevronRight,
  Loader2,
  MessageCircle,
  TrendingUp,
  BarChart3,
  Filter,
  CheckCircle2
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// Interfaces
interface SessionMessage {
  id: string;
  timestamp: string;
  user_message: {
    content: string;
    tokens_used?: number;
  };
  ai_response: {
    content: string;
    tokens_used?: number;
    embedding_processed?: boolean;
    response_quality?: 'high' | 'medium' | 'low';
    sources?: any[];
  };
}

interface Session {
  session_id: string;
  started_at: string;
  last_activity: string;
  message_count: number;
  message_types: number;
  questions?: { content: string; timestamp: string }[];
}

interface Stats {
  totalMessages: { count: number }[];
  totalSessions: { count: number }[];
  messageTypes: { message_type: string; count: string }[];
  topQueries: { content: string; frequency: number }[];
  dailyActivity: { date: string; messages: number; sessions: number }[];
}

interface Topic {
  word: string;
  frequency: number;
  answer_ratio?: number;
}

interface Patterns {
  avg_messages_per_session?: number;
  peak_hours?: string[];
  common_topics?: string[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function MessagesPage() {
  const { t } = useTranslation('messages');
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30");

  // Data states
  const [stats, setStats] = useState<Stats>({
    totalMessages: [],
    totalSessions: [],
    messageTypes: [],
    topQueries: [],
    dailyActivity: []
  });
  const [patterns, setPatterns] = useState<Patterns>({});
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);

  // Selection states
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);

  // Filter and sort states
  const [filterStatus, setFilterStatus] = useState<'all' | 'embedded' | 'not-embedded'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'tokens' | 'quality'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Stats
  const [tokenUsage, setTokenUsage] = useState({ totalTokens: 0, avgTokensPerMessage: 0 });
  const [embeddingStats, setEmbeddingStats] = useState({ processed: 0, pending: 0 });

  // Load data on mount and time range change
  useEffect(() => {
    loadAnalytics();
    loadSessions();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<any>(`/messages/analytics?timeRange=${timeRange}`);

      if (response.data) {
        setStats(response.data.stats || {
          totalMessages: [],
          totalSessions: [],
          messageTypes: [],
          topQueries: [],
          dailyActivity: []
        });
        setPatterns(response.data.patterns || {});
        setTopics(response.data.topics || []);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: t('errors.loadFailed', 'Yükleme başarısız'),
        description: t('errors.tryAgain', 'Lütfen tekrar deneyin'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      const response = await apiClient.get<any>('/messages/sessions?limit=50');

      if (response.data) {
        setSessions(response.data.sessions || []);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    try {
      setLoading(true);
      const response = await apiClient.get<any>(`/messages/sessions/${sessionId}`);

      if (response.data) {
        const data = response.data;
        // Transform interactions to session messages format
        const messages = data.interactions?.map((interaction: any) => ({
          id: interaction.id || crypto.randomUUID(),
          timestamp: interaction.timestamp,
          user_message: {
            content: interaction.messages?.find((m: any) => m.type === 'question')?.content || '',
            tokens_used: interaction.messages?.find((m: any) => m.type === 'question')?.tokens || 0
          },
          ai_response: {
            content: interaction.messages?.find((m: any) => m.type === 'answer')?.content || '',
            tokens_used: interaction.messages?.find((m: any) => m.type === 'answer')?.tokens || 0,
            embedding_processed: interaction.messages?.find((m: any) => m.type === 'answer')?.embedded || false,
            sources: interaction.messages?.find((m: any) => m.type === 'answer')?.sources || []
          }
        })) || [];

        setSessionMessages(messages);

        // Calculate token usage
        const totalTokens = messages.reduce((sum: number, m: SessionMessage) => {
          return sum + (m.user_message.tokens_used || 0) + (m.ai_response.tokens_used || 0);
        }, 0);
        const avgTokens = messages.length > 0 ? totalTokens / messages.length : 0;

        setTokenUsage({
          totalTokens,
          avgTokensPerMessage: Math.round(avgTokens)
        });

        // Calculate embedding stats
        const processed = messages.filter((m: SessionMessage) => m.ai_response.embedding_processed).length;
        const pending = messages.length - processed;

        setEmbeddingStats({ processed, pending });
      }
    } catch (error) {
      console.error('Error loading session details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setSearchLoading(true);
      const response = await apiClient.post<any>('/messages/search', {
        query: searchQuery,
        limit: 20,
        includeSources: true
      });

      if (response.data) {
        setSearchResults(response.data.messages || []);
      }
    } catch (error) {
      console.error('Error searching messages:', error);
      toast({
        title: t('errors.searchFailed', 'Arama başarısız'),
        variant: 'destructive'
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await apiClient.get(`/messages/export?format=${format}`, {
        responseType: 'blob'
      });

      if (response.data) {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = `messages.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast({
          title: t('alerts.exportSuccess', 'Dışa aktarma başarılı'),
          description: `messages.${format} indirildi`
        });
      }
    } catch (error) {
      console.error('Error exporting messages:', error);
      toast({
        title: t('errors.exportFailed', 'Dışa aktarma başarısız'),
        variant: 'destructive'
      });
    }
  };

  const handleFlushSession = async (sessionId: string) => {
    try {
      await apiClient.post(`/messages/sessions/${sessionId}/flush`);
      toast({
        title: t('alerts.sessionFlushed', 'Oturum gönderildi'),
        description: t('alerts.embeddingsQueued', 'Embedding kuyruğuna eklendi')
      });
      loadSessions();
    } catch (error) {
      console.error('Error flushing session:', error);
      toast({
        title: t('errors.flushFailed', 'Gönderme başarısız'),
        variant: 'destructive'
      });
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await apiClient.delete(`/messages/sessions/${sessionId}`);
      toast({
        title: t('alerts.sessionDeleted', 'Oturum silindi')
      });
      loadSessions();
      if (selectedSession?.session_id === sessionId) {
        setSelectedSession(null);
        setSessionMessages([]);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: t('errors.deleteFailed', 'Silme başarısız'),
        variant: 'destructive'
      });
    }
  };

  const handleDeleteSelectedSessions = async () => {
    if (selectedSessions.length === 0) return;

    try {
      await apiClient.delete('/messages/sessions/batch', {
        data: { sessionIds: selectedSessions }
      });
      toast({
        title: t('alerts.selectedSessionsDeleted', 'Seçili oturumlar silindi'),
        description: `${selectedSessions.length} oturum silindi`
      });
      setSelectedSessions([]);
      loadSessions();
    } catch (error) {
      console.error('Error deleting selected sessions:', error);
      toast({
        title: t('errors.deleteFailed', 'Silme başarısız'),
        variant: 'destructive'
      });
    }
  };

  const handleSelectSession = (sessionId: string) => {
    if (selectedSessions.includes(sessionId)) {
      setSelectedSessions(selectedSessions.filter(id => id !== sessionId));
    } else {
      setSelectedSessions([...selectedSessions, sessionId]);
    }
  };

  const handleSelectAllSessions = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.session_id));
    }
  };

  // Filter and sort messages
  const getFilteredAndSortedMessages = () => {
    let filtered = [...sessionMessages];

    if (filterStatus === 'embedded') {
      filtered = filtered.filter(m => m.ai_response.embedding_processed);
    } else if (filterStatus === 'not-embedded') {
      filtered = filtered.filter(m => !m.ai_response.embedding_processed);
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'tokens':
          const tokensA = (a.user_message.tokens_used || 0) + (a.ai_response.tokens_used || 0);
          const tokensB = (b.user_message.tokens_used || 0) + (b.ai_response.tokens_used || 0);
          comparison = tokensA - tokensB;
          break;
        case 'quality':
          const qualityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          comparison = (qualityOrder[a.ai_response.response_quality || 'low'] || 0) -
                       (qualityOrder[b.ai_response.response_quality || 'low'] || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  // Prepare chart data
  const dailyActivityData = stats.dailyActivity?.map(d => ({
    date: new Date(d.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
    messages: d.messages,
    sessions: d.sessions
  })) || [];

  const messageTypesData = stats.messageTypes?.map(m => ({
    name: m.message_type === 'question' ? 'Sorular' :
      m.message_type === 'answer' ? 'Cevaplar' :
      m.message_type === 'search_result' ? 'Arama Sonuçları' : m.message_type,
    value: parseInt(m.count),
    color: m.message_type === 'question' ? '#3B82F6' :
      m.message_type === 'answer' ? '#10B981' : '#F59E0B'
  })) || [];

  const topicsData = topics.slice(0, 10).map(t => ({
    name: t.word,
    frequency: t.frequency,
    ratio: t.answer_ratio ? Math.round(t.answer_ratio * 100) : 0
  }));

  const totalMessages = stats.totalMessages?.[0]?.count || 0;
  const totalSessions = stats.totalSessions?.[0]?.count || 0;
  const avgPerSession = patterns.avg_messages_per_session ? Math.round(patterns.avg_messages_per_session) : 0;

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            {t('title', 'Mesajlar ve Konuşmalar')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle', 'AI sohbet geçmişi ve analitikleri')}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Son 7 Gün</SelectItem>
              <SelectItem value="30">Son 30 Gün</SelectItem>
              <SelectItem value="90">Son 90 Gün</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => loadAnalytics()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Button variant="outline" onClick={() => handleExport('json')}>
            <Download className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Toplam Mesaj</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : totalMessages}
                </p>
              </div>
              <MessageCircle className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900 dark:to-green-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Oturum Sayısı</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : totalSessions}
                </p>
              </div>
              <Users className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900 dark:to-orange-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ort. Mesaj/Oturum</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : avgPerSession}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900 dark:to-purple-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Popüler Konular</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : topics.length}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="sessions">Oturumlar</TabsTrigger>
          <TabsTrigger value="search">Arama</TabsTrigger>
          <TabsTrigger value="topics">Konular</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Activity Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Günlük Aktivite</CardTitle>
                <CardDescription>Mesaj ve oturum sayıları</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyActivityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyActivityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="messages" stroke="#3B82F6" name="Mesajlar" />
                      <Line type="monotone" dataKey="sessions" stroke="#10B981" name="Oturumlar" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Henüz veri yok
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Message Types Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Mesaj Türleri</CardTitle>
                <CardDescription>Soru, cevap ve arama dağılımı</CardDescription>
              </CardHeader>
              <CardContent>
                {messageTypesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={messageTypesData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        dataKey="value"
                      >
                        {messageTypesData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Henüz veri yok
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Queries */}
          <Card>
            <CardHeader>
              <CardTitle>Popüler Sorular</CardTitle>
              <CardDescription>En çok sorulan sorular</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.topQueries?.length > 0 ? stats.topQueries.slice(0, 10).map((query, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                        {idx + 1}
                      </Badge>
                      <p className="text-sm">{query.content}</p>
                    </div>
                    <Badge variant="secondary">{query.frequency} kez</Badge>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">
                    Henüz popüler soru yok
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sessions List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Oturumlar</CardTitle>
                    <CardDescription>{sessions.length} oturum</CardDescription>
                  </div>
                  {selectedSessions.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelectedSessions}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {selectedSessions.length}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-4">
                  <Checkbox
                    checked={selectedSessions.length === sessions.length && sessions.length > 0}
                    onCheckedChange={handleSelectAllSessions}
                  />
                  <span className="text-sm text-muted-foreground">Tümünü seç</span>
                </div>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div
                        key={session.session_id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedSession?.session_id === session.session_id
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={selectedSessions.includes(session.session_id)}
                            onCheckedChange={() => handleSelectSession(session.session_id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div
                            className="flex-1"
                            onClick={() => {
                              setSelectedSession(session);
                              loadSessionDetails(session.session_id);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">{session.message_count} mesaj</Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(session.started_at).toLocaleString('tr-TR')}
                            </p>
                            {session.questions?.[0] && (
                              <p className="text-xs mt-1 line-clamp-2">
                                {session.questions[0].content}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 mt-2 ml-6">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFlushSession(session.session_id);
                            }}
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.session_id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {sessions.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        Henüz oturum yok
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Session Details */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Konuşma Detayları</CardTitle>
                    <CardDescription>
                      {selectedSession
                        ? `${sessionMessages.length} etkileşim`
                        : 'Bir oturum seçin'}
                    </CardDescription>
                  </div>
                  {selectedSession && (
                    <div className="flex gap-2">
                      <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
                        <SelectTrigger className="w-[140px]">
                          <Filter className="h-4 w-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tümü</SelectItem>
                          <SelectItem value="embedded">Embedded</SelectItem>
                          <SelectItem value="not-embedded">Bekliyor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedSession ? (
                  <>
                    {/* Stats Bar */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs text-blue-600 dark:text-blue-400">Token Kullanımı</p>
                        <p className="text-lg font-bold">{tokenUsage.totalTokens.toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-xs text-green-600 dark:text-green-400">Embedded</p>
                        <p className="text-lg font-bold">{embeddingStats.processed}/{sessionMessages.length}</p>
                      </div>
                      <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <p className="text-xs text-orange-600 dark:text-orange-400">Bekliyor</p>
                        <p className="text-lg font-bold">{embeddingStats.pending}</p>
                      </div>
                    </div>

                    {/* Messages */}
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-4">
                        {getFilteredAndSortedMessages().map((interaction) => (
                          <div key={interaction.id} className="p-4 border rounded-lg space-y-3">
                            {/* User Message */}
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">U</span>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium">Kullanıcı</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(interaction.timestamp).toLocaleString('tr-TR')}
                                  </span>
                                  {interaction.user_message.tokens_used && (
                                    <Badge variant="outline" className="text-xs">
                                      {interaction.user_message.tokens_used} token
                                    </Badge>
                                  )}
                                </div>
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                  <p className="text-sm">{interaction.user_message.content}</p>
                                </div>
                              </div>
                            </div>

                            {/* AI Response */}
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center shrink-0">
                                <Brain className="h-4 w-4 text-green-600 dark:text-green-400" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium">AI</span>
                                  {interaction.ai_response.tokens_used && (
                                    <Badge variant="outline" className="text-xs">
                                      {interaction.ai_response.tokens_used} token
                                    </Badge>
                                  )}
                                  {interaction.ai_response.embedding_processed && (
                                    <Badge variant="secondary" className="text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Embedded
                                    </Badge>
                                  )}
                                </div>
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                  <p className="text-sm whitespace-pre-wrap">
                                    {interaction.ai_response.content}
                                  </p>
                                </div>
                                {interaction.ai_response.sources && interaction.ai_response.sources.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {interaction.ai_response.sources.slice(0, 3).map((source: any, idx: number) => (
                                      <Badge key={idx} variant="outline" className="text-xs">
                                        {source.sourceType || 'Kaynak'}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {sessionMessages.length === 0 && (
                          <div className="text-center text-muted-foreground py-8">
                            Bu oturumda mesaj bulunamadı
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Detayları görüntülemek için bir oturum seçin</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Semantik Arama</CardTitle>
              <CardDescription>Mesaj geçmişinde arama yapın</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-6">
                <Input
                  placeholder="Aramak istediğiniz konuyu yazın..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={searchLoading || !searchQuery.trim()}>
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-2">Ara</span>
                </Button>
              </div>

              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {searchResults.map((result, idx) => (
                    <div key={idx} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">{result.message_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(result.created_at).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <p className="text-sm">{result.contentPreview || result.content}</p>
                      {result.similarity && (
                        <div className="mt-2">
                          <Badge variant="secondary">
                            Benzerlik: {(result.similarity * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))}
                  {searchResults.length === 0 && searchQuery && !searchLoading && (
                    <div className="text-center text-muted-foreground py-8">
                      Sonuç bulunamadı
                    </div>
                  )}
                  {!searchQuery && (
                    <div className="text-center text-muted-foreground py-8">
                      <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Aramak için bir sorgu girin</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Topics Tab */}
        <TabsContent value="topics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Topics Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Konu Frekansları</CardTitle>
                <CardDescription>En çok konuşulan konular</CardDescription>
              </CardHeader>
              <CardContent>
                {topicsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={topicsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip />
                      <Bar dataKey="frequency" fill="#3B82F6" name="Frekans" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    Henüz konu verisi yok
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Topics List */}
            <Card>
              <CardHeader>
                <CardTitle>Konu Listesi</CardTitle>
                <CardDescription>Detaylı konu bilgileri</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {topics.map((topic, idx) => (
                      <div key={idx} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                              {idx + 1}
                            </Badge>
                            <span className="font-medium">{topic.word}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{topic.frequency} kez</Badge>
                            {topic.answer_ratio !== undefined && (
                              <Badge variant="outline">
                                {Math.round(topic.answer_ratio * 100)}% cevaplanmış
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {topics.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        Henüz konu verisi yok
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
