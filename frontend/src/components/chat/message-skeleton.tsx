'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface MessageSkeletonProps {
  type?: 'searching' | 'generating' | 'default';
  message?: string; // Keeping for backward compatibility but not using
}

export function MessageSkeleton({ type = 'default', message }: MessageSkeletonProps) {
  return (
    <div className="flex gap-3 p-4 animate-in fade-in-0 duration-200 max-w-full overflow-hidden">
      <div className="flex-1 min-w-0 space-y-3">
        {/* Status message removed - only skeleton animation */}

        {/* Response skeleton lines - WIDER with better contrast */}
        <div className="space-y-2">
          <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse max-w-full" style={{ width: '92%' }} />
          <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse w-full" />
          <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse max-w-full" style={{ width: '88%' }} />
          <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse max-w-full" style={{ width: '96%' }} />
        </div>

        {/* Sources skeleton */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse w-20" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="w-6 h-6 bg-slate-300 dark:bg-slate-600 rounded-full flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="h-3.5 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse truncate" style={{ width: '85%' }} />
                <div className="h-3 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse w-full" />
                <div className="h-3 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse truncate" style={{ width: '90%' }} />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-pulse w-8" />
                <div className="h-5 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}