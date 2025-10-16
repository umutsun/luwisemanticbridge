'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

// Create a client with optimized defaults
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Time in milliseconds that data remains fresh
        staleTime: 1000 * 60 * 5, // 5 minutes

        // Time in milliseconds that inactive queries will remain in cache
        gcTime: 1000 * 60 * 10, // 10 minutes (was cacheTime)

        // Number of times to retry a failed request
        retry: (failureCount, error: any) => {
          // Don't retry on 4xx errors
          if (error?.status >= 400 && error?.status < 500) {
            return false;
          }
          // Retry up to 3 times for other errors
          return failureCount < 3;
        },

        // Delay between retries (exponential backoff)
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

        // Refetch on window focus (disabled for better UX)
        refetchOnWindowFocus: false,

        // Refetch on reconnect
        refetchOnReconnect: true,

        // Prevent excessive refetching
        refetchInterval: false, // We'll use manual polling where needed
      },
      mutations: {
        // Retry mutations
        retry: 1,

        // Error handling for mutations
        onError: (error) => {
          console.error('Mutation error:', error);
        },
      },
    },
  });
}

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Create a new client for each instance to prevent state sharing between tests
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

// Export query keys for consistency
export const queryKeys = {
  // Authentication
  auth: ['auth'] as const,
  user: ['user'] as const,

  // Embeddings
  embeddings: ['embeddings'] as const,
  embeddingsTables: ['embeddings', 'tables'] as const,
  embeddingsProgress: ['embeddings', 'progress'] as const,
  embeddingsAnalytics: ['embeddings', 'analytics'] as const,

  // Documents
  documents: ['documents'] as const,
  documentsList: ['documents', 'list'] as const,

  // Scraper
  scraper: ['scraper'] as const,
  scraperSites: ['scraper', 'sites'] as const,
  scraperJobs: ['scraper', 'jobs'] as const,

  // Chat
  chat: ['chat'] as const,
  chatHistory: ['chat', 'history'] as const,

  // Settings
  settings: ['settings'] as const,
  settingsLLM: ['settings', 'llm'] as const,
  settingsEmbeddings: ['settings', 'embeddings'] as const,

  // Health
  health: ['health'] as const,
} as const;