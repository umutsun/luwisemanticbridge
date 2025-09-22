'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseWebSocketOptions {
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onOpen?: (event: Event) => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onError,
    onClose,
    onOpen,
    reconnectAttempts = 5,
    reconnectInterval = 3000
  } = options;

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs for callbacks to prevent recreation of connect function
  const callbacksRef = useRef({
    onMessage,
    onError,
    onClose,
    onOpen
  });

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onMessage,
      onError,
      onClose,
      onOpen
    };
  }, [onMessage, onError, onClose, onOpen]);

  const connect = useCallback(() => {
    // Don't connect if URL is empty
    if (!url) {
      return;
    }

    try {
      const ws = new WebSocket(url);

      ws.onopen = (event) => {
        setIsConnected(true);
        reconnectCountRef.current = 0;
        callbacksRef.current.onOpen?.(event);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          callbacksRef.current.onMessage?.(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        callbacksRef.current.onClose?.(event);

        // Attempt to reconnect if not manually closed
        if (
          !event.wasClean &&
          reconnectCountRef.current < reconnectAttempts
        ) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectCountRef.current++;
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        // Only log WebSocket errors in development
        if (process.env.NODE_ENV === 'development') {
          console.debug('WebSocket connection failed - this is expected when backend is not running');
        }
        callbacksRef.current.onError?.(error);
      };

      setSocket(ws);
    } catch (error) {
      console.error('Error creating WebSocket:', error);
    }
  }, [url, reconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    socket?.close();
    setSocket(null);
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    } else {
      console.error('WebSocket is not connected');
    }
  }, [socket]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [url]);

  return {
    socket,
    isConnected,
    sendMessage,
    disconnect
  };
}