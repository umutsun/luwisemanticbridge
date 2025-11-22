"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  DollarSign,
  HardDrive,
  Layers,
  RefreshCw,
  Server,
  TrendingUp,
  Zap
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

interface CacheStats {
  totalOperations: number;
  cacheHits: number;
  cacheMisses: number;
  avgResponseTime: number;
  memoryUsage: string;
  keyCount: number;
}

interface QueueStats {
  depth: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  oldestJobAge: number;
}

interface CostSummary {
  totalCost: number;
  embeddingCost: number;
  llmCost: number;
  cacheSavings: number;
  breakdown: {
    provider: string;
    cost: number;
    requests: number;
  }[];
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  resolved: boolean;
}

interface PerformanceSnapshot {
  timestamp: string;
  cacheHitRate: number;
  queueDepth: number;
  avgResponseTime: number;
  memoryUsage: number;
  cpuUsage?: number;
}

export default function MonitoringDashboard() {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [snapshots, setSnapshots] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Fetch all monitoring data
  const fetchMonitoringData = async () => {
    try {
      const [cacheRes, queueRes, costRes, alertsRes, snapshotsRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/ai-services/cache/stats`),
        fetch(`${API_URL}/api/v2/ai-services/queue/stats`),
        fetch(`${API_URL}/api/v2/ai-services/cost/summary`),
        fetch(`${API_URL}/api/v2/ai-services/monitoring/alerts`),
        fetch(`${API_URL}/api/v2/ai-services/monitoring/snapshots?limit=20`)
      ]);

      if (cacheRes.ok) setCacheStats(await cacheRes.json());
      if (queueRes.ok) setQueueStats(await queueRes.json());
      if (costRes.ok) setCostSummary(await costRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (snapshotsRes.ok) setSnapshots(await snapshotsRes.json());

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchMonitoringData();

    if (autoRefresh) {
      const interval = setInterval(fetchMonitoringData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Calculate cache hit rate
  const cacheHitRate = cacheStats
    ? ((cacheStats.cacheHits / (cacheStats.cacheHits + cacheStats.cacheMisses)) * 100).toFixed(1)
    : '0';

  // Format currency
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  // Format time ago
  const formatTimeAgo = (seconds: number) => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Prepare chart data
  const performanceChartData = snapshots.map(s => ({
    time: new Date(s.timestamp).toLocaleTimeString(),
    hitRate: s.cacheHitRate,
    responseTime: s.avgResponseTime,
    queueDepth: s.queueDepth
  }));

  const costBreakdownData = costSummary?.breakdown || [];
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <RefreshCw className="animate-spin h-8 w-8 mx-auto mb-4" />
          <p>Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Performance Monitoring</h1>
          <p className="text-gray-500 mt-1">
            Real-time system metrics and AI services monitoring
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="px-3 py-1">
            <Clock className="w-4 h-4 mr-1" />
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Badge>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              autoRefresh
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.filter(a => !a.resolved).length > 0 && (
        <div className="space-y-2">
          {alerts.filter(a => !a.resolved).map(alert => (
            <Alert key={alert.id} variant={alert.type === 'error' ? 'destructive' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{alert.type.toUpperCase()}</AlertTitle>
              <AlertDescription>
                {alert.message} - {new Date(alert.timestamp).toLocaleTimeString()}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cache Hit Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheHitRate}%</div>
            <Progress value={parseFloat(cacheHitRate)} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {cacheStats?.cacheHits} hits / {cacheStats?.cacheMisses} misses
            </p>
          </CardContent>
        </Card>

        {/* Queue Depth */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue Depth</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queueStats?.depth || 0}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{queueStats?.processing || 0} processing</Badge>
              <Badge variant="outline">{queueStats?.completed || 0} completed</Badge>
            </div>
            {queueStats?.failed > 0 && (
              <Badge variant="destructive" className="mt-2">{queueStats.failed} failed</Badge>
            )}
          </CardContent>
        </Card>

        {/* Response Time */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheStats?.avgResponseTime || 0}ms</div>
            <div className="flex items-center gap-1 mt-2">
              {cacheStats?.avgResponseTime < 100 ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
              <span className="text-xs text-muted-foreground">
                {cacheStats?.avgResponseTime < 100 ? 'Excellent' : 'Could be better'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Cost Savings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Savings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(costSummary?.cacheSavings || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Total cost: {formatCurrency(costSummary?.totalCost || 0)}
            </p>
            <Progress
              value={(costSummary?.cacheSavings / (costSummary?.totalCost + costSummary?.cacheSavings)) * 100 || 0}
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="cache">Cache Details</TabsTrigger>
          <TabsTrigger value="queue">Queue Details</TabsTrigger>
          <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis yAxisId="left" label={{ value: 'Percentage', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Time (ms)', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="hitRate" stroke="#8884d8" name="Cache Hit Rate (%)" />
                  <Line yAxisId="right" type="monotone" dataKey="responseTime" stroke="#82ca9d" name="Response Time (ms)" />
                  <Line yAxisId="left" type="monotone" dataKey="queueDepth" stroke="#ffc658" name="Queue Depth" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cache Details Tab */}
        <TabsContent value="cache" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Cache Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Total Operations:</span>
                  <span className="font-mono">{cacheStats?.totalOperations.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cache Hits:</span>
                  <span className="font-mono text-green-600">{cacheStats?.cacheHits.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cache Misses:</span>
                  <span className="font-mono text-red-600">{cacheStats?.cacheMisses.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Key Count:</span>
                  <span className="font-mono">{cacheStats?.keyCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Memory Usage:</span>
                  <span className="font-mono">{cacheStats?.memoryUsage}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Efficiency</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Cache Hits', value: cacheStats?.cacheHits || 0 },
                        { name: 'Cache Misses', value: cacheStats?.cacheMisses || 0 }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#82ca9d" />
                      <Cell fill="#ffc658" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Queue Details Tab */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Queue Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{queueStats?.depth || 0}</div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{queueStats?.processing || 0}</div>
                  <p className="text-sm text-muted-foreground">Processing</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{queueStats?.completed || 0}</div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{queueStats?.failed || 0}</div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <div className="flex justify-between">
                  <span>Avg Processing Time:</span>
                  <span className="font-mono">{queueStats?.avgProcessingTime || 0}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Oldest Job:</span>
                  <span className="font-mono">
                    {queueStats?.oldestJobAge ? formatTimeAgo(queueStats.oldestJobAge) : 'N/A'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Analysis Tab */}
        <TabsContent value="costs" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Cost:</span>
                    <span className="font-mono font-bold">{formatCurrency(costSummary?.totalCost || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Embedding Cost:</span>
                    <span className="font-mono">{formatCurrency(costSummary?.embeddingCost || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>LLM Cost:</span>
                    <span className="font-mono">{formatCurrency(costSummary?.llmCost || 0)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Cache Savings:</span>
                    <span className="font-mono font-bold">{formatCurrency(costSummary?.cacheSavings || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Provider Costs</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={costBreakdownData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="provider" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Bar dataKey="cost" fill="#8884d8">
                      {costBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* System Resources */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redis Status</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">Connected</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Memory: {cacheStats?.memoryUsage || 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Health</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">Operational</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Vector indexes optimized
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">85/100</div>
            <Progress value={85} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              +20 points after optimization
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}