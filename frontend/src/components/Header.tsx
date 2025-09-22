'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@/contexts/ConfigContext';
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
  Shield
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationCenter from '@/components/NotificationCenter';

interface HeaderProps {
  user?: {
    name: string;
    email: string;
  };
  onLogout?: () => void;
}

interface SystemStatus {
  database: {
    connected: boolean;
    size: string;
    documents: number;
  };
  redis: {
    connected: boolean;
    used_memory: string;
  };
  lightrag: {
    initialized: boolean;
    documentCount: number;
  };
  embedder: {
    active: boolean;
    model: string;
  };
}

export default function Header({ user, onLogout }: HeaderProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { config } = useConfig();
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
      const response = await fetch('/api/dashboard');
      if (response.ok) {
        const data = await response.json();
        setConnectionProgress(100);
        
        setTimeout(() => {
          setSystemStatus({
            database: {
              connected: true,
              size: data.database.size,
              documents: data.database.documents
            },
            redis: {
              connected: data.redis.connected,
              used_memory: data.redis.used_memory
            },
            lightrag: {
              initialized: data.lightrag.initialized,
              documentCount: data.lightrag.documentCount
            },
            embedder: {
              active: true,
              model: 'text-embedding-ada-002'
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
    { href: '/dashboard', label: t('header.menu.overview'), icon: Home },
    { href: '/dashboard/system-monitor', label: 'Sistem Monitörü', icon: Activity },
    { href: '/dashboard/audit-logs', label: 'Denetim Logları', icon: Shield },
    ...(currentUser?.role === 'admin' ? [
        { href: '/dashboard/audit-settings', label: 'Denetim Ayarları', icon: Settings2 },
        { href: '/dashboard/rbac', label: 'Rol Yönetimi', icon: Shield }
      ] : []),
    { href: '/dashboard/query', label: t('header.menu.ragQuery'), icon: Search },
    { href: '/dashboard/documents', label: t('header.menu.documents'), icon: FileText },
    { href: '/dashboard/embeddings-manager', label: t('header.menu.embeddingsManager'), icon: Cpu },
    { href: '/dashboard/scraper', label: t('header.menu.scraper'), icon: Globe },
    { href: '/dashboard/activity', label: t('header.menu.activities'), icon: Activity },
    ...(currentUser?.role === 'admin' ? [{ href: '/dashboard/users', label: t('header.menu.users'), icon: Users }] : []),
    { href: '/', label: t('header.menu.chatbot'), icon: Brain },
  ];

  const allServicesActive = systemStatus?.database.connected && 
                           systemStatus?.redis.connected && 
                           systemStatus?.lightrag.initialized && 
                           systemStatus?.embedder.active;

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
                  {config?.app?.logoUrl ? (
                    <img 
                      src={config.app.logoUrl} 
                      alt={config.app.name || 'Logo'} 
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
              
              {/* System Status in Mobile Menu */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-sm font-semibold mb-3">{t('header.systemStatus')}</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Database</span>
                    <Badge variant={systemStatus?.database.connected ? "success" : "destructive"} className="text-xs">
                      {systemStatus?.database.connected ? t('header.connected') : t('header.notConnected')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Redis</span>
                    <Badge variant={systemStatus?.redis.connected ? "success" : "destructive"} className="text-xs">
                      {systemStatus?.redis.connected ? t('header.connected') : t('header.notConnected')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">LightRAG</span>
                    <Badge variant={systemStatus?.lightrag.initialized ? "success" : "destructive"} className="text-xs">
                      {systemStatus?.lightrag.initialized ? t('header.active') : t('header.inactive')}
                    </Badge>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo - Responsive */}
          <Link href="/dashboard" className="flex items-center gap-2 lg:gap-3 hover:opacity-80 transition-opacity">
            {config?.app?.logoUrl ? (
              <img 
                src={config.app.logoUrl} 
                alt={config.app.name || 'Logo'} 
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
                {config?.app?.name || 'Alice Semantic Bridge'}
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

            {/* System Status - Hidden on mobile, shown in menu */}
            <div className="hidden sm:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 relative px-2 lg:px-3">
                    <div className={`h-2 w-2 rounded-full ${
                      isConnecting ? 'bg-gray-400' : 
                      allServicesActive ? 'bg-green-500' : 'bg-yellow-500'
                    } ${!isConnecting && 'animate-pulse'}`} />
                    <span className="text-sm hidden md:inline">{t('header.systemStatus')}</span>
                    <ChevronDown className="h-3 w-3 opacity-60 hidden lg:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-4">
                  <div className="space-y-4">
                    {/* Overall Status */}
                    <div className="flex items-center justify-between pb-3 border-b">
                      <h3 className="font-semibold text-sm">{t('header.overallStatus')}</h3>
                      {isConnecting ? (
                        <Badge variant="secondary" className="gap-1">
                          <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                          {t('header.connecting')}
                        </Badge>
                      ) : (
                        <Badge variant={allServicesActive ? "success" : "warning"}>
                          {allServicesActive ? t('header.allServicesActive') : t('header.someIssues')}
                        </Badge>
                      )}
                    </div>

                    {/* Service Status Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="text-xs font-medium">PostgreSQL</p>
                          <Badge variant={systemStatus?.database.connected ? "success" : "destructive"} className="text-xs">
                            {systemStatus?.database.connected ? 'rag_chatbot' : t('header.notConnected')}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-red-600" />
                        <div>
                          <p className="text-xs font-medium">Redis</p>
                          <Badge variant={systemStatus?.redis.connected ? "success" : "destructive"} className="text-xs">
                            {systemStatus?.redis.connected ? ':6379' : t('header.notConnected')}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-xs font-medium">LightRAG</p>
                          <Badge variant={systemStatus?.lightrag.initialized ? "success" : "destructive"} className="text-xs">
                            {systemStatus?.lightrag.initialized ? ':7687' : t('header.inactive')}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="text-xs font-medium">OpenAI</p>
                          <Badge variant={systemStatus?.embedder.active ? "success" : "destructive"} className="text-xs">
                            {systemStatus?.embedder.active ? 'ada-002' : t('header.inactive')}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {t('header.lastUpdated')}: {new Date().toLocaleTimeString()}
                      </span>
                      <Link href="/dashboard/settings" className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Settings2 className="w-3 h-3" />
                        {t('header.settings')}
                      </Link>
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
                    <span className="text-sm hidden md:inline">{user.name}</span>
                    <ChevronDown className="h-3 w-3 opacity-60 hidden lg:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout} className="cursor-pointer">
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
