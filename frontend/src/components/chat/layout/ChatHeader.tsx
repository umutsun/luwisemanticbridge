import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Brain,
  Plus,
  Settings,
  LayoutDashboard,
  UserCircle,
  LogOut,
  ChevronDown,
  MessageSquare
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useTranslation } from 'react-i18next';

interface ChatHeaderProps {
  chatbotSettings: {
    title: string;
    logoUrl: string;
    activeChatModel: string;
  };
  user: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
  settingsLoaded: boolean;
  onClearChat: () => void;
  onLogout: () => void;
  isUserDropdownOpen: boolean;
  setIsUserDropdownOpen: (open: boolean) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chatbotSettings,
  user,
  settingsLoaded,
  onClearChat,
  onLogout,
  isUserDropdownOpen,
  setIsUserDropdownOpen
}) => {
  const { t } = useTranslation();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
      <div className="max-w-6xl mx-auto w-[95%] md:w-full px-2 md:px-4 py-3 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink">
          {settingsLoaded && chatbotSettings.logoUrl ? (
            <img
              src={chatbotSettings.logoUrl}
              alt={chatbotSettings.title}
              className="w-7 h-7 md:w-8 md:h-8 object-contain flex-shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <Brain className={`w-7 h-7 md:w-8 md:h-8 text-primary flex-shrink-0 ${settingsLoaded && chatbotSettings.logoUrl ? 'hidden' : ''}`} />
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-bold truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
              {settingsLoaded ? chatbotSettings.title : (
                <span className="inline-block w-20 md:w-32 h-5 md:h-6 bg-muted animate-pulse rounded"></span>
              )}
            </h1>
            {/* Active Model Display - Hidden on mobile */}
            {settingsLoaded && chatbotSettings.activeChatModel && (
              <div className="hidden sm:flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 leading-tight uppercase tracking-wide truncate max-w-[150px]">
                  {chatbotSettings.activeChatModel.split('/')?.[1] || chatbotSettings.activeChatModel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          {/* New Session Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearChat}
            className="p-2"
            title={t('chat.newChat', 'Yeni Sohbet')}
          >
            <Plus className="w-4 h-4" />
          </Button>

          {/* Admin/Manager View */}
          {user && ['admin', 'manager'].includes(user.role || '') ? (
            <>
              {/* Admin-only Controls - Hidden on small mobile */}
              <div className="hidden sm:flex items-center gap-1">
                {/* Settings Chip - Admin Only */}
                {user?.role === 'admin' && (
                  <Link href="/dashboard/settings">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2"
                      title={t('common.settings', 'Ayarlar')}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </Link>
                )}

                {/* Dashboard Link - Admin Only */}
                {user?.role === 'admin' && (
                  <Link href="/dashboard">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2"
                      title={t('common.dashboard', 'Dashboard')}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                    </Button>
                  </Link>
                )}
              </div>

              {/* User Dropdown */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="flex items-center gap-2"
                >
                  <UserCircle className="w-4 h-4" />
                  <ChevronDown className={`w-3 h-3 transition-transform ${isUserDropdownOpen ? 'rotate-180' : ''}`} />
                </Button>

                {isUserDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-popover border rounded-md shadow-lg z-50">
                    <div className="p-2">
                      <div className="px-2 py-1.5 text-sm font-medium border-b">
                        <div>{user?.name || t('common.user', 'Kullanıcı')}</div>
                        <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                      </div>
                      <Link href="/profile">
                        <Button variant="ghost" className="w-full justify-start text-sm h-8 px-2">
                          <UserCircle className="w-4 h-4 mr-2" />
                          {t('common.profile', 'Profil')}
                        </Button>
                      </Link>
                      {(user?.role === 'admin' || user?.role === 'manager') && (
                        <Link href="/dashboard/messages">
                          <Button variant="ghost" className="w-full justify-start text-sm h-8 px-2">
                            <MessageSquare className="w-4 h-4 mr-2" />
                            {t('dashboard.messages.title', 'Mesaj Analizleri')}
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-sm h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => {
                          onLogout();
                          setIsUserDropdownOpen(false);
                        }}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        {t('common.logout', 'Çıkış Yap')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Standard User View - Simple */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-2"
                  title={user?.name || t('common.user', 'Kullanıcı')}
                >
                  <UserCircle className="w-5 h-5" />
                </Button>
              </div>
            </>
          )}

          {/* Theme Toggle - Always Visible */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
