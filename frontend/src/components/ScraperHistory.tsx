'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Globe,
  Calendar,
  FileText,
  Eye,
  Trash2,
  RefreshCw,
  Loader2,
  CloudUpload,
  Zap
} from 'lucide-react';

interface ScrapedContent {
  id: string;
  url: string;
  title: string;
  content: string;
  metadata: {
    scraped_at: string;
    content_length: number;
    status: 'success' | 'failed';
    processed?: boolean;
  };
}

interface ScraperHistoryProps {
  onSelectContent?: (content: ScrapedContent) => void;
  onProcessContent?: (content: ScrapedContent, action: 'document' | 'embedding') => void;
}

export default function ScraperHistory({ onSelectContent, onProcessContent }: ScraperHistoryProps) {
  const [history, setHistory] = useState<ScrapedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ScrapedContent | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/scraper/history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch scraper history:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Bu içeriği silmek istediğinizden emin misiniz?')) return;
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/scraper/history/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setHistory(history.filter(h => h.id !== id));
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Scraper Geçmişi</CardTitle>
            <p className="text-sm text-muted-foreground">
              {history.length} içerik çekildi
            </p>
          </div>
          <Button onClick={fetchHistory} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Başlık</TableHead>
                <TableHead>Boyut</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Henüz içerik çekilmemiş
                  </TableCell>
                </TableRow>
              ) : (
                history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="text-sm truncate flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {item.url}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[150px]">
                        <p className="font-medium truncate">{item.title}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {Math.round(item.metadata.content_length / 1024)}KB
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span className="text-sm">
                          {new Date(item.metadata.scraped_at).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Badge variant={
                          item.metadata.status === 'success' ? 'success' : 'destructive'
                        }>
                          {item.metadata.status}
                        </Badge>
                        {item.metadata.processed && (
                          <Badge variant="outline">İşlendi</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedContent(item);
                            onSelectContent?.(item);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {onProcessContent && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onProcessContent(item, 'document')}
                              title="Doküman olarak ekle"
                            >
                              <CloudUpload className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onProcessContent(item, 'embedding')}
                              title="Embedding oluştur"
                            >
                              <Zap className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Detail Modal */}
        {selectedContent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-[700px] max-h-[80vh] overflow-auto">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{selectedContent.title}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedContent(null)}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">URL:</span>
                      <p className="font-medium">{selectedContent.url}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Çekilme Tarihi:</span>
                      <p className="font-medium">
                        {new Date(selectedContent.metadata.scraped_at).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">İçerik</h4>
                    <ScrollArea className="h-[300px] rounded-md border p-4 bg-gray-50 dark:bg-gray-800">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedContent.content}
                      </p>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}