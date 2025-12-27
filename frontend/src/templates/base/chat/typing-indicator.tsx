'use client';

interface TypingIndicatorProps {
  status?: 'thinking' | 'reading-document' | 'searching' | 'generating';
}

export function TypingIndicator({ status = 'thinking' }: TypingIndicatorProps) {
  // Get gradient colors based on status
  const getGradientClass = () => {
    switch (status) {
      case 'reading-document':
        return 'from-emerald-400 via-teal-400 to-cyan-400';
      case 'searching':
        return 'from-blue-400 via-cyan-400 to-teal-400';
      case 'generating':
        return 'from-purple-400 via-pink-400 to-rose-400';
      default:
        return 'from-violet-400 via-purple-400 to-fuchsia-400';
    }
  };

  const gradientClass = getGradientClass();

  return (
    <div className="flex justify-start animate-in slide-in-from-bottom-2 fade-in-50 duration-300">
      <div className="flex-1 max-w-[85%] space-y-2.5">
        {/* Modern gradient skeleton bars */}
        <div
          className={`h-4 rounded-full bg-gradient-to-r ${gradientClass} opacity-70 animate-pulse`}
          style={{ width: '92%' }}
        />
        <div
          className={`h-4 rounded-full bg-gradient-to-r ${gradientClass} opacity-55 animate-pulse`}
          style={{ width: '78%', animationDelay: '150ms' }}
        />
        <div
          className={`h-4 rounded-full bg-gradient-to-r ${gradientClass} opacity-40 animate-pulse`}
          style={{ width: '65%', animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
}