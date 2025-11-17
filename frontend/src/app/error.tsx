'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console for debugging
    console.error('Error boundary caught:', error);

    // Check if it's a chunk loading error
    const isChunkError =
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('ChunkLoadError') ||
      error.name === 'ChunkLoadError';

    if (isChunkError) {
      console.log('Chunk loading error detected, will auto-retry on reset');
    }
  }, [error]);

  const isChunkError =
    error.message?.includes('Loading chunk') ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('ChunkLoadError') ||
    error.name === 'ChunkLoadError';

  const handleReset = () => {
    // For chunk errors, force reload the page
    if (isChunkError) {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-slate-700/50">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">
              {isChunkError ? 'Loading Error' : 'Something went wrong'}
            </h2>
            <p className="text-slate-400">
              {isChunkError
                ? 'Failed to load page resources. This usually happens after a deployment update.'
                : 'An unexpected error occurred while rendering this page.'}
            </p>
          </div>

          {/* Error details - only in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-left">
              <p className="text-xs text-red-400 font-mono break-all">
                {error.message}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleReset}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {isChunkError ? 'Reload Page' : 'Try Again'}
            </Button>

            <Button
              onClick={() => window.location.href = '/dashboard'}
              variant="outline"
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-700/50"
            >
              <Home className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            Error ID: {error.digest || 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}
