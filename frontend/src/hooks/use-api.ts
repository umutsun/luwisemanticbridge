'use client';

import { useCallback, useMemo } from 'react';
import { useAuth } from './use-auth';
import { API_CONFIG, buildApiUrl, DEFAULT_HEADERS } from '@/lib/api-config';
import { toast } from '@/hooks/use-toast';

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
  skipToast?: boolean;
  timeout?: number;
}

interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

/**
 * Unified API hook for consistent API calls across the application
 * Provides standardized authentication, error handling, and timeouts
 */
export const useApi = () => {
  const { token, isAuthenticated } = useAuth();

  // Default error handler
  const handleError = useCallback((error: ApiError, skipToast = false) => {
    console.error('API Error:', error);

    if (!skipToast) {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }

    // Handle specific error cases
    if (error.status === 401) {
      // Token expired or invalid
      window.location.href = '/login';
    }
  }, [toast]);

  // Unified fetch function with authentication
  const apiFetch = useCallback(async (
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<Response> => {
    const {
      skipAuth = false,
      skipToast = false,
      timeout = API_CONFIG.TIMEOUTS.DEFAULT,
      ...fetchOptions
    } = options;

    // Build headers
    const headers = new Headers({
      ...DEFAULT_HEADERS,
      ...fetchOptions.headers,
    });

    // Add authentication header if needed
    if (!skipAuth && token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(buildApiUrl(endpoint), {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-OK responses
      if (!response.ok) {
        let errorData: ApiError = {
          message: 'Request failed',
          status: response.status,
        };

        try {
          const errorJson = await response.json();
          errorData = {
            ...errorData,
            message: errorJson.error || errorJson.message || errorData.message,
            code: errorJson.code,
          };
        } catch {
          // If error response is not JSON
        }

        handleError(errorData, skipToast);
        throw errorData;
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        handleError({ message: 'Request timeout' }, skipToast);
      } else if (!skipToast) {
        handleError({ message: error.message || 'Network error' }, skipToast);
      }

      throw error;
    }
  }, [token, handleError]);

  // Convenience methods
  const api = useMemo(() => ({
    // GET request
    get: (endpoint: string, options: Omit<ApiOptions, 'method'> = {}) =>
      apiFetch(endpoint, { ...options, method: 'GET' }),

    // POST request
    post: (endpoint: string, data?: any, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
      apiFetch(endpoint, {
        ...options,
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
      }),

    // PUT request
    put: (endpoint: string, data?: any, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
      apiFetch(endpoint, {
        ...options,
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined,
      }),

    // PATCH request
    patch: (endpoint: string, data?: any, options: Omit<ApiOptions, 'method' | 'body'> = {}) =>
      apiFetch(endpoint, {
        ...options,
        method: 'PATCH',
        body: data ? JSON.stringify(data) : undefined,
      }),

    // DELETE request
    delete: (endpoint: string, options: Omit<ApiOptions, 'method'> = {}) =>
      apiFetch(endpoint, { ...options, method: 'DELETE' }),

    // Upload file
    upload: (endpoint: string, file: File, options: Omit<ApiOptions, 'method' | 'body'> = {}) => {
      const formData = new FormData();
      formData.append('file', file);

      return apiFetch(endpoint, {
        ...options,
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      });
    },

    // Raw fetch for special cases (like streaming)
    raw: apiFetch,
  }), [apiFetch]);

  // Status check
  const status = useMemo(() => ({
    isReady: isAuthenticated,
    hasToken: !!token,
  }), [isAuthenticated, token]);

  return {
    api,
    status,
    // Direct access to endpoints for convenience
    endpoints: API_CONFIG.ENDPOINTS,
    intervals: API_CONFIG.INTERVALS,
  };
};