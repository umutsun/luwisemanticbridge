'use client';

import { Source } from '@/types/chat';
import { ExternalLink, FileText, Scale, BookOpen, MessageSquare, Database } from 'lucide-react';

interface SourceCitationProps {
  sources: Source[];
}

export function SourceCitation({ sources }: SourceCitationProps) {
  if (!sources || sources.length === 0) return null;

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

  return (
    <div className="mt-4 pt-3 border-t border-gray-100/60 dark:border-gray-600/30">
      <div className="space-y-2">
        {sources.map((source, index) => {
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
                          // Clean up title
                          title = title
                            .replace(/ - ID: \d+/g, '')
                            .replace(/^sorucevap -\s*/, '')
                            .replace(/^ozelgeler -\s*/, '')
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
                            .replace(/^sorucevap -\s*/, '')
                            .replace(/^ozelgeler -\s*/, '')
                            .replace(/\s*\([^)]*\)$/, '') // Remove category suffixes
                            .trim();
                          return title;
                        })()}
                      </span>
                    )}
                  </div>
                  {source.excerpt && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
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
    </div>
  );
}