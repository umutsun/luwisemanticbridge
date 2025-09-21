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
  BarChart3,
  Cpu,
  Timer
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

// Circular Progress Component
const CircularProgress = ({ percentage, size = 120, strokeWidth = 2, className = "" }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`relative ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-800"
        />
        {/* Progress circle with gradient */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-light tracking-tight">
          {percentage.toFixed(1)}
        </span>
      </div>
    </div>
  );
};

// Mini Sparkline for token usage
const MiniSparkline = ({ values, width = 60, height = 20 }) => {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - (value / max) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="text-purple-500 opacity-60"
      />
    </svg>
  );
};

export default function VerticalProgressDisplay({
  progress,
  getCurrentTableInfo,
  migrationTables = []
}: VerticalProgressDisplayProps) {
  const [pulse, setPulse] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [animatedCurrent, setAnimatedCurrent] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(0);
  const [tokenHistory, setTokenHistory] = useState<number[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

  useEffect(() => {
    if (progress.status === 'processing') {
      // Smooth progress animation only
      const progressInterval = setInterval(() => {
        setCurrentProgress(prev => {
          // Calculate percentage from current/total instead of using progress.percentage
          const target = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
          const diff = target - prev;
          if (Math.abs(diff) < 0.05) return target;
          return prev + diff * 0.05; // Slower animation for smoother effect
        });
      }, 50);

      // Animate current counter
      const counterInterval = setInterval(() => {
        setAnimatedCurrent(prev => {
          const target = progress.current || 0;
          const diff = target - prev;
          if (Math.abs(diff) < 1) return target;

          // Add some randomness for monitoring feel
          const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
          const increment = diff * 0.1 * randomFactor;

          return prev + increment;
        });
      }, 100);

      // Smooth speed animation
      const speedInterval = setInterval(() => {
        setDisplaySpeed(prev => {
          const target = progress.processingSpeed || 0;
          const diff = target - prev;
          if (Math.abs(diff) < 0.5) return target;
          return prev + diff * 0.1;
        });
      }, 200);

      return () => {
        clearInterval(progressInterval);
        clearInterval(counterInterval);
        clearInterval(speedInterval);
      };
    }
  }, [progress.status, progress.percentage, progress.current, progress.processingSpeed]);

  // Track token history for sparkline
  useEffect(() => {
    if (progress.tokensThisSession !== undefined) {
      setTokenHistory(prev => {
        const newHistory = [...prev, progress.tokensThisSession];
        return newHistory.slice(-20); // Keep last 20 values
      });
    }
  }, [progress.tokensThisSession]);

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
    <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${
            progress.status === 'processing' ? 'bg-green-500 animate-pulse' :
            progress.status === 'paused' ? 'bg-yellow-500' :
            progress.status === 'error' ? 'bg-red-500 animate-pulse' :
            'bg-gray-400'
          }`} />
          {progress.currentTable && (
            <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
              {getCurrentTableInfo()?.displayName || progress.currentTable}
            </span>
          )}
        </div>
        {progress.fallbackMode && (
          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
            Fallback
          </span>
        )}
      </div>

      {/* Circular Progress Center */}
      <div className="flex justify-center mb-8">
        <CircularProgress percentage={currentProgress} size={140} strokeWidth={2} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-lg font-light text-blue-600">
            {Math.round(animatedCurrent).toLocaleString('tr-TR')}
          </div>
          <div className="text-xs text-gray-500">processed</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-light text-orange-600">
            {displaySpeed.toFixed(1)}
          </div>
          <div className="text-xs text-gray-500">kayıt/dk</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-light text-purple-600">
            {progress.workerCount || 1}
          </div>
          <div className="text-xs text-gray-500">workers</div>
        </div>
      </div>

      {/* Token Usage with Sparkline */}
      {progress.tokensThisSession !== undefined && progress.tokensThisSession > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Tokens</span>
              <MiniSparkline values={tokenHistory} />
            </div>
            <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
              {progress.tokensThisSession.toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="relative">
            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min(100, (progress.tokensThisSession / 2000000) * 25)}%`
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Timer className="w-3 h-3" />
            {progress.estimatedTimeRemaining ?
              formatTimeWithSeconds(progress.estimatedTimeRemaining) : '--:--'
            }
          </div>
          <div>
            {progress.startTime &&
              new Date(progress.startTime).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          </div>
        </div>
      </div>

      {/* Warning if stuck */}
      {progress.mightBeStuck && (
        <div className="mt-4 text-xs text-amber-600 dark:text-amber-400 text-center">
          <Clock className="w-3 h-3 inline mr-1" />
          Process might be stuck
        </div>
      )}
    </div>
  );
}