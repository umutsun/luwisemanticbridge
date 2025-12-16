'use client';

import React, { forwardRef, memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ModernInputAreaProps {
    inputText: string;
    placeholder?: string;
    isLoading: boolean;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    disabled?: boolean;
}

const ModernInputArea = memo(forwardRef<HTMLTextAreaElement, ModernInputAreaProps>(
    ({ inputText, placeholder, isLoading, onInputChange, onSend, onKeyDown, disabled = false }, ref) => {
        const { t } = useTranslation();

        const handleSend = useCallback(() => {
            if (inputText.trim() && !isLoading && !disabled) {
                onSend();
            }
        }, [inputText, isLoading, disabled, onSend]);

        const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
            // Submit on Enter (without Shift)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            } else {
                onKeyDown(e);
            }
        }, [handleSend, onKeyDown]);

        const isDisabled = isLoading || disabled;
        const canSend = inputText.trim().length > 0 && !isDisabled;

        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 pb-safe bg-gradient-to-t from-slate-50 dark:from-slate-900 via-slate-50/95 dark:via-slate-900/95 to-transparent">
                <div className="max-w-3xl mx-auto">
                    {/* Input Container */}
                    <div
                        className="relative flex items-end gap-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 transition-shadow duration-200 focus-within:shadow-xl focus-within:shadow-violet-500/10 focus-within:border-violet-300 dark:focus-within:border-violet-600"
                        role="form"
                        aria-label={t('chat.inputForm', 'Mesaj gönderme formu')}
                    >
                        <Textarea
                            ref={ref}
                            value={inputText}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder || t('chat.placeholder', 'Sorunuzu yazın...')}
                            className="min-h-[44px] sm:min-h-[50px] max-h-[120px] sm:max-h-[150px] w-full bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-2.5 sm:py-3 px-3 sm:px-4 text-sm sm:text-base text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 leading-relaxed"
                            disabled={isDisabled}
                            aria-label={t('chat.messageInput', 'Mesajınızı yazın')}
                            aria-describedby="input-help"
                        />

                        {/* Send Button */}
                        <Button
                            onClick={handleSend}
                            disabled={!canSend}
                            size="icon"
                            className={`flex-shrink-0 mb-0.5 sm:mb-1 mr-0.5 sm:mr-1 h-9 w-9 sm:h-10 sm:w-10 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                                canSend
                                    ? 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
                                    : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            }`}
                            aria-label={isLoading ? t('chat.sending', 'Gönderiliyor...') : t('chat.send', 'Gönder')}
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" aria-hidden="true" />
                            ) : (
                                <Send className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                            )}
                        </Button>
                    </div>

                    {/* Helper Text */}
                    <div
                        id="input-help"
                        className="flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-2 mt-2 sm:mt-3 px-2"
                    >
                        <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-500 font-medium">
                            <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-mono text-[9px]">
                                Enter
                            </kbd>
                            <span className="hidden sm:inline"> {t('chat.input.send', 'gönder')}, </span>
                            <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-mono text-[9px]">
                                Shift+Enter
                            </kbd>
                            <span className="hidden sm:inline"> {t('chat.input.newLine', 'yeni satır')}</span>
                            <span className="sm:hidden">{t('chat.input.helpMobile', 'Göndermek için butona dokunun')}</span>
                        </p>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-600 font-medium tracking-wide uppercase">
                            {t('chat.disclaimer', 'YAPAY ZEKA HATA YAPABİLİR.')}
                        </p>
                    </div>
                </div>
            </div>
        );
    }
));

ModernInputArea.displayName = 'ModernInputArea';

export default ModernInputArea;
