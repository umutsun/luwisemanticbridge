'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Search, Brain } from 'lucide-react';

interface MessageSkeletonProps {
  type?: 'searching' | 'generating' | 'default';
  message?: string;
}

export function MessageSkeleton({ type = 'default', message }: MessageSkeletonProps) {
  return (
    <div className="flex gap-3 p-4 animate-in fade-in-0 duration-200 max-w-full overflow-hidden">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
        {type === 'searching' ? (
          <Search className="w-4 h-4 text-white animate-pulse" />
        ) : type === 'generating' ? (
          <Brain className="w-4 h-4 text-white animate-pulse" />
        ) : (
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {/* Status message */}
        {message && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            {type === 'searching' && <Search className="w-4 h-4" />}
            {type === 'generating' && <Brain className="w-4 h-4" />}
            <span>{message}</span>
          </div>
        )}

        {/* Response skeleton lines */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse max-w-full" style={{ width: '85%' }} />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse max-w-full" style={{ width: '95%' }} />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse max-w-full" style={{ width: '75%' }} />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse max-w-full" style={{ width: '90%' }} />
        </div>

        {/* Sources skeleton */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse w-20" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse truncate" style={{ width: '80%' }} />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse truncate" style={{ width: '95%' }} />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse w-full" />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse w-8" />
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}