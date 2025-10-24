'use client';

import { useState, useEffect } from 'react';
import {
  Search, Plus, Globe, Settings, Loader2, Play, RefreshCw, Trash2, CheckCircle, AlertCircle,
  Database, BarChart3, Eye, Pause, Activity, Clock, X, Languages, Filter, Site, Web, Zap,
  Target, Layers, Shield, CheckSquare, Square, SlidersHorizontal, RotateCcw, Wrench
} from 'lucide-react';
import config from '@/config/api.config';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton, CardSkeleton, FormSkeleton } from '@/components/ui/skeleton';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import SiteAnalyzerModal from '@/components/site-analyzer-modal';

// Site Card Skeleton Component
function SiteCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
            </div>
            <div className="h-5 bg-muted rounded w-12 ml-2"></div>
          </div>

          {/* Meta Info */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="h-3 bg-muted rounded w-16"></div>
              <div className="h-3 bg-muted rounded w-12"></div>
            </div>
            <div className="h-3 bg-muted rounded w-20"></div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <div className="flex-1 h-8 bg-muted rounded"></div>
            <div className="flex-1 h-8 bg-muted rounded"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

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
  lastScraped?: string;
  totalScraped?: number;
  successRate?: number;
}

interface ScrapeJob {
  id: string;
  url: string;
  siteId?: string;
  siteName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  result?: any;
  error?: string;
  type?: 'concept' | 'category' | 'entity' | 'multi_concept' | 'quick' | 'site';
  concept?: string;
  category?: string;
  entityType?: string;
  scrapedData?: any[];
  createdAt: string;
  completedAt?: string;
  itemsFound?: number;
  duration?: number;
}

interface ScrapedData {
  id: string;
  url: string;
  title: string;
  content: string;
  type: 'concept' | 'category' | 'entity' | 'product' | 'article';
  concept?: string;
  category?: string;
  entities?: any[];
  scrapedAt: string;
  metadata?: any;
}

interface Stats {
  totalSites: number;
  activeJobs: number;
  totalScraped: number;
  successRate: number;
  todayScraped: number;
  avgProcessingTime: number;
}

interface FilterOptions {
  status: string[];
  type: string[];
  dateRange: string;
  hasErrors: boolean;
  progressRange: [number, number];
}

export default function ScrapesPage() {

  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [sites, setSites] = useState<Site[]>([]);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [scrapedData, setScrapedData] = useState<ScrapedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState<ScrapeJob | null>(null);
  const [selectedData, setSelectedData] = useState<ScrapedData | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [showNewSiteDialog, setShowNewSiteDialog] = useState(false);
  const [showSiteAnalyzeDialog, setShowSiteAnalyzeDialog] = useState(false);
  const [showSiteConfigureDialog, setShowSiteConfigureDialog] = useState(false);
  const [showSiteAnalyzerModal, setShowSiteAnalyzerModal] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', url: '', type: 'website', category: '' });

  // Form states for left panel
  const [jobForm, setJobForm] = useState({
    siteId: '',
    type: 'quick',
    concept: '',
    category: '',
    entityType: '',
    sites: [] as string[]
  });

  // Scraper workflow state
  const [scrapingSessions, setScrapingSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [scrapingProgress, setScrapingProgress] = useState<any>(null);
  const [siteForm, setSiteForm] = useState({ name: '', url: '', type: 'website', category: '' });
  const [dataForm, setDataForm] = useState({ search: '', type: 'all', category: '' });

  // Filter states
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    status: [],
    type: [],
    dateRange: 'all',
    hasErrors: false,
    progressRange: [0, 100]
  });
  const [showFilters, setShowFilters] = useState(false);

  // Site configuration state
  const [siteConfig, setSiteConfig] = useState({
    contentSelector: '',
    titleSelector: '',
    descriptionSelector: '',
    linksSelector: '',
    enabled: true,
    rateLimit: 10,
    cleanHtml: true,
    maxDepth: 2,
    maxPages: 50,
    respectRobots: true
  });

  const [stats, setStats] = useState<Stats>({
    totalSites: 0,
    activeJobs: 0,
    totalScraped: 0,
    successRate: 0,
    todayScraped: 0,
    avgProcessingTime: 0
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs();
      updateStats();
    }, 3000);
    return () => clearInterval(interval);
  }, [scrapeJobs, sites]);

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchSites(),
        fetchJobs(),
        fetchScrapedData(),
        fetchScrapingSessions()
      ]);
      updateStats();
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async () => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/sites`);
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
      setTableLoading(true);
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/jobs`);
      if (response.ok) {
        const data = await response.json();
        setScrapeJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setTableLoading(false);
    }
  };

  const fetchScrapedData = async () => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/data`);
      if (response.ok) {
        const data = await response.json();
        setScrapedData(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch scraped data:', error);
    }
  };

  // Fetch scraping sessions
  const fetchScrapingSessions = async () => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/sessions`);
      if (response.ok) {
        const data = await response.json();
        setScrapingSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to fetch scraping sessions:', error);
    }
  };

  // Start scraping workflow
  const handleStartScraping = async (workflowType: string, config: any) => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/start-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: workflowType,
          config: {
            sites: config.sites || [],
            query: config.query || '',
            maxDepth: config.maxDepth || 2,
            maxPages: config.maxPages || 50,
            useAI: config.useAI !== false,
            ...config
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        setActiveSession(result.session);
        toast({
          title: 'Scraping Started',
          description: `Started ${workflowType} scraping workflow`,
        });
        fetchScrapingSessions();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to start scraping',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to start scraping:', error);
      toast({
        title: 'Error',
        description: 'Failed to start scraping',
        variant: 'destructive'
      });
    }
  };

  // Stop scraping workflow
  const handleStopScraping = async (sessionId: string) => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        toast({
          title: 'Scraping Stopped',
          description: 'Scraping workflow stopped successfully',
        });
        setActiveSession(null);
        fetchScrapingSessions();
      }
    } catch (error) {
      console.error('Failed to stop scraping:', error);
    }
  };

  const updateStats = () => {
    const today = new Date().toDateString();
    const todayData = scrapedData.filter(d => new Date(d.scrapedAt).toDateString() === today);
    const completedJobs = scrapeJobs.filter(j => j.status === 'completed');
    const totalJobs = scrapeJobs.filter(j => j.status !== 'pending');

    setStats({
      totalSites: sites.length,
      activeJobs: scrapeJobs.filter(j => j.status === 'running' || j.status === 'pending').length,
      totalScraped: scrapedData.length,
      successRate: totalJobs.length > 0 ? Math.round((completedJobs.length / totalJobs.length) * 100) : 0,
      todayScraped: todayData.length,
      avgProcessingTime: completedJobs.length > 0
        ? Math.round(completedJobs.reduce((acc, job) => acc + (job.duration || 0), 0) / completedJobs.length)
        : 0
    });
  };

  const handleCreateSite = async () => {
    if (!newSite.name || !newSite.url) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Start skeleton loading
      setSitesLoading(true);

      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/sites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newSite.name,
          base_url: newSite.url,
          type: newSite.type,
          category: newSite.category
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Site created successfully',
        });
        setShowNewSiteDialog(false);
        setNewSite({ name: '', url: '', type: 'website', category: '' });

        // Add temporary skeleton card for visual feedback
        const tempSite: Site = {
          id: `temp-${Date.now()}`,
          name: newSite.name,
          base_url: newSite.url,
          type: newSite.type,
          category: newSite.category,
          status: 'analyzing',
          createdAt: new Date().toISOString(),
          totalScraped: 0,
          successRate: 0
        };
        setSites(prev => [...prev, tempSite]);

        // Fetch real data after a delay
        setTimeout(() => {
          fetchSites().finally(() => setSitesLoading(false));
        }, 2000);
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to create site',
          variant: 'destructive'
        });
        setSitesLoading(false);
      }
    } catch (error) {
      console.error('Failed to create site:', error);
      toast({
        title: 'Error',
        description: 'Failed to create site',
        variant: 'destructive'
      });
      setSitesLoading(false);
    }
  };

  const handleCreateJob = async () => {
    if (jobForm.type === 'quick' && !jobForm.siteId) {
      toast({
        title: 'Error',
        description: 'Please select a site',
        variant: 'destructive'
      });
      return;
    }

    if ((jobForm.type === 'concept' || jobForm.type === 'category') && !jobForm.concept && !jobForm.category) {
      toast({
        title: 'Error',
        description: 'Please enter concept or category',
        variant: 'destructive'
      });
      return;
    }

    try {
      let workflowType = '';
      let config: any = {};

      switch (jobForm.type) {
        case 'concept':
          workflowType = 'concept_search';
          config = {
            concept: jobForm.concept,
            sites: jobForm.siteId ? [jobForm.siteId] : jobForm.sites,
            maxPagesPerSite: 30,
            maxDepth: 2,
            useAI: true
          };
          break;
        case 'category':
          workflowType = 'category_scraping';
          config = {
            sites: jobForm.siteId ? [jobForm.siteId] : jobForm.sites,
            category: jobForm.category,
            maxPagesPerSite: 20,
            maxDepth: 1,
            useAI: false
          };
          break;
        default:
          workflowType = 'site_scraping';
          const selectedSite = sites.find(s => s.id === jobForm.siteId);
          config = {
            sites: [jobForm.siteId],
            siteId: jobForm.siteId,
            siteName: selectedSite?.name,
            maxDepth: 2,
            maxPages: 50,
            useAI: true
          };
      }

      await handleStartScraping(workflowType, config);

      setJobForm({ siteId: '', type: 'quick', concept: '', category: '', entityType: '', sites: [] });

    } catch (error) {
      console.error('Failed to create job:', error);
      toast({
        title: 'Error',
        description: 'Failed to create job',
        variant: 'destructive'
      });
    }
  };

  const handleAnalyzeSite = async (siteId: string) => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/sites/${siteId}/analyze`, {
        method: 'POST'
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Site analysis started',
        });
        fetchSites();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to analyze site',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to analyze site:', error);
      toast({
        title: 'Error',
        description: 'Failed to analyze site',
        variant: 'destructive'
      });
    }
  };

  const handleConfigureSite = async (siteId: string) => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/sites/${siteId}/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(siteConfig)
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Site configuration saved',
        });
        setShowSiteConfigureDialog(false);
        fetchSites();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to configure site',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to configure site:', error);
      toast({
        title: 'Error',
        description: 'Failed to configure site',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/jobs/${jobId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Job deleted successfully',
        });
        fetchJobs();
      }
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };

  const handlePauseJob = async (jobId: string) => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId })
      });

      if (response.ok) {
        fetchJobs();
      }
    } catch (error) {
      console.error('Failed to pause job:', error);
    }
  };

  const handleResumeJob = async (jobId: string) => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId })
      });

      if (response.ok) {
        fetchJobs();
      }
    } catch (error) {
      console.error('Failed to resume job:', error);
    }
  };

  // Apply filters to jobs
  const filteredJobs = scrapeJobs.filter(job => {
    const matchesSearch = job.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.siteName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterOptions.status.length === 0 || filterOptions.status.includes(job.status);
    const matchesType = filterOptions.type.length === 0 || filterOptions.type.includes(job.type || 'quick');
    const matchesProgress = job.progress >= filterOptions.progressRange[0] && job.progress <= filterOptions.progressRange[1];
    const matchesErrors = !filterOptions.hasErrors || !!job.error;

    return matchesSearch && matchesStatus && matchesType && matchesProgress && matchesErrors;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200"><X className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'paused':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200"><Pause className="w-3 h-3 mr-1" />Paused</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  if (loading) {
    return (
      <div className="w-[90%] mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Scraping Management</h1>
        </div>
        <FormSkeleton />
      </div>
    );
  }

  return (
    <div className="w-[90%] mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Scraping Management</h1>
          <p className="text-muted-foreground">Manage web scraping operations and data extraction</p>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-14">
          <TabsTrigger value="overview" className="h-12">Overview</TabsTrigger>
          <TabsTrigger value="jobs" className="h-12">Jobs</TabsTrigger>
          <TabsTrigger value="data" className="h-12">Scraped Data</TabsTrigger>
          <TabsTrigger value="sites" className="h-12">Sites</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSites}</div>
                <p className="text-xs text-muted-foreground">
                  {sites.filter(s => s.status === 'configured').length} configured
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeJobs}</div>
                <p className="text-xs text-muted-foreground">
                  {scrapeJobs.filter(j => j.status === 'running').length} running
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Scraped Items</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalScraped}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.todayScraped} today
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.successRate}%</div>
                <p className="text-xs text-muted-foreground">
                  Avg: {stats.avgProcessingTime}s
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Jobs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Jobs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {scrapeJobs.slice(0, 5).map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{job.siteName || job.url}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(job.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(job.status)}
                        {job.progress > 0 && job.progress < 100 && (
                          <span className="text-sm text-muted-foreground">
                            {job.progress}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {scrapeJobs.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      No jobs yet. Start scraping to see activity.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Sites */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Top Sites
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sites.slice(0, 5).map(site => (
                    <div key={site.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{site.name}</p>
                        <p className="text-sm text-muted-foreground">{site.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{site.totalScraped || 0}</p>
                        <p className="text-xs text-muted-foreground">items</p>
                      </div>
                    </div>
                  ))}
                  {sites.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      No sites configured yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-6">
          {/* Active Scraping Workflow */}
          {activeSession && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Activity className="h-5 w-5" />
                  Active Scraping Workflow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-blue-900">
                        {activeSession.type || 'General'} Scraping
                      </p>
                      <p className="text-sm text-blue-600">
                        Started: {new Date(activeSession.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleStopScraping(activeSession.id)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Stop
                    </Button>
                  </div>

                  {scrapingProgress && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-700">{scrapingProgress.currentUrl}</span>
                        <span className="text-blue-700">{scrapingProgress.progress}%</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${scrapingProgress.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-blue-600">
                        <span>URL {scrapingProgress.completedUrls} / {scrapingProgress.totalUrls}</span>
                        <span>{scrapingProgress.foundUrls} URLs found</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Panel - Forms & Progress */}
            <div className="lg:col-span-4 space-y-6">
              {/* Create New Job Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Create New Job</CardTitle>
                  <CardDescription>Start a new scraping job</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="job-site">Site</Label>
                    <Select value={jobForm.siteId} onValueChange={(value) => setJobForm({ ...jobForm, siteId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map(site => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="job-type">Type</Label>
                    <Select value={jobForm.type} onValueChange={(value) => setJobForm({ ...jobForm, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">Quick Scrape</SelectItem>
                        <SelectItem value="concept">Concept Search</SelectItem>
                        <SelectItem value="category">Category Search</SelectItem>
                        <SelectItem value="entity">Entity Extraction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {jobForm.type === 'concept' && (
                    <div>
                      <Label htmlFor="job-concept">Concept</Label>
                      <Input
                        id="job-concept"
                        placeholder="Enter concept to search for"
                        value={jobForm.concept}
                        onChange={(e) => setJobForm({ ...jobForm, concept: e.target.value })}
                      />
                    </div>
                  )}
                  {jobForm.type === 'category' && (
                    <div>
                      <Label htmlFor="job-category">Category</Label>
                      <Input
                        id="job-category"
                        placeholder="Enter category to scrape"
                        value={jobForm.category}
                        onChange={(e) => setJobForm({ ...jobForm, category: e.target.value })}
                      />
                    </div>
                  )}
                  <Button onClick={handleCreateJob} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Start Job
                  </Button>
                </CardContent>
              </Card>

              {/* Scraping Workflows */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Scraping Workflows</CardTitle>
                  <CardDescription>Start comprehensive scraping workflows</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Quick Site Scraping */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Quick Site Scraping</Label>
                    <p className="text-xs text-muted-foreground">Scrape selected site with AI analysis</p>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={!jobForm.siteId || activeSession}
                      onClick={() => handleCreateJob()}
                    >
                      <Target className="h-4 w-4 mr-2" />
                      Start Site Scraping
                    </Button>
                  </div>

                  {/* Multi-Site Concept Search */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Multi-Site Concept Search</Label>
                    <p className="text-xs text-muted-foreground">Search concept across all configured sites</p>
                    <div className="space-y-2">
                      <Input
                        placeholder="Enter concept to search..."
                        value={jobForm.concept}
                        onChange={(e) => setJobForm({ ...jobForm, concept: e.target.value })}
                        disabled={activeSession}
                      />
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={!jobForm.concept || activeSession}
                        onClick={() => handleCreateJob()}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Search Across Sites
                      </Button>
                    </div>
                  </div>

                  {/* Category Scraping */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Category Scraping</Label>
                    <p className="text-xs text-muted-foreground">Scrape specific categories from sites</p>
                    <div className="space-y-2">
                      <Input
                        placeholder="Enter category (e.g., products, articles)"
                        value={jobForm.category}
                        onChange={(e) => setJobForm({ ...jobForm, category: e.target.value })}
                        disabled={activeSession}
                      />
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={!jobForm.category || activeSession}
                        onClick={() => handleCreateJob()}
                      >
                        <Layers className="h-4 w-4 mr-2" />
                        Scrape Category
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Jobs Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Active Jobs</CardTitle>
                  <CardDescription>Real-time progress</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {scrapeJobs.filter(job => job.status === 'running' || job.status === 'pending').map(job => (
                      <div key={job.id} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium truncate">{job.siteName || job.url}</span>
                          {getStatusBadge(job.status)}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{job.progress}%</span>
                          <span>{job.itemsFound || 0} items</span>
                        </div>
                      </div>
                    ))}
                    {scrapeJobs.filter(job => job.status === 'running' || job.status === 'pending').length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No active jobs
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Filter Jobs Component */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filter Jobs
                  </CardTitle>
                  <CardDescription>Filter by status, type, and more</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="filter-search">Search</Label>
                    <Input
                      id="filter-search"
                      placeholder="Search jobs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>Status</Label>
                    <div className="space-y-2 mt-2">
                      {['pending', 'running', 'completed', 'failed', 'paused'].map(status => (
                        <div key={status} className="flex items-center space-x-2">
                          <Checkbox
                            id={`status-${status}`}
                            checked={filterOptions.status.includes(status)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFilterOptions(prev => ({
                                  ...prev,
                                  status: [...prev.status, status]
                                }));
                              } else {
                                setFilterOptions(prev => ({
                                  ...prev,
                                  status: prev.status.filter(s => s !== status)
                                }));
                              }
                            }}
                          />
                          <Label htmlFor={`status-${status}`} className="text-sm capitalize">
                            {status}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Progress Range</Label>
                    <div className="mt-2">
                      <Slider
                        value={filterOptions.progressRange}
                        onValueChange={(value) => setFilterOptions(prev => ({
                          ...prev,
                          progressRange: value as [number, number]
                        }))}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{filterOptions.progressRange[0]}%</span>
                        <span>{filterOptions.progressRange[1]}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="filter-errors"
                      checked={filterOptions.hasErrors}
                      onCheckedChange={(checked) =>
                        setFilterOptions(prev => ({ ...prev, hasErrors: checked as boolean }))
                      }
                    />
                    <Label htmlFor="filter-errors" className="text-sm">
                      Show only jobs with errors
                    </Label>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setFilterOptions({
                      status: [],
                      type: [],
                      dateRange: 'all',
                      hasErrors: false,
                      progressRange: [0, 100]
                    })}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Filters
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Jobs Table */}
            <div className="lg:col-span-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Jobs ({filteredJobs.length})</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filters
                    {filterOptions.status.length > 0 || filterOptions.hasErrors && (
                      <Badge className="ml-2" variant="secondary">
                        {filterOptions.status.length + (filterOptions.hasErrors ? 1 : 0)}
                      </Badge>
                    )}
                  </Button>
                </div>

                {tableLoading ? (
                  <Card>
                    <CardContent className="p-4">
                      <TableSkeleton rows={5} columns={6} />
                    </CardContent>
                  </Card>
                ) : filteredJobs.length === 0 ? (
                  <Card className="text-center py-12">
                    <CardContent>
                      <p className="text-muted-foreground">No jobs found</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredJobs.map(job => (
                      <Card key={job.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-medium text-gray-900 truncate">{job.siteName || job.url}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {job.type || 'quick'}
                                </Badge>
                                {getStatusBadge(job.status)}
                                {job.error && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Error
                                  </Badge>
                                )}
                              </div>

                              {job.status === 'running' && job.progress > 0 && (
                                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                                  <div
                                    className="bg-slate-600 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${job.progress}%` }}
                                  />
                                </div>
                              )}

                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span>{job.itemsFound || 0} items</span>
                                <span>{job.duration ? formatDuration(job.duration) : '-'}</span>
                                <span>{formatDate(job.createdAt)}</span>
                              </div>
                            </div>

                            <div className="flex gap-1 flex-shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedJob(job)}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              {job.status === 'running' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handlePauseJob(job.id)}
                                >
                                  <Pause className="h-3 w-3" />
                                </Button>
                              )}
                              {job.status === 'paused' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResumeJob(job.id)}
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              )}
                              <ConfirmTooltip
                                onConfirm={() => handleDeleteJob(job.id)}
                                message="Delete this job?"
                                side="top"
                              >
                                <Button
                                  size="sm"
                                  variant="outline"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </ConfirmTooltip>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Scraped Data Tab */}
        <TabsContent value="data" className="space-y-6">
          {/* Search Data Section - Moved to top */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Data</CardTitle>
              <CardDescription>Find scraped content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="data-search">Search</Label>
                  <Input
                    id="data-search"
                    placeholder="Search in content..."
                    value={dataForm.search}
                    onChange={(e) => setDataForm({ ...dataForm, search: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="data-type">Type</Label>
                  <Select value={dataForm.type} onValueChange={(value) => setDataForm({ ...dataForm, type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="concept">Concept</SelectItem>
                      <SelectItem value="category">Category</SelectItem>
                      <SelectItem value="entity">Entity</SelectItem>
                      <SelectItem value="product">Product</SelectItem>
                      <SelectItem value="article">Article</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="data-category">Category</Label>
                  <Input
                    id="data-category"
                    placeholder="Filter by category"
                    value={dataForm.category}
                    onChange={(e) => setDataForm({ ...dataForm, category: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full">
                    <Search className="h-4 w-4 mr-2" />
                    Search Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Panel - Data Stats & Export Options */}
            <div className="lg:col-span-4 space-y-6">
              {/* Data Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Data Stats</CardTitle>
                  <CardDescription>Scraped data overview</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm">Total Items</span>
                      <span className="font-medium">{scrapedData.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Today</span>
                      <span className="font-medium">{stats.todayScraped}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Avg Content Length</span>
                      <span className="font-medium">
                        {scrapedData.length > 0
                          ? Math.round(scrapedData.reduce((acc, d) => acc + (d.content?.length || 0), 0) / scrapedData.length)
                          : 0} chars
                        </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Export & Translation Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Export & Tools</CardTitle>
                  <CardDescription>Process scraped data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full">
                    Export as CSV
                  </Button>
                  <Button variant="outline" className="w-full">
                    Export as JSON
                  </Button>
                  <Button variant="outline" className="w-full">
                    Export to Database
                  </Button>
                  <div className="border-t pt-3">
                    <Button variant="default" className="w-full gap-2">
                      <Languages className="h-4 w-4" />
                      Translate Selected Data
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Translate scraped content to multiple languages
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Data Table */}
            <div className="lg:col-span-8">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Scraped Data ({scrapedData.length})</h3>
                {scrapedData.length === 0 ? (
                  <Card className="text-center py-12">
                    <CardContent>
                      <p className="text-muted-foreground">No scraped data yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {scrapedData.slice(0, 20).map(data => (
                      <Card key={data.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div>
                              <h4 className="font-medium text-gray-900 line-clamp-2">{data.title}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {data.type}
                                </Badge>
                                {data.category && (
                                  <span className="text-xs text-gray-500">{data.category}</span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {data.content?.length || 0} chars
                                </span>
                              </div>
                            </div>

                            <p className="text-sm text-blue-600 hover:text-blue-800 truncate">
                              <a href={data.url} target="_blank" rel="noopener noreferrer">
                                {data.url}
                              </a>
                            </p>

                            <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-500">
                                {formatDate(data.scrapedAt)}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedData(data)}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Sites Tab */}
        <TabsContent value="sites" className="space-y-6">
          {/* Sites Header with Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Sites ({sites.length})</h3>
              <p className="text-sm text-muted-foreground">Manage and configure scraping sites</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sites..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button onClick={() => setShowSiteAnalyzerModal(true)}>
                <Zap className="h-4 w-4 mr-2" />
                Intelligent Add Site
              </Button>
            </div>
          </div>

          {/* Sites Filters */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Filter:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="configured">Configured</SelectItem>
                <SelectItem value="not_configured">Not Configured</SelectItem>
                <SelectItem value="analyzing">Analyzing</SelectItem>
                <SelectItem value="analyzed">Analyzed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="blog">Blog</SelectItem>
                <SelectItem value="news">News Site</SelectItem>
                <SelectItem value="forum">Forum</SelectItem>
                <SelectItem value="directory">Directory</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-24 h-7 text-xs"
            />
          </div>

          {/* Sites Grid - Minimal 4-Column Layout */}
          {sites.length === 0 ? (
            <Card className="text-center py-16">
              <CardContent>
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <Globe className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">No sites configured yet</h3>
                    <p className="text-muted-foreground mt-1">Add your first site to start scraping</p>
                  </div>
                  <Button onClick={() => setShowSiteAnalyzerModal(true)}>
                    <Zap className="h-4 w-4 mr-2" />
                    Add Your First Site
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sites
                .filter(site => {
                  const matchesSearch = site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                     site.category.toLowerCase().includes(searchTerm.toLowerCase());
                  const matchesStatus = statusFilter === 'all' || site.status === statusFilter;
                  const matchesType = typeFilter === 'all' || site.type === typeFilter;
                  const matchesCategory = !categoryFilter || site.category.toLowerCase().includes(categoryFilter.toLowerCase());
                  return matchesSearch && matchesStatus && matchesType && matchesCategory;
                })
                .map(site => {
                  // Show skeleton for analyzing sites
                  if (site.status === 'analyzing' || site.id.toString().startsWith('temp-')) {
                    return <SiteCardSkeleton key={site.id} />;
                  }

                  return (
                <Card key={site.id} className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                            {site.name}
                          </h4>
                        </div>
                        <Badge
                          variant={site.status === 'configured' ? 'default' : 'secondary'}
                          className="ml-2 flex-shrink-0 text-xs"
                        >
                          {site.status === 'configured' ? 'Ready' : 'Setup'}
                        </Badge>
                      </div>

                      {/* Meta Info */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="capitalize">{site.type}</span>
                          <span>{site.totalScraped || 0} items</span>
                        </div>
                        {site.lastScraped && (
                          <div className="text-xs text-muted-foreground">
                            Last: {formatDate(site.lastScraped)}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs p-2 flex items-center justify-center"
                          onClick={() => {
                            setSelectedSite(site);
                            setShowSiteConfigureDialog(true);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs p-2 flex items-center justify-center"
                          onClick={() => {
                            setSelectedSite(site);
                            setShowSiteAnalyzeDialog(true);
                            handleAnalyzeSite(site.id);
                          }}
                        >
                          <Activity className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                  );
                })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Site Details Dialog */}
      <Dialog open={!!selectedSite} onOpenChange={() => setSelectedSite(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Site Details</DialogTitle>
          </DialogHeader>
          {selectedSite && (
            <div className="space-y-4">
              <div>
                <Label>Site Name</Label>
                <p className="text-sm text-muted-foreground">{selectedSite.name}</p>
              </div>
              <div>
                <Label>Base URL</Label>
                <p className="text-sm text-muted-foreground">{selectedSite.base_url}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <p className="text-sm">{selectedSite.type}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge variant={selectedSite.status === 'configured' ? 'default' : 'secondary'}>
                    {selectedSite.status || 'Not configured'}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total Scraped</Label>
                  <p className="text-sm">{selectedSite.totalScraped || 0} items</p>
                </div>
                <div>
                  <Label>Success Rate</Label>
                  <p className="text-sm">{selectedSite.successRate || 0}%</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Site Analyze Dialog */}
      <Dialog open={showSiteAnalyzeDialog} onOpenChange={setShowSiteAnalyzeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Analyze Site Structure</DialogTitle>
            <DialogDescription>
              Analyzing site structure to identify optimal content selectors...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Analyzing site structure...</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Detecting content areas</span>
                <span className="text-muted-foreground">In progress...</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Identifying navigation patterns</span>
                <span className="text-muted-foreground">Pending...</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Analyzing page structure</span>
                <span className="text-muted-foreground">Pending...</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Site Configure Dialog */}
      <Dialog open={showSiteConfigureDialog} onOpenChange={setShowSiteConfigureDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Site</DialogTitle>
            <DialogDescription>
              Set up content extraction and scraping behavior for {selectedSite?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedSite && (
            <div className="space-y-6">
              {/* Content Selectors */}
              <div>
                <h4 className="text-sm font-medium mb-3">Content Selectors</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="config-content">Content Selector</Label>
                    <Input
                      id="config-content"
                      placeholder="main, article, .content"
                      value={siteConfig.contentSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, contentSelector: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="config-title">Title Selector</Label>
                    <Input
                      id="config-title"
                      placeholder="h1, .title"
                      value={siteConfig.titleSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, titleSelector: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="config-description">Description Selector</Label>
                    <Input
                      id="config-description"
                      placeholder=".description, .summary"
                      value={siteConfig.descriptionSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, descriptionSelector: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="config-links">Links Selector</Label>
                    <Input
                      id="config-links"
                      placeholder="a[href]"
                      value={siteConfig.linksSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, linksSelector: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Scraping Behavior */}
              <div>
                <h4 className="text-sm font-medium mb-3">Scraping Behavior</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="config-max-depth">Max Depth</Label>
                    <Select value={siteConfig.maxDepth.toString()} onValueChange={(value) => setSiteConfig(prev => ({ ...prev, maxDepth: parseInt(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 level</SelectItem>
                        <SelectItem value="2">2 levels</SelectItem>
                        <SelectItem value="3">3 levels</SelectItem>
                        <SelectItem value="5">5 levels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="config-max-pages">Max Pages</Label>
                    <Select value={siteConfig.maxPages.toString()} onValueChange={(value) => setSiteConfig(prev => ({ ...prev, maxPages: parseInt(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 pages</SelectItem>
                        <SelectItem value="50">50 pages</SelectItem>
                        <SelectItem value="100">100 pages</SelectItem>
                        <SelectItem value="500">500 pages</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="config-rate-limit">Rate Limit (requests/second)</Label>
                    <Select value={siteConfig.rateLimit.toString()} onValueChange={(value) => setSiteConfig(prev => ({ ...prev, rateLimit: parseInt(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1/sec</SelectItem>
                        <SelectItem value="5">5/sec</SelectItem>
                        <SelectItem value="10">10/sec</SelectItem>
                        <SelectItem value="20">20/sec</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div>
                <h4 className="text-sm font-medium mb-3">Options</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="config-enabled">Enable Scraping</Label>
                    <Switch
                      id="config-enabled"
                      checked={siteConfig.enabled}
                      onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, enabled: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="config-clean-html">Clean HTML</Label>
                    <Switch
                      id="config-clean-html"
                      checked={siteConfig.cleanHtml}
                      onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, cleanHtml: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="config-respect-robots">Respect robots.txt</Label>
                    <Switch
                      id="config-respect-robots"
                      checked={siteConfig.respectRobots}
                      onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, respectRobots: checked }))}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // Auto-detect selectors
                    setSiteConfig(prev => ({
                      ...prev,
                      contentSelector: 'main, article, .content',
                      titleSelector: 'h1, .title',
                      descriptionSelector: '.description, .summary',
                      linksSelector: 'a[href]'
                    }));
                  }}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Auto Detect
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleConfigureSite(selectedSite.id)}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Save Configuration
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Job Details Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div>
                <Label>URL</Label>
                <p className="text-sm text-muted-foreground break-all">{selectedJob.url}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedJob.status)}</div>
                </div>
                <div>
                  <Label>Type</Label>
                  <p className="text-sm">{selectedJob.type || 'quick'}</p>
                </div>
              </div>
              {selectedJob.concept && (
                <div>
                  <Label>Concept</Label>
                  <p className="text-sm">{selectedJob.concept}</p>
                </div>
              )}
              {selectedJob.category && (
                <div>
                  <Label>Category</Label>
                  <p className="text-sm">{selectedJob.category}</p>
                </div>
              )}
              {selectedJob.error && (
                <div>
                  <Label>Error</Label>
                  <Alert className="mt-1">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{selectedJob.error}</AlertDescription>
                  </Alert>
                </div>
              )}
              {selectedJob.result && (
                <div>
                  <Label>Result Preview</Label>
                  <pre className="mt-1 p-3 bg-gray-100 rounded text-sm overflow-auto max-h-40">
                    {JSON.stringify(selectedJob.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Data Details Dialog */}
      <Dialog open={!!selectedData} onOpenChange={() => setSelectedData(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Scraped Data</DialogTitle>
          </DialogHeader>
          {selectedData && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <p className="font-medium">{selectedData.title}</p>
              </div>
              <div>
                <Label>URL</Label>
                <a href={selectedData.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                  {selectedData.url}
                </a>
              </div>
              <div>
                <Label>Content</Label>
                <div className="mt-1 p-3 bg-gray-100 rounded max-h-60 overflow-auto">
                  <pre className="whitespace-pre-wrap text-sm">{selectedData.content}</pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Site Dialog */}
      <Dialog open={showNewSiteDialog} onOpenChange={setShowNewSiteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Site</DialogTitle>
            <DialogDescription>
              Add a new website to configure for scraping
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-site-name">Site Name</Label>
              <Input
                id="new-site-name"
                placeholder="My Website"
                value={newSite.name}
                onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-site-url">URL</Label>
              <Input
                id="new-site-url"
                placeholder="https://example.com"
                value={newSite.url}
                onChange={(e) => setNewSite({ ...newSite, url: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-site-type">Type</Label>
              <Select value={newSite.type} onValueChange={(value) => setNewSite({ ...newSite, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="ecommerce">E-commerce</SelectItem>
                  <SelectItem value="blog">Blog</SelectItem>
                  <SelectItem value="news">News Site</SelectItem>
                  <SelectItem value="forum">Forum</SelectItem>
                  <SelectItem value="directory">Directory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-site-category">Category</Label>
              <Input
                id="new-site-category"
                placeholder="General"
                value={newSite.category}
                onChange={(e) => setNewSite({ ...newSite, category: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowNewSiteDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleCreateSite} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                Add Site
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Intelligent Site Analyzer Modal */}
      <SiteAnalyzerModal
        open={showSiteAnalyzerModal}
        onClose={() => setShowSiteAnalyzerModal(false)}
        onSiteCreated={(site) => {
          fetchSites();
          toast({
            title: 'Success',
            description: 'Site created with intelligent analysis',
          });
        }}
      />
    </div>
  );
}