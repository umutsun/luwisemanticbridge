import { useState, useEffect, useRef } from 'react';

/**
 * useAnimatedCounter Hook
 *
 * Smoothly animates a number from its previous value to a new value.
 * Uses requestAnimationFrame for smooth 60fps animations.
 *
 * @param targetValue - The target number to animate to
 * @param duration - Animation duration in milliseconds (default: 500)
 * @returns The current animated value
 */
export function useAnimatedCounter(targetValue: number, duration: number = 500): number {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const previousValue = useRef(targetValue);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // If target hasn't changed, do nothing
    if (previousValue.current === targetValue) {
      return;
    }

    const startValue = previousValue.current;
    const diff = targetValue - startValue;

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Easing function: ease-out cubic
    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const currentValue = Math.round(startValue + diff * easedProgress);
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        setDisplayValue(targetValue);
        previousValue.current = targetValue;
        startTimeRef.current = null;
      }
    };

    startTimeRef.current = null;
    animationRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration]);

  // Update previous value when target changes
  useEffect(() => {
    return () => {
      previousValue.current = displayValue;
    };
  }, [displayValue]);

  return displayValue;
}

/**
 * useAnimatedPercentage Hook
 *
 * Special version for percentages that clamps between 0-100.
 *
 * @param targetValue - The target percentage (0-100)
 * @param duration - Animation duration in milliseconds (default: 700)
 * @returns The current animated percentage
 */
export function useAnimatedPercentage(targetValue: number, duration: number = 700): number {
  const clampedTarget = Math.min(100, Math.max(0, targetValue));
  return useAnimatedCounter(clampedTarget, duration);
}

export default useAnimatedCounter;
