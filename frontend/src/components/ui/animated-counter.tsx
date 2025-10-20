'use client';

import { useEffect, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
}

export function AnimatedCounter({
  value,
  duration = 1000,
  suffix = '',
  prefix = '',
  decimals = 0,
  className = ''
}: AnimatedCounterProps) {
  const [currentValue, setCurrentValue] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setCurrentValue(0);
      return;
    }

    const startTime = Date.now();
    const startValue = currentValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic function for smooth animation
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const newValue = startValue + (value - startValue) * easeOut;

      setCurrentValue(newValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCurrentValue(value);
      }
    };

    animate();
  }, [value, duration, currentValue]);

  return (
    <span className={className}>
      {prefix}
      {currentValue.toFixed(decimals)}
      {suffix}
    </span>
  );
}

interface AnimatedPercentageProps {
  value: number;
  duration?: number;
  className?: string;
}

export function AnimatedPercentage({
  value,
  duration = 1000,
  className = ''
}: AnimatedPercentageProps) {
  const [currentValue, setCurrentValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = currentValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic function
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const newValue = startValue + (value - startValue) * easeOut;

      setCurrentValue(newValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCurrentValue(value);
      }
    };

    animate();
  }, [value, duration, currentValue]);

  return (
    <span className={className}>
      {currentValue.toFixed(1)}%
    </span>
  );
}