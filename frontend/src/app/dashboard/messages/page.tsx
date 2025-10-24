"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton, StatsCardSkeleton, ListSkeleton, ChartSkeleton } from "@/components/ui/skeleton";
import { ConfirmTooltip } from "@/components/ui/confirm-tooltip";
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
  total_sessions?: number;
  total_messages?: number;
  avg_messages_per_session?: number;
  avg_session_duration?: string;
  topics?: any[];
}

interface Topic {
  word: string;
  frequency: number;
  answer_ratio?: number;
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
  user_id?: string;
  username?: string;
  tokens_used?: number;
  response_quality?: 'high' | 'medium' | 'low';
  embedding_processed?: boolean;
}

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
    response_quality?: 'high' | 'medium' | 'low';
    sources?: any[];
    embedding_processed?: boolean;
  };
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
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);
  const [tokenUsage, setTokenUsage] = useState({ totalTokens: 0, avgTokensPerMessage: 0 });
  const [embeddingStats, setEmbeddingStats] = useState({ processed: 0, pending: 0 });
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'embedded' | 'not-embedded'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'tokens' | 'quality'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showBatchActions, setShowBatchActions] = useState(false);

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
      setLoading(true);
      const response = await fetchWithAuth(`/api/v2/messages/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSessionMessages(data.interactions);

        // Calculate token usage
        const totalTokens = data.interactions.reduce((sum: number, interaction: SessionMessage) => {
          return sum + (interaction.user_message.tokens_used || 0) + (interaction.ai_response.tokens_used || 0);
        }, 0);
        const avgTokens = data.interactions.length > 0 ? totalTokens / data.interactions.length : 0;

        setTokenUsage({
          totalTokens,
          avgTokensPerMessage: Math.round(avgTokens)
        });

        // Calculate embedding stats
        const processed = data.interactions.filter((i: SessionMessage) =>
          i.ai_response.embedding_processed
        ).length;
        const pending = data.interactions.length - processed;

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
        if (selectedSession) {
          loadSessionDetails(selectedSession.session_id);
        }
      }
    } catch (error) {
      console.error('Error generating embeddings:', error);
    }
  };

  const handleEmbedSpecificResponse = async (interactionId: string) => {
    try {
      const response = await fetchWithAuth(`/api/v2/messages/embeddings/interactions/${interactionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        alert('Response embedded successfully!');
        if (selectedSession) {
          loadSessionDetails(selectedSession.session_id);
        }
      }
    } catch (error) {
      console.error('Error embedding specific response:', error);
    }
  };

  const handleBatchEmbedResponses = async () => {
    if (!selectedSession || sessionMessages.length === 0) return;

    try {
        const response = await fetchWithAuth(`/api/v2/messages/embeddings/batch/session/${selectedSession.session_id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

      if (response.ok) {
        alert('Toplu embedding işlemi başlatıldı!');
        loadSessionDetails(selectedSession.session_id);
      }
    } catch (error) {
      console.error('Error in batch embedding:', error);
    }
  };

  const handleBatchEmbedSelected = async () => {
    if (selectedMessages.length === 0) return;

    try {
        const response = await fetchWithAuth('/api/v2/messages/embeddings/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messageIds: selectedMessages
          })
        });

      if (response.ok) {
        alert('Seçilen mesajlar için embedding işlemi başlatıldı!');
        setSelectedMessages([]);
        setShowBatchActions(false);
        if (selectedSession) {
          loadSessionDetails(selectedSession.session_id);
        }
      }
    } catch (error) {
      console.error('Error in selected batch embedding:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const response = await fetchWithAuth(`/api/v2/messages/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Oturum başarıyla silindi!');
        loadSessions();
        if (selectedSession?.session_id === sessionId) {
          setSelectedSession(null);
          setSessionMessages([]);
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const handleDeleteSelectedSessions = async () => {
    if (selectedSessions.length === 0) return;

    try {
        const response = await fetchWithAuth('/api/v2/messages/sessions/batch', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionIds: selectedSessions
          })
        });

      if (response.ok) {
        alert('Seçilen oturumlar başarıyla silindi!');
        setSelectedSessions([]);
        loadSessions();
      }
    } catch (error) {
      console.error('Error deleting selected sessions:', error);
    }
  };

  const handleSelectAll = () => {
    if (selectAllChecked) {
      setSelectedSessions([]);
      setSelectAllChecked(false);
    } else {
      const sessionIds = sessions.map(session => session.session_id);
      setSelectedSessions(sessionIds);
      setSelectAllChecked(true);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    if (selectedSessions.includes(sessionId)) {
      setSelectedSessions(selectedSessions.filter(id => id !== sessionId));
      setSelectAllChecked(false);
    } else {
      setSelectedSessions([...selectedSessions, sessionId]);
    }
  };

  const handleSelectMessage = (messageId: string) => {
    if (selectedMessages.includes(messageId)) {
      setSelectedMessages(selectedMessages.filter(id => id !== messageId));
    } else {
      setSelectedMessages([...selectedMessages, messageId]);
    }
  };

  const handleSelectAllMessages = () => {
    if (selectedMessages.length === sessionMessages.length) {
      setSelectedMessages([]);
    } else {
      const messageIds = sessionMessages.map(message => message.id);
      setSelectedMessages(messageIds);
    }
  };

  // Filter and sort functions
  const getFilteredAndSortedMessages = () => {
    let filtered = [...sessionMessages];

    // Apply filter
    if (filterStatus === 'embedded') {
      filtered = filtered.filter(message =>
        message.ai_response.embedding_processed
      );
    } else if (filterStatus === 'not-embedded') {
      filtered = filtered.filter(message =>
        !message.ai_response.embedding_processed
      );
    }

    // Apply sorting
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
          const qualityA = a.ai_response.response_quality || 'low';
          const qualityB = b.ai_response.response_quality || 'low';
          const qualityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          comparison = qualityOrder[qualityA] - qualityOrder[qualityB];
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  // User behavior analysis functions
  const analyzeUserBehavior = () => {
    if (sessionMessages.length === 0) return null;

    const totalQuestions = sessionMessages.length;
    const avgQuestionLength = sessionMessages.reduce((sum, msg) =>
      sum + msg.user_message.content.length, 0) / totalQuestions;

    const responseTimes = sessionMessages.map((_, index) => {
      if (index === 0) return 0;
      const current = new Date(sessionMessages[index].timestamp);
      const previous = new Date(sessionMessages[index - 1].timestamp);
      return current.getTime() - previous.getTime();
    }).filter(time => time > 0);

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const questionTopics = sessionMessages.map(msg => msg.user_message.content)
      .join(' ')
      .toLowerCase()
      .split(/[,\.\s]+/)
      .filter(word => word.length > 3);

    const topicFrequency = questionTopics.reduce((freq, topic) => {
      freq[topic] = (freq[topic] || 0) + 1;
      return freq;
    }, {} as Record<string, number>);

    return {
      totalQuestions,
      avgQuestionLength: Math.round(avgQuestionLength),
      avgResponseTime: Math.round(avgResponseTime / 1000), // Convert to seconds
      mostFrequentTopics: Object.entries(topicFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([topic, freq]) => ({ topic, freq })),
      sessionDuration: new Date(sessionMessages[sessionMessages.length - 1].timestamp).getTime() -
                     new Date(sessionMessages[0].timestamp).getTime()
    };
  };

  const userBehaviorAnalysis = analyzeUserBehavior();

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

  const topicsData = topics.slice(0, 10).map((t) => ({
    name: t.word,
    frequency: t.frequency,
    ratio: t.answer_ratio ? Math.round(t.answer_ratio * 100) : 0
  }));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mesaj Analizleri</h1>
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
            İndir (JSON)
          </Button>
          <Button variant="outline" onClick={() => handleExport('csv')}>
            İndir (CSV)
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">
            Genel Bakış
          </TabsTrigger>
          <TabsTrigger value="sessions">
            Oturumlar
          </TabsTrigger>
          <TabsTrigger value="topics">
            Konular
          </TabsTrigger>
          <TabsTrigger value="search">
            Araştırma
          </TabsTrigger>
          <TabsTrigger value="analytics">
            Analitik
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm text-muted-foreground">Toplam Mesaj</p>
                  <p className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      stats.totalMessages[0]?.count || 0
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm text-muted-foreground">Oturum Sayısı</p>
                  <p className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      stats.totalSessions[0]?.count || 0
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm text-muted-foreground">Ortalama/Oturum</p>
                  <p className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      patterns.avg_messages_per_session ? Math.round(patterns.avg_messages_per_session) : 0
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm text-muted-foreground">Embeddings</p>
                  <p className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      stats.messageTypes?.reduce((sum: number, m: any) => sum + parseInt(m.count), 0) || 0
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Removed - No data visualization available yet */}

          {/* Top Queries */}
          <Card>
            <CardHeader>
              <CardTitle>Popüler Sorular</CardTitle>
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
          {/* Sessions Header with Batch Actions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Oturum Geçmişi</CardTitle>
                  <CardDescription>
                    Kullanıcı oturumları ve mesaj detayları
                  </CardDescription>
                </div>
                {selectedSessions.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelectedSessions}
                    >
                      Seçilenleri Sil ({selectedSessions.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSessions([]);
                        setSelectAllChecked(false);
                      }}
                    >
                      Temizle
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Batch Actions Bar */}
              {selectedSessions.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {selectedSessions.length} oturum seçildi
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSelectAll}>
                        {selectAllChecked ? '☐' : '☑'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {sessions.map((session) => (
                  <div
                    key={session.session_id}
                    className={`p-4 border rounded-lg transition-colors ${
                      selectedSession?.session_id === session.session_id
                        ? 'border-primary bg-primary/5'
                        : selectedSessions.includes(session.session_id)
                        ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {/* Session Selection Checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedSessions.includes(session.session_id)}
                          onChange={() => handleSelectSession(session.session_id)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />

                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => {
                            setSelectedSession(session);
                            loadSessionDetails(session.session_id);
                          }}
                        >
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
                          Gönder
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session.session_id);
                          }}
                        >
                          Sil
                        </Button>
                        <span
                          className={`text-muted-foreground cursor-pointer hover:text-primary ${
                            selectedSession?.session_id === session.session_id ? 'text-primary' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSession(session);
                            loadSessionDetails(session.session_id);
                          }}
                        >
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedSession && (
            <>
              {/* Session Overview */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Oturum Özeti</CardTitle>
                      <CardDescription>
                        {selectedSession.session_id} - {sessionMessages.length} etkileşim
                      </CardDescription>
                    </div>
                    {selectedMessages.length > 0 && (
                      <div className="flex gap-2">
                        <Button onClick={handleBatchEmbedSelected} size="sm">
                          Seçilenleri Embed Et ({selectedMessages.length})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedMessages([])}
                        >
                          Temizle
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">Token Kullanımı</h4>
                      <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {tokenUsage.totalTokens.toLocaleString()}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Ortalama: {tokenUsage.avgTokensPerMessage} mesaj başına
                      </p>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <h4 className="text-sm font-medium text-green-700 dark:text-green-300">Embeddings</h4>
                      <p className="text-2xl font-bold text-green-900 dark:text-blue-100">
                        {embeddingStats.processed}/{sessionMessages.length}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        İşlendi
                      </p>
                    </div>
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300">Bekleyen</h4>
                      <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                        {embeddingStats.pending}
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        Embedding işlemi bekliyor
                      </p>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300">Seçili</h4>
                      <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                        {selectedMessages.length}
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        Mesaj
                      </p>
                    </div>
                  </div>

                  {/* Filters and Sort Controls */}
                  <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Filtre:</span>
                      <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tümü</SelectItem>
                          <SelectItem value="embedded">Embed Edilen</SelectItem>
                          <SelectItem value="not-embedded">Embed Edilmeyen</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Sırala:</span>
                      <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date">Tarih</SelectItem>
                          <SelectItem value="tokens">Token</SelectItem>
                          <SelectItem value="quality">Kalite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </Button>
                    <Button onClick={handleSelectAllMessages} size="sm">
                      {selectedMessages.length === sessionMessages.length ? '☐' : '☑'}
                    </Button>
                  </div>

                  <div className="flex gap-2 mb-4">
                    <Button onClick={handleBatchEmbedResponses} size="sm">
                      Tümünü Embed Et
                    </Button>
                    <Button variant="outline" onClick={handleGenerateEmbeddings} size="sm">
                      Sistem Embeddings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Session Messages */}
              <Card>
                <CardHeader>
                  <CardTitle>Oturum Yazışmaları</CardTitle>
                  <CardDescription>
                    Kullanıcı soruları ve LLM yanıtları
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-6">
                      {getFilteredAndSortedMessages().map((interaction) => (
                        <div key={interaction.id} className="p-4 border rounded-lg space-y-3">
                          {/* Message Selection Checkbox */}
                          <div className="flex justify-start">
                            <input
                              type="checkbox"
                              checked={selectedMessages.includes(interaction.id)}
                              onChange={() => handleSelectMessage(interaction.id)}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                          </div>

                          {/* User Message */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">K</span>
                                </div>
                                <div>
                                  <h4 className="font-medium text-sm">Kullanıcı</h4>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(interaction.timestamp).toLocaleString('tr-TR')}
                                  </p>
                                </div>
                                {interaction.user_message.tokens_used && (
                                  <Badge variant="outline" className="text-xs">
                                    {interaction.user_message.tokens_used} token
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="ml-10 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                              <p className="text-sm">{interaction.user_message.content}</p>
                            </div>
                          </div>

                          {/* AI Response */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-green-600 dark:text-green-400">AI</span>
                                </div>
                                <div>
                                  <h4 className="font-medium text-sm">Alice (LLM)</h4>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(interaction.timestamp).toLocaleString('tr-TR')}
                                  </p>
                                </div>
                                {interaction.ai_response.tokens_used && (
                                  <Badge variant="outline" className="text-xs">
                                    {interaction.ai_response.tokens_used} token
                                  </Badge>
                                )}
                                {interaction.ai_response.response_quality && (
                                  <Badge
                                    variant={interaction.ai_response.response_quality === 'high' ? 'default' :
                                           interaction.ai_response.response_quality === 'medium' ? 'secondary' : 'destructive'}
                                    className="text-xs"
                                  >
                                    {interaction.ai_response.response_quality === 'high' ? 'Yüksek Kalite' :
                                     interaction.ai_response.response_quality === 'medium' ? 'Orta Kalite' : 'Düşük Kalite'}
                                  </Badge>
                                )}
                                {interaction.ai_response.embedding_processed && (
                                  <Badge variant="secondary" className="text-xs">
                                    ✓ Embed Edildi
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEmbedSpecificResponse(interaction.id)}
                                >
                                  Embed Et
                                </Button>
                              </div>
                            </div>
                            <div className="ml-10">
                              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <p className="text-sm whitespace-pre-wrap">{interaction.ai_response.content}</p>
                              </div>

                              {/* Sources */}
                              {interaction.ai_response.sources && interaction.ai_response.sources.length > 0 && (
                                <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                                    RAG Kaynakları:
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {interaction.ai_response.sources.slice(0, 3).map((source: any, idx: number) => (
                                      <Badge key={idx} variant="outline" className="text-xs">
                                        {source.sourceType || 'Kaynak'}
                                      </Badge>
                                    ))}
                                  </div>
                                  {interaction.ai_response.sources.length > 3 && (
                                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                                      +{interaction.ai_response.sources.length - 3} kaynak daha
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* User Behavior Analytics */}
              {userBehaviorAnalysis && (
                <Card>
                  <CardHeader>
                    <CardTitle>Kullanıcı Davranış Analizi</CardTitle>
                    <CardDescription>
                      Oturum kullanıcı davranışları ve istatistiksel analiz
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">Toplam Soru</h4>
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                          {userBehaviorAnalysis.totalQuestions}
                        </p>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <h4 className="text-sm font-medium text-green-700 dark:text-green-300">Ort. Soru Uzunluğu</h4>
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                          {userBehaviorAnalysis.avgQuestionLength} karakter
                        </p>
                      </div>
                      <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300">Ort. Yanıt Süresi</h4>
                        <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                          {userBehaviorAnalysis.avgResponseTime}s
                        </p>
                      </div>
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300">Oturum Süresi</h4>
                        <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                          {Math.round(userBehaviorAnalysis.sessionDuration / 1000 / 60)} dk
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-medium mb-3">Popüler Konular</h4>
                      <div className="space-y-2">
                        {userBehaviorAnalysis.mostFrequentTopics.map((topic, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                            <span className="font-medium">{topic.topic}</span>
                            <Badge variant="secondary">{topic.freq} kez</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}