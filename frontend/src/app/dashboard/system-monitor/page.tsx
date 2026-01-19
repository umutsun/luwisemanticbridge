'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  FunnelChart,
  Funnel
} from 'recharts';
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  WifiOff,
  Server,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Thermometer,
  Database,
  Globe,
  Shield,
  TrendingUp,
  TrendingDown,
  Timer,
  BarChart3,
  PieChart as PieChartIcon,
  Download,
  Upload,
  AlertCircle,
  Info,
  Terminal
} from 'lucide-react';
import LogConsole from '@/components/LogConsole';

interface SystemMetrics {
  timestamp: string;
  cpu: number;
  memory: number;
  disk: number;
  network: {
    upload: number;
    download: number;
  };
  processes: number;
  loadAvg: number;
  temperature?: number;
}

interface PerformanceData {
  responseTime: number;
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
  activeConnections: number;
  queueLength: number;
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'warning';
  cpu: number;
  memory: number;
  uptime: string;
  requests: number;
}

export default function SystemMonitor() {
  const { t } = useTranslation();

  const [metrics, setMetrics] = useState<SystemMetrics[]>([]);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');

  useEffect(() => {
    fetchSystemData();
    const interval = setInterval(fetchSystemData, 5000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchSystemData = async () => {
    try {
      // Fetch real health data from backend
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Health endpoint failed');
      }

      const healthData = await response.json();

      // Convert health data to metrics format
      const newMetric: SystemMetrics = {
        timestamp: healthData.timestamp,
        cpu: 0, // Not available from health endpoint yet
        memory: healthData.performance?.memory?.heapUsed || 0,
        disk: 0, // Not available from health endpoint yet
        network: {
          upload: 0,
          download: 0
        },
        processes: healthData.performance?.databasePool?.total || 0,
        loadAvg: 0,
        temperature: 0
      };

      // Keep last 60 metrics
      setMetrics(prev => [...prev.slice(-59), newMetric]);

      setPerformance({
        responseTime: healthData.responseTime || 0,
        throughput: 0,
        errorRate: 0,
        cacheHitRate: 0,
        activeConnections: healthData.performance?.databasePool?.total || 0,
        queueLength: healthData.performance?.databasePool?.waiting || 0
      });

      // Build services array from health data
      const servicesArray: ServiceStatus[] = [];

      // PostgreSQL
      if (healthData.services?.postgres) {
        const pg = healthData.services.postgres;
        servicesArray.push({
          name: `PostgreSQL (${pg.database || 'unknown'})`,
          status: pg.status === 'connected' ? 'running' : 'stopped',
          cpu: 0,
          memory: 0,
          uptime: formatUptime(healthData.performance?.uptime || 0),
          requests: 0
        });
      }

      // Redis
      if (healthData.services?.redis) {
        const rd = healthData.services.redis;
        servicesArray.push({
          name: `Redis (db${rd.db || 0} - ${rd.keys || 0} keys)`,
          status: rd.status === 'connected' ? 'running' : 'stopped',
          cpu: 0,
          memory: 0,
          uptime: formatUptime(healthData.performance?.uptime || 0),
          requests: 0
        });
      }

      // Node.js API
      servicesArray.push({
        name: 'Node.js Backend',
        status: healthData.status === 'healthy' ? 'running' : 'error',
        cpu: 0,
        memory: healthData.performance?.memory?.heapUsed || 0,
        uptime: formatUptime(healthData.performance?.uptime || 0),
        requests: 0
      });

      setServices(servicesArray);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching system data:', err);
      setError(t('dashboard.system.error'));
      setLoading(false);
    }
  };

  // Helper function to format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getHealthStatus = () => {
    if (!metrics.length) return 'unknown';
    const latest = metrics[metrics.length - 1];
    if (latest.cpu > 90 || latest.memory > 90 || latest.disk > 90) return 'critical';
    if (latest.cpu > 70 || latest.memory > 70 || latest.disk > 70) return 'warning';
    return 'healthy';
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('systemMonitor.title')}</h1>
          <p className="text-muted-foreground">{t('systemMonitor.description')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getHealthColor(getHealthStatus())}`} />
            <span className="text-sm font-medium">
              {getHealthStatus() === 'healthy' ? t('systemMonitor.systemStatus.healthy') :
                getHealthStatus() === 'warning' ? t('systemMonitor.systemStatus.warning') :
                  getHealthStatus() === 'critical' ? t('systemMonitor.systemStatus.critical') : t('systemMonitor.systemStatus.unknown')}
            </span>
          </div>
          <Tabs value={timeRange} onValueChange={(value) => setTimeRange(value as '1h' | '6h' | '24h' | '7d')}>
            <TabsList>
              <TabsTrigger value="1h">1S</TabsTrigger>
              <TabsTrigger value="6h">6S</TabsTrigger>
              <TabsTrigger value="24h">24S</TabsTrigger>
              <TabsTrigger value="7d">7G</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">{t('systemMonitor.title')}</TabsTrigger>
          <TabsTrigger value="performance">{t('systemMonitor.title')}</TabsTrigger>
          <TabsTrigger value="services">{t('systemMonitor.services.title')}</TabsTrigger>
          <TabsTrigger value="network">{t('systemMonitor.resources.network.title')}</TabsTrigger>
          <TabsTrigger value="logs">{t('systemMonitor.logs.title')}</TabsTrigger>
          <TabsTrigger value="alerts">{t('systemMonitor.alerts.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* System Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('systemMonitor.resources.cpu.title')}</p>
                    <p className="text-2xl font-bold">{metrics[metrics.length - 1]?.cpu.toFixed(1)}%</p>
                  </div>
                  <Cpu className="h-8 w-8 text-blue-500" />
                </div>
                <Progress value={metrics[metrics.length - 1]?.cpu} className="mt-4" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('systemMonitor.resources.memory.title')}</p>
                    <p className="text-2xl font-bold">{metrics[metrics.length - 1]?.memory.toFixed(1)}%</p>
                  </div>
                  <MemoryStick className="h-8 w-8 text-green-500" />
                </div>
                <Progress value={metrics[metrics.length - 1]?.memory} className="mt-4" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('systemMonitor.resources.disk.title')}</p>
                    <p className="text-2xl font-bold">{metrics[metrics.length - 1]?.disk.toFixed(1)}%</p>
                  </div>
                  <HardDrive className="h-8 w-8 text-orange-500" />
                </div>
                <Progress value={metrics[metrics.length - 1]?.disk} className="mt-4" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('systemMonitor.resources.network.connections')}</p>
                    <p className="text-2xl font-bold">{performance?.activeConnections}</p>
                  </div>
                  <Wifi className="h-8 w-8 text-purple-500" />
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  <span className="text-green-600">↑ {metrics[metrics.length - 1]?.network.upload.toFixed(0)} KB/s</span>
                  <span className="mx-2">|</span>
                  <span className="text-blue-600">↓ {metrics[metrics.length - 1]?.network.download.toFixed(0)} KB/s</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resource Usage Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('systemMonitor.resources.title')} (1{t('systemMonitor.seconds')})</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={metrics.slice(-60)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleTimeString('tr-TR')}
                    />
                    <Area type="monotone" dataKey="cpu" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="memory" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="disk" stackId="3" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('systemMonitor.processes.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={metrics.slice(-60)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="processes" fill="#8b5cf6" fillOpacity={0.5} />
                    <Line yAxisId="right" type="monotone" dataKey="loadAvg" stroke="#ef4444" strokeWidth={2} />
                    <ReferenceLine yAxisId="right" y={2} stroke="#ef4444" strokeDasharray="3 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  {t('systemMonitor.charts.responseTime')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{performance?.responseTime.toFixed(0)}ms</div>
                <Progress value={performance?.responseTime / 3} className="mt-4" />
                <p className="text-sm text-muted-foreground mt-2">
                  Hedef: &lt;200ms
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {t('systemMonitor.charts.requestRate')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{performance?.throughput.toFixed(0)}/s</div>
                <div className="flex items-center gap-2 mt-4">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-500">+12% {t('systemMonitor.lastUpdated')}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  {t('systemMonitor.charts.cacheHitRate')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{performance?.cacheHitRate.toFixed(1)}%</div>
                <Progress value={performance?.cacheHitRate} className="mt-4" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('systemMonitor.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={[
                  { subject: t('systemMonitor.charts.responseTime'), A: performance?.responseTime / 5, fullMark: 100 },
                  { subject: t('systemMonitor.charts.requestRate'), A: performance?.throughput / 10, fullMark: 100 },
                  { subject: t('systemMonitor.charts.cacheHitRate'), A: performance?.cacheHitRate, fullMark: 100 },
                  { subject: t('systemMonitor.charts.errorRate'), A: 100 - (performance?.errorRate * 20), fullMark: 100 },
                  { subject: t('systemMonitor.charts.responseTime'), A: 99.9, fullMark: 100 }
                ]}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar name="Current" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {services.map((service, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${service.status === 'running' ? 'bg-green-500' :
                        service.status === 'warning' ? 'bg-yellow-500' :
                          service.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                        }`} />
                      <div>
                        <h3 className="font-semibold">{service.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Uptime: {service.uptime} • Requests: {service.requests}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">CPU</p>
                        <p className="font-semibold">{service.cpu}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Memory</p>
                        <p className="font-semibold">{service.memory}%</p>
                      </div>
                      <Badge
                        variant={
                          service.status === 'running' ? 'default' :
                            service.status === 'warning' ? 'secondary' :
                              service.status === 'error' ? 'error' : 'outline'
                        }
                      >
                        {service.status === 'running' ? 'Çalışıyor' :
                          service.status === 'warning' ? 'Uyarı' :
                            service.status === 'error' ? 'Hata' : 'Bilinmiyor'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('systemMonitor.resources.network.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={metrics.slice(-60)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="network.upload" stackId="1" stroke="#3b82f6" fill="#3b82f6" />
                    <Area type="monotone" dataKey="network.download" stackId="2" stroke="#10b981" fill="#10b981" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('systemMonitor.resources.network.connections')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <FunnelChart>
                    <Tooltip />
                    <Funnel
                      dataKey="value"
                      data={[
                        { name: t('common.total'), value: 4567 },
                        { name: t('common.success'), value: 4234 },
                        { name: t('common.cache'), value: 3456 },
                        { name: t('systemMonitor.services.status.running'), value: 2345 }
                      ]}
                    />
                  </FunnelChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <LogConsole />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {t('systemMonitor.alerts.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('systemMonitor.alerts.severities.high')}
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      {t('systemMonitor.alerts.title')}
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('systemMonitor.alerts.severities.low')}
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}