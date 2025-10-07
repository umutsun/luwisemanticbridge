'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  Loader2,
  Trash2,
  RefreshCw,
  FileText,
  Database,
  History,
  Calendar,
  Brain,
  Search,
  Zap,
  Eye,
  X,
  Copy,
  ExternalLink,
  CheckCircle
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface ScrapedPage {
  id: string;
  title: string;
  url: string;
  content: string;
  description: string;
  keywords: string;
  content_length: number;
  chunk_count: number;
  token_count: number;
  scraping_mode: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

interface HistoryEntry {
  id: number;
  operation_type: string;
  source_url: string;
  title: string;
  status: string;
  details: any;
  metrics: any;
  error_message?: string;
  created_at: string;
}

export default function WebScraperPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [url, setUrl] = useState('');
  const [scrapedPages, setScrapedPages] = useState<ScrapedPage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrapeOptions, setScrapeOptions] = useState({
    saveToDb: true,
    generateEmbeddings: false,
    mode: 'auto',
    customSelectors: '',
    prioritySelectors: '',
    extractMode: 'best'
  });
  const [embeddingProgress, setEmbeddingProgress] = useState<Record<string, boolean>>({});
  const [scraping, setScraping] = useState(false);
  const [selectedPage, setSelectedPage] = useState<ScrapedPage | null>(null);
  const [lastScrapedData, setLastScrapedData] = useState<any>(null);

  useEffect(() => {
    initTables();
    fetchScrapedPages();
    fetchHistory();
  }, []);

  const initTables = async () => {
    try {
      await fetch('http://localhost:8083/api/v2/scraper/init-table', { method: 'POST' });
      await fetch('http://localhost:8083/api/v2/scraper/activity/init-table', { method: 'POST' });
    } catch (error) {
      console.error('Failed to initialize tables:', error);
    }
  };

  const fetchScrapedPages = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/pages');
      if (response.ok) {
        const data = await response.json();
        setScrapedPages(data.pages || []);
      }
    } catch (error) {
      console.error('Failed to fetch pages:', error);
      toast({ variant: "destructive", title: t('scraper.toasts.pageLoadFailed') });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/activity/history?operation_type=scrape&limit=10');
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const fetchPageDetails = async (pageId: string) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/scraper/pages/${pageId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedPage(data.page);
      }
    } catch (error) {
      console.error('Failed to fetch page details:', error);
      toast({ variant: "destructive", title: t('scraper.toasts.pageLoadFailed') });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('scraper.toasts.copied') });
  };

  const handleScrape = async () => {
    if (!url) {
      toast({ variant: "destructive", title: t('scraper.toasts.enterUrl') });
      return;
    }
    try {
      new URL(url);
    } catch {
      toast({ variant: "destructive", title: t('scraper.toasts.validUrl') });
      return;
    }
    setScraping(true);
    try {
      const customSelectorsArray = scrapeOptions.customSelectors.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      const prioritySelectorsArray = scrapeOptions.prioritySelectors.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      
      const response = await fetch('http://localhost:8083/api/v2/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url, 
          ...scrapeOptions,
          customSelectors: customSelectorsArray,
          prioritySelectors: prioritySelectorsArray
        })
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: t('scraper.toasts.scrapeSuccess', { title: data.title }) });
        setLastScrapedData(data);
        fetchScrapedPages();
        fetchHistory();
        setUrl('');
      } else {
        toast({ variant: "destructive", title: data.error || t('scraper.toasts.scrapeFailed') });
      }
    } catch (error: any) {
      console.error('Scraping error:', error);
      toast({ variant: "destructive", title: t('scraper.toasts.networkError') });
    } finally {
      setScraping(false);
    }
  };

  const handleCreateEmbeddings = async (pageId: string, title: string) => {
    setEmbeddingProgress(prev => ({ ...prev, [pageId]: true }));
    try {
      toast({ title: t('scraper.toasts.embeddingsSuccess', { title }) });
      fetchScrapedPages();
    } catch (error) {
      toast({ variant: "destructive", title: t('scraper.toasts.embeddingsFailed') });
    } finally {
      setEmbeddingProgress(prev => ({ ...prev, [pageId]: false }));
    }
  };

  const handleDeletePage = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/scraper/pages/${id}`, { method: 'DELETE' });
      if (response.ok) {
        toast({ title: t('scraper.toasts.pageDeleted') });
        fetchScrapedPages();
      } else {
        toast({ variant: "destructive", title: t('scraper.toasts.pageDeleteFailed') });
      }
    } catch (error) {
      toast({ variant: "destructive", title: t('scraper.toasts.networkError') });
    }
  };

  const deleteHistoryEntry = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/scraper/activity/history/scraper/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchHistory();
        toast({ title: t('scraper.toasts.historyDeleted') });
      } else {
        toast({ variant: "destructive", title: t('scraper.toasts.historyDeleteFailed') });
      }
    } catch (error) {
      toast({ variant: "destructive", title: t('scraper.toasts.networkError') });
    }
  };

  const clearAllHistory = async () => {
    if (!confirm(t('scraper.toasts.confirmClearHistory'))) return;
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/activity/history/scraper', { method: 'DELETE' });
      if (response.ok) {
        fetchHistory();
        toast({ title: t('scraper.toasts.historyCleared') });
      } else {
        toast({ variant: "destructive", title: t('scraper.toasts.historyClearFailed') });
      }
    } catch (error) {
      toast({ variant: "destructive", title: t('scraper.toasts.networkError') });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredPages = scrapedPages.filter(page =>
    page.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.url?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('scraper.title')}</h1>
          <p className="text-muted-foreground">{t('scraper.description')}</p>
        </div>
      </div>

      {/* Top Section: Scraper Tool and History Tabs */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Left Column: Scraper Tool */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">{t('scraper.scraperTitle')}</CardTitle>
            <CardDescription className="text-sm">{t('scraper.scraperDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                type="url"
                placeholder={t('scraper.urlPlaceholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !scraping && handleScrape()}
                className="mb-2"
                disabled={scraping}
              />
              <div className="space-y-3 border-t pt-3">
                <Label className="text-sm font-medium">Advanced Options</Label>
                <div className="grid gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="mode" className="text-xs">Scraping Mode</Label>
                      <Select value={scrapeOptions.mode} onValueChange={(value) => setScrapeOptions({...scrapeOptions, mode: value})}>
                        <SelectTrigger id="mode" className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            <div className="flex flex-col">
                              <span>🤖 Auto (Recommended)</span>
                              <span className="text-xs text-muted-foreground font-normal">Smart selection • 4-20s</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="static">
                            <div className="flex flex-col">
                              <span>⚡ Static (Fastest)</span>
                              <span className="text-xs text-muted-foreground font-normal">Basic HTML • ~4s</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="dynamic">
                            <div className="flex flex-col">
                              <span>🌐 Dynamic (JavaScript)</span>
                              <span className="text-xs text-muted-foreground font-normal">Modern sites • ~20s</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {scrapeOptions.mode === 'auto' && 'Automatically selects the best method based on website type'}
                        {scrapeOptions.mode === 'static' && 'Perfect for simple HTML sites, blogs, documentation'}
                        {scrapeOptions.mode === 'dynamic' && 'Best for modern sites with JavaScript, React, Vue'}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="extractMode" className="text-xs">Extract Mode</Label>
                      <Select value={scrapeOptions.extractMode} onValueChange={(value) => setScrapeOptions({...scrapeOptions, extractMode: value})}>
                        <SelectTrigger id="extractMode" className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="best">Best</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="first">First</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="customSelectors" className="text-xs">Custom CSS Selectors</Label>
                    <Textarea id="customSelectors" placeholder="h1\n.content\n#main\narticle p" value={scrapeOptions.customSelectors} onChange={(e) => setScrapeOptions({...scrapeOptions, customSelectors: e.target.value})} className="h-20 text-xs font-mono" />
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => setScrapeOptions({...scrapeOptions, customSelectors: "h1"})}>
                        h1
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => setScrapeOptions({...scrapeOptions, customSelectors: ".content"})}>
                        .content
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => setScrapeOptions({...scrapeOptions, customSelectors: "#main"})}>
                        #main
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => setScrapeOptions({...scrapeOptions, customSelectors: "article"})}>
                        article
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => setScrapeOptions({...scrapeOptions, customSelectors: ".product-title, .product-price"})}>
                        Products
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Enter CSS selectors (one per line) to extract specific content</p>
                  </div>
                  <div>
                    <Label htmlFor="prioritySelectors" className="text-xs">Priority Selectors</Label>
                    <Textarea id="prioritySelectors" placeholder="article\n.post-body" value={scrapeOptions.prioritySelectors} onChange={(e) => setScrapeOptions({...scrapeOptions, prioritySelectors: e.target.value})} className="h-16 text-xs font-mono" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center space-x-2">
                      <Switch id="saveToDb" checked={scrapeOptions.saveToDb} onCheckedChange={(checked) => setScrapeOptions({...scrapeOptions, saveToDb: checked})} />
                      <Label htmlFor="saveToDb" className="text-xs cursor-pointer">Save to DB</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch id="generateEmbeddings" checked={scrapeOptions.generateEmbeddings} onCheckedChange={(checked) => setScrapeOptions({...scrapeOptions, generateEmbeddings: checked})} />
                      <Label htmlFor="generateEmbeddings" className="text-xs cursor-pointer">Create Embeddings</Label>
                    </div>
                  </div>
                  <div className="mt-2 p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between text-xs">
                      <span>Performance Preview:</span>
                      <div className="flex items-center gap-2">
                        {scrapeOptions.mode === 'auto' && <Badge variant="outline">🤖 Smart</Badge>}
                        {scrapeOptions.mode === 'static' && <Badge variant="outline">⚡ Fast</Badge>}
                        {scrapeOptions.mode === 'dynamic' && <Badge variant="outline">🌐 Full</Badge>}
                        {scrapeOptions.customSelectors && <Badge variant="outline">🎯 Custom</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {scrapeOptions.mode === 'auto' && 'Estimated: 4-20 seconds • Best compatibility'}
                      {scrapeOptions.mode === 'static' && 'Estimated: ~4 seconds • HTML only'}
                      {scrapeOptions.mode === 'dynamic' && 'Estimated: ~20 seconds • JavaScript support'}
                      {scrapeOptions.customSelectors && ' • Custom selectors active'}
                    </p>
                  </div>
                </div>
              </div>
              <Button onClick={handleScrape} disabled={scraping || !url} className="w-full mt-4">
                {scraping ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('scraper.scrapingButton')}</>) : (<><Zap className="mr-2 h-4 w-4" />{t('scraper.scrapeButton')}</>)}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Tabs for Last Scrape and History */}
        <Card>
          <Tabs defaultValue="last_scrape" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="last_scrape">Son Scrape</TabsTrigger>
              <TabsTrigger value="history">Geçmiş</TabsTrigger>
            </TabsList>
            <TabsContent value="last_scrape">
              <CardContent className="pt-4">
                {lastScrapedData ? (
                  <div className="space-y-3">
                    <h3 className="font-medium truncate" title={lastScrapedData.title}>{lastScrapedData.title}</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-muted-foreground">Length:</span><p className="font-medium">{lastScrapedData.metrics?.contentLength || 0} chars</p></div>
                      <div><span className="text-muted-foreground">Chunks:</span><p className="font-medium">{lastScrapedData.metrics?.chunksCreated || 0}</p></div>
                    </div>
                    <div><Label className="text-xs">URL</Label><p className="text-xs text-muted-foreground truncate">{lastScrapedData.url}</p></div>
                    <div>
                      <h4 className="text-sm font-medium mb-2">Content Preview:</h4>
                      <div className="bg-muted/50 rounded-lg p-3 max-h-[250px] overflow-y-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono">{lastScrapedData.contentPreview || 'No content'}</pre>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
                    <FileText className="h-12 w-12 mb-3" />
                    <p className="text-sm">No content scraped yet</p>
                    <p className="text-xs mt-1">Your last scrape result will appear here.</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
            <TabsContent value="history">
              <div className="max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>URL</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length > 0 ? history.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium truncate text-xs" title={entry.source_url}>{entry.source_url}</TableCell>
                        <TableCell>
                          <Badge variant={entry.status === 'success' ? 'success' : 'destructive'}>{entry.status}</Badge>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={2} className="text-center">No history found.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Bottom Section: Scraped Documents List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{t('scraper.scrapedPages')}</CardTitle>
              <Badge variant="secondary">{filteredPages.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('scraper.searchPlaceholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 w-full sm:w-[200px] h-9" />
              </div>
              <Button onClick={fetchScrapedPages} variant="outline" size="icon" className="h-9 w-9">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filteredPages.length === 0 ? (
            <div className="text-center py-12"><Globe className="mx-auto h-12 w-12 text-muted-foreground" /><p className="mt-2 text-muted-foreground">{t('scraper.noPages')}</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">{t('scraper.table.title')}</TableHead>
                    <TableHead className="w-[25%]">{t('scraper.table.url')}</TableHead>
                    <TableHead>{t('scraper.table.size')}</TableHead>
                    <TableHead>{t('scraper.table.chunks')}</TableHead>
                    <TableHead>{t('scraper.table.date')}</TableHead>
                    <TableHead className="text-right">{t('scraper.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPages.map((page) => (
                    <TableRow key={page.id}>
                      <TableCell className="font-medium"><div className="flex items-center gap-2"><FileText className="h-4 w-4 flex-shrink-0" /><span className="truncate" title={page.title || 'Untitled'}>{page.title || 'Untitled'}</span></div></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground truncate block" title={page.url}>{page.url}</span></TableCell>
                      <TableCell className="text-sm">{formatFileSize(page.content_length)}</TableCell>
                      <TableCell className="text-sm text-center">{page.chunk_count || 0}</TableCell>
                      <TableCell className="text-sm">{new Date(page.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchPageDetails(page.id)} title={t('scraper.actions.viewDetails')}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCreateEmbeddings(page.id, page.title)} disabled={embeddingProgress[page.id]} title="Generate Embeddings">
                            {embeddingProgress[page.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeletePage(page.id)} title={t('scraper.actions.delete')}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-auto">
            <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-background z-10">
              <div className="min-w-0">
                <CardTitle className="truncate">{selectedPage.title}</CardTitle>
                <CardDescription className="truncate">{selectedPage.url}</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedPage(null)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>{t('scraper.details.content')}</Label>
                  <div className="bg-muted rounded-lg p-4 max-h-96 overflow-auto mt-1">
                    <pre className="whitespace-pre-wrap text-sm font-mono">{selectedPage.content}</pre>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div><span className="text-sm text-muted-foreground">{t('scraper.details.length')}</span><p className="font-medium">{selectedPage.content_length} {t('scraper.details.characters')}</p></div>
                  <div><span className="text-sm text-muted-foreground">{t('scraper.table.chunks')}</span><p className="font-medium">{selectedPage.chunk_count}</p></div>
                  <div><span className="text-sm text-muted-foreground">{t('scraper.table.mode')}</span><p className="font-medium">{selectedPage.scraping_mode || 'N/A'}</p></div>
                  <div><span className="text-sm text-muted-foreground">{t('scraper.details.created')}</span><p className="font-medium">{formatDate(selectedPage.created_at)}</p></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}