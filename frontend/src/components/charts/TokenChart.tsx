'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TokenData {
  used: number;
  remaining: number;
  limit: number;
}

interface TokenChartProps {
  data: TokenData;
  title?: string;
}

export function TokenChart({ data, title = 'Token Usage' }: TokenChartProps) {
  const percentage = data.limit > 0 ? (data.used / data.limit) * 100 : 0;
  const remainingPercentage = 100 - percentage;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Donut Chart */}
          <div className="relative w-32 h-32 mx-auto">
            <svg className="transform -rotate-90 w-32 h-32">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                className="text-gray-200"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - percentage / 100)}`}
                className={`transition-all duration-500 ${
                  percentage > 80 ? 'text-red-500' : percentage > 60 ? 'text-yellow-500' : 'text-green-500'
                }`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold">{percentage.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Used</div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Used:</span>
              <span className="font-medium">{data.used.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining:</span>
              <span className="font-medium">{data.remaining.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Limit:</span>
              <span className="font-medium">{data.limit.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}