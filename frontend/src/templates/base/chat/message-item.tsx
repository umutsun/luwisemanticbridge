'use client';

import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';
import { Message } from '@/types/chat';
import { SourceCitation } from './source-citation';
import { MessageSkeleton } from './message-skeleton';
import { useTranslation } from 'react-i18next';

/**
 * Highlights repeating keywords in text with markup
 */
function highlightRepeatingKeywords(text: string, keywords: string[]): string {
  if (!keywords || keywords.length === 0) return text;

  // Create a regex pattern for each keyword (case-insensitive)
  const keywordPatterns = keywords.map(keyword =>
    new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
  );

  let highlightedText = text;

  // Apply highlighting for each keyword
  keywordPatterns.forEach((pattern) => {
    highlightedText = highlightedText.replace(pattern, (match) => {
      return `<mark class="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded font-medium">${match}</mark>`;
    });
  });

  return highlightedText;
}

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';

  // Show skeleton loading for streaming assistant messages
  if (message.isStreaming && message.isLoading && !isUser) {
    return (
      <MessageSkeleton
        type={message.status === 'searching' ? 'searching' : message.status === 'generating' ? 'generating' : 'default'}
        message={message.statusMessage}
      />
    );
  }

  // Calculate response quality based on sources
  const getResponseQuality = () => {
    if (isUser || !message.sources) return null;
    const sourceCount = message.sources.length;
    if (sourceCount >= 5) return { text: t('chatInterface.quality.excellent', 'Excellent'), color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    if (sourceCount >= 3) return { text: t('chatInterface.quality.good', 'Good'), color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' };
    if (sourceCount >= 1) return { text: t('chatInterface.quality.medium', 'Medium'), color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' };
    return { text: t('chatInterface.quality.low', 'Low'), color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-900/30' };
  };

  const responseQuality = getResponseQuality();

  // Extract keywords from sources for highlighting
  const getKeywordsFromSources = (): string[] => {
    if (!message.sources || message.sources.length === 0) return [];

    const allKeywords: string[] = [];
    message.sources.forEach(source => {
      if (source.sourceTable) {
        allKeywords.push(source.sourceTable.toLowerCase());
      }
      if (source.category) {
        allKeywords.push(source.category.toLowerCase());
      }
      if (source.title) {
        // Extract potential keywords from title
        const titleWords = source.title.toLowerCase().split(/\s+/);
        allKeywords.push(...titleWords.filter(word => word.length > 3));
      }
    });

    // Return unique keywords, limited to important ones
    return [...new Set(allKeywords)].slice(0, 10);
  };

  const keywords = getKeywordsFromSources();

  // Apply highlighting to the first paragraph of AI response
  const getProcessedContent = () => {
    if (isUser || !keywords.length) return message.content;

    // Split content into paragraphs
    const paragraphs = message.content.split('\n\n');
    if (paragraphs.length === 0) return message.content;

    // Apply highlighting to the first paragraph only
    const firstParagraph = highlightRepeatingKeywords(paragraphs[0], keywords);
    const remainingParagraphs = paragraphs.slice(1).join('\n\n');

    return firstParagraph + (remainingParagraphs ? '\n\n' + remainingParagraphs : '');
  };

  const processedContent = getProcessedContent();

  return (
    <div className={cn(
      'flex group animate-in slide-in-from-bottom-2 duration-300',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 min-w-0 max-w-[90%] sm:max-w-[80%] shadow-md transition-all duration-200 hover:shadow-lg',
        isUser
          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/25'
          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
      )}>
        {/* Inline bot avatar */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Bot className="w-3 h-3 text-white" />
            </span>
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">{t('chatInterface.assistant', 'Asistan')}</span>
          </div>
        )}
        {/* Response quality indicator for assistant messages */}
        {responseQuality && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('chatInterface.responseQuality', 'Response Quality')}:</span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              responseQuality.bgColor,
              responseQuality.color
            )}>
              {responseQuality.text}
            </span>
            {message.sources && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({message.sources.length} {t('chatInterface.topics', 'topics')})
              </span>
            )}
          </div>
        )}

        <div className={cn(
          'prose prose-sm max-w-none',
          isUser ? 'prose-invert' : 'prose-gray dark:prose-invert',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
        )}
          dangerouslySetInnerHTML={{ __html: processedContent }}
        />

        {message.sources && message.sources.length > 0 && (
          <SourceCitation
            sources={message.sources}
            onExcerptClick={(question) => {
              // Send the question to the input field
              const inputEvent = new CustomEvent('addToInput', { detail: question });
              window.dispatchEvent(inputEvent);
            }}
          />
        )}

        <div className={cn(
          'text-xs mt-2 opacity-0 group-hover:opacity-70 transition-all duration-200',
          isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
        )}>
          {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}