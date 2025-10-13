'use client';

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
  Brain,
  ChevronDown,
  Home,
  Activity,
  Database,
  LogOut,
  User,
  Users,
  Server,
  Cpu,
  Settings2,
  MessageSquare,
  Search,
  FileText,
  Globe,
  Menu,
  X,
  Shield,
  RefreshCw,
  Monitor
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationCenter from '@/components/NotificationCenter';
import { getAppSettings } from '@/lib/api/settings';
import { API_BASE_URL } from '@/config/api.config';


interface SystemStatus {
  database: {
    connected: boolean;
    size: string;
    documents: number;
    responseTime?: number;
    databaseName?: string;
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
  };
  embedder: {
    active: boolean;
    model: string;
    provider: string;
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
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  
  const fetchSystemStatus = async () => {
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
      };

      // Add token if available
      if (token) {
        (headers as any)['Authorization'] = `Bearer ${token}`;
      }

      const [healthResponse, dbResponse, redisResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v2/health/system`, { headers }),
        fetch(`${API_BASE_URL}/api/v2/database/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v2/database/schema`, { headers })
      ]);

      if (healthResponse.ok && dbResponse.ok) {
        const healthData = await healthResponse.json();
        const dbData = await dbResponse.json();
        const redisData = redisResponse.ok ? await redisResponse.json() : null;

        setConnectionProgress(100);

        setTimeout(async () => {
          // Get settings first
          let settings = null;
          try {
            settings = await getAppSettings();
          } catch (error) {
            console.warn('Could not fetch app settings');
          }

          // Build comprehensive system status from both endpoints
          const dbService = healthData.services?.database || healthData.services?.lsemb_database;
          const redisService = healthData.services?.redis;

          // Extract database name from settings or database stats
          let databaseName = 'lsemb'; // default
          if (settings && settings.database?.name) {
            databaseName = settings.database.name;
          } else if (dbData && dbData.database) {
            databaseName = dbData.database;
          } else if (dbData && dbData.databaseName) {
            databaseName = dbData.databaseName;
          }

          // Calculate total records from database schema
          let totalRecords = 0;
          if (dbData && dbData.tables) {
            totalRecords = dbData.tables.reduce((sum: number, table: any) => sum + (table.rowCount || 0), 0);
          }

          // Get LLM model information
          let llmModelInfo = {
            model: 'anthropic/claude-3-sonnet',
            provider: 'Anthropic',
            active: true,
            displayName: 'Claude 3 Sonnet'
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

          setSystemStatus({
            database: {
              connected: dbService?.status === 'connected' || dbService?.status === 'healthy',
              size: 'N/A',
              documents: 0,
              responseTime: dbService?.responseTime || 0,
              databaseName: databaseName
            },
            redis: {
              connected: redisService?.status === 'connected' ||
                        redisService?.status === 'healthy' ||
                        healthData.serverStatus?.redis === 'connected' ||
                        (redisService && !redisService.status),
              used_memory: 'N/A',
              responseTime: redisService?.responseTime || 0,
              keyCount: totalRecords
            },
            llmModel: llmModelInfo,
            embedder: {
              active: healthData.services?.embeddings?.status === 'active' || true,
              model: 'text-embedding-ada-002',
              provider: 'OpenAI'
            },
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
    // For all users - chat focused
    { href: '/', label: 'Chat', icon: Brain },

    // Admin only - dashboard access
    ...(currentUser?.role === 'admin' ? [
      { href: '/dashboard', label: 'Yönetim Paneli', icon: Home },
      { href: '/dashboard/users', label: 'Kullanıcı Yönetimi', icon: Users },
      { href: '/dashboard/documents', label: 'Döküman Yönetimi', icon: FileText },
      { href: '/dashboard/embeddings-manager', label: 'Embeddings Manager', icon: Database },
      { href: '/dashboard/scraper', label: 'Web Scraper', icon: Globe },
      { href: '/dashboard/settings', label: 'Sistem Ayarları', icon: Settings2 }
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
    <header className="sticky top-0 z-50 w-full border-b bg-white dark:bg-gray-900 shadow-sm">
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
                  <span className="text-lg font-bold">{config?.app?.name || 'ASB'}</span>
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
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        pathname === item.href 
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
                  <span className="text-sm font-medium">System Status</span>
                  <div className={`h-2 w-2 rounded-full ${
                    getOverallStatus() === 'healthy' ? 'bg-green-500' :
                    getOverallStatus() === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                  } animate-pulse`} />
                </div>

                {/* Service status text */}
                <div className="flex items-center justify-around p-3 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <span className="text-xs font-medium">DB</span>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.database.databaseName || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium">Redis</span>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.redis.keyCount || 0} keys
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium">LLM</span>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.llmModel.provider || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium">Embed</span>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.embedder.active ? 'Ready' : 'Offline'}
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
                <Brain className="h-6 w-6 lg:h-8 lg:w-8 text-primary" />
                <div className="absolute -top-1 -right-1 h-2 w-2 lg:h-3 lg:w-3 bg-green-500 rounded-full animate-pulse" />
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-lg lg:text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                {config?.app?.name || 'Luwi Semantic Bridge'}
              </h1>
              <p className="text-xs text-muted-foreground hidden lg:block font-light">
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
                  <span className="hidden xl:inline">Dashboard</span>
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

            {/* Notification Center */}
            <NotificationCenter />

            
            {/* System Status - Minimal Zen Design */}
            <div className="hidden sm:block">
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
                <DropdownMenuContent align="end" className="w-72 p-0">
                  {/* Clean minimal status grid */}
                  <div className="p-4 space-y-3">
                    {/* Title with overall status */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">System Status</span>
                      <div className={`h-2 w-2 rounded-full ${
                        getOverallStatus() === 'healthy' ? 'bg-green-500' :
                        getOverallStatus() === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                      } animate-pulse`} />
                    </div>

                    {/* Services - minimal cards */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Database */}
                      <div className={`p-2 rounded-lg border ${
                        systemStatus?.database.connected
                          ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                          : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                      }`}>
                        <p className="text-xs font-medium">Database</p>
                        <p className="text-xs text-muted-foreground">
                          {systemStatus?.database.databaseName || 'Unknown'}
                        </p>
                      </div>

                      {/* Redis */}
                      <div className={`p-2 rounded-lg border ${
                        systemStatus?.redis.connected
                          ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                          : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                      }`}>
                        <p className="text-xs font-medium">Redis</p>
                        <p className="text-xs text-muted-foreground">
                          {systemStatus?.redis.keyCount || 0} keys
                        </p>
                      </div>

                      {/* LLM */}
                      <div className={`p-2 rounded-lg border ${
                        systemStatus?.llmModel.active
                          ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                          : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                      }`}>
                        <p className="text-xs font-medium">LLM</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {systemStatus?.llmModel.provider || 'Unknown'}
                        </p>
                      </div>

                      {/* Embeddings */}
                      <div className={`p-2 rounded-lg border ${
                        systemStatus?.embedder.active
                          ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                          : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                      }`}>
                        <p className="text-xs font-medium">Embeddings</p>
                        <p className="text-xs text-muted-foreground">
                          {systemStatus?.embedder.active ? 'Ready' : 'Offline'}
                        </p>
                      </div>
                    </div>

                    {/* Minimal footer */}
                    <div className="pt-2 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date().toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* User Menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 px-2 lg:px-3">
                    <User className="h-4 w-4" />
                    <ChevronDown className="h-3 w-3 opacity-60 hidden lg:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer flex items-center gap-2">
                      <User className="h-4 w-4 mr-2" />
                      Profilim
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer">
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
