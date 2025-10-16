'use client';

import React, { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ChartDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

interface OptimizedChartProps {
  title: string;
  data: ChartDataPoint[];
  height?: number;
  color?: string;
  isLoading?: boolean;
  icon?: React.ReactNode;
  valueFormatter?: (value: number) => string;
}

// Memoized chart component to prevent unnecessary re-renders
export const OptimizedChart = memo<OptimizedChartProps>(({
  title,
  data,
  height = 200,
  color = 'hsl(var(--primary))',
  isLoading = false,
  icon,
  valueFormatter = (value) => value.toString()
}) => {
  // Memoize processed data to prevent recalculations
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Process data only when it actually changes
    return data.map(point => ({
      ...point,
      formattedValue: valueFormatter(point.value)
    }));
  }, [data, valueFormatter]);

  // Memoize chart statistics
  const stats = useMemo(() => {
    if (!processedData.length) return { max: 0, min: 0, avg: 0, latest: 0 };

    const values = processedData.map(d => d.value);
    return {
      max: Math.max(...values),
      min: Math.min(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      latest: values[values.length - 1] || 0
    };
  }, [processedData]);

  // Memoize SVG path for smooth line chart
  const chartPath = useMemo(() => {
    if (processedData.length < 2) return '';

    const width = 100;
    const height = 100;
    const padding = 5;

    // Scale values to fit chart
    const maxValue = stats.max || 1;
    const points = processedData.map((point, index) => {
      const x = (index / (processedData.length - 1)) * (width - 2 * padding) + padding;
      const y = height - ((point.value / maxValue) * (height - 2 * padding)) - padding;
      return `${x},${y}`;
    });

    // Create SVG path
    return `M ${points.join(' L ')}`;
  }, [processedData, stats.max]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-1/3" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-4">
          {valueFormatter(stats.latest)}
        </div>
        <div className="relative" style={{ height: `${height}px` }}>
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path
                  d="M 10 0 L 0 0 0 10"
                  fill="none"
                  stroke="hsl(var(--border))"
                  strokeWidth="0.5"
                  opacity="0.5"
                />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />

            {/* Chart line */}
            {chartPath && (
              <path
                d={chartPath}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Area fill under the line */}
            {chartPath && (
              <path
                d={`${chartPath} L 95,95 L 5,95 Z`}
                fill={color}
                opacity="0.1"
              />
            )}

            {/* Data points */}
            {processedData.map((_, index) => {
              const x = (index / (processedData.length - 1)) * 90 + 5;
              const y = 95 - ((processedData[index].value / stats.max) * 90);
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="1.5"
                  fill={color}
                  className="animate-pulse"
                />
              );
            })}
          </svg>

          {/* Hover tooltip placeholder */}
          <div className="absolute top-2 right-2 text-xs text-muted-foreground">
            Max: {valueFormatter(stats.max)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

OptimizedChart.displayName = 'OptimizedChart';

// Memoized real-time chart component
export const RealTimeChart = memo<OptimizedChartProps>((props) => {
  return <OptimizedChart {...props} />;
});

RealTimeChart.displayName = 'RealTimeChart';

// Memoized token usage chart
export const TokenChart = memo<OptimizedChartProps>((props) => {
  return (
    <OptimizedChart
      {...props}
      color="hsl(var(--chart-2))"
      height={250}
    />
  );
});

TokenChart.displayName = 'TokenChart';