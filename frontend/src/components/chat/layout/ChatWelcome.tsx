import React from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChatWelcomeProps {
  chatbotSettings: {
    welcomeMessage?: string;
    greeting?: string;
    enableSuggestions: boolean;
  };
  user: {
    name?: string;
  } | null;
  suggestedQuestions: string[];
  isSuggestionsLoading: boolean;
  onSuggestionClick: (question: string) => void;
  settingsLoaded: boolean;
}

export const ChatWelcome: React.FC<ChatWelcomeProps> = ({
  chatbotSettings,
  user,
  suggestedQuestions,
  isSuggestionsLoading,
  onSuggestionClick,
  settingsLoaded
}) => {
  const { t } = useTranslation();

  // Get suggestions - already shuffled from backend, take first 4
  const memoizedSuggestions = React.useMemo(() => {
    if (suggestedQuestions.length === 0) return [];
    // Remove duplicates and take first 4
    return Array.from(new Set(suggestedQuestions)).slice(0, 4);
  }, [suggestedQuestions]);

  return (
    <>
      {/* Welcome Message */}
      {settingsLoaded && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex gap-3 justify-start mb-8"
        >
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-primary/10">
              <Bot className="w-5 h-5 text-primary" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="rounded-lg p-4 bg-card border">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                {chatbotSettings.welcomeMessage || t('chatInterface.welcomeMessage', 'Merhaba! Size nasıl yardımcı olabilirim?')}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Suggestions */}
      {chatbotSettings.enableSuggestions && (
        <motion.div
          key="suggestions-container"
          initial={settingsLoaded ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: settingsLoaded ? 0 : 0.3 }}
          className="my-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {isSuggestionsLoading ? (
              // Loading skeleton
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="text-left p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))
            ) : (
              // Actual suggestions
              memoizedSuggestions.map((question, index) => (
                <motion.button
                  key={`suggestion-${question.substring(0, 20)}-${index}`}
                  initial={settingsLoaded ? false : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: settingsLoaded ? 0 : index * 0.05 }}
                  onClick={() => onSuggestionClick(question)}
                  className="text-left p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-primary/60" />
                      <span className="text-sm">{question}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </>
  );
};
