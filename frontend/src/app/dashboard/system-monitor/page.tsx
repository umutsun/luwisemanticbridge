'use client';

import React, { useState, useEffect } from 'react';
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
  Info
} from 'lucide-react';

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
      // Mock data for demonstration
      const newMetrics = Array.from({ length: 60 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        disk: Math.random() * 100,
        network: {
          upload: Math.random() * 1000,
          download: Math.random() * 5000
        },
        processes: Math.floor(Math.random() * 200) + 50,
        loadAvg: Math.random() * 4,
        temperature: Math.random() * 20 + 40
      })).reverse();

      setMetrics(newMetrics);

      setPerformance({
        responseTime: Math.random() * 200 + 50,
        throughput: Math.random() * 1000 + 200,
        errorRate: Math.random() * 5,
        cacheHitRate: Math.random() * 20 + 80,
        activeConnections: Math.floor(Math.random() * 100) + 20,
        queueLength: Math.floor(Math.random() * 50)
      });

      setServices([
        { name: 'PostgreSQL', status: 'running', cpu: 15, memory: 30, uptime: '15d 4h', requests: 1234 },
        { name: 'Redis', status: 'running', cpu: 5, memory: 10, uptime: '15d 4h', requests: 5678 },
        { name: 'Node.js API', status: 'running', cpu: 25, memory: 45, uptime: '2d 12h', requests: 8901 },
        { name: 'LightRAG', status: 'running', cpu: 35, memory: 60, uptime: '1d 8h', requests: 2345 },
        { name: 'OpenAI API', status: 'running', cpu: 0, memory: 0, uptime: '15d 4h', requests: 4567 }
      ]);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching system data:', err);
      setError('Sistem verileri yüklenemedi');
      setLoading(false);
    }
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
          <h1 className="text-3xl font-bold">Sistem Monitörü</h1>
          <p className="text-muted-foreground">Gerçek zamanlı sistem performansı ve metrikler</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getHealthColor(getHealthStatus())}`} />
            <span className="text-sm font-medium">
              {getHealthStatus() === 'healthy' ? 'Sağlıklı' :
               getHealthStatus() === 'warning' ? 'Uyarı' :
               getHealthStatus() === 'critical' ? 'Kritik' : 'Bilinmiyor'}
            </span>
          </div>
          <Tabs value={timeRange} onValueChange={(value) => setTimeRange(value as any)}>
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="performance">Performans</TabsTrigger>
          <TabsTrigger value="services">Servisler</TabsTrigger>
          <TabsTrigger value="network">Ağ</TabsTrigger>
          <TabsTrigger value="alerts">Uyarılar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* System Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">CPU Kullanımı</p>
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
                    <p className="text-sm font-medium text-muted-foreground">Memory</p>
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
                    <p className="text-sm font-medium text-muted-foreground">Disk Kullanımı</p>
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
                    <p className="text-sm font-medium text-muted-foreground">Aktif Bağlantılar</p>
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
                <CardTitle>Kaynak Kullanımı (Son 1 Saat)</CardTitle>
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
                <CardTitle>Load Average & İşlem Sayısı</CardTitle>
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
                  Yanıt Süresi
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
                  Throughput
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{performance?.throughput.toFixed(0)}/s</div>
                <div className="flex items-center gap-2 mt-4">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-500">+12% önceki saate göre</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Cache Hit Rate
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
              <CardTitle>Performans Metrikleri</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={[
                  { subject: 'Response Time', A: performance?.responseTime / 5, fullMark: 100 },
                  { subject: 'Throughput', A: performance?.throughput / 10, fullMark: 100 },
                  { subject: 'Cache Hit', A: performance?.cacheHitRate, fullMark: 100 },
                  { subject: 'Error Rate', A: 100 - (performance?.errorRate * 20), fullMark: 100 },
                  { subject: 'Availability', A: 99.9, fullMark: 100 }
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
                      <div className={`w-3 h-3 rounded-full ${
                        service.status === 'running' ? 'bg-green-500' :
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
                          service.status === 'error' ? 'destructive' : 'outline'
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
                <CardTitle>Ağ Trafiği</CardTitle>
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
                <CardTitle>Bağlantı Dağılımı</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <FunnelChart>
                    <Tooltip />
                    <Funnel
                      dataKey="value"
                      data={[
                        { name: 'Total Requests', value: 4567 },
                        { name: 'Successful', value: 4234 },
                        { name: 'Cached', value: 3456 },
                        { name: 'Active', value: 2345 }
                      ]}
                    />
                  </FunnelChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Aktif Uyarılar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      CPU kullanımı %85'in üzerine çıktı. Performans etkilenebilir.
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Redis cache hit rate düştü. Optimizasyon önerilir.
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Sistem backup başarıyla tamamlandı.
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