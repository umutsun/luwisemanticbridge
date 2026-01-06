'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Clock, Volume2, Pause, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ZenTypingIndicator } from './ZenTypingIndicator';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import type { ZenMessageProps, ZenSource } from '../types';

// Default stop words - can be overridden via settings
const DEFAULT_STOP_WORDS = [
  // Turkish
  've', 'veya', 'ile', 'için', 'göre', 'bir', 'bu', 'şu', 'da', 'de', 'ki',
  'mi', 'mı', 'mu', 'mü', 'ise', 'gibi', 'kadar', 'daha', 'çok', 'az',
  'nasıl', 'neden', 'hangi', 'nerede', 'olarak', 'olan', 'olup', 'olduğu',
  'olabilir', 'olur', 'ancak', 'fakat', 'ama', 'lakin', 'hakkında',
  'üzerine', 'sonra', 'önce', 'arasında', 'dolayı', 'nedeniyle',
  // English
  'the', 'and', 'or', 'but', 'for', 'with', 'from', 'this', 'that', 'what',
  'how', 'why', 'when', 'where', 'which', 'who', 'have', 'has', 'had',
  'been', 'being', 'will', 'would', 'could', 'should', 'about', 'into'
];

/**
 * Extract keywords from user query for highlighting
 * @param query - User's search query
 * @param stopWords - Optional custom stop words list
 * @param minLength - Minimum word length (default: 4)
 * @param maxKeywords - Maximum keywords to extract (default: 5)
 */
