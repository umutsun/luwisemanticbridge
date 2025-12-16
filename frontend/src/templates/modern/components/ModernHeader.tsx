'use client';

import React, { memo, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    Plus,
    Settings,
    LayoutDashboard,
    LogOut,
    Edit3,
    UserCircle,
    MessageSquare,
    User
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import ThemeToggle from '@/components/ThemeToggle';
import { useTranslation } from 'react-i18next';

interface ChatbotSettings {
    title: string;
    logoUrl: string;
    activeChatModel: string;
}

interface UserInfo {
    name?: string;
    email?: string;
    role?: string;
}

interface ModernHeaderProps {
    chatbotSettings: ChatbotSettings;
    settingsLoaded: boolean;
    user: UserInfo | null;
    onClearChat: () => void;
    onOpenProfileDialog: () => void;
    onLogout: () => void;
}

const ModernHeader = memo(function ModernHeader({
    chatbotSettings,
    settingsLoaded,
    user,
    onClearChat,
    onOpenProfileDialog,
    onLogout
}: ModernHeaderProps) {
    const { t } = useTranslation();

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClearChat();
        }
    }, [onClearChat]);

    const isAdmin = user?.role === 'admin';
    const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

    return (
        <header
            className="fixed top-0 left-0 right-0 z-50 modern-surface border-b modern-border"
            role="banner"
        >
            <div className="max-w-6xl mx-auto w-full px-3 sm:px-4 py-2 flex items-center justify-between">
                {/* Logo & Title */}
                <div
                    className="flex items-center gap-2 sm:gap-3 cursor-pointer group"
                    onClick={onClearChat}
                    onKeyDown={handleKeyDown}
                    role="button"
                    tabIndex={0}
                    aria-label={t('chat.newChat', 'Yeni Sohbet')}
                >
                    {settingsLoaded && chatbotSettings.logoUrl ? (
                        <img
                            src={chatbotSettings.logoUrl}
                            alt=""
                            aria-hidden="true"
                            className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                        />
                    ) : null}
                    <div>
                        <h1 className="text-base sm:text-lg font-bold tracking-tight modern-text">
                            {settingsLoaded ? chatbotSettings.title : t('chat.title', 'AI Asistan')}
                        </h1>
                        {/* Active Model Display */}
                        {settingsLoaded && chatbotSettings.activeChatModel && (
                            <div className="flex items-center gap-1">
                                <span className="text-[8px] sm:text-[9px] font-medium modern-text-secondary">
                                    {chatbotSettings.activeChatModel.split('/')?.[1] || chatbotSettings.activeChatModel}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side Controls */}
                <nav className="flex items-center gap-1 sm:gap-2" role="navigation" aria-label={t('common.mainNav', 'Ana navigasyon')}>
                    {/* New Chat Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClearChat}
                        className="modern-btn-ghost h-9 w-9 sm:h-10 sm:w-10 focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                        aria-label={t('chat.newChat', 'Yeni Sohbet')}
                    >
                        <Plus className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                    </Button>

                    {/* Admin Controls */}
                    {isAdmin && (
                        <>
                            <Link href="/dashboard/settings" aria-label={t('common.settings', 'Ayarlar')}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="modern-btn-ghost h-9 w-9 sm:h-10 sm:w-10 focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                                    aria-label={t('common.settings', 'Ayarlar')}
                                >
                                    <Settings className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                                </Button>
                            </Link>
                            <Link href="/dashboard" aria-label={t('common.dashboard', 'Dashboard')}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="modern-btn-ghost h-9 w-9 sm:h-10 sm:w-10 focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                                    aria-label={t('common.dashboard', 'Dashboard')}
                                >
                                    <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                                </Button>
                            </Link>
                        </>
                    )}

                    <ThemeToggle />

                    {/* User Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="modern-btn-ghost h-9 w-9 sm:h-10 sm:w-10 focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                                aria-label={t('common.userMenu', 'Kullanıcı menüsü')}
                                aria-haspopup="menu"
                            >
                                <User className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="modern-surface modern-border min-w-[200px] shadow-lg"
                            role="menu"
                            aria-label={t('common.userMenu', 'Kullanıcı menüsü')}
                        >
                            <div className="px-3 py-2.5 border-b modern-border">
                                <p className="text-sm font-medium modern-text">
                                    {user?.name || t('chat.user', 'Kullanıcı')}
                                </p>
                                <p className="text-xs modern-text-muted">{user?.email}</p>
                            </div>
                            <DropdownMenuItem
                                className="focus:bg-violet-500/20 focus:text-white cursor-pointer"
                                onClick={onOpenProfileDialog}
                                role="menuitem"
                            >
                                <Edit3 className="w-4 h-4 mr-2 text-violet-400" aria-hidden="true" />
                                {t('profile.edit', 'Profili Düzenle')}
                            </DropdownMenuItem>
                            <Link href="/profile">
                                <DropdownMenuItem className="focus:bg-violet-500/20 focus:text-white cursor-pointer" role="menuitem">
                                    <UserCircle className="w-4 h-4 mr-2 text-blue-400" aria-hidden="true" />
                                    {t('common.profile', 'Profil Sayfası')}
                                </DropdownMenuItem>
                            </Link>
                            {isManagerOrAdmin && (
                                <Link href="/dashboard/messages">
                                    <DropdownMenuItem className="focus:bg-violet-500/20 focus:text-white cursor-pointer" role="menuitem">
                                        <MessageSquare className="w-4 h-4 mr-2 text-green-400" aria-hidden="true" />
                                        {t('dashboard.messages.title', 'Mesaj Analizleri')}
                                    </DropdownMenuItem>
                                </Link>
                            )}
                            <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700/50" />
                            <DropdownMenuItem
                                className="focus:bg-red-500/20 focus:text-white cursor-pointer"
                                onClick={onLogout}
                                role="menuitem"
                            >
                                <LogOut className="w-4 h-4 mr-2 text-red-400" aria-hidden="true" />
                                {t('nav.logout', 'Çıkış')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </nav>
            </div>
        </header>
    );
});

export default ModernHeader;
