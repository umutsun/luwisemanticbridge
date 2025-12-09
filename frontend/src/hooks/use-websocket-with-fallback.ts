/**
 * WebSocket Hook with Polling Fallback
 * Automatically switches to polling when WebSocket connection fails
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebSocketWithFallbackOptions {
  wsUrl: string;
  fallbackEndpoint: string;
  pollingInterval?: number;
  reconnectAttempts?: number;
}

interface WebSocketWithFallback {
  isConnected: boolean;
  isFallback: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'fallback';
  subscribe: (room: string) => void;
  on: (event: string, handler: Function) => void;
  reconnect: () => void;
  emit: (event: string, data: any) => void;
}

export function useWebSocketWithFallback({
  wsUrl,
  fallbackEndpoint,
  pollingInterval = 2000,
  reconnectAttempts = 3
}: WebSocketWithFallbackOptions): WebSocketWithFallback {

  const [isConnected, setIsConnected] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'fallback'>('disconnected');

  const socketRef = useRef<Socket | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const eventHandlersRef = useRef<Map<string, Function>>(new Map());
  const subscribedRoomsRef = useRef<Set<string>>(new Set());

  // Start polling fallback
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    console.log('[WebSocket] Switching to polling fallback');
    setIsFallback(true);
    setConnectionStatus('fallback');

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(fallbackEndpoint);
        if (!response.ok) {
          console.error('[Polling] HTTP error:', response.status);
          return;
        }

        const data = await response.json();

        // Trigger registered event handlers with polled data
        eventHandlersRef.current.forEach((handler, event) => {
          if (data[event]) {
            handler(data[event]);
          }
        });
      } catch (error: any) {
        console.error('[Polling] Error:', error.message);
      }
    }, pollingInterval);
  }, [fallbackEndpoint, pollingInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setIsFallback(false);
      console.log('[Polling] Stopped');
    }
  }, []);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Already connected');
      return;
    }

    console.log('[WebSocket] Connecting to', wsUrl);

    const socket = io(wsUrl, {
      reconnection: true,
      reconnectionAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      setIsConnected(true);
      setIsFallback(false);
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;

      // Stop polling if active
      stopPolling();

      // Re-subscribe to rooms
      subscribedRoomsRef.current.forEach(room => {
        console.log('[WebSocket] Re-subscribing to room:', room);
        socket.emit('join', room);
      });

      // Re-attach event handlers
      eventHandlersRef.current.forEach((handler, event) => {
        socket.on(event, handler as any);
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setIsConnected(false);
      setConnectionStatus('disconnected');
      reconnectAttemptsRef.current += 1;

      // If max reconnect attempts reached, switch to polling
      if (reconnectAttemptsRef.current >= reconnectAttempts) {
        console.log('[WebSocket] Max reconnect attempts reached, switching to polling');
        startPolling();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
      setIsConnected(false);
      reconnectAttemptsRef.current += 1;

      // Switch to polling after max attempts
      if (reconnectAttemptsRef.current >= reconnectAttempts) {
        console.log('[WebSocket] Connection failed, switching to polling');
        startPolling();
      }
    });

    socket.on('error', (error) => {
      console.error('[WebSocket] Socket error:', error);
    });

    socketRef.current = socket;
  }, [wsUrl, reconnectAttempts, startPolling, stopPolling]);

  // Subscribe to room (WebSocket only)
  const subscribe = useCallback((room: string) => {
    subscribedRoomsRef.current.add(room);

    if (socketRef.current?.connected) {
      console.log('[WebSocket] Subscribing to room:', room);
      socketRef.current.emit('join', room);
    } else {
      console.log('[WebSocket] Not connected, will subscribe when connected');
    }
  }, []);

  // Emit event (WebSocket only)
  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('[WebSocket] Cannot emit, not connected:', event);
    }
  }, []);

  // Register event listener
  const on = useCallback((event: string, handler: Function) => {
    eventHandlersRef.current.set(event, handler);

    if (socketRef.current?.connected) {
      socketRef.current.on(event, handler as any);
    }
  }, []);

  // Manual reconnect
  const reconnect = useCallback(() => {
    console.log('[WebSocket] Manual reconnect triggered');
    reconnectAttemptsRef.current = 0;

    // Stop polling
    stopPolling();

    // Disconnect existing socket
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsFallback(false);
    setIsConnected(false);
    setConnectionStatus('disconnected');

    // Reconnect
    connectWebSocket();
  }, [connectWebSocket, stopPolling]);

  // Initialize on mount
  useEffect(() => {
    connectWebSocket();

    return () => {
      // Cleanup on unmount
      stopPolling();

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connectWebSocket, stopPolling]);

  return {
    isConnected,
    isFallback,
    connectionStatus,
    subscribe,
    on,
    reconnect,
    emit
  };
}
