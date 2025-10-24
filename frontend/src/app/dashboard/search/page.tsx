'use client';

import React, { useState } from 'react';
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
  embedding?: number[];
}

export default function SemanticSearchPage() {

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchStats, setSearchStats] = useState<any>(null);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Lütfen bir arama sorgusu girin');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch('http://localhost:3001/api/v2/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 10,
          threshold: 0.7
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Arama başarısız oldu');
      }

      setResults(data.results || []);
      setSearchStats(data.stats || null);
    } catch (err: any) {
      setError(err.message || 'Arama sırasında bir hata oluştu');
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
          <h1 className="text-xl font-semibold">Semantic Search</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vektör veritabanında anlamsal arama yapın
          </p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Brain className="h-4 w-4" />
          pgvector
        </Badge>
      </div>

      {/* Search Box */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Arama Yap
          </CardTitle>
          <CardDescription>
            Doğal dil kullanarak içeriklerinizde arama yapın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Aramak istediğiniz içeriği yazın... (örn: 'machine learning ile ilgili dökümanlar')"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="min-h-[100px]"
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleSearch} 
                disabled={loading || !query.trim()}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Aranıyor...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Ara
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setError(null);
                  setSearchStats(null);
                }}
              >
                Temizle
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Hata</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Search Stats */}
          {searchStats && (
            <div className="flex items-center gap-4 p-3 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">
                <strong>{results.length}</strong> sonuç bulundu
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">
                Süre: <strong>{searchStats.duration || 'N/A'}ms</strong>
              </span>
              {searchStats.vectorsSearched && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    <strong>{searchStats.vectorsSearched}</strong> vektör tarandı
                  </span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Arama Sonuçları</span>
              <Badge>{results.length} sonuç</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
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
                            Kaynağı Görüntüle
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
            <p className="text-lg font-medium">Sonuç bulunamadı</p>
            <p className="text-muted-foreground text-center mt-2">
              Farklı kelimeler kullanarak tekrar deneyin
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}