'use client';

import { Search, Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MessageSkeletonProps {
  type?: 'searching' | 'generating' | 'default';
  message?: string;
}

export function MessageSkeleton({ type = 'default', message }: MessageSkeletonProps) {
  const { t } = useTranslation();

  // Phase-aware status display (texts from i18n)
  const getPhaseInfo = () => {
    switch (type) {
      case 'searching':
        return {
          icon: <Search className="w-4 h-4 animate-pulse" />,
          text: t('chat.skeleton.searching', 'Searching sources...'),
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20'
        };
      case 'generating':
        return {
          icon: <Sparkles className="w-4 h-4 animate-pulse" />,
          text: t('chat.skeleton.generating', 'Generating response...'),
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'bg-purple-50 dark:bg-purple-900/20'
        };
      default:
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: t('chat.skeleton.processing', 'Processing...'),
          color: 'text-slate-600 dark:text-slate-400',
          bgColor: 'bg-slate-50 dark:bg-slate-800/50'
        };
    }
  };

  const phase = getPhaseInfo();

  return (
    <div className="flex gap-2 sm:gap-3 p-2 sm:p-4 animate-in fade-in-0 duration-200 max-w-full overflow-hidden">
      <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
        {/* Phase-aware status indicator */}
        <div className={`inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full ${phase.bgColor} ${phase.color}`}>
          {phase.icon}
          <span className="text-xs sm:text-sm font-medium">{message || phase.text}</span>
        </div>

        {/* Response skeleton lines - different for each phase */}
        {type === 'searching' ? (
          // Searching phase: show source card skeletons
          <div className="space-y-1.5 sm:space-y-2 pt-1 sm:pt-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="w-5 h-5 sm:w-6 sm:h-6 bg-slate-300 dark:bg-slate-600 rounded-full flex-shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="h-3 sm:h-3.5 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse" style={{ width: `${85 - i * 5}%` }} />
                  <div className="h-2.5 sm:h-3 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse" style={{ width: `${90 - i * 10}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : type === 'generating' ? (
          // Generating phase: show text line skeletons with typing effect
          <div className="space-y-1.5 sm:space-y-2">
            <div className="h-3.5 sm:h-4 bg-gradient-to-r from-purple-200 via-purple-300 to-purple-200 dark:from-purple-900/50 dark:via-purple-800/50 dark:to-purple-900/50 rounded-md animate-shimmer" style={{ width: '92%' }} />
            <div className="h-3.5 sm:h-4 bg-gradient-to-r from-purple-200 via-purple-300 to-purple-200 dark:from-purple-900/50 dark:via-purple-800/50 dark:to-purple-900/50 rounded-md animate-shimmer animation-delay-100" style={{ width: '88%' }} />
            <div className="h-3.5 sm:h-4 bg-gradient-to-r from-purple-200 via-purple-300 to-purple-200 dark:from-purple-900/50 dark:via-purple-800/50 dark:to-purple-900/50 rounded-md animate-shimmer animation-delay-200" style={{ width: '75%' }} />
          </div>
        ) : (
          // Default: show both
          <div className="space-y-1.5 sm:space-y-2">
            <div className="h-3.5 sm:h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse" style={{ width: '92%' }} />
            <div className="h-3.5 sm:h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse w-full" />
            <div className="h-3.5 sm:h-4 bg-slate-300 dark:bg-slate-600 rounded-md animate-pulse" style={{ width: '88%' }} />
          </div>
        )}
      </div>
    </div>
  );
}