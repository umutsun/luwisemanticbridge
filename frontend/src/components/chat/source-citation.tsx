'use client';

import { useState } from 'react';
import { Source } from '@/types/chat';
import { ExternalLink, FileText, Scale, BookOpen, MessageSquare, Database, ChevronDown, ChevronUp, Plus } from 'lucide-react';

interface SourceCitationProps {
  sources: Source[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  showLoadMore?: boolean;
}

export function SourceCitation({ sources, onLoadMore, hasMore = false, showLoadMore = false }: SourceCitationProps) {
  if (!sources || sources.length === 0) return null;

  // State for showing/hiding sources (progressive loading)
  const [showAllSources, setShowAllSources] = useState(false);

  // Determine initial sources to show (minResults concept)
  const initialSourcesToShow = 7;
  const sourcesToDisplay = showAllSources ? sources : sources.slice(0, initialSourcesToShow);

  // Helper function to get source table display name
  const getSourceTableName = (sourceTable?: string) => {
    const tableNames: { [key: string]: string } = {
      'OZELGELER': 'Özelgeler',
      'DANISTAYKARARLARI': 'Danıştay Kararları',
      'MAKALELER': 'Makaleler',
      'SORUCEVAP': 'Soru Cevap',
      'Kaynak': 'Genel Kaynak',
      'embeddings': 'Dokümanlar',
      'chunks': 'Metin Parçaları',
      'sources': 'Kaynaklar'
    };
    return tableNames[sourceTable || ''] || sourceTable || 'Kaynak';
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

  // Smart tag extraction - More intelligent keyword extraction
  const getSmartTags = (source: Source): string[] => {
    const tags: string[] = [];
    const title = (source.title || source.citation || '').toLowerCase();
    const excerpt = (source.excerpt || '').toLowerCase();
    const content = title + ' ' + excerpt;

    // Extract specific legal/tax terms
    const legalTerms = [
      'KDV', 'Stopaj', 'ÖTV', 'Damga Vergisi', 'Gelir Vergisi', 'Kurumlar Vergisi',
      'Kira', 'Sözleşme', 'Tazminat', 'İhbar', 'Kıdem', 'İşçi', 'İşveren',
      'Mükellef', 'Beyanname', 'Tarhiyat', 'Cezai Şart', 'Vergi Ziyai',
      'Muafiyet', 'İstisna', 'Oran', 'Tutar', 'Süre'
    ];

    // Find terms in content
    legalTerms.forEach(term => {
      if (content.includes(term.toLowerCase()) && !tags.includes(term)) {
        tags.push(term);
      }
    });

    // Extract percentages
    const percentMatches = content.match(/(\d+)%/g);
    if (percentMatches) {
      percentMatches.forEach(match => {
        if (!tags.includes(match)) {
          tags.push(match);
        }
      });
    }

    // Extract dates/periods
    const dateMatches = content.match(/(\d{4})/g);
    if (dateMatches && dateMatches.length > 0) {
      const year = dateMatches[0];
      if (parseInt(year) >= 2000 && parseInt(year) <= 2030 && !tags.includes(year)) {
        tags.push(year);
      }
    }

    return tags.slice(0, 4); // Limit to 4 tags
  };

  // Handle tag click - Create meaningful search query
  const handleTagClick = (source: Source, tag: string) => {
    // Create a meaningful query combining tag and source context
    const sourceTitle = source.title || source.citation || '';
    const sourceTable = source.sourceTable || '';

    // Build intelligent query
    let query = tag;

    // Add context from source table
    if (sourceTable) {
      const tableContext = {
        'OZELGELER': 'Özelge',
        'DANISTAYKARARLARI': 'Danıştay Kararı',
        'MAKALELER': 'Makale',
        'SORUCEVAP': 'Soru Cevap'
      }[sourceTable] || sourceTable;

      query += ` ${tableContext}`;
    }

    // Add relevant part of title if it's not too long
    if (sourceTitle && sourceTitle.length < 100) {
      // Remove redundant parts
      const cleanTitle = sourceTitle
        .replace(/ - ID: \d+/g, '')
        .replace(/^sorucevap -\s*/i, '')
        .replace(/^ozelgeler -\s*/i, '')
        .replace(/^danıştay kararları -\s*/i, '')
        .replace(/^makaleler -\s*/i, '')
        .trim();

      if (cleanTitle && cleanTitle !== tag) {
        query += ` "${cleanTitle}"`;
      }
    }

    // Trigger custom event for ChatInterface to handle
    window.dispatchEvent(new CustomEvent('tagClick', {
      detail: { query, source, tag }
    }));
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
                        {getSourceTableName(source.sourceTable)}
                      </span>
                    </div>
                  ) : (
                    <div className="h-6 mb-2"></div> // Maintain spacing
                  )}

                  <div className="flex items-center gap-2 mb-1">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium line-clamp-2"
                      >
                        {(() => {
                          let title = source.citation || source.title || '';
                          // Clean up title - remove source table prefix if it exists
                          title = title
                            .replace(/ - ID: \d+/g, '')
                            .replace(/^sorucevap -\s*/i, '')
                            .replace(/^ozelgeler -\s*/i, '')
                            .replace(/^danıştay kararları -\s*/i, '')
                            .replace(/^makaleler -\s*/i, '')
                            .replace(/\s*\([^)]*\)$/, '') // Remove category suffixes
                            .trim();
                          return title;
                        })()}
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-2">
                        {(() => {
                          let title = source.citation || source.title || '';
                          // Clean up title
                          title = title
                            .replace(/ - ID: \d+/g, '')
                            .replace(/^sorucevap -\s*/i, '')
                            .replace(/^ozelgeler -\s*/i, '')
                            .replace(/^danıştay kararları -\s*/i, '')
                            .replace(/^makaleler -\s*/i, '')
                            .replace(/\s*\([^)]*\)$/, '') // Remove category suffixes
                            .trim();
                          return title;
                        })()}
                      </span>
                    )}
                  </div>

                  {/* Smart Tags - Extracted from content */}
                  {(() => {
                    const tags = getSmartTags(source);
                    if (tags.length === 0) return null;

                    return (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tags.map((tag, tagIndex) => (
                          <button
                            key={tagIndex}
                            onClick={() => handleTagClick(source, tag)}
                            className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full transition-colors cursor-pointer hover:scale-105 transform"
                            title={`"${tag}" ile ilgili soru sor`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                  {source.excerpt && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2 leading-relaxed">
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