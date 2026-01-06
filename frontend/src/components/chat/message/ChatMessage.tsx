import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, User, ExternalLink } from 'lucide-react';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { ChatSources } from './ChatSources';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Format markdown content for better visual presentation
 * - Adds line breaks before/after bold headings for paragraph separation
 * - Converts inline numbered items to proper list format
 * - Handles strict RAG mode headers (HUKUKİ SONUÇ, KAYNAK DEĞERLENDİRMESİ, etc.)
 */
function formatMarkdownContent(content: string): string {
  if (!content) return '';

  // Known section headers that need line breaks (case-insensitive)
  const sectionHeaders = [
    // Strict RAG mode v3 headers (simplified - current)
    'CEVAP',
    'ALINTI',
    'ANSWER',
    'QUOTE',
    // Strict RAG mode v2 headers (Turkish)
    'BULGU',
    'KAYNAK BİLGİSİ',
    'KAYNAK BILGISI',
    'SONUÇ',
    'SONUC',
    'DOĞRUDAN ALINTI',
    'DOGRUDAN ALINTI',
    'KAYNAK SINIRLAMASI',
    // Strict RAG mode v1 headers (Turkish)
    'HUKUKİ SONUÇ',
    'HUKUKI SONUÇ',
    'KAYNAK DEĞERLENDİRMESİ',
    'KAYNAK DEGERLENDIRMESI',
    'DOĞRUDAN ALINTILAR',
    'DOGRUDAN ALINTILAR',
    'SINIRLAR VE RİSKLER',
    'SINIRLAR VE RISKLER',
    'SINIRLAR',
    'İLGİLİ MEVZUAT',
    'ILGILI MEVZUAT',
    'KAYNAK LİSTESİ',
    'KAYNAK LISTESI',
    'KAYNAK YETERSİZLİĞİ',
    'KAYNAK YETERSIZLIGI',
    // Strict RAG mode headers (English)
    'FINDING',
    'SOURCE INFO',
    'CONCLUSION',
    'DIRECT QUOTE',
    'SOURCE LIMITATION',
    'LEGAL CONCLUSION',
    'SOURCE EVALUATION',
    'DIRECT QUOTES',
    'LIMITATIONS',
    'INSUFFICIENT SOURCES',
    // Legacy headers
    'Özet',
    'Sonuç',
    'Tavsiyeler',
    'Öneriler',
  ];

  let result = content;

  // Add line breaks before known section headers
  sectionHeaders.forEach(header => {
    const pattern = new RegExp(`([^\\n])(\\s*)(\\*\\*${header}:?\\*\\*)`, 'gi');
    result = result.replace(pattern, '$1\n\n$3');
  });

  // Handle ⚠️ warning emoji at start of sections
  result = result.replace(/([^\n])(⚠️)/g, '$1\n\n$2');

  // Handle --- section dividers
  result = result.replace(/([^\n])(---)/g, '$1\n\n$2');

  return result
    // Numbered items with parenthesis: "1)" "2)" etc → new line before
    .replace(/\s+(\d+)\)\s+/g, '\n\n$1. ')
    // Numbered items with dot inline: "1." "2." etc (when not at start) → new line before
    .replace(/([.!?:,])\s+(\d+)\.\s+/g, '$1\n\n$2. ')
    // Bold heading after sentence end → new line before (catches inline **Özet** etc.)
    .replace(/([.!?])\s*(\*\*[^*]+\*\*)/g, '$1\n\n$2')
    // Bold text at start of line followed by text → add newline after
    .replace(/^(\*\*[^*]+\*\*)\s*(?=[A-ZÇĞİÖŞÜa-zçğıöşü])/gm, '$1\n\n')
    // Bold text with colon → treat as heading, add newlines
    .replace(/(\*\*[^*]+:\*\*)\s*/g, '\n\n$1\n')
    // Standalone bold lines → add newline before and after
    .replace(/\n(\*\*[^*]+\*\*)\n/g, '\n\n$1\n\n')
    // Bold at very start → add newline after
    .replace(/^(\*\*[^*]+\*\*)\s+/m, '$1\n\n')
    // Dash/bullet items inline → new line before
    .replace(/([.!?])\s+[-•]\s+/g, '$1\n\n- ')
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
                    {message.role === 'user' ? (
                      <p className="text-[13px] sm:text-sm whitespace-pre-wrap flex-1 leading-relaxed">
                        {message.content}
                      </p>
                    ) : (
                      <div className="flex-1 prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1.5 prose-p:leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => (
                              <h1 className="text-base sm:text-lg font-bold mt-4 mb-2 pb-1 border-b border-border first:mt-0">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-sm sm:text-base font-semibold mt-4 mb-2 first:mt-0">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-[13px] sm:text-sm font-semibold mt-3 mb-1 first:mt-0">
                                {children}
                              </h3>
                            ),
                            p: ({ children }) => (
                              <p className="text-[13px] sm:text-sm my-2 leading-relaxed first:mt-0 last:mb-0">
                                {children}
                              </p>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-bold text-foreground">
                                {children}
                              </strong>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc list-outside ml-4 my-2 space-y-1 text-[13px] sm:text-sm">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal list-outside ml-4 my-2 space-y-1 text-[13px] sm:text-sm">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="pl-0.5 leading-relaxed">
                                {children}
                              </li>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 pl-3 py-2 my-3 text-amber-800 dark:text-amber-200 italic text-[13px] sm:text-sm">
                                {children}
                              </blockquote>
                            ),
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                                  {children}
                                </code>
                              ) : (
                                <code className="block bg-muted p-2 rounded-lg text-xs font-mono overflow-x-auto my-2">
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {formatMarkdownContent(message.content)}
                        </ReactMarkdown>
                      </div>
                    )}
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
