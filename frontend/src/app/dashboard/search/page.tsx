'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileText,
  Link,
  Calendar,
  Hash,
  ChevronRight,
  Database,
  Brain,
  Sparkles
} from 'lucide-react';

interface SearchResult {
  id: string;
  content: string;
  metadata: {
    source: string;
    url?: string;
    title?: string;
    date?: string;
  };
  similarity: number;
}

export default function SemanticSearchPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchStats, setSearchStats] = useState<any>(null);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError(t('search.errors.empty_query'));
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch(`${getApiUrl()}/api/v2/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_CONFIG.INTERNAL_API_KEY
        },
        body: JSON.stringify({
          query,
          limit: 10,
          threshold: 0.7
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('search.errors.failed'));
      }

      setResults(data.results || []);
      setSearchStats(data.stats || null);
    } catch (err: any) {
      setError(err.message || t('search.errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('search.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('search.description')}
          </p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Brain className="h-4 w-4" />
          pgvector
        </Badge>
      </div>

      {/* Search Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Textarea
                placeholder={t('search.placeholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                className="min-h-[100px] resize-none"
              />
            </div>
            <Button
              size="icon"
              className="h-auto w-12"
              onClick={handleSearch}
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Hata</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="flex items-center justify-between">
              <span>{t('search.results.title')}</span>
              <Badge>{results.length} {t('search.results.count_label')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4 pt-4">
                {results.map((result, index) => (
                  <Card key={result.id || index} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {result.metadata?.title || `Sonuç ${index + 1}`}
                          </CardTitle>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {result.metadata?.source && (
                              <div className="flex items-center gap-1">
                                <Database className="h-3 w-3" />
                                {result.metadata.source}
                              </div>
                            )}
                            {result.metadata?.date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(result.metadata.date).toLocaleDateString('tr-TR')}
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant={result.similarity > 0.8 ? "default" : "secondary"}
                          className="ml-2"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          {(result.similarity * 100).toFixed(1)}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed line-clamp-4">
                        {result.content}
                      </p>
                      {result.metadata?.url && (
                        <div className="mt-3">
                          <a
                            href={result.metadata.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Link className="h-3 w-3" />
                            {t('search.search_box.button_view_source')}
                            <ChevronRight className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && results.length === 0 && query && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">{t('search.results.empty.title')}</p>
            <p className="text-muted-foreground text-center mt-2">
              {t('search.results.empty.description')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}