'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ZenWelcomeProps } from '../types';

/**
 * Zen01 Welcome Component
 * Displays greeting message when no messages exist
 * Recent conversations and suggestions are accessed via slash commands
 */
export const ZenWelcome: React.FC<ZenWelcomeProps> = ({
  chatbotSettings,
  user,
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
    </div>
  );
};

export default ZenWelcome;
