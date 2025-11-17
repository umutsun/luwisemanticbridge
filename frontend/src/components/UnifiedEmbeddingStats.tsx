'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, Zap, TrendingUp, BarChart3 } from 'lucide-react';
import { useConfig } from '@/contexts/ConfigContext';

interface TableStatus {
  name: string;
  displayName: string;
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  percentage: number;
}

interface OverallStats {
  totalRecords: number;
  totalEmbedded: number;
  totalRemaining: number;
  percentage: number;
}

interface EmbeddingStatus {
  timestamp: string;
  overall: OverallStats;
  tables: TableStatus[];
}

interface ModelUsage {
  model: string;
  count: number;
  total_tokens: number;
}

interface EmbeddingStats {
  totalEmbeddings: number;
  bySource: Array<{
    source_table: string;
    count: number;
    tokens_used: number;
    avg_tokens: number;
  }>;
  modelUsage: ModelUsage[];
  costEstimate: number;
}

export default function UnifiedEmbeddingStats({ showControls = true }: { showControls?: boolean }) {
  const { config } = useConfig();
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statusRes, statsRes] = await Promise.all([
        fetch('/api/embeddings/status'),
        fetch('/api/embeddings/stats')
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching embedding data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatNumber = (num: number) => {
    return num.toLocaleString('tr-TR');
  };

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Embedding İstatistikleri
            {showControls && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Yükleniyor...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Kayıt</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(status.overall.totalRecords)}</div>
            <p className="text-xs text-muted-foreground">
              {config?.database?.name || 'vergilex_db'} veritabanında
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Embed Edilmiş</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(status.overall.totalEmbedded)}</div>
            <p className="text-xs text-muted-foreground">
              unified_embeddings&apos;te
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kalan</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(status.overall.totalRemaining)}</div>
            <p className="text-xs text-muted-foreground">
              embed edilecek
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tamamlanma</CardTitle>
            <Badge variant={status.overall.percentage === 100 ? 'default' : 'secondary'}>
              {status.overall.percentage}%
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status.overall.percentage}%</div>
            <Progress value={status.overall.percentage} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Detaylı İstatistikler
              {showControls && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchData}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </CardTitle>
            {lastUpdated && (
              <p className="text-sm text-muted-foreground">
                Son güncelleme: {lastUpdated.toLocaleString('tr-TR')}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* By Source */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Tablo Bazında</h4>
                <div className="space-y-2">
                  {status.tables.map((table) => (
                    <div key={table.name} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{table.displayName}</span>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {table.embeddedRecords.toLocaleString('tr-TR')}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {table.percentage}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model Usage */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Model Kullanımı</h4>
                <div className="space-y-2">
                  {stats.modelUsage.map((model) => (
                    <div key={model.model}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground text-xs">{model.model}</span>
                        <span className="text-xs">{model.count.toLocaleString('tr-TR')} kayıt</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Token</span>
                        <span className="font-medium">{(model.total_tokens / 1000000).toFixed(2)}M</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Maliyet</span>
                        <span className="font-medium">${(model.total_tokens * 0.0001 / 1000).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost Estimate */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Maliyet Analizi</h4>
                <div className="space-y-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">${stats.costEstimate.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Tahmini Toplam Maliyet</div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Toplam Embedding:</span>
                      <span>{formatNumber(stats.totalEmbeddings)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ortalama Token/Embedding:</span>
                      <span>{Math.round(stats.modelUsage[0]?.total_tokens / stats.modelUsage[0]?.count || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Tablo Detayları</span>
            {showControls && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {status.tables.map((table) => (
              <Card key={table.name} className="border-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    {table.displayName}
                    <Badge
                      variant={table.percentage === 100 ? 'default' :
                             table.percentage > 0 ? 'secondary' : 'outline'}
                    >
                      {table.percentage}%
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={table.percentage} className="h-2" />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Toplam:</span>
                      <span className="font-medium">{formatNumber(table.totalRecords)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Embed:</span>
                      <span className="font-medium text-green-600">
                        {formatNumber(table.embeddedRecords)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kalan:</span>
                      <span className="font-medium text-orange-600">
                        {formatNumber(table.pendingRecords)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}