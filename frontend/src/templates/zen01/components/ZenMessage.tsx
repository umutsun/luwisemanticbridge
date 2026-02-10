'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Clock, Volume2, Pause, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ZenTypingIndicator } from './ZenTypingIndicator';
import { SchemaRenderer } from './SchemaRenderer';
import { TranslationBadge } from './TranslationBadge';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import type { ZenMessageProps, ZenSource, MessageTranslation } from '../types';

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
 * @param minLength - Minimum word length (default: 3 for Turkish abbreviations like KDV)
 * @param maxKeywords - Maximum keywords to extract (default: 8)
 */
function extractKeywords(
  query: string,
  stopWords: string[] = DEFAULT_STOP_WORDS,
  minLength: number = 3,  // Reduced for Turkish (KDV, etc.)
  maxKeywords: number = 8  // Increased for better coverage
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

function highlightKeywordsInText(text: string, keywords: string[]): React.ReactNode[] {
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
 * Clean LLM response by removing section labels that should be rendered by UI components
 * Removes: KONU:, ANAHTAR_TERIMLER:, DAYANAKLAR:, DEGERLENDIRME:, numbered format headers, Dipnotlar
 */
/**
 * Clean citation/source title from database formatting issues
 * Fixes: "T.C.D A N I Ş T A Y" -> "T.C. DANIŞTAY"
 * Fixes: "DAİREEsas No:" -> "DAİRE Esas No:"
 * Fixes: "2018/280Karar No:" -> "2018/280 Karar No:"
 * Fixes: "GelirMüdürlüğüILGİ" -> "Gelir Müdürlüğü İLGİ"
 * Fixes: ".......... gün ve ................" -> "" (removes placeholder dots)
 * Fixes: "15-4-2021 00:00:00" -> "15-4-2021" (removes time)
 */
function cleanCitationTitle(title: string): string {
  if (!title) return '';

  return title
    // Remove time portion from dates (00:00:00, 12:30:45, etc.)
    .replace(/\s+\d{2}:\d{2}:\d{2}$/g, '')
    .replace(/\s+\d{2}:\d{2}:\d{2}\s/g, ' ')
    // Remove long sequences of dots/periods (likely placeholder text)
    .replace(/\.{4,}/g, '')
    // Remove common placeholder patterns
    .replace(/\s+gün\s+ve\s+$/i, '')
    // Fix spaced letters like "D A N I Ş T A Y" -> "DANIŞTAY"
    .replace(/([A-ZÇĞİÖŞÜ])\s+(?=[A-ZÇĞİÖŞÜ]\s*[A-ZÇĞİÖŞÜ])/g, '$1')
    // Fix missing space after lowercase letter followed by uppercase
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ]{2,})/g, '$1 $2')
    // Fix camelCase merged words: "HukukDairesi" -> "Hukuk Dairesi"
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ][a-zçğıöşü])/g, '$1 $2')
    // Fix "T.C.D" -> "T.C. D"
    .replace(/T\.C\.D/g, 'T.C. D')
    .replace(/T\.C\.Y/g, 'T.C. Y')
    // Fix merged words: "DAİREEsas" -> "DAİRE Esas"
    .replace(/DAİRE([A-Z])/g, 'DAİRE $1')
    .replace(/DAIRE([A-Z])/g, 'DAİRE $1')
    // Fix "Esas No:2018" -> "Esas No: 2018"
    .replace(/No:(\d)/g, 'No: $1')
    // Fix "2018/280Karar" -> "2018/280 Karar"
    .replace(/(\d{4}\/\d+)([A-ZÇĞİÖŞÜ])/g, '$1 $2')
    // Fix number-word joins
    .replace(/(\d+)([A-ZÇĞİÖŞÜ]{2,})/g, '$1 $2')
    // Clean multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanLLMResponse(content: string): string {
  if (!content) return '';

  return content
    // Remove NEW format section labels (KONU:, ANAHTAR_TERIMLER:, etc.)
    .replace(/^KONU:\s*\n?/gim, '')
    .replace(/^ANAHTAR_TERIMLER:\s*\n?[^\n]*\n?/gim, '')
    .replace(/^DAYANAKLAR:\s*\n?[\s\S]*?(?=^DEGERLENDIRME:|$)/gim, '')
    .replace(/^DEGERLENDIRME:\s*\n?/gim, '')
    // Remove numbered format section headers
    .replace(/1\)\s*SORUNUN\s*KONUSU[:\s]*/gi, '')
    .replace(/2\)\s*ANAHTAR\s*KELİMELER[:\s]*[^\n]*\n?/gi, '')
    .replace(/3\)\s*(?:İLGİLİ\s*)?YASAL\s*DÜZENLEMELER[^\n]*[\s\S]*?(?=4\)|$)/gi, '')
    .replace(/4\)\s*(?:VERGİLEX\s*)?DEĞERLENDİRME[Sİ]?[:\s]*/gi, '')
    // Remove Dipnotlar sections entirely
    .replace(/SON\s*BÖLÜM[:\s]*DİPNOTLAR[\s\S]*$/gi, '')
    .replace(/5\)\s*DİPNOTLAR[\s\S]*$/gi, '')
    .replace(/##\s*Dipnotlar[\s\S]*$/gi, '')
    .replace(/\*\*Dipnotlar:?\*\*[\s\S]*$/gi, '')
    // Remove standalone [1] [2] reference lists at the end
    .replace(/\n\s*\[\d+\]\s+[^\n]+(?:\n\s*\[\d+\]\s+[^\n]+)*\s*$/gi, '')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Preprocess markdown content to ensure proper paragraph breaks
 * LLM often outputs **Header:** or **Header** inline instead of on new lines
 * Also converts single newlines between sentences into proper paragraph breaks
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

  // Remove orphaned numbered items FIRST (bare "3." or "3. 4." with no text content)
  result = result.replace(/\b(\d{1,2})\.\s*(?=\d{1,2}\.\s)/g, '');
  result = result.replace(/\s+\d{1,2}\.\s*(?=\n|$)/g, '');

  // FIX INLINE NUMBERED LISTS: "...text 1. item text 2. item" → proper markdown list
  // Detect sequences like "şunlardır: 1. Xxx 2. Yyy 3. Zzz" or "1. Xxx. 2. Yyy. 3. Zzz."
  // First check if there's a sequence of 3+ inline numbers (strong signal of a list)
  const inlineListPattern = /(?:[.!?:;]\s*)(\d{1,2})\.\s+\S[\s\S]*?(?:\s)(\d{1,2})\.\s+\S[\s\S]*?(?:\s)(\d{1,2})\.\s+\S/;
  const hasInlineList = inlineListPattern.test(result);

  if (hasInlineList) {
    // Strong inline list detected - break ALL numbered items onto new lines
    // Match: sentence-ending punctuation or colon/space + number + period + text
    result = result.replace(/([.!?:;,])\s+(\d{1,2})\.\s+/g, (match, punct, num) => {
      const numInt = parseInt(num, 10);
      if (numInt >= 1 && numInt <= 30) {
        return `${punct}\n\n${num}. `;
      }
      return match;
    });
    // Also catch mid-sentence numbered items (space before number, not after colon)
    result = result.replace(/ (\d{1,2})\.\s+(?=[A-ZÇĞİÖŞÜa-zçğıöşü]{3,})/g, (match, num) => {
      const numInt = parseInt(num, 10);
      if (numInt >= 1 && numInt <= 30) {
        return `\n\n${num}. `;
      }
      return match;
    });
  } else {
    // Weaker signal - only break when clearly inline (original logic)
    result = result.replace(/ (\d{1,2})\.\s+(?=[A-ZÇĞİÖŞÜa-zçğıöşü]{3,})/g, (match, num) => {
      const numInt = parseInt(num, 10);
      if (numInt >= 1 && numInt <= 30) {
        return `\n\n${num}. `;
      }
      return match;
    });
  }

  // CRITICAL FIX: Convert single newlines between sentences to paragraph breaks
  // Pattern: sentence ending (. ! ?) + optional citation [1][2] + single newline + capital letter
  // This fixes LLM output that has single newlines instead of double newlines between paragraphs
  result = result
    // Match: period/punctuation + optional citation + single newline + capital letter
    .replace(/([.!?])(\s*(?:\[\d+\]|\[Kaynak\s*\d+\]|\[Source\s*\d+\])+)?\n(?!\n)([A-ZÇĞİÖŞÜ])/gi, '$1$2\n\n$3')
    // Also handle Turkish sentences ending with percentage or number
    .replace(/([0-9%])(\s*(?:\[\d+\]|\[Kaynak\s*\d+\]|\[Source\s*\d+\])+)?\.\s*\n(?!\n)([A-ZÇĞİÖŞÜ])/gi, '$1$2.\n\n$3');

  // PARAGRAPH SPLITTING: Count existing paragraphs and sentences
  const paragraphCount = (result.match(/\n\n/g) || []).length;
  const sentenceCount = (result.match(/[.!?](?:\s*\[\d+\])*\s/g) || []).length;

  // Debug paragraph analysis
  console.log('[ZenMessage] 📝 Paragraph analysis:', { sentenceCount, paragraphCount, contentLength: result.length });

  // AGGRESSIVE PARAGRAPH BREAKING: If few or no paragraphs, add breaks after sentences
  // This handles LLM responses that come as a single block of text
  if (sentenceCount >= 2 && paragraphCount < Math.ceil(sentenceCount / 3)) {
    let sentenceCounter = 0;
    // Match: sentence ending + optional citations + space + next word starting with capital
    result = result.replace(/([.!?])(\s*(?:\[\d+\]|\[Kaynak\s*\d+\]|\[Source\s*\d+\])*)(\s+)([A-ZÇĞİÖŞÜ])/g,
      (match, punct, citations, _space, nextChar) => {
        sentenceCounter++;
        // Add paragraph break every 2-3 sentences
        if (sentenceCounter % 2 === 0) {
          return `${punct}${citations || ''}\n\n${nextChar}`;
        }
        return `${punct}${citations || ''} ${nextChar}`;
      }
    );
  }

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

  // Clean up excessive newlines (more than 2)
  result = result.replace(/\n{3,}/g, '\n\n');

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
  enableSourceClick = true,  // From schema, default true
  enableKeywordHighlighting = true,  // From schema, default true
  responseSchemaId,  // Response format schema ID
  keywords: backendKeywords = [],  // Backend-extracted keywords for schema sections
  dayanaklar: backendDayanaklar = [],  // Backend-extracted legal references for schema sections
  minSourcesToShow = 5,  // From RAG settings, default 5
  translation,  // Translation state for this message
  onToggleTranslation,  // Callback to toggle translation
}) => {
  const isUser = message.role === 'user';
  const [showAllSources, setShowAllSources] = useState(false);

  // Debug: Log component version on mount
  React.useEffect(() => {
    console.log('[ZenMessage] 🔄 v2026.01.21 - Dynamic suggestion cards', {
      enableSourceClick,
      enableKeywordHighlighting,
      messageId: message.id,
      sourcesCount: message.sources?.length || 0,
      minSourcesToShow,
      showAllSources
    });
  }, [message.sources?.length, minSourcesToShow]);

  // Extract keywords from last user query for highlighting (only if enabled)
  const highlightKeywords = React.useMemo(() => {
    if (!enableKeywordHighlighting || !lastUserQuery || isUser) {
      console.log('[ZenMessage] Keyword highlighting:', {
        enabled: enableKeywordHighlighting,
        hasQuery: !!lastUserQuery,
        isUser,
        reason: !enableKeywordHighlighting ? 'disabled' : !lastUserQuery ? 'no query' : 'user message'
      });
      return [];
    }
    const keywords = extractKeywords(lastUserQuery);
    console.log('[ZenMessage] Extracted keywords:', { query: lastUserQuery, keywords });
    return keywords;
  }, [lastUserQuery, isUser, enableKeywordHighlighting]);

  // Use schema-based rendering when schemaId is provided
  const useSchemaRenderer = Boolean(responseSchemaId);

  // Determine content to display (original or translated)
  const displayContent = translation?.isShowingTranslation
    ? translation.translatedContent
    : message.content;

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
      // Use displayContent (translated if available, otherwise original)
      const contentToRead = displayContent || message.content;

      // Extract plain text from markdown content
      const plainText = contentToRead
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
  // Show sources based on settings (dynamic from ragSettings.minSourcesToShow)
  const visibleSources = showAllSources
    ? message.sources
    : message.sources?.slice(0, minSourcesToShow);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} zen01-fade-in`}
    >
      <div className={`max-w-[90%] sm:max-w-[80%]`}>
        {/* Message Bubble */}
        <div className={isUser ? 'zen01-message-user' : 'zen01-message-assistant'}>
          <div className="p-4">
            {message.isStreaming ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </span>
                <ZenTypingIndicator />
                <span className="text-cyan-400/60 text-sm">Değerlendiriliyor...</span>
              </div>
            ) : isUser ? (
              <div className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20 mr-1.5 align-middle flex-shrink-0">
                  <User className="h-3 w-3" />
                </span>
                {message.content}
              </div>
            ) : (
              <>
                {useSchemaRenderer ? (
              // Schema-based structured response rendering
              <div className="flex gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </span>
                <div className="flex-1 min-w-0">
                  <SchemaRenderer
                    content={cleanLLMResponse(displayContent)}
                    schemaId={responseSchemaId}
                    keywords={backendKeywords}
                    dayanaklar={backendDayanaklar}
                    className="zen01-schema-response"
                    messageId={message.id}
                  />
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </span>
                <div className="flex-1 min-w-0 zen01-markdown prose prose-sm max-w-none dark:prose-invert">
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
                    // Paragraphs with keyword highlighting and citation anchors
                    p: ({ children }) => {
                      // DEBUG: Log what we receive
                      console.log('[ZenMessage] p children:', {
                        type: typeof children,
                        isArray: Array.isArray(children),
                        enableSourceClick,
                        value: typeof children === 'string' ? children.substring(0, 100) : 'not-string'
                      });

                      // Apply keyword highlighting and convert citations to clickable anchors
                      // Supports: [1], [Kaynak 1], [Source 1] formats
                      const processChildren = (child: React.ReactNode): React.ReactNode => {
                        // Handle React elements with children (like <strong>, <em>, etc.)
                        if (React.isValidElement(child) && child.props?.children) {
                          const processedChildren = processChildren(child.props.children);
                          return React.cloneElement(child, { ...child.props }, processedChildren);
                        }

                        if (typeof child === 'string') {
                          // Handle multiple citation formats:
                          // - [1], [2], [3] - simple format
                          // - [Kaynak 1], [Kaynak 2] - Turkish format from backend
                          // - [Source 1], [Source 2] - English format from backend
                          const citationRegex = /(\[\d+\]|\[Kaynak\s*\d+\]|\[Source\s*\d+\])/gi;
                          const parts = child.split(citationRegex);
                          const processed = parts.map((part, idx) => {
                            // Extract citation number from any format
                            const simpleMatch = part.match(/^\[(\d+)\]$/);
                            const kaynakMatch = part.match(/^\[Kaynak\s*(\d+)\]$/i);
                            const sourceMatch = part.match(/^\[Source\s*(\d+)\]$/i);
                            const citationNum = simpleMatch?.[1] || kaynakMatch?.[1] || sourceMatch?.[1];

                            if (citationNum) {
                              // Clean, simple citation format - no fancy styling
                              // Just a small superscript number that scrolls to source
                              if (enableSourceClick) {
                                return (
                                  <sup
                                    key={`cite-${idx}`}
                                    className="cursor-pointer text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300"
                                    style={{ fontSize: '0.7em', fontWeight: 500 }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const el = document.getElementById(`citation-${message.id}-${citationNum}`);
                                      if (el) {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        el.style.boxShadow = '0 0 0 2px rgba(34, 211, 238, 0.5)';
                                        el.style.transition = 'box-shadow 0.3s ease';
                                        setTimeout(() => { el.style.boxShadow = 'none'; }, 2000);
                                      }
                                    }}
                                  >
                                    [{citationNum}]
                                  </sup>
                                );
                              } else {
                                // Not clickable - just display as superscript
                                return (
                                  <sup
                                    key={`cite-${idx}`}
                                    className="text-cyan-600 dark:text-cyan-400"
                                    style={{ fontSize: '0.7em', fontWeight: 500 }}
                                  >
                                    [{citationNum}]
                                  </sup>
                                );
                              }
                            }
                            // Apply keyword highlighting to non-citation text
                            if (highlightKeywords.length > 0) {
                              return <React.Fragment key={idx}>{highlightKeywordsInText(part, highlightKeywords)}</React.Fragment>;
                            }
                            return part;
                          });
                          return <>{processed}</>;
                        }
                        if (Array.isArray(child)) {
                          return child.map((c, i) => <React.Fragment key={i}>{processChildren(c)}</React.Fragment>);
                        }
                        return child;
                      };

                      return (
                        <p className="text-slate-700 dark:text-slate-100 leading-relaxed my-6 first:mt-0 last:mb-0" style={{ marginBottom: '1.5em', marginTop: '1.5em' }}>
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
                      <em className="italic text-slate-600 dark:text-slate-200">
                        {children}
                      </em>
                    ),
                    // Unordered lists
                    ul: ({ children }) => (
                      <ul className="list-disc list-outside ml-4 my-2 space-y-1 text-slate-700 dark:text-slate-100">
                        {children}
                      </ul>
                    ),
                    // Ordered lists
                    ol: ({ children }) => (
                      <ol className="list-decimal list-outside ml-4 my-2 space-y-1 text-slate-700 dark:text-slate-100">
                        {children}
                      </ol>
                    ),
                    // List items
                    li: ({ children }) => (
                      <li className="text-slate-700 dark:text-slate-100 pl-1">
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
                      <blockquote className="border-l-4 border-cyan-500/50 pl-4 my-2 text-slate-600 dark:text-slate-100 italic">
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
                      <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-200 border-b border-cyan-200/30 dark:border-cyan-500/20">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {preprocessMarkdown(cleanLLMResponse(displayContent))}
                </ReactMarkdown>
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* Response Time Badge & TTS Button & Translation Badge */}
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

              {/* Translation Badge - show when message has been translated */}
              {translation && onToggleTranslation && (
                <TranslationBadge
                  targetLanguage={translation.targetLanguage}
                  isShowingTranslation={translation.isShowingTranslation}
                  onToggle={onToggleTranslation}
                />
              )}
            </div>
          )}
        </div>

        {/* Sources Fetch Failed Warning */}
        {!isUser && message.sourcesFetchFailed && !message.isStreaming && (
          <div className="zen01-sources-warning mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Atıflar yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.
            </span>
          </div>
        )}

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
                // Get source type info with hierarchy and marker color
                const getSourceTypeInfo = (sourceTable?: string, metadata?: any) => {
                  // Detailed type mapping with Turkish labels
                  const typeMap: Record<string, { label: string; weight: number; markerClass: string }> = {
                    // Legal/Official documents (highest priority)
                    'kanun': { label: 'Kanun/Mevzuat', weight: 100, markerClass: 'zen01-marker-purple' },
                    'mevzuat': { label: 'Mevzuat', weight: 100, markerClass: 'zen01-marker-purple' },
                    'teblig': { label: 'Tebliğ', weight: 95, markerClass: 'zen01-marker-blue' },
                    'tebliğ': { label: 'Tebliğ', weight: 95, markerClass: 'zen01-marker-blue' },
                    'yonetmelik': { label: 'Yönetmelik', weight: 95, markerClass: 'zen01-marker-blue' },
                    'yönetmelik': { label: 'Yönetmelik', weight: 95, markerClass: 'zen01-marker-blue' },
                    'sirkuler': { label: 'Sirküler', weight: 90, markerClass: 'zen01-marker-pink' },
                    'sirkü': { label: 'Sirküler', weight: 90, markerClass: 'zen01-marker-pink' },
                    // Tax authority documents
                    'ozelge': { label: 'GİB Özelgesi', weight: 75, markerClass: 'zen01-marker-yellow' },
                    'özelge': { label: 'GİB Özelgesi', weight: 75, markerClass: 'zen01-marker-yellow' },
                    'gib': { label: 'GİB Belgesi', weight: 75, markerClass: 'zen01-marker-yellow' },
                    'mukteza': { label: 'Mukteza', weight: 75, markerClass: 'zen01-marker-yellow' },
                    'genelyazi': { label: 'Genel Yazı', weight: 65, markerClass: 'zen01-marker-yellow' },
                    'genelyazı': { label: 'Genel Yazı', weight: 65, markerClass: 'zen01-marker-yellow' },
                    // Court decisions
                    'danistay': { label: 'Danıştay Kararı', weight: 70, markerClass: 'zen01-marker-orange' },
                    'danıştay': { label: 'Danıştay Kararı', weight: 70, markerClass: 'zen01-marker-orange' },
                    'danistaykararlari': { label: 'Danıştay Kararı', weight: 70, markerClass: 'zen01-marker-orange' },
                    'yargitay': { label: 'Yargıtay Kararı', weight: 70, markerClass: 'zen01-marker-orange' },
                    'yargıtay': { label: 'Yargıtay Kararı', weight: 70, markerClass: 'zen01-marker-orange' },
                    'karar': { label: 'Mahkeme Kararı', weight: 70, markerClass: 'zen01-marker-orange' },
                    // Articles and publications
                    'makale': { label: 'Makale', weight: 50, markerClass: 'zen01-marker-green' },
                    'yayin': { label: 'Yayın', weight: 50, markerClass: 'zen01-marker-green' },
                    'yayın': { label: 'Yayın', weight: 50, markerClass: 'zen01-marker-green' },
                    'dergi': { label: 'Dergi Makalesi', weight: 50, markerClass: 'zen01-marker-green' },
                    // Q&A and guides
                    'sorucevap': { label: 'Soru-Cevap', weight: 50, markerClass: 'zen01-marker-green' },
                    'sss': { label: 'SSS', weight: 50, markerClass: 'zen01-marker-green' },
                    'rehber': { label: 'Rehber', weight: 55, markerClass: 'zen01-marker-green' },
                    'kilavuz': { label: 'Kılavuz', weight: 55, markerClass: 'zen01-marker-green' },
                    'kılavuz': { label: 'Kılavuz', weight: 55, markerClass: 'zen01-marker-green' },
                    // Legal assessments
                    'hukdkk': { label: 'Hukuki Değerlendirme', weight: 60, markerClass: 'zen01-marker-blue' },
                    'hukuki': { label: 'Hukuki Görüş', weight: 60, markerClass: 'zen01-marker-blue' },
                    // Documents and files
                    'documents': { label: 'Doküman', weight: 40, markerClass: 'zen01-marker-slate' },
                    'document': { label: 'Doküman', weight: 40, markerClass: 'zen01-marker-slate' },
                    'dokuman': { label: 'Doküman', weight: 40, markerClass: 'zen01-marker-slate' },
                    'doküman': { label: 'Doküman', weight: 40, markerClass: 'zen01-marker-slate' },
                    'pdf': { label: 'PDF Belgesi', weight: 40, markerClass: 'zen01-marker-slate' },
                    'belge': { label: 'Belge', weight: 40, markerClass: 'zen01-marker-slate' },
                    // Unified embeddings (detect from content/metadata)
                    'unified': { label: 'Arşiv Belgesi', weight: 35, markerClass: 'zen01-marker-slate' },
                    'unifiedembeddings': { label: 'Arşiv Belgesi', weight: 35, markerClass: 'zen01-marker-slate' },
                    'embeddings': { label: 'Veri Kaynağı', weight: 30, markerClass: 'zen01-marker-slate' },
                    // Calendar/schedule items
                    'pratik': { label: 'Pratik Bilgi', weight: 45, markerClass: 'zen01-marker-amber' },
                    'takvim': { label: 'Vergi Takvimi', weight: 45, markerClass: 'zen01-marker-amber' },
                    'hatirlatma': { label: 'Hatırlatma', weight: 45, markerClass: 'zen01-marker-amber' },
                    'hatırlatma': { label: 'Hatırlatma', weight: 45, markerClass: 'zen01-marker-amber' }
                  };

                  // Default fallback - more descriptive than "Kaynak"
                  const defaultInfo = { label: 'Belge', weight: 0, markerClass: 'zen01-marker-slate' };

                  if (!sourceTable) {
                    // Try to detect from metadata
                    if (metadata?.source_type) {
                      const metaType = String(metadata.source_type).toLowerCase();
                      for (const [key, value] of Object.entries(typeMap)) {
                        if (metaType.includes(key)) return value;
                      }
                    }
                    return defaultInfo;
                  }

                  const sourceStr = sourceTable.toLowerCase()
                    .replace(/^csv_/, '')
                    .replace(/_/g, '')
                    .replace(/arsiv.*/, '')
                    .replace(/\d+$/, ''); // Remove trailing numbers

                  // Direct match
                  if (typeMap[sourceStr]) return typeMap[sourceStr];

                  // Partial match
                  for (const [key, value] of Object.entries(typeMap)) {
                    if (sourceStr.includes(key) || key.includes(sourceStr)) {
                      return value;
                    }
                  }

                  // Check metadata for additional hints
                  if (metadata) {
                    const metaStr = JSON.stringify(metadata).toLowerCase();
                    if (metaStr.includes('özelge') || metaStr.includes('ozelge')) {
                      return typeMap['ozelge'];
                    }
                    if (metaStr.includes('danıştay') || metaStr.includes('danistay')) {
                      return typeMap['danistay'];
                    }
                    if (metaStr.includes('makale') || metaStr.includes('yazar')) {
                      return typeMap['makale'];
                    }
                  }

                  return defaultInfo;
                };

                const typeInfo = getSourceTypeInfo(source.sourceTable, source.metadata);

                // Extract metadata for header display
                const meta = source.metadata as any;
                const getMetadataInfo = () => {
                  if (!meta) return { karar: '', daire: '', tarih: '' };

                  // Get karar/esas number
                  const kararRaw = meta.kararno || meta.karar_no || meta.esas_no || meta.esasno || meta.karar || '';
                  const karar = kararRaw ? cleanCitationTitle(String(kararRaw)) : '';

                  // Get daire
                  const daireRaw = meta.daire || '';
                  const daire = daireRaw ? cleanCitationTitle(String(daireRaw)) : '';

                  // Get year from tarih
                  const tarihRaw = meta.tarih || meta.date || meta.yil || meta.year || '';
                  const tarihClean = cleanCitationTitle(String(tarihRaw));
                  const yearMatch = tarihClean.match(/\d{4}/);
                  const tarih = yearMatch ? yearMatch[0] : '';

                  return { karar, daire, tarih };
                };

                const metaInfo = getMetadataInfo();

                // Get excerpt/summary
                const getExcerpt = () => {
                  const raw = source.summary || source.excerpt || source.content || '';
                  const cleaned = cleanCitationTitle(raw)
                    .replace(/^(KONU|İLGİ|SORU|CEVAP|Dilekçenizde|konusu)[:.\s]*/gi, '')
                    .replace(/\.{2,}/g, '.')
                    .trim();

                  if (cleaned.length > 200) {
                    return cleaned.substring(0, 200).trim() + '...';
                  }
                  return cleaned;
                };

                const excerpt = getExcerpt();

                return (
                  <div
                    key={idx}
                    id={`citation-${message.id}-${idx + 1}`}
                    className={`zen01-source-item scroll-mt-20 ${enableSourceClick ? 'cursor-pointer hover:bg-slate-800/30' : 'cursor-default'}`}
                    {...(enableSourceClick && {
                      onClick: () => onSourceClick(source, message.sources || [])
                    })}
                  >
                    {/* Header Row: [1] + Type + Daire + Karar + Yıl */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs font-semibold text-cyan-500 dark:text-cyan-400">
                        [{idx + 1}]
                      </span>
                      <span className={`zen01-marker ${typeInfo.markerClass} text-[10px] font-medium px-2 py-0.5`}>
                        {typeInfo.label}
                      </span>
                      {metaInfo.daire && (
                        <span className="zen01-marker zen01-marker-amber text-[10px] font-medium px-1.5 py-0.5">
                          {metaInfo.daire}
                        </span>
                      )}
                      {metaInfo.karar && (
                        <span className="zen01-marker zen01-marker-slate text-[10px] font-medium px-1.5 py-0.5">
                          {metaInfo.karar}
                        </span>
                      )}
                      {metaInfo.tarih && (
                        <span className="zen01-marker zen01-marker-slate text-[10px] px-1.5 py-0.5">
                          {metaInfo.tarih}
                        </span>
                      )}
                    </div>

                    {/* Excerpt/Summary */}
                    {excerpt && excerpt.length > 20 && (
                      <p className="text-[11px] text-slate-500/90 dark:text-slate-300/80 line-clamp-2 leading-relaxed">
                        {excerpt}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {message.sources.length > minSourcesToShow && (
              <button
                onClick={() => setShowAllSources(!showAllSources)}
                className="mt-2 text-xs text-cyan-600/70 dark:text-cyan-400/70 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
              >
                {showAllSources ? 'Daha az göster' : `${message.sources.length - minSourcesToShow} kaynak daha göster`}
              </button>
            )}
          </div>
        )}
      </div>

    </motion.div>
  );
};

export default ZenMessage;
