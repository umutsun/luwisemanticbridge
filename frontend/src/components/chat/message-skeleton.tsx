'use client';

interface MessageSkeletonProps {
  type?: 'searching' | 'generating' | 'default';
}

export function MessageSkeleton({ type = 'default' }: MessageSkeletonProps) {
  return (
    <div className="flex gap-3 p-4 animate-in fade-in-0 duration-300">
      <div className="flex-1 space-y-3">
        {/* Simple animated lines */}
        <div className="space-y-2.5">
          <div
            className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
            style={{ width: '85%' }}
          />
          <div
            className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
            style={{ width: '70%', animationDelay: '150ms' }}
          />
          <div
            className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
            style={{ width: '60%', animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}
