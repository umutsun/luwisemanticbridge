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

const getKeywordColor = (keyword: string, isBoosted: boolean = false): string => {
  if (isBoosted) {
    return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300';
  }
  const colors = [
    'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400',
    'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
    'bg-pink-100 text-pink-700 hover:bg-pink-200 dark:bg-pink-900/30 dark:text-pink-400'
  ];
  const index = keyword.length % colors.length;
  return colors[index];
};

const getSemanticKeywords = (source: Record<string, unknown>, lastUserQuery: string) => {
  const keywords: string[] = [];
  const boostedKeywords: string[] = [];

  if (lastUserQuery) {
    const queryWords = lastUserQuery.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['için', 'ile', 'var', 'yok', 'bir', 'olan', 'nedir', 'nasıl'].includes(word));

    const title = ((source.title as string) || '').toLowerCase();
    const content = ((source.content as string) || (source.excerpt as string) || '').toLowerCase();
    const text = title + ' ' + content;

    queryWords.forEach(word => {
      if (text.includes(word) && !boostedKeywords.includes(word)) {
        boostedKeywords.push(word);
      }
    });
  }

  keywords.push(...boostedKeywords.slice(0, 2));

  if (source.category && !keywords.includes(source.category as string)) {
    keywords.push(source.category as string);
  }

  if (source.sourceTable) {
    const tableName = getSourceTableName(source.sourceTable as string);
    if (!keywords.includes(tableName)) {
      keywords.push(tableName);
    }
  }

  if (source.keywords && Array.isArray(source.keywords) && source.keywords.length > 0) {
    keywords.push(...source.keywords.slice(0, 2));
  }

  return keywords.slice(0, 5);
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
    <div className="mt-4 pt-3 border-t border-border/50">
      <div className="space-y-2">
        {visibleSources.map((source, idx) => (
          <div
            key={idx}
            className="relative p-3 rounded-lg bg-card border hover:shadow-md transition-all cursor-pointer group"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSourceClick(source);
            }}
            title={t('chat.source.detailedResearch', 'Bu konuyla ilgili detaylı araştırma yap')}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <span className="flex items-center justify-center w-7 h-7 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {idx + 1}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {source.sourceType && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-1 rounded font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {source.sourceType}
                    </span>
                    {source.score && (
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          const score = Math.min(100, Math.round(source.score));
                          let confidenceLevel = '';
                          if (score >= 80) {
                            confidenceLevel = t('chatInterface.confidence.high', 'Yüksek');
                          } else if (score >= 50) {
                            confidenceLevel = t('chatInterface.confidence.medium', 'Orta');
                          } else {
                            confidenceLevel = t('chatInterface.confidence.low', 'Düşük');
                          }
                          return `${confidenceLevel}: ${score}%`;
                        })()}
                      </span>
                    )}
                  </div>
                )}

                {/* LLM-generated summary */}
                {source.summary && (
                  <div className="mt-2 p-2 rounded bg-primary/5 border-l-2 border-primary/30">
                    <p className="text-xs text-primary font-medium">
                      💡 {source.summary}
                    </p>
                  </div>
                )}

                {source.content && (
                  <p className="text-xs text-muted-foreground line-clamp-4 mt-1.5 pl-0.5">
                    {source.content}
                  </p>
                )}

                {source.excerpt && !source.content && (
                  <p className="text-xs text-muted-foreground line-clamp-4 mt-1.5 pl-0.5">
                    {source.excerpt}
                  </p>
                )}

                <div className="flex flex-wrap gap-1 mt-2">
                  {getSemanticKeywords(source, lastUserQuery).slice(0, 4).map((keyword: string, idx: number) => {
                    const isBoosted = idx < 2 && lastUserQuery.length > 0;
                    return (
                      <span
                        key={idx}
                        className={`text-xs px-2 py-1 rounded-none font-medium ${getKeywordColor(keyword, isBoosted)}`}
                        title={isBoosted ? t('chat.keyword.fromQuery', `🔍 Arama sorgunuzdan: "${keyword}"`) : t('chat.keyword.keyword', `Anahtar kelime`)}
                      >
                        {keyword}
                      </span>
                    );
                  })}
                  {source.score && (
                    <div className="flex items-center gap-1 flex-shrink-0">
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
