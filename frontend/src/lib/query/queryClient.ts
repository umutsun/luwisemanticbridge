import { QueryClient } from '@tanstack/react-query';
import useAppStore from '../stores/app.store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: Data is fresh for 1 minute
      staleTime: 60 * 1000,
      
      // Cache time: Keep data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      
      // Retry configuration
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors
        if (error?.statusCode >= 400 && error?.statusCode < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      
      // Retry delay with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Refetch on window focus
      refetchOnWindowFocus: 'always',
      
      // Refetch on reconnect
      refetchOnReconnect: 'always',
    },
    
    mutations: {
      // Global error handler for mutations
      onError: (error: any) => {
        const addNotification = useAppStore.getState().addNotification;
        
        addNotification({
          type: 'error',
          message: error?.message || 'An error occurred',
        });
      },
    },
  },
});

// Global cache invalidation patterns
export const invalidatePatterns = {
  dashboard: ['dashboard'],
  chat: ['chat', 'sessions'],
  auth: ['user', 'profile'],
  settings: ['settings', 'preferences'],
};

// Utility function to invalidate multiple queries
export const invalidateQueries = (patterns: string[]) => {
  patterns.forEach(pattern => {
    queryClient.invalidateQueries({ queryKey: [pattern] });
  });
};

// Prefetch utility
export const prefetchQuery = async (key: string[], fetcher: () => Promise<any>) => {
  await queryClient.prefetchQuery({
    queryKey: key,
    queryFn: fetcher,
  });
};

export default queryClient;