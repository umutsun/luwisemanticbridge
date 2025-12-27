'use client';

interface MessageSkeletonProps {
  type?: 'searching' | 'generating' | 'default';
  message?: string;
}

export function MessageSkeleton({ type = 'default', message }: MessageSkeletonProps) {
  // Gradient colors based on type
  const getGradientClass = () => {
    switch (type) {
      case 'searching':
        return 'from-blue-400 via-cyan-400 to-teal-400';
      case 'generating':
        return 'from-purple-400 via-pink-400 to-rose-400';
      default:
        return 'from-indigo-400 via-purple-400 to-pink-400';
    }
  };

  const gradientClass = getGradientClass();

  return (
    <div className="flex gap-3 p-4 animate-in fade-in-0 duration-300">
      <div className="flex-1 space-y-3">
        {/* Colorful animated skeleton lines - no text */}
        <div className="space-y-2.5">
          <div
            className={`h-4 rounded-full bg-gradient-to-r ${gradientClass} opacity-60 animate-pulse`}
            style={{ width: '90%' }}
          />
          <div
            className={`h-4 rounded-full bg-gradient-to-r ${gradientClass} opacity-50 animate-pulse`}
            style={{ width: '75%', animationDelay: '150ms' }}
          />
          <div
            className={`h-4 rounded-full bg-gradient-to-r ${gradientClass} opacity-40 animate-pulse`}
            style={{ width: '60%', animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}
