'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Globe,
  Play,
  Pause,
  Square,
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  TrendingUp,
  Settings,
  Plus,
  Eye,
  Download
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/ui/skeleton';

interface Site {
  id: string;
  name: string;
  base_url: string;
  type: string;
  category: string;
  active: boolean;
  created_at: string;
}

interface ScrapeJob {
  id: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  items_scraped?: number;
  total_items?: number;
  error?: string;
  started_at: string;
}

export default function ScraperDemoPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const { toast } = useToast();

  // Fetch sites
  useEffect(() => {
    fetchSites();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchSites = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/sites');
      if (response.ok) {
        const data = await response.json();
        setSites(data.sites || []);
      }
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/jobs');
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      // Silent fail for polling
    }
  };

  const startScraping = async (siteId: string) => {
    setIsScraping(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, mode: 'full' })
      });

      if (response.ok) {
        toast({
          title: "Scraping Started",
          description: "Data collection has begun successfully.",
        });
        fetchJobs();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start scraping",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const addNewSite = async () => {
    if (!newSiteUrl) return;

    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: new URL(newSiteUrl).hostname,
          base_url: newSiteUrl,
          type: 'website',
          category: 'customer'
        })
      });

      if (response.ok) {
        toast({
          title: "Site Added",
          description: "New site has been added successfully.",
        });
        setNewSiteUrl('');
        fetchSites();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add site",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Data Scraper</h1>
        </div>
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Data Scraper</h1>
          <p className="text-muted-foreground mt-1">
            Collect and analyze data from multiple sources
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {sites.length} Active Sites
        </Badge>
      </div>

      <Tabs defaultValue="sites" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="add">Add New Site</TabsTrigger>
        </TabsList>

        {/* Sites Tab */}
        <TabsContent value="sites" className="space-y-4">
          <div className="grid gap-4">
            {sites.map((site) => (
              <Card key={site.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-blue-500" />
                      <div>
                        <CardTitle className="text-lg">{site.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{site.base_url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={site.active ? "default" : "secondary"}>
                        {site.active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">{site.category}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Type: <span className="font-medium">{site.type}</span>
                    </div>
                    <Button
                      onClick={() => startScraping(site.id)}
                      disabled={isScraping}
                      size="sm"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Scraping
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          {jobs.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No scraping jobs found. Start a new job from the Sites tab.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <Card key={job.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getStatusBadge(job.status)}
                          <span className="text-sm font-medium">{job.url}</span>
                        </div>
                        {job.status === 'running' && job.items_scraped && (
                          <div className="text-sm text-muted-foreground">
                            Progress: {job.items_scraped} / {job.total_items || '?'} items
                          </div>
                        )}
                        {job.error && (
                          <div className="text-sm text-red-500 mt-1">
                            Error: {job.error}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(job.started_at).toLocaleString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Add New Site Tab */}
        <TabsContent value="add" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Add New Site
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Site URL</label>
                <Input
                  value={newSiteUrl}
                  onChange={(e) => setNewSiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="mt-2"
                />
              </div>
              <Button onClick={addNewSite} disabled={!newSiteUrl}>
                <Plus className="w-4 h-4 mr-2" />
                Add Site
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}