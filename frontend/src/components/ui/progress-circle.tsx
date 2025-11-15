import React from 'react';

interface ProgressCircleProps {
  /**
   * Progress percentage (0-100)
   */
  progress: number;

  /**
   * Whether to show animated pulse rings
   * Default: false
   */
  showPulse?: boolean;

  /**
   * Size of the circle in pixels
   * Default: 180
   */
  size?: number;

  /**
   * Status text to display below the percentage
   * Optional
   */
  statusText?: string;

  /**
   * Additional className for the container
   */
  className?: string;
}

/**
 * ProgressCircle Component
 *
 * A reusable circular progress indicator with optional pulse animation.
 * Features:
 * - SVG-based circular progress with smooth transitions
 * - Dual pulse ring animation for active states
 * - Customizable size and styling
 * - Optional status text display
 *
 * @example
 * ```tsx
 * <ProgressCircle
 *   progress={75}
 *   showPulse={true}
 *   statusText="Processing..."
 * />
 * ```
 */
export function ProgressCircle({
  progress,
  showPulse = false,
  size = 180,
  statusText,
  className = '',
}: ProgressCircleProps) {
  // Calculate SVG dimensions
  const radius = (size / 2) * 0.833; // 75/90 ratio from original
  const center = size / 2;
  const strokeWidth = size * 0.0556; // 10/180 ratio from original
  const circumference = 2 * Math.PI * radius;
  const safeProgress = progress || 0;
  const strokeDashoffset = circumference * (1 - safeProgress / 100);

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: `${size}px`, height: `${size}px` }}>
      {/* Animated pulse rings when active */}
      {showPulse && (
        <>
          <div
            className="absolute inset-0 rounded-full bg-primary/10 animate-ping"
            style={{ animationDuration: '2s' }}
          />
          <div
            className="absolute rounded-full bg-primary/5 animate-pulse"
            style={{
              animationDuration: '1.5s',
              inset: `${size * 0.0111}px` // 2/180 ratio from original
            }}
          />
        </>
      )}

      {/* SVG Circle */}
      <svg
        className="w-full h-full transform -rotate-90 relative z-10"
        width={size}
        height={size}
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-300 dark:text-white/20"
        />
        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="text-slate-600 dark:text-sky-300/70 transition-all duration-700 ease-in-out"
          strokeLinecap="round"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center flex-col px-4 z-20">
        <div
          className="font-bold tabular-nums transition-all duration-500 ease-out"
          style={{ fontSize: `${size * 0.222}px` }} // 40/180 ratio from original
        >
          % {progress}
        </div>
        {statusText && (
          <div
            className="text-muted-foreground text-center mt-1"
            style={{ fontSize: `${size * 0.0667}px` }} // 12/180 ratio from original
          >
            {statusText}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProgressCircle;
