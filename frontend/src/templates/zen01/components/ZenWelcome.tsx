'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ZenWelcomeProps } from '../types';

/**
 * Zen01 Welcome Component
 * Displays greeting and recent conversations when no messages exist
 * Suggestions are now shown via /suggest command
 */
export const ZenWelcome: React.FC<ZenWelcomeProps> = ({
  chatbotSettings,
  user,
  recentConversations,
  onConversationClick,
}) => {
  const { t } = useTranslation();
  const displayName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  return (
    <div className="zen01-welcome zen01-slide-up">
      {/* Animated Title */}
      <h1 className="zen01-welcome-title">
        {chatbotSettings.greeting || t('chat.greeting', 'Merhaba')}, {displayName}
      </h1>
      <p className="zen01-welcome-subtitle text-slate-600 dark:text-slate-400">
        {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'Size nasıl yardımcı olabilirim?')}
      </p>

      {/* Recent Conversations */}
      {recentConversations && recentConversations.length > 0 && onConversationClick && (
        <div className="mt-10">
          <h3 className="zen01-recent-title">
            <MessageSquare className="h-4 w-4" />
            Son Konuşmalar
          </h3>
          <div className="zen01-recent-grid">
            {recentConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onConversationClick(conv.id)}
                className="zen01-recent-card"
              >
                <span className="zen01-recent-card-title">{conv.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ZenWelcome;
