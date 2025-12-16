/**
 * GraphQL Client Configuration
 * Centralized GraphQL client for all operations
 */

import { GraphQLClient } from 'graphql-request';
import { getApiUrl } from '../config';

/**
 * Create GraphQL client instance
 * Uses graphql-request for simple, promise-based queries
 */
export const createGraphQLClient = (token?: string) => {
  const endpoint = getApiUrl('graphql');

  // Validate endpoint URL
  if (!endpoint || endpoint === 'undefined/graphql' || !endpoint.startsWith('http')) {
    console.error('[GraphQL] Invalid endpoint:', endpoint);
    console.error('[GraphQL] API_CONFIG:', {
      baseUrl: process.env.NEXT_PUBLIC_API_URL,
      computed: endpoint
    });
    throw new Error('GraphQL endpoint not configured. Please check NEXT_PUBLIC_API_URL environment variable.');
  }

  console.log('[GraphQL] Connecting to:', endpoint);

  const client = new GraphQLClient(endpoint, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      : {
          'Content-Type': 'application/json',
        },
    // Increase timeout for large CSV files (10 seconds)
    timeout: 10000,
    // Don't throw on HTTP errors, let us handle them
    errorPolicy: 'all',
  });

  return client;
};

/**
 * Get authenticated GraphQL client
 * Automatically includes token from localStorage
 */
export const getGraphQLClient = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return createGraphQLClient(token || undefined);
};

/**
 * Execute GraphQL query with error handling
 */
export const executeQuery = async <T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> => {
  try {
    const client = getGraphQLClient();
    console.log('[GraphQL] Executing query with variables:', variables);

    const data = await client.request<T>(query, variables);
    console.log('[GraphQL] Query successful');

    return data;
  } catch (error: any) {
    console.error('[GraphQL] Query error:', error);
    console.error('[GraphQL] Error response:', error.response);
    console.error('[GraphQL] Error status:', error.response?.status);

    // Handle authentication errors
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    // Handle 500 errors - backend issue
    if (error.response?.status === 500) {
      console.error('[GraphQL] 500 Server Error - Backend returned error');

      // Check if there's any data despite the error
      if (error.response?.data) {
        console.log('[GraphQL] Response data despite error:', error.response.data);
        return error.response.data as T;
      }

      throw new Error('Server error occurred. Please try again.');
    }

    // Extract GraphQL error message
    const message =
      error.response?.errors?.[0]?.message ||
      error.message ||
      'GraphQL request failed';

    throw new Error(message);
  }
};

/**
 * Execute GraphQL mutation with error handling
 */
export const executeMutation = async <T = any>(
  mutation: string,
  variables?: Record<string, any>
): Promise<T> => {
  return executeQuery<T>(mutation, variables);
};
