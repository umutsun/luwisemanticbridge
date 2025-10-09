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
  Brain,
  Zap,
  Filter,
  X,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

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


export default function WebScraperPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [url, setUrl] = useState('');
  const [scrapedPages, setScrapedPages] = useState<ScrapedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrapeOptions, setScrapeOptions] = useState({
    saveToDb: true,
    generateEmbeddings: false,
    mode: 'auto',
    customSelectors: '',
    prioritySelectors: '',
    extractMode: 'best'
  });
  const [scraping, setScraping] = useState(false);
  const [selectedPage, setSelectedPage] = useState<ScrapedPage | null>(null);
  const [pageDetails, setPageDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // New states for enhanced functionality
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [embedStatusFilter, setEmbedStatusFilter] = useState<'all' | 'embedded' | 'not_embedded' | 'error'>('all');
  const [scrapeProgress, setScrapeProgress] = useState<{
    status: 'idle' | 'scraping' | 'success' | 'error';
    progress: number;
    chunks: number;
    size: number;
    message: string;
  }>({
    status: 'idle',
    progress: 0,
    chunks: 0,
    size: 0,
    message: ''
  });

  useEffect(() => {
    initTables();
    fetchScrapedPages();
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

  
  const fetchPageDetails = async (pageId: string) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/scraper/pages/${pageId}`);
      if (response.ok) {
        const data = await response.json();
        setPageDetails(data.page);
        setSelectedPage(data.page);
      }
    } catch (error) {
      console.error('Failed to fetch page details:', error);
      toast({ variant: "destructive", title: t('scraper.toasts.pageLoadFailed') });
    }
  };

  const handlePageClick = async (page: ScrapedPage) => {
    setSelectedPage(page);
    setLoadingDetails(true);
    await fetchPageDetails(page.id);
    setLoadingDetails(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('scraper.toasts.copied') });
  };

  // New helper functions for enhanced functionality
  const getEmbeddingStatus = (page: ScrapedPage) => {
    // This would need to be implemented based on your backend API
    // For now, using mock logic
    if (page.token_count > 0) return 'embedded';
    if (page.content_length > 0) return 'not_embedded';
    return 'error';
  };

  
  const getFilteredPages = () => {
    return filteredPages.filter(page => {
      const status = getEmbeddingStatus(page);
      switch (embedStatusFilter) {
        case 'embedded':
          return status === 'embedded';
        case 'not_embedded':
          return status === 'not_embedded';
        case 'error':
          return status === 'error';
        default:
          return true;
      }
    });
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
    setScrapeProgress({
      status: 'scraping',
      progress: 10,
      chunks: 0,
      size: 0,
      message: 'Starting scrape...'
    });
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
        setScrapeProgress({
          status: 'success',
          progress: 100,
          chunks: data.metrics?.chunksCreated || 0,
          size: data.metrics?.contentLength || 0,
          message: 'Scrape completed successfully!'
        });
        toast({ title: t('scraper.toasts.scrapeSuccess', { title: data.title }) });
        fetchScrapedPages();
        setUrl('');

        // Reset progress after delay
        setTimeout(() => {
          setScrapeProgress({
            status: 'idle',
            progress: 0,
            chunks: 0,
            size: 0,
            message: ''
          });
        }, 3000);
      } else {
        setScrapeProgress({
          status: 'error',
          progress: 0,
          chunks: 0,
          size: 0,
          message: data.error || 'Scrape failed'
        });
        toast({ variant: "destructive", title: data.error || t('scraper.toasts.scrapeFailed') });
      }
    } catch (error: any) {
      console.error('Scraping error:', error);
      setScrapeProgress({
        status: 'error',
        progress: 0,
        chunks: 0,
        size: 0,
        message: 'Network error occurred'
      });
      toast({ variant: "destructive", title: t('scraper.toasts.networkError') });
    } finally {
      setScraping(false);
    }
  };

  
  const handleDeletePage = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scraped page?')) return;

    try {
      const response = await fetch(`http://localhost:8083/api/v2/scraper/pages/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast({ title: 'Page deleted successfully' });
        fetchScrapedPages();
        // Clear selected pages if deleted page was selected
        setSelectedPages(prev => prev.filter(pageId => pageId !== id));
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: 'Failed to delete page',
          description: errorData.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        variant: "destructive",
        title: 'Network error',
        description: 'Could not connect to server'
      });
    }
  };

  
  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredPages = scrapedPages.filter(page =>
    page.title?.toLowerCase().includes('') ||
    page.url?.toLowerCase().includes('')
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
                        <SelectTrigger id="mode" className="h-10 w-full py-2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            <div className="flex flex-col">
                              <span>Auto (Recommended)</span>
                              <span className="text-xs text-muted-foreground font-normal">Smart selection • 4-20s</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="static">
                            <div className="flex flex-col">
                              <span>Static (Fastest)</span>
                              <span className="text-xs text-muted-foreground font-normal">Basic HTML • ~4s</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="dynamic">
                            <div className="flex flex-col">
                              <span>Dynamic (JavaScript)</span>
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
                        <SelectTrigger id="extractMode" className="h-10 w-full py-2"><SelectValue /></SelectTrigger>
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

              {/* Animated Progress Bar */}
              {scrapeProgress.status !== 'idle' && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">
                      {scrapeProgress.status === 'scraping' && '🔄 Scraping...'}
                      {scrapeProgress.status === 'success' && '✅ Completed!'}
                      {scrapeProgress.status === 'error' && '❌ Error occurred'}
                    </span>
                    <span className="text-xs text-muted-foreground">{scrapeProgress.progress}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        scrapeProgress.status === 'success' ? 'bg-green-500' :
                        scrapeProgress.status === 'error' ? 'bg-red-500' :
                        'bg-blue-500'
                      }`}
                      style={{ width: `${scrapeProgress.progress}%` }}
                    />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white dark:bg-gray-800 rounded p-2">
                      <div className="text-lg font-bold text-blue-600">{scrapeProgress.chunks}</div>
                      <div className="text-xs text-muted-foreground">Chunks</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded p-2">
                      <div className="text-lg font-bold text-green-600">
                        {(scrapeProgress.size / 1024).toFixed(1)}KB
                      </div>
                      <div className="text-xs text-muted-foreground">Size</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded p-2">
                      <div className="text-lg font-bold text-purple-600">{scrapeProgress.progress}</div>
                      <div className="text-xs text-muted-foreground">Progress</div>
                    </div>
                  </div>

                  {scrapeProgress.message && (
                    <p className="text-xs text-center mt-2 text-muted-foreground">
                      {scrapeProgress.message}
                    </p>
                  )}
                </div>
              )}

              <Button onClick={handleScrape} disabled={scraping || !url} className="w-full mt-4">
                {scraping ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('scraper.scrapingButton')}</>) : (<><Zap className="mr-2 h-4 w-4" />{t('scraper.scrapeButton')}</>)}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Scraped Pages Management */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Scraped Pages</CardTitle>
                <Badge variant="secondary">{getFilteredPages().length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {/* Filter */}
                <Select value={embedStatusFilter} onValueChange={(value) => setEmbedStatusFilter(value as any)}>
                  <SelectTrigger className="w-[150px] h-8">
                    <Filter className="h-4 w-4 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Pages</SelectItem>
                    <SelectItem value="embedded">✅ Embedded</SelectItem>
                    <SelectItem value="not_embedded">⏳ Not Embedded</SelectItem>
                    <SelectItem value="error">❌ Error</SelectItem>
                  </SelectContent>
                </Select>

  
                {/* Refresh */}
                <Button onClick={fetchScrapedPages} variant="outline" size="icon" className="h-8 w-8">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : getFilteredPages().length === 0 ? (
              <div className="text-center py-12">
                <Globe className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">No scraped pages found</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead className="w-[100px]">Size/Chunks</TableHead>
                      <TableHead className="w-[60px] text-center">Select</TableHead>
                      <TableHead className="w-[50px] text-center">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredPages().map((page) => {
                      const embedStatus = getEmbeddingStatus(page);

                      return (
                        <TableRow key={page.id}>
                          <TableCell>
                            <div className="max-w-[360px]">
                              <p
                                className="font-medium truncate hover:text-primary cursor-pointer transition-colors"
                                title={page.title}
                                onClick={() => handlePageClick(page)}
                              >
                                {page.title || 'Untitled'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate" title={page.url}>
                                {page.url}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs font-medium">
                                {(page.content_length / 1024).toFixed(1)}KB
                              </span>
                              <span className="text-xs font-medium">{page.chunk_count}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={embedStatus === 'embedded'}
                              disabled={embedStatus === 'embedded'}
                              onChange={() => {
                                if (embedStatus !== 'embedded') {
                                  if (selectedPages.includes(page.id)) {
                                    setSelectedPages(prev => prev.filter(id => id !== page.id));
                                  } else {
                                    setSelectedPages(prev => [...prev, page.id]);
                                  }
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeletePage(page.id)}
                              className="h-8 w-8 p-0 mx-auto"
                              title="Delete Page"
                            >
                              <Trash2 className="h-4 w-4 text-red-500 hover:text-red-600 transition-colors" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedPage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="max-w-5xl w-full h-[85vh] flex flex-col">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-background border-b flex-shrink-0">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-lg">{selectedPage.title || 'Untitled'}</CardTitle>
                  <CardDescription className="truncate flex items-center gap-2 mt-1">
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <a
                      href={selectedPage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {selectedPage.url}
                    </a>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(pageDetails?.content || selectedPage.content || '')}
                    className="h-8"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => {
                    setSelectedPage(null);
                    setPageDetails(null);
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {/* Content Section */}
                <div className="flex-1 p-6 min-h-0">
                  {loadingDetails ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">Loading scraped content...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-3 flex-shrink-0">
                        <Label className="text-base font-semibold">Scraped Content</Label>
                        <Badge variant="outline" className="text-xs">
                          {pageDetails?.content_length || selectedPage.content_length || 0} characters
                        </Badge>
                      </div>

                      {/* ScrollArea with fixed height */}
                      <div className="flex-1 min-h-0">
                        <ScrollArea className="h-full border rounded-lg bg-muted/30">
                          <div className="p-4">
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                              {pageDetails?.content || selectedPage.content || 'No content available'}
                            </pre>
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  )}
                </div>

                {/* Metadata Section */}
                <div className="border-t bg-muted/20 p-4 flex-shrink-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Size</span>
                      <p className="font-medium">
                        {((pageDetails?.content_length || selectedPage.content_length || 0) / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Chunks</span>
                      <p className="font-medium">{pageDetails?.chunk_count || selectedPage.chunk_count || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Scraping Mode</span>
                      <p className="font-medium capitalize">{pageDetails?.scraping_mode || selectedPage.scraping_mode || 'N/A'}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Created</span>
                      <p className="font-medium">{formatDate(pageDetails?.created_at || selectedPage.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}