'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  sublabel?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'auto';
  thresholds?: { warning: number; danger: number };
  showValue?: boolean;
  animate?: boolean;
}

export function CircularProgress({
  value,
  size = 100,
  strokeWidth = 8,
  className,
  label,
  sublabel,
  color = 'auto',
  thresholds = { warning: 60, danger: 80 },
  showValue = true,
  animate = true,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  // Auto color based on thresholds
  const getColor = () => {
    if (color !== 'auto') {
      const colorMap = {
        blue: { stroke: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', text: 'text-blue-500' },
        green: { stroke: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', text: 'text-green-500' },
        yellow: { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', text: 'text-yellow-500' },
        red: { stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', text: 'text-red-500' },
        purple: { stroke: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', text: 'text-purple-500' },
      };
      return colorMap[color];
    }

    if (value >= thresholds.danger) {
      return { stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', text: 'text-red-500' };
    }
    if (value >= thresholds.warning) {
      return { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', text: 'text-yellow-500' };
    }
    return { stroke: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', text: 'text-green-500' };
  };

  const colors = getColor();

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-100 dark:text-gray-800"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={animate ? 'transition-all duration-500 ease-out' : ''}
          style={{
            filter: `drop-shadow(0 0 6px ${colors.stroke}40)`,
          }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showValue && (
          <span className={cn('font-bold tabular-nums', colors.text, size >= 100 ? 'text-xl' : 'text-lg')}>
            {Math.round(value)}%
          </span>
        )}
        {label && (
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-0.5">
            {label}
          </span>
        )}
      </div>

      {/* Sublabel below */}
      {sublabel && (
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          {sublabel}
        </span>
      )}
    </div>
  );
}

// Compact version for smaller spaces
interface MiniCircularProgressProps {
  value: number;
  size?: number;
  color?: string;
  className?: string;
}

export function MiniCircularProgress({
  value,
  size = 36,
  color = '#3b82f6',
  className,
}: MiniCircularProgressProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-100 dark:text-gray-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-300 ease-out"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums">
        {Math.round(value)}
      </span>
    </div>
  );
}

export default CircularProgress;
