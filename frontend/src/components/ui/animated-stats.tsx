import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedStatsProps {
  value: number;
  label: string;
  suffix?: string;
  duration?: number;
  className?: string;
  color?: 'green' | 'blue' | 'purple' | 'orange';
}

export function AnimatedStats({
  value,
  label,
  suffix = '',
  duration = 2000,
  className,
  color = 'blue'
}: AnimatedStatsProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const colorClasses = {
    green: 'text-green-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600'
  };

  useEffect(() => {
    setIsVisible(true);
    const startTime = Date.now();
    const endTime = startTime + duration;

    const updateValue = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.floor(easeOutQuart * value));

      if (progress < 1) {
        requestAnimationFrame(updateValue);
      }
    };

    requestAnimationFrame(updateValue);
  }, [value, duration]);

  return (
    <div className={cn('text-center', className)}>
      <div className={cn(
        'text-3xl font-bold mb-1 transition-all duration-500',
        colorClasses[color],
        isVisible && 'scale-100 opacity-100',
        !isVisible && 'scale-95 opacity-0'
      )}>
        {displayValue.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
        {label}
      </div>
    </div>
  );
}

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function CircularProgress({
  value,
  size = 120,
  strokeWidth = 8,
  className
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-blue-600 transition-all duration-1000 ease-out"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          {Math.round(value)}%
        </span>
      </div>
    </div>
  );
}