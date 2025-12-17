import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {/* Assistant Avatar */}
      {message.role === 'assistant' && (
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-primary/10">
            <Bot className="w-5 h-5 text-primary" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div className={`w-full ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
        <Card className={`${message.role === 'user'
          ? message.isFromSource
            ? 'bg-yellow-100 text-black border-yellow-400 dark:bg-yellow-900 dark:text-yellow-100 dark:border-yellow-600'
            : 'bg-black text-white dark:bg-gray-900 dark:text-gray-100'
          : message.isError
            ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
            : 'bg-card'
          }`}>
          <CardContent className="p-3">
            {message.isTyping ? (
              <MessageSkeleton />
            ) : (
              <>
                {message.isStreaming ? (
                  <MessageSkeleton type="generating" />
                ) : (
                  <div className="flex items-start gap-2">
                    {message.role === 'user' && message.isFromSource && (
                      <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    )}
                    <p
                      className="text-sm whitespace-pre-wrap flex-1"
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

                {/* Timestamp & Metrics */}
                <div className="flex justify-end mt-2">
                  <div className="text-[9px] font-semibold opacity-50 text-right">
                    {message.role === 'assistant' && message.isStreaming ? (
                      <span className="tabular-nums">
                        {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })} • {Math.floor((Date.now() - message.timestamp.getTime()) / 1000)}s
                      </span>
                    ) : (
                      <span className="tabular-nums">
                        {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                        {message.responseTime && message.role === 'assistant' && (
                          <>
                            {' • '}{(message.responseTime / 1000).toFixed(2)}s
                            {message.tokens?.total && (
                              <> • {message.tokens.total.toLocaleString('tr-TR')} tokens</>
                            )}
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

      {/* User Avatar */}
      {message.role === 'user' && (
        <Avatar className="w-8 h-8 order-2">
          <AvatarFallback>
            <User className="w-5 h-5" />
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
};
