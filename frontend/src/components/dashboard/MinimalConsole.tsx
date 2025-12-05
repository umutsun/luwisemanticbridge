'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useConfig } from '@/contexts/ConfigContext';

interface ConsoleLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
  source?: string;
}

interface MinimalConsoleProps {
  height?: number;
  maxLogs?: number;
}

export default function MinimalConsole({
  height = 300,
  maxLogs = 100
}: MinimalConsoleProps) {
  const { config } = useConfig();
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connectWebSocket = () => {
      const baseUrl = config?.env?.backendUrl || 'http://localhost:8083';
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/v2/ws/console';

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'log' && message.data) {
              setLogs(prev => {
                const newLogs = [...prev, message.data];
                return newLogs.slice(-maxLogs);
              });
            } else if (message.type === 'recent_logs' && Array.isArray(message.data)) {
              setLogs(message.data.slice(-maxLogs));
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Reconnect after 5 seconds
          setTimeout(connectWebSocket, 5000);
        };
      } catch (err) {
        console.error('Failed to connect WebSocket:', err);
        setIsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [config?.env?.backendUrl, maxLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warn':
        return 'text-amber-600 dark:text-amber-400';
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'debug':
        return 'text-slate-400 dark:text-slate-500';
      default:
        return 'text-slate-700 dark:text-slate-300';
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
      {/* Minimal Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">System Console</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">{logs.length} logs</span>
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-300'}`} />
        </div>
      </div>

      {/* Logs Container */}
      <div
        className="font-mono text-xs overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
        style={{ height: `${height}px` }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
            {isConnected ? 'Waiting for logs...' : 'Connecting...'}
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 py-1 rounded transition-colors"
              >
                <span className="text-slate-400 dark:text-slate-500 shrink-0 select-none">
                  {formatTime(log.timestamp)}
                </span>
                <span className={`uppercase shrink-0 select-none ${getLevelColor(log.level)}`}>
                  {log.level.slice(0, 4)}
                </span>
                {log.source && (
                  <span className="text-slate-400 dark:text-slate-500 shrink-0 select-none">
                    [{log.source}]
                  </span>
                )}
                <span className="text-slate-700 dark:text-slate-300 break-all">
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
