'use client';

import { useState } from 'react';
import { Source } from '@/types/chat';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { stripHtml } from '@/utils/html-utils';

interface SourceCitationProps {
  sources: Source[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  showLoadMore?: boolean;
  onExcerptClick?: (question: string) => void;
}

export function SourceCitation({ sources, onLoadMore, hasMore = false, showLoadMore = false, onExcerptClick }: SourceCitationProps) {
  if (!sources || sources.length === 0) return null;

  const [showAllSources, setShowAllSources] = useState(false);
  const initialSourcesToShow = 7;
  const sourcesToDisplay = showAllSources ? sources : sources.slice(0, initialSourcesToShow);

  // Helper function to get source table display name
  const getSourceTableName = (sourceTable?: string) => {
    if (!sourceTable) return 'Kaynak';
    return sourceTable
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Generate a follow-up question based on the excerpt
  const generateFollowUpQuestion = (excerpt: string, title: string): string => {
    const excerptText = excerpt.toLowerCase();
    const hasPercentage = excerptText.includes('%');
    const hasCondition = excerptText.includes('şart') || excerptText.includes('koşul') || excerptText.includes('gerektirir');
    const hasException = excerptText.includes('muaf') || excerptText.includes('istisna');

    const sentences = excerpt.split('.').filter(s => s.trim().length > 20);

    if (sentences.length > 0) {
      const firstSentence = sentences[0].trim();

      if (hasPercentage) {
        const percentageMatch = excerptText.match(/\d+%?/);
        if (percentageMatch) {
          return `${percentageMatch[0]} oranının uygulama şartları nelerdir?`;
        }
      }

      if (hasCondition) {
        const keyWords = firstSentence.split(' ').filter(w => w.length > 5).slice(0, 2);
        if (keyWords.length > 0) {
          return `${keyWords[0]} için gerekli şartlar?`;
        }
      }

      if (hasException) {
        return 'Bu durumda istisnalar nelerdir?';
      }

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
    <div className="mt-4 pt-3 border-t border-white/5">
      <div className="space-y-1">
        {sourcesToDisplay.map((source, index) => {
          // Get display title
          const isUrl = (str: string) => str?.startsWith('http://') || str?.startsWith('https://');
          let displayTitle = '';
          const rawTitle = stripHtml(source.citation || source.title || '');

          if (isUrl(rawTitle)) {
            if (source.excerpt) {
              const cleanExcerpt = stripHtml(source.excerpt);
              const firstSentence = cleanExcerpt.split(/[.!?]/)[0]?.trim();
              displayTitle = firstSentence?.length > 10 ? firstSentence : cleanExcerpt.slice(0, 100);
            } else {
              displayTitle = getSourceTableName(source.sourceTable) + ' Kaynağı';
            }
          } else {
            displayTitle = rawTitle
              .replace(/ - ID: \d+/g, '')
              .replace(/^sorucevap -\s*/i, '')
              .replace(/^ozelgeler -\s*/i, '')
              .replace(/^danıştay kararları -\s*/i, '')
              .replace(/^makaleler -\s*/i, '')
              .replace(/\s*\([^)]*\)$/, '')
              .trim();
          }

          return (
            <div
              key={source.id}
              className="group flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
            >
              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Source Tag with Number - Always shown */}
                <span className="inline-block text-[10px] font-medium text-amber-400/90 bg-amber-500/70 px-1.5 py-0.5 rounded mb-1">
                  [{index + 1}] {getSourceTableName(source.sourceTable)}
                </span>

                {/* Title - Plain text, no link */}
                <p className="text-sm text-gray-200 leading-snug line-clamp-2">
                  {displayTitle}
                </p>

                {/* Metadata line */}
                {source.metadata && (
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                    {source.metadata.status && `Durum: ${source.metadata.status}`}
                    {source.metadata.status && source.metadata.source && ' | '}
                    {source.metadata.source && `Kaynak: ${source.metadata.source}`}
                  </p>
                )}

                {/* Excerpt - clickable for follow-up */}
                {source.excerpt && (
                  <p
                    className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed cursor-pointer hover:text-gray-400 transition-colors"
                    onClick={() => {
                      if (onExcerptClick) {
                        const question = generateFollowUpQuestion(
                          stripHtml(source.excerpt!),
                          stripHtml(source.citation || source.title || 'Bu kaynak')
                        );
                        onExcerptClick(question);
                      }
                    }}
                    title="Bu konuyla ilgili detaylı araştırma yap"
                  >
                    {stripHtml(source.excerpt)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {sources.length > initialSourcesToShow && (
        <div className="mt-3 pt-2 border-t border-white/5">
          {!showAllSources ? (
            <button
              onClick={() => setShowAllSources(true)}
              className="flex items-center gap-2 mx-auto text-xs px-3 py-1.5 text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              {sources.length - initialSourcesToShow} kaynak daha
            </button>
          ) : (
            <button
              onClick={() => setShowAllSources(false)}
              className="flex items-center gap-2 mx-auto text-xs px-3 py-1.5 text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronUp className="w-3 h-3" />
              Daha az göster
            </button>
          )}
        </div>
      )}

      {/* External Load More Button */}
      {showLoadMore && hasMore && onLoadMore && (
        <div className="mt-3 pt-2 border-t border-white/5">
          <button
            onClick={onLoadMore}
            className="flex items-center gap-2 mx-auto text-xs px-3 py-1.5 text-purple-400 hover:text-purple-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Daha fazla kaynak yükle
          </button>
        </div>
      )}
    </div>
  );
}
