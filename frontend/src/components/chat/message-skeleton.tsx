'use client';

import { Loader2, Search, Sparkles, FileText } from 'lucide-react';

interface MessageSkeletonProps {
  type?: 'searching' | 'generating' | 'default';
  message?: string;
}

export function MessageSkeleton({ type = 'default', message }: MessageSkeletonProps) {
  // Get status icon and default message based on type
  const getStatusInfo = () => {
    switch (type) {
      case 'searching':
        // Check if it's PDF processing
        if (message?.toLowerCase().includes('pdf')) {
          return {
            icon: <FileText className="w-4 h-4 text-blue-500 animate-pulse" />,
            defaultMessage: 'PDF Analiz Ediliyor...',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
            textColor: 'text-blue-600 dark:text-blue-400'
          };
        }
        return {
          icon: <Search className="w-4 h-4 text-blue-500 animate-pulse" />,
          defaultMessage: 'Aramalar yapiliyor...',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          textColor: 'text-blue-600 dark:text-blue-400'
        };
      case 'generating':
        return {
          icon: <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />,
          defaultMessage: 'Yanit olusturuluyor...',
          bgColor: 'bg-purple-50 dark:bg-purple-900/20',
          textColor: 'text-purple-600 dark:text-purple-400'
        };
      default:
        return {
          icon: <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />,
          defaultMessage: 'Isleniyor...',
          bgColor: 'bg-gray-50 dark:bg-gray-800',
          textColor: 'text-gray-600 dark:text-gray-400'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const displayMessage = message || statusInfo.defaultMessage;

  return (
    <div className="flex gap-3 p-4 animate-in fade-in-0 duration-300">
      <div className="flex-1 space-y-3">
        {/* Status indicator with message */}
        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${statusInfo.bgColor}`}>
          {statusInfo.icon}
          <span className={`text-sm font-medium ${statusInfo.textColor}`}>
            {displayMessage}
          </span>
        </div>

        {/* Animated skeleton lines */}
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
