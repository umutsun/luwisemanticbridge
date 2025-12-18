import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, User, ExternalLink } from 'lucide-react';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { ChatSources } from './ChatSources';
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
  relatedTopics?: Array<{
    title: string;
    description: string;
  }>;
  context?: string[];
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
}

interface ChatMessageProps {
  message: Message;
  lastUserQuery: string;
  ragSettings: {
    minResults: number;
    maxResults: number;
    similarityThreshold: number;
  };
  visibleSourcesCount: { [key: string]: number };
  setVisibleSourcesCount: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>;
  onSourceClick: (source: Record<string, unknown>) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  lastUserQuery,
  ragSettings,
  visibleSourcesCount,
  setVisibleSourcesCount,
  onSourceClick
}) => {
  const { t } = useTranslation();

  return (
    <motion.div
      key={message.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {/* Message Content - Full width on mobile */}
      <div className={`w-full max-w-[95%] sm:max-w-[85%] md:max-w-[80%] ${message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}>
        <Card className={`${message.role === 'user'
          ? message.isFromSource
            ? 'bg-yellow-100 text-black border-yellow-400 dark:bg-yellow-900 dark:text-yellow-100 dark:border-yellow-600'
            : 'bg-black text-white dark:bg-gray-900 dark:text-gray-100'
          : message.isError
            ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
            : 'bg-card'
          } shadow-sm`}>
          <CardContent className="p-2.5 sm:p-3">
            {message.isTyping ? (
              <MessageSkeleton />
            ) : (
              <>
                {message.isStreaming ? (
                  <MessageSkeleton type="generating" />
                ) : (
                  <div className="flex items-start gap-2">
                    {/* Inline Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {message.role === 'user' ? (
                        message.isFromSource ? (
                          <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-70" />
                        ) : (
                          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-70" />
                        )
                      ) : (
                        <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                      )}
                    </div>
                    <p
                      className="text-[13px] sm:text-sm whitespace-pre-wrap flex-1 leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: message.content
                          .replace(/\*\*\[([0-9,\s]+)\]\*\*/g, '<strong>[$1]</strong>')
                          .replace(/(?<!\*\*)\[([0-9,\s]+)\](?!\*\*)/g, '<strong>[$1]</strong>')
                          .replace(/\n/g, '<br/>')
                      }}
                    />
                  </div>
                )}

                {/* Sources Section */}
                {message.sources && message.sources.length > 0 && (
                  <ChatSources
                    messageId={message.id}
                    sources={message.sources}
                    lastUserQuery={lastUserQuery}
                    ragSettings={ragSettings}
                    visibleSourcesCount={visibleSourcesCount}
                    setVisibleSourcesCount={setVisibleSourcesCount}
                    onSourceClick={onSourceClick}
                  />
                )}

                {/* Timestamp & Metrics - Compact on mobile */}
                <div className="flex justify-end mt-1.5 sm:mt-2">
                  <div className="text-[8px] sm:text-[9px] font-medium opacity-40 text-right">
                    {message.role === 'assistant' && message.isStreaming ? (
                      <span className="tabular-nums">
                        {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })} • {Math.floor((Date.now() - message.timestamp.getTime()) / 1000)}s
                      </span>
                    ) : (
                      <span className="tabular-nums">
                        {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        {message.responseTime && message.role === 'assistant' && (
                          <>
                            <span className="hidden sm:inline">
                              {' • '}{(message.responseTime / 1000).toFixed(1)}s
                              {message.tokens?.total && (
                                <> • {message.tokens.total.toLocaleString('tr-TR')} tk</>
                              )}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
};
