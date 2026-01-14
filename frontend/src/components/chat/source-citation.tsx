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

  // Helper to map source table to display name with hierarchy and marker color
  const getSourceTypeInfo = (sourceTable?: string, category?: string) => {
    if (!sourceTable && !category) return { label: 'Kaynak', weight: 0, markerClass: 'marker-cyan' };

    const sourceStr = (sourceTable || category || '').toLowerCase()
      .replace(/^csv_/, '')
      .replace(/_/g, '')
      .replace(/arsiv.*/, '');  // "makale_arsiv_2021" -> "makale"

    // Source type hierarchy with weights and marker colors
    const typeMap: Record<string, { label: string; weight: number; markerClass: string }> = {
      'kanun': { label: 'Kanun/Mevzuat', weight: 100, markerClass: 'marker-purple' },
      'teblig': { label: 'Tebliğ/Yönetmelik', weight: 95, markerClass: 'marker-cyan' },
      'tebliğ': { label: 'Tebliğ/Yönetmelik', weight: 95, markerClass: 'marker-cyan' },
      'yonetmelik': { label: 'Yönetmelik', weight: 95, markerClass: 'marker-cyan' },
      'sirkuler': { label: 'Sirküler', weight: 90, markerClass: 'marker-pink' },
      'ozelge': { label: 'GİB Özelgesi', weight: 75, markerClass: 'marker-yellow' },
      'danistay': { label: 'Danıştay Kararı', weight: 70, markerClass: 'marker-orange' },
      'danistaykararlari': { label: 'Danıştay Kararı', weight: 70, markerClass: 'marker-orange' },
      'makale': { label: 'Makale', weight: 50, markerClass: 'marker-green' },
      'sorucevap': { label: 'Soru-Cevap', weight: 50, markerClass: 'marker-green' },
      'hukdkk': { label: 'Hukuki Değerlendirme', weight: 60, markerClass: 'marker-cyan' },
      'genelyazi': { label: 'Genel Yazı', weight: 65, markerClass: 'marker-yellow' },
      'genelyazı': { label: 'Genel Yazı', weight: 65, markerClass: 'marker-yellow' }
    };

    // Try exact match first
    if (typeMap[sourceStr]) {
      return typeMap[sourceStr];
    }

    // Try partial match
    for (const [key, value] of Object.entries(typeMap)) {
      if (sourceStr.includes(key) || key.includes(sourceStr)) {
        return value;
      }
    }

    // Fallback
    return { label: 'Kaynak', weight: 0, markerClass: 'marker-cyan' };
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
                {/* Source Type and Number with Marker Style */}
                {(() => {
                  const typeInfo = getSourceTypeInfo(source.sourceTable, source.category);
                  return (
                    <span className={`marker ${typeInfo.markerClass} text-[11px] font-semibold text-gray-900 dark:text-gray-100 inline-block mb-2`}>
                      <span className="text-[9px] opacity-70">[{index + 1}]</span> {typeInfo.label}
                    </span>
                  );
                })()}

                {/* Title - Plain text, no link */}
                <p className="text-sm text-gray-200 leading-snug line-clamp-2 mb-2">
                  {displayTitle}
                </p>

                {/* Metadata - Show all relevant fields */}
                {source.metadata && Object.keys(source.metadata).length > 0 && (
                  <div className="text-[11px] text-gray-500 mt-1.5 space-y-1">
                    {/* Priority metadata fields */}
                    {(source.metadata.kurum || source.metadata.makam || source.metadata.tarih) && (
                      <p className="line-clamp-1">
                        {source.metadata.kurum && `${source.metadata.kurum}`}
                        {source.metadata.kurum && source.metadata.makam && ' • '}
                        {source.metadata.makam && `${source.metadata.makam}`}
                        {(source.metadata.kurum || source.metadata.makam) && source.metadata.tarih && ' • '}
                        {source.metadata.tarih && `${source.metadata.tarih}`}
                      </p>
                    )}
                    {/* Additional metadata fields */}
                    {(source.metadata.madde_no || source.metadata.karar_no || source.metadata.esas_no || source.metadata.sayi) && (
                      <p className="line-clamp-1">
                        {source.metadata.madde_no && `Madde: ${source.metadata.madde_no}`}
                        {source.metadata.madde_no && (source.metadata.karar_no || source.metadata.esas_no || source.metadata.sayi) && ' • '}
                        {source.metadata.karar_no && `Karar: ${source.metadata.karar_no}`}
                        {source.metadata.karar_no && (source.metadata.esas_no || source.metadata.sayi) && ' • '}
                        {source.metadata.esas_no && `Esas: ${source.metadata.esas_no}`}
                        {source.metadata.esas_no && source.metadata.sayi && ' • '}
                        {source.metadata.sayi && `Sayı: ${source.metadata.sayi}`}
                      </p>
                    )}
                  </div>
                )}

                {/* Excerpt - only if different from title, clickable for follow-up */}
                {(() => {
                  if (!source.excerpt) return null;
                  const excerpt = stripHtml(source.excerpt);
                  // Only show if different from title
                  if (excerpt && excerpt.length > 20 && !displayTitle.includes(excerpt.slice(0, 50)) && !excerpt.includes(displayTitle.slice(0, 50))) {
                    return (
                      <p
                        className="text-xs text-gray-500 mt-2 line-clamp-3 leading-relaxed cursor-pointer hover:text-gray-400 transition-colors"
                        onClick={() => {
                          if (onExcerptClick) {
                            const question = generateFollowUpQuestion(
                              excerpt,
                              stripHtml(source.citation || source.title || 'Bu kaynak')
                            );
                            onExcerptClick(question);
                          }
                        }}
                        title="Bu konuyla ilgili detaylı araştırma yap"
                      >
                        {excerpt}
                      </p>
                    );
                  }
                  return null;
                })()}

                {/* Keywords from metadata or category */}
                {(() => {
                  const keywords: string[] = [];

                  // Extract keywords from metadata.keywords field
                  if (source.metadata?.keywords) {
                    if (Array.isArray(source.metadata.keywords)) {
                      keywords.push(...source.metadata.keywords);
                    } else if (typeof source.metadata.keywords === 'string') {
                      keywords.push(...source.metadata.keywords.split(/[,•]/));
                    }
                  }

                  // Add category as keyword if exists
                  if (source.category && !keywords.includes(source.category)) {
                    keywords.push(source.category);
                  }

                  // Add source type as keyword
                  const typeInfo = getSourceTypeInfo(source.sourceTable, source.category);
                  if (typeInfo.label && !keywords.includes(typeInfo.label)) {
                    keywords.unshift(typeInfo.label);
                  }

                  const cleanedKeywords = keywords
                    .map(k => String(k).trim())
                    .filter(k => k.length > 0 && k.length < 30)
                    .slice(0, 5); // Max 5 keywords

                  if (cleanedKeywords.length === 0) return null;

                  return (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {cleanedKeywords.map((keyword, idx) => (
                        <span
                          key={idx}
                          className="marker marker-cyan text-[10px] font-medium px-2 py-1 inline-block"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  );
                })()}
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
