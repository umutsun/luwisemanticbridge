import React from 'react';
import { Source } from '@/types/chat';

interface SourceCitationProps {
  sources: Source[];
  onSourceClick?: (source: Source) => void;
}

const SourceCitation: React.FC<SourceCitationProps> = ({ sources, onSourceClick }) => {
  const getTableMarkerClass = (tableName: string) => {
    const upperTable = tableName?.toUpperCase();
    switch(upperTable) {
      case 'OZELGELER':
        return 'marker-cyan';
      case 'DANISTAYKARARLARI':
        return 'marker-pink';
      case 'MAKALELER':
        return 'marker-green';
      case 'SORUCEVAP':
        return 'marker-yellow';
      default:
        return '';
    }
  };

  const getTableDisplayName = (tableName: string) => {
    const upperTable = tableName?.toUpperCase();
    switch(upperTable) {
      case 'OZELGELER':
        return 'Özelge';
      case 'DANISTAYKARARLARI':
        return 'Danıştay';
      case 'MAKALELER':
        return 'Makale';
      case 'SORUCEVAP':
        return 'S/C';
      default:
        return 'Kaynak';
    }
  };

  const formatSourceTitle = (source: Source) => {
    let title = source.title || '';

    // Clean up title
    title = title
      .replace(/ - ID: \d+/g, '')
      .replace(/^sorucevap -\s*/, '')
      .replace(/^ozelgeler -\s*/, '')
      .trim();

    // Add category if available
    const category = source.category;
    if (category && category !== 'Kaynak') {
      title += ` (${category})`;
    }

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
    <div className="mt-3 space-y-1.5">
      <div className="text-xs text-gray-500">
        İlgili Konular:
      </div>
      <div className="space-y-1">
        {sources.map((source, idx) => (
          <div
            key={source.id || idx}
            className="text-xs text-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 rounded p-1.5 -m-0.5 cursor-pointer transition-colors duration-150"
            onClick={() => onSourceClick?.(source)}
          >
            <div className="flex items-start gap-2">
              <span className="flex items-center justify-center w-5 h-5 text-xs font-medium text-gray-600 bg-gray-100 dark:bg-gray-800 rounded-full flex-shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    {source.sourceTable && (
                      <span className={`font-medium ${getTableMarkerClass(source.sourceTable)}`}>
                        [{getTableDisplayName(source.sourceTable)}]
                      </span>
                    )}
                    <span className="ml-2 font-medium text-gray-800 dark:text-gray-200">
                      {formatSourceTitle(source)}
                    </span>
                  </div>
                  {source.relevanceScore && (
                    <span className="text-gray-400 ml-2 text-xs">
                      {Math.round(source.relevanceScore)}
                    </span>
                  )}
                </div>
                {source.excerpt && (
                  <div className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">
                    {formatSourceExcerpt(source)}
                  </div>
                )}
                {/* Progress bar for relevance */}
                {source.relevanceScore && (
                  <div className="mt-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${source.relevanceScore}%` }}
                    />
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