function extractKeywords(
  query: string,
  stopWords: string[] = DEFAULT_STOP_WORDS,
  minLength: number = 4,
  maxKeywords: number = 5
): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length >= minLength && !stopWords.includes(word))
    .map(word => word.replace(/[.,;:!?'"()]/g, ''))
    .filter(word => word.length >= minLength)
    .slice(0, maxKeywords);
}

/**
 * Highlight keywords in text with marker class
 */
// Marker colors - like different highlighter pens
const MARKER_COLORS = [
  'zen01-marker-yellow',  // Yellow highlighter
  'zen01-marker-green',   // Green highlighter
  'zen01-marker-pink',    // Pink highlighter
  'zen01-marker-blue',    // Blue highlighter
];

function highlightKeywords(text: string, keywords: string[]): React.ReactNode[] {
  if (!keywords.length) return [text];

  // Sort keywords by length (longest first) to avoid partial matches
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

  // Create regex pattern with word boundaries to avoid splitting words
  // Use (?<![a-zA-ZğüşıöçĞÜŞİÖÇ]) and (?![a-zA-ZğüşıöçĞÜŞİÖÇ]) for Turkish word boundaries
  const turkishWordBoundary = '(?<![a-zA-ZğüşıöçĞÜŞİÖÇ0-9])';
  const turkishWordBoundaryEnd = '(?![a-zA-ZğüşıöçĞÜŞİÖÇ0-9])';

  const pattern = new RegExp(
    `(${sortedKeywords.map(k =>
      turkishWordBoundary + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + turkishWordBoundaryEnd
    ).join('|')})`,
    'gi'
  );

  const parts = text.split(pattern);

  // Track which color to use for each keyword
  const keywordColorMap = new Map<string, string>();
  let colorIndex = 0;

  return parts.map((part, idx) => {
    const matchedKeyword = sortedKeywords.find(k => k.toLowerCase() === part.toLowerCase());
    if (matchedKeyword) {
      // Assign consistent color to each keyword
      const keyLower = matchedKeyword.toLowerCase();
      if (!keywordColorMap.has(keyLower)) {
        keywordColorMap.set(keyLower, MARKER_COLORS[colorIndex % MARKER_COLORS.length]);
        colorIndex++;
      }
      const markerClass = keywordColorMap.get(keyLower);
      return (
        <span key={idx} className={`zen01-marker ${markerClass}`}>
          <span>{part}</span>
        </span>
      );
    }
    return part;
  });
}

/**
 * Preprocess markdown content to ensure proper paragraph breaks
 * LLM often outputs **Header:** or **Header** inline instead of on new lines
 */
function preprocessMarkdown(content: string): string {
  // Known section header patterns in Turkish legal/tax documents
  const sectionHeaders = [
    // Simple strict RAG mode headers (v2 - simplified)
    'CEVAP',
    'ALINTI',
    'ANSWER',
    'QUOTE',
    // Previous strict RAG mode headers (v1)
    'BULGU',
    'KAYNAK BİLGİSİ',
    'KAYNAK BILGISI',
    'SONUÇ',
    'SONUC',
    'DOĞRUDAN ALINTI',
    'DOGRUDAN ALINTI',
    'KAYNAK SINIRLAMASI',
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
    // Legacy headers
    'Hukuki Değerlendirme',
    'Varsayımlar',
    'İlgili Mevzuat ve Dayanaklar',
    'Haklar ve Riskler',
    'Yapılacaklar',
    'Senaryolar',
    'Özet',
    'Sonuç',
    'Tavsiyeler',
    'Öneriler',
    'Dikkat Edilmesi Gerekenler',
    'Yasal Dayanak',
    'Kanuni Düzenleme',
    'Uygulama',
    'Değerlendirme',
    'Açıklama',
    'Genel Bilgi',
    'Detaylar',
    'Önemli Notlar',
    'Uyarı',
    // English strict mode headers
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
  ];

  let result = content;

  // Add line breaks before each known section header
  sectionHeaders.forEach(header => {
    // Match **Header** or **Header:** that's not at start of line
    const pattern = new RegExp(`([^\\n])(\\s)(\\*\\*${header}:?\\*\\*)`, 'gi');
    result = result.replace(pattern, '$1\n\n$3');
  });

  // Also handle generic bold text followed by colon as headers
  // Pattern: space followed by **AnyText:** (with colon)
  result = result.replace(/([^\n])(\s)(\*\*[^*]{2,30}:\*\*)/g, '$1\n\n$3');

  // Handle ⚠️ warning emoji at start of sections
  result = result.replace(/([^\n])(⚠️)/g, '$1\n\n$2');

  // Handle --- section dividers
  result = result.replace(/([^\n])(---)/g, '$1\n\n$2');

  return result;
}

/**
 * Zen01 Message Component
 * Renders user and assistant messages with glassmorphism styling
 */
export const ZenMessage: React.FC<ZenMessageProps> = ({
  message,
  onSourceClick,
  lastUserQuery = '',
  voiceOutputEnabled = false,
}) => {
  const isUser = message.role === 'user';
  const [showAllSources, setShowAllSources] = useState(false);

  // Extract keywords from last user query for highlighting
  const keywords = React.useMemo(() => {
    if (!lastUserQuery || isUser) return [];
    return extractKeywords(lastUserQuery);
  }, [lastUserQuery, isUser]);

  // Audio player hook for TTS
  const { isPlaying, isLoading: isTTSLoading, play, pause } = useAudioPlayer({
    onError: (error) => {
      console.error('[ZenMessage] TTS error:', error);
    }
  });

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
  const visibleSources = showAllSources
    ? message.sources
    : message.sources?.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} zen01-fade-in`}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="zen01-avatar zen01-avatar-assistant flex-shrink-0">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        {/* Message Bubble */}
        <div className={isUser ? 'zen01-message-user' : 'zen01-message-assistant'}>
          <div className="p-4">
            {message.isStreaming ? (
              <div className="flex items-center gap-2">
                <ZenTypingIndicator />
                <span className="text-cyan-400/60 text-sm">Thinking...</span>
              </div>
            ) : isUser ? (
              <div className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            ) : (
              <div className="zen01-markdown prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headings
                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold text-cyan-700 dark:text-cyan-200 mt-4 mb-2 pb-1 border-b border-cyan-500/30">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-semibold text-cyan-700 dark:text-cyan-300 mt-4 mb-2">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 mt-3 mb-1">
                        {children}
                      </h3>
                    ),
                    // Paragraphs with keyword highlighting
                    p: ({ children }) => {
                      // Apply keyword highlighting to text nodes
                      const processChildren = (child: React.ReactNode): React.ReactNode => {
                        if (typeof child === 'string' && keywords.length > 0) {
                          return highlightKeywords(child, keywords);
                        }
                        if (Array.isArray(child)) {
                          return child.map((c, i) => <React.Fragment key={i}>{processChildren(c)}</React.Fragment>);
                        }
                        return child;
                      };

                      return (
                        <p className="text-slate-700 dark:text-slate-200 leading-relaxed my-4 first:mt-0 last:mb-0">
                          {processChildren(children)}
                        </p>
                      );
                    },
                    // Bold - Style as section header when at start of paragraph
                    strong: ({ children }) => (
                      <strong className="font-semibold text-cyan-700 dark:text-cyan-300 inline-block">
                        {children}
                      </strong>
                    ),
                    // Italic
                    em: ({ children }) => (
                      <em className="italic text-slate-600 dark:text-slate-300">
                        {children}
                      </em>
                    ),
                    // Unordered lists
                    ul: ({ children }) => (
                      <ul className="list-disc list-outside ml-4 my-2 space-y-1 text-slate-700 dark:text-slate-200">
                        {children}
                      </ul>
                    ),
                    // Ordered lists
                    ol: ({ children }) => (
                      <ol className="list-decimal list-outside ml-4 my-2 space-y-1 text-slate-700 dark:text-slate-200">
                        {children}
                      </ol>
                    ),
                    // List items
                    li: ({ children }) => (
                      <li className="text-slate-700 dark:text-slate-200 pl-1">
                        {children}
                      </li>
                    ),
                    // Code blocks
                    code: ({ className, children }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200 px-1.5 py-0.5 rounded text-sm font-mono">
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-slate-100 dark:bg-[#0a1628] text-cyan-700 dark:text-cyan-200 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2">
                          {children}
                        </code>
                      );
                    },
                    // Blockquotes
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-cyan-500/50 pl-4 my-2 text-slate-600 dark:text-slate-300 italic">
                        {children}
                      </blockquote>
                    ),
                    // Links
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors"
                      >
                        {children}
                      </a>
                    ),
                    // Tables
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full border border-cyan-300/40 dark:border-cyan-500/30 rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-cyan-50 dark:bg-cyan-900/30">
                        {children}
                      </thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-700 dark:text-cyan-200 border-b border-cyan-300/40 dark:border-cyan-500/30">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300 border-b border-cyan-200/30 dark:border-cyan-500/20">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {preprocessMarkdown(message.content)}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Response Time Badge & TTS Button */}
          {!isUser && !message.isStreaming && (
            <div className="px-4 pb-3 flex items-center gap-2">
              {message.responseTime && (
                <div className="zen01-response-time">
                  <Clock className="h-3 w-3" />
                  <span>{(message.responseTime / 1000).toFixed(1)}s</span>
                </div>
              )}

              {/* TTS Button - only show for assistant messages when enabled */}
              {voiceOutputEnabled && message.content && (
                <button
                  onClick={handleTTSToggle}
                  disabled={isTTSLoading}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isPlaying
                      ? 'text-cyan-500 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/20'
                      : isTTSLoading
                        ? 'text-slate-400 dark:text-slate-500 cursor-wait'
                        : 'text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10'
                  }`}
                  title={isPlaying ? 'Durdur' : isTTSLoading ? 'Yükleniyor...' : 'Sesli dinle'}
                >
                  {isTTSLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sources Section - Enhanced Citations */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="zen01-sources mt-3">
            <div className="mb-2">
              <span className="text-xs font-medium text-cyan-600/70 dark:text-cyan-400/70">
                Atıflar ({message.sources.length} kaynak)
              </span>
            </div>
            <div className="space-y-2">
              {visibleSources?.map((source: ZenSource, idx: number) => {
                // Format source type label
                const sourceTypeLabel = source.sourceType
                  ? source.sourceType.replace(/_/g, ' ').replace(/csv /i, '')
                  : source.sourceTable?.replace(/csv_/i, '').replace(/_/g, ' ') || 'Kaynak';

                return (
                  <div
                    key={idx}
                    className="zen01-source-item"
                    onClick={() => onSourceClick(source, message.sources || [])}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-cyan-500/20 dark:bg-cyan-500/30 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                          {idx + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <p className="text-sm font-medium text-cyan-700/90 dark:text-cyan-300/90 line-clamp-1">
                          {source.title || source.summary?.slice(0, 60) || 'Belge'}
                        </p>
                        {/* Summary or Excerpt */}
                        {(source.summary || source.excerpt) && (
                          <p className="text-xs text-slate-500/80 dark:text-slate-400/80 mt-1 line-clamp-2">
                            {source.summary || source.excerpt}
                          </p>
                        )}
                        {/* Keywords if available */}
                        {source.keywords && source.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {source.keywords.slice(0, 3).map((keyword, kidx) => (
                              <span
                                key={kidx}
                                className="text-[10px] px-1.5 py-0.5 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Source Type Badge - at bottom */}
                        <div className="mt-1.5">
                          <span className="zen01-source-badge">
                            {sourceTypeLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {message.sources.length > 3 && (
              <button
                onClick={() => setShowAllSources(!showAllSources)}
                className="mt-2 text-xs text-cyan-600/70 dark:text-cyan-400/70 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
              >
                {showAllSources ? 'Daha az göster' : `${message.sources.length - 3} kaynak daha göster`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="zen01-avatar zen01-avatar-user flex-shrink-0">
          <User className="h-4 w-4" />
        </div>
      )}
    </motion.div>
  );
};

export default ZenMessage;
