'use client';

import React from 'react';
import { ChevronDown, LogOut, Trash2, MessageSquare, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ZenHeaderProps } from '../types';

/**
 * Zen01 Header Component
 * Contains logo, title, live indicator, theme toggle, and user menu
 */
export const ZenHeader: React.FC<ZenHeaderProps> = ({
  chatbotSettings,
  user,
  onClearChat,
  onLogout,
  isDark,
  onToggleTheme,
}) => {
  return (
    <header className="zen01-header">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {chatbotSettings.title || 'Zen Assistant'}
            </h1>
            {chatbotSettings.subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{chatbotSettings.subtitle}</p>
            )}
            {/* Version & Theme - more readable colors */}
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-600 dark:text-slate-300">v2026.01.15.C</span>
              <span className="mx-1 text-slate-400 dark:text-slate-500">•</span>
              <span className="text-slate-500 dark:text-slate-400">(zen01)</span>
            </p>
          </div>
        </div>

        {/* Live Indicator, Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          <div className="zen01-live">
            <div className="zen01-live-dot" />
            <span className="text-xs text-emerald-500 dark:text-emerald-400">Online</span>
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="zen01-theme-toggle"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Avatar className="h-7 w-7 bg-gradient-to-br from-cyan-500 to-purple-600">
                  <AvatarFallback className="text-xs text-white bg-transparent">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 zen01-dropdown"
            >
              <DropdownMenuItem
                onClick={onClearChat}
                className="zen01-dropdown-item cursor-pointer text-slate-700 dark:text-slate-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Chat
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-200 dark:bg-[#1e3a5f]/50" />
              <DropdownMenuItem
                onClick={onLogout}
                className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default ZenHeader;
