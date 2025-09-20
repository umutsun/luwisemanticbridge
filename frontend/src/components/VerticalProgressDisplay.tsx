'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
  Zap,
  Database,
  Activity,
  TrendingUp,
  BarChart3
} from 'lucide-react';

interface EmbeddingProgress {
  status: string;
  current: number;
  total: number;
  percentage: number;
  currentTable: string | null;
  error: string | null;
  tokensUsed?: number;
  tokensThisSession?: number;
  estimatedTotalTokens?: number;
  estimatedCost?: number;
  startTime?: number;
  estimatedTimeRemaining?: number;
  newlyEmbedded?: number;
  errorCount?: number;
  processingSpeed?: number;
  fallbackMode?: boolean;
  fallbackReason?: string;
  mightBeStuck?: boolean;
}

interface VerticalProgressDisplayProps {
  progress: EmbeddingProgress | null;
  getCurrentTableInfo: () => any;
  migrationTables?: string[];
}

export default function VerticalProgressDisplay({
  progress,
  getCurrentTableInfo,
  migrationTables = []
}: VerticalProgressDisplayProps) {
  const [pulse, setPulse] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);

  useEffect(() => {
    if (progress.status === 'processing') {
      // Smooth progress animation only
      const progressInterval = setInterval(() => {
        setCurrentProgress(prev => {
          const target = progress.percentage || 0;
          const diff = target - prev;
          if (Math.abs(diff) < 0.05) return target;
          return prev + diff * 0.05; // Slower animation for smoother effect
        });
      }, 50);

      return () => {
        clearInterval(progressInterval);
      };
    }
  }, [progress.status, progress.percentage]);

  if (!progress || progress.status === 'idle' || progress.status === 'completed' || progress.status === 'error') {
    return null;
  }

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / 1000 / 60 / 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const seconds = Math.floor((ms / 1000) % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatTimeWithSeconds = (ms: number) => {
    const hours = Math.floor(ms / 1000 / 60 / 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const seconds = Math.floor((ms / 1000) % 60);

    if (hours > 0) {
      return `${hours}sa ${minutes}dk ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}dk ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const getElapsedTime = () => {
    if (!progress.startTime) return '-';
    const elapsed = Date.now() - progress.startTime;
    const hours = Math.floor(elapsed / 1000 / 60 / 60);
    const minutes = Math.floor((elapsed / 1000 / 60) % 60);
    const seconds = Math.floor((elapsed / 1000) % 60);

    if (hours > 0) {
      return `${hours}sa ${minutes}dk ${seconds}s`;
    }
    return `${minutes}dk ${seconds}s`;
  };

  return (
    <div className="space-y-3 w-full max-w-sm">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Durum</span>
        <div className="flex items-center gap-2">
          {progress.fallbackMode && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Fallback
            </Badge>
          )}
          <Badge variant={
            progress.status === 'processing' ? 'default' :
            progress.status === 'completed' ? 'default' :
            progress.status === 'paused' ? 'secondary' :
            'destructive'
          }>
            {progress.status === 'processing' && (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            )}
            {progress.status === 'processing' ? 'İşleniyor' :
             progress.status === 'completed' ? 'Tamamlandı' :
             progress.status === 'paused' ? 'Duraklatıldı' :
             progress.status === 'error' ? 'Hata' : 'Bekleniyor'}
          </Badge>
        </div>
      </div>

      {/* Stuck Process Warning */}
      {progress.mightBeStuck && (
        <Alert className="py-2 border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <Clock className="h-3 w-3" />
          <AlertDescription className="text-xs">
            İşlem yanıt vermiyor. Lütfen bekleyin veya işlemi duraklatıp tekrar başlatın.
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>{(progress.current || 0).toLocaleString('tr-TR')}</span>
          <span>{(progress.total || 0).toLocaleString('tr-TR')}</span>
        </div>
        <Progress
          value={currentProgress}
          className="h-2 transition-all duration-300"
        />
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-mono bg-primary/10 px-2 py-0.5 rounded text-primary">
            {(progress.percentage || 0).toFixed(1)}%
          </span>
          {progress.currentTable && (
            <span className="text-xs font-medium text-muted-foreground">
              {getCurrentTableInfo()?.displayName || progress.currentTable}
            </span>
          )}
        </div>
      </div>

      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold text-blue-600">
            {((progress.processingSpeed || 0) * 60).toFixed(1)}
          </div>
          <div className="text-muted-foreground">kayıt/dk</div>
        </div>
        <div className="bg-muted/50 rounded p-2 text-center">
          <div className="font-bold text-orange-600">
            {progress.estimatedTimeRemaining ?
              formatTimeWithSeconds(progress.estimatedTimeRemaining) : '--:--'
            }
          </div>
          <div className="text-muted-foreground">kalan süre</div>
        </div>
      </div>

      {/* Token Usage */}
      {(progress.tokensThisSession !== undefined || progress.estimatedTotalTokens !== undefined) && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Token Kullanımı
            </span>
            {progress.estimatedTotalTokens && (
              <span className="text-xs text-muted-foreground">
                Tahmini Toplam: {progress.estimatedTotalTokens.toLocaleString('tr-TR')}
              </span>
            )}
          </div>

          {progress.tokensThisSession !== undefined && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Bu Oturum:</span>
                <span className="font-mono font-bold text-blue-600">
                  {progress.tokensThisSession.toLocaleString('tr-TR')}
                </span>
              </div>
              {progress.estimatedTotalTokens && (
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (progress.tokensThisSession / progress.estimatedTotalTokens) * 100)}%`
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {progress.tokensUsed !== undefined && progress.tokensUsed > 0 && (
            <div className="flex justify-between text-xs pt-1 border-t border-muted-foreground/20">
              <span className="text-muted-foreground">Toplam (tüm oturumlar):</span>
              <span className="font-mono">
                {progress.tokensUsed.toLocaleString('tr-TR')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Time Info */}
      <div className="text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Başlangıç:</span>
          <span>
            {progress.startTime ?
              new Date(progress.startTime).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit'
              }) : '-'
            }
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Geçen süre:</span>
          <span>{getElapsedTime()}</span>
        </div>
      </div>

      {/* Activity Indicators */}
      {progress.newlyEmbedded !== undefined && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle className="w-3 h-3" />
            <span>+{progress.newlyEmbedded}</span>
          </div>
          {progress.errorCount > 0 && (
            <div className="flex items-center gap-1 text-orange-600">
              <AlertCircle className="w-3 h-3" />
              <span>{progress.errorCount} hata</span>
            </div>
          )}
        </div>
      )}

      {/* Fallback Warning */}
      {progress.fallbackMode && (
        <Alert className="py-2">
          <AlertTriangle className="h-3 w-3" />
          <AlertDescription className="text-xs">
            {progress.fallbackReason || 'API hatası'} nedeniyle basit embedding kullanılıyor.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}