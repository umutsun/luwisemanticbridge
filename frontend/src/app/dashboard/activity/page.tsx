'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../../lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Progress } from '../../../components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import {
  Activity,
  FileText,
  Hash,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Database,
  BarChart3,
  RefreshCw,
  Users,
  Filter,
  Calendar,
  Search,
  Download,
  Trash2,
  Eye,
  Zap,
  Globe,
  Brain,
  MessageSquare,
  Cpu,
  HardDrive,
  ChevronRight,
  ChevronDown,
  MoreHorizontal
} from 'lucide-react';
import Link from 'next/link';

interface ActivityItem {
  id: number;
  operation_type: string;
  source_url?: string;
  title?: string;
  status: string;
  details: any;
  metrics: any;
  error_message?: string;
  created_at: string;
}

interface ActivityStats {
  operation_type: string;
  count: string;
  success_count: string;
  error_count: string;
  avg_tokens?: string;
  total_tokens?: string;
  avg_chunks?: string;
  total_chunks?: string;
  avg_content_length?: string;
}

interface ActivitySummary {
  total_activities: number;
  success_rate: number;
  most_active_type: string;
  last_24h_count: number;
  avg_response_time: number;
}

interface DashboardStats {
  database: {
    documents: number;
    conversations: number;
    messages: number;
    size: string;
    embeddings?: number;
    vectors?: number;
  };
  redis: {
    connected: boolean;
    used_memory: string;
    total_commands_processed: number;
    cached_embeddings?: number;
  };
  lightrag: {
    initialized: boolean;
    documentCount: number;
    lastUpdate: string;
    nodeCount?: number;
    edgeCount?: number;
    communities?: number;
  };
  rag: {
    totalChunks?: number;
    avgChunkSize?: number;
    indexStatus?: string;
    lastIndexTime?: string;
  };
  recentActivity: Array<{
    id: string;
    title: string;
    message_count: number;
    created_at: string;
  }>;
}

