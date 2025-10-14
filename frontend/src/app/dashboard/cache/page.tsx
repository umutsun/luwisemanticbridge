'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, 
  RefreshCw, 
  Trash2,
  Key,
  Activity,
  HardDrive,
  Zap,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3
} from 'lucide-react';

interface CacheStats {
  connected: boolean;
  memory: {
    used: number;
    peak: number;
    total: number;
  };
  keys: {
    total: number;
    expired: number;
  };
  hits: number;
  misses: number;
  commands: number;
  uptime: number;
}

interface CacheKey {
  key: string;
  type: string;
  ttl: number;
  size: number;
}

export default function RedisCachePage() {
  const [stats, setStats] = useState<CacheStats>({
    connected: true,
    memory: { used: 0, peak: 0, total: 0 },
    keys: { total: 0, expired: 0 },
    hits: 0,
    misses: 0,
    commands: 0,
    uptime: 0
  });
  const [keys, setKeys] = useState<CacheKey[]>([]);
  const [searchPattern, setSearchPattern] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchKeys();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/cache/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch cache stats:', error);
    }
  };

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/v2/cache/keys');
      const data = await response.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Failed to fetch keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFlushCache = async () => {
    if (!confirm('Tüm cache temizlenecek. Emin misiniz?')) return;

    try {
      await fetch('http://localhost:3001/api/v2/cache/flush', { method: 'POST' });
      await fetchStats();
      await fetchKeys();
    } catch (error) {
      console.error('Failed to flush cache:', error);
    }
  };

  const handleDeleteKey = async (key: string) => {
    try {
      await fetch('http://localhost:3003/api/v2/cache/keys/' + encodeURIComponent(key), { 
        method: 'DELETE' 
      });
      await fetchKeys();
    } catch (error) {
      console.error('Failed to delete key:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return days + 'd ' + hours + 'h';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
  };

  const hitRate = stats.hits + stats.misses > 0 
    ? (stats.hits / (stats.hits + stats.misses)) * 100 
    : 0;

  const filteredKeys = keys.filter(k => 
    k.key.toLowerCase().includes(searchPattern.toLowerCase())
  );

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Redis Cache</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cache yönetimi ve performans metrikleri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={stats.connected ? "default" : "destructive"} className="gap-2">
            {stats.connected ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Bağlı
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                Bağlı Değil
              </>
            )}
          </Badge>
          <Button onClick={handleFlushCache} variant="destructive" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Cache Temizle
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bellek Kullanımı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(stats.memory.used)}
            </div>
            <Progress 
              value={(stats.memory.used / stats.memory.total) * 100} 
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Key
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.keys.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.keys.expired} expired
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Hit Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hitRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.hits} hits / {stats.misses} misses
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatUptime(stats.uptime)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.commands} komut
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performans Metrikleri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Hit/Miss Oranı</p>
              <div className="flex items-center gap-2">
                <Progress value={hitRate} className="flex-1" />
                <span className="text-sm font-medium">{hitRate.toFixed(0)}%</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Bellek Kullanımı</p>
              <div className="flex items-center gap-2">
                <Progress 
                  value={(stats.memory.used / stats.memory.total) * 100} 
                  className="flex-1" 
                />
                <span className="text-sm font-medium">
                  {((stats.memory.used / stats.memory.total) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Key Doluluk</p>
              <div className="flex items-center gap-2">
                <Progress 
                  value={Math.min((stats.keys.total / 10000) * 100, 100)} 
                  className="flex-1" 
                />
                <span className="text-sm font-medium">
                  {stats.keys.total}/10k
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cache Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Cache Keys</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Key ara..."
                  value={searchPattern}
                  onChange={(e) => setSearchPattern(e.target.value)}
                  className="pl-8 w-[200px]"
                />
              </div>
              <Button onClick={fetchKeys} variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList>
              <TabsTrigger value="all">Tümü ({keys.length})</TabsTrigger>
              <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
              <TabsTrigger value="search">Search Results</TabsTrigger>
              <TabsTrigger value="scraper">Scraper Cache</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
              <div className="space-y-2">
                {filteredKeys.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Cache boş
                  </div>
                ) : (
                  filteredKeys.map((cacheKey) => (
                    <div 
                      key={cacheKey.key} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-mono text-sm">{cacheKey.key}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {cacheKey.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatBytes(cacheKey.size)}
                            </span>
                            {cacheKey.ttl > 0 && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {Math.round(cacheKey.ttl / 60)}m
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteKey(cacheKey.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="embeddings">
              <div className="text-center py-8 text-muted-foreground">
                Embedding cache keys görüntüleniyor...
              </div>
            </TabsContent>
            
            <TabsContent value="search">
              <div className="text-center py-8 text-muted-foreground">
                Search result cache keys görüntüleniyor...
              </div>
            </TabsContent>
            
            <TabsContent value="scraper">
              <div className="text-center py-8 text-muted-foreground">
                Scraper cache keys görüntüleniyor...
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}