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
  Sparkles
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { EnhancedCard } from "@/components/ui/enhanced-card";
import { ProjectCardSkeleton, ConfigCardSkeleton, ProgressSkeleton, ResultsTableSkeleton } from "@/components/ui/skeleton-states";
import { AnimatedStats, CircularProgress } from "@/components/ui/animated-stats";
import { ModernTabs, ModernTabsList } from "@/components/ui/modern-tabs";
import { cn } from "@/lib/utils";
import "../styles/animations.css";
import { io } from 'socket.io-client';

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
  type: string;
  category: string;
  selectors: Record<string, any>;
  active: boolean;
}

interface ScrapingProgress {
  total: number;
  completed: number;
  current: string;
  items: number;
  time: string;
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
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("projects");
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Mount animation
  useEffect(() => {
    setMounted(true);
  }, []);

  // Socket.IO connection
  useEffect(() => {
    const socket = io('http://localhost:8083');

    socket.on('connect', () => {
      console.log('Connected to backend');
    });

    socket.on('scraping-progress', (data) => {
      setScrapingProgress(data);
    });

    socket.on('scraping-complete', (data) => {
      setIsScraping(false);
      setResults(data.results);
    });

    return () => socket.disconnect();
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
      const response = await fetch('http://localhost:8083/api/v2/scraper/projects');
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadSiteConfigs = async () => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/configs');
      const data = await response.json();
      if (data.success) {
        setSiteConfigs(data.configs);
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
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
      const response = await fetch('http://localhost:8083/api/v2/scraper/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject,
          category: selectedCategory,
          sites: selectedSites,
          options: {
            generateEmbeddings: true,
            processWithLLM: true,
            realTimeUpdates: true
          }
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to start scraping:', error);
      setIsScraping(false);
    }
  };

  const createProject = async (formData: any) => {
    try {
      const response = await fetch('http://localhost:8083/api/v2/scraper/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        setProjects([...projects, data.project]);
        setShowNewProjectDialog(false);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
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
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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
                <EnhancedCard
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
                </EnhancedCard>
              ))}
            </div>
          )}
        </TabsContent>

              {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Site Configurations</h2>
            <p className="text-gray-600 dark:text-gray-300">Manage scraping configurations for different websites</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Configurations List */}
            <div className="xl:col-span-1">
              <EnhancedCard variant="elevated" className="h-fit">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Available Configurations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoading ? (
                    [...Array(5)].map((_, i) => (
                      <ConfigCardSkeleton key={i} />
                    ))
                  ) : siteConfigs.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Settings className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">No configurations yet</p>
                      <Button variant="outline" className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Configuration
                      </Button>
                    </div>
                  ) : (
                    siteConfigs.map((config, index) => (
                      <div
                        key={config.id}
                        className={cn(
                          "p-4 rounded-lg border cursor-pointer transition-all duration-200 group",
                          "hover:shadow-md hover:-translate-y-0.5",
                          config.active
                            ? "border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20"
                            : "border-gray-200 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-600"
                        )}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                              {config.name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {config.type} • {config.category}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                config.active ? "bg-green-500" : "bg-gray-300"
                              )} />
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {config.active ? "Active" : "Inactive"}
                              </span>
                            </div>
                          </div>
                          <Switch
                            checked={config.active}
                            className="ml-2"
                            onCheckedChange={() => {
                              // Toggle active state
                              setSiteConfigs(prev => prev.map(c =>
                                c.id === config.id ? { ...c, active: !c.active } : c
                              ));
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}

                  <Button variant="outline" className="w-full mt-4 group hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-200">
                    <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
                    Add Configuration
                  </Button>
                </CardContent>
              </EnhancedCard>
            </div>

            {/* Configuration Editor */}
            <div className="xl:col-span-2">
              <EnhancedCard variant="glass" className="h-full">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Edit className="w-5 h-5" />
                    Configuration Editor
                  </CardTitle>
                  <CardDescription>
                    Select a configuration to edit its settings and scraping rules
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                    <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-200">
                      <Settings className="w-12 h-12 opacity-50 group-hover:opacity-70 transition-opacity" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No Configuration Selected
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                      Choose a configuration from the list to start editing its scraping parameters,
                      selectors, and advanced settings.
                    </p>
                  </div>
                </CardContent>
              </EnhancedCard>
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
          <EnhancedCard variant="gradient" className="overflow-hidden">
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
                  <div className="flex gap-2">
                    <Select>
                      <SelectTrigger className="flex-1 h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <SelectValue placeholder="Select sites to scrape..." />
                      </SelectTrigger>
                      <SelectContent>
                        {siteConfigs.map((config) => (
                          <SelectItem key={config.id} value={config.id}>
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4" />
                              {config.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 px-3 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="relative">
                <Button
                  onClick={startScraping}
                  disabled={isScraping || !selectedProject || selectedSites.length === 0}
                  className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  size="lg"
                >
                  {isScraping ? (
                    <>
                      <div className="relative">
                        <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                        <div className="absolute inset-0 w-6 h-6 mr-3 animate-ping bg-white rounded-full opacity-20" />
                      </div>
                      Scraping in Progress...
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <Zap className="w-6 h-6 mr-3" />
                        <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400" />
                      </div>
                      Start Intelligent Scraping
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </EnhancedCard>

          {/* Progress Visualization */}
          {scrapingProgress && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Live Progress</h3>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Active</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Progress Card */}
                <div className="lg:col-span-3">
                  <EnhancedCard variant="elevated">
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
                          value={(scrapingProgress.completed / scrapingProgress.total) * 100}
                          size={180}
                          strokeWidth={12}
                        />
                      </div>

                      {/* Linear Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                          <span>Overall Progress</span>
                          <span>{Math.round((scrapingProgress.completed / scrapingProgress.total) * 100)}%</span>
                        </div>
                        <Progress
                          value={(scrapingProgress.completed / scrapingProgress.total) * 100}
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
                    </CardContent>
                  </EnhancedCard>
                </div>

                {/* Stats Card */}
                <div className="lg:col-span-1">
                  <EnhancedCard variant="glass" className="h-fit">
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
                            {Math.round((scrapingProgress.completed / scrapingProgress.total) * 100)}%
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">Complete</div>
                        </div>
                      </div>
                    </CardContent>
                  </EnhancedCard>
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

              <EnhancedCard variant="glass">
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
              </EnhancedCard>
            </div>
          )}
        </TabsContent>

        {/* Processing Tab */}
        <TabsContent value="processing" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">AI Processing Center</h2>
            <p className="text-gray-600 dark:text-gray-300">Advanced content processing with AI and semantic analysis</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Processing Queue Stats */}
            <div className="xl:col-span-1">
              <EnhancedCard variant="elevated" className="h-fit">
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
                      <AnimatedStats value={0} label="" duration={800} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Processing</span>
                      <AnimatedStats value={0} label="" color="blue" duration={1000} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Completed</span>
                      <AnimatedStats value={0} label="" color="green" duration={1200} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Embeddings</span>
                      <AnimatedStats value={0} label="" color="purple" duration={1400} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-300 rounded-full" />
                        <span className="text-xs text-gray-500">No active processing</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        Last activity: Never
                      </div>
                    </div>
                  </div>
                </CardContent>
              </EnhancedCard>
            </div>

            {/* Processed Content */}
            <div className="xl:col-span-3">
              <EnhancedCard variant="glass" className="h-full min-h-[400px]">
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
                  <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                    <div className="w-32 h-32 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                      <Brain className="w-16 h-16 text-purple-600 dark:text-purple-400 opacity-60" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                      Ready for AI Processing
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 max-w-lg mx-auto mb-6">
                      Start scraping content to enable advanced AI processing, semantic analysis,
                      and intelligent embedding generation for enhanced search capabilities.
                    </p>
                    <div className="flex justify-center gap-3">
                      <Button
                        onClick={() => setActiveTab('scraping')}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all duration-200"
                      >
                        <Rocket className="w-4 h-4 mr-2" />
                        Start Scraping
                      </Button>
                      <Button variant="outline">
                        <Settings className="w-4 h-4 mr-2" />
                        Configure AI
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </EnhancedCard>
            </div>
          </div>
        </TabsContent>
      </ModernTabs>
      </div>
    </div>
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