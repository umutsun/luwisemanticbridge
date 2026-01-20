'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, LogOut, Trash2, MessageSquare, Sun, Moon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZenHeaderProps } from '../types';

// Zen/Tao wisdom quotes
const zenQuotes = [
  { text: "Bilge kişi konuşmaz, konuşan bilmez.", source: "Lao Tzu" },
  { text: "Bin millik yolculuk tek bir adımla başlar.", source: "Lao Tzu" },
  { text: "Su yumuşaktır ama kayaları oyar.", source: "Lao Tzu" },
  { text: "Sessizlik, en güçlü çığlıktır.", source: "Zen Atasözü" },
  { text: "Şimdi'den başka zaman yoktur.", source: "Zen Atasözü" },
  { text: "Zihin durgun su gibi olmalı.", source: "Zen Atasözü" },
  { text: "Boşluk, doluluktan değerlidir.", source: "Lao Tzu" },
  { text: "Nehir akmakla yorulmaz.", source: "Zen Atasözü" },
  { text: "En büyük bilgelik basitliktir.", source: "Zen Atasözü" },
  { text: "Yaprak düşer, ağaç kalır.", source: "Zen Atasözü" },
  { text: "Rüzgar eser, söğüt eğilir ama kırılmaz.", source: "Zen Atasözü" },
  { text: "Her an yeni bir başlangıçtır.", source: "Zen Atasözü" },
  { text: "Aydınlanma, arayışı bıraktığında gelir.", source: "Zen Atasözü" },
  { text: "Ay'ı işaret eden parmağa değil, Ay'a bak.", source: "Zen Atasözü" },
  { text: "Dağ ne kadar yüksek olursa olsun, yol vardır.", source: "Zen Atasözü" },
];

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
  const [showZenQuote, setShowZenQuote] = useState(false);
  const [currentQuote, setCurrentQuote] = useState(zenQuotes[0]);
  const zenRef = useRef<HTMLDivElement>(null);

  // Get random quote
  const getRandomQuote = () => {
    const randomIndex = Math.floor(Math.random() * zenQuotes.length);
    setCurrentQuote(zenQuotes[randomIndex]);
  };

  // Handle click on online indicator
  const handleZenClick = () => {
    getRandomQuote();
    setShowZenQuote(!showZenQuote);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (zenRef.current && !zenRef.current.contains(event.target as Node)) {
        setShowZenQuote(false);
      }
    };

    if (showZenQuote) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showZenQuote]);

  return (
    <header className="zen01-header">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {chatbotSettings.title || 'Zen Assistant'}
              </h1>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 dark:border-cyan-500/30">
                v2026.01.20
              </span>
            </div>
            {chatbotSettings.subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{chatbotSettings.subtitle}</p>
            )}
          </div>
        </div>

        {/* Live Indicator, Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          {/* Zen Quote Dropdown */}
          <div className="relative" ref={zenRef}>
            <button
              onClick={handleZenClick}
              className="zen01-live cursor-pointer hover:scale-105 transition-transform duration-200"
              title="Zen bilgeliği için tıklayın"
            >
              <div className="zen01-live-dot" />
              <span className="text-xs text-emerald-500 dark:text-emerald-400">Online</span>
              <Sparkles className="h-3 w-3 ml-1 text-emerald-500/50 dark:text-emerald-400/50" />
            </button>

            {/* Zen Quote Dropdown */}
            <AnimatePresence>
              {showZenQuote && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="absolute right-0 top-full mt-2 w-72 p-4 rounded-xl
                    bg-gradient-to-br from-slate-900/95 to-slate-800/95 dark:from-slate-900/98 dark:to-slate-800/98
                    backdrop-blur-xl border border-cyan-500/20 shadow-xl shadow-cyan-500/10
                    z-50"
                >
                  {/* Decorative corner */}
                  <div className="absolute -top-1.5 right-4 w-3 h-3 rotate-45 bg-slate-900/95 border-l border-t border-cyan-500/20" />

                  {/* Quote icon */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                      <span className="text-lg">&#9775;</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-200 dark:text-slate-100 leading-relaxed italic">
                        "{currentQuote.text}"
                      </p>
                      <p className="text-[10px] text-cyan-500/70 dark:text-cyan-400/60 mt-2 text-right">
                        — {currentQuote.source}
                      </p>
                    </div>
                  </div>

                  {/* Refresh button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      getRandomQuote();
                    }}
                    className="mt-3 w-full py-1.5 text-[10px] text-cyan-500/70 hover:text-cyan-400
                      border border-cyan-500/20 hover:border-cyan-500/40 rounded-lg
                      transition-colors duration-200 flex items-center justify-center gap-1"
                  >
                    <Sparkles className="h-3 w-3" />
                    Başka bir bilgelik
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
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
