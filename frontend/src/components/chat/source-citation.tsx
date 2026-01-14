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

  // Helper to map source table to display name with icon and hierarchy
  const getSourceTypeInfo = (sourceTable?: string, category?: string) => {
    if (!sourceTable && !category) return { icon: '📄', label: 'Kaynak', weight: 0 };

    const sourceStr = (sourceTable || category || '').toLowerCase()
      .replace(/^csv_/, '')
      .replace(/_/g, '')
      .replace(/arsiv.*/, '');  // "makale_arsiv_2021" -> "makale"

    // Source type hierarchy with icons and weights
    const typeMap: Record<string, { icon: string; label: string; weight: number }> = {
      'kanun': { icon: '🏛️', label: 'Kanun/Mevzuat', weight: 100 },
      'teblig': { icon: '📋', label: 'Tebliğ/Yönetmelik', weight: 95 },
      'tebliğ': { icon: '📋', label: 'Tebliğ/Yönetmelik', weight: 95 },
      'yonetmelik': { icon: '📋', label: 'Yönetmelik', weight: 95 },
      'sirkuler': { icon: '🔄', label: 'Sirküler', weight: 90 },
      'ozelge': { icon: '📜', label: 'GİB Özelgesi', weight: 75 },
      'danistay': { icon: '⚖️', label: 'Danıştay Kararı', weight: 70 },
      'danistaykararlari': { icon: '⚖️', label: 'Danıştay Kararı', weight: 70 },
      'makale': { icon: '📝', label: 'Makale', weight: 50 },
      'sorucevap': { icon: '💬', label: 'Soru-Cevap', weight: 50 },
      'hukdkk': { icon: '📘', label: 'Hukuki Değerlendirme', weight: 60 },
      'genelyazi': { icon: '📄', label: 'Genel Yazı', weight: 65 },
      'genelyazı': { icon: '📄', label: 'Genel Yazı', weight: 65 }
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
    return { icon: '📄', label: 'Kaynak', weight: 0 };
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
                {/* Source Type with Icon and Number */}
                {(() => {
                  const typeInfo = getSourceTypeInfo(source.sourceTable, source.category);
                  return (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded mb-1">
                      <span>{typeInfo.icon}</span>
                      <span>[{index + 1}] {typeInfo.label}</span>
                    </span>
                  );
                })()}

                {/* Title - Plain text, no link */}
                <p className="text-sm text-gray-200 leading-snug line-clamp-2">
                  {displayTitle}
                </p>

                {/* Metadata - Show all relevant fields */}
                {source.metadata && Object.keys(source.metadata).length > 0 && (
                  <div className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
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
