'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface TaoProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal' | 'zen' | 'vibrant' | 'sunset';
}

export const TaoProgressBar: React.FC<TaoProgressBarProps> = ({
  value,
  max = 100,
  className,
  showLabel = false,
  showPercentage = true,
  size = 'md',
  variant = 'zen'
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  const variantClasses = {
    default: 'bg-gray-100 dark:bg-gray-800',
    minimal: 'bg-transparent border border-gray-200 dark:border-gray-700',
    zen: 'bg-gray-50 dark:bg-gray-900/50',
    vibrant: 'bg-slate-200/50 dark:bg-white/5',
    sunset: 'bg-orange-100/50 dark:bg-orange-900/10'
  };

  const fillVariantClasses = {
    default: 'bg-gradient-to-r from-blue-500 to-blue-600',
    minimal: 'bg-gray-900 dark:bg-gray-100',
    zen: 'bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 dark:from-gray-300 dark:via-gray-200 dark:to-gray-300',
    vibrant: 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500',
    sunset: 'bg-gradient-to-r from-orange-400 via-rose-500 to-purple-600'
  };

  return (
    <div className={cn('w-full space-y-2', className)}>
      {showLabel && (
        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">Progress</span>
          <span className="text-xs">
            {value.toLocaleString()} / {max.toLocaleString()}
          </span>
        </div>
      )}

      <div className={cn(
        'relative overflow-hidden rounded-full transition-all duration-500 ease-out',
        sizeClasses[size],
        variantClasses[variant]
      )}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden',
            fillVariantClasses[variant],
            (variant === 'vibrant' || variant === 'sunset') && 'shadow-sm'
          )}
          style={{ width: `${percentage}%` }}
        >
          {/* Animated shimmer effect for special variants */}
          {(variant === 'zen' || variant === 'vibrant' || variant === 'sunset') && percentage > 0 && (
            <div className="absolute inset-0 -skew-x-12">
              <div className="shimmer w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            </div>
          )}
        </div>

        {/* Minimal percentage indicator */}
        {showPercentage && variant === 'zen' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-900/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
              {Math.round(percentage)}%
            </span>
          </div>
        )}
      </div>

      {/* Optional status text */}
      {showPercentage && variant !== 'zen' && (
        <div className="text-right">
          <span className="text-xs text-gray-500 dark:text-gray-500">
            {Math.round(percentage)}% complete
          </span>
        </div>
      )}
    </div>
  );
};

export default TaoProgressBar;