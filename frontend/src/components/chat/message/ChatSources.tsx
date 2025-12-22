import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { stripHtml } from '@/utils/html-utils';

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

interface ChatSourcesProps {
  messageId: string;
  sources: Source[];
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

const getSourceTableName = (sourceTable?: string, t?: (key: string) => string) => {
  if (!sourceTable) return t?.('chat.source.default') || 'Default';
  const tableName = sourceTable
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
  const translationKey = `chat.source.table.${sourceTable.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  return t?.(translationKey) || tableName;
};

export const ChatSources: React.FC<ChatSourcesProps> = ({
  messageId,
  sources,
  lastUserQuery,
  ragSettings,
  visibleSourcesCount,
  setVisibleSourcesCount,
  onSourceClick
}) => {
  const { t } = useTranslation();

  const sortedSources = (sources || []).sort((a, b) => (b.score || 0) - (a.score || 0));
  const visibleCount = visibleSourcesCount[messageId] || ragSettings.minResults;
  const visibleSources = sortedSources.slice(0, visibleCount);
  const hasMore = sortedSources.length > visibleCount;

  return (
    <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-border/50">
      <div className="space-y-1.5 sm:space-y-2">
        {visibleSources.map((source, idx) => (
          <div
            key={idx}
            className="relative p-2 sm:p-3 rounded-lg bg-card border hover:shadow-md transition-all cursor-pointer group"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSourceClick(source);
            }}
            title={t('chat.source.detailedResearch', 'Bu konuyla ilgili detaylı araştırma yap')}
          >
            <div className="flex items-start gap-2 sm:gap-3">
              {/* Source number - smaller on mobile (score used for sorting, not displayed) */}
              <div className="flex-shrink-0">
                <span className="flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 text-[10px] sm:text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {idx + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {/* Document title from schema */}
                {source.title && (
                  <h4 className="text-xs sm:text-sm font-medium text-foreground line-clamp-1 mb-1">
                    {stripHtml(source.title)}
                  </h4>
                )}

                {/* Content - fewer lines on mobile */}
                {source.content && (
                  <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 sm:line-clamp-4">
                    {stripHtml(source.content)}
                  </p>
                )}

                {source.excerpt && !source.content && (
                  <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 sm:line-clamp-4">
                    {stripHtml(source.excerpt)}
                  </p>
                )}

                {/* LLM-generated summary - hidden on mobile */}
                {source.summary && (
                  <div className="hidden sm:block mt-1.5 p-2 rounded bg-primary/5 border-l-2 border-primary/30">
                    <p className="text-xs text-primary font-medium">
                      💡 {stripHtml(source.summary)}
                    </p>
                  </div>
                )}

                {/* Source type/category at the bottom - smaller font */}
                {(source.sourceType || source.category) && (
                  <div className="flex items-center gap-1.5 mt-1.5 sm:mt-2">
                    {source.sourceType && (
                      <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {source.sourceType}
                      </span>
                    )}
                    {source.category && (
                      <span className="text-[9px] sm:text-[10px] text-muted-foreground/70">
                        • {source.category}
                      </span>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        ))}
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => {
              setVisibleSourcesCount(prev => ({
                ...prev,
                [messageId]: Math.min(visibleCount + ragSettings.minResults, sortedSources.length)
              }));
            }}
          >
            <ChevronDown className="w-4 h-4 mr-2" />
            {t('chat.source.showMore', `Daha fazla göster (${sortedSources.length - visibleCount} konu daha)`)}
          </Button>
        )}
      </div>
    </div>
  );
};
