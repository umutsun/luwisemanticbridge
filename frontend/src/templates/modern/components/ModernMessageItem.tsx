'use client';

import React, { useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
    Bot,
    User,
    ExternalLink,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Loader2,
    Zap,
    Copy,
    Check,
    RefreshCw,
    AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Source {
    title?: string;
    content?: string;
    excerpt?: string;
    sourceTable?: string;
    sourceType?: string;
    score?: number;
    summary?: string;
    keywords?: string[];
    category?: string;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sources?: Source[];
    isTyping?: boolean;
    isFromSource?: boolean;
    isStreaming?: boolean;
    isError?: boolean;
    responseTime?: number;
    startTime?: number;
    tokens?: {
        input?: number;
        output?: number;
        total?: number;
    };
    fastMode?: boolean;
}

interface ModernMessageItemProps {
    message: Message;
    visibleSourcesCount: number;
    initialSourcesCount: number;
    lastUserQuery: string;
    onSourceClick: (source: Source) => void;
    onShowMoreSources: (messageId: string, newCount: number, totalCount: number) => void;
    onShowLessSources: (messageId: string, initialCount: number) => void;
    onRetry?: (messageContent: string) => void;
    getSemanticKeywords: (source: Source) => string[];
    getKeywordColor: (keyword: string, isBoosted: boolean) => string;
}

const ModernMessageItem = memo(function ModernMessageItem({
    message,
    visibleSourcesCount,
    initialSourcesCount,
    lastUserQuery,
    onSourceClick,
    onShowMoreSources,
    onShowLessSources,
    onRetry,
    getSemanticKeywords,
    getKeywordColor
}: ModernMessageItemProps) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const sortedSources = message.sources ? [...message.sources].sort((a, b) => (b.score || 0) - (a.score || 0)) : [];
    const visibleSources = sortedSources.slice(0, visibleSourcesCount);
    const hasMore = sortedSources.length > visibleSourcesCount;
    const canShowLess = visibleSourcesCount > initialSourcesCount;

    // Copy message content
    const handleCopy = useCallback(async () => {
        try {
            // Strip HTML tags for plain text copy
            const plainText = message.content
                .replace(/<[^>]*>/g, '')
                .replace(/\*\*\[([0-9,\s]+)\]\*\*/g, '[$1]');

            await navigator.clipboard.writeText(plainText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [message.content]);

    // Retry failed message
    const handleRetry = useCallback(() => {
        if (onRetry && message.isError) {
            onRetry(lastUserQuery);
        }
    }, [onRetry, message.isError, lastUserQuery]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`flex gap-3 sm:gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            role="listitem"
            aria-label={message.role === 'user' ? t('chat.userMessage', 'Kullanıcı mesajı') : t('chat.assistantMessage', 'Asistan mesajı')}
        >
            {/* Assistant Avatar */}
            {message.role === 'assistant' && (
                <div
                    className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/20"
                    aria-hidden="true"
                >
                    <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
            )}

            <div className={`max-w-[90%] sm:max-w-[85%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                {/* Message Bubble */}
                <div
                    className={`group relative p-3 sm:p-4 shadow-sm transition-all duration-200 ${
                        message.role === 'user'
                            ? message.isFromSource
                                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-700 rounded-2xl rounded-tr-sm'
                                : 'bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-2xl rounded-tr-sm shadow-lg shadow-violet-500/20'
                            : message.isError
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-200 rounded-2xl rounded-tl-sm'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm hover:shadow-md'
                    }`}
                >
                    {/* From Source Badge */}
                    {message.role === 'user' && message.isFromSource && (
                        <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="text-xs font-medium">{t('chat.fromSource', 'Kaynaktan')}</span>
                        </div>
                    )}

                    {/* Error Icon */}
                    {message.isError && (
                        <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                            <AlertCircle className="w-4 h-4" aria-hidden="true" />
                            <span className="text-xs font-medium">{t('chat.error', 'Hata')}</span>
                        </div>
                    )}

                    {/* Message Content */}
                    {message.isTyping || (message.isStreaming && !message.content) ? (
                        <div className="flex gap-1.5 py-2" role="status" aria-label={t('chat.typing', 'Yazıyor...')}>
                            <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    ) : (
                        <div className="prose prose-slate dark:prose-invert prose-sm max-w-none">
                            <p
                                className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base"
                                dangerouslySetInnerHTML={{
                                    __html: message.content
                                        .replace(/\*\*\[([0-9,\s]+)\]\*\*/g, '<strong class="text-violet-600 dark:text-violet-300 font-semibold">[$1]</strong>')
                                        .replace(/\n/g, '<br/>')
                                }}
                            />
                        </div>
                    )}

                    {/* Action Buttons - Show on hover for assistant messages */}
                    {message.role === 'assistant' && !message.isStreaming && !message.isTyping && (
                        <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1">
                            {/* Copy Button */}
                            <button
                                onClick={handleCopy}
                                className="p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                                aria-label={copied ? t('chat.copied', 'Kopyalandı') : t('chat.copy', 'Kopyala')}
                                title={copied ? t('chat.copied', 'Kopyalandı') : t('chat.copy', 'Kopyala')}
                            >
                                {copied ? (
                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                )}
                            </button>

                            {/* Retry Button - Only for error messages */}
                            {message.isError && onRetry && (
                                <button
                                    onClick={handleRetry}
                                    className="p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                                    aria-label={t('chat.retry', 'Tekrar Dene')}
                                    title={t('chat.retry', 'Tekrar Dene')}
                                >
                                    <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Sources Section - Hidden in Fast Mode */}
                    {message.sources && message.sources.length > 0 && !message.fastMode && (
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <div
                                className="space-y-2.5 max-h-[400px] sm:max-h-[500px] overflow-y-auto pr-2 modern-scrollbar"
                                role="list"
                                aria-label={t('chat.sources', 'Kaynaklar')}
                            >
                                {visibleSources.map((source, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onSourceClick(source)}
                                        className="group/source w-full text-left p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                                        aria-label={`${t('chat.source', 'Kaynak')} ${idx + 1}: ${source.title || source.summary || t('chat.untitledSource', 'İsimsiz Kaynak')}`}
                                    >
                                        <div className="flex items-start gap-2.5 sm:gap-3">
                                            <div className="min-w-0 flex-1">
                                                {/* Source Number & Category */}
                                                <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                                                    <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-200 border border-violet-300 dark:border-violet-600 font-bold">
                                                        {idx + 1}
                                                    </span>
                                                    {source.category && (
                                                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                                                            {source.category}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Summary/Excerpt */}
                                                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed line-clamp-2 sm:line-clamp-3">
                                                    {source.summary || source.excerpt || source.content || source.title || t('chat.untitledSource', 'İsimsiz Kaynak')}
                                                </p>

                                                {/* Keywords */}
                                                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-1.5 sm:mt-2">
                                                    {getSemanticKeywords(source).slice(0, 3).map((keyword: string, kidx: number) => {
                                                        const isBoosted = kidx < 2 && lastUserQuery.length > 0;
                                                        return (
                                                            <span
                                                                key={kidx}
                                                                className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded border ${getKeywordColor(keyword, isBoosted)}`}
                                                            >
                                                                {keyword}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover/source:text-violet-500 dark:group-hover/source:text-violet-400 flex-shrink-0 transition-colors" aria-hidden="true" />
                                        </div>
                                    </button>
                                ))}

                                {/* Show more/less buttons */}
                                {(hasMore || canShowLess) && (
                                    <div className="flex items-center justify-center gap-2 pt-2 sm:pt-3">
                                        {hasMore && (
                                            <button
                                                onClick={() => onShowMoreSources(message.id, Math.min(visibleSourcesCount + 5, sortedSources.length), sortedSources.length)}
                                                className="group/btn flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-500/10 hover:bg-violet-200 dark:hover:bg-violet-500/20 border border-violet-300 dark:border-violet-500/20 hover:border-violet-400 dark:hover:border-violet-500/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                                aria-label={t('chat.showMore', 'Daha fazla göster')}
                                            >
                                                <span className="text-[10px] sm:text-xs font-medium text-violet-700 dark:text-violet-400">
                                                    +{Math.min(5, sortedSources.length - visibleSourcesCount)} {t('chat.more', 'daha')}
                                                </span>
                                                <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-violet-700 dark:text-violet-400 group-hover/btn:translate-y-0.5 transition-transform" aria-hidden="true" />
                                            </button>
                                        )}
                                        {canShowLess && (
                                            <button
                                                onClick={() => onShowLessSources(message.id, initialSourcesCount)}
                                                className="group/btn flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-200 dark:bg-slate-700/30 hover:bg-slate-300 dark:hover:bg-slate-700/50 border border-slate-300 dark:border-slate-600/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                                aria-label={t('chat.showLess', 'Daha az göster')}
                                            >
                                                <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 dark:text-slate-400 group-hover/btn:-translate-y-0.5 transition-transform" aria-hidden="true" />
                                                <span className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-400">
                                                    {t('chat.showLess', 'Küçült')}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Message Footer */}
                {message.role === 'assistant' && (
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 sm:mt-2 px-1">
                        <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 tabular-nums">
                            {message.isStreaming && message.startTime ? (
                                <span className="inline-flex items-center gap-1" role="status" aria-label={t('chat.generating', 'Oluşturuluyor')}>
                                    <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" aria-hidden="true" />
                                    {Math.floor((Date.now() - message.startTime) / 1000)}s
                                </span>
                            ) : (
                                <>
                                    <time dateTime={new Date(message.timestamp).toISOString()}>
                                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </time>
                                    {message.responseTime && (
                                        <span aria-label={t('chat.responseTime', 'Yanıt süresi')}>
                                            {' '}&bull; {(message.responseTime / 1000).toFixed(1)}s
                                        </span>
                                    )}
                                    {message.tokens?.total && (
                                        <span className="hidden sm:inline" aria-label={t('chat.tokens', 'Token sayısı')}>
                                            {' '}&bull; {message.tokens.total.toLocaleString()} tokens
                                        </span>
                                    )}
                                </>
                            )}
                        </span>

                        {/* Fast Mode Badge */}
                        {message.fastMode && !message.isStreaming && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[8px] sm:text-[9px] font-medium border border-amber-300 dark:border-amber-700"
                                aria-label={t('chat.fastModeEnabled', 'Hızlı mod aktif')}
                            >
                                <Zap className="w-2 h-2 sm:w-2.5 sm:h-2.5" aria-hidden="true" />
                                {t('chat.fastMode', 'Hızlı Mod')}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* User Avatar */}
            {message.role === 'user' && (
                <div
                    className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center"
                    aria-hidden="true"
                >
                    <User className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
                </div>
            )}
        </motion.div>
    );
});

export default ModernMessageItem;
