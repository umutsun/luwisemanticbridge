'use client';

import { useState, useEffect } from 'react';
import {
  Search, Plus, Globe, Settings, Loader2, Play, RefreshCw, Trash2, CheckCircle, AlertCircle,
  Database, BarChart3, Brain, Tag, TrendingUp, FileText, Eye, Download, Upload, Pause,
  SkipForward, Activity, Layers, Target, Package, Filter, ChevronDown, Zap, Grid3x3,
  ShoppingCart, BookOpen, User, Calendar, MapPin, Star, Hash, Link2, Image, X, Check,
  Clock, TrendingDown, Users, FileSpreadsheet
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
import { TableSkeleton } from '@/components/ui/skeleton';

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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  result?: any;
  error?: string;
  type?: 'concept' | 'category' | 'entity' | 'multi_concept' | 'quick';
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

export default function ScrapesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [sites, setSites] = useState<Site[]>([]);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [scrapedData, setScrapedData] = useState<ScrapedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<ScrapeJob | null>(null);
  const [selectedData, setSelectedData] = useState<ScrapedData | null>(null);
  const [showNewSiteDialog, setShowNewSiteDialog] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', url: '', type: 'website', category: '' });

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
        fetchScrapedData()
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
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/jobs`);
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
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/data`);
      if (response.ok) {
        const data = await response.json();
        setScrapedData(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch scraped data:', error);
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
        fetchSites();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to create site',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to create site:', error);
      toast({
        title: 'Error',
        description: 'Failed to create site',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

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
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/jobs/${jobId}/pause`, {
        method: 'POST'
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
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/jobs/${jobId}/resume`, {
        method: 'POST'
      });

      if (response.ok) {
        fetchJobs();
      }
    } catch (error) {
      console.error('Failed to resume job:', error);
    }
  };

  const filteredJobs = scrapeJobs.filter(job => {
    const matchesSearch = job.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesType = typeFilter === 'all' || job.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'paused':
        return <Badge variant="secondary"><Pause className="w-3 h-3 mr-1" />Paused</Badge>;
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
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Scraping Management</h1>
        </div>
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scraping Management</h1>
          <p className="text-muted-foreground">Manage web scraping operations and data extraction</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowNewSiteDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Site
          </Button>
          <Button variant="outline" onClick={fetchAllData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Globe className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Sites</p>
                <p className="text-2xl font-bold">{stats.totalSites}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Active Jobs</p>
                <p className="text-2xl font-bold">{stats.activeJobs}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Database className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Scraped</p>
                <p className="text-2xl font-bold">{stats.totalScraped.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{stats.successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-cyan-500" />
              <div>
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-2xl font-bold">{stats.todayScraped}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-8 w-8 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Time</p>
                <p className="text-2xl font-bold">{formatDuration(stats.avgProcessingTime)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="data">Scraped Data</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
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
                        <p className="font-medium truncate">{job.url}</p>
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
                        <p className="text-sm text-muted-foreground truncate">{site.base_url}</p>
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
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search jobs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="quick">Quick</SelectItem>
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="entity">Entity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Jobs Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Items Found</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No jobs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map(job => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium max-w-xs truncate">
                        {job.url}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{job.type || 'quick'}</Badge>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(job.status)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <span className="text-sm">{job.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{job.itemsFound || 0}</TableCell>
                      <TableCell>
                        {job.duration ? formatDuration(job.duration) : '-'}
                      </TableCell>
                      <TableCell>{formatDate(job.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteJob(job.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Scraped Data Tab */}
        <TabsContent value="data" className="space-y-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Content Length</TableHead>
                  <TableHead>Scraped At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scrapedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No scraped data yet
                    </TableCell>
                  </TableRow>
                ) : (
                  scrapedData.slice(0, 20).map(data => (
                    <TableRow key={data.id}>
                      <TableCell className="font-medium max-w-xs truncate">
                        {data.title}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {data.url}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{data.type}</Badge>
                      </TableCell>
                      <TableCell>{data.category || '-'}</TableCell>
                      <TableCell>{data.content?.length || 0}</TableCell>
                      <TableCell>{formatDate(data.scrapedAt)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedData(data)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Sites Tab */}
        <TabsContent value="sites" className="space-y-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Scraped</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Last Scraped</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No sites configured
                    </TableCell>
                  </TableRow>
                ) : (
                  sites.map(site => (
                    <TableRow key={site.id}>
                      <TableCell className="font-medium">{site.name}</TableCell>
                      <TableCell>
                        <a href={site.base_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {site.base_url}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{site.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={site.status === 'configured' ? 'default' : 'secondary'}>
                          {site.status || 'Not configured'}
                        </Badge>
                      </TableCell>
                      <TableCell>{site.totalScraped || 0}</TableCell>
                      <TableCell>
                        {site.successRate ? `${site.successRate}%` : '-'}
                      </TableCell>
                      <TableCell>
                        {site.lastScraped ? formatDate(site.lastScraped) : 'Never'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline">
                            <Settings className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Site Dialog */}
      <Dialog open={showNewSiteDialog} onOpenChange={setShowNewSiteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Site</DialogTitle>
            <DialogDescription>
              Configure a new website for scraping
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="site-name">Site Name</Label>
              <Input
                id="site-name"
                value={newSite.name}
                onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                placeholder="My Website"
              />
            </div>
            <div>
              <Label htmlFor="site-url">URL</Label>
              <Input
                id="site-url"
                value={newSite.url}
                onChange={(e) => setNewSite({ ...newSite, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <Label htmlFor="site-type">Type</Label>
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
              <Label htmlFor="site-category">Category</Label>
              <Input
                id="site-category"
                value={newSite.category}
                onChange={(e) => setNewSite({ ...newSite, category: e.target.value })}
                placeholder="General"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleCreateSite} className="flex-1">
                Create Site
              </Button>
              <Button variant="outline" onClick={() => setShowNewSiteDialog(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
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
    </div>
  );
}