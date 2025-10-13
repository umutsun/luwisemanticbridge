'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Terminal,
  Activity,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Info,
  Trash2,
  Download,
  Pause,
  Play,
  RotateCcw,
  Send,
  ChevronRight,
  Command
} from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  service?: string;
}

interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  recentByHour: Record<string, number>;
}

export default function ConsoleLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandOutput, setCommandOutput] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';

  useEffect(() => {
    connectToLogs();
    fetchStats();
    fetchRecentLogs();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (autoScroll && !isPaused && scrollAreaRef.current) {
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [logs, autoScroll, isPaused]);

  const connectToLogs = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${apiUrl}/api/v2/system/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'ping') {
          return;
        }

        if (!isPaused) {
          setLogs(prev => {
            const newLogs = [...prev, data as LogEntry].slice(-500); // Keep last 500 logs
            return newLogs;
          });
        }
      } catch (error) {
        // Ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setTimeout(connectToLogs, 5000); // Reconnect after 5 seconds
    };
  };

  const fetchRecentLogs = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/v2/system/recent?limit=50`);
      const result = await response.json();
      if (result.success) {
        setLogs(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch recent logs:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/v2/system/stats`);
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch log stats:', error);
    }
  };

  const clearLogs = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/v2/system/clear`, { method: 'DELETE' });
      if (response.ok) {
        setLogs([]);
        fetchStats();
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const exportLogs = () => {
    const filteredLogs = levelFilter === 'all'
      ? logs
      : logs.filter(log => log.level === levelFilter);

    const data = filteredLogs.map(log =>
      `${log.timestamp} [${log.level.toUpperCase()}] ${log.service || 'system'}: ${log.message}`
    ).join('\n');

    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-logs-${new Date().toISOString().split('T')[0]}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'debug':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'debug':
        return 'text-blue-400';
      default:
        return 'text-green-400';
    }
  };

  const filteredLogs = levelFilter === 'all'
    ? logs
    : logs.filter(log => log.level === levelFilter);

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim()) return;

    // Add to history
    setCommandHistory(prev => [...prev.slice(-49), cmd]); // Keep last 50 commands
    setHistoryIndex(-1);

    // Parse command
    const parts = cmd.trim().split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    // Execute command based on input
    let output = '';

    try {
      switch (command) {
        case 'help':
          output = `Available commands:
  help - Show this help message
  clear - Clear console logs
  status - Show system status
  ping - Ping backend
  logs - Show recent logs count
  stats - Show log statistics
  health - Check backend health
  cache:clear - Clear frontend cache
  export - Export logs
  search <term> - Search in logs (not implemented)
  redis:info - Show Redis info (if available)`;
          break;

        case 'clear':
          await clearLogs();
          setCommandOutput([]);
          output = '✅ Console logs cleared';
          break;

        case 'status':
          const status = {
            connected: isConnected,
            logsCount: logs.length,
            paused: isPaused,
            filter: levelFilter,
            autoScroll: autoScroll,
            time: new Date().toLocaleTimeString()
          };
          output = `📊 System Status:
  Connection: ${status.connected ? '✅ Connected' : '❌ Disconnected'}
  Logs: ${status.logsCount} entries
  State: ${status.paused ? '⏸️ Paused' : '▶️ Playing'}
  Filter: ${status.filter}
  Auto-scroll: ${status.autoScroll ? '✅' : '❌'}
  Time: ${status.time}`;
          break;

        case 'ping':
          const startTime = Date.now();
          try {
            const response = await fetch(`${apiUrl}/api/v2/health`);
            const endTime = Date.now();
            if (response.ok) {
              output = `🏓 Pong! Backend responded in ${endTime - startTime}ms`;
            } else {
              output = '❌ Backend responded with error';
            }
          } catch (error) {
            output = '❌ Failed to ping backend';
          }
          break;

        case 'logs':
          output = `📋 Log Summary:
  Total: ${logs.length}
  Errors: ${logs.filter(l => l.level === 'error').length}
  Warnings: ${logs.filter(l => l.level === 'warn').length}
  Info: ${logs.filter(l => l.level === 'info').length}
  Debug: ${logs.filter(l => l.level === 'debug').length}`;
          break;

        case 'stats':
          if (stats) {
            output = `📈 Statistics:
  Total Logs: ${stats.total}
  By Level: ${JSON.stringify(stats.byLevel, null, 2)}
  Recent Activity: ${JSON.stringify(stats.recentByHour, null, 2)}`;
          } else {
            output = '❌ Stats not available';
          }
          break;

        case 'health':
          try {
            const response = await fetch(`${apiUrl}/api/v2/system/health`);
            const data = await response.json();
            output = `🏥 System Health:
  Status: ${data.status}
  Uptime: ${Math.floor(data.uptime)}s
  Memory: ${Math.round(data.memory.heapUsed / 1024 / 1024)}MB
  Clients: ${data.logs.connectedClients}`;
          } catch (error) {
            output = '❌ Failed to get health info';
          }
          break;

        case 'cache:clear':
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            output = '✅ Browser caches cleared';
          } else {
            output = '⚠️ Cache API not available';
          }
          break;

        case 'export':
          exportLogs();
          output = '📥 Logs exported';
          break;

        case 'search':
          if (args.length === 0) {
            output = '❌ Please provide a search term: search <term>';
          } else {
            const term = args.join(' ');
            const matches = logs.filter(log =>
              log.message.toLowerCase().includes(term.toLowerCase())
            );
            output = `🔍 Found ${matches.length} logs matching "${term}"`;
            // Display first 5 matches
            matches.slice(0, 5).forEach(log => {
              output += `\n  [${log.level.toUpperCase()}] ${log.message}`;
            });
          }
          break;

        case 'redis:info':
          try {
            const response = await fetch(`${apiUrl}/api/v2/system/stats`);
            const data = await response.json();
            output = `🔴 Redis Service: ${data.success ? 'Available' : 'Not Available'}`;
          } catch (error) {
            output = '❌ Redis info not available';
          }
          break;

        default:
          output = `❌ Unknown command: ${command}. Type 'help' for available commands`;
      }
    } catch (error) {
      output = `❌ Error executing command: ${error}`;
    }

    // Add command and output to display
    setCommandOutput(prev => [
      ...prev,
      `$ ${cmd}`,
      output,
      ''
    ]);
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      executeCommand(command);
      setCommand('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Simple tab completion for commands
      const commands = ['help', 'clear', 'status', 'ping', 'logs', 'stats', 'health', 'cache:clear', 'export', 'search', 'redis:info'];
      const match = commands.find(cmd => cmd.startsWith(command));
      if (match) {
        setCommand(match);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Logs</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Terminal className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Errors</p>
                  <p className="text-2xl font-bold text-red-500">{stats.byLevel.error || 0}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Warnings</p>
                  <p className="text-2xl font-bold text-yellow-500">{stats.byLevel.warn || 0}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Connection</p>
                  <div className="flex items-center gap-2">
                    <Activity className={`h-4 w-4 ${isConnected ? 'text-green-500' : 'text-red-500'}`} />
                    <span className="text-sm font-medium">
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Logs Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Console Logs
              <Badge variant="outline" className="ml-2">
                {filteredLogs.length} entries
              </Badge>
            </CardTitle>

            <div className="flex items-center gap-2">
              {/* Category Filter - Each shows only that category */}
              <div className="flex items-center bg-slate-900/50 rounded-xl p-1 border border-slate-800">
                {[
                  { value: 'all', label: 'Backend', icon: <Terminal className="h-3 w-3" />, color: 'from-emerald-500 to-teal-600' },
                  { value: 'error', label: 'Errors', icon: <AlertCircle className="h-3 w-3" />, color: 'from-red-500 to-rose-600' },
                  { value: 'warn', label: 'Warnings', icon: <AlertTriangle className="h-3 w-3" />, color: 'from-amber-500 to-orange-600' },
                  { value: 'info', label: 'Info', icon: <CheckCircle className="h-3 w-3" />, color: 'from-blue-500 to-indigo-600' },
                  { value: 'debug', label: 'Debug', icon: <Info className="h-3 w-3" />, color: 'from-purple-500 to-pink-600' }
                ].map(({ value, label, icon, color }) => (
                  <button
                    key={value}
                    onClick={() => setLevelFilter(value)}
                    className={`
                      relative flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-300
                      ${levelFilter === value
                        ? `text-white bg-gradient-to-r ${color} shadow-lg`
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }
                    `}
                  >
                    {icon}
                    {label}
                    {levelFilter === value && (
                      <div className="absolute inset-0 rounded-lg bg-white/10 animate-pulse"></div>
                    )}
                  </button>
                ))}
              </div>

              {/* Auto-scroll toggle */}
              <Button
                variant={autoScroll ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoScroll(!autoScroll)}
                className="h-8"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Auto
              </Button>

              {/* Pause/Resume */}
              <Button
                variant={isPaused ? "outline" : "default"}
                size="sm"
                onClick={() => setIsPaused(!isPaused)}
                className="h-8"
              >
                {isPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                {isPaused ? 'Resume' : 'Pause'}
              </Button>

              {/* Refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchRecentLogs}
                className="h-8"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              {/* Export */}
              <Button
                variant="outline"
                size="sm"
                onClick={exportLogs}
                className="h-8"
              >
                <Download className="h-4 w-4" />
              </Button>

              {/* Clear */}
              <Button
                variant="outline"
                size="sm"
                onClick={clearLogs}
                className="h-8 text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea
            ref={scrollAreaRef}
            className="h-[600px] w-full rounded-md"
          >
            <div className="p-6 bg-gradient-to-b from-slate-950 to-slate-900/50">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                  <Terminal className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm font-light">No logs to display</p>
                  <p className="text-xs mt-1 opacity-50">Logs will appear here</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredLogs.map((log, index) => (
                    <div
                      key={`${log.id}-${index}`}
                      className="group flex items-start gap-4 py-2 px-3 -mx-3 rounded-lg hover:bg-slate-800/30 transition-all duration-200"
                    >
                      {/* Timestamp */}
                      <span className="text-xs text-slate-500 font-mono mt-0.5 min-w-[70px] opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(log.timestamp).toLocaleTimeString('en-US', {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        }).substring(0, 8)}
                      </span>

                      {/* Level Indicator */}
                      <div className="flex items-center gap-2">
                        <div className={`
                          w-2 h-2 rounded-full animate-pulse
                          ${log.level === 'error' ? 'bg-red-500' :
                            log.level === 'warn' ? 'bg-amber-500' :
                            log.level === 'debug' ? 'bg-purple-500' :
                            'bg-emerald-500'
                          }
                        `}></div>
                      </div>

                      {/* Service */}
                      {log.service && (
                        <span className="text-xs text-slate-400 font-medium min-w-[60px]">
                          {log.service}
                        </span>
                      )}

                      {/* Message */}
                      <span className={`
                        text-sm font-light leading-relaxed flex-1
                        ${log.level === 'error' ? 'text-red-300' :
                          log.level === 'warn' ? 'text-amber-300' :
                          log.level === 'debug' ? 'text-purple-300' :
                          'text-slate-300'
                        }
                      `}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Minimalist Command Line */}
          <div className="border-t border-slate-800/50 bg-gradient-to-b from-slate-900 to-slate-950/50 p-4">
            {/* Command Output */}
            {commandOutput.length > 0 && (
              <div className="mb-3 p-3 bg-slate-950/50 rounded-lg text-xs font-mono text-emerald-400 max-h-32 overflow-y-auto border border-slate-800/50">
                {commandOutput.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Command Input */}
            <form onSubmit={handleCommandSubmit} className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400/50 font-mono text-sm">
                $
              </div>
              <Input
                ref={commandInputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command... (try 'help')"
                className="pl-8 pr-12 bg-slate-950/50 border-slate-800/50 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-emerald-500/20 transition-all"
              />
              <Button
                type="submit"
                size="sm"
                className="absolute right-1 top-1 h-7 w-7 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-400"
              >
                <Send className="h-3 w-3" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Minimal Quick Commands */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span className="text-xs text-slate-500">Quick:</span>
        {['help', 'status', 'ping', 'logs', 'clear'].map((cmd) => (
          <button
            key={cmd}
            onClick={() => {
              setCommand(cmd);
              commandInputRef.current?.focus();
            }}
            className="text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 px-2 py-1 rounded transition-all"
          >
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}