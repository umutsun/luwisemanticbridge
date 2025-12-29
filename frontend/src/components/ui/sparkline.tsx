'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  showDots?: boolean;
  animate?: boolean;
  min?: number;
  max?: number;
}

export function Sparkline({
  data,
  width = 100,
  height = 30,
  className,
  strokeColor = 'currentColor',
  fillColor,
  strokeWidth = 1.5,
  showDots = false,
  animate = true,
  min: propMin,
  max: propMax
}: SparklineProps) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return '';

    const min = propMin ?? Math.min(...data);
    const max = propMax ?? Math.max(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return { x, y };
    });

    // Create smooth curve using bezier
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;

      d += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
    }

    // Connect to last point
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;

    return d;
  }, [data, width, height, propMin, propMax]);

  const fillPath = useMemo(() => {
    if (!fillColor || !data || data.length < 2) return '';

    const min = propMin ?? Math.min(...data);
    const max = propMax ?? Math.max(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return { x, y };
    });

    let d = `M 0 ${height} L ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;

      d += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
    }

    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y} L ${width} ${height} Z`;

    return d;
  }, [data, width, height, fillColor, propMin, propMax]);

  const lastPoint = useMemo(() => {
    if (!data || data.length < 2) return null;

    const min = propMin ?? Math.min(...data);
    const max = propMax ?? Math.max(...data);
    const range = max - min || 1;

    const lastIndex = data.length - 1;
    const x = width;
    const y = height - ((data[lastIndex] - min) / range) * (height - 4) - 2;

    return { x, y, value: data[lastIndex] };
  }, [data, width, height, propMin, propMax]);

  if (!data || data.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        className={cn('sparkline', className)}
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
          strokeDasharray="2,2"
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      className={cn('sparkline overflow-visible', className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Gradient fill */}
      {fillColor && (
        <>
          <defs>
            <linearGradient id={`sparkline-gradient-${strokeColor}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={fillColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={fillPath}
            fill={`url(#sparkline-gradient-${strokeColor})`}
            className={animate ? 'animate-fadeIn' : ''}
          />
        </>
      )}

      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? 'animate-draw' : ''}
        style={{
          strokeDasharray: animate ? 1000 : undefined,
          strokeDashoffset: animate ? 1000 : undefined,
          animation: animate ? 'draw 1s ease-out forwards' : undefined
        }}
      />

      {/* Current value dot */}
      {showDots && lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={3}
          fill={strokeColor}
          className={animate ? 'animate-pulse' : ''}
        />
      )}

      <style jsx>{`
        @keyframes draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-draw {
          animation: draw 1s ease-out forwards;
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </svg>
  );
}

// Mini animated value display
interface AnimatedValueProps {
  value: number;
  suffix?: string;
  className?: string;
  decimals?: number;
}

export function AnimatedValue({ value, suffix = '', className, decimals = 0 }: AnimatedValueProps) {
  return (
    <span
      className={cn(
        'tabular-nums font-semibold transition-all duration-300',
        className
      )}
    >
      {value.toFixed(decimals)}{suffix}
    </span>
  );
}

export default Sparkline;
