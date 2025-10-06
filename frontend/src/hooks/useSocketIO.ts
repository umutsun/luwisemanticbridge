'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketIOOptions {
  onMessage?: (data: any) => void;
  onError?: (error: any) => void;
  onClose?: (reason: string) => void;
  onOpen?: () => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  enableLogs?: boolean; // Yeni: Log'ları kontrol et
}

// Environment-based logging
const isDevelopment = process.env.NODE_ENV === 'development';
const ENABLE_LOGS = isDevelopment && process.env.NEXT_PUBLIC_ENABLE_SOCKET_LOGS === 'true';

function log(...args: any[]) {
  if (ENABLE_LOGS) {
    console.log('[WebSocket]', ...args);
  }
}

function logError(...args: any[]) {
  if (ENABLE_LOGS) {
    console.error('[WebSocket Error]', ...args);
  }
}

export function useSocketIO(url: string, options: UseSocketIOOptions = {}) {
  const {
    onMessage,
    onError,
    onClose,
    onOpen,
    reconnectAttempts = 3, // Azaltıldı: 5 → 3
    reconnectInterval = 5000, // Artırıldı: 3000 → 5000 (daha yavaş retry)
    enableLogs = false
  } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAttemptedConnectionRef = useRef(false);

  // Use refs for callbacks to prevent recreation of connect function
  const callbacksRef = useRef({
    onMessage,
    onError,
    onClose,
    onOpen
  });

  // Update callbacks ref when options change
  useEffect(() => {
    callbacksRef.current = { onMessage, onError, onClose, onOpen };
  }, [onMessage, onError, onClose, onOpen]);

  const connect = useCallback(() => {
    // Eğer URL boşsa veya geçersizse, bağlanma
    if (!url || url === '' || url === 'undefined') {
      if (enableLogs) {
        log('Skipping connection - no valid URL provided');
      }
      return;
    }

    // Max reconnect aşıldıysa, dur
    if (reconnectCountRef.current >= reconnectAttempts) {
      if (enableLogs) {
        logError('Max reconnection attempts reached. Stopping.');
      }
      return;
    }

    // İlk bağlantı denemesi
    if (!hasAttemptedConnectionRef.current) {
      hasAttemptedConnectionRef.current = true;
      if (enableLogs) {
        log('Initial connection attempt to:', url);
      }
    }

    // Convert ws:// to http:// for Socket.IO
    let socketUrl = url.replace('ws://', 'http://').replace('wss://', 'https://');

    // Port düzeltmesi (eğer yanlışsa)
    if (socketUrl.includes(':3001') || socketUrl.includes(':3002')) {
      const correctUrl = socketUrl.replace(/:300[12]/, ':8083');
      if (enableLogs && socketUrl !== correctUrl) {
        log('Auto-corrected port to 8083');
      }
      socketUrl = correctUrl;
    }

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'], // WebSocket önce, sonra polling
      reconnection: false, // Manuel reconnect yapıyoruz
      timeout: 10000, // 10 saniye timeout
      forceNew: false, // Var olan connection'ı kullan
      path: '/socket.io',
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      if (enableLogs) {
        log('Connected successfully');
      }
      setIsConnected(true);
      setSocket(newSocket);
      reconnectCountRef.current = 0; // Reset counter
      callbacksRef.current.onOpen?.();
    });

    newSocket.on('notification', (data) => {
      callbacksRef.current.onMessage?.(data);
    });

    newSocket.on('disconnect', (reason) => {
      if (enableLogs) {
        log('Disconnected:', reason);
      }
      setIsConnected(false);
      setSocket(null);
      callbacksRef.current.onClose?.(reason);

      // Sadece client kaynaklı disconnect değilse yeniden bağlan
      if (reason !== 'io client disconnect' && reconnectCountRef.current < reconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectCountRef.current++;
          if (enableLogs) {
            log(`Reconnection attempt ${reconnectCountRef.current}/${reconnectAttempts}`);
          }
          connect();
        }, reconnectInterval);
      }
    });

    newSocket.on('connect_error', (error) => {
      // Sadece ilk hata veya her 3 denemede bir log
      if (enableLogs && reconnectCountRef.current % 3 === 0) {
        logError('Connection error:', error.message);
      }
      callbacksRef.current.onError?.(error);

      // Otomatik reconnect
      if (reconnectCountRef.current < reconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectCountRef.current++;
          connect();
        }, reconnectInterval);
      }
    });

    // Timeout durumunda
    newSocket.on('connect_timeout', () => {
      if (enableLogs) {
        logError('Connection timeout');
      }
    });

  }, [url, reconnectAttempts, reconnectInterval, enableLogs]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socket) {
      socket.disconnect();
      if (enableLogs) {
        log('Disconnected manually');
      }
    }
  }, [socket, enableLogs]);

  const sendMessage = useCallback((data: any) => {
    if (socket && isConnected) {
      socket.emit('message', data);
    } else if (enableLogs) {
      log('Cannot send message - not connected');
    }
  }, [socket, isConnected, enableLogs]);

  // Initial connection
  useEffect(() => {
    // Sadece geçerli URL varsa bağlan
    if (url && url !== '' && url !== 'undefined') {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [url]); // Sadece URL değiştiğinde reconnect

  return {
    socket,
    isConnected,
    sendMessage,
    disconnect
  };
}
