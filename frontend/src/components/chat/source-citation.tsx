'use client';

import { useState } from 'react';
import { Source } from '@/types/chat';
import { ExternalLink, FileText, Scale, BookOpen, MessageSquare, Database, ChevronDown, ChevronUp, Plus, Tag } from 'lucide-react';

interface SourceCitationProps {
  sources: Source[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  showLoadMore?: boolean;
  onExcerptClick?: (question: string) => void;
}

export function SourceCitation({ sources, onLoadMore, hasMore = false, showLoadMore = false, onExcerptClick }: SourceCitationProps) {
  if (!sources || sources.length === 0) return null;

  // State for showing/hiding sources (progressive loading)
  const [showAllSources, setShowAllSources] = useState(false);

  // Determine initial sources to show (minResults concept)
  const initialSourcesToShow = 7;
  const sourcesToDisplay = showAllSources ? sources : sources.slice(0, initialSourcesToShow);

  // Helper function to get source table display name
  const getSourceTableName = (sourceTable?: string) => {
    if (!sourceTable) return 'Kaynak';

    // Convert to title case for better readability
    return sourceTable
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Helper function to get icon based on source table
  const getSourceIcon = (sourceTable?: string) => {
    switch (sourceTable) {
      case 'OZELGELER':
        return <FileText className="w-3 h-3" />;
      case 'DANISTAYKARARLARI':
        return <Scale className="w-3 h-3" />;
      case 'MAKALELER':
        return <BookOpen className="w-3 h-3" />;
      case 'SORUCEVAP':
        return <MessageSquare className="w-3 h-3" />;
      default:
        return <Database className="w-3 h-3" />;
    }
  };

  // Helper function to get badge color based on source table
  const getBadgeColor = (sourceTable?: string) => {
    switch (sourceTable) {
      case 'OZELGELER':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'DANISTAYKARARLARI':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'MAKALELER':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'SORUCEVAP':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  // Calculate overall confidence based on sources
  const calculateConfidence = () => {
    if (sources.length === 0) return 0;
    if (sources.length >= 5) return 95;
    if (sources.length >= 3) return 85;
    if (sources.length >= 2) return 70;
    return 50;
  };

  const confidence = calculateConfidence();
  const confidenceColor = confidence >= 85 ? 'text-green-600' : confidence >= 70 ? 'text-yellow-600' : 'text-orange-600';
  const confidenceText = confidence >= 85 ? 'Yüksek' : confidence >= 70 ? 'Orta' : 'Düşük';

  // Extract meaningful keywords/tags from source
  const extractTags = (source: Source): string[] => {
    const tags: string[] = [];

    // Extract from title - just get unique words
    if (source.title) {
      const words = source.title
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 3);
      tags.push(...words);
    }

    // Extract from excerpt - just get unique words
    if (source.excerpt) {
      const words = source.excerpt
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 4)
        .slice(0, 2);
      tags.push(...words);
    }

    // Return unique tags, max 5
    return [...new Set(tags)].slice(0, 5);
  };

  // Generate a follow-up question based on the excerpt
  const generateFollowUpQuestion = (excerpt: string, title: string): string => {
    // Extract key information from excerpt
    const excerptText = excerpt.toLowerCase();

    // Look for specific patterns in the excerpt
    const hasPercentage = excerptText.includes('%');
    const hasAmount = /\d+/.test(excerptText);
    const hasCondition = excerptText.includes('şart') || excerptText.includes('koşul') || excerptText.includes('gerektirir');
    const hasException = excerptText.includes('muaf') || excerptText.includes('istisna');
    const hasDate = excerptText.match(/\d{4}/);

    // Extract important phrases
    const sentences = excerpt.split('.').filter(s => s.trim().length > 20);

    if (sentences.length > 0) {
      const firstSentence = sentences[0].trim();

      // If it contains percentage
      if (hasPercentage) {
        const percentageMatch = excerptText.match(/\d+%?/);
        if (percentageMatch) {
          return `${percentageMatch[0]} oranının uygulama şartları nelerdir?`;
        }
      }

      // If it mentions conditions
      if (hasCondition) {
        const keyWords = firstSentence.split(' ').filter(w => w.length > 5).slice(0, 2);
        if (keyWords.length > 0) {
          return `${keyWords[0]} için gerekli şartlar?`;
        }
      }

      // If it mentions exceptions
      if (hasException) {
        return 'Bu durumda istisnalar nelerdir?';
      }

      // Extract the main subject from the sentence
      const words = firstSentence.split(' ');
      const subjectWords = [];

      for (let i = 3; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[^\w]/g, '');
        if (word.length > 4 && !['için', 'hakkında', 'ile', 'göre', 'kadar', 'üzerinde', 'olan', 'olarak'].includes(word)) {
          subjectWords.push(word);
          if (subjectWords.length >= 2) break;
        }
      }

      if (subjectWords.length > 0) {
        const subject = subjectWords.join(' ').charAt(0).toUpperCase() + subjectWords.join(' ').slice(1);
        return `${subject} hakkında detaylı bilgi`;
      }
    }

    // Fallback to title-based question
    if (title) {
      const titleWords = title.split(' ').filter(w => w.length > 4);
      if (titleWords.length > 0) {
        const mainWord = titleWords[0].replace(/[^\w]/g, '');
        return `${mainWord.charAt(0).toUpperCase() + mainWord.slice(1)} nedir?`;
      }
    }

    return 'Bu konu hakkında daha fazla bilgi';
  };

  
  
  return (
    <div className="mt-4 pt-3 border-t border-gray-100/60 dark:border-gray-600/30">
      <div className="space-y-2">
        {sourcesToDisplay.map((source, index) => {
          // Calculate individual metrics
          const hasMetadata = source.metadata && Object.keys(source.metadata).length > 0;
          const metricScore = source.score || source.relevance || source.relevanceScore || (hasMetadata ? 75 : 50);
          const scoreColor = metricScore >= 80 ? 'text-green-600' : metricScore >= 60 ? 'text-yellow-600' : 'text-gray-500';
          const scoreDisplay = Math.round(metricScore);
          
          return (
            <div key={source.id} className="group">
              <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors duration-200">
                <div className="flex items-center justify-center w-6 h-6 mt-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Source Table Badge - Only show if different from previous */}
                  {index === 0 || source.sourceTable !== sourcesToDisplay[index - 1]?.sourceTable ? (
                    <div className="flex items-center gap-1 mb-2">
                      {getSourceIcon(source.sourceTable)}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getBadgeColor(source.sourceTable)}`}>
                        {(() => {
                          const tableName = getSourceTableName(source.sourceTable);
                          // Don't show duplicate table names in badge
                          if (source.title && source.title.toLowerCase().includes(tableName.toLowerCase())) {
                            return tableName; // Show only once
                          }
                          return tableName;
                        })()}
                      </span>
                    </div>
                  ) : (
                    <div className="h-6 mb-2"></div> // Maintain spacing
                  )}

                  <div className="flex items-start gap-2 mb-1">
                    {(() => {
                      // Helper to check if string is a URL
                      const isUrl = (str: string) => str?.startsWith('http://') || str?.startsWith('https://');

                      // Get display title - prefer non-URL values
                      let displayTitle = '';
                      const rawTitle = source.citation || source.title || '';

                      if (isUrl(rawTitle)) {
                        // If title is URL, use excerpt summary or source table name
                        if (source.excerpt) {
                          // Take first sentence of excerpt as title
                          const firstSentence = source.excerpt.split(/[.!?]/)[0]?.trim();
                          displayTitle = firstSentence?.length > 10 ? firstSentence : source.excerpt.slice(0, 100);
                        } else {
                          displayTitle = getSourceTableName(source.sourceTable) + ' Kaynağı';
                        }
                      } else {
                        // Clean up title - remove source table prefix if it exists
                        displayTitle = rawTitle
                          .replace(/ - ID: \d+/g, '')
                          .replace(/^sorucevap -\s*/i, '')
                          .replace(/^ozelgeler -\s*/i, '')
                          .replace(/^danıştay kararları -\s*/i, '')
                          .replace(/^makaleler -\s*/i, '')
                          .replace(/\s*\([^)]*\)$/, '') // Remove category suffixes
                          .trim();
                      }

                      // Show as plain text (no links for cleaner UI)
                      return (
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-2">
                          {displayTitle}
                        </span>
                      );
                    })()}
                  </div>

  
                  {/* Tags */}
                  {(() => {
                    const tags = extractTags(source);
                    if (tags.length > 0) {
                      return (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tags.map((tag, tagIndex) => (
                            <span
                              key={tagIndex}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                              onClick={() => onExcerptClick?.(tag)}
                            >
                              <Tag className="w-2.5 h-2.5" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {source.excerpt && (
                    <p
                      className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2 leading-relaxed hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                      onClick={() => {
                        if (onExcerptClick) {
                          const question = generateFollowUpQuestion(
                            source.excerpt!,
                            source.citation || source.title || 'Bu kaynak'
                          );
                          onExcerptClick(question);
                        }
                      }}
                      title="Bu kaynak hakkında soru sor"
                    >
                      {source.excerpt}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-medium ${scoreColor}`}>
                      {scoreDisplay}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {sources.length > initialSourcesToShow && (
        <div className="mt-3 pt-2 border-t border-gray-100/60 dark:border-gray-600/30">
          {!showAllSources ? (
            <button
              onClick={() => setShowAllSources(true)}
              className="flex items-center gap-2 mx-auto text-xs px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              {sources.length - initialSourcesToShow} Kaynak Daha Göster
            </button>
          ) : (
            <button
              onClick={() => setShowAllSources(false)}
              className="flex items-center gap-2 mx-auto text-xs px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full transition-colors"
            >
              <ChevronUp className="w-3 h-3" />
              Daha Az Göster
            </button>
          )}
        </div>
      )}

      {/* External Load More Button (for API-based loading) */}
      {showLoadMore && hasMore && onLoadMore && (
        <div className="mt-3 pt-2 border-t border-gray-100/60 dark:border-gray-600/30">
          <button
            onClick={onLoadMore}
            className="flex items-center gap-2 mx-auto text-xs px-4 py-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full transition-colors"
          >
            <Plus className="w-3 h-3" />
            Daha Fazla Kaynak Yükle
          </button>
        </div>
      )}
    </div>
  );
}