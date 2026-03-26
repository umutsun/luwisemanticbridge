'use client';

import debug from '@/lib/debug';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@/contexts/ConfigContext';
import { useAuth } from '@/contexts/AuthProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  Brain,
  ChevronDown,
  Home,
  Database,
  LogOut,
  User,
  Users,
  Settings,
  Settings2,
  MessageSquare,
  FileText,
  Globe,
  Languages,
  Menu,
  X,
  Monitor,
  Trash2,
  Hash,
  TrendingUp,
  Filter,
  CheckSquare,
  Square,
  Server,
  CircuitBoard,
  ListTodo
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationCenter from '@/components/NotificationCenter';
import { NotificationPanel } from '@/components/NotificationPanel';
import { getAppSettings } from '@/lib/api/settings';
import { API_BASE_URL } from '@/config/api.config';
import { safeJsonParse } from '@/lib/auth-fetch';


interface SystemStatus {
  database: {
    connected: boolean;
    size: string;
    documents: number;
    responseTime?: number;
    databaseName?: string;
    tableCount?: number;
  };
  redis: {
    connected: boolean;
    used_memory: string;
    responseTime?: number;
    keyCount?: number;
  };
  llmModel: {
    model: string;
    provider: string;
    active: boolean;
    displayName?: string;
  };
  embedder: {
    active: boolean;
    model: string;
    provider: string;
  };
  translationModel?: {
    active: boolean;
    model?: string;
    provider?: string;
  };
  overall?: {
    status: string;
    uptime: number;
    memory: {
      used: number;
      total: number;
    };
  };
}

export default function Header() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { config } = useConfig();
  const { user, token, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Get user from localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchSystemStatus();
      const interval = setInterval(fetchSystemStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);


  const fetchSystemStatus = async () => {
    if (!token) {
      console.warn('No token available, skipping system status fetch');
      return;
    }

    if (isConnecting) {
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 20;
        setConnectionProgress(Math.min(progress, 90));
        if (progress >= 90) {
          clearInterval(progressInterval);
        }
      }, 200);
    }

    try {
      // Use API_BASE_URL for proper cross-origin requests
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const [healthResponse, translationResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v2/health`, {
          headers,
          mode: 'cors',
          credentials: 'include'
        }),
        fetch(`${API_BASE_URL}/api/v2/settings?category=translation`, {
          headers,
          mode: 'cors',
          credentials: 'include'
        })
      ]);

      if (healthResponse.ok) {
        const healthData = await safeJsonParse(healthResponse);
        const translationData = translationResponse.ok ? await safeJsonParse(translationResponse) : null;

        if (!healthData) {
          console.warn('[SystemStatus] Failed to parse health data');
          setConnectionProgress(0);
          return;
        }

        // Extract database and redis info from health data
        // Backend sends: services.postgres and services.redis
        const dbData = {
          connected: healthData.services?.postgres?.status === 'connected',
          status: healthData.services?.postgres?.status,
          message: healthData.services?.postgres?.message
        };
        const redisData = {
          connected: healthData.services?.redis?.status === 'connected',
          status: healthData.services?.redis?.status,
          message: healthData.services?.redis?.message
        };

        setConnectionProgress(100);

        setTimeout(async () => {
          // Get settings first
          let settings = null;
          let databaseSettings = null;
          try {
            settings = await getAppSettings();
            debug.log('[SystemStatus] Settings loaded:', {
              activeChatModel: settings?.llmSettings?.activeChatModel,
              activeEmbeddingModel: settings?.llmSettings?.activeEmbeddingModel
            });

            // Fetch database settings separately
            const dbResponse = await fetch(`${API_BASE_URL}/api/v2/settings?category=database`, {
              headers,
              mode: 'cors',
              credentials: 'include'
            });
            if (dbResponse.ok) {
              databaseSettings = await safeJsonParse(dbResponse);
              if (databaseSettings) {
                debug.log('[SystemStatus] Database settings loaded:', databaseSettings);
              }
            }
          } catch (error) {
            console.warn('[SystemStatus] Could not fetch app settings:', error);
          }

          // Build comprehensive system status from both endpoints
          const dbService = healthData.services?.postgres || healthData.services?.database;
          const redisService = healthData.services?.redis;

          // Get database name - prioritize source DB from settings over master DB
          let databaseName = 'Unknown';
          debug.log('[SystemStatus] Database sources:', {
            databaseSettingsName: databaseSettings?.database?.name,
            settingsDbName: settings?.database?.name,
            healthDbName: healthData.services?.postgres?.database
          });

          // First priority: Source database from database settings (migration/transform target)
          if (databaseSettings && databaseSettings.database?.name) {
            databaseName = databaseSettings.database.name;
            debug.log('[SystemStatus] Using database from databaseSettings:', databaseName);
          } else if (settings && settings.database?.name) {
            databaseName = settings.database.name;
            debug.log('[SystemStatus] Using database from settings.database.name:', databaseName);
          } else if (healthData.services?.postgres?.database) {
            // Fallback: Master database from health endpoint
            databaseName = healthData.services.postgres.database;
            debug.log('[SystemStatus] Using database from health endpoint:', databaseName);
          }

          // Calculate total records and table count from database schema
          // Note: These are not available from /health/system endpoint
          const totalRecords = 0;
          const tableCount = 0;

          // Get LLM model information
          let llmModelInfo = {
            model: 'openai/gpt-4o-mini',
            provider: 'OpenAI',
            active: true,
            displayName: 'GPT-4o Mini'
          };

          try {
            if (settings && settings.llmSettings?.activeChatModel) {
              const modelParts = settings.llmSettings.activeChatModel.split('/');
              if (modelParts.length >= 2) {
                const provider = modelParts[0];
                const modelName = modelParts[1];

                // Create display name based on provider and model
                let displayName = modelName;
                if (provider === 'deepseek') {
                  displayName = modelName.includes('deepseek') ? 'Deepseek' : modelName;
                } else if (provider === 'openai') {
                  displayName = modelName.includes('gpt-4') ? 'GPT-4' : modelName.includes('gpt-3.5') ? 'GPT-3.5' : modelName;
                } else if (provider === 'gemini') {
                  displayName = modelName.includes('gemini') ? 'Gemini Pro' : modelName;
                } else if (provider === 'anthropic') {
                  displayName = modelName.includes('claude-3') ? 'Claude 3' : modelName;
                }

                llmModelInfo = {
                  model: settings.llmSettings.activeChatModel,
                  provider: provider.charAt(0).toUpperCase() + provider.slice(1),
                  active: true,
                  displayName: displayName
                };
              }
            }
          } catch (error) {
            // Silently handle the error to prevent console spam
            // The default llmModelInfo will be used instead
            console.warn('Could not fetch LLM settings, using defaults');
          }

          // Get embedding model from settings
          let embeddingModel = 'text-embedding-004'; // default
          let embeddingProvider = 'Google'; // default
          if (settings && settings.llmSettings?.activeEmbeddingModel) {
            const modelParts = settings.llmSettings.activeEmbeddingModel.split('/');
            if (modelParts.length >= 2) {
              embeddingProvider = modelParts[0].charAt(0).toUpperCase() + modelParts[0].slice(1);
              embeddingModel = modelParts[1];
            }
          } else if (settings?.llmSettings?.embeddingModel) {
            embeddingModel = settings.llmSettings.embeddingModel;
          }

          // Detect translation model
          let translationModel = null;
          if (translationData) {
            if (translationData.deepl?.apiKey) {
              translationModel = {
                active: true,
                model: 'DeepL',
                provider: 'DeepL'
              };
            } else if (translationData.google?.translate?.apiKey) {
              translationModel = {
                active: true,
                model: 'Google Translate',
                provider: 'Google'
              };
            }
          }

          setSystemStatus({
            database: {
              connected: dbService?.status === 'connected' || dbService?.status === 'healthy',
              size: dbData?.databaseSize || undefined,
              documents: totalRecords || 0,
              responseTime: dbService?.responseTime || 0,
              databaseName: databaseName,
              tableCount: tableCount
            },
            redis: {
              connected: redisService?.status === 'connected' ||
                redisService?.status === 'healthy' ||
                healthData.serverStatus?.redis === 'connected' ||
                (redisService && !redisService.status),
              used_memory: redisData?.redis?.usedMemory || redisData?.used_memory || undefined,
              responseTime: redisService?.responseTime || 0,
              keyCount: healthData.services?.redis?.keys || redisData?.keyCount || undefined
            },
            llmModel: llmModelInfo,
            embedder: {
              active: healthData.services?.embeddings?.status === 'active' || true,
              model: embeddingModel,
              provider: embeddingProvider
            },
            translationModel: translationModel,
            overall: {
              status: healthData.status || 'unknown',
              uptime: healthData.uptime || 0,
              memory: healthData.memory || { used: 0, total: 0 }
            }
          });
          setIsConnecting(false);
        }, 300);
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      setIsConnecting(false);
      setConnectionProgress(0);
    }
  };

  const menuItems = [
    // Admin only - dashboard access (chat removed from menu)
    ...(currentUser?.role === 'admin' ? [
      { href: '/dashboard', label: t('header.menu.dashboard'), icon: Home },
      { href: '/dashboard/admin-tasks', label: t('header.menu.adminTasks'), icon: ListTodo },
      { href: '/dashboard/users', label: t('header.menu.users'), icon: Users },
      { href: '/dashboard/migrations', label: t('header.menu.migrations'), icon: Database },
      { href: '/dashboard/documents', label: t('header.menu.documents'), icon: FileText },
      { href: '/dashboard/crawls', label: t('header.menu.crawls'), icon: Database },
      { href: '/dashboard/messages', label: t('header.menu.messages'), icon: MessageSquare },
      { href: '/dashboard/settings', label: t('header.menu.systemSettings'), icon: Settings2 }
    ] : [])
  ];

  // Count active services
  const getActiveServicesCount = () => {
    if (!systemStatus) return 0;
    let count = 0;
    if (systemStatus.database.connected) count++;
    if (systemStatus.redis.connected) count++;
    if (systemStatus.llmModel.active) count++;
    if (systemStatus.embedder.active) count++;
    return count;
  };

  const allServicesActive = systemStatus?.database.connected &&
    systemStatus?.redis.connected &&
    systemStatus?.llmModel.active &&
    systemStatus?.embedder.active;

  // Determine overall system status
  const getOverallStatus = () => {
    if (!systemStatus) return 'unknown';
    if (allServicesActive) return 'healthy';
    if (systemStatus.database.connected && systemStatus.redis.connected) return 'degraded';
    return 'unhealthy';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/60 dark:border-[#1e3a5f]/50 bg-white/80 dark:bg-[#0d1f3c]/80 backdrop-blur-md shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Mobile Menu Button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[350px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {(config as any)?.app?.logoUrl ? (
                    <img
                      src={(config as any).app.logoUrl}
                      alt={config?.app?.name || 'Logo'}
                      className="h-6 w-auto object-contain"
                    />
                  ) : (
                    <Brain className="h-6 w-6 text-primary" />
                  )}
                  <span className="text-lg font-bold">{config?.app?.name || 'LSEM'}</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${pathname === item.href
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                        }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Minimal System Status in Mobile Menu */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">{t('header.systemStatus')}</span>
                  <div className={`h-2 w-2 rounded-full ${getOverallStatus() === 'healthy' ? 'bg-green-500' :
                    getOverallStatus() === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                    } animate-pulse`} />
                </div>

                {/* Service status text */}
                <div className="flex items-center justify-around p-3 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <span className="text-xs font-medium">DB</span>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.database.databaseName || '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium">Redis</span>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.redis.keyCount !== undefined ? `${systemStatus.redis.keyCount} keys` : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium">LLM</span>
                    <p className="text-xs text-muted-foreground truncate">
                      {systemStatus?.llmModel.displayName || systemStatus?.llmModel.model?.split('/')?.[1]?.substring(0, 8) + '...' || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium">Embed</span>
                    <p className="text-xs text-muted-foreground truncate">
                      {systemStatus?.embedder.active ? (systemStatus?.embedder.model?.substring(0, 8) + '...' || 'Ready') : 'Offline'}
                    </p>
                  </div>
                </div>

                {systemStatus?.overall?.uptime && (
                  <div className="mt-3 text-xs text-muted-foreground text-center">
                    Uptime: {systemStatus.overall.uptime.toFixed(0)}s
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo - Responsive */}
          <Link href="/" className="flex items-center gap-2 lg:gap-3 hover:opacity-80 transition-opacity">
            {(config as any)?.app?.logoUrl ? (
              <img
                src={(config as any).app.logoUrl}
                alt={config?.app?.name || 'Logo'}
                className="h-8 w-auto lg:h-10 object-contain"
              />
            ) : (
              <div className="relative">
                <Bot className="h-6 w-6 lg:h-8 lg:w-8 text-primary" />
                <div className="absolute -top-1 -right-1 h-2 w-2 lg:h-3 lg:w-3 bg-green-500 rounded-full animate-pulse" />
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-lg lg:text-xl font-bold text-foreground">
                {config?.app?.name || 'Luwi Semantic Bridge'}
              </h1>
              <p className="text-xs text-muted-foreground hidden lg:block">
                {config?.app?.description || 'Intelligent RAG System'}
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Home className="h-4 w-4" />
                  <span className="hidden xl:inline">{t('header.menu.dashboard')}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={`cursor-pointer flex items-center gap-2 ${pathname === item.href ? 'bg-accent' : ''}`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right side elements */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Real-time Notification Panel (Redis-based) */}
            <NotificationPanel />

            {/* Quick Navigation Icons */}
            <div className="hidden sm:flex items-center gap-1">
              {/* Chat Icon - Always visible */}
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={`p-2 h-9 ${pathname === '/' ? 'bg-primary/10 text-primary' : ''}`}
              >
                <Link href="/" className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                </Link>
              </Button>

              {/* Dashboard Icon - Admin only when not on dashboard */}
              {currentUser?.role === 'admin' && !pathname.startsWith('/dashboard') && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="p-2 h-9"
                >
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <Home className="h-5 w-5" />
                    <span className="hidden lg:inline">{t('header.menu.dashboard')}</span>
                  </Link>
                </Button>
              )}

              {/* System Status - Minimal Zen Design */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative p-2 h-9">
                    {/* Status icon with service count */}
                    <div className="relative">
                      {isConnecting ? (
                        <div className="h-5 w-5 rounded-full bg-gray-400 animate-pulse" />
                      ) : allServicesActive ? (
                        <Server className="h-5 w-5 text-green-500" />
                      ) : (
                        <Monitor className="h-5 w-5 text-yellow-500" />
                      )}

                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[480px] p-0">
                  {/* Horizontal status layout */}
                  <div className="p-3 space-y-3">
                    {/* Title with overall status */}
                    <div className="flex items-center justify-between pb-2 border-b">
                      <span className="text-sm font-medium">{t('header.systemStatus')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground capitalize">{getOverallStatus()}</span>
                        <div className={`h-2 w-2 rounded-full ${getOverallStatus() === 'healthy' ? 'bg-green-500' :
                          getOverallStatus() === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                          } animate-pulse`} />
                      </div>
                    </div>

                    {/* Services - horizontal 2x2 grid - wider cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Database */}
                      <div className={`p-3 rounded-lg border ${systemStatus?.database.connected
                        ? 'bg-green-50/50 border-green-200/60 dark:bg-green-950/30 dark:border-green-800/40'
                        : 'bg-red-50/50 border-red-200/60 dark:bg-red-950/30 dark:border-red-800/40'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${systemStatus?.database.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                          <p className="text-sm font-medium">{t('dashboard.systemInfo.database')}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{systemStatus?.database.databaseName || '—'}</p>
                      </div>

                      {/* Redis */}
                      <div className={`p-3 rounded-lg border ${systemStatus?.redis.connected
                        ? 'bg-green-50/50 border-green-200/60 dark:bg-green-950/30 dark:border-green-800/40'
                        : 'bg-red-50/50 border-red-200/60 dark:bg-red-950/30 dark:border-red-800/40'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${systemStatus?.redis.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                          <p className="text-sm font-medium">{t('dashboard.systemInfo.redis')}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{systemStatus?.redis.keyCount !== undefined ? `${systemStatus.redis.keyCount} keys` : '—'}</p>
                      </div>

                      {/* LLM */}
                      <div className={`p-3 rounded-lg border ${systemStatus?.llmModel.active
                        ? 'bg-green-50/50 border-green-200/60 dark:bg-green-950/30 dark:border-green-800/40'
                        : 'bg-red-50/50 border-red-200/60 dark:bg-red-950/30 dark:border-red-800/40'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${systemStatus?.llmModel.active ? 'bg-green-500' : 'bg-red-500'}`} />
                          <p className="text-sm font-medium">{t('dashboard.systemInfo.llmModel')}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{systemStatus?.llmModel.displayName || 'Unknown'}</p>
                      </div>

                      {/* Embeddings */}
                      <div className={`p-3 rounded-lg border ${systemStatus?.embedder.active
                        ? 'bg-green-50/50 border-green-200/60 dark:bg-green-950/30 dark:border-green-800/40'
                        : 'bg-red-50/50 border-red-200/60 dark:bg-red-950/30 dark:border-red-800/40'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${systemStatus?.embedder.active ? 'bg-green-500' : 'bg-red-500'}`} />
                          <p className="text-sm font-medium">{t('dashboard.embeddings.title')}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{systemStatus?.embedder.active ? 'Active' : 'Offline'}</p>
                      </div>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* User Menu */}
            {user && token ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 px-2 lg:px-3 h-9">
                    {/* User Avatar */}
                    <div className="relative">
                      {user.profile_image ? (
                        <img
                          src={user.profile_image.startsWith('http')
                            ? user.profile_image
                            : `${API_BASE_URL}/uploads/${user.profile_image}`
                          }
                          alt="Profile"
                          className="h-6 w-6 rounded-full object-cover border-2 border-primary/20"
                          onError={(e) => {
                            // Fallback to default avatar if image fails to load
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`${user.profile_image ? 'hidden' : 'flex'} h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center`}>
                        <User className="h-3 w-3 text-primary" />
                      </div>
                      {/* Status indicator */}
                      <div className="absolute -bottom-0 -right-0 h-2 w-2 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                    </div>
                    <ChevronDown className="h-3 w-3 opacity-60 hidden lg:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* User Info Header */}
                  <div className="px-2 py-1.5 border-b">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        {user.profile_image ? (
                          <img
                            src={user.profile_image.startsWith('http')
                              ? user.profile_image
                              : `${API_BASE_URL}/uploads/${user.profile_image}`
                            }
                            alt="Profile"
                            className="h-8 w-8 rounded-full object-cover border border-border"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`${user.profile_image ? 'hidden' : 'flex'} h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-border`}>
                          <User className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Profile Link */}
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer flex items-center gap-2">
                      <User className="h-4 w-4 mr-2" />
                      {t('header.profile')}
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600 focus:text-red-600">
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('header.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login">
                <Button size="sm" variant="outline" className="gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('header.login')}</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
