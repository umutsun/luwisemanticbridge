/**
 * Custom Hook for Real-time Migration Progress
 * Supports WebSocket and Server-Sent Events (SSE)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import debug from '@/lib/debug';

export interface MigrationProgress {
  migrationId: string;
  tableName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'stopped';
  progress: number; // 0-100
  currentRow: number;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  speed: number; // rows per second
  remainingTime: number; // seconds
  message: string;
  timestamp: Date;
  tokenUsage?: {
    total: number;
    cost: number;
  };
  method?: 'standard' | 'parallel' | 'pgai';
  optimizations?: {
    pgvectorscale: boolean;
    diskann: boolean;
    parallelWorkers?: number;
  };
}

interface UseMigrationProgressOptions {
  migrationId?: string;
  useWebSocket?: boolean;
  useSSE?: boolean;
  autoConnect?: boolean;
}

export function useMigrationProgress(options: UseMigrationProgressOptions = {}) {
  const {
    migrationId,
    useWebSocket = true,
    useSSE = !useWebSocket,
    autoConnect = true
  } = options;

  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket connection
  const connectWebSocket = useCallback((id: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws") || ""}/ws/migration/${id}`;
    debug.log('Connecting to WebSocket:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        debug.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress' && data.data) {
            setProgress({
              ...data.data,
              timestamp: new Date(data.data.timestamp)
            });
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        debug.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect after 2 seconds
        if (autoConnect && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (id) connectWebSocket(id);
          }, 2000);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect to WebSocket');
    }
  }, [autoConnect]);

  // Server-Sent Events connection
  const connectSSE = useCallback((id: string) => {
    if (sseRef.current) {
      return;
    }

    const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/v2/migration/progress/${id}/stream`;
    debug.log('Connecting to SSE:', sseUrl);

    try {
      const eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        debug.log('SSE connected');
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgress({
            ...data,
            timestamp: new Date(data.timestamp)
          });
        } catch (err) {
          console.error('Error parsing SSE message:', err);
        }
      };

      eventSource.onerror = () => {
        console.error('SSE error');
        setError('SSE connection error');
        setIsConnected(false);
        eventSource.close();
        sseRef.current = null;

        // Auto-reconnect after 2 seconds
        if (autoConnect && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (id) connectSSE(id);
          }, 2000);
        }
      };

      sseRef.current = eventSource;
    } catch (err) {
      console.error('Failed to create EventSource:', err);
      setError('Failed to connect to SSE');
    }
  }, [autoConnect]);

  // Connect to real-time updates
  const connect = useCallback((id: string) => {
    if (useWebSocket) {
      connectWebSocket(id);
    } else if (useSSE) {
      connectSSE(id);
    }
  }, [useWebSocket, useSSE, connectWebSocket, connectSSE]);

  // Disconnect from real-time updates
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // Fetch initial progress (non-real-time)
  const fetchProgress = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/v2/migration/progress/${id}`);
      if (response.ok) {
        const data = await response.json();
        setProgress({
          ...data,
          timestamp: new Date(data.timestamp)
        });
      }
    } catch (err) {
      console.error('Error fetching progress:', err);
    }
  }, []);

  // Auto-connect on migrationId change
  useEffect(() => {
    if (migrationId && autoConnect) {
      connect(migrationId);
      fetchProgress(migrationId); // Get initial state
    }

    return () => {
      disconnect();
    };
  }, [migrationId, autoConnect, connect, disconnect, fetchProgress]);

  // Helper functions
  const formatRemainingTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)} seconds`;
    } else if (seconds < 3600) {
      return `${Math.round(seconds / 60)} minutes`;
    } else {
      return `${Math.round(seconds / 3600)} hours`;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'processing':
        return 'text-blue-600';
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'stopped':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getMethodBadgeColor = (method?: string): string => {
    switch (method) {
      case 'pgai':
        return 'bg-purple-100 text-purple-800';
      case 'parallel':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return {
    progress,
    isConnected,
    error,
    connect,
    disconnect,
    fetchProgress,
    formatRemainingTime,
    getStatusColor,
    getMethodBadgeColor
  };
}