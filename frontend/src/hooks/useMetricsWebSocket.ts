/**
 * useMetricsWebSocket Hook
 * Real-time system metrics via WebSocket with history for sparkline charts
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface CpuMetrics {
  usage: number;
  model: string;
  cores: number;
  speed: number;
  loadAvg: number[];
}

interface MemoryMetrics {
  percentage: number;
  used: number;
  total: number;
  free: number;
  heapUsed: number;
  heapTotal: number;
}

interface DiskMetrics {
  percentage: number;
  used: number;
  total: number;
  free: number;
  mountPoint: string;
  filesystem: string;
}

interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  bytesInPerSec: number;
  bytesOutPerSec: number;
  packetsIn: number;
  packetsOut: number;
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  uptime?: number;
  memory?: number;
  cpu?: number;
  port?: number;
}

interface PipelineStatus {
  name: string;
  type: string;
  status: string;
  progress?: number;
  current?: number;
  total?: number;
  speed?: number;
  eta?: string;
}

interface PerformanceMetrics {
  avgResponseTime: number;
  dailyQueries: number;
  cacheHitRate: number;
  totalDocuments: number;
}

interface MetricsHistory {
  cpu: number[];
  memory: number[];
  disk: number[];
  networkIn: number[];
  networkOut: number[];
  timestamps: number[];
}

export interface SystemMetricsData {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  services: ServiceStatus[];
  pipelines: PipelineStatus[];
  performance: PerformanceMetrics;
  history: MetricsHistory;
}

interface UseMetricsWebSocketOptions {
  updateRate?: number; // ms between updates (default 1000)
  autoConnect?: boolean; // auto connect on mount (default true)
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseMetricsWebSocketReturn {
  metrics: SystemMetricsData | null;
  history: MetricsHistory;
  connected: boolean;
  error: string | null;
  latency: number;
  connect: () => void;
  disconnect: () => void;
  setUpdateRate: (rate: number) => void;
}

const DEFAULT_METRICS: SystemMetricsData = {
  cpu: { usage: 0, model: '', cores: 0, speed: 0, loadAvg: [0, 0, 0] },
  memory: { percentage: 0, used: 0, total: 0, free: 0, heapUsed: 0, heapTotal: 0 },
  disk: { percentage: 0, used: 0, total: 0, free: 0, mountPoint: '', filesystem: '' },
  network: { bytesIn: 0, bytesOut: 0, bytesInPerSec: 0, bytesOutPerSec: 0, packetsIn: 0, packetsOut: 0 },
  services: [],
  pipelines: [],
  performance: { avgResponseTime: 0, dailyQueries: 0, cacheHitRate: 0, totalDocuments: 0 },
  history: { cpu: [], memory: [], disk: [], networkIn: [], networkOut: [], timestamps: [] }
};

const DEFAULT_HISTORY: MetricsHistory = {
  cpu: [],
  memory: [],
  disk: [],
  networkIn: [],
  networkOut: [],
  timestamps: []
};

export function useMetricsWebSocket(options: UseMetricsWebSocketOptions = {}): UseMetricsWebSocketReturn {
  const {
    updateRate = 1000,
    autoConnect = true,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const [metrics, setMetrics] = useState<SystemMetricsData | null>(null);
  const [history, setHistory] = useState<MetricsHistory>(DEFAULT_HISTORY);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingTimeRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NEXT_PUBLIC_WS_URL?.replace(/^wss?:\/\//, '') ||
                 process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '') ||
                 window.location.host;
    return `${protocol}//${host}/ws/metrics`;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const url = getWebSocketUrl();
      console.log('[MetricsWS] Connecting to:', url);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[MetricsWS] Connected');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        onConnect?.();

        // Set update rate
        ws.send(JSON.stringify({ type: 'setUpdateRate', rate: updateRate }));

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            lastPingTimeRef.current = Date.now();
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'pong':
              setLatency(Date.now() - lastPingTimeRef.current);
              break;

            case 'initial':
              // Full initial data with history
              setMetrics(message.data.current);
              if (message.data.history) {
                setHistory(message.data.history);
              }
              break;

            case 'update':
              // Incremental update
              setMetrics(prev => {
                if (!prev) return message.data;
                return {
                  ...prev,
                  cpu: { ...prev.cpu, ...message.data.cpu },
                  memory: { ...prev.memory, ...message.data.memory },
                  disk: { ...prev.disk, ...message.data.disk },
                  network: { ...prev.network, ...message.data.network },
                  services: message.data.services || prev.services,
                  pipelines: message.data.pipelines || prev.pipelines,
                  performance: message.data.performance || prev.performance
                };
              });

              // Update local history
              setHistory(prev => {
                const newHistory = { ...prev };
                newHistory.cpu = [...prev.cpu, message.data.cpu?.usage || 0].slice(-60);
                newHistory.memory = [...prev.memory, message.data.memory?.percentage || 0].slice(-60);
                newHistory.disk = [...prev.disk, message.data.disk?.percentage || 0].slice(-60);
                newHistory.networkIn = [...prev.networkIn, message.data.network?.bytesInPerSec || 0].slice(-60);
                newHistory.networkOut = [...prev.networkOut, message.data.network?.bytesOutPerSec || 0].slice(-60);
                newHistory.timestamps = [...prev.timestamps, message.timestamp].slice(-60);
                return newHistory;
              });
              break;

            case 'history':
              setHistory(message.data);
              break;
          }
        } catch (err) {
          console.error('[MetricsWS] Parse error:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[MetricsWS] Error:', event);
        setError('WebSocket connection error');
        onError?.(event);
      };

      ws.onclose = () => {
        console.log('[MetricsWS] Disconnected');
        setConnected(false);
        onDisconnect?.();

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Auto reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (autoConnect) {
            console.log('[MetricsWS] Reconnecting...');
            connect();
          }
        }, delay);
      };
    } catch (err) {
      console.error('[MetricsWS] Connection error:', err);
      setError('Failed to connect');
    }
  }, [getWebSocketUrl, updateRate, autoConnect, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const setUpdateRateHandler = useCallback((rate: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setUpdateRate', rate }));
    }
  }, []);

  // Auto connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    metrics,
    history,
    connected,
    error,
    latency,
    connect,
    disconnect,
    setUpdateRate: setUpdateRateHandler
  };
}

export default useMetricsWebSocket;
