'use client';

import { useAnimatedPercentage } from '@/hooks/use-animated-counter';

interface AnimatedProgressProps {
  value: number;
  className?: string;
  barClassName?: string;
  showGlow?: boolean;
  glowColor?: string;
}

/**
 * AnimatedProgress Component
 *
 * A progress bar that animates smoothly when value changes.
 * Uses requestAnimationFrame for 60fps animations.
 */
export function AnimatedProgress({
  value,
  className = '',
  barClassName = 'bg-blue-500',
  showGlow = true,
  glowColor = 'rgba(59, 130, 246, 0.4)',
}: AnimatedProgressProps) {
  const animatedValue = useAnimatedPercentage(value, 700);

  return (
    <div className={`w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-colors duration-300 ${barClassName}`}
        style={{
          width: `${animatedValue}%`,
          transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: showGlow ? `0 0 8px ${glowColor}` : 'none',
        }}
      />
    </div>
  );
}

/**
 * AnimatedResourceBar Component
 *
 * Complete resource bar with label, animated percentage, and color-coded progress.
 */
interface AnimatedResourceBarProps {
  label: string;
  value: number;
  thresholds?: {
    warning: number;
    danger: number;
  };
  colors?: {
    normal: { text: string; bar: string; glow: string };
    warning: { text: string; bar: string; glow: string };
    danger: { text: string; bar: string; glow: string };
  };
}

const defaultColors = {
  normal: {
    text: 'text-blue-600 dark:text-blue-400',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
  warning: {
    text: 'text-yellow-600 dark:text-yellow-400',
    bar: 'bg-yellow-500',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
  danger: {
    text: 'text-red-600 dark:text-red-400',
    bar: 'bg-red-500',
    glow: 'rgba(239, 68, 68, 0.4)',
  },
};

export function AnimatedResourceBar({
  label,
  value,
  thresholds = { warning: 60, danger: 80 },
  colors = defaultColors,
}: AnimatedResourceBarProps) {
  const animatedValue = useAnimatedPercentage(value, 700);

  const getColorSet = () => {
    if (animatedValue > thresholds.danger) return colors.danger;
    if (animatedValue > thresholds.warning) return colors.warning;
    return colors.normal;
  };

  const colorSet = getColorSet();

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className={`font-medium tabular-nums ${colorSet.text}`}>
          {Math.round(animatedValue)}%
        </span>
      </div>
      <AnimatedProgress
        value={value}
        barClassName={colorSet.bar}
        glowColor={colorSet.glow}
      />
    </div>
  );
}

export default AnimatedProgress;
