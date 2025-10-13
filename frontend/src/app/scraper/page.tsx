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
  EyeOff
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

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

  // Load projects
  useEffect(() => {
    loadProjects();
    loadSiteConfigs();
  }, []);

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

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🚀 Advanced Scraper</h1>
        <p className="text-gray-600">Intelligent Web Scraping & Content Processing System</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configurations
          </TabsTrigger>
          <TabsTrigger value="scraping" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Scraping
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Processing
          </TabsTrigger>
        </TabsList>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Scraping Projects</h2>
            <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                <NewProjectForm onSubmit={createProject} />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card key={project.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                      {project.status}
                    </Badge>
                  </div>
                  <CardDescription>{project.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-green-600">{project.stats.sites}</p>
                      <p className="text-sm text-gray-500">Sites</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-600">{project.stats.items}</p>
                      <p className="text-sm text-gray-500">Items</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-600">{project.stats.processed}</p>
                      <p className="text-sm text-gray-500">Processed</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedProject(project.id);
                        setActiveTab('scraping');
                      }}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Run
                    </Button>
                    <Button variant="outline" size="sm">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Site Configurations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {siteConfigs.map((config) => (
                  <div
                    key={config.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      config.active ? 'border-green-500 bg-green-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{config.name}</p>
                        <p className="text-sm text-gray-500">{config.type}</p>
                      </div>
                      <Switch checked={config.active} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Configuration
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Configuration Editor</CardTitle>
                <CardDescription>Select a configuration to edit</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-20 text-gray-500">
                  <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select or create a configuration to edit</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Scraping Tab */}
        <TabsContent value="scraping" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scraping Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="project-select">Project</Label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="category-input">Category</Label>
                  <Input
                    id="category-input"
                    placeholder="e.g., pinokyo"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="sites-select">Target Sites</Label>
                  <div className="flex gap-2">
                    <Select>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select sites" />
                      </SelectTrigger>
                      <SelectContent>
                        {siteConfigs.map((config) => (
                          <SelectItem key={config.id} value={config.id}>
                            {config.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline">
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                onClick={startScraping}
                disabled={isScraping || !selectedProject || selectedSites.length === 0}
                className="w-full"
                size="lg"
              >
                {isScraping ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scraping in Progress...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Start Scraping
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Progress */}
          {scrapingProgress && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Scraping Progress</CardTitle>
                  <div className="flex gap-4 text-sm">
                    <span>{scrapingProgress.completed}/{scrapingProgress.total} sites</span>
                    <span>{scrapingProgress.items} items</span>
                    <span>{scrapingProgress.time}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={(scrapingProgress.completed / scrapingProgress.total) * 100} />
                <div className="text-center text-sm text-gray-600">
                  Currently: {scrapingProgress.current}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {results.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Scraped Data</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                    <Button>
                      <Brain className="w-4 h-4 mr-2" />
                      Process with LLM
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {results.map((item, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-2">{item.title}</h4>
                        <p className="text-sm text-gray-600 mb-2">{item.url}</p>
                        <p className="text-sm">{item.content?.substring(0, 200)}...</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Processing Tab */}
        <TabsContent value="processing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Processing Queue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Queue Length:</span>
                    <span className="font-bold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processing:</span>
                    <span className="font-bold text-blue-600">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed:</span>
                    <span className="font-bold text-green-600">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Embeddings:</span>
                    <span className="font-bold text-purple-600">0</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Processed Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-20 text-gray-500">
                  <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No processed content yet</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="project-name">Project Name</Label>
        <Input
          id="project-name"
          placeholder="e.g., Pinokyo Analysis"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="project-description">Description</Label>
        <Textarea
          id="project-description"
          placeholder="Project description..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="project-category">Default Category</Label>
        <Input
          id="project-category"
          placeholder="e.g., pinokyo"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Switch
            id="auto-process"
            checked={formData.autoProcess}
            onCheckedChange={(checked) => setFormData({ ...formData, autoProcess: checked })}
          />
          <Label htmlFor="auto-process">Auto-process with LLM</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="auto-embeddings"
            checked={formData.autoEmbeddings}
            onCheckedChange={(checked) => setFormData({ ...formData, autoEmbeddings: checked })}
          />
          <Label htmlFor="auto-embeddings">Generate embeddings</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="real-time"
            checked={formData.realTime}
            onCheckedChange={(checked) => setFormData({ ...formData, realTime: checked })}
          />
          <Label htmlFor="real-time">Real-time updates</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Cancel
        </Button>
        <Button type="submit">Create Project</Button>
      </div>
    </form>
  );
}