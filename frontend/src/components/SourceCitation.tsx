import React from 'react';
import { Source } from '@/types/chat';
import { ExternalLink, Search, Network } from 'lucide-react';
import {
  extractSemanticKeywords,
  generateTagKeywords,
  generateSearchQueryFromKeywords
} from '@/utils/keyword-extraction';

interface SourceCitationProps {
  sources: Source[];
  onSourceClick?: (source: Source) => void;
  showRelatedInfo?: boolean;
  isRelatedTopics?: boolean;
}

const SourceCitation: React.FC<SourceCitationProps> = ({
  sources,
  onSourceClick,
  showRelatedInfo = false,
  isRelatedTopics = false
}) => {
  // Extract semantic keywords for each source
  const getSemanticKeywords = (source: Source) => {
    const context = {
      title: source.title || '',
      excerpt: source.excerpt || source.content || '',
      category: source.category || '',
      sourceType: source.sourceTable || '',
      relevanceScore: source.relevanceScore || source.score
    };

    const extraction = extractSemanticKeywords(context);

    // Generate keywords from extraction
    const keywords = generateTagKeywords(extraction);

    // Filter out source table names and generic terms
    const sourceTableDisplayName = getTableDisplayName(source.sourceTable || '');
    const filteredKeywords = keywords.filter(keyword => {
      // Remove source table name
      if (keyword === sourceTableDisplayName) return false;
      // Remove generic terms
      const genericTerms = ['Hukuki', 'Yasal', 'Meşru', 'Geçerli', 'İdari', 'Yargı'];
      return !genericTerms.includes(keyword) && keyword.length > 3;
    });

    // Return only content-based keywords, limited to 3
    return filteredKeywords.slice(0, 3);
  };

  const handleKeywordClick = (source: Source, keyword: string) => {
    const relevanceScore = source.relevanceScore || source.score || 0;
    const context = {
      title: source.title || '',
      excerpt: source.excerpt || source.content || '',
      category: source.category || '',
      sourceType: source.sourceTable || '',
      relevanceScore: relevanceScore
    };

    // Get all semantic keywords from the source for better context
    const allKeywords = getSemanticKeywords(source);

    // Generate enhanced search query with detailed source context
    const searchQuery = generateSearchQueryFromKeywords(
      [keyword, ...allKeywords.filter(k => k !== keyword).slice(0, 3)],
      context
    );

    // Create an enhanced source with contextual information
    const enhancedSource: Source = {
      ...source,
      title: `${keyword} - ${source.title}`,
      excerpt: searchQuery,
      relevanceScore: relevanceScore,
      score: relevanceScore
    };

    onSourceClick?.(enhancedSource);
  };

  
  const getTableDisplayName = (tableName: string) => {
    // Convert table name to readable format dynamically
    if (!tableName) return 'Document';

    // Convert snake_case to Title Case
    return tableName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatSourceTitle = (source: Source) => {
    let title = source.title || '';

    // Clean up title - remove all prefixes and IDs
    title = title
      .replace(/ - ID: \d+/g, '')
      .replace(/^sorucevap -\s*/, '')
      .replace(/^ozelgeler -\s*/, '')
      .replace(/\s*\([^)]*\)$/, '') // Remove category suffixes like (Soru-Cevap)
      .trim();

    return title;
  };

  const formatSourceExcerpt = (source: Source) => {
    let excerpt = source.excerpt || source.content || '';

    // Remove "Cevap:" prefix
    excerpt = excerpt.replace(/^Cevap:\s*/i, '');

    // Clean up and limit length
    excerpt = excerpt.trim();
    if (excerpt.length > 80) {
      // Try to break at word boundary
      const truncated = excerpt.substring(0, 80);
      const lastSpace = truncated.lastIndexOf(' ');
      excerpt = lastSpace > 40 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    }

    return excerpt;
  };

  if (!sources || sources.length === 0) return null;

  return (
    <div className={`mt-3 space-y-1.5 ${isRelatedTopics ? 'border-l-4 border-purple-500 pl-3' : ''}`}>

      <div className="space-y-1">
        {sources.map((source, idx) => (
          <div
            key={source.id || idx}
            className={`text-xs hover:bg-gray-50/50 dark:hover:bg-gray-800/20 rounded p-1.5 -m-0.5 cursor-pointer transition-all duration-150 ${
              isRelatedTopics
                ? 'text-purple-700 dark:text-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 border-l-2 border-purple-300'
                : 'text-gray-600'
            }`}
            onClick={() => onSourceClick?.(source)}
            title={isRelatedTopics ?
              `İlgili konuyu araştır: ${formatSourceTitle(source)}\nAnlamsal olarak zenginleştirilmiş sorgu oluşturulacak` :
              `Konuyu detaylı araştır: ${formatSourceTitle(source)}`
            }
          >
            <div className="flex items-start gap-2">
              <span className={`flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full flex-shrink-0 mt-0.5 ${
                isRelatedTopics
                  ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600'
              }`}>
                {isRelatedTopics ? <Search className="w-3 h-3" /> : idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <span className={`font-medium ${
                      isRelatedTopics
                        ? 'text-purple-800 dark:text-purple-200'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {formatSourceTitle(source)}
                    </span>
                    {showRelatedInfo && source.category && (
                      <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                        {source.category}
                      </span>
                    )}
                  </div>
                </div>
                {/* Excerpt/Description */}
                {source.excerpt && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                    {formatSourceExcerpt(source)}
                  </p>
                )}
                {/* Semantic Keywords */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {getSemanticKeywords(source).map((keyword, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleKeywordClick(source, keyword);
                      }}
                      className={`text-xs px-2 py-1 rounded-full font-medium transition-all duration-150 hover:shadow-sm bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:scale-105`}
                      title={`"${keyword}" ile ilgili araştırma yap`}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
                {source.relevanceScore && (
                  <span className={`ml-2 text-xs font-medium ${
                    isRelatedTopics
                      ? 'text-purple-600'
                      : 'text-gray-400'
                  }`}>
                    {Math.round(source.relevanceScore)}%
                  </span>
                )}
                {source.excerpt && (
                  <div className={`text-xs leading-relaxed ${
                    isRelatedTopics
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {formatSourceExcerpt(source)}
                  </div>
                )}
                {/* Enhanced progress bar for relevance */}
                {source.relevanceScore && (
                  <div className="mt-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isRelatedTopics
                          ? 'bg-gradient-to-r from-purple-400 to-purple-600'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${source.relevanceScore}%` }}
                    />
                  </div>
                )}
                {/* Semantic enrichment indicator */}
                {showRelatedInfo && (
                  <div className="mt-1 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      Anlamsal arama etkin
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SourceCitation;