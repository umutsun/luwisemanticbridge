'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, Plus, Globe, Settings, Loader2, Play, RefreshCw, Trash2, CheckCircle, AlertCircle,
  Database, BarChart3, Eye, Pause, Activity, Clock, X, Languages, Filter, Zap,
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
  structure?: Record<string, unknown>;
  scrapingConfig?: Record<string, unknown>;
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
  result?: Record<string, unknown>;
  error?: string;
  type?: 'concept' | 'category' | 'entity' | 'multi_concept' | 'quick' | 'site';
  concept?: string;
  category?: string;
  entityType?: string;
  scrapedData?: Record<string, unknown>[];
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
  entities?: Record<string, unknown>[];
  scrapedAt: string;
  metadata?: Record<string, unknown>;
}

interface ScrapingSession {
  id: string;
  type: string;
  createdAt: string;
  status: string;
  config: Record<string, unknown>;
}

interface ScrapingProgress {
  currentUrl: string;
  progress: number;
  completedUrls: number;
  totalUrls: number;
  foundUrls: number;
}

interface WorkflowConfig {
  sites?: string[];
  query?: string;
  maxDepth?: number;
  maxPages?: number;
  maxPagesPerSite?: number;
  useAI?: boolean;
  concept?: string;
  category?: string;
  siteId?: string;
  siteName?: string;
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
  const { t } = useTranslation();
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
  const [scrapingSessions, setScrapingSessions] = useState<ScrapingSession[]>([]);
  const [activeSession, setActiveSession] = useState<ScrapingSession | null>(null);
  const [scrapingProgress, setScrapingProgress] = useState<ScrapingProgress | null>(null);
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
  const handleStartScraping = async (workflowType: string, config: WorkflowConfig) => {
    try {
      const response = await fetchWithAuth(`${(config as { api: { baseUrl: string } }).api.baseUrl}/api/v2/scraper/start-workflow`, {
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
          title: t('scrapes.notifications.scrapingStarted'),
          description: t('scrapes.notifications.startedWorkflow', { workflowType }),
        });
        fetchScrapingSessions();
      } else {
        const error = await response.json();
        toast({
          title: t('common.error'),
          description: error.error || t('scrapes.notifications.failedToStartScraping'),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to start scraping:', error);
      toast({
        title: t('common.error'),
        description: t('scrapes.notifications.failedToStartScraping'),
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
          title: t('scrapes.notifications.scrapingStopped'),
          description: t('scrapes.notifications.scrapingStoppedSuccessfully'),
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
        title: t('common.error'),
        description: t('common.requiredFields'),
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
          title: t('common.success'),
          description: t('scrapes.notifications.siteCreatedSuccessfully'),
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
          title: t('common.error'),
          description: error.error || t('scrapes.notifications.failedToCreateSite'),
          variant: 'destructive'
        });
        setSitesLoading(false);
      }
    } catch (error) {
      console.error('Failed to create site:', error);
      toast({
        title: t('common.error'),
        description: t('scrapes.notifications.failedToCreateSite'),
        variant: 'destructive'
      });
      setSitesLoading(false);
    }
  };

  const handleCreateJob = async () => {
    if (jobForm.type === 'quick' && !jobForm.siteId) {
      toast({
        title: t('common.error'),
        description: t('scrapes.notifications.pleaseSelectSite'),
        variant: 'destructive'
      });
      return;
    }

    if ((jobForm.type === 'concept' || jobForm.type === 'category') && !jobForm.concept && !jobForm.category) {
      toast({
        title: t('common.error'),
        description: t('scrapes.notifications.pleaseEnterConceptOrCategory'),
        variant: 'destructive'
      });
      return;
    }

    try {
      let workflowType = '';
      let config: WorkflowConfig = {};

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
        title: t('common.error'),
        description: t('scrapes.notifications.failedToCreateJob'),
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
          title: t('common.success'),
          description: t('scrapes.notifications.siteAnalysisStarted'),
        });
        fetchSites();
      } else {
        const error = await response.json();
        toast({
          title: t('common.error'),
          description: error.error || t('scrapes.notifications.failedToAnalyzeSite'),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to analyze site:', error);
      toast({
        title: t('common.error'),
        description: t('scrapes.notifications.failedToAnalyzeSite'),
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
          title: t('common.success'),
          description: t('scrapes.notifications.siteConfigurationSaved'),
        });
        setShowSiteConfigureDialog(false);
        fetchSites();
      } else {
        const error = await response.json();
        toast({
          title: t('common.error'),
          description: error.error || t('scrapes.notifications.failedToConfigureSite'),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to configure site:', error);
      toast({
        title: t('common.error'),
        description: t('scrapes.notifications.failedToConfigureSite'),
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
          title: t('common.success'),
          description: t('scrapes.notifications.jobDeletedSuccessfully'),
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
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('scrapes.status.running')}</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle className="w-3 h-3 mr-1" />{t('scrapes.status.completed')}</Badge>;
      case 'failed':
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200"><X className="w-3 h-3 mr-1" />{t('scrapes.status.failed')}</Badge>;
      case 'paused':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200"><Pause className="w-3 h-3 mr-1" />{t('scrapes.status.paused')}</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{t('scrapes.status.pending')}</Badge>;
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
          <h1 className="text-xl font-semibold">{t('scrapes.title')}</h1>
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
          <h1 className="text-xl font-semibold">{t('scrapes.title')}</h1>
          <p className="text-muted-foreground">{t('scrapes.description')}</p>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-14">
          <TabsTrigger value="overview" className="h-12">{t('scrapes.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="jobs" className="h-12">{t('scrapes.tabs.jobs')}</TabsTrigger>
          <TabsTrigger value="data" className="h-12">{t('scrapes.tabs.scrapedData')}</TabsTrigger>
          <TabsTrigger value="sites" className="h-12">{t('scrapes.tabs.sites')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('scrapes.stats.totalSites')}</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSites}</div>
                <p className="text-xs text-muted-foreground">
                  {sites.filter(s => s.status === 'configured').length} {t('scrapes.stats.configured')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('scrapes.stats.activeJobs')}</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeJobs}</div>
                <p className="text-xs text-muted-foreground">
                  {scrapeJobs.filter(j => j.status === 'running').length} {t('scrapes.stats.running')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('scrapes.stats.scrapedItems')}</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalScraped}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.todayScraped} {t('scrapes.stats.today')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('scrapes.stats.successRate')}</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.successRate}%</div>
                <p className="text-xs text-muted-foreground">
                  {t('scrapes.stats.avg')}: {stats.avgProcessingTime}s
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
                  {t('scrapes.recentJobs.title')}
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
                      {t('scrapes.recentJobs.noJobs')}
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
                  {t('scrapes.topSites.title')}
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
                        <p className="text-xs text-muted-foreground">{t('scrapes.topSites.items')}</p>
                      </div>
                    </div>
                  ))}
                  {sites.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      {t('scrapes.topSites.noSites')}
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
                  {t('scrapes.activeWorkflow.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-blue-900">
                        {t('scrapes.activeWorkflow.generalScraping', { type: activeSession.type || t('scrapes.activeWorkflow.general') })}
                      </p>
                      <p className="text-sm text-blue-600">
                        {t('scrapes.activeWorkflow.started')}: {new Date(activeSession.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleStopScraping(activeSession.id)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      {t('common.stop')}
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
                        <span>{t('scrapes.activeWorkflow.url')} {scrapingProgress.completedUrls} / {scrapingProgress.totalUrls}</span>
                        <span>{scrapingProgress.foundUrls} {t('scrapes.activeWorkflow.urlsFound')}</span>
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
                  <CardTitle className="text-lg">{t('scrapes.createJob.title')}</CardTitle>
                  <CardDescription>{t('scrapes.createJob.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="job-site">{t('scrapes.createJob.site')}</Label>
                    <Select value={jobForm.siteId} onValueChange={(value) => setJobForm({ ...jobForm, siteId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('scrapes.createJob.selectSite')} />
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
                    <Label htmlFor="job-type">{t('scrapes.createJob.type')}</Label>
                    <Select value={jobForm.type} onValueChange={(value) => setJobForm({ ...jobForm, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">{t('scrapes.jobTypes.quickScrape')}</SelectItem>
                        <SelectItem value="concept">{t('scrapes.jobTypes.conceptSearch')}</SelectItem>
                        <SelectItem value="category">{t('scrapes.jobTypes.categorySearch')}</SelectItem>
                        <SelectItem value="entity">{t('scrapes.jobTypes.entityExtraction')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {jobForm.type === 'concept' && (
                    <div>
                      <Label htmlFor="job-concept">{t('scrapes.createJob.concept')}</Label>
                      <Input
                        id="job-concept"
                        placeholder={t('scrapes.createJob.conceptPlaceholder')}
                        value={jobForm.concept}
                        onChange={(e) => setJobForm({ ...jobForm, concept: e.target.value })}
                      />
                    </div>
                  )}
                  {jobForm.type === 'category' && (
                    <div>
                      <Label htmlFor="job-category">{t('scrapes.createJob.category')}</Label>
                      <Input
                        id="job-category"
                        placeholder={t('scrapes.createJob.categoryPlaceholder')}
                        value={jobForm.category}
                        onChange={(e) => setJobForm({ ...jobForm, category: e.target.value })}
                      />
                    </div>
                  )}
                  <Button onClick={handleCreateJob} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('scrapes.createJob.startJob')}
                  </Button>
                </CardContent>
              </Card>

              {/* Scraping Workflows */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('scrapes.workflows.title')}</CardTitle>
                  <CardDescription>{t('scrapes.workflows.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Quick Site Scraping */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('scrapes.workflows.quickSiteScraping')}</Label>
                    <p className="text-xs text-muted-foreground">{t('scrapes.workflows.quickSiteScrapingDescription')}</p>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={!jobForm.siteId || !!activeSession}
                      onClick={() => handleCreateJob()}
                    >
                      <Target className="h-4 w-4 mr-2" />
                      {t('scrapes.workflows.startSiteScraping')}
                    </Button>
                  </div>

                  {/* Multi-Site Concept Search */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('scrapes.workflows.multiSiteConceptSearch')}</Label>
                    <p className="text-xs text-muted-foreground">{t('scrapes.workflows.multiSiteConceptSearchDescription')}</p>
                    <div className="space-y-2">
                      <Input
                        placeholder={t('scrapes.workflows.conceptPlaceholder')}
                        value={jobForm.concept}
                        onChange={(e) => setJobForm({ ...jobForm, concept: e.target.value })}
                        disabled={!!activeSession}
                      />
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={!jobForm.concept || !!activeSession}
                        onClick={() => handleCreateJob()}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        {t('scrapes.workflows.searchAcrossSites')}
                      </Button>
                    </div>
                  </div>

                  {/* Category Scraping */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('scrapes.workflows.categoryScraping')}</Label>
                    <p className="text-xs text-muted-foreground">{t('scrapes.workflows.categoryScrapingDescription')}</p>
                    <div className="space-y-2">
                      <Input
                        placeholder={t('scrapes.workflows.categoryPlaceholder')}
                        value={jobForm.category}
                        onChange={(e) => setJobForm({ ...jobForm, category: e.target.value })}
                        disabled={!!activeSession}
                      />
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={!jobForm.category || !!activeSession}
                        onClick={() => handleCreateJob()}
                      >
                        <Layers className="h-4 w-4 mr-2" />
                        {t('scrapes.workflows.scrapeCategory')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Jobs Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('scrapes.activeJobs.title')}</CardTitle>
                  <CardDescription>{t('scrapes.activeJobs.description')}</CardDescription>
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
                          <span>{job.itemsFound || 0} {t('scrapes.jobs.items')}</span>
                        </div>
                      </div>
                    ))}
                    {scrapeJobs.filter(job => job.status === 'running' || job.status === 'pending').length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        {t('scrapes.activeJobs.noActiveJobs')}
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
                    {t('scrapes.filterJobs.title')}
                  </CardTitle>
                  <CardDescription>{t('scrapes.filterJobs.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="filter-search">{t('common.search')}</Label>
                    <Input
                      id="filter-search"
                      placeholder={t('scrapes.filterJobs.searchPlaceholder')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>{t('common.status')}</Label>
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
                            {t(`scrapes.status.${status}`)}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>{t('scrapes.filterJobs.progressRange')}</Label>
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
                      {t('scrapes.filterJobs.showOnlyJobsWithErrors')}
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
                    {t('scrapes.filterJobs.resetFilters')}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Jobs Table */}
            <div className="lg:col-span-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">{t('scrapes.jobs.title', { count: filteredJobs.length })}</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    {t('common.filters')}
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
                      <p className="text-muted-foreground">{t('scrapes.jobs.noJobsFound')}</p>
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
                                  {t(`scrapes.jobTypes.${job.type || 'quick'}`)}
                                </Badge>
                                {getStatusBadge(job.status)}
                                {job.error && (
                                  <Badge variant="error" className="text-xs">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {t('common.error')}
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
                                <span>{job.itemsFound || 0} {t('scrapes.jobs.items')}</span>
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
                                message={t('scrapes.jobs.deleteJobConfirm')}
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
              <CardTitle className="text-lg">{t('scrapes.searchData.title')}</CardTitle>
              <CardDescription>{t('scrapes.searchData.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="data-search">{t('common.search')}</Label>
                  <Input
                    id="data-search"
                    placeholder={t('scrapes.searchData.searchPlaceholder')}
                    value={dataForm.search}
                    onChange={(e) => setDataForm({ ...dataForm, search: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="data-type">{t('common.type')}</Label>
                  <Select value={dataForm.type} onValueChange={(value) => setDataForm({ ...dataForm, type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('scrapes.dataTypes.allTypes')}</SelectItem>
                      <SelectItem value="concept">{t('scrapes.dataTypes.concept')}</SelectItem>
                      <SelectItem value="category">{t('scrapes.dataTypes.category')}</SelectItem>
                      <SelectItem value="entity">{t('scrapes.dataTypes.entity')}</SelectItem>
                      <SelectItem value="product">{t('scrapes.dataTypes.product')}</SelectItem>
                      <SelectItem value="article">{t('scrapes.dataTypes.article')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="data-category">{t('common.category')}</Label>
                  <Input
                    id="data-category"
                    placeholder={t('scrapes.searchData.categoryPlaceholder')}
                    value={dataForm.category}
                    onChange={(e) => setDataForm({ ...dataForm, category: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full">
                    <Search className="h-4 w-4 mr-2" />
                    {t('scrapes.searchData.searchData')}
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
                  <CardTitle className="text-lg">{t('scrapes.dataStats.title')}</CardTitle>
                  <CardDescription>{t('scrapes.dataStats.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm">{t('scrapes.dataStats.totalItems')}</span>
                      <span className="font-medium">{scrapedData.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">{t('scrapes.dataStats.today')}</span>
                      <span className="font-medium">{stats.todayScraped}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">{t('scrapes.dataStats.avgContentLength')}</span>
                      <span className="font-medium">
                        {scrapedData.length > 0
                          ? Math.round(scrapedData.reduce((acc, d) => acc + (d.content?.length || 0), 0) / scrapedData.length)
                          : 0} {t('scrapes.dataStats.chars')}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Export & Translation Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('scrapes.exportTools.title')}</CardTitle>
                  <CardDescription>{t('scrapes.exportTools.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full">
                    {t('scrapes.exportTools.exportAsCSV')}
                  </Button>
                  <Button variant="outline" className="w-full">
                    {t('scrapes.exportTools.exportAsJSON')}
                  </Button>
                  <Button variant="outline" className="w-full">
                    {t('scrapes.exportTools.exportToDatabase')}
                  </Button>
                  <div className="border-t pt-3">
                    <Button variant="default" className="w-full gap-2">
                      <Languages className="h-4 w-4" />
                      {t('scrapes.exportTools.translateSelectedData')}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('scrapes.exportTools.translateDescription')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Data Table */}
            <div className="lg:col-span-8">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">{t('scrapes.scrapedData.title', { count: scrapedData.length })}</h3>
                {scrapedData.length === 0 ? (
                  <Card className="text-center py-12">
                    <CardContent>
                      <p className="text-muted-foreground">{t('scrapes.scrapedData.noData')}</p>
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
                                  {t(`scrapes.dataTypes.${data.type}`)}
                                </Badge>
                                {data.category && (
                                  <span className="text-xs text-gray-500">{data.category}</span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {data.content?.length || 0} {t('scrapes.dataStats.chars')}
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
              <h3 className="text-lg font-medium text-gray-900">{t('scrapes.sites.title', { count: sites.length })}</h3>
              <p className="text-sm text-muted-foreground">{t('scrapes.sites.description')}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('scrapes.sites.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button onClick={() => setShowSiteAnalyzerModal(true)}>
                <Zap className="h-4 w-4 mr-2" />
                {t('scrapes.sites.intelligentAddSite')}
              </Button>
            </div>
          </div>

          {/* Sites Filters */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('common.filter')}:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('scrapes.sites.allStatus')}</SelectItem>
                <SelectItem value="configured">{t('scrapes.sites.configured')}</SelectItem>
                <SelectItem value="not_configured">{t('scrapes.sites.notConfigured')}</SelectItem>
                <SelectItem value="analyzing">{t('scrapes.sites.analyzing')}</SelectItem>
                <SelectItem value="analyzed">{t('scrapes.sites.analyzed')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('scrapes.sites.allTypes')}</SelectItem>
                <SelectItem value="website">{t('scrapes.sites.website')}</SelectItem>
                <SelectItem value="ecommerce">{t('scrapes.sites.ecommerce')}</SelectItem>
                <SelectItem value="blog">{t('scrapes.sites.blog')}</SelectItem>
                <SelectItem value="news">{t('scrapes.sites.newsSite')}</SelectItem>
                <SelectItem value="forum">{t('scrapes.sites.forum')}</SelectItem>
                <SelectItem value="directory">{t('scrapes.sites.directory')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={t('common.category')}
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
                    <h3 className="text-lg font-medium">{t('scrapes.sites.noSitesConfigured')}</h3>
                    <p className="text-muted-foreground mt-1">{t('scrapes.sites.addFirstSite')}</p>
                  </div>
                  <Button onClick={() => setShowSiteAnalyzerModal(true)}>
                    <Zap className="h-4 w-4 mr-2" />
                    {t('scrapes.sites.addYourFirstSite')}
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
                              {site.status === 'configured' ? t('scrapes.sites.ready') : t('scrapes.sites.setup')}
                            </Badge>
                          </div>

                          {/* Meta Info */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="capitalize">{t(`scrapes.sites.${site.type}`)}</span>
                              <span>{site.totalScraped || 0} {t('scrapes.sites.items')}</span>
                            </div>
                            {site.lastScraped && (
                              <div className="text-xs text-muted-foreground">
                                {t('scrapes.sites.last')}: {formatDate(site.lastScraped)}
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
            <DialogTitle>{t('scrapes.siteDetails.title')}</DialogTitle>
          </DialogHeader>
          {selectedSite && (
            <div className="space-y-4">
              <div>
                <Label>{t('scrapes.siteDetails.siteName')}</Label>
                <p className="text-sm text-muted-foreground">{selectedSite.name}</p>
              </div>
              <div>
                <Label>{t('scrapes.siteDetails.baseUrl')}</Label>
                <p className="text-sm text-muted-foreground">{selectedSite.base_url}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('common.type')}</Label>
                  <p className="text-sm">{selectedSite.type}</p>
                </div>
                <div>
                  <Label>{t('common.status')}</Label>
                  <Badge variant={selectedSite.status === 'configured' ? 'default' : 'secondary'}>
                    {selectedSite.status ? t(`scrapes.sites.${selectedSite.status}`) : t('scrapes.siteDetails.notConfigured')}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('scrapes.siteDetails.totalScraped')}</Label>
                  <p className="text-sm">{selectedSite.totalScraped || 0} {t('scrapes.sites.items')}</p>
                </div>
                <div>
                  <Label>{t('scrapes.siteDetails.successRate')}</Label>
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
            <DialogTitle>{t('scrapes.analyzeSite.title')}</DialogTitle>
            <DialogDescription>
              {t('scrapes.analyzeSite.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">{t('scrapes.analyzeSite.analyzing')}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('scrapes.analyzeSite.detectingContentAreas')}</span>
                <span className="text-muted-foreground">{t('scrapes.analyzeSite.inProgress')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{t('scrapes.analyzeSite.identifyingNavigationPatterns')}</span>
                <span className="text-muted-foreground">{t('scrapes.analyzeSite.pending')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{t('scrapes.analyzeSite.analyzingPageStructure')}</span>
                <span className="text-muted-foreground">{t('scrapes.analyzeSite.pending')}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Site Configure Dialog */}
      <Dialog open={showSiteConfigureDialog} onOpenChange={setShowSiteConfigureDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('scrapes.configureSite.title')}</DialogTitle>
            <DialogDescription>
              {t('scrapes.configureSite.description', { siteName: selectedSite?.name })}
            </DialogDescription>
          </DialogHeader>
          {selectedSite && (
            <div className="space-y-6">
              {/* Content Selectors */}
              <div>
                <h4 className="text-sm font-medium mb-3">{t('scrapes.configureSite.contentSelectors')}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="config-content">{t('scrapes.configureSite.contentSelector')}</Label>
                    <Input
                      id="config-content"
                      placeholder={t('scrapes.configureSite.contentSelectorPlaceholder')}
                      value={siteConfig.contentSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, contentSelector: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="config-title">{t('scrapes.configureSite.titleSelector')}</Label>
                    <Input
                      id="config-title"
                      placeholder={t('scrapes.configureSite.titleSelectorPlaceholder')}
                      value={siteConfig.titleSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, titleSelector: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="config-description">{t('scrapes.configureSite.descriptionSelector')}</Label>
                    <Input
                      id="config-description"
                      placeholder={t('scrapes.configureSite.descriptionSelectorPlaceholder')}
                      value={siteConfig.descriptionSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, descriptionSelector: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="config-links">{t('scrapes.configureSite.linksSelector')}</Label>
                    <Input
                      id="config-links"
                      placeholder={t('scrapes.configureSite.linksSelectorPlaceholder')}
                      value={siteConfig.linksSelector}
                      onChange={(e) => setSiteConfig(prev => ({ ...prev, linksSelector: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Scraping Behavior */}
              <div>
                <h4 className="text-sm font-medium mb-3">{t('scrapes.configureSite.scrapingBehavior')}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="config-max-depth">{t('scrapes.configureSite.maxDepth')}</Label>
                    <Select value={siteConfig.maxDepth.toString()} onValueChange={(value) => setSiteConfig(prev => ({ ...prev, maxDepth: parseInt(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t('scrapes.configureSite.oneLevel')}</SelectItem>
                        <SelectItem value="2">{t('scrapes.configureSite.twoLevels')}</SelectItem>
                        <SelectItem value="3">{t('scrapes.configureSite.threeLevels')}</SelectItem>
                        <SelectItem value="5">{t('scrapes.configureSite.fiveLevels')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="config-max-pages">{t('scrapes.configureSite.maxPages')}</Label>
                    <Select value={siteConfig.maxPages.toString()} onValueChange={(value) => setSiteConfig(prev => ({ ...prev, maxPages: parseInt(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">{t('scrapes.configureSite.tenPages')}</SelectItem>
                        <SelectItem value="50">{t('scrapes.configureSite.fiftyPages')}</SelectItem>
                        <SelectItem value="100">{t('scrapes.configureSite.hundredPages')}</SelectItem>
                        <SelectItem value="500">{t('scrapes.configureSite.fiveHundredPages')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="config-rate-limit">{t('scrapes.configureSite.rateLimit')}</Label>
                    <Select value={siteConfig.rateLimit.toString()} onValueChange={(value) => setSiteConfig(prev => ({ ...prev, rateLimit: parseInt(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t('scrapes.configureSite.onePerSec')}</SelectItem>
                        <SelectItem value="5">{t('scrapes.configureSite.fivePerSec')}</SelectItem>
                        <SelectItem value="10">{t('scrapes.configureSite.tenPerSec')}</SelectItem>
                        <SelectItem value="20">{t('scrapes.configureSite.twentyPerSec')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div>
                <h4 className="text-sm font-medium mb-3">{t('scrapes.configureSite.options')}</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="config-enabled">{t('scrapes.configureSite.enableScraping')}</Label>
                    <Switch
                      id="config-enabled"
                      checked={siteConfig.enabled}
                      onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, enabled: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="config-clean-html">{t('scrapes.configureSite.cleanHtml')}</Label>
                    <Switch
                      id="config-clean-html"
                      checked={siteConfig.cleanHtml}
                      onCheckedChange={(checked) => setSiteConfig(prev => ({ ...prev, cleanHtml: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="config-respect-robots">{t('scrapes.configureSite.respectRobots')}</Label>
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
                  {t('scrapes.configureSite.autoDetect')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleConfigureSite(selectedSite.id)}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('scrapes.configureSite.saveConfiguration')}
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
            <DialogTitle>{t('scrapes.jobDetails.title')}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div>
                <Label>{t('common.url')}</Label>
                <p className="text-sm text-muted-foreground break-all">{selectedJob.url}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('common.status')}</Label>
                  <div className="mt-1">{getStatusBadge(selectedJob.status)}</div>
                </div>
                <div>
                  <Label>{t('common.type')}</Label>
                  <p className="text-sm">{t(`scrapes.jobTypes.${selectedJob.type || 'quick'}`)}</p>
                </div>
              </div>
              {selectedJob.concept && (
                <div>
                  <Label>{t('scrapes.jobDetails.concept')}</Label>
                  <p className="text-sm">{selectedJob.concept}</p>
                </div>
              )}
              {selectedJob.category && (
                <div>
                  <Label>{t('scrapes.jobDetails.category')}</Label>
                  <p className="text-sm">{selectedJob.category}</p>
                </div>
              )}
              {selectedJob.error && (
                <div>
                  <Label>{t('common.error')}</Label>
                  <Alert className="mt-1">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{selectedJob.error}</AlertDescription>
                  </Alert>
                </div>
              )}
              {selectedJob.result && (
                <div>
                  <Label>{t('scrapes.jobDetails.resultPreview')}</Label>
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
            <DialogTitle>{t('scrapes.scrapedDataDetails.title')}</DialogTitle>
          </DialogHeader>
          {selectedData && (
            <div className="space-y-4">
              <div>
                <Label>{t('scrapes.scrapedDataDetails.title')}</Label>
                <p className="font-medium">{selectedData.title}</p>
              </div>
              <div>
                <Label>{t('common.url')}</Label>
                <a href={selectedData.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                  {selectedData.url}
                </a>
              </div>
              <div>
                <Label>{t('scrapes.scrapedDataDetails.content')}</Label>
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
            <DialogTitle>{t('scrapes.addNewSite.title')}</DialogTitle>
            <DialogDescription>
              {t('scrapes.addNewSite.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-site-name">{t('scrapes.addNewSite.siteName')}</Label>
              <Input
                id="new-site-name"
                placeholder={t('scrapes.addNewSite.siteNamePlaceholder')}
                value={newSite.name}
                onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-site-url">{t('common.url')}</Label>
              <Input
                id="new-site-url"
                placeholder={t('scrapes.addNewSite.urlPlaceholder')}
                value={newSite.url}
                onChange={(e) => setNewSite({ ...newSite, url: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-site-type">{t('common.type')}</Label>
              <Select value={newSite.type} onValueChange={(value) => setNewSite({ ...newSite, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">{t('scrapes.sites.website')}</SelectItem>
                  <SelectItem value="ecommerce">{t('scrapes.sites.ecommerce')}</SelectItem>
                  <SelectItem value="blog">{t('scrapes.sites.blog')}</SelectItem>
                  <SelectItem value="news">{t('scrapes.sites.newsSite')}</SelectItem>
                  <SelectItem value="forum">{t('scrapes.sites.forum')}</SelectItem>
                  <SelectItem value="directory">{t('scrapes.sites.directory')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-site-category">{t('common.category')}</Label>
              <Input
                id="new-site-category"
                placeholder={t('scrapes.addNewSite.categoryPlaceholder')}
                value={newSite.category}
                onChange={(e) => setNewSite({ ...newSite, category: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowNewSiteDialog(false)} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCreateSite} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                {t('scrapes.addNewSite.addSite')}
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
            title: t('common.success'),
            description: t('scrapes.notifications.siteCreatedWithIntelligentAnalysis'),
          });
        }}
      />
    </div>
  );
}