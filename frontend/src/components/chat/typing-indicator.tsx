'use client';

export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-in slide-in-from-bottom-2 fade-in-50 duration-300">
      <div className="flex-1 max-w-[85%] space-y-2.5">
        {/* Modern gradient skeleton bars - no text */}
        <div
          className="h-4 rounded-full bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 opacity-70 animate-pulse"
          style={{ width: '92%' }}
        />
        <div
          className="h-4 rounded-full bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 opacity-55 animate-pulse"
          style={{ width: '78%', animationDelay: '150ms' }}
        />
        <div
          className="h-4 rounded-full bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 opacity-40 animate-pulse"
          style={{ width: '65%', animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
}