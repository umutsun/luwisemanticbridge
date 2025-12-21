'use client';

import { useAnimatedCounter } from '@/hooks/use-animated-counter';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  formatLocale?: boolean;
}

/**
 * AnimatedNumber Component
 *
 * Displays a number that animates smoothly when its value changes.
 * Uses requestAnimationFrame for 60fps animations.
 *
 * @example
 * ```tsx
 * <AnimatedNumber value={1234} formatLocale />
 * ```
 */
export function AnimatedNumber({
  value,
  duration = 500,
  className = '',
  formatLocale = true,
}: AnimatedNumberProps) {
  const animatedValue = useAnimatedCounter(value, duration);

  return (
    <span className={`tabular-nums ${className}`}>
      {formatLocale ? animatedValue.toLocaleString() : animatedValue}
    </span>
  );
}

export default AnimatedNumber;