export default function ActivityPage() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [statistics, setStatistics] = useState<ActivityStats[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const fetchActivities = async () => {
    try {
      setRefreshing(true);
      const params = new URLSearchParams();
      if (selectedType !== 'all') params.append('type', selectedType);
      if (searchTerm) params.append('search', searchTerm);
      if (dateRange.start) params.append('start_date', dateRange.start);
      if (dateRange.end) params.append('end_date', dateRange.end);
      params.append('limit', '100'); // Get more activities for better stats

      // Fetch activities from correct endpoint
      const [activitiesRes, statsRes, dashboardRes] = await Promise.all([
        fetch(`http://localhost:8083/api/v2/activity?${params.toString()}`),
        fetch(`http://localhost:8083/api/v2/activity/stats/overview`),
        fetch(getApiUrl('dashboard'))
      ]);

      const activitiesData = await activitiesRes.json();
      const statsData = await statsRes.json();
      const dashboardData = await dashboardRes.json();

      // Transform activities data to match expected format
      const transformedActivities = (activitiesData.activities || []).map((activity: any) => ({
        id: activity.id,
        operation_type: activity.activity_type || 'unknown',
        title: activity.description,
        status: activity.metadata?.status || 'success',
        source_url: activity.metadata?.url,
        metrics: activity.metadata?.metrics || {},
        error_message: activity.metadata?.error,
        created_at: activity.created_at
      }));

      setActivities(transformedActivities);

      // Calculate statistics from activities
      const statsMap = new Map();
      transformedActivities.forEach((activity: ActivityItem) => {
        const type = activity.operation_type;
        if (!statsMap.has(type)) {
          statsMap.set(type, {
            operation_type: type,
            count: 0,
            success_count: 0,
            error_count: 0,
            total_tokens: 0,
            total_chunks: 0
          });
        }
        const stat = statsMap.get(type);
        stat.count++;
        if (activity.status === 'success') stat.success_count++;
        else stat.error_count++;
        if (activity.metrics?.token_count) stat.total_tokens += activity.metrics.token_count;
        if (activity.metrics?.chunk_count) stat.total_chunks += activity.metrics.chunk_count;
      });

      setStatistics(Array.from(statsMap.values()));

      // Calculate summary
      const total = transformedActivities.length;
      const successCount = transformedActivities.filter(a => a.status === 'success').length;
      const last24h = transformedActivities.filter(a => {
        const activityDate = new Date(a.created_at);
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        return activityDate > dayAgo;
      }).length;

      // Get most active type from statistics
      const mostActive = Array.from(statsMap.values()).reduce((prev, current) =>
        (prev.count > current.count) ? prev : current, { operation_type: 'N/A' });

      setSummary({
        total_activities: total,
        success_rate: total > 0 ? Math.round((successCount / total) * 100) : 0,
        most_active_type: mostActive.operation_type,
        last_24h_count: last24h,
        avg_response_time: 0 // TODO: Calculate from metrics
      });

      // Store dashboard data for RAG stats
      setDashboardData(dashboardData);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError(t('dashboard.activity.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [selectedType, searchTerm, dateRange]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatNumber = (num: string | number | null | undefined) => {
    if (!num) return '0';
    return parseInt(num.toString()).toLocaleString('tr-TR');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'scrape':
        return <FileText className="w-4 h-4" />;
      case 'embedding':
        return <Hash className="w-4 h-4" />;
      case 'delete':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  if (loading && !refreshing) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Aktivite geçmişi yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const pieChartData = statistics.map(stat => ({
    name: stat.operation_type.charAt(0).toUpperCase() + stat.operation_type.slice(1),
    value: parseInt(stat.count),
    color: stat.operation_type === 'scrape' ? '#3b82f6' :
      stat.operation_type === 'embedding' ? '#10b981' :
        stat.operation_type === 'delete' ? '#ef4444' : '#8b5cf6'
  }));

  const dailyActivityData = [
    { date: 'Pazartesi', activities: 45, success: 40 },
    { date: 'Salı', activities: 52, success: 48 },
    { date: 'Çarşamba', activities: 38, success: 35 },
    { date: 'Perşembe', activities: 67, success: 62 },
    { date: 'Cuma', activities: 58, success: 54 },
    { date: 'Cumartesi', activities: 29, success: 27 },
    { date: 'Pazar', activities: 15, success: 14 }
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-[#3b82f6]" />
            {t('dashboard.activity.title')}
          </h1>
          <p className="text-muted-foreground mt-1">Tüm sistem aktivitelerini ve metrikleri takip edin</p>
        </div>
        <Button
          onClick={() => fetchActivities()}
          disabled={refreshing}
          className="bg-[#3b82f6] hover:bg-[#2563eb]"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-2 border-[#3b82f6]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Toplam Aktivite</CardTitle>
              <Activity className="h-4 w-4 text-[#3b82f6]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(summary.total_activities)}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.activity.last30Days')}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-[#10b981]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Başarı Oranı</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.success_rate}%</div>
              <Progress value={summary.success_rate} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card className="border-2 border-[#8b5cf6]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Son 24 Saat</CardTitle>
              <Clock className="h-4 w-4 text-[#8b5cf6]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(summary.last_24h_count)}</div>
              <p className="text-xs text-muted-foreground">
                Yeni aktivite
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-[#f59e0b]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En Aktif</CardTitle>
              <TrendingUp className="h-4 w-4 text-[#f59e0b]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{summary.most_active_type}</div>
              <p className="text-xs text-muted-foreground">
                İşlem tipi
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              {t('dashboard.activity.activityDistribution')}
            </CardTitle>
            <CardDescription>İşlem tiplerine göre dağılım</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t('dashboard.activity.weeklyActivity')}
            </CardTitle>
            <CardDescription>Son 7 günlük aktivite trendi</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyActivityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="activities" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="success" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* RAG Statistics */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-2 border-[#10b981]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Toplam Doküman</CardTitle>
              <FileText className="h-4 w-4 text-[#10b981]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(dashboardData.database?.documents || 0)}</div>
              <p className="text-xs text-muted-foreground">
                {dashboardData.database?.embeddings || 0} embeddings
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-[#8b5cf6]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">LightRAG Durum</CardTitle>
              <Brain className="h-4 w-4 text-[#8b5cf6]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData.lightrag?.initialized ? 'Aktif' : 'Pasif'}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardData.lightrag?.documentCount || 0} doküman
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-[#f59e0b]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">RAG Chunk'lar</CardTitle>
              <Hash className="h-4 w-4 text-[#f59e0b]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(dashboardData.rag?.totalChunks || 0)}</div>
              <p className="text-xs text-muted-foreground">
                Ort. {dashboardData.rag?.avgChunkSize || 0} karakter
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-[#ec4899]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Redis Cache</CardTitle>
              <Database className="h-4 w-4 text-[#ec4899]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData.redis?.connected ? 'Bağlı' : 'Çevrimdışı'}</div>
              <p className="text-xs text-muted-foreground">
                {dashboardData.redis?.used_memory || '0 MB'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t('dashboard.activity.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Arama</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="URL veya başlık ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Başlangıç Tarihi</label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Bitiş Tarihi</label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                {t('dashboard.activity.activityRecords')}
              </CardTitle>
              <CardDescription>Tüm işlemlerin detaylı logları</CardDescription>
            </div>
            <Tabs value={selectedType} onValueChange={setSelectedType}>
              <TabsList>
                <TabsTrigger value="all">Tümü</TabsTrigger>
                <TabsTrigger value="scrape">Scraping</TabsTrigger>
                <TabsTrigger value="embedding">Embeddings</TabsTrigger>
                <TabsTrigger value="delete">Silme</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aktivite bulunamadı</p>
              </div>
            ) : (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="border rounded-lg p-4 hover:bg-[#f8fafc] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getOperationIcon(activity.operation_type)}
                        <span className="font-medium capitalize">
                          {activity.operation_type}
                        </span>
                        {getStatusBadge(activity.status)}
                        <span className="text-sm text-muted-foreground">
                          {formatDate(activity.created_at)}
                        </span>
                      </div>

                      {activity.title && (
                        <p className="font-medium mb-1 text-lg">{activity.title}</p>
                      )}

                      {activity.source_url && (
                        <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {activity.source_url}
                        </p>
                      )}

                      {activity.error_message && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{activity.error_message}</AlertDescription>
                        </Alert>
                      )}

                      {activity.metrics && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 p-3 bg-muted/30 rounded-lg">
                          {activity.metrics.content_length && (
                            <div className="text-center">
                              <div className="text-sm text-muted-foreground">İçerik</div>
                              <div className="font-semibold">
                                {formatNumber(activity.metrics.content_length)} karakter
                              </div>
                            </div>
                          )}
                          {activity.metrics.chunk_count && (
                            <div className="text-center">
                              <div className="text-sm text-muted-foreground">Chunk'lar</div>
                              <div className="font-semibold">
                                {formatNumber(activity.metrics.chunk_count)}
                              </div>
                            </div>
                          )}
                          {activity.metrics.token_count && (
                            <div className="text-center">
                              <div className="text-sm text-muted-foreground">Token'lar</div>
                              <div className="font-semibold">
                                {formatNumber(activity.metrics.token_count)}
                              </div>
                            </div>
                          )}
                          {activity.metrics.extraction_time_ms && (
                            <div className="text-center">
                              <div className="text-sm text-muted-foreground">Süre</div>
                              <div className="font-semibold">
                                {activity.metrics.extraction_time_ms}ms
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Hızlı İşlemler</CardTitle>
          <CardDescription>Sık kullanılan aktivite işlemleri</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/dashboard/scraper">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 text-center">
                  <Globe className="h-8 w-8 mx-auto mb-2 text-[#3b82f6]" />
                  <p className="font-medium">Web Scraping</p>
                  <p className="text-sm text-muted-foreground">Yeni içerik çek</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard/embeddings-manager">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 text-center">
                  <Brain className="h-8 w-8 mx-auto mb-2 text-[#10b981]" />
                  <p className="font-medium">Embeddings</p>
                  <p className="text-sm text-muted-foreground">Vektör yönetimi</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 text-[#8b5cf6]" />
                  <p className="font-medium">Analytics</p>
                  <p className="text-sm text-muted-foreground">Detaylı raporlar</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}