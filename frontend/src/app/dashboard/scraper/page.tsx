'use client';

import { useState, useEffect } from 'react';
import {
  Search, Plus, Globe, Settings, Loader2, Play, RefreshCw, Trash2, CheckCircle, AlertCircle,
  Database, BarChart3, Brain, Tag, TrendingUp, FileText, Eye, Download, Upload, Pause,
  SkipForward, Activity, Layers, Target, Package, Filter, ChevronDown, Zap, Grid3x3,
  ShoppingCart, BookOpen, User, Calendar, MapPin, Star, Hash, Link2, Image, X, Check
} from 'lucide-react';
import { apiConfig } from '@/config/api.config';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Site {
  id: string;
  name: string;
  base_url: string;
  type: string;
  category: string;
  status?: 'configured' | 'not_configured' | 'analyzing' | 'analyzed';
  structure?: any;
  scrapingConfig?: any;
  createdAt: string;
}

interface EntityTemplate {
  id: string;
  name: string;
  icon?: string;
  fields: {
    name: string;
    selector: string;
    type: 'text' | 'number' | 'price' | 'image' | 'link' | 'date';
    required: boolean;
  }[];
  category: 'product' | 'article' | 'event' | 'person' | 'location' | 'custom';
}

interface ScrapeJob {
  id: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  result?: any;
  error?: string;
  type?: 'concept' | 'category' | 'entity' | 'multi_concept';
  concept?: string;
  category?: string;
  entityType?: string;
  scrapedData?: any[];
  createdAt: string;
}

interface ScrapedData {
  id: string;
  url: string;
  title: string;
  content: string;
  type: 'concept' | 'category' | 'entity';
  concept?: string;
  category?: string;
  entities?: any[];
  scrapedAt: string;
}

export default function ScraperPage() {
  const [activeView, setActiveView] = useState<'simple' | 'concept' | 'category' | 'entity' | 'advanced' | 'results'>('simple');
  const [sites, setSites] = useState<Site[]>([]);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [scrapedData, setScrapedData] = useState<ScrapedData[]>([]);
  const [entityTemplates, setEntityTemplates] = useState<EntityTemplate[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EntityTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  // Search and autocomplete states
  const [siteSearchTerm, setSiteSearchTerm] = useState('');
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [categorySiteSearchTerm, setCategorySiteSearchTerm] = useState('');
  const [entitySiteSearchTerm, setEntitySiteSearchTerm] = useState('');

  // Form states
  const [newSite, setNewSite] = useState({
    name: '',
    baseUrl: '',
    type: 'blog',
    category: ''
  });

  // Concept analysis state
  const [concept, setConcept] = useState('');
  const [conceptSites, setConceptSites] = useState<string[]>([]);
  const [conceptDepth, setConceptDepth] = useState(2);

  // Category scraping state
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categoryDepth, setCategoryDepth] = useState(3);
  const [categoryExtract, setCategoryExtract] = useState<'all' | 'products' | 'articles' | 'data'>('all');

  // Entity scraping state
  const [entityUrl, setEntityUrl] = useState('');
  const [entityDepth, setEntityDepth] = useState(2);

  // Quick Scrape state
  const [quickScrapeUrl, setQuickScrapeUrl] = useState('');
  const [quickScrapeMode, setQuickScrapeMode] = useState<'auto' | 'static' | 'dynamic'>('auto');
  const [quickScrapeDepth, setQuickScrapeDepth] = useState(1);
  const [quickScrapeImages, setQuickScrapeImages] = useState(false);
  const [quickScrapeLinks, setQuickScrapeLinks] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch all data
  useEffect(() => {
    fetchSites();
    fetchJobs();
    fetchEntityTemplates();
    fetchScrapedData();
  }, []);

  // Auto-refresh running jobs
  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchSites = async () => {
    try {
      const response = await fetchWithAuth(`${apiConfig.baseUrl}/api/v2/scraper/sites`);
      if (response.ok) {
        const data = await response.json();
        setSites(data.sites || []);
      }
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await fetchWithAuth(`${apiConfig.baseUrl}/api/v2/scraper/jobs`);
      if (response.ok) {
        const data = await response.json();
        setScrapeJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  };

  const fetchScrapedData = async () => {
    try {
      const response = await fetchWithAuth(`${apiConfig.baseUrl}/api/v2/scraper/data`);
      if (response.ok) {
        const data = await response.json();
        setScrapedData(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch scraped data:', error);
    }
  };

  const fetchEntityTemplates = async () => {
    const templates: EntityTemplate[] = [
      {
        id: 'product',
        name: 'Product',
        icon: 'Package',
        category: 'product',
        fields: [
          { name: 'name', selector: 'h1, .product-title, .product-name', type: 'text', required: true },
          { name: 'price', selector: '.price, .product-price, [data-price]', type: 'price', required: false },
          { name: 'description', selector: '.description, .product-description', type: 'text', required: false },
          { name: 'image', selector: '.product-image img, .gallery img', type: 'image', required: false },
          { name: 'category', selector: '.breadcrumb, .product-category', type: 'text', required: false },
          { name: 'rating', selector: '.rating, .stars', type: 'number', required: false }
        ]
      },
      {
        id: 'article',
        name: 'Article',
        icon: 'FileText',
        category: 'article',
        fields: [
          { name: 'title', selector: 'h1, .article-title', type: 'text', required: true },
          { name: 'author', selector: '.author, .byline', type: 'text', required: false },
          { name: 'date', selector: '.date, .published', type: 'date', required: false },
          { name: 'content', selector: '.content, article', type: 'text', required: false },
          { name: 'tags', selector: '.tags, .labels', type: 'text', required: false }
        ]
      },
      {
        id: 'event',
        name: 'Event',
        icon: 'Calendar',
        category: 'event',
        fields: [
          { name: 'title', selector: 'h1, .event-title', type: 'text', required: true },
          { name: 'date', selector: '.event-date, .date', type: 'date', required: true },
          { name: 'location', selector: '.event-location, .location', type: 'text', required: false },
          { name: 'description', selector: '.event-description, .description', type: 'text', required: false }
        ]
      },
      {
        id: 'person',
        name: 'Person',
        icon: 'User',
        category: 'person',
        fields: [
          { name: 'name', selector: '.person-name, .name', type: 'text', required: true },
          { name: 'title', selector: '.person-title, .title', type: 'text', required: false },
          { name: 'email', selector: '.email, .contact', type: 'text', required: false },
          { name: 'bio', selector: '.bio, .description', type: 'text', required: false }
        ]
      },
      {
        id: 'location',
        name: 'Location',
        icon: 'MapPin',
        category: 'location',
        fields: [
          { name: 'name', selector: '.location-name, .name', type: 'text', required: true },
          { name: 'address', selector: '.address, .location', type: 'text', required: false },
          { name: 'phone', selector: '.phone, .contact', type: 'text', required: false },
          { name: 'rating', selector: '.rating, .stars', type: 'number', required: false }
        ]
      }
    ];
    setEntityTemplates(templates);
  };

  // Toggle site selection for concept search
  const toggleSiteSelection = (siteId: string) => {
    setSelectedSites(prev =>
      prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  // Select all / deselect all
  const selectAllSites = () => {
    setSelectedSites(sites.map(s => s.id));
  };

  const deselectAllSites = () => {
    setSelectedSites([]);
  };

  // Preview function
  const handlePreview = async () => {
    if (!quickScrapeUrl.trim()) {
      alert('Please enter a URL to preview');
      return;
    }

    setPreviewLoading(true);
    setPreviewResult(null);

    try {
      const response = await fetchWithAuth(`${apiConfig.baseUrl}/api/v2/scraper/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: quickScrapeUrl.trim(),
          options: {
            mode: quickScrapeMode,
            maxDepth: quickScrapeDepth,
            includeImages: quickScrapeImages,
            includeLinks: quickScrapeLinks
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        setPreviewResult(data.preview);
      } else {
        setPreviewResult({
          title: 'Error',
          content: data.error || 'Preview failed',
          metadata: { error: data.error }
        });
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      setPreviewResult({
        title: 'Error',
        content: `Failed to connect to server: ${error.message}`,
        metadata: { error: error.message }
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Quick scrape function
  const handleQuickScrape = async () => {
    if (!quickScrapeUrl.trim()) {
      alert('Please enter a URL to scrape');
      return;
    }

    setLoading(true);

    try {
      const response = await fetchWithAuth(`${apiConfig.baseUrl}/api/v2/scraper/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: quickScrapeUrl.trim(),
          options: {
            mode: quickScrapeMode,
            maxDepth: quickScrapeDepth,
            includeImages: quickScrapeImages,
            includeLinks: quickScrapeLinks
          },
          saveToDatabase: true,
          useCache: true
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`Scraping started successfully! Job ID: ${data.jobId}`);
        fetchJobs(); // Refresh jobs list
      } else {
        alert(`Failed to start scraping: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Scrape error:', error);
      alert(`Failed to start scraping: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Settings save/load functions
  const saveSettings = () => {
    const settings = {
      quickScrapeMode,
      quickScrapeDepth,
      quickScrapeImages,
      quickScrapeLinks,
      conceptDepth,
      conceptSites,
      categoryDepth,
      categoryExtract,
      entityDepth
    };

    localStorage.setItem('scraper-settings', JSON.stringify(settings));
    alert('Settings saved successfully!');
  };

  const loadSettings = () => {
    try {
      const saved = localStorage.getItem('scraper-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        setQuickScrapeMode(settings.quickScrapeMode || 'auto');
        setQuickScrapeDepth(settings.quickScrapeDepth || 1);
        setQuickScrapeImages(settings.quickScrapeImages || false);
        setQuickScrapeLinks(settings.quickScrapeLinks || false);
        setConceptDepth(settings.conceptDepth || 2);
        setConceptSites(settings.conceptSites || []);
        setCategoryDepth(settings.categoryDepth || 3);
        setCategoryExtract(settings.categoryExtract || 'all');
        setEntityDepth(settings.entityDepth || 2);
        alert('Settings loaded successfully!');
      } else {
        alert('No saved settings found.');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      alert('Failed to load settings.');
    }
  };

  const exportSettings = () => {
    const settings = {
      quickScrapeMode,
      quickScrapeDepth,
      quickScrapeImages,
      quickScrapeLinks,
      conceptDepth,
      conceptSites,
      categoryDepth,
      categoryExtract,
      entityDepth,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scraper-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string);
        setQuickScrapeMode(settings.quickScrapeMode || 'auto');
        setQuickScrapeDepth(settings.quickScrapeDepth || 1);
        setQuickScrapeImages(settings.quickScrapeImages || false);
        setQuickScrapeLinks(settings.quickScrapeLinks || false);
        setConceptDepth(settings.conceptDepth || 2);
        setConceptSites(settings.conceptSites || []);
        setCategoryDepth(settings.categoryDepth || 3);
        setCategoryExtract(settings.categoryExtract || 'all');
        setEntityDepth(settings.entityDepth || 2);
        alert('Settings imported successfully!');
      } catch (error) {
        console.error('Failed to import settings:', error);
        alert('Failed to import settings. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Web Scraper</h1>
          <p className="text-muted-foreground">Advanced web scraping and data extraction</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
            <Activity className="w-4 h-4" />
            <span>{scrapeJobs.filter(j => j.status === 'running').length} Active Jobs</span>
          </div>
          <Button
            variant="outline"
            onClick={() => fetchJobs()}
            className="h-10 w-10 p-0"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Unified Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
        <TabsList className="grid w-full grid-cols-6 gap-1">
          <TabsTrigger value="simple" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quick Scrape
          </TabsTrigger>
          <TabsTrigger value="concept" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Concept
          </TabsTrigger>
          <TabsTrigger value="category" className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4" />
            Category
          </TabsTrigger>
          <TabsTrigger value="entity" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Entity
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Results
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* Tab Contents */}
        <div className="mt-6">
          {/* Quick Scrape Tab */}
          <TabsContent value="simple" className="mt-0">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Quick Scrape
                  </CardTitle>
                  <CardDescription>
                    Quickly scrape a single URL for basic content extraction
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* URL Input */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">URL to Scrape</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="https://example.com"
                          value={quickScrapeUrl}
                          onChange={(e) => setQuickScrapeUrl(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <Button
                          onClick={handlePreview}
                          disabled={previewLoading || !quickScrapeUrl.trim()}
                          variant="outline"
                          className="whitespace-nowrap"
                        >
                          {previewLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          Preview
                        </Button>
                      </div>
                    </div>

                    {/* Options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Scraping Mode</label>
                        <select
                          value={quickScrapeMode}
                          onChange={(e) => setQuickScrapeMode(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="auto">Auto (detect best method)</option>
                          <option value="static">Static (HTML only)</option>
                          <option value="dynamic">Dynamic (JavaScript enabled)</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Max Depth</label>
                        <select
                          value={quickScrapeDepth}
                          onChange={(e) => setQuickScrapeDepth(parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={1}>1 page (current only)</option>
                          <option value={2}>2 pages (follow links)</option>
                          <option value={3}>3 pages (deep crawl)</option>
                        </select>
                      </div>
                    </div>

                    {/* Additional Options */}
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quickScrapeImages}
                          onChange={(e) => setQuickScrapeImages(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">Extract Images</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quickScrapeLinks}
                          onChange={(e) => setQuickScrapeLinks(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">Extract Links</span>
                      </label>
                    </div>

                    {/* Preview Results */}
                    {previewResult && (
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <h3 className="font-medium mb-3 flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Preview Results
                        </h3>

                        <div className="space-y-3">
                          <div>
                            <span className="text-sm font-medium text-gray-600">Title:</span>
                            <p className="font-medium">{previewResult.title}</p>
                          </div>

                          <div>
                            <span className="text-sm font-medium text-gray-600">Content Length:</span>
                            <p className="text-sm">{previewResult.contentLength || previewResult.content?.length || 0} characters</p>
                          </div>

                          {previewResult.description && (
                            <div>
                              <span className="text-sm font-medium text-gray-600">Description:</span>
                              <p className="text-sm">{previewResult.description}</p>
                            </div>
                          )}

                          {previewResult.content && (
                            <div>
                              <span className="text-sm font-medium text-gray-600">Content Preview:</span>
                              <div className="mt-1 p-3 bg-white border rounded text-sm max-h-32 overflow-y-auto">
                                {previewResult.content.substring(0, 500)}
                                {previewResult.content.length > 500 && '...'}
                              </div>
                            </div>
                          )}

                          {previewResult.metadata && (
                            <div className="text-xs text-gray-500">
                              <p>Mode: {previewResult.metadata.scrapingMode || 'N/A'}</p>
                              <p>Scraped at: {new Date(previewResult.metadata.scrapedAt).toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <Button
                        onClick={handleQuickScrape}
                        disabled={loading || !quickScrapeUrl.trim()}
                        className="flex-1"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Scraping...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Start Scraping
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuickScrapeUrl('');
                          setPreviewResult(null);
                        }}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Concept Search Tab */}
          <TabsContent value="concept" className="mt-0">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Concept Search
                  </CardTitle>
                  <CardDescription>
                    Search and extract content based on specific concepts across multiple sites
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Concept search form content */}
                    <div className="text-center text-muted-foreground py-8">
                      Concept search functionality will be implemented here
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Category Extract Tab */}
          <TabsContent value="category" className="mt-0">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Grid3x3 className="h-5 w-5" />
                    Category Extract
                  </CardTitle>
                  <CardDescription>
                    Extract structured data from category pages and listings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Category extract form content */}
                    <div className="text-center text-muted-foreground py-8">
                      Category extraction functionality will be implemented here
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Entity Extract Tab */}
          <TabsContent value="entity" className="mt-0">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Entity Extract
                  </CardTitle>
                  <CardDescription>
                    Extract specific entities and structured data using custom templates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Entity extract form content */}
                    <div className="text-center text-muted-foreground py-8">
                      Entity extraction functionality will be implemented here
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="mt-0">
            <div className="space-y-6">
              {/* Active Jobs */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Active Jobs
                  </CardTitle>
                  <CardDescription>
                    Currently running and recent scraping jobs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {scrapeJobs.filter(job => job.status === 'running' || job.status === 'pending').length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No active jobs. Start scraping from the Quick Scrape tab.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {scrapeJobs
                        .filter(job => job.status === 'running' || job.status === 'pending')
                        .map(job => (
                          <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                                {job.status === 'pending' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                                <span className="font-medium">{job.url}</span>
                              </div>
                              <div className="text-sm text-gray-500">
                                {job.type && `Type: ${job.type}`} • {new Date(job.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">{job.progress}%</div>
                              <div className="text-xs text-gray-500">{job.status}</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Scraped Data */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Scraped Data
                  </CardTitle>
                  <CardDescription>
                    Recently scraped content and data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {scrapedData.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No scraped data yet. Start scraping to see results here.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {scrapedData.slice(0, 10).map(data => (
                        <div key={data.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h3 className="font-medium mb-1 line-clamp-1">{data.title}</h3>
                              <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline line-clamp-1">
                                {data.url}
                              </a>
                            </div>
                            <div className="text-xs text-gray-500 ml-4">
                              {new Date(data.scrapedAt).toLocaleString()}
                            </div>
                          </div>

                          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                            {data.content?.substring(0, 200)}{data.content?.length > 200 && '...'}
                          </p>

                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>{data.content?.length || 0} characters</span>
                            {data.type && <span>Type: {data.type}</span>}
                            {data.concept && <span>Concept: {data.concept}</span>}
                            {data.category && <span>Category: {data.category}</span>}
                          </div>
                        </div>
                      ))}

                      {scrapedData.length > 10 && (
                        <div className="text-center">
                          <Button variant="outline" size="sm">
                            Load More Results
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="mt-0">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Advanced Configuration
                  </CardTitle>
                  <CardDescription>
                    Advanced scraping options and custom configurations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Settings save/load */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Export Settings</label>
                        <Button variant="outline" className="w-full" onClick={exportSettings}>
                          <Download className="h-4 w-4 mr-2" />
                          Export Current Configuration
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Import Settings</label>
                        <div className="relative">
                          <input
                            type="file"
                            accept=".json"
                            onChange={importSettings}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <Button variant="outline" className="w-full">
                            <Upload className="h-4 w-4 mr-2" />
                            Import Configuration
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button variant="outline" onClick={saveSettings}>
                        Save to Browser
                      </Button>
                      <Button variant="outline" onClick={loadSettings}>
                        Load from Browser
                      </Button>
                    </div>

                    {/* Cache management */}
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Cache Management</h4>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          Clear Scrape Cache
                        </Button>
                        <Button variant="outline" size="sm">
                          Clear All Data
                        </Button>
                      </div>
                    </div>

                    {/* System status */}
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">System Status</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Total Sites:</span>
                          <p className="font-medium">{sites.length}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Active Jobs:</span>
                          <p className="font-medium">{scrapeJobs.filter(j => j.status === 'running').length}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Total Results:</span>
                          <p className="font-medium">{scrapedData.length}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Templates:</span>
                          <p className="font-medium">{entityTemplates.length}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}