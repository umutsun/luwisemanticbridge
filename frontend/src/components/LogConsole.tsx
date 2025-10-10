'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Terminal,
  Play,
  Pause,
  RotateCcw,
  Download,
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Globe,
  Database,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Info,
  Bug,
  MessageSquare
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: 'backend' | 'frontend' | 'system';
  service?: string;
  metadata?: any;
  stack?: string;
}

interface LogConsoleProps {
  className?: string;
}

export default function LogConsole({ className }: LogConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMetadata, setShowMetadata] = useState<{ [key: string]: boolean }>({});
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(0);

  // WebSocket connection for real-time logs
  const { isConnected } = useWebSocket(`ws://localhost:8084/ws/logs`, {
    onMessage: (data) => {
      if (data.type === 'log') {
        addLog({
          id: `log-${logIdCounter.current++}`,
          timestamp: data.timestamp || new Date().toISOString(),
          level: data.level || 'info',
          message: data.message || '',
          source: data.source || 'backend',
          service: data.service,
          metadata: data.metadata,
          stack: data.stack
        });
      }
    }
  });

  // Frontend console override
  useEffect(() => {
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    const createLogEntry = (level: LogEntry['level'], ...args: any[]) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      addLog({
        id: `frontend-${logIdCounter.current++}`,
        timestamp: new Date().toISOString(),
        level,
        message,
        source: 'frontend',
        service: 'browser',
        metadata: { args }
      });
    };

    if (isLive) {
      console.log = (...args) => {
        originalConsole.log(...args);
        createLogEntry('info', ...args);
      };
      console.error = (...args) => {
        originalConsole.error(...args);
        createLogEntry('error', ...args);
      };
      console.warn = (...args) => {
        originalConsole.warn(...args);
        createLogEntry('warn', ...args);
      };
      console.info = (...args) => {
        originalConsole.info(...args);
        createLogEntry('info', ...args);
      };
      console.debug = (...args) => {
        originalConsole.debug(...args);
        createLogEntry('debug', ...args);
      };
    }

    return () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
      console.debug = originalConsole.debug;
    };
  }, [isLive]);

  // Generate some test logs on mount
  useEffect(() => {
    if (logs.length === 0) {
      // Add initial test logs
      setTimeout(() => {
        addLog({
          id: `init-${logIdCounter.current++}`,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Log konsolu başlatıldı',
          source: 'frontend',
          service: 'log-console',
          metadata: { version: '1.0.0' }
        });

        addLog({
          id: `init-${logIdCounter.current++}`,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Backend WebSocket bağlantısı bekleniyor...',
          source: 'frontend',
          service: 'log-console',
          metadata: { wsUrl: 'ws://localhost:8084/ws/logs' }
        });
      }, 100);
    }
  }, []);

  const addLog = useCallback((log: LogEntry) => {
    setLogs(prev => {
      const newLogs = [...prev, log];
      // Keep only last 1000 logs
      if (newLogs.length > 1000) {
        return newLogs.slice(-1000);
      }
      return newLogs;
    });
  }, []);

  const clearLogs = () => {
    setLogs([]);
    logIdCounter.current = 0;
  };

  const exportLogs = () => {
    const logText = logs.map(log => {
      const metadataStr = log.metadata ? `\n  Metadata: ${JSON.stringify(log.metadata, null, 2)}` : '';
      const stackStr = log.stack ? `\n  Stack: ${log.stack}` : '';
      return `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source.toUpperCase()}] ${log.message}${metadataStr}${stackStr}`;
    }).join('\n\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (logContainerRef.current && isLive) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isLive]);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
    if (selectedSource !== 'all' && log.source !== selectedSource) return false;
    if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-red-500 text-white';
      case 'warn': return 'bg-yellow-500 text-white';
      case 'info': return 'bg-blue-500 text-white';
      case 'debug': return 'bg-gray-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getSourceIcon = (source: LogEntry['source']) => {
    switch (source) {
      case 'backend': return <Cpu className="h-3 w-3" />;
      case 'frontend': return <Globe className="h-3 w-3" />;
      case 'system': return <Database className="h-3 w-3" />;
      default: return <Terminal className="h-3 w-3" />;
    }
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return <AlertCircle className="h-3 w-3" />;
      case 'warn': return <AlertTriangle className="h-3 w-3" />;
      case 'info': return <Info className="h-3 w-3" />;
      case 'debug': return <Bug className="h-3 w-3" />;
      default: return <MessageSquare className="h-3 w-3" />;
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Log Konsolu
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected ? 'Bağlı' : 'Bağlı Değil'}
            </Badge>
            <Badge variant="secondary">
              {filteredLogs.length} log
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLive(!isLive)}
            >
              {isLive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isLive ? 'Duraklat' : 'Devam Et'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearLogs}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportLogs}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="flex flex-col gap-3 mt-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Loglarda ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
              </div>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Seviyeler</SelectItem>
                  <SelectItem value="error">Hata</SelectItem>
                  <SelectItem value="warn">Uyarı</SelectItem>
                  <SelectItem value="info">Bilgi</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kaynaklar</SelectItem>
                  <SelectItem value="backend">Backend</SelectItem>
                  <SelectItem value="frontend">Frontend</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className={`h-[${isExpanded ? '600px' : '300px'}]`}>
          <div ref={logContainerRef} className="p-4 space-y-2 font-mono text-sm">
            {filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <div className="text-center">
                  <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Henüz log gösterilemiyor</p>
                  <p className="text-xs">Loglar burada görünecek</p>
                </div>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="group">
                  <div className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1 mt-0.5">
                      {getSourceIcon(log.source)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString('tr-TR')}
                      </span>
                    </div>

                    <Badge className={`text-xs ${getLevelColor(log.level)}`}>
                      {getLevelIcon(log.level)}
                      <span className="ml-1">{log.level.toUpperCase()}</span>
                    </Badge>

                    {log.service && (
                      <Badge variant="outline" className="text-xs">
                        {log.service}
                      </Badge>
                    )}

                    <div className="flex-1">
                      <p className="break-all">{log.message}</p>

                      {log.stack && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                            Stack trace göster
                          </summary>
                          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                            {log.stack}
                          </pre>
                        </details>
                      )}

                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="mt-1">
                          <summary
                            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.preventDefault();
                              setShowMetadata(prev => ({
                                ...prev,
                                [log.id]: !prev[log.id]
                              }));
                            }}
                          >
                            Metadata {showMetadata[log.id] ? 'gizle' : 'göster'}
                          </summary>
                          {showMetadata[log.id] && (
                            <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          )}
                        </details>
                      )}
                    </div>
                  </div>
                  <Separator className="opacity-20" />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}