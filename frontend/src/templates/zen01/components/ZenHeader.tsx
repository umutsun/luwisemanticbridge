'use client';

import React, { useState, useEffect } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';
import type { ZenHeaderProps } from '../types';

// Zen/Tao wisdom quotes - expanded collection
const zenQuotes = [
  // Lao Tzu (Tao Te Ching)
  { text: "Bilge kişi konuşmaz, konuşan bilmez.", source: "Lao Tzu" },
  { text: "Bin millik yolculuk tek bir adımla başlar.", source: "Lao Tzu" },
  { text: "Su yumuşaktır ama kayaları oyar.", source: "Lao Tzu" },
  { text: "Boşluk, doluluktan değerlidir.", source: "Lao Tzu" },
  { text: "Sade ol, kendini tut, az iste.", source: "Lao Tzu" },
  { text: "Doğa acele etmez, yine de her şey tamamlanır.", source: "Lao Tzu" },
  { text: "En yumuşak şey, en sert şeyi yener.", source: "Lao Tzu" },
  { text: "Kendini bilen aydınlanmıştır.", source: "Lao Tzu" },
  { text: "Başkalarına karşı anlayışlı ol, kendine karşı sert.", source: "Lao Tzu" },
  { text: "Büyük Tao akar, hem sola hem sağa.", source: "Lao Tzu" },
  { text: "Az bilen çok konuşur, çok bilen az konuşur.", source: "Lao Tzu" },
  { text: "Güçlü olan galip gelmez, galip gelen güçlüdür.", source: "Lao Tzu" },
  { text: "Yapma, bırak olsun.", source: "Lao Tzu" },
  { text: "En iyi lider, halkın varlığından habersiz olduğudur.", source: "Lao Tzu" },
  { text: "Kendi ışığını sön, kaosla bir ol.", source: "Lao Tzu" },

  // Chuang Tzu (Zhuangzi)
  { text: "Büyük bilgelik çocuk gibidir.", source: "Chuang Tzu" },
  { text: "Mutluluk hafif bir şeydir; kim tutabilir?", source: "Chuang Tzu" },
  { text: "Uyku halinde rüya olduğunu bilmezsin.", source: "Chuang Tzu" },
  { text: "Balık suyu bilmez, insan havayı.", source: "Chuang Tzu" },
  { text: "Faydasız ağaç uzun yaşar.", source: "Chuang Tzu" },
  { text: "Kelebek mi insan rüyası, insan mı kelebek rüyası?", source: "Chuang Tzu" },

  // Zen Masters
  { text: "Sessizlik, en güçlü çığlıktır.", source: "Zen Atasözü" },
  { text: "Şimdi'den başka zaman yoktur.", source: "Zen Atasözü" },
  { text: "Zihin durgun su gibi olmalı.", source: "Zen Atasözü" },
  { text: "Nehir akmakla yorulmaz.", source: "Zen Atasözü" },
  { text: "En büyük bilgelik basitliktir.", source: "Zen Atasözü" },
  { text: "Yaprak düşer, ağaç kalır.", source: "Zen Atasözü" },
  { text: "Rüzgar eser, söğüt eğilir ama kırılmaz.", source: "Zen Atasözü" },
  { text: "Her an yeni bir başlangıçtır.", source: "Zen Atasözü" },
  { text: "Aydınlanma, arayışı bıraktığında gelir.", source: "Zen Atasözü" },
  { text: "Ay'ı işaret eden parmağa değil, Ay'a bak.", source: "Zen Atasözü" },
  { text: "Dağ ne kadar yüksek olursa olsun, yol vardır.", source: "Zen Atasözü" },
  { text: "Boş bardak doldurulabilir.", source: "Zen Atasözü" },
  { text: "Odun taşı, su çek - işte mucize.", source: "Zen Atasözü" },
  { text: "Düşen kar gibi ol: sessiz ama dönüştürücü.", source: "Zen Atasözü" },
  { text: "Söz gümüşse, sükut altındır.", source: "Zen Atasözü" },
  { text: "Köprüyü geçene kadar ayıya dayı deme.", source: "Zen Atasözü" },
  { text: "Gerçek yol kapısız bir kapıdır.", source: "Mumon" },
  { text: "Oturduğun yerde otur, yürüdüğün yerde yürü.", source: "Unmon" },
  { text: "Bir el çırpınca ne ses çıkar?", source: "Hakuin" },

  // Buddha
  { text: "Zihin her şeydir. Ne düşünürsen o olursun.", source: "Buddha" },
  { text: "Acı kaçınılmaz, ıstırap seçimdir.", source: "Buddha" },
  { text: "Bırakmayı öğrendiğinde, huzur seni bulur.", source: "Buddha" },
  { text: "Her sabah yeniden doğuyoruz.", source: "Buddha" },
  { text: "Dünya korkuyla değil, sevgiyle değişir.", source: "Buddha" },
  { text: "Kendi kurtuluşunu kendin gerçekleştir.", source: "Buddha" },

  // Confucius
  { text: "Öğrenip düşünmemek boşuna, düşünüp öğrenmemek tehlikelidir.", source: "Konfüçyüs" },
  { text: "Her yerde üç öğretmenim var.", source: "Konfüçyüs" },
  { text: "Bilmediğini bilmek, gerçek bilgeliktir.", source: "Konfüçyüs" },

  // Japanese Proverbs
  { text: "Yedi kere düş, sekiz kere kalk.", source: "Japon Atasözü" },
  { text: "Acele işe şeytan karışır.", source: "Japon Atasözü" },
  { text: "Ağacın gölgesinde bile değişim vardır.", source: "Japon Atasözü" },
  { text: "Düşmeden yürümeyi öğrenen olmadı.", source: "Japon Atasözü" },
  { text: "Bir adım atılmazsa yol bitmez.", source: "Japon Atasözü" },
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
  const [showZenToast, setShowZenToast] = useState(false);
  const [currentQuote, setCurrentQuote] = useState(zenQuotes[0]);
  const [isFirstRender, setIsFirstRender] = useState(true);

  // Get random quote
  const getRandomQuote = () => {
    const randomIndex = Math.floor(Math.random() * zenQuotes.length);
    setCurrentQuote(zenQuotes[randomIndex]);
  };

  // Handle theme toggle with Zen toast
  const handleThemeToggle = () => {
    getRandomQuote();
    onToggleTheme();
    setShowZenToast(true);

    // Auto-hide after 4 seconds
    setTimeout(() => {
      setShowZenToast(false);
    }, 4000);
  };

  // Skip showing toast on initial render
  useEffect(() => {
    setIsFirstRender(false);
  }, []);

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
                Build: {process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || 'dev'}
              </span>
            </div>
            {chatbotSettings.subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{chatbotSettings.subtitle}</p>
            )}
          </div>
        </div>

        {/* Live Indicator, Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle with Zen - Single Combined Button */}
          <button
            onClick={handleThemeToggle}
            className="w-9 h-9 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700
              hover:from-cyan-50 hover:to-purple-50 dark:hover:from-cyan-900/30 dark:hover:to-purple-900/30
              border border-slate-300 dark:border-slate-600
              hover:border-cyan-400/50 dark:hover:border-cyan-500/50
              transition-all duration-300 hover:scale-105 hover:shadow-lg
              group relative overflow-hidden"
            aria-label={isDark ? 'Aydınlık mod' : 'Karanlık mod'}
            title={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
          >
            {/* Animated background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-purple-500/0
              translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />

            {isDark ? (
              <Sun className="h-4 w-4 text-amber-500 group-hover:text-amber-400 transition-colors relative z-10" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600 group-hover:text-purple-600 transition-colors relative z-10" />
            )}
          </button>

          {/* Zen Toast - Fixed Position */}
          <AnimatePresence>
            {showZenToast && !isFirstRender && (
              <motion.div
                initial={{ opacity: 0, y: -50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                  duration: 0.4
                }}
                className="fixed top-20 left-1/2 -translate-x-1/2
                  w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] sm:max-w-[420px]
                  p-4 sm:p-5 rounded-2xl
                  bg-gradient-to-br from-slate-900/95 to-slate-800/95 dark:from-slate-100/95 dark:to-white/95
                  backdrop-blur-xl
                  border border-cyan-500/30 dark:border-cyan-600/30
                  shadow-2xl shadow-cyan-500/20 dark:shadow-cyan-600/10
                  z-[100]"
              >
                {/* Animated border glow */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20
                  animate-pulse opacity-50" style={{ padding: '1px', margin: '-1px' }} />

                {/* Content */}
                <div className="flex items-center gap-4 relative">
                  {/* Yin-Yang with rotation animation */}
                  <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                    className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl
                      bg-gradient-to-br from-cyan-500/20 to-purple-500/20 dark:from-cyan-600/20 dark:to-purple-600/20
                      flex items-center justify-center"
                  >
                    <span className="text-xl sm:text-2xl">☯</span>
                  </motion.div>

                  {/* Quote text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base text-slate-100 dark:text-slate-800 leading-relaxed font-light italic">
                      "{currentQuote.text}"
                    </p>
                    <p className="text-[10px] sm:text-xs text-cyan-400/80 dark:text-cyan-600/80 mt-2 text-right font-medium">
                      — {currentQuote.source}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 4, ease: "linear" }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-purple-500 origin-left rounded-b-2xl"
                />
              </motion.div>
            )}
          </AnimatePresence>

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
