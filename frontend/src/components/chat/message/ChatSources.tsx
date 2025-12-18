import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
              {/* Source number - smaller on mobile */}
              <div className="flex-shrink-0">
                <span className="flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 text-[10px] sm:text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {idx + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {/* Source type and score - compact on mobile */}
                {source.sourceType && (
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                    <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {source.sourceType}
                    </span>
                    {source.score && (
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        %{Math.min(100, Math.round(source.score))}
                      </span>
                    )}
                  </div>
                )}

                {/* LLM-generated summary - hidden on mobile */}
                {source.summary && (
                  <div className="hidden sm:block mt-2 p-2 rounded bg-primary/5 border-l-2 border-primary/30">
                    <p className="text-xs text-primary font-medium">
                      💡 {source.summary}
                    </p>
                  </div>
                )}

                {/* Content - fewer lines on mobile */}
                {source.content && (
                  <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 sm:line-clamp-4 mt-1 sm:mt-1.5">
                    {source.content}
                  </p>
                )}

                {source.excerpt && !source.content && (
                  <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 sm:line-clamp-4 mt-1 sm:mt-1.5">
                    {source.excerpt}
                  </p>
                )}

                {/* Score bar - only on desktop */}
                {source.score && (
                  <div className="hidden sm:flex items-center gap-1 mt-2 flex-shrink-0">
                    <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.round(source.score))}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium w-10 text-right">
                      %{Math.min(100, Math.round(source.score))}
                    </span>
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
