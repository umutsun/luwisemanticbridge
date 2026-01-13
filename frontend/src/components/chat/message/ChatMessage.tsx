import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, User, ExternalLink } from 'lucide-react';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { ChatSources } from './ChatSources';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';

/**
 * Parse structured response from LLM
 * Extracts: Konu, Anahtar Terimler, Dayanaklar, Değerlendirme
 */
interface ParsedResponse {
  topic: string | null;
  keywords: string[];
  legalBasis: string | null;
  assessment: string;
  footnotes: string[];
  hasStructure: boolean;
}

function parseStructuredResponse(content: string): ParsedResponse {
  const result: ParsedResponse = {
    topic: null,
    keywords: [],
    legalBasis: null,
    assessment: content,
    footnotes: [],
    hasStructure: false
  };

  if (!content) return result;

  // Check for section markers (## or **)
  const hasKonu = /##\s*Konu|^\*\*Konu\*\*|\*\*1\.\s*Konu/im.test(content);
  const hasKeywords = /##\s*Anahtar\s*Terim|^\*\*Anahtar\s*Terim|\*\*2\.\s*Anahtar/im.test(content);
  const hasDayanaklar = /##\s*Dayanaklar|^\*\*Dayanaklar|\*\*3\.\s*Yasal/im.test(content);
  const hasAssessment = /##\s*Değerlendirme|^\*\*Değerlendirme|\*\*4\.\s*Vergilex/im.test(content);

  // Only parse if we have at least 2 section markers
  if ([hasKonu, hasKeywords, hasDayanaklar, hasAssessment].filter(Boolean).length < 2) {
    return result;
  }

  result.hasStructure = true;

  // Extract Konu section
  const konuMatch = content.match(/(?:##\s*Konu|\*\*(?:1\.\s*)?Konu[^*]*\*\*)[:\s]*\n?([\s\S]*?)(?=##|\*\*(?:2\.|Anahtar)|$)/i);
  if (konuMatch) {
    result.topic = konuMatch[1].trim().replace(/^\*\*[^*]+\*\*\s*/gm, '').trim();
  }

  // Extract Anahtar Terimler section
  const keywordsMatch = content.match(/(?:##\s*Anahtar\s*Terim|\*\*(?:2\.\s*)?Anahtar\s*Terim[^*]*\*\*)[:\s]*\n?([\s\S]*?)(?=##|\*\*(?:3\.|Dayanaklar|Yasal)|$)/i);
  if (keywordsMatch) {
    const keywordsText = keywordsMatch[1].trim();
    // Parse comma-separated keywords, also handle bullet points
    const keywords = keywordsText
      .replace(/^\*\*[^*]+\*\*\s*/gm, '')
      .replace(/^[-•]\s*/gm, '')
      .split(/[,،•\n]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0 && k.length < 50);
    result.keywords = keywords;
  }

  // Extract Dayanaklar section
  const dayanakMatch = content.match(/(?:##\s*Dayanaklar|##\s*Yasal|##\s*Legal|\*\*(?:3\.\s*)?(?:Dayanaklar|Yasal)[^*]*\*\*)[:\s]*\n?([\s\S]*?)(?=##|\*\*(?:4\.|Değerlendirme|Vergilex|Assessment)|$)/i);
  if (dayanakMatch) {
    result.legalBasis = dayanakMatch[1].trim().replace(/^\*\*[^*]+\*\*\s*/gm, '').trim();
  }

  // Extract Değerlendirme section (main content to display)
  const assessmentMatch = content.match(/(?:##\s*Değerlendirme|##\s*Assessment|\*\*(?:4\.\s*)?(?:Değerlendirme|Vergilex\s*değerlendirme|Assessment)[^*]*\*\*)[:\s]*\n?([\s\S]*?)(?=##\s*Dipnot|\*\*Dipnot|$)/i);
  if (assessmentMatch) {
    result.assessment = assessmentMatch[1].trim();
  } else {
    // If no assessment section found, use everything after Dayanaklar
    const afterDayanak = content.match(/(?:##\s*Dayanaklar|\*\*(?:3\.\s*)?Dayanaklar[^*]*\*\*)[\s\S]*?\n\n([\s\S]*)/i);
    if (afterDayanak) {
      result.assessment = afterDayanak[1].trim();
    }
  }

  // Extract footnotes if present
  const footnotesMatch = content.match(/(?:##\s*Dipnot|\*\*Dipnot[^*]*\*\*)[:\s]*\n?([\s\S]*?)$/i);
  if (footnotesMatch) {
    const footnotesText = footnotesMatch[1].trim();
    // Parse footnote references like [1] Kaynak...
    const footnotes = footnotesText
      .split(/\n/)
      .filter(line => /^\s*\[\d+\]/.test(line))
      .map(line => line.trim());
    result.footnotes = footnotes;
    // Remove footnotes from assessment
    result.assessment = result.assessment.replace(/(?:##\s*Dipnot|\*\*Dipnot[^*]*\*\*)[\s\S]*$/i, '').trim();
  }

  return result;
}

/**
 * Clean raw markdown artifacts from assessment text
 * Removes: ## headers, **bold markers**, [Kaynak X] references, section labels, CEVAP/ALINTI, Dipnotlar
 */
function cleanAssessmentText(content: string): string {
  if (!content) return '';

  return content
    // Remove **CEVAP** / **ANSWER** headers (legacy format)
    .replace(/\*\*CEVAP\*\*\s*\n?/gi, '')
    .replace(/\*\*ANSWER\*\*\s*\n?/gi, '')
    // Remove **ALINTI** / **QUOTE** sections entirely
    .replace(/\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|##|\n\n\n|$)/gi, '')
    .replace(/\*\*QUOTE\*\*[\s\S]*?(?=\*\*[A-Z]|##|\n\n\n|$)/gi, '')
    // Remove Dipnotlar/Footnotes sections entirely (citations shown in Atıflar component)
    .replace(/##\s*Dipnotlar:?[\s\S]*?(?=##|\n\n\n|$)/gi, '')
    .replace(/##\s*Footnotes:?[\s\S]*?(?=##|\n\n\n|$)/gi, '')
    .replace(/\*\*Dipnotlar:?\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|##|\n\n\n|$)/gi, '')
    .replace(/\*\*Footnotes:?\*\*[\s\S]*?(?=\*\*[A-Z]|##|\n\n\n|$)/gi, '')
    // Remove standalone reference lists like [1] Sirküler...
    .replace(/\n\s*\[\d+\]\s+[^\n]+(?:\n\s*\[\d+\]\s+[^\n]+)*\s*$/gi, '')
    // Remove ## headers completely
    .replace(/^##\s*[^\n]+\n?/gm, '')
    // Remove **Section:** style headers
    .replace(/^\*\*(?:Konu|Anahtar\s*Terim|Dayanaklar|Değerlendirme|Dipnot)[^*]*\*\*:?\s*/gim, '')
    // Remove [Kaynak X] references (already shown in sources)
    .replace(/\[Kaynak\s*\d+\]/gi, '')
    // Remove [1], [2] style inline references (sources shown separately)
    .replace(/\[\d+\]/g, '')
    // Remove standalone bold markers around single words/short phrases in middle of text
    .replace(/\*\*([^*]{1,30})\*\*/g, '$1')
    // Clean up multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Format markdown content for better visual presentation
 * - Adds line breaks before/after bold headings for paragraph separation
 * - Converts inline numbered items to proper list format
 * - Handles strict RAG mode headers (HUKUKİ SONUÇ, KAYNAK DEĞERLENDİRMESİ, etc.)
 */
function formatMarkdownContent(content: string): string {
  if (!content) return '';

  // Known section headers that need line breaks (case-insensitive)
  // Note: CEVAP/ALINTI removed - these are cleaned out by cleanAssessmentText
  const sectionHeaders = [
    // New article format headers
    'Konu',
    'Anahtar Terimler',
    'Dayanaklar',
    'Değerlendirme',
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

/**
 * Keyword Tags Component - Renders keywords as colorful badges
 */
const KeywordTags: React.FC<{ keywords: string[] }> = ({ keywords }) => {
  if (!keywords || keywords.length === 0) return null;

  // Color palette for keyword badges
  const colors = [
    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  ];

  return (
    <div className="mt-3 mb-3">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        Anahtar Terimler
      </div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((keyword, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[idx % colors.length]}`}
          >
            {keyword}
          </span>
        ))}
      </div>
    </div>
  );
};

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

  // Parse structured response for assistant messages
  const parsedResponse = useMemo(() => {
    if (message.role !== 'assistant' || message.isTyping || message.isStreaming) {
      return null;
    }
    return parseStructuredResponse(message.content);
  }, [message.content, message.role, message.isTyping, message.isStreaming]);

  // Get display content - either cleaned parsed assessment or cleaned full content
  const displayContent = useMemo(() => {
    if (parsedResponse?.hasStructure && parsedResponse.assessment) {
      // Clean markdown artifacts from structured assessment text
      return cleanAssessmentText(parsedResponse.assessment);
    }
    // Also clean unstructured content to remove any CEVAP/ALINTI artifacts
    return cleanAssessmentText(message.content);
  }, [parsedResponse, message.content]);

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
                      <div className="flex-1">
                        {/* Structured Response Layout */}
                        {parsedResponse?.hasStructure ? (
                          <div className="space-y-3">
                            {/* Topic Section */}
                            {parsedResponse.topic && (
                              <div className="text-[13px] sm:text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-2">
                                {parsedResponse.topic}
                              </div>
                            )}

                            {/* Keyword Tags */}
                            {parsedResponse.keywords.length > 0 && (
                              <KeywordTags keywords={parsedResponse.keywords} />
                            )}

                            {/* Legal Basis */}
                            {parsedResponse.legalBasis && (
                              <div className="text-[11px] sm:text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                                <span className="font-semibold">Dayanaklar: </span>
                                {parsedResponse.legalBasis}
                              </div>
                            )}

                            {/* Main Assessment */}
                            <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1.5 prose-p:leading-relaxed">
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
                                {formatMarkdownContent(displayContent)}
                              </ReactMarkdown>
                            </div>
                            {/* Footnotes removed - already shown in Sources/Atıflar section below */}
                          </div>
                        ) : (
                          /* Fallback: Original unstructured rendering */
                          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1.5 prose-p:leading-relaxed">
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
