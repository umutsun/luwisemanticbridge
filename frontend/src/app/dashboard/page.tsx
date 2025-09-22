'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Brain,
  Database,
  MessageSquare,
  Upload,
  Search,
  RefreshCw,
  Activity,
  FileText,
  Globe,
  Server,
  CheckCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  Settings,
  Plus,
  Zap,
  FileDown,
  Users,
  Clock
} from 'lucide-react';
import Link from 'next/link';

interface ServiceStatus {
  lightrag: boolean;
  embedder: boolean;
  fastapi: boolean;
  streamlit: boolean;
}

interface DashboardData {
  database: {
    documents: number;
    conversations: number;
    messages: number;
    size: string;
    status: string;
  };
  redis: {
    connected: boolean;
    used_memory: string;
    total_commands_processed: number;
    status: string;
  };
  lightrag: {
    initialized: boolean;
    documentCount: number;
    vectorStoreSize: number;
    lastUpdate: string;
    provider: string;
    status: string;
  };
  services?: ServiceStatus;
  recentActivity?: Array<{
    id: string;
    type: string;
    action: string;
    target: string;
    status: string;
    message: string;
    timestamp: string;
  }>;
  error?: string;
  status?: string;
  message?: string;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const response = await fetch(getApiUrl('dashboard'));
      if (response.ok) {
        const jsonData = await response.json();
        setData(jsonData);
        setLastUpdated(new Date());
      } else {
        // Fallback data when backend is not available
        setData({
          database: {
            documents: 0,
            conversations: 0,
            messages: 0,
            size: '0 MB',
            status: 'disconnected'
          },
          redis: {
            connected: false,
            used_memory: '0 B',
            total_commands_processed: 0,
            status: 'disconnected'
          },
          lightrag: {
            initialized: false,
            documentCount: 0,
            vectorStoreSize: 0,
            lastUpdate: new Date().toISOString(),
            provider: 'offline',
            status: 'stopped'
          },
          services: {
            lightrag: false,
            embedder: false,
            fastapi: true,
            streamlit: false
          },
          recentActivity: [{
            id: '1',
            type: 'system',
            action: 'check',
            target: 'services',
            status: 'warning',
            message: 'Backend services not running',
            timestamp: new Date().toISOString()
          }],
          error: 'Backend service is unavailable',
          status: 'warning',
          message: 'Running in offline mode'
        });
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const StatusCard = ({ title, value, icon: Icon, status, description }: {
    title: string;
    value: string | number;
    icon: any;
    status?: 'online' | 'offline' | 'warning';
    description?: string;
  }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Icon className="h-8 w-8 text-muted-foreground" />
            {status && (
              <div className={`w-2 h-2 rounded-full ${
                status === 'online' ? 'bg-green-500' :
                status === 'warning' ? 'bg-yellow-500' :
                'bg-red-500'
              }`} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ServiceCard = ({ name, status, icon: Icon, onAction }: {
    name: string;
    status: boolean;
    icon: any;
    onAction?: () => void;
  }) => (
    <Card className={status ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5" />
            <div>
              <h3 className="font-medium">{name}</h3>
              <Badge variant={status ? 'default' : 'secondary'} className="mt-1">
                {status ? 'Running' : 'Stopped'}
              </Badge>
            </div>
          </div>
          {onAction && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAction}
            >
              {status ? 'Stop' : 'Start'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Link href="/dashboard/settings">
            <Button>
              <Settings className="h-4 w-4 mr-2" />
              Ayarlar
            </Button>
          </Link>
        </div>
      </div>

      {/* Alert if backend is not available */}
      {data?.error && (
        <Alert>
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            {data.message || 'Backend servislerine ulaşılamıyor. Bazı özellikler çalışmayabilir.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          title="Dokümanlar"
          value={data?.database.documents || 0}
          icon={FileText}
          status={data?.database.status === 'connected' ? 'online' : 'offline'}
          description="Veritabanındaki toplam doküman"
        />
        <StatusCard
          title="Konuşmalar"
          value={data?.database.conversations || 0}
          icon={MessageSquare}
          description="Toplam konuşma sayısı"
        />
        <StatusCard
          title="Vektörler"
          value={data?.lightrag.vectorStoreSize || 0}
          icon={Brain}
          status={data?.lightrag.status === 'initialized' ? 'online' : 'offline'}
          description="Embedding vektörleri"
        />
        <StatusCard
          title="Cache"
          value={data?.redis.connected ? 'Aktif' : 'Pasif'}
          icon={Zap}
          status={data?.redis.connected ? 'online' : 'offline'}
          description={data?.redis.used_memory}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Services Status */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Servis Durumu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.services && (
                <>
                  <ServiceCard
                    name="LightRAG"
                    status={data.services.lightrag}
                    icon={Brain}
                  />
                  <ServiceCard
                    name="Embedder"
                    status={data.services.embedder}
                    icon={Upload}
                  />
                  <ServiceCard
                    name="FastAPI"
                    status={data.services.fastapi}
                    icon={Zap}
                  />
                  <ServiceCard
                    name="Streamlit"
                    status={data.services.streamlit}
                    icon={Globe}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hızlı İşlemler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/dashboard/embeddings-manager">
                <Button className="w-full justify-start" variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Doküman Yükle
                </Button>
              </Link>
              <Link href="/chat">
                <Button className="w-full justify-start" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Sohbet Başlat
                </Button>
              </Link>
              <Link href="/dashboard/settings">
                <Button className="w-full justify-start" variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Ayarları Yapılandır
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Son Aktiviteler</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.recentActivity && data.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {data.recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        activity.status === 'success' ? 'bg-green-500' :
                        activity.status === 'warning' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`} />
                      <div>
                        <p className="font-medium">{activity.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleTimeString('tr-TR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Henüz aktivite yok</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>Sistem Bilgisi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-medium">Veritabanı Durumu</p>
              <Badge variant={data?.database.status === 'connected' ? 'default' : 'secondary'}>
                {data?.database.status === 'connected' ? 'Bağlı' : 'Bağlı Değil'}
              </Badge>
            </div>
            <div>
              <p className="font-medium">LightRAG Durumu</p>
              <Badge variant={data?.lightrag.initialized ? 'default' : 'secondary'}>
                {data?.lightrag.initialized ? 'Hazır' : 'Hazır Değil'}
              </Badge>
            </div>
            <div>
              <p className="font-medium">Redis Durumu</p>
              <Badge variant={data?.redis.connected ? 'default' : 'secondary'}>
                {data?.redis.connected ? 'Bağlı' : 'Bağlı Değil'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}