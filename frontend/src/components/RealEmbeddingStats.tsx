'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, Zap, TrendingUp } from 'lucide-react';

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

export default function RealEmbeddingStats() {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/embeddings/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching embedding status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const formatNumber = (num: number) => {
    return num.toLocaleString('tr-TR');
  };

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Gerçek Embedding Durumu
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
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
              rag_chatbot veritabanında
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
              unified_embeddings'te
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

      {/* Table Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Tablo Detayları</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              Son güncelleme: {lastUpdated.toLocaleString('tr-TR')}
            </p>
          )}
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