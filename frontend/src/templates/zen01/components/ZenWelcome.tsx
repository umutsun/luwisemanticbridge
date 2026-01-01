'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ZenWelcomeProps } from '../types';

/**
 * Zen01 Welcome Component
 * Displays greeting and suggestion pills when no messages exist
 */
export const ZenWelcome: React.FC<ZenWelcomeProps> = ({
  chatbotSettings,
  user,
  suggestions,
  onSuggestionClick,
  isLoading,
}) => {
  const { t } = useTranslation();
  const displayName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  return (
    <div className="zen01-welcome zen01-slide-up">
      {/* Animated Title */}
      <h1 className="zen01-welcome-title">
        {chatbotSettings.greeting || t('chat.greeting', 'Merhaba')}, {displayName}
      </h1>
      <p className="zen01-welcome-subtitle">
        {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'Size nasil yardimci olabilirim?')}
      </p>

      {/* Suggestion Pills */}
      {chatbotSettings.enableSuggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          {isLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 w-32 rounded-full bg-cyan-500/10 animate-pulse"
                />
              ))}
            </div>
          ) : (
            suggestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick(q)}
                className="zen01-suggestion"
              >
                <Sparkles className="h-3.5 w-3.5 mr-2 inline-block opacity-60" />
                {q}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ZenWelcome;
