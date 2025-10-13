'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Terminal, Activity } from 'lucide-react';

interface LogEntry {
  type: 'log' | 'error' | 'system' | 'connected' | 'ping';
  timestamp: string;
  message: string;
  level?: 'info' | 'error' | 'warn';
}

export default function BackendLogLoader() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to backend log streaming endpoint
    const connectToLogs = () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
        const eventSource = new EventSource(`${apiUrl}/api/v2/system/stream`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
          console.log('Connected to backend log stream');
        };

        eventSource.onmessage = (event) => {
          try {
            const logEntry: LogEntry = JSON.parse(event.data);

            // Add new log to the array, keep only last 5 logs
            setLogs(prev => {
              const newLogs = [logEntry, ...prev].slice(0, 5);
              return newLogs;
            });
          } catch (error) {
            // Ignore invalid JSON
          }
        };

        eventSource.onerror = (error) => {
          console.error('Log stream error:', error);
          setIsConnected(false);
          eventSource.close();
        };

        // Cleanup after 30 seconds
        const cleanup = setTimeout(() => {
          eventSource.close();
          setIsConnected(false);
        }, 30000);

        return () => {
          clearTimeout(cleanup);
          eventSource.close();
        };
      } catch (error) {
        console.error('Failed to connect to log stream:', error);
      }
    };

    connectToLogs();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Skip ping messages for cleaner display
  const displayLogs = logs.filter(log => log.type !== 'ping');

  return (
    <div className="flex flex-col items-center justify-center min-h-[60px] space-y-2 py-4">
      {/* Animated loader */}
      <div className="flex items-center space-x-2">
        <div className="relative">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <Activity className="h-3 w-3 absolute -bottom-1 -right-1 text-green-500 animate-pulse" />
        </div>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Backend başlatılıyor...
        </span>
      </div>

      {/* Log display terminal */}
      <div className="relative">
        <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 min-h-[100px] w-full max-w-md overflow-hidden">
          <div className="flex items-center space-x-2 mb-2">
            <Terminal className="h-3 w-3 text-green-400" />
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
            </div>
            <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse ml-auto"></div>
          </div>

          <div className="space-y-1 font-mono text-xs">
            {displayLogs.length === 0 ? (
              <div className="text-gray-500 animate-pulse">
                <span className="text-green-400">$</span> Bağlantı kuruluyor...
              </div>
            ) : (
              displayLogs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${index}`}
                  className={`
                    ${log.type === 'error' ? 'text-red-400' :
                      log.type === 'system' ? 'text-blue-400' :
                      log.type === 'connected' ? 'text-green-400' : 'text-gray-300'
                    }
                    ${index === 0 ? 'animate-fade-in' : 'opacity-70'}
                    transition-all duration-300
                  `}
                  style={{
                    animation: index === 0 ? 'fadeIn 0.3s ease-in' : undefined
                  }}
                >
                  <span className="text-gray-500">
                    [{new Date(log.timestamp).toLocaleTimeString('tr-TR', {
                      hour12: false,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}]
                  </span>
                  {' '}
                  {log.type === 'error' && <span className="text-red-400">[ERROR]</span>}
                  {log.type === 'system' && <span className="text-blue-400">[SYSTEM]</span>}
                  {log.type === 'connected' && <span className="text-green-400">[INFO]</span>}
                  {' '}
                  <span className="text-gray-300 truncate inline-block max-w-[280px]">
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Scan line effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-500/5 to-transparent pointer-events-none animate-scan"></div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scan {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(100%);
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.3s ease-in;
        }

        .animate-scan {
          animation: scan 3s linear infinite;
        }
      `}</style>
    </div>
  );
}