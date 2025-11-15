'use client';

import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-in slide-in-from-bottom-2 fade-in-50 duration-300">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg ring-2 ring-blue-100 dark:ring-blue-900/30 animate-pulse">
          <Bot className="w-4 h-4" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-md border border-gray-100 dark:border-gray-700 animate-pulse">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">düşünüyor...</span>
          </div>
        </div>
      </div>
    </div>
  );
}