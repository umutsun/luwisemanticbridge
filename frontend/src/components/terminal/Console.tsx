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

interface ConsoleProps {
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

export const Console: React.FC<ConsoleProps> = ({
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
    const [userScrolled, setUserScrolled] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const sseRef = useRef<EventSource | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const commandInputRef = useRef<HTMLInputElement>(null);
    const consoleContainerRef = useRef<HTMLDivElement>(null);
    const connectionAttemptRef = useRef(0);

    // Available commands for auto-complete
    const availableCommands = [
        '/help', '/clear', '/status', '/refresh', '/health', '/uptime',
        '/stats', '/logs', '/export', '/search', '/tail', '/grep',
        '/filter', '/bookmark', '/history', '/settings', '/metrics',
        '/services', '/api', '/token', '/theme', '/time', '/calc',
        // DevOps commands
        '/deploy', '/gitpull', '/pm2', '/nginx', '/restart', '/build'
    ];

    // Initialize connection (WebSocket with SSE fallback)
    useEffect(() => {
        const connectWebSocket = () => {
            try {
                // Construct WebSocket URL based on current host
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                const wsUrl = `${protocol}//${host}/ws/logs`;

                wsRef.current = new WebSocket(wsUrl);
                connectionAttemptRef.current = 0;

                wsRef.current.onopen = () => {
                    setIsConnected(true);
                    addLog('info', 'Connected to console logs via WebSocket', 'system');
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
                    addLog('warn', 'WebSocket disconnected, attempting to reconnect...', 'system');

                    // Attempt to reconnect after 3 seconds (max 3 attempts)
                    connectionAttemptRef.current++;
                    if (connectionAttemptRef.current < 3) {
                        setTimeout(connectWebSocket, 3000);
                    } else {
                        // Fallback to SSE after WebSocket attempts fail
                        addLog('warn', 'WebSocket failed, switching to SSE streaming...', 'system');
                        connectSSE();
                    }
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    addLog('error', 'WebSocket connection error', 'system');

                    // After first error, try to fallback to SSE
                    if (connectionAttemptRef.current === 0) {
                        wsRef.current?.close();
                    }
                };
            } catch (error) {
                console.error('Failed to connect to WebSocket:', error);
                addLog('warn', 'WebSocket unavailable, trying SSE...', 'system');
                setTimeout(connectSSE, 1000);
            }
        };

        const connectSSE = () => {
            try {
                const apiUrl = `/api/v2/system/stream`;
                sseRef.current = new EventSource(apiUrl);

                sseRef.current.onopen = () => {
                    setIsConnected(true);
                    addLog('info', 'Connected to console logs via SSE', 'system');
                };

                sseRef.current.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        // Convert SSE format to log format
                        if (data.type === 'log' || data.message) {
                            addLog(
                                data.level || 'info',
                                data.message || data.data?.message || event.data,
                                data.source || 'system'
                            );
                        }
                    } catch (error) {
                        // If not JSON, treat as plain log message
                        if (event.data && event.data.trim()) {
                            addLog('info', event.data, 'system');
                        }
                    }
                };

                sseRef.current.onerror = (error) => {
                    console.error('SSE error:', error);
                    setIsConnected(false);
                    addLog('error', 'SSE connection error - console logs unavailable', 'system');
                    sseRef.current?.close();
                };
            } catch (error) {
                console.error('Failed to connect to SSE:', error);
                addLog('error', 'Unable to connect to console logs', 'system');
            }
        };

        connectWebSocket();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (sseRef.current) {
                sseRef.current.close();
            }
        };
    }, []);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (autoScroll && !isPaused && !userScrolled) {
            // Use a small timeout to ensure DOM is updated
            const timeoutId = setTimeout(() => {
                logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);

            return () => clearTimeout(timeoutId);
        }
    }, [logs, autoScroll, isPaused, userScrolled]);

    // Detect user scroll to disable auto-scroll temporarily
    useEffect(() => {
        const container = consoleContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50; // 50px threshold

            if (!isAtBottom) {
                setUserScrolled(true);
            } else {
                setUserScrolled(false);
            }
        };

        container.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, []);

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

    // Add log to the logs array (defined early to be used in handlers)
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

    // Handle WebSocket messages
    const handleWebSocketMessage = useCallback((data: Record<string, unknown>) => {
        switch (data.type) {
            case 'connected':
                const connectedData = data as unknown as ConnectedMessage;
                addLog('info', `Connected to log stream server (Client: ${connectedData.data.clientId})`, 'system');
                break;
            case 'log':
                const logData = data as unknown as LogMessage;
                addLog(logData.data.level, logData.data.message, logData.data.source, logData.data.metadata);
                break;
            case 'recent_logs':
                const recentLogsData = data as unknown as RecentLogsMessage;
                recentLogsData.data.forEach(log => {
                    addLog(log.level, log.message, log.source, log.metadata);
                });
                break;
            case 'command_result':
                const commandResultData = data as unknown as CommandResultMessage;
                addLog('info', `Command result: ${commandResultData.data.command}`, 'system');
                if (commandResultData.data.result) {
                    if (typeof commandResultData.data.result === 'object') {
                        Object.entries(commandResultData.data.result).forEach(([key, value]) => {
                            addLog('info', `  ${key}: ${JSON.stringify(value)}`, 'system');
                        });
                    } else {
                        addLog('info', `  ${commandResultData.data.result}`, 'system');
                    }
                }
                break;
            case 'command_error':
                const commandErrorData = data as unknown as CommandErrorMessage;
                addLog('error', `Command error: ${commandErrorData.data.error}`, 'system');
                break;
            case 'metrics_update':
                const metricsData = data as unknown as MetricsUpdateMessage;
                if (metricsData.data.cpu) {
                    addLog('info', `CPU: ${metricsData.data.cpu.user}%`, 'system');
                }
                if (metricsData.data.memory) {
                    const memoryMB = (metricsData.data.memory.heapUsed / 1024 / 1024).toFixed(2);
                    addLog('info', `Memory: ${memoryMB}MB`, 'system');
                }
                break;
            case 'system_stats_update':
                const systemStatsData = data as unknown as SystemStatsUpdateMessage;
                addLog('info', `Total logs: ${systemStatsData.data.totalLogs}, Connected clients: ${systemStatsData.data.connectedClients}`, 'system');
                break;
            case 'ping':
                // Handle ping messages silently
                break;
            case 'pong':
                // Handle pong messages silently
                break;
            default:
                console.warn('Unknown WebSocket message type:', data.type);
        }
    }, [addLog]);

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
                    addLog('success', t('terminal.status.consoleCleared'), 'system');
                }, 10);
                break;
            case '/export':
                exportLogs();
                break;
            case '/bookmark':
                if (args[0]) {
                    addBookmark(args[0], command);
                } else {
                    addLog('error', t('terminal.status.usageBookmark'), 'system');
                }
                break;
            case '/status':
                showSystemStatus();
                break;
            case '/grep':
                if (args[0]) {
                    searchWithPattern(args.join(' '));
                } else {
                    addLog('error', t('terminal.status.usageGrep'), 'system');
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
                    addLog('error', t('terminal.status.usageSearch'), 'system');
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
                addLog('info', t('terminal.currentTime'), 'system');
                break;
            case '/calc':
                if (args[0]) {
                    try {
                        // Simple calculator for basic expressions
                        const result = Function('"use strict"; return (' + args.join(' ') + ')')();
                        addLog('info', t('terminal.calc.result', { result }), 'system');
                    } catch (error) {
                        addLog('error', t('terminal.status.invalidExpression', { expression: args.join(' ') }), 'system');
                    }
                } else {
                    addLog('error', t('terminal.status.usageCalc'), 'system');
                }
                break;
            case '/theme':
                if (args[0] === 'toggle') {
                    // This would require theme context integration
                    addLog('info', t('terminal.status.themeToggle'), 'system');
                } else {
                    addLog('error', t('terminal.status.themeUsage'), 'system');
                }
                break;
            // DevOps Commands
            case '/deploy':
                executeDevOpsCommand('deploy', args[0] || 'hotfix');
                break;
            case '/gitpull':
                executeDevOpsCommand('gitpull');
                break;
            case '/pm2':
                if (args[0] === 'status') {
                    executeDevOpsCommand('pm2status');
                } else if (args[0] === 'restart') {
                    executeDevOpsCommand('pm2restart', args[1] || 'all');
                } else {
                    addLog('info', 'Usage: /pm2 status | /pm2 restart [backend|frontend|python|all]', 'system');
                }
                break;
            case '/nginx':
                if (args[0] === 'test') {
                    executeDevOpsCommand('nginxtest');
                } else if (args[0] === 'reload') {
                    executeDevOpsCommand('nginxreload');
                } else {
                    addLog('info', 'Usage: /nginx test | /nginx reload', 'system');
                }
                break;
            case '/restart':
                executeDevOpsCommand('pm2restart', args[0] || 'all');
                break;
            case '/build':
                executeDevOpsCommand('deploy', 'frontend');
                break;
            default:
                addLog('warn', t('terminal.status.unknownCommand', { cmd: cmd }), 'system');
        }
    }, [addLog]);

    // Execute DevOps commands via API
    const executeDevOpsCommand = useCallback(async (action: string, arg?: string) => {
        const API_BASE = '/api/v2/devops';

        try {
            switch (action) {
                case 'deploy':
                    addLog('info', `🚀 Starting ${arg} deploy...`, 'devops');
                    const deployRes = await fetch(`${API_BASE}/self/deploy?deploy_type=${arg}`, { method: 'POST' });
                    const deployData = await deployRes.json();
                    if (deployData.success) {
                        addLog('success', `✅ Deploy completed! Duration: ${(deployData.duration_ms / 1000).toFixed(1)}s`, 'devops');
                        if (deployData.git_commit_after) {
                            addLog('info', `📌 Commit: ${deployData.git_commit_after.substring(0, 7)}`, 'devops');
                        }
                    } else {
                        addLog('error', `❌ Deploy failed: ${deployData.error || 'Unknown error'}`, 'devops');
                    }
                    break;

                case 'gitpull':
                    addLog('info', '📥 Running git pull...', 'devops');
                    const pullRes = await fetch(`${API_BASE}/self/deploy?deploy_type=hotfix`, { method: 'POST' });
                    const pullData = await pullRes.json();
                    if (pullData.success) {
                        addLog('success', '✅ Git pull completed!', 'devops');
                    } else {
                        addLog('error', `❌ Git pull failed: ${pullData.error}`, 'devops');
                    }
                    break;

                case 'pm2status':
                    addLog('info', '📊 Fetching PM2 status...', 'devops');
                    const pm2Res = await fetch(`${API_BASE}/self/pm2/status`);
                    const pm2Data = await pm2Res.json();
                    if (pm2Data.success && pm2Data.services) {
                        addLog('info', '═══════════════════════════════════════════════', 'devops');
                        addLog('info', '🔧 PM2 SERVICES', 'devops');
                        addLog('info', '═══════════════════════════════════════════════', 'devops');
                        pm2Data.services.forEach((svc: any) => {
                            const status = svc.status === 'online' ? '🟢' : '🔴';
                            addLog('info', `${status} ${svc.name}: ${svc.status} (CPU: ${svc.cpu}%, Mem: ${(svc.memory / 1024 / 1024).toFixed(0)}MB)`, 'devops');
                        });
                    } else {
                        addLog('error', '❌ Failed to fetch PM2 status', 'devops');
                    }
                    break;

                case 'pm2restart':
                    addLog('info', `🔄 Restarting ${arg}...`, 'devops');
                    const restartRes = await fetch(`${API_BASE}/self/pm2/restart/${arg}`, { method: 'POST' });
                    const restartData = await restartRes.json();
                    if (restartData.success) {
                        addLog('success', `✅ ${arg} restarted successfully!`, 'devops');
                    } else {
                        addLog('error', `❌ Restart failed: ${restartData.error || 'Unknown error'}`, 'devops');
                    }
                    break;

                case 'nginxtest':
                    addLog('info', '🔍 Testing Nginx config...', 'devops');
                    const testRes = await fetch(`${API_BASE}/self/nginx/test`, { method: 'POST' });
                    const testData = await testRes.json();
                    if (testData.valid) {
                        addLog('success', '✅ Nginx config is valid!', 'devops');
                    } else {
                        addLog('error', '❌ Nginx config has errors:', 'devops');
                        addLog('error', testData.output, 'devops');
                    }
                    break;

                case 'nginxreload':
                    addLog('info', '🔄 Reloading Nginx...', 'devops');
                    const reloadRes = await fetch(`${API_BASE}/self/nginx/reload`, { method: 'POST' });
                    const reloadData = await reloadRes.json();
                    if (reloadData.success) {
                        addLog('success', '✅ Nginx reloaded successfully!', 'devops');
                    } else {
                        addLog('error', `❌ Nginx reload failed: ${reloadData.error}`, 'devops');
                    }
                    break;

                default:
                    addLog('error', `Unknown DevOps action: ${action}`, 'devops');
            }
        } catch (error: any) {
            addLog('error', `❌ DevOps command failed: ${error.message}`, 'devops');
        }
    }, [addLog]);

    // Show help
    const showHelp = useCallback(() => {
        const helpText = `
═══════════════════════════════════════════════════════════════════════════════
${t('terminal.help.title')}
═══════════════════════════════════════════════════════════════════════════════

🔧 SYSTEM COMMANDS:
  /status         - ${t('terminal.help.status')}
  /refresh        - ${t('terminal.help.refresh')}
  /health         - ${t('terminal.help.health')}
  /uptime         - ${t('terminal.help.uptime')}

📊 DATA COMMANDS:
  /stats          - ${t('terminal.help.stats')}
  /logs [filter]  - ${t('terminal.help.logsUsage')}
  /export         - ${t('terminal.help.exportDesc')}
  /search <term>  - ${t('terminal.help.searchDesc')}

${t('terminal.help.consoleCommands')}
  /clear          - ${t('terminal.help.clearDesc')}
  /bookmark <name>- ${t('terminal.help.bookmarkUsage')}
  /history        - ${t('terminal.help.historyDesc')}
  /filter         - ${t('terminal.help.filterDesc')}
  /settings       - ${t('terminal.help.settingsDesc')}

${t('terminal.help.advancedCommands')}
  /grep <pattern> - ${t('terminal.help.grepDesc')}
  /tail [n]       - ${t('terminal.help.tailDesc')}
  /metrics        - ${t('terminal.help.metricsDesc')}
  /services       - ${t('terminal.help.servicesDesc')}

🚀 DEVOPS COMMANDS:
  /deploy [type]  - Deploy (full|hotfix|frontend|backend|python)
  /gitpull        - Quick git pull and restart
  /pm2 status     - Show PM2 service status
  /pm2 restart [s]- Restart service (backend|frontend|python|all)
  /nginx test     - Test Nginx configuration
  /nginx reload   - Reload Nginx
  /restart [s]    - Shortcut for /pm2 restart
  /build          - Shortcut for /deploy frontend

═══════════════════════════════════════════════════════════════════════════════
    `;

        helpText.split('\n').forEach(line => {
            addLog('info', line, 'system');
        });
    }, [addLog, t]);

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

        addLog('success', t('terminal.status.dataExported'), 'system');
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
        addLog('success', t('terminal.status.bookmarkAdded', { name }), 'system');
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
            case 'devops': return 'bg-orange-500/20 text-orange-600 dark:text-orange-400';
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
                            <CardTitle className="text-sm font-semibold">Console</CardTitle>
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
                            {t('terminal.status.navigateHistory', { count: commandHistory.length })}
                        </div>
                    )}
                </div>

                {/* Bookmarks Panel */}
                {showBookmarksPanel && bookmarks.length > 0 && (
                    <div className="mt-3 border-t border-white/20 dark:border-white/10 pt-3">
                        <h4 className="text-sm font-semibold mb-2">{t('terminal.bookmarks')}</h4>
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
                                        {t('common.execute')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Command History Panel */}
                {showCommandHistory && commandHistory.length > 0 && (
                    <div className="mt-3 border-t border-white/20 dark:border-white/10 pt-3">
                        <h4 className="text-sm font-semibold mb-2">{t('terminal.commandHistory')}</h4>
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

export default Console;