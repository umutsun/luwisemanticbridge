'use client';

import React, { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bot, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';

interface ChatbotSettings {
    greeting?: string;
    welcomeMessage?: string;
}

interface ModernWelcomeProps {
    chatbotSettings: ChatbotSettings;
    userName?: string;
    suggestions: string[];
    isSuggestionsLoading: boolean;
    onSuggestionClick: (question: string) => void;
}

const ModernWelcome = memo(function ModernWelcome({
    chatbotSettings,
    userName,
    suggestions,
    isSuggestionsLoading,
    onSuggestionClick
}: ModernWelcomeProps) {
    const { t } = useTranslation();

    const handleSuggestionKeyDown = useCallback((e: React.KeyboardEvent, question: string) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSuggestionClick(question);
        }
    }, [onSuggestionClick]);

    const displayName = userName?.split(' ')[0] || t('chat.user', 'Kullanıcı');

    return (
        <section
            className="modern-animate-fade-in"
            role="region"
            aria-label={t('chat.welcomeSection', 'Hoş geldiniz')}
        >
            {/* Welcome Message - Zen Style */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="text-center py-8 sm:py-12 mt-2 sm:mt-4 px-4"
            >
                {/* Zen decorative element */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="mb-4 sm:mb-6"
                    aria-hidden="true"
                >
                    <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20 flex items-center justify-center border border-violet-200/50 dark:border-violet-500/20">
                        <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-violet-600 dark:text-violet-400" />
                    </div>
                </motion.div>

                <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight mb-2 sm:mb-3 modern-text">
                    {chatbotSettings.greeting || t('chat.greeting', 'Merhaba')}, {displayName}
                </h2>
                <p className="modern-text-secondary max-w-md mx-auto text-sm leading-relaxed">
                    {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'Size nasıl yardımcı olabilirim?')}
                </p>
            </motion.div>

            {/* Suggestions Grid - Zen Style */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-w-3xl mx-auto px-3 sm:px-4"
                role="list"
                aria-label={t('chat.suggestions', 'Önerilen sorular')}
            >
                {isSuggestionsLoading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                        <div
                            key={`skeleton-${index}`}
                            className="p-3 sm:p-4 rounded-xl sm:rounded-2xl modern-glass modern-border"
                            role="listitem"
                            aria-hidden="true"
                        >
                            <div className="flex items-center gap-2 sm:gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-700 modern-animate-pulse" />
                                <Skeleton className="h-4 w-3/4 bg-slate-100 dark:bg-slate-700" />
                            </div>
                        </div>
                    ))
                ) : (
                    suggestions.map((question, index) => (
                        <motion.button
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + index * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => onSuggestionClick(question)}
                            onKeyDown={(e) => handleSuggestionKeyDown(e, question)}
                            className="group relative p-3 sm:p-4 text-left rounded-xl sm:rounded-2xl modern-glass modern-border modern-border-hover hover:shadow-lg hover:shadow-violet-500/5 dark:hover:shadow-violet-500/10 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                            role="listitem"
                            aria-label={t('chat.askQuestion', 'Soru sor: {{question}}', { question })}
                        >
                            <div className="flex items-start gap-2 sm:gap-3">
                                <div
                                    className="mt-0.5 p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-500/10 dark:to-indigo-500/10 text-violet-600 dark:text-violet-400 group-hover:scale-105 transition-transform duration-300"
                                    aria-hidden="true"
                                >
                                    <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <span className="text-xs sm:text-sm modern-text font-medium leading-relaxed group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    {question}
                                </span>
                            </div>
                        </motion.button>
                    ))
                )}
            </motion.div>
        </section>
    );
});

export default ModernWelcome;
