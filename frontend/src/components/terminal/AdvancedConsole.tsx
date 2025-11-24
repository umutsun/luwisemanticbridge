"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Terminal,
    Play,
    Pause,
    RotateCcw,
    Download,
    Search,
    Filter,
    Bookmark,
    History,
    Settings,
    ChevronDown,
    ChevronUp,
    Maximize2,
    Minimize2
} from 'lucide-react';

// WebSocket message interfaces
interface ConnectedMessage {
    type: 'connected';
    data: {
        clientId: string;
        serverTime: string;
        connectedClients: number;
    };
}

interface LogMessage {
    type: 'log';
    data: ConsoleLog;
}

interface RecentLogsMessage {
    type: 'recent_logs';
    data: ConsoleLog[];
}

interface CommandResultMessage {
    type: 'command_result';
    data: {
        command: string;
        result: Record<string, unknown>;
        timestamp: string;
    };
}

interface CommandErrorMessage {
    type: 'command_error';
    data: {
        command: string;
        error: string;
        timestamp: string;
    };
}

interface MetricsUpdateMessage {
    type: 'metrics_update';
    data: {
        cpu?: {
            user: number;
        };
        memory?: {
            heapUsed: number;
        };
    };
}

interface SystemStatsUpdateMessage {
    type: 'system_stats_update';
    data: {
        totalLogs: number;
        connectedClients: number;
    };
}

type WsMessage = ConnectedMessage | LogMessage | RecentLogsMessage | CommandResultMessage | CommandErrorMessage | MetricsUpdateMessage | SystemStatsUpdateMessage;

interface ConsoleLog {
    id: string;
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug' | 'success';
    message: string;
    source?: string;
    metadata?: Record<string, unknown>;
}

interface ConsoleCommand {
    id: string;
    command: string;
    timestamp: string;
    result?: Record<string, unknown>;
    error?: string;
}

interface ConsoleBookmark {
    id: string;
    name: string;
    command: string;
    description?: string;
    timestamp: string;
}

interface AdvancedConsoleProps {
    height?: number;
    maxHeight?: number;
    showHeader?: boolean;
    showControls?: boolean;
    showFilters?: boolean;
    showBookmarks?: boolean;
    showHistory?: boolean;
    autoScroll?: boolean;
    maxLogs?: number;
}

export const AdvancedConsole: React.FC<AdvancedConsoleProps> = ({
    height = 400,
    maxHeight = 600,
    showHeader = true,
    showControls = true,
    showFilters = true,
    showBookmarks = true,
    showHistory = true,
    autoScroll = true,
    maxLogs = 1000
}) => {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<ConsoleLog[]>([]);
    const [commands, setCommands] = useState<ConsoleCommand[]>([]);
    const [bookmarks, setBookmarks] = useState<ConsoleBookmark[]>([]);
    const [currentCommand, setCurrentCommand] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState<string>('all');
    const [filterSource, setFilterSource] = useState<string>('all');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showCommandHistory, setShowCommandHistory] = useState(false);
    const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [autoCompleteSuggestions, setAutoCompleteSuggestions] = useState<string[]>([]);
    const [showAutoComplete, setShowAutoComplete] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const commandInputRef = useRef<HTMLInputElement>(null);

    // Available commands for auto-complete
    const availableCommands = [
        '/help', '/clear', '/status', '/refresh', '/health', '/uptime',
        '/stats', '/logs', '/export', '/search', '/tail', '/grep',
        '/filter', '/bookmark', '/history', '/settings', '/metrics',
        '/services', '/api', '/token', '/theme', '/time', '/calc'
    ];

    // Initialize WebSocket connection
    useEffect(() => {
        const connectWebSocket = () => {
            try {
                const wsUrl = `ws://localhost:8084/ws/logs`;
                wsRef.current = new WebSocket(wsUrl);

                wsRef.current.onopen = () => {
                    setIsConnected(true);
                    addLog('info', 'Connected to log stream server', 'system');
                };

                wsRef.current.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        handleWebSocketMessage(data);
                    } catch (error) {
                        console.error('Failed to parse WebSocket message:', error);
                    }
                };

                wsRef.current.onclose = () => {
                    setIsConnected(false);
                    addLog('warn', 'Disconnected from log stream server', 'system');

                    // Attempt to reconnect after 3 seconds
                    setTimeout(connectWebSocket, 3000);
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    addLog('error', 'WebSocket connection error', 'system');
                    addLog('error', `WebSocket error: ${error.message || 'Unknown error'}`, 'system');
                };
            } catch (error) {
                console.error('Failed to connect to WebSocket:', error);
                addLog('error', 'Failed to connect to log stream server', 'system');
            }
        };

        connectWebSocket();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (autoScroll && !isPaused) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll, isPaused]);

    // Filter logs based on search and filters
    const filteredLogs = logs.filter(log => {
        // Level filter
        if (filterLevel !== 'all' && log.level !== filterLevel) {
            return false;
        }

        // Source filter
        if (filterSource !== 'all' && log.source !== filterSource) {
            return false;
        }

        // Search filter
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            return log.message.toLowerCase().includes(searchLower) ||
                log.source?.toLowerCase().includes(searchLower);
        }

        return true;
    });

    // Handle WebSocket messages
    const handleWebSocketMessage = (data: Record<string, unknown>) => {
    };

    // Add log to the logs array
    const addLog = useCallback((level: ConsoleLog['level'], message: string, source?: string, metadata?: Record<string, unknown>) => {
        const newLog: ConsoleLog = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            level,
            message,
            source,
            metadata
        };

        setLogs(prev => {
            const updated = [newLog, ...prev];
            return updated.slice(0, maxLogs);
        });
    }, [maxLogs]);

    // Add command to command history
    const addCommand = useCallback((command: string, result?: Record<string, unknown>, error?: string) => {
        const newCommand: ConsoleCommand = {
            id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            command,
            timestamp: new Date().toISOString(),
            result,
            error
        };

        setCommands(prev => [newCommand, ...prev].slice(0, 100));

        // Add to command history for auto-complete
        if (command && !commandHistory.includes(command)) {
            setCommandHistory(prev => [command, ...prev].slice(0, 50));
        }
    }, [commandHistory]);

    // Execute command
    const executeCommand = useCallback((command: string) => {
        if (!command.trim()) return;

        // Add to command history
        if (!commandHistory.includes(command)) {
            setCommandHistory(prev => [command, ...prev].slice(0, 50));
        }

        // Add command to logs
        addLog('info', `$ ${command}`, 'user');

        // Send command to WebSocket server
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'command',
                data: {
                    command: command.replace(/^\//, ''), // Remove leading slash
                    args: command.split(' ').slice(1)
                }
            }));
        } else {
            // Fallback to local command execution
            executeLocalCommand(command);
        }

        setCurrentCommand('');
        setHistoryIndex(-1);
        setShowAutoComplete(false);
    }, [addLog, commandHistory]);

    // Execute local commands
    const executeLocalCommand = useCallback((command: string) => {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case '/help':
                showHelp();
                break;
            case '/clear':
                setLogs([]);
                // Force re-render by creating a new array reference
                setTimeout(() => {
                    addLog('success', 'Console cleared', 'system');
                }, 10);
                break;
            case '/export':
                exportLogs();
                break;
            case '/bookmark':
                if (args[0]) {
                    addBookmark(args[0], command);
                } else {
                    addLog('error', 'Usage: /bookmark <name>', 'system');
                }
                break;
            case '/status':
                showSystemStatus();
                break;
            case '/grep':
                if (args[0]) {
                    searchWithPattern(args.join(' '));
                } else {
                    addLog('error', 'Usage: /grep <pattern>', 'system');
                }
                break;
            case '/tail':
                const tailCount = args[0] ? parseInt(args[0]) : 10;
                showLastLogs(tailCount);
                break;
            case '/search':
                if (args[0]) {
                    searchInLogs(args.join(' '));
                } else {
                    addLog('error', 'Usage: /search <term>', 'system');
                }
                break;
            case '/metrics':
                showMetrics();
                break;
            case '/services':
                showServices();
                break;
            case '/health':
                showHealthCheck();
                break;
            case '/time':
                addLog('info', `Current time: ${new Date().toLocaleString()}`, 'system');
                break;
            case '/calc':
                if (args[0]) {
                    try {
                        // Simple calculator for basic expressions
                        const result = Function('"use strict"; return (' + args.join(' ') + ')')();
                        addLog('info', `Result: ${result}`, 'system');
                    } catch (error) {
                        addLog('error', `Invalid expression: ${args.join(' ')}`, 'system');
                    }
                } else {
                    addLog('error', 'Usage: /calc <expression>', 'system');
                }
                break;
            case '/theme':
                if (args[0] === 'toggle') {
                    // This would require theme context integration
                    addLog('info', 'Theme toggle functionality requires theme context integration', 'system');
                } else {
                    addLog('error', 'Usage: /theme toggle', 'system');
                }
                break;
            default:
                addLog('warn', `Unknown command: ${cmd}. Type /help for available commands.`, 'system');
        }
    }, [addLog]);

    // Show help
    const showHelp = useCallback(() => {
        const helpText = `
═══════════════════════════════════════════════════════════════════════════════
📋 ADVANCED CONSOLE COMMANDS
═══════════════════════════════════════════════════════════════════════════════

🔧 SYSTEM COMMANDS:
  /status         - Show complete system status
  /refresh        - Refresh all dashboard data
  /health         - Check service health
  /uptime         - Show system uptime

📊 DATA COMMANDS:
  /stats          - Show chat statistics
  /logs [filter]  - Show logs with optional filter
  /export         - Export console logs as JSON
  /search <term>  - Search logs for specific term

🎮 CONSOLE COMMANDS:
  /clear          - Clear console
  /bookmark <name>- Save current command as bookmark
  /history        - Show command history
  /filter         - Show filter options
  /settings       - Console settings

🔍 ADVANCED COMMANDS:
  /grep <pattern> - Search logs using regex pattern
  /tail [n]       - Show last n log entries
  /metrics        - Show performance metrics
  /services       - Show service status

═══════════════════════════════════════════════════════════════════════════════
    `;

        helpText.split('\n').forEach(line => {
            addLog('info', line, 'system');
        });
    }, [addLog]);

    // Export logs
    const exportLogs = useCallback(() => {
        const exportData = {
            logs: filteredLogs,
            commands: commands,
            bookmarks: bookmarks,
            timestamp: new Date().toISOString(),
            filters: {
                level: filterLevel,
                source: filterSource,
                search: searchTerm
            }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `console-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        addLog('success', 'Console data exported successfully', 'system');
    }, [filteredLogs, commands, bookmarks, filterLevel, filterSource, searchTerm, addLog]);

    // Add bookmark
    const addBookmark = useCallback((name: string, command: string) => {
        const newBookmark: ConsoleBookmark = {
            id: `bookmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            command,
            timestamp: new Date().toISOString()
        };

        setBookmarks(prev => [...prev, newBookmark]);
        addLog('success', `Bookmark added: ${name}`, 'system');
    }, [addLog]);

    // Show system status
    const showSystemStatus = useCallback(() => {
        addLog('info', '═════════════════════════════════════════════════════════', 'system');
        addLog('info', '📊 SYSTEM STATUS REPORT', 'system');
        addLog('info', '═════════════════════════════════════════════════', 'system');
        addLog('info', `🌐 WebSocket:    ${isConnected ? '🟢 connected' : '🔴 disconnected'}`, 'system');
        addLog('info', `📊 Console:      ${isPaused ? '⏸️ paused' : '▶️ streaming'}`, 'system');
        addLog('info', `📝 Logs:        ${logs.length} total, ${filteredLogs.length} filtered`, 'system');
        addLog('info', `🔖 Bookmarks:   ${bookmarks.length} saved`, 'system');
        addLog('info', `📚 History:     ${commandHistory.length} commands`, 'system');
        addLog('info', `⏰ Uptime:      ${Math.floor(performance.now() / 1000 / 60)}m`, 'system');
        // Type assertion for performance.memory (browser-specific API)
        const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const memoryMB = perfMemory?.usedJSHeapSize ?
            (perfMemory.usedJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A';
        addLog('info', `💾 Memory:      ${memoryMB}MB`, 'system');
        addLog('info', '═════════════════════════════════════════════════════════', 'system');
    }, [isConnected, isPaused, logs.length, filteredLogs.length, bookmarks.length, commandHistory.length, addLog]);

    // Search with regex pattern
    const searchWithPattern = useCallback((pattern: string) => {
        try {
            const regex = new RegExp(pattern, 'i');
            const matches = logs.filter(log =>
                regex.test(log.message) || regex.test(log.source || '')
            );

            addLog('info', `Found ${matches.length} matches for pattern: ${pattern}`, 'system');
            addLog('info', '─────────────────────────────────────────────────────────', 'system');

            matches.slice(0, 10).forEach(log => {
                addLog('info', `[${log.level.toUpperCase()}] ${log.message}`, 'system');
            });

            if (matches.length > 10) {
                addLog('info', `... and ${matches.length - 10} more matches`, 'system');
            }
        } catch (error) {
            addLog('error', `Invalid regex pattern: ${pattern}`, 'system');
        }
    }, [logs, addLog]);

    // Show last logs
    const showLastLogs = useCallback((count: number) => {
        const lastLogs = logs.slice(0, count);
        addLog('info', `Last ${lastLogs.length} log entries:`, 'system');
        addLog('info', '─────────────────────────────────────────────────────────', 'system');

        lastLogs.forEach(log => {
            addLog(log.level, `[${log.level.toUpperCase()}] ${log.message}`, log.source);
        });
    }, [logs, addLog]);

    // Search in logs
    const searchInLogs = useCallback((term: string) => {
        const searchLower = term.toLowerCase();
        const matches = logs.filter(log =>
            log.message.toLowerCase().includes(searchLower) ||
            log.source?.toLowerCase().includes(searchLower)
        );

        addLog('info', `Found ${matches.length} matches for: ${term}`, 'system');
        addLog('info', '─────────────────────────────────────────────────────────', 'system');

        matches.slice(0, 10).forEach(log => {
            addLog(log.level, `[${log.level.toUpperCase()}] ${log.message}`, log.source);
        });

        if (matches.length > 10) {
            addLog('info', `... and ${matches.length - 10} more matches`, 'system');
        }
    }, [logs, addLog]);

    // Show metrics
    const showMetrics = useCallback(() => {
        const levelCounts = logs.reduce((acc, log) => {
            acc[log.level] = (acc[log.level] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const sourceCounts = logs.reduce((acc, log) => {
            const source = log.source || 'unknown';
            acc[source] = (acc[source] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        addLog('info', '═════════════════════════════════════════════════════════', 'system');
        addLog('info', '📊 PERFORMANCE METRICS', 'system');
        addLog('info', '═════════════════════════════════════════════════', 'system');
        addLog('info', '📈 LOG LEVELS:', 'system');
        Object.entries(levelCounts).forEach(([level, count]) => {
            const percentage = ((count / logs.length) * 100).toFixed(1);
            addLog('info', `  ${level.toUpperCase()}: ${count} (${percentage}%)`, 'system');
        });

        addLog('info', '📂 SOURCES:', 'system');
        Object.entries(sourceCounts).forEach(([source, count]) => {
            const percentage = ((count / logs.length) * 100).toFixed(1);
            addLog('info', `  ${source.toUpperCase()}: ${count} (${percentage}%)`, 'system');
        });

        addLog('info', '⚡ PERFORMANCE:', 'system');
        // Type assertion for performance.memory (browser-specific API)
        const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const memoryMB = perfMemory?.usedJSHeapSize ?
            (perfMemory.usedJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A';
        addLog('info', `  Memory Usage: ${memoryMB}MB`, 'system');
        addLog('info', `  Total Logs: ${logs.length}`, 'system');
        addLog('info', `  Filtered: ${filteredLogs.length}`, 'system');
        addLog('info', '═════════════════════════════════════════════════════════', 'system');
    }, [logs, filteredLogs, addLog]);

    // Show services
    const showServices = useCallback(() => {
        addLog('info', '═════════════════════════════════════════════════════════', 'system');
        addLog('info', '🔧 SERVICE STATUS', 'system');
        addLog('info', '═════════════════════════════════════════════════', 'system');
        addLog('info', `🌐 WebSocket Service: ${isConnected ? '🟢 Running' : '🔴 Stopped'}`, 'system');
        addLog('info', '📊 Console Service:  🟢 Running', 'system');
        addLog('info', '🔍 Filter Service:  🟢 Running', 'system');
        addLog('info', '📝 Log Service:     🟢 Running', 'system');
        addLog('info', '🔖 Bookmark Service: 🟢 Running', 'system');
        addLog('info', '📚 History Service:  🟢 Running', 'system');
        addLog('info', '═════════════════════════════════════════════════════════', 'system');
    }, [isConnected, addLog]);

    // Show health check
    const showHealthCheck = useCallback(() => {
        const issues = [];

        if (!isConnected) {
            issues.push('WebSocket connection lost');
        }

        if (logs.length > 5000) {
            issues.push('High memory usage - too many logs');
        }

        // Type assertion for performance.memory (browser-specific API)
        const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const memoryMB = perfMemory?.usedJSHeapSize ?
            (perfMemory.usedJSHeapSize / 1024 / 1024) : 0;
        if (memoryMB > 100) {
            issues.push('High memory consumption');
        }

        addLog('info', '═════════════════════════════════════════════════════════', 'system');
        addLog('info', '🏥 HEALTH CHECK', 'system');
        addLog('info', '═════════════════════════════════════════════════', 'system');

        if (issues.length === 0) {
            addLog('success', '✅ All systems operational', 'system');
        } else {
            addLog('warn', `⚠️  ${issues.length} issue(s) detected:`, 'system');
            issues.forEach(issue => {
                addLog('warn', `  • ${issue}`, 'system');
            });
        }

        addLog('info', '═════════════════════════════════════════════════════════', 'system');
    }, [isConnected, logs.length, addLog]);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && currentCommand.trim()) {
            executeCommand(currentCommand.trim());
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setCurrentCommand('');
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            handleAutoComplete();
        } else if (e.key === 'Escape') {
            setShowAutoComplete(false);
        }
    }, [currentCommand, executeCommand, historyIndex, commandHistory]);

    // Handle auto-complete
    const handleAutoComplete = useCallback(() => {
        if (!currentCommand.startsWith('/')) return;

        const matches = availableCommands.filter(cmd =>
            cmd.startsWith(currentCommand) && cmd !== currentCommand
        );

        if (matches.length > 0) {
            setAutoCompleteSuggestions(matches);
            setShowAutoComplete(true);
        }
    }, [currentCommand]);

    // Get log level color
    const getLogLevelColor = (level: ConsoleLog['level']) => {
        switch (level) {
            case 'error': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500';
            case 'warn': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-500';
            case 'success': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500';
            case 'info': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400';
            case 'debug': return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-l-2 border-gray-400';
            default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-l-2 border-gray-400';
        }
    };

    // Get source color
    const getSourceColor = (source?: string) => {
        switch (source) {
            case 'user': return 'bg-purple-500/20 text-purple-600 dark:text-purple-400';
            case 'system': return 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400';
            case 'backend': return 'bg-blue-500/20 text-blue-600 dark:text-blue-400';
            case 'frontend': return 'bg-green-500/20 text-green-600 dark:text-green-400';
            default: return 'bg-gray-500/20 text-gray-600 dark:text-gray-400';
        }
    };

    return (
        <Card className="border-0 shadow-sm">
            {showHeader && (
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Terminal className="h-4 w-4" />
                            <CardTitle className="text-sm font-semibold">Advanced Console</CardTitle>
                            <Badge variant={isConnected ? 'default' : 'error'} className="text-xs">
                                {isConnected ? t('terminal.connected') : t('terminal.offline')}
                            </Badge>
                            <Badge variant={isPaused ? 'secondary' : 'default'} className="text-xs">
                                {isPaused ? t('terminal.paused') : t('terminal.streaming')}
                            </Badge>
                            <span className="text-xs text-gray-500">
                                ({filteredLogs.length} / {logs.length} logs)
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            {showControls && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsPaused(!isPaused)}
                                        className="h-6 px-2 text-xs"
                                    >
                                        {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setLogs([])}
                                        className="h-6 px-2 text-xs"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={exportLogs}
                                        className="h-6 px-2 text-xs"
                                    >
                                        <Download className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsMaximized(!isMaximized)}
                                        className="h-6 px-2 text-xs"
                                    >
                                        {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {showFilters && (
                        <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center gap-1">
                                <Search className="h-3 w-3 text-gray-500" />
                                <Input
                                    type="text"
                                    placeholder={t('terminal.placeholders.searchLogs')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-6 text-xs w-40"
                                />
                            </div>

                            <select
                                value={filterLevel}
                                onChange={(e) => setFilterLevel(e.target.value)}
                                className="h-6 text-xs px-2 border rounded"
                            >
                                <option value="all">{t('terminal.placeholders.allLevels')}</option>
                                <option value="error">{t('terminal.status.errorLevel')}</option>
                                <option value="warn">{t('terminal.status.warningLevel')}</option>
                                <option value="info">{t('terminal.status.infoLevel')}</option>
                                <option value="debug">{t('terminal.status.debugLevel')}</option>
                            </select>

                            <select
                                value={filterSource}
                                onChange={(e) => setFilterSource(e.target.value)}
                                className="h-6 text-xs px-2 border rounded"
                            >
                                <option value="all">{t('terminal.placeholders.allSources')}</option>
                                <option value="backend">{t('terminal.status.backendSource')}</option>
                                <option value="frontend">{t('terminal.status.frontendSource')}</option>
                                <option value="system">{t('terminal.status.systemSource')}</option>
                                <option value="user">{t('terminal.status.userSource')}</option>
                            </select>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                className="h-6 px-2 text-xs"
                            >
                                <Filter className="h-3 w-3" />
                                {showAdvancedFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>

                            {showBookmarks && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowBookmarksPanel(!showBookmarksPanel)}
                                    className="h-6 px-2 text-xs"
                                >
                                    <Bookmark className="h-3 w-3" />
                                </Button>
                            )}

                            {showHistory && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowCommandHistory(!showCommandHistory)}
                                    className="h-6 px-2 text-xs"
                                >
                                    <History className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    )}
                </CardHeader>
            )}

            <CardContent className="pt-0">
                {/* Console Output */}
                <div
                    className="relative backdrop-blur-xl p-4 rounded-xl font-mono text-xs overflow-auto border shadow-2xl transition-all duration-300
                     bg-white/20 dark:bg-black/40
                     border-white/30 dark:border-white/10
                     text-gray-800 dark:text-gray-100"
                    style={{
                        height: isMaximized ? '80vh' : `${height}px`,
                        maxHeight: isMaximized ? '80vh' : `${maxHeight}px`
                    }}
                >
                    {filteredLogs.length > 0 ? (
                        filteredLogs.map((log, index) => (
                            <div key={log.id} className={`mb-0.5 font-mono relative z-10 p-1 rounded text-[10px] leading-tight ${getLogLevelColor(log.level)}`}>
                                <span className="text-gray-500 dark:text-gray-400 select-none font-medium text-[9px]">
                                    [{new Date(log.timestamp).toLocaleTimeString()}]
                                </span>
                                {log.source && (
                                    <span className={`ml-2 text-[9px] px-1 py-0.5 rounded-full ${getSourceColor(log.source)}`}>
                                        [{log.source.toUpperCase()}]
                                    </span>
                                )}
                                <span className="ml-2">{log.message}</span>
                            </div>
                        ))
                    ) : (
                        <div className="text-gray-500 dark:text-gray-600 text-center py-8">
                            {searchTerm || filterLevel !== 'all' || filterSource !== 'all' ?
                                'No logs match current filters.' :
                                'Console output will appear here...'}
                        </div>
                    )}
                    <div ref={logsEndRef} />
                </div>

                {/* Command Input */}
                <div className="mt-3 border-t border-white/20 dark:border-white/10 pt-3">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 font-mono text-sm font-medium">$</span>
                        <div className="relative flex-1">
                            <Input
                                ref={commandInputRef}
                                type="text"
                                value={currentCommand}
                                onChange={(e) => {
                                    setCurrentCommand(e.target.value);
                                    setHistoryIndex(-1);
                                }}
                                onKeyDown={handleKeyDown}
                                onFocus={() => {
                                    if (currentCommand.startsWith('/')) {
                                        handleAutoComplete();
                                    }
                                }}
                                placeholder={t('terminal.status.commandPlaceholder')}
                                className="w-full px-3 py-2 pr-10 text-sm font-mono rounded-lg outline-none transition-all duration-300
                           bg-white/30 dark:bg-black/30
                           border border-white/40 dark:border-white/20
                           text-gray-800 dark:text-gray-200
                           placeholder-gray-500 dark:placeholder-gray-400
                           focus:bg-white/40 dark:focus:bg-black/40
                           focus:border-blue-500/50 dark:focus:border-blue-400/50
                           focus:shadow-lg focus:shadow-blue-500/20 dark:focus:shadow-blue-400/20
                           backdrop-blur-sm"
                            />
                            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 pointer-events-none" />

                            {/* Auto-complete suggestions */}
                            {showAutoComplete && autoCompleteSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50">
                                    {autoCompleteSuggestions.map((suggestion, index) => (
                                        <div
                                            key={suggestion}
                                            className="px-3 py-2 text-sm font-mono hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                            onClick={() => {
                                                setCurrentCommand(suggestion);
                                                setShowAutoComplete(false);
                                                commandInputRef.current?.focus();
                                            }}
                                        >
                                            {suggestion}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {commandHistory.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500">
                            Press ↑/↓ to navigate command history ({commandHistory.length} commands)
                        </div>
                    )}
                </div>

                {/* Bookmarks Panel */}
                {showBookmarksPanel && bookmarks.length > 0 && (
                    <div className="mt-3 border-t border-white/20 dark:border-white/10 pt-3">
                        <h4 className="text-sm font-semibold mb-2">Bookmarks</h4>
                        <div className="space-y-1">
                            {bookmarks.map((bookmark) => (
                                <div key={bookmark.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                    <div>
                                        <div className="font-medium text-sm">{bookmark.name}</div>
                                        <div className="text-xs text-gray-500 font-mono">{bookmark.command}</div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setCurrentCommand(bookmark.command);
                                            commandInputRef.current?.focus();
                                        }}
                                        className="h-6 px-2 text-xs"
                                    >
                                        Execute
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Command History Panel */}
                {showCommandHistory && commandHistory.length > 0 && (
                    <div className="mt-3 border-t border-white/20 dark:border-white/10 pt-3">
                        <h4 className="text-sm font-semibold mb-2">Command History</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {commandHistory.map((cmd, index) => (
                                <div
                                    key={index}
                                    className="p-2 bg-gray-50 dark:bg-gray-800 rounded font-mono text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => {
                                        setCurrentCommand(cmd);
                                        commandInputRef.current?.focus();
                                    }}
                                >
                                    {cmd}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default AdvancedConsole;