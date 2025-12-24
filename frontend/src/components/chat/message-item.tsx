'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { User, Bot, FileText, Volume2, Pause, Loader2 } from 'lucide-react';
import { Message } from '@/types/chat';
import { SourceCitation } from './source-citation';
import { MessageSkeleton } from './message-skeleton';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import { fetchWithAuth } from '@/lib/auth-fetch';

// Format file size for display
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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
      return `<mark class="bg-slate-200 dark:bg-slate-700/70 text-slate-800 dark:text-slate-100 px-1 py-0.5 rounded font-medium">${match}</mark>`;
    });
  });

  return highlightedText;
}

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

  // Audio player hook for TTS
  const { isPlaying, isLoading, play, pause, stop } = useAudioPlayer({
    onError: (error) => {
      console.error('[MessageItem] TTS error:', error);
    }
  });

  // Fetch voice settings on mount
  useEffect(() => {
    fetchWithAuth(`${apiUrl}/api/v2/chat/voice-settings`)
      .then(res => res.json())
      .then(data => {
        setVoiceOutputEnabled(data.enableVoiceOutput || false);
      })
      .catch(err => {
        console.error('[MessageItem] Failed to fetch voice settings:', err);
      });
  }, [apiUrl]);

  // Handle TTS play/pause
  const handleTTSToggle = () => {
    if (isPlaying) {
      pause();
    } else {
      // Extract plain text from markdown content
      const plainText = message.content
        .replace(/#{1,6}\s/g, '') // Remove headers
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
        .replace(/\*([^*]+)\*/g, '$1') // Remove italic
        .replace(/`([^`]+)`/g, '$1') // Remove code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
        .replace(/^\s*[-*]\s/gm, '') // Remove list markers
        .replace(/^\s*\d+\.\s/gm, '') // Remove numbered list markers
        .trim();

      play(plainText);
    }
  };

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
    if (sourceCount >= 5) return { text: 'Çok İyi', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/70' };
    if (sourceCount >= 3) return { text: 'İyi', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/70' };
    if (sourceCount >= 1) return { text: 'Orta', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/70' };
    return { text: 'Düşük', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-900/70' };
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
      'flex gap-3 group animate-in slide-in-from-bottom-2 duration-300',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg flex-shrink-0 ring-2 ring-blue-100 dark:ring-blue-900/30">
          <Bot className="w-4 h-4" />
        </div>
      )}
      
      <div className={cn(
        'rounded-2xl px-4 py-3 max-w-[80%] shadow-md transition-all duration-200 hover:shadow-lg',
        isUser 
          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/25' 
          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
      )}>
        {/* Response quality indicator for assistant messages */}
        {responseQuality && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">Yanıt Kalitesi:</span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              responseQuality.bgColor,
              responseQuality.color
            )}>
              {responseQuality.text}
            </span>
            {message.sources && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({message.sources.length} konu)
              </span>
            )}
          </div>
        )}
        
        {isUser ? (
          <div>
            <div className="text-sm whitespace-pre-wrap">
              {message.content}
            </div>
            {/* PDF attachment badge for user messages */}
            {message.pdfAttachment && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-blue-400/30">
                <FileText className="w-3.5 h-3.5 text-blue-100" />
                <span className="text-xs text-blue-100 truncate max-w-[200px]" title={message.pdfAttachment.filename}>
                  {message.pdfAttachment.filename}
                </span>
                <span className="text-xs text-blue-200/70">
                  ({formatFileSize(message.pdfAttachment.size)})
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className={cn(
            'prose prose-sm max-w-none',
            'prose-headings:text-gray-900 dark:prose-headings:text-gray-100',
            'prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2',
            'prose-h1:text-lg prose-h2:text-base prose-h3:text-sm',
            'prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:my-2 prose-p:leading-relaxed',
            'prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-semibold',
            'prose-ul:my-2 prose-ul:pl-4 prose-li:my-1',
            'prose-ol:my-2 prose-ol:pl-4',
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
          )}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom heading styles
                h1: ({ children }) => (
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mt-4 mb-2">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">
                    {children}
                  </h3>
                ),
                // Paragraphs
                p: ({ children }) => (
                  <p className="text-gray-700 dark:text-gray-300 my-2 leading-relaxed">
                    {children}
                  </p>
                ),
                // Bold text
                strong: ({ children }) => (
                  <strong className="font-semibold text-gray-900 dark:text-white">
                    {children}
                  </strong>
                ),
                // Unordered lists
                ul: ({ children }) => (
                  <ul className="list-disc list-outside ml-4 my-2 space-y-1">
                    {children}
                  </ul>
                ),
                // Ordered lists
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside ml-4 my-2 space-y-1">
                    {children}
                  </ol>
                ),
                // List items
                li: ({ children }) => (
                  <li className="text-gray-700 dark:text-gray-300 pl-1">
                    {children}
                  </li>
                ),
                // Blockquotes (for warnings/notes)
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 pl-4 py-2 my-3 text-amber-800 dark:text-amber-200 italic">
                    {children}
                  </blockquote>
                ),
                // Code blocks
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        
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
          'flex items-center justify-between mt-2 opacity-0 group-hover:opacity-70 transition-all duration-200',
          isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
        )}>
          <span className="text-xs">
            {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          {/* TTS button for assistant messages */}
          {!isUser && voiceOutputEnabled && message.content && !message.isLoading && (
            <button
              onClick={handleTTSToggle}
              disabled={isLoading}
              className={cn(
                'p-1 rounded transition-colors',
                isPlaying
                  ? 'text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                  : isLoading
                    ? 'text-gray-400 cursor-wait'
                    : 'hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
              title={isPlaying ? 'Durdur' : isLoading ? 'Yükleniyor...' : 'Sesli dinle'}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
      
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white shadow-lg flex-shrink-0 ring-2 ring-gray-200 dark:ring-gray-700">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}