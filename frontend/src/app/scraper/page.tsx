"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Globe,
  Zap,
  Search,
  Download,
  Upload,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  Settings,
  Save,
  File,
  Database,
  Brain,
  Layers,
  Clock,
  BarChart3,
  Filter,
  MoreHorizontal,
  Edit,
  Copy,
  Eye,
  EyeOff,
  Activity,
  TrendingUp,
  Rocket,
  Sparkles,
  StopCircle,
  Square
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ModernCard } from "@/components/ui/modern-card";
import { ProjectCardSkeleton, ConfigCardSkeleton, ProgressSkeleton, ResultsTableSkeleton } from "@/components/ui/skeleton-states";
import { AnimatedStats, CircularProgress } from "@/components/ui/animated-stats";
import { ModernTabs, ModernTabsList } from "@/components/ui/modern-tabs";
import { cn } from "@/lib/utils";
import "@/styles/animations.css";
import { apiConfig, fetchWithAuth } from "@/lib/api/config";
import SiteAnalyzerModal from "@/components/site-analyzer-modal";

interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'paused' | 'completed';
  stats: {
    sites: number;
    items: number;
    processed: number;
  };
  createdAt: string;
}

interface SiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  type?: string;
  category?: string;
  selectors?: Record<string, any>;
  active: boolean;
  config?: Record<string, any>;
}

interface ScrapingProgress {
  total: number;
  completed: number;
  current: string;
  items: number;
  time: string;
  sessionId?: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  startTime?: string;
  estimatedTime?: string;
}

export default function ScraperPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [siteConfigs, setSiteConfigs] = useState<SiteConfig[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState<ScrapingProgress | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showNewSiteDialog, setShowNewSiteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [selectedSiteForAnalysis, setSelectedSiteForAnalysis] = useState<SiteConfig | null>(null);
  const [activeTab, setActiveTab] = useState("projects");
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [scrapingMode, setScrapingMode] = useState("static");
  const [scrapingDepth, setScrapingDepth] = useState(2);
  const [advancedSettings, setAdvancedSettings] = useState({
    generateEmbeddings: true,
    processWithAI: true,
    realTimeUpdates: true
  });

  // Mount animation
  useEffect(() => {
    setMounted(true);
  }, []);

  // Socket.IO connection
  useEffect(() => {
    // Import socket.io only on client side
    if (typeof window !== 'undefined') {
      import('socket.io-client').then(({ io }) => {
        const socketInstance = io('http://localhost:8083', {
          transports: ['websocket'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        socketInstance.on('connect', () => {
          console.log('Connected to backend');
          setSocket(socketInstance);
        });

        socketInstance.on('disconnect', () => {
          console.log('Disconnected from backend');
        });

        socketInstance.on('scraping-progress', (data) => {
          setScrapingProgress(data);
        });

        socketInstance.on('scraping-complete', (data) => {
          setIsScraping(false);
          setResults(data.results || []);
          setScrapingProgress(prev => prev ? { ...prev, status: 'completed' } : null);
        });

        socketInstance.on('scraping-error', (error) => {
          console.error('Scraping error:', error);
          setIsScraping(false);
          setScrapingProgress(prev => prev ? { ...prev, status: 'failed' } : null);
        });

        return () => socketInstance.disconnect();
      }).catch(error => {
        console.error('Failed to import socket.io:', error);
      });
    }
  }, []);

  // Load projects with loading state
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        loadProjects(),
        loadSiteConfigs()
      ]);
      setIsLoading(false);
    };

    if (mounted) {
      loadData();
    }
  }, [mounted]);

  const loadProjects = async () => {
    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/projects'));
      const data = await response.json();
      if (data.success) {
        setProjects(data.data || []);
      } else {
        console.error('Failed to load projects:', data.error);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadSiteConfigs = async () => {
    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/sites'));
      const data = await response.json();
      if (data.success) {
        setSiteConfigs(data.data || []);
      } else {
        console.error('Failed to load sites:', data.error);
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
    }
  };

  const startScraping = async () => {
    if (!selectedProject || selectedSites.length === 0) {
      alert('Please select a project and at least one site');
      return;
    }

    setIsScraping(true);
    setScrapingProgress(null);
    setResults([]);

    try {
      // Prepare configurations for all selected sites
      const siteConfigsData = selectedSites.map(siteId => {
        const site = siteConfigs.find(config => config.id === siteId);
        return {
          siteId,
          name: site?.name || 'Unknown Site',
          baseUrl: site?.baseUrl || 'https://example.com',
          category: selectedCategory || 'general',
          scrapingMode,
          scrapingDepth,
          advancedSettings,
          maxPages: scrapingDepth === 1 ? 50 : scrapingDepth === 2 ? 100 : 200,
          maxDepth: scrapingDepth,
          domainsOnly: true,
          followExternal: false,
          delay: 1000,
          respectRobots: true
        };
      });

      // Start parallel scraping sessions for each site
      const promises = siteConfigsData.map((config, index) => {
        return fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/start'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: config.baseUrl,
            config: {
              ...config.advancedSettings,
              projectId: selectedProject,
              category: config.category,
              siteId: config.siteId,
              siteName: config.name,
              maxPages: config.maxPages,
              maxDepth: config.maxDepth,
              domainsOnly: config.domainsOnly,
              followExternal: config.followExternal,
              delay: config.delay,
              respectRobots: config.respectRobots,
              scrapingMode: config.scrapingMode
            }
          })
        });
      });

      const responses = await Promise.allSettled(promises);

      // Process responses
      const successfulSessions = [];
      const failedSessions = [];

      responses.forEach(async (response, index) => {
        if (response.status === 'fulfilled' && response.value.ok) {
          const data = await response.value.json();
          successfulSessions.push(data.jobId);
        } else {
          const error = response.status === 'fulfilled' ? response.value.error : 'Network error';
          failedSessions.push({ site: siteConfigsData[index].name, error });
        }
      });

      if (successfulSessions.length === 0) {
        throw new Error('All scraping sessions failed');
      }

      // Set up progress tracking for parallel scraping
      setScrapingProgress({
        total: selectedSites.length,
        completed: 0,
        current: `Starting ${successfulSessions.length} parallel sessions...`,
        items: 0,
        time: '00:00',
        sessionId: successfulSessions[0],
        status: 'running',
        startTime: new Date().toISOString(),
        estimatedTime: `${Math.max(5, successfulSessions.length * 2)}-${Math.max(15, successfulSessions.length * 5)} minutes`
      });

      setCurrentSessionId(successfulSessions.join(', '));

      console.log('Parallel scraping started with session IDs:', successfulSessions);

      // If some sites failed, show warnings
      if (failedSessions.length > 0) {
        console.warn('Failed sessions:', failedSessions);
      }

    } catch (error) {
      console.error('Failed to start parallel scraping:', error);
      setIsScraping(false);
      setScrapingProgress(null);
      alert('Failed to start scraping: ' + (error as Error).message);
    }
  };

  const pauseScraping = async () => {
    if (!currentSessionId) return;

    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/pause'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId })
      });

      const data = await response.json();
      if (data.success) {
        setScrapingProgress(prev => prev ? { ...prev, status: 'paused' } : null);
      } else {
        console.error('Failed to pause scraping:', data.error);
      }
    } catch (error) {
      console.error('Failed to pause scraping:', error);
    }
  };

  const resumeScraping = async () => {
    if (!currentSessionId) return;

    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/resume'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId })
      });

      const data = await response.json();
      if (data.success) {
        setScrapingProgress(prev => prev ? { ...prev, status: 'running' } : null);
      } else {
        console.error('Failed to resume scraping:', data.error);
      }
    } catch (error) {
      console.error('Failed to resume scraping:', error);
    }
  };

  const stopScraping = async (force = false) => {
    if (!currentSessionId) return;

    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/stop'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId, force })
      });

      const data = await response.json();
      if (data.success) {
        setIsScraping(false);
        setScrapingProgress(null);
        setCurrentSessionId(null);
      } else {
        console.error('Failed to stop scraping:', data.error);
      }
    } catch (error) {
      console.error('Failed to stop scraping:', error);
    }
  };

  const createProject = async (formData: any) => {
    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        setProjects(prev => [...prev, data.data]);
        setShowNewProjectDialog(false);
      } else {
        console.error('Failed to create project:', data.error);
        alert('Failed to create project: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project: ' + (error as Error).message);
    }
  };

  const createSite = async (formData: any) => {
    try {
      const response = await fetchWithAuth(apiConfig.getApiUrl('/api/v2/scraper/sites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        // Reload sites list after creating
        await loadSiteConfigs();
        setShowNewSiteDialog(false);
      } else {
        console.error('Failed to create site:', data.error);
        alert('Failed to create site: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to create site:', error);
      alert('Failed to create site: ' + (error as Error).message);
    }
  };

  const handleSiteToggle = (siteId: string) => {
    setSelectedSites(prev =>
      prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter sites based on search term
  const filteredSites = siteConfigs.filter(site =>
    site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    site.baseUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
    site.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateProgress = () => {
    if (!scrapingProgress) return 0;
    return (scrapingProgress.completed / scrapingProgress.total) * 100;
  };

  const getScrapingStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600';
      case 'paused': return 'text-yellow-600';
      case 'completed': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const tabsData = [
    { value: "projects", label: "Projects", icon: <FileText className="w-4 h-4" /> },
    { value: "config", label: "Configurations", icon: <Settings className="w-4 h-4" /> },
    { value: "scraping", label: "Scraping", icon: <Globe className="w-4 h-4" /> },
    { value: "processing", label: "Processing", icon: <Brain className="w-4 h-4" /> }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-6 md:px-6 lg:px-8">
        {/* Header with animation */}
        <div className={cn(
          "mb-8 text-center transition-all duration-1000 ease-out",
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}>
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="relative">
              <Rocket className="w-10 h-10 text-blue-600" />
              <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 animate-pulse" />
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Advanced Scraper
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-lg max-w-2xl mx-auto">
            Intelligent Web Scraping & Content Processing System
          </p>
          <div className="flex items-center justify-center gap-6 mt-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Activity className="w-4 h-4 text-green-500" />
              <span>Real-time Processing</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span>Smart Analytics</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span>Lightning Fast</span>
            </div>
          </div>
        </div>

        <ModernTabs value={activeTab} onValueChange={setActiveTab}>
          <ModernTabsList
            tabs={tabsData}
            value={activeTab}
            onValueChange={setActiveTab}
          />

              {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Scraping Projects</h2>
              <p className="text-gray-600 dark:text-gray-300">Manage and monitor your web scraping projects</p>
            </div>
            <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5">
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl">Create New Project</DialogTitle>
                </DialogHeader>
                <NewProjectForm onSubmit={createProject} />
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ animationDelay: `${i * 100}ms` }}>
                  <ProjectCardSkeleton />
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileText className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No projects yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">Create your first scraping project to get started</p>
              <Button onClick={() => setShowNewProjectDialog(true)} className="bg-gradient-to-r from-blue-600 to-purple-600">
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project, index) => (
                <ModernCard
                  key={project.id}
                  variant="glass"
                  hover
                  delay={index * 100}
                  className="group cursor-pointer overflow-hidden"
                  onClick={() => {
                    setSelectedProject(project.id);
                    setActiveTab('scraping');
                  }}
                >
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-3">
                      <CardTitle className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                        {project.name}
                      </CardTitle>
                      <Badge
                        variant={project.status === 'active' ? 'default' : 'secondary'}
                        className={cn(
                          "px-3 py-1 text-xs font-medium",
                          project.status === 'active'
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                        )}
                      >
                        {project.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-gray-600 dark:text-gray-300 line-clamp-2">
                      {project.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <AnimatedStats
                        value={project.stats.sites}
                        label="Sites"
                        color="green"
                        duration={1500}
                      />
                      <AnimatedStats
                        value={project.stats.items}
                        label="Items"
                        color="blue"
                        duration={1800}
                      />
                      <AnimatedStats
                        value={project.stats.processed}
                        label="Processed"
                        color="purple"
                        duration={2000}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProject(project.id);
                          setActiveTab('scraping');
                        }}
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Run
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </ModernCard>
              ))}
            </div>
          )}
        </TabsContent>

              {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Site Configurations</h2>
              <p className="text-gray-600 dark:text-gray-300">Manage and configure websites for intelligent scraping</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowNewSiteDialog(true)} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all duration-200">
                <Plus className="w-4 h-4 mr-2" />
                Add New Site
              </Button>
              <Button variant="outline" className="hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-all duration-200">
                <Upload className="w-4 h-4 mr-2" />
                Import Config
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Site Selection */}
            <div className="space-y-6">
              <ModernCard variant="elevated" className="h-fit">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600" />
                    Site Selection
                  </CardTitle>
                  <CardDescription>
                    Select sites to scrape from your configured list
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="relative">
                      <Input
                        placeholder="Search sites..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                      <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-96 overflow-y-auto">
                      {isLoading ? (
                        [...Array(5)].map((_, i) => (
                          <div key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 mb-2">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                          </div>
                        ))
                      ) : filteredSites.length === 0 ? (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Globe className="w-8 h-8 text-gray-400" />
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 mb-4">
                            {siteConfigs.length === 0 ? 'No sites configured yet' : 'No sites found'}
                          </p>
                          <Button onClick={() => setShowNewSiteDialog(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add New Site
                          </Button>
                        </div>
                      ) : (
                        filteredSites.map((site) => (
                          <label
                            key={site.id}
                            className={cn(
                              "p-4 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                              selectedSites.includes(site.id)
                                ? "border-blue-300 bg-blue-50 dark:bg-blue-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600"
                            )}
                          >
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={selectedSites.includes(site.id)}
                                onChange={() => handleSiteToggle(site.id)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">
                                  {site.name}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {site.baseUrl}
                                </p>
                                <div className="flex items-center justify-between mt-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {site.category}
                                    </Badge>
                                    <div className={`w-2 h-2 rounded-full ${site.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                                    <span className="text-xs text-gray-500">
                                      {site.active ? 'Active' : 'Inactive'}
                                    </span>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 px-2 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSiteForAnalysis(site);
                                      setShowAnalyzeModal(true);
                                    }}
                                  >
                                    <Search className="w-3 h-3 mr-1" />
                                    Analyze
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>

                    {selectedSites.length > 0 && (
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-blue-600" />
                            <span className="font-medium text-blue-900 dark:text-blue-100">
                              {selectedSites.length} site(s) selected
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedSites([])}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            Clear All
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </ModernCard>
            </div>

            {/* Configuration Editor */}
            <div className="space-y-6">
              <ModernCard variant="glass" className="h-full">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Site Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure scraping parameters and selectors for selected sites
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {selectedSites.length === 0 ? (
                      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Settings className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                          No Site Selected
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                          Select one or more sites from the left panel to configure their scraping parameters,
                          selectors, and advanced settings.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Basic Settings */}
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Basic Settings</h4>
                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Scraping Mode
                              </Label>
                              <Select value={scrapingMode} onValueChange={setScrapingMode}>
                                <SelectTrigger className="h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="static">Static HTML</SelectItem>
                                  <SelectItem value="dynamic">Dynamic JavaScript</SelectItem>
                                  <SelectItem value="hybrid">Hybrid Mode</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Content Category
                              </Label>
                              <Input
                                placeholder="e.g., products, articles, news"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                              />
                            </div>

                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Depth Level
                              </Label>
                              <div className="flex items-center gap-4">
                                <Slider
                                  value={[scrapingDepth]}
                                  onValueChange={(value) => setScrapingDepth(value[0])}
                                  max={5}
                                  min={1}
                                  step={1}
                                  className="flex-1"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-white w-8">
                                  {scrapingDepth}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Advanced Settings */}
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Advanced Settings</h4>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">Generate Embeddings</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Create semantic search vectors</p>
                              </div>
                              <Switch
                                checked={advancedSettings.generateEmbeddings}
                                onCheckedChange={(checked) => setAdvancedSettings(prev => ({ ...prev, generateEmbeddings: checked }))}
                              />
                            </div>

                            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">Process with AI</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Analyze content with LLM</p>
                              </div>
                              <Switch
                                checked={advancedSettings.processWithAI}
                                onCheckedChange={(checked) => setAdvancedSettings(prev => ({ ...prev, processWithAI: checked }))}
                              />
                            </div>

                            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">Real-time Updates</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Live progress notifications</p>
                              </div>
                              <Switch
                                checked={advancedSettings.realTimeUpdates}
                                onCheckedChange={(checked) => setAdvancedSettings(prev => ({ ...prev, realTimeUpdates: checked }))}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <Button
                            variant="outline"
                            className="flex-1 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700"
                            onClick={() => {
                              setSelectedSites([]);
                              setScrapingMode('static');
                              setSelectedCategory('');
                              setScrapingDepth(2);
                              setAdvancedSettings({
                                generateEmbeddings: true,
                                processWithAI: true,
                                realTimeUpdates: true
                              });
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Reset
                          </Button>
                          <Button
                            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                            onClick={() => setActiveTab('scraping')}
                          >
                            <Rocket className="w-4 h-4 mr-2" />
                            Start Scraping
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </ModernCard>
            </div>
          </div>
        </TabsContent>

            {/* Scraping Tab */}
        <TabsContent value="scraping" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Scraping Control Center</h2>
            <p className="text-gray-600 dark:text-gray-300">Configure and launch intelligent web scraping operations</p>
          </div>

          {/* Control Panel */}
          <ModernCard variant="gradient" className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Zap className="w-6 h-6" />
                Scraping Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="project-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Project
                  </Label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Choose a project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            {project.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category-input" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Content Category
                  </Label>
                  <Input
                    id="category-input"
                    placeholder="e.g., products, articles, news"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sites-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Target Sites
                  </Label>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {siteConfigs.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-2">No site configurations available</p>
                      ) : (
                        filteredSites.map((config) => (
                          <label key={config.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={selectedSites.includes(config.id)}
                              onChange={() => handleSiteToggle(config.id)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {config.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {config.baseUrl}
                              </p>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${config.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                          </label>
                        ))
                      )}
                    </div>
                    {selectedSites.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {selectedSites.length} site(s) selected
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative">
                {isScraping && scrapingProgress ? (
                  <div className="space-y-4">
                    {/* Scraping Controls */}
                    <div className="flex gap-2 justify-center">
                      {scrapingProgress.status === 'running' && (
                        <Button
                          onClick={pauseScraping}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        >
                          <Pause className="w-4 h-4 mr-2" />
                          Pause
                        </Button>
                      )}
                      {scrapingProgress.status === 'paused' && (
                        <Button
                          onClick={resumeScraping}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Resume
                        </Button>
                      )}
                      <Button
                        onClick={() => stopScraping(false)}
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                      >
                        <StopCircle className="w-4 h-4 mr-2" />
                        Stop
                      </Button>
                    </div>

                    <Button
                      onClick={() => stopScraping(true)}
                      variant="destructive"
                      size="lg"
                      className="w-full"
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Force Stop
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={startScraping}
                    disabled={!selectedProject || selectedSites.length === 0}
                    className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    size="lg"
                  >
                    <>
                      <div className="relative">
                        <Zap className="w-6 h-6 mr-3" />
                        <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400" />
                      </div>
                      Start Intelligent Scraping
                    </>
                  </Button>
                )}
              </div>
            </CardContent>
          </ModernCard>

          {/* Progress Visualization */}
          {scrapingProgress && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Live Progress</h3>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    scrapingProgress.status === 'running' ? 'bg-green-500' :
                    scrapingProgress.status === 'paused' ? 'bg-yellow-500' :
                    scrapingProgress.status === 'completed' ? 'bg-blue-500' : 'bg-red-500'
                  }`} />
                  <span className={`text-sm font-medium ${
                    getScrapingStatusColor(scrapingProgress.status)
                  }`}>
                    {scrapingProgress.status.charAt(0).toUpperCase() + scrapingProgress.status.slice(1)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Progress Card */}
                <div className="lg:col-span-3">
                  <ModernCard variant="elevated">
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-center">
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-blue-600" />
                          Scraping Progress
                        </CardTitle>
                        <div className="flex gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Globe className="w-4 h-4 text-green-500" />
                            <span className="font-medium">{scrapingProgress.completed}/{scrapingProgress.total} sites</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="font-medium">{scrapingProgress.items} items</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-purple-500" />
                            <span className="font-medium">{scrapingProgress.time}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Circular Progress */}
                      <div className="flex justify-center">
                        <CircularProgress
                          value={calculateProgress()}
                          size={180}
                          strokeWidth={12}
                        />
                      </div>

                      {/* Linear Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                          <span>Overall Progress</span>
                          <span>{Math.round(calculateProgress())}%</span>
                        </div>
                        <Progress
                          value={calculateProgress()}
                          className="h-3"
                        />
                      </div>

                      {/* Current Status */}
                      <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center justify-center gap-2 text-blue-700 dark:text-blue-300">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          <span className="text-sm font-medium">Currently Processing:</span>
                        </div>
                        <p className="text-gray-900 dark:text-white font-medium mt-1 truncate">
                          {scrapingProgress.current}
                        </p>
                      </div>

                      {/* Session Info */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <div className="text-gray-500 dark:text-gray-400">Session ID</div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {scrapingProgress.sessionId?.substring(0, 8)}...
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <div className="text-gray-500 dark:text-gray-400">Est. Time</div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {scrapingProgress.estimatedTime || 'Calculating...'}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </ModernCard>
                </div>

                {/* Stats Card */}
                <div className="lg:col-span-1">
                  <ModernCard variant="glass" className="h-fit">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">Real-time Stats</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <AnimatedStats
                        value={scrapingProgress.completed}
                        label="Completed"
                        color="green"
                        suffix={`/${scrapingProgress.total}`}
                        duration={1000}
                      />
                      <AnimatedStats
                        value={scrapingProgress.items}
                        label="Items Found"
                        color="blue"
                        duration={1200}
                      />
                      <div className="pt-2 border-t">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {Math.round(calculateProgress())}%
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">Complete</div>
                        </div>
                      </div>
                    </CardContent>
                  </ModernCard>
                </div>
              </div>
            </div>
          )}

          {/* Results Section */}
          {results.length > 0 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Scraped Results</h3>
                <div className="flex gap-2">
                  <Button variant="outline" className="hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-all duration-200">
                    <Download className="w-4 h-4 mr-2" />
                    Export Data
                  </Button>
                  <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transition-all duration-200">
                    <Brain className="w-4 h-4 mr-2" />
                    Process with AI
                  </Button>
                </div>
              </div>

              <ModernCard variant="glass">
                <CardContent className="p-6">
                  <ScrollArea className="h-[500px] rounded-lg">
                    <div className="space-y-4 pr-4">
                      {results.map((item, index) => (
                        <div
                          key={index}
                          className="group p-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 hover:-translate-y-0.5"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-semibold text-lg text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors line-clamp-1">
                              {item.title}
                            </h4>
                            <Badge variant="outline" className="ml-2">
                              #{index + 1}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <Globe className="w-4 h-4" />
                            <span className="truncate">{item.url}</span>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
                            {item.content?.substring(0, 200)}...
                          </p>
                          <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <span className="text-xs text-gray-500">
                              {item.content?.length} characters
                            </span>
                            <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                              <Eye className="w-4 h-4 mr-1" />
                              View Details
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </ModernCard>
            </div>
          )}
        </TabsContent>

        {/* Processing Tab */}
        <TabsContent value="processing" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">AI Processing Center</h2>
              <p className="text-gray-600 dark:text-gray-300">Advanced content processing with AI and semantic analysis</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-all duration-200">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Queue
              </Button>
              <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all duration-200">
                <Brain className="w-4 h-4 mr-2" />
                Process All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Processing Queue Stats */}
            <div className="xl:col-span-1">
              <ModernCard variant="elevated" className="h-fit">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-600" />
                    Processing Queue
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Queue Length</span>
                      <AnimatedStats value={12} label="" duration={800} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Processing</span>
                      <AnimatedStats value={3} label="" color="blue" duration={1000} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Completed</span>
                      <AnimatedStats value={156} label="" color="green" duration={1200} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Embeddings</span>
                      <AnimatedStats value={89} label="" color="purple" duration={1400} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs text-gray-500">3 items processing</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        Last activity: 2 minutes ago
                      </div>
                    </div>
                  </div>
                </CardContent>
              </ModernCard>
            </div>

            {/* Processed Content */}
            <div className="xl:col-span-3">
              <ModernCard variant="glass" className="h-full min-h-[400px]">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Processed Content
                  </CardTitle>
                  <CardDescription>
                    AI-processed content with semantic analysis and embeddings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Recent Processing Activity */}
                    <div className="space-y-3">
                      {[
                        {
                          id: 1,
                          title: "E-commerce Product Analysis",
                          status: "completed",
                          progress: 100,
                          items: 245,
                          time: "5 minutes ago"
                        },
                        {
                          id: 2,
                          title: "News Article Processing",
                          status: "processing",
                          progress: 67,
                          items: 156,
                          time: "2 minutes ago"
                        },
                        {
                          id: 3,
                          title: "Blog Content Analysis",
                          status: "queued",
                          progress: 0,
                          items: 89,
                          time: "Just now"
                        }
                      ].map((item) => (
                        <div key={item.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="font-medium text-gray-900 dark:text-white">{item.title}</h4>
                            <Badge
                              variant={
                                item.status === 'completed' ? 'default' :
                                item.status === 'processing' ? 'secondary' : 'outline'
                              }
                              className={
                                item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                item.status === 'processing' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                              }
                            >
                              {item.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                            <span>{item.items} items • {item.time}</span>
                            <span>{item.progress}%</span>
                          </div>
                          <Progress value={item.progress} className="h-2" />
                        </div>
                      ))}
                    </div>

                    {/* Quick Actions */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-all duration-200"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export Results
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-200"
                        >
                          <BarChart3 className="w-4 h-4 mr-2" />
                          View Analytics
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-all duration-200"
                        >
                          <Database className="w-4 h-4 mr-2" />
                          Manage Data
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </ModernCard>
            </div>
          </div>
        </TabsContent>
      </ModernTabs>
      </div>

      {/* New Site Dialog */}
      <Dialog open={showNewSiteDialog} onOpenChange={setShowNewSiteDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Add New Site</DialogTitle>
          </DialogHeader>
          <NewSiteForm onSubmit={createSite} onClose={() => setShowNewSiteDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Site Analyzer Modal */}
      <SiteAnalyzerModal
        isOpen={showAnalyzeModal}
        onClose={() => {
          setShowAnalyzeModal(false);
          setSelectedSiteForAnalysis(null);
        }}
        siteUrl={selectedSiteForAnalysis?.baseUrl || ''}
        siteName={selectedSiteForAnalysis?.name || ''}
      />
    </div>
  );
}

// New Site Form Component
function NewSiteForm({ onSubmit, onClose }: { onSubmit: (data: any) => void; onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    category: '',
    type: 'static',
    description: '',
    active: true,
    selectors: {
      title: 'h1, h2, h3',
      content: 'article, .content, .main',
      images: 'img',
      links: 'a'
    },
    config: {
      maxPages: 100,
      maxDepth: 3,
      domainsOnly: true,
      followExternal: false,
      delay: 1000,
      respectRobots: true
    }
  });

  const [activeStep, setActiveStep] = useState(0);
  const steps = [
    { title: 'Basic Info', description: 'Site name and URL' },
    { title: 'Selectors', description: 'Content extraction rules' },
    { title: 'Configuration', description: 'Scraping parameters' },
    { title: 'Review', description: 'Confirm settings' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const nextStep = () => {
    if (activeStep < steps.length - 1) {
      setActiveStep(activeStep + 1);
    }
  };

  const prevStep = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-6">
        {steps.map((step, index) => (
          <div key={step.title} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              index <= activeStep
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {index + 1}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${
                index <= activeStep ? 'text-blue-600' : 'text-gray-500'
              }`}>
                {step.title}
              </p>
              <p className="text-xs text-gray-500">{step.description}</p>
            </div>
            {index < steps.length - 1 && (
              <div className={`ml-4 w-16 h-0.5 ${
                index < activeStep ? 'bg-blue-600' : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {activeStep === 0 && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="site-name" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Site Name
            </Label>
            <Input
              id="site-name"
              placeholder="e.g., Tech News Portal"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <Label htmlFor="site-url" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Base URL
            </Label>
            <Input
              id="site-url"
              placeholder="https://example.com"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              required
              className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <Label htmlFor="site-category" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category
            </Label>
            <Input
              id="site-category"
              placeholder="e.g., news, e-commerce, blog"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>
      )}

      {activeStep === 1 && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="title-selector" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Title Selector
            </Label>
            <Input
              id="title-selector"
              placeholder="h1, h2, h3, .title, .post-title"
              value={formData.selectors.title}
              onChange={(e) => setFormData({
                ...formData,
                selectors: { ...formData.selectors, title: e.target.value }
              })}
              className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-500 mt-1">CSS selector for extracting titles</p>
          </div>

          <div>
            <Label htmlFor="content-selector" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Content Selector
            </Label>
            <Input
              id="content-selector"
              placeholder="article, .content, .main, .post-content"
              value={formData.selectors.content}
              onChange={(e) => setFormData({
                ...formData,
                selectors: { ...formData.selectors, content: e.target.value }
              })}
              className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-500 mt-1">CSS selector for extracting main content</p>
          </div>

          <div>
            <Label htmlFor="image-selector" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Images Selector
            </Label>
            <Input
              id="image-selector"
              placeholder="img, .image, .picture"
              value={formData.selectors.images}
              onChange={(e) => setFormData({
                ...formData,
                selectors: { ...formData.selectors, images: e.target.value }
              })}
              className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <Label htmlFor="links-selector" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Links Selector
            </Label>
            <Input
              id="links-selector"
              placeholder="a, .link, .nav"
              value={formData.selectors.links}
              onChange={(e) => setFormData({
                ...formData,
                selectors: { ...formData.selectors, links: e.target.value }
              })}
              className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>
      )}

      {activeStep === 2 && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="max-pages" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Pages
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.config.maxPages]}
                onValueChange={(value) => setFormData({
                  ...formData,
                  config: { ...formData.config, maxPages: value[0] }
                })}
                max={500}
                min={10}
                step={10}
                className="flex-1"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white w-12">
                {formData.config.maxPages}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Maximum number of pages to scrape</p>
          </div>

          <div>
            <Label htmlFor="max-depth" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Depth
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.config.maxDepth]}
                onValueChange={(value) => setFormData({
                  ...formData,
                  config: { ...formData.config, maxDepth: value[0] }
                })}
                max={5}
                min={1}
                step={1}
                className="flex-1"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white w-8">
                {formData.config.maxDepth}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">How many levels deep to crawl links</p>
          </div>

          <div>
            <Label htmlFor="delay" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Request Delay (ms)
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.config.delay]}
                onValueChange={(value) => setFormData({
                  ...formData,
                  config: { ...formData.config, delay: value[0] }
                })}
                max={5000}
                min={500}
                step={100}
                className="flex-1"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white w-16">
                {formData.config.delay}ms
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Delay between requests to avoid blocking</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="domains-only" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Domains Only
              </Label>
              <Switch
                id="domains-only"
                checked={formData.config.domainsOnly}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  config: { ...formData.config, domainsOnly: checked }
                })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="follow-external" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Follow External Links
              </Label>
              <Switch
                id="follow-external"
                checked={formData.config.followExternal}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  config: { ...formData.config, followExternal: checked }
                })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="respect-robots" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Respect robots.txt
              </Label>
              <Switch
                id="respect-robots"
                checked={formData.config.respectRobots}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  config: { ...formData.config, respectRobots: checked }
                })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          </div>
        </div>
      )}

      {activeStep === 3 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900 dark:text-white">Configuration Summary</h4>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Site Name:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{formData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">URL:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{formData.baseUrl}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Category:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{formData.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Max Pages:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{formData.config.maxPages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Max Depth:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{formData.config.maxDepth}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Delay:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{formData.config.delay}ms</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          {activeStep > 0 && (
            <Button type="button" variant="outline" onClick={prevStep}>
              Previous
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <div className="flex gap-2">
          {activeStep < steps.length - 1 ? (
            <Button type="button" onClick={nextStep}>
              Next
            </Button>
          ) : (
            <Button type="submit" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              Add Site
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

// New Project Form Component
function NewProjectForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    autoProcess: true,
    autoEmbeddings: true,
    realTime: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="project-name" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Project Name
          </Label>
          <Input
            id="project-name"
            placeholder="e.g., E-commerce Product Analysis"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div>
          <Label htmlFor="project-description" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </Label>
          <Textarea
            id="project-description"
            placeholder="Describe what this project will scrape and analyze..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors resize-none"
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="project-category" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Default Category
          </Label>
          <Input
            id="project-category"
            placeholder="e.g., products, articles, news"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Smart Features</h4>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <Label htmlFor="auto-process" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                  Auto-process with AI
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automatically analyze scraped content</p>
              </div>
            </div>
            <Switch
              id="auto-process"
              checked={formData.autoProcess}
              onCheckedChange={(checked) => setFormData({ ...formData, autoProcess: checked })}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <Label htmlFor="auto-embeddings" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                  Generate Embeddings
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Create semantic search vectors</p>
              </div>
            </div>
            <Switch
              id="auto-embeddings"
              checked={formData.autoEmbeddings}
              onCheckedChange={(checked) => setFormData({ ...formData, autoEmbeddings: checked })}
              className="data-[state=checked]:bg-purple-600"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <Activity className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <Label htmlFor="real-time" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                  Real-time Updates
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Live progress notifications</p>
              </div>
            </div>
            <Switch
              id="real-time"
              checked={formData.realTime}
              onCheckedChange={(checked) => setFormData({ ...formData, realTime: checked })}
              className="data-[state=checked]:bg-green-600"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.reload()}
          className="hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Project
        </Button>
      </div>
    </form>
  );
}