'use client';

import React, { useState, useEffect, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { Search, Plus, Globe, FileText, Layers, Clock, CheckCircle, XCircle, Loader2, RefreshCw, Sparkles, Brain, Target, Zap, Database, Link, Activity, ChevronRight, X, Play, Settings, Download, Eye, EyeOff, Tag, Package, ShoppingCart, Book, Image, Calendar, User, Mail, Phone, Building, MapPin, Hash, MoreVertical, Edit2, Trash2, Copy, ExternalLink, Filter, Grid, List, TrendingUp, Users, BarChart3 } from 'lucide-react';

// Types
interface WorkflowJob {
  id: string;
  type: 'concept_workflow' | 'category_scrape';
  concept?: string;
  categoryUrl?: string;
  projectId: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  results?: any;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface ScrapeProject {
  id: string;
  name: string;
  description?: string;
  category: string;
  siteIds: string[];
  createdAt: string;
}

interface SiteConfiguration {
  id: string;
  name: string;
  baseUrl: string;
  category: string;
  type: 'website' | 'ecommerce' | 'blog' | 'news' | 'api';
  isActive: boolean;
  scrapingConfig?: ScrapingConfig;
  structure?: SiteStructure;
  entityTypes?: EntityTypeConfig[];
  addedAt: string;
}

interface ScrapingConfig {
  version: string;
  detectedAt: string;
  routes: RouteInfo[];
  searchPatterns: string[];
  contentPatterns: string[];
  categoryPatterns: string[];
  contentSelectors: {
    title: string;
    content: string;
    date: string;
    author: string;
    navigation: string;
    price?: string;
    availability?: string;
    images?: string;
    description?: string;
  };
  pagination: {
    enabled: boolean;
    nextSelector: string;
    maxPages: number;
  };
  rateLimit: number;
  headers: Record<string, string>;
  ecommerce?: {
    productGrid: string;
    productCard: string;
    productName: string;
    productPrice: string;
    productImage: string;
    productLink: string;
    addToCart: string;
    inStock: string;
  };
}

interface SiteStructure {
  url: string;
  title: string;
  type: 'static' | 'dynamic' | 'hybrid';
  routes: RouteInfo[];
  contentSelectors: Record<string, string>;
  pagination: {
    hasNext: boolean;
    nextSelector?: string;
    pageCount?: number;
  };
  ecommerce: boolean;
  features: EcommerceFeatures;
}

interface RouteInfo {
  url: string;
  type: 'search' | 'category' | 'article' | 'content' | 'product' | 'api';
  pattern: string;
}

interface EcommerceFeatures {
  hasCart: boolean;
  hasCheckout: boolean;
  hasUserAccounts: boolean;
  hasReviews: boolean;
  hasWishlist: boolean;
  hasFilters: boolean;
  currency: string;
}

interface EntityTypeConfig {
  type: string;
  label: string;
  selector?: string;
  pattern?: string;
  enabled: boolean;
  category: 'product' | 'content' | 'user' | 'location' | 'contact';
}

interface SearchResults {
  url: string;
  title: string;
  relevanceScore: number;
  siteName: string;
  type: 'exact_match' | 'semantic_match';
  entities?: Record<string, any>[];
}

interface CategoryScrapingOptions {
  categoryUrl: string;
  maxProducts?: number;
  extractEntities?: boolean;
  followPagination?: boolean;
  downloadImages?: boolean;
}

// Circular Progress Component
const CircularProgress = ({
  value,
  size = 120,
  strokeWidth = 8,
  children,
  className = ''
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
  className?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-neutral-200 dark:text-neutral-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out text-neutral-600 dark:text-neutral-400"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// Main Component
export default function ScraperPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeView, setActiveView] = useState<'workflow' | 'sites' | 'search' | 'entities'>('workflow');

  // States
  const [projects, setProjects] = useState<ScrapeProject[]>([]);
  const [sites, setSites] = useState<SiteConfiguration[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowJob[]>([]);
  const [loading, setLoading] = useState(false);

  // Analyze states
  const [analyzingSite, setAnalyzingSite] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeResults, setAnalyzeResults] = useState<any>(null);
  const [selectedSiteForAnalysis, setSelectedSiteForAnalysis] = useState<string>('');

  // Configure states
  const [selectedSiteForConfig, setSelectedSiteForConfig] = useState<string>('');
  const [siteConfig, setSiteConfig] = useState<any>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Workflow states
  const [concept, setConcept] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [maxSearchResults, setMaxSearchResults] = useState(20);
  const [maxContentItems, setMaxContentItems] = useState(30);
  const [rewritePrompt, setRewritePrompt] = useState('');
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowJob | null>(null);

  // Site management states
  const [newSite, setNewSite] = useState({ name: '', baseUrl: '', category: '', type: 'website' as const });
  const [showAddSite, setShowAddSite] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SiteConfiguration | null>(null);
  const [showSiteConfig, setShowSiteConfig] = useState(false);
  const [siteView, setSiteView] = useState<'grid' | 'list'>('grid');

  // Category scraping states
  const [categoryOptions, setCategoryOptions] = useState<CategoryScrapingOptions>({
    categoryUrl: '',
    maxProducts: 100,
    extractEntities: true,
    followPagination: true,
    downloadImages: false
  });

  // Entity management states
  const [entityTypes, setEntityTypes] = useState<EntityTypeConfig[]>([
    { type: 'ISBN', label: 'ISBN Number', pattern: 'ISBN[:\\s]*978[-\\d\\s]{10,17}', enabled: true, category: 'product' },
    { type: 'PRODUCT_ID', label: 'Product ID', pattern: '\\b(?:SKU|ID)[\\s:]*([A-Z0-9-_]+)', enabled: true, category: 'product' },
    { type: 'PRICE', label: 'Price', pattern: '\\$\\d+(?:\\.\\d{2})?', enabled: true, category: 'product' },
    { type: 'EMAIL', label: 'Email', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', enabled: true, category: 'contact' },
    { type: 'PHONE', label: 'Phone', pattern: '\\(?\\d{3}\\)?[ -]?\\d{3}[ -]?\\d{4}', enabled: true, category: 'contact' },
    { type: 'IMAGE_URL', label: 'Image URL', pattern: 'https?://[^\\s]+\\.(jpg|jpeg|png|gif|webp|svg)', enabled: true, category: 'content' },
    { type: 'SOURCE_URL', label: 'Source URL', pattern: 'https?://[^\\s]+', enabled: true, category: 'content' },
  ]);

  // Entity UI states
  const [editingEntity, setEditingEntity] = useState<string | null>(null);
  const [newEntityForm, setNewEntityForm] = useState({
    name: '',
    pattern: '',
    category: 'content' as 'product' | 'content' | 'contact' | 'location'
  });
  const [selectedSiteForEntities, setSelectedSiteForEntities] = useState<string>('');

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults[]>([]);
  const [searchFilters, setSearchFilters] = useState({
    siteType: 'all',
    dateRange: 'all',
    hasEntities: false
  });

  // Embeddings states
  const [embeddings, setEmbeddings] = useState<any[]>([]);
  const [embeddingStats, setEmbeddingStats] = useState<any>(null);
  const [embeddingQuery, setEmbeddingQuery] = useState('');
  const [embeddingResults, setEmbeddingResults] = useState<any[]>([]);
  const [processingEmbeddings, setProcessingEmbeddings] = useState(false);

  // Initialize Socket.IO
  useEffect(() => {
    const newSocket = io('http://localhost:8083');
    setSocket(newSocket);

    newSocket.on('concept-workflow-complete', (data: any) => {
      if (data.jobId === currentWorkflow?.id) {
        setCurrentWorkflow(prev => prev ? { ...prev, ...data.results, status: 'completed' as const, progress: 100 } : null);
        fetchWorkflows();
      }
    });

    newSocket.on('category-scraping-progress', (data: any) => {
      if (data.jobId === currentWorkflow?.id) {
        setCurrentWorkflow(prev => prev ? { ...prev, progress: data.progress, currentStep: data.step } : null);
      }
    });

    newSocket.on('category-scraping-complete', (data: any) => {
      if (data.jobId === currentWorkflow?.id) {
        setCurrentWorkflow(prev => prev ? { ...prev, ...data.results, status: 'completed' as const, progress: 100 } : null);
        fetchWorkflows();
      }
    });

    newSocket.on('workflow-progress', (data: any) => {
      if (data.jobId === currentWorkflow?.id) {
        setCurrentWorkflow(prev => prev ? { ...prev, progress: data.progress, currentStep: data.step } : null);
      }
    });

    newSocket.on('concept-workflow-error', (data: any) => {
      if (data.jobId === currentWorkflow?.id) {
        setCurrentWorkflow(prev => prev ? { ...prev, status: 'failed' as const, error: data.error } : null);
      }
    });

    return () => newSocket.close();
  }, [currentWorkflow?.id]);

  // Fetch data
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8083/api/v2/scraper/projects');
      const data = await res.json();
      if (data.success) setProjects(data.projects);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  }, []);

  const fetchSites = useCallback(async (projectId?: string) => {
    try {
      const url = projectId
        ? `http://localhost:8083/api/v2/scraper/projects/${projectId}/sites`
        : 'http://localhost:8083/api/v2/scraper/sites';
      const res = await fetch(url);
      const data = await res.json();

      // Handle different response formats
      let sitesData = [];
      if (data.success) {
        if (Array.isArray(data.sites)) {
          sitesData = data.sites;
        } else if (Array.isArray(data)) {
          sitesData = data;
        }
      }

      // Transform data to match expected format
      const transformedSites = sitesData.map((item: any) => ({
        id: item.id || item.site_id,
        name: item.name,
        baseUrl: item.baseUrl || item.base_url,
        category: item.category,
        type: item.type,
        isActive: item.isActive !== false,
        scrapingConfig: item.scrapingConfig || item.scraping_config,
        structure: item.structure,
        entityTypes: item.entityTypes || item.entity_types,
        addedAt: item.addedAt || item.added_at
      }));

      setSites(transformedSites);
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8083/api/v2/scraper/workflows');
      const data = await res.json();
      if (data.success) setWorkflows(data.workflows || []);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchSites();
    fetchWorkflows();
  }, [fetchProjects, fetchSites, fetchWorkflows]);

  // Start concept workflow
  const startWorkflow = async () => {
    if (!concept || !selectedProject) return;

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8083/api/v2/scraper/concept-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept,
          projectId: selectedProject,
          maxSearchResults,
          maxContentItems,
          rewritePrompt: rewritePrompt || undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        setCurrentWorkflow({
          id: data.jobId,
          type: 'concept_workflow',
          concept,
          projectId: selectedProject,
          status: 'processing',
          progress: 0,
          currentStep: 'initializing',
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to start workflow:', error);
    } finally {
      setLoading(false);
    }
  };

  // Start category scraping
  const startCategoryScraping = async () => {
    if (!categoryOptions.categoryUrl || !selectedProject) return;

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8083/api/v2/scraper/category-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...categoryOptions,
          projectId: selectedProject
        })
      });

      const data = await res.json();
      if (data.success) {
        setCurrentWorkflow({
          id: data.jobId,
          type: 'category_scrape',
          categoryUrl: categoryOptions.categoryUrl,
          projectId: selectedProject,
          status: 'processing',
          progress: 0,
          currentStep: 'analyzing category',
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to start category scraping:', error);
    } finally {
      setLoading(false);
    }
  };

  // Add site to project with auto-analysis
  const addSite = async () => {
    if (!newSite.name || !newSite.baseUrl || !selectedProject) return;

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8083/api/v2/scraper/projects/${selectedProject}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newSite,
          autoDetect: true
        })
      });

      const data = await res.json();
      if (data.success) {
        setNewSite({ name: '', baseUrl: '', category: '', type: 'website' });
        setShowAddSite(false);
        fetchSites(selectedProject);
      }
    } catch (error) {
      console.error('Failed to add site:', error);
    } finally {
      setLoading(false);
    }
  };

  // Analyze site structure with progress
  const analyzeSite = async (siteId: string) => {
    if (!siteId) return;

    setAnalyzingSite(siteId);
    setAnalyzeProgress(0);
    setAnalyzeResults(null);

    try {
      // Simulate progress steps
      setAnalyzeProgress(10);

      const res = await fetch(`http://localhost:8083/api/v2/scraper/sites/${siteId}/analyze`, {
        method: 'POST'
      });

      setAnalyzeProgress(50);

      const data = await res.json();

      if (data.success) {
        setAnalyzeProgress(80);

        // Format results for display
        const formattedResults = {
          site: data.site,
          structure: data.structure,
          detectedSelectors: extractSelectorsFromStructure(data.structure),
          routes: data.structure?.routes || [],
          isEcommerce: data.structure?.ecommerce || false,
          features: data.structure?.features || {}
        };

        setAnalyzeResults(formattedResults);
        setAnalyzeProgress(100);

        // Update sites list
        fetchSites(selectedProject);

        // Auto-select for configuration
        if (data.site) {
          setSelectedSiteForConfig(siteId);
          setSiteConfig(data.site);
        }
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Failed to analyze site:', error);
      setAnalyzeResults({ error: error instanceof Error ? error.message : 'Analysis failed' });
    } finally {
      setTimeout(() => {
        setAnalyzingSite(null);
      }, 2000);
    }
  };

  // Helper to extract selectors from structure
  const extractSelectorsFromStructure = (structure: any) => {
    const selectors: any = {};

    if (structure?.contentSelectors) {
      selectors.content = structure.contentSelectors;
    }

    if (structure?.routes) {
      const routeTypes = [...new Set(structure.routes.map((r: any) => r.type))];
      selectors.routeTypes = routeTypes;
    }

    if (structure?.searchPatterns) {
      selectors.search = structure.searchPatterns.slice(0, 5);
    }

    return selectors;
  };

  // Update entity types for site
  const updateEntityTypes = async (siteId: string, entityTypes: EntityTypeConfig[]) => {
    try {
      const res = await fetch(`http://localhost:8083/api/v2/scraper/sites/${siteId}/entity-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityTypes })
      });
      const data = await res.json();
      if (data.success) {
        fetchSites(selectedProject);
      }
    } catch (error) {
      console.error('Failed to update entity types:', error);
    }
  };

  // Save site configuration inline
  const saveSiteConfiguration = async (siteId: string, config: any) => {
    if (!siteId) return;

    setSavingConfig(true);

    try {
      const res = await fetch(`http://localhost:8083/api/v2/scraper/sites/${siteId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();

      if (data.success) {
        // Update local state
        setSiteConfig(prev => ({ ...prev, ...config }));
        // Refresh sites list
        fetchSites(selectedProject);

        // Show success feedback
        const successMsg = document.createElement('div');
        successMsg.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        successMsg.textContent = 'Configuration saved successfully!';
        document.body.appendChild(successMsg);
        setTimeout(() => successMsg.remove(), 3000);
      } else {
        throw new Error(data.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save site configuration:', error);
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      errorMsg.textContent = error instanceof Error ? error.message : 'Failed to save configuration';
      document.body.appendChild(errorMsg);
      setTimeout(() => errorMsg.remove(), 3000);
    } finally {
      setSavingConfig(false);
    }
  };

  // Entity management functions
  const toggleEntity = (entityType: string) => {
    const updated = entityTypes.map(e =>
      e.type === entityType ? { ...e, enabled: !e.enabled } : e
    );
    setEntityTypes(updated);

    // Auto-save to selected site
    if (selectedSiteForEntities) {
      updateEntityTypes(selectedSiteForEntities, updated);
    }
  };

  const updateEntityPattern = (entityType: string, pattern: string) => {
    const updated = entityTypes.map(e =>
      e.type === entityType ? { ...e, pattern } : e
    );
    setEntityTypes(updated);
  };

  const saveEntityChanges = (entityType: string) => {
    setEditingEntity(null);

    // Save to backend if site is selected
    if (selectedSiteForEntities) {
      updateEntityTypes(selectedSiteForEntities, entityTypes);
    }
  };

  const deleteEntity = (entityType: string) => {
    const updated = entityTypes.filter(e => e.type !== entityType);
    setEntityTypes(updated);

    // Save to backend if site is selected
    if (selectedSiteForEntities) {
      updateEntityTypes(selectedSiteForEntities, updated);
    }
  };

  const addNewEntity = () => {
    if (!newEntityForm.name || !newEntityForm.pattern) return;

    const newEntity: EntityTypeConfig = {
      type: newEntityForm.name.toUpperCase().replace(/\s+/g, '_'),
      label: newEntityForm.name,
      pattern: newEntityForm.pattern,
      enabled: true,
      category: newEntityForm.category
    };

    const updated = [...entityTypes, newEntity];
    setEntityTypes(updated);

    // Reset form
    setNewEntityForm({ name: '', pattern: '', category: 'content' });

    // Save to backend if site is selected
    if (selectedSiteForEntities) {
      updateEntityTypes(selectedSiteForEntities, updated);
    }
  };

  // Semantic search
  const performSearch = async () => {
    if (!searchQuery || !selectedProject) return;

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8083/api/v2/scraper/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          projectIds: [selectedProject],
          maxResultsPerSite: 5,
          deepSearch: true,
          filters: searchFilters
        })
      });

      const data = await res.json();
      if (data.success || data.results) {
        setSearchResults(data.results || []);
      } else {
        // Fallback to simple search if semantic search fails
        console.log('Semantic search not available, trying basic search...');
        const sitesRes = await fetch(`http://localhost:8083/api/v2/scraper/sites`);
        const sitesData = await sitesRes.json();

        if (sitesData.success && sitesData.sites) {
          const mockResults = sitesData.sites
            .filter((site: any) => site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 site.category.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((site: any) => ({
              url: site.baseUrl,
              title: site.name,
              relevanceScore: 0.8,
              siteName: site.name,
              type: 'exact_match' as const
            }));
          setSearchResults(mockResults);
        }
      }
    } catch (error) {
      console.error('Failed to perform search:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light text-neutral-900 dark:text-neutral-100 mb-2">
              Intelligent Scraper
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Semantic content discovery and extraction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            </button>
          </div>
        </div>
      </div>

      {/* View Switcher */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-lg w-fit">
          <button
            onClick={() => setActiveView('workflow')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'workflow'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Brain className="w-4 h-4 inline mr-2" />
            Workflow
          </button>
          <button
            onClick={() => setActiveView('sites')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'sites'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Globe className="w-4 h-4 inline mr-2" />
            Sites
          </button>
          <button
            onClick={() => setActiveView('search')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'search'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Search className="w-4 h-4 inline mr-2" />
            Search
          </button>
          <button
            onClick={() => setActiveView('entities')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'entities'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Tag className="w-4 h-4 inline mr-2" />
            Entities
          </button>
          <button
            onClick={() => setActiveView('embeddings')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'embeddings'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Layers className="w-4 h-4 inline mr-2" />
            Embeddings
          </button>
        </div>
      </div>

      {/* Workflow View */}
      {activeView === 'workflow' && (
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Concept Analysis */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 mb-6">
                Concept Analysis
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Concept
                  </label>
                  <input
                    type="text"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="e.g., Pinokyo, artificial intelligence, climate change"
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Project
                  </label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 focus:border-transparent transition-all"
                  >
                    <option value="">Select a project</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={startWorkflow}
                  disabled={!concept || !selectedProject || loading || currentWorkflow?.status === 'processing'}
                  className="w-full py-3 px-4 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  Start Concept Analysis
                </button>
              </div>
            </div>

            {/* Category Scraping */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 mb-6">
                Category Scraping
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Category URL
                  </label>
                  <input
                    type="url"
                    value={categoryOptions.categoryUrl}
                    onChange={(e) => setCategoryOptions({ ...categoryOptions, categoryUrl: e.target.value })}
                    placeholder="https://example.com/category/products"
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 focus:border-transparent transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Max Products
                    </label>
                    <input
                      type="number"
                      value={categoryOptions.maxProducts}
                      onChange={(e) => setCategoryOptions({ ...categoryOptions, maxProducts: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={categoryOptions.extractEntities}
                        onChange={(e) => setCategoryOptions({ ...categoryOptions, extractEntities: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Extract Entities</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={categoryOptions.followPagination}
                        onChange={(e) => setCategoryOptions({ ...categoryOptions, followPagination: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Follow Pages</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={startCategoryScraping}
                  disabled={!categoryOptions.categoryUrl || !selectedProject || loading || currentWorkflow?.status === 'processing'}
                  className="w-full py-3 px-4 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Package className="w-5 h-5" />
                  )}
                  Start Category Scraping
                </button>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          {currentWorkflow && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 mb-6">
                Workflow Progress
              </h2>

              <div className="flex flex-col items-center justify-center py-8">
                <CircularProgress value={currentWorkflow.progress} size={200}>
                  <div className="text-center">
                    <div className="text-3xl font-light text-neutral-900 dark:text-neutral-100">
                      {currentWorkflow.progress}%
                    </div>
                    <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      {currentWorkflow.currentStep}
                    </div>
                  </div>
                </CircularProgress>

                <div className="mt-8 w-full max-w-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {currentWorkflow.concept || currentWorkflow.categoryUrl}
                    </span>
                    {currentWorkflow.status === 'processing' && (
                      <Loader2 className="w-4 h-4 text-neutral-600 dark:text-neutral-400 animate-spin" />
                    )}
                    {currentWorkflow.status === 'completed' && (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                    {currentWorkflow.status === 'failed' && (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                  </div>

                  {currentWorkflow.error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">{currentWorkflow.error}</p>
                    </div>
                  )}

                  {currentWorkflow.results && (
                    <div className="mt-6 grid grid-cols-4 gap-3">
                      <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                        <div className="text-lg font-light text-neutral-700 dark:text-neutral-300">
                          {currentWorkflow.results.searchResults || 0}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Search Results</div>
                      </div>
                      <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                        <div className="text-lg font-light text-neutral-700 dark:text-neutral-300">
                          {currentWorkflow.results.scrapedContent || 0}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Scraped</div>
                      </div>
                      <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                        <div className="text-lg font-light text-neutral-700 dark:text-neutral-300">
                          {currentWorkflow.results.entitiesExtracted || 0}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Entities</div>
                      </div>
                      <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                        <div className="text-lg font-light text-neutral-700 dark:text-neutral-300">
                          {currentWorkflow.results.processedContent?.sources?.length || 0}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Sources</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sites View */}
      {activeView === 'sites' && (
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Analyze & Configure */}
            <div className="lg:col-span-1 space-y-6">
              {/* Analyze Card */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-light text-neutral-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                  Site Analysis
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Select Site to Analyze
                    </label>
                    <select
                      value={selectedSiteForAnalysis}
                      onChange={(e) => setSelectedSiteForAnalysis(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                    >
                      <option value="">Choose a site...</option>
                      {sites.map(site => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => analyzeSite(selectedSiteForAnalysis)}
                    disabled={!selectedSiteForAnalysis || analyzingSite !== null}
                    className="w-full py-2 px-4 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {analyzingSite ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing... {analyzeProgress}%
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Analyze Site
                      </>
                    )}
                  </button>

                  {/* Progress Bar */}
                  {analyzingSite && (
                    <div className="space-y-2">
                      <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${analyzeProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        {analyzeProgress < 30 && 'Connecting to site...'}
                        {analyzeProgress >= 30 && analyzeProgress < 60 && 'Analyzing structure...'}
                        {analyzeProgress >= 60 && analyzeProgress < 90 && 'Detecting selectors...'}
                        {analyzeProgress >= 90 && 'Processing results...'}
                      </p>
                    </div>
                  )}

                  {/* Analysis Results */}
                  {analyzeResults && !analyzeResults.error && (
                    <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg space-y-3">
                      <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        Analysis Results
                      </h4>

                      {/* Site Type */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">Site Type:</span>
                        <span className="text-xs font-medium">
                          {analyzeResults.isEcommerce ? (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                              E-commerce
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                              Standard Website
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Detected Routes */}
                      <div>
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">Detected Routes:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analyzeResults.detectedSelectors.routeTypes?.map((type: string) => (
                            <span key={type} className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs">
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Content Selectors */}
                      {analyzeResults.detectedSelectors.content && (
                        <div>
                          <span className="text-xs text-neutral-600 dark:text-neutral-400">Content Selectors:</span>
                          <div className="mt-1 space-y-1">
                            {Object.entries(analyzeResults.detectedSelectors.content).slice(0, 3).map(([key, value]: [string, any]) => (
                              <div key={key} className="text-xs">
                                <span className="text-neutral-500 dark:text-neutral-500">{key}:</span>
                                <code className="ml-1 text-neutral-700 dark:text-neutral-300">{value}</code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                        <button
                          onClick={() => {
                            setSelectedSiteForConfig(selectedSiteForAnalysis);
                            setSiteConfig(analyzeResults.site);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Use these selectors for configuration →
                        </button>
                      </div>
                    </div>
                  )}

                  {analyzeResults?.error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-xs text-red-600 dark:text-red-400">{analyzeResults.error}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Configure Card */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-light text-neutral-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                  Configuration
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Select Site to Configure
                    </label>
                    <select
                      value={selectedSiteForConfig}
                      onChange={(e) => {
                        setSelectedSiteForConfig(e.target.value);
                        const site = sites.find(s => s.id === e.target.value);
                        setSiteConfig(site);
                      }}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                    >
                      <option value="">Choose a site...</option>
                      {sites.map(site => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedSiteForConfig && (
                    <div className="space-y-3">
                      {/* Title Selector */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Title Selector
                        </label>
                        <input
                          type="text"
                          id="title-selector"
                          defaultValue={siteConfig?.scrapingConfig?.contentSelectors?.title || ''}
                          placeholder="h1, .title, .page-title"
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        />
                      </div>

                      {/* Content Selector */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Content Selector
                        </label>
                        <input
                          type="text"
                          id="content-selector"
                          defaultValue={siteConfig?.scrapingConfig?.contentSelectors?.content || ''}
                          placeholder="main, article, .content"
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        />
                      </div>

                      {/* Price Selector */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Price Selector (E-commerce)
                        </label>
                        <input
                          type="text"
                          id="price-selector"
                          defaultValue={siteConfig?.scrapingConfig?.ecommerce?.productPrice || ''}
                          placeholder=".price, .product-price"
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        />
                      </div>

                      {/* Image Selector */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Image Selector
                        </label>
                        <input
                          type="text"
                          id="image-selector"
                          defaultValue={siteConfig?.scrapingConfig?.ecommerce?.productImage || ''}
                          placeholder=".product-image img"
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        />
                      </div>

                      {/* Save Button */}
                      <button
                        onClick={() => {
                          const config = {
                            contentSelectors: {
                              title: (document.getElementById('title-selector') as HTMLInputElement)?.value,
                              content: (document.getElementById('content-selector') as HTMLInputElement)?.value,
                              author: siteConfig?.scrapingConfig?.contentSelectors?.author,
                              date: siteConfig?.scrapingConfig?.contentSelectors?.date
                            },
                            ecommerce: {
                              productPrice: (document.getElementById('price-selector') as HTMLInputElement)?.value,
                              productImage: (document.getElementById('image-selector') as HTMLInputElement)?.value
                            }
                          };

                          saveSiteConfiguration(selectedSiteForConfig, config);
                        }}
                        disabled={savingConfig}
                        className="w-full py-2 px-4 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {savingConfig ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Save Configuration
                          </>
                        )}
                      </button>

                      {siteConfig?.scrapingConfig?.configuredAt && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
                          Last configured: {new Date(siteConfig.scrapingConfig.configuredAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Sites List */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100">
                    Sites ({sites.length})
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
                      <button
                        onClick={() => setSiteView('grid')}
                        className={`p-2 rounded ${siteView === 'grid' ? 'bg-white dark:bg-neutral-700' : ''}`}
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSiteView('list')}
                        className={`p-2 rounded ${siteView === 'list' ? 'bg-white dark:bg-neutral-700' : ''}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setShowAddSite(true)}
                      className="px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Site
                    </button>
                  </div>
                </div>

                {/* Sites Grid/List */}
                <div className={siteView === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>
                  {sites.map(site => (
                    <div
                      key={site.id}
                      className={`bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 transition-all ${
                        siteView === 'list' ? 'p-4' : 'p-6'
                      }`}
                    >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        site.type === 'ecommerce'
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-neutral-100 dark:bg-neutral-700/30'
                      }`}>
                        {site.type === 'ecommerce' ? (
                          <ShoppingCart className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <Globe className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                          {site.name}
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {site.category} • {site.type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${site.isActive ? 'bg-green-500' : 'bg-neutral-400'}`} />
                      <button
                        onClick={() => setSelectedSite(site)}
                        className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
                      >
                        <MoreVertical className="w-4 h-4 text-neutral-500" />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 truncate">
                    {site.baseUrl}
                  </p>

                  {site.structure && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                        <Activity className="w-3 h-3" />
                        <span>Detected: {site.structure.routes?.length || 0} routes</span>
                        {site.structure.ecommerce && (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                            E-commerce
                          </span>
                        )}
                      </div>

                      {/* Show detected routes preview */}
                      {site.structure.routes && site.structure.routes.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Route Types:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {Array.from(new Set(site.structure.routes.map(r => r.type))).map(type => (
                              <span key={type} className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs">
                                {type} ({site.structure.routes.filter(r => r.type === type).length})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Show content selectors preview */}
                      {site.structure.contentSelectors && Object.keys(site.structure.contentSelectors).length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                            Content Selectors:
                          </div>
                          <div className="space-y-1">
                            {Object.entries(site.structure.contentSelectors).slice(0, 3).map(([key, selector]) => (
                              <div key={key} className="text-xs">
                                <span className="text-neutral-500 dark:text-neutral-500">{key}:</span>
                                <code className="ml-1 text-neutral-700 dark:text-neutral-300">{selector}</code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${
                      site.scrapingConfig ? 'text-green-600 dark:text-green-400' : 'text-neutral-500 dark:text-neutral-400'
                    }`}>
                      {site.scrapingConfig ? 'Configured' : 'Not configured'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => analyzeSite(site.id)}
                        className="text-xs text-neutral-700 dark:text-neutral-300 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Analyze
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSite(site);
                          setShowSiteConfig(true);
                        }}
                        className="text-xs text-neutral-700 dark:text-neutral-300 hover:underline flex items-center gap-1"
                      >
                        <Settings className="w-3 h-3" />
                        Configure
                      </button>
                    </div>
                  </div>
                </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search View */}
      {activeView === 'search' && (
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 mb-6">
              Semantic Search
            </h2>

            <div className="flex gap-4 mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across your sites..."
                className="flex-1 px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600 focus:border-transparent"
              />
              <button
                onClick={performSearch}
                disabled={!searchQuery || !selectedProject || loading}
                className="px-6 py-3 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Search
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-8">
              <select
                value={searchFilters.siteType}
                onChange={(e) => setSearchFilters({ ...searchFilters, siteType: e.target.value })}
                className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
              >
                <option value="all">All Sites</option>
                <option value="ecommerce">E-commerce</option>
                <option value="blog">Blogs</option>
                <option value="news">News</option>
              </select>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={searchFilters.hasEntities}
                  onChange={(e) => setSearchFilters({ ...searchFilters, hasEntities: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Has Entities</span>
              </label>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Found {searchResults.length} results
                </h3>
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-1">
                          {result.title}
                        </h4>
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-neutral-700 dark:text-neutral-300 hover:underline flex items-center gap-1 mb-2"
                        >
                          <Link className="w-3 h-3" />
                          {result.url}
                        </a>
                        <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                          <span>{result.siteName}</span>
                          <span>Relevance: {Math.round(result.relevanceScore * 100)}%</span>
                          <span className={`px-2 py-1 rounded-full ${
                            result.type === 'exact_match'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                              : 'bg-neutral-100 dark:bg-neutral-700/30 text-neutral-600 dark:text-neutral-400'
                          }`}>
                            {result.type}
                          </span>
                        </div>
                        {result.entities && result.entities.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.entities.map((entity, idx) => (
                              <span key={idx} className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs">
                                {entity.type}: {entity.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Entities View - Redesigned */}
      {activeView === 'entities' && (
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 mb-2">
                  Entity Templates
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Configure entities to extract from scraped content. These are regex patterns that will be applied to all content.
                </p>
              </div>

              {/* Site Selector */}
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Apply to Site
                  </label>
                  <select
                    value={selectedSiteForEntities}
                    onChange={(e) => setSelectedSiteForEntities(e.target.value)}
                    className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                  >
                    <option value="">Global (all sites)</option>
                    {sites.map(site => (
                      <option key={site.id} value={site.id}>{site.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Entity Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {entityTypes.map(entity => (
                <div
                  key={entity.type}
                  className={`relative bg-neutral-50 dark:bg-neutral-800 rounded-xl border-2 transition-all ${
                    entity.enabled
                      ? 'border-blue-200 dark:border-blue-800 shadow-sm'
                      : 'border-neutral-200 dark:border-neutral-700 opacity-60'
                  }`}
                >
                  {/* Header */}
                  <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={entity.enabled}
                            onChange={() => toggleEntity(entity.type)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                            {entity.label}
                          </h3>
                        </div>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                          entity.category === 'product'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : entity.category === 'contact'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : entity.category === 'location'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                        }`}>
                          {entity.category}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteEntity(entity.type)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>

                  {/* Pattern */}
                  <div className="p-4">
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Regex Pattern
                    </label>
                    {editingEntity === entity.type ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={entity.pattern}
                          onChange={(e) => updateEntityPattern(entity.type, e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm font-mono"
                          placeholder="Enter regex pattern..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEntityChanges(entity.type)}
                            className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingEntity(null)}
                            className="flex-1 px-3 py-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-sm rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group relative">
                        <code className="block w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded-lg text-xs font-mono break-all">
                          {entity.pattern || 'No pattern set'}
                        </code>
                        <button
                          onClick={() => setEditingEntity(entity.type)}
                          className="absolute top-2 right-2 p-1 bg-neutral-200 dark:bg-neutral-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Example */}
                  <div className="px-4 pb-4">
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Example Matches
                    </label>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      {entity.type === 'ISBN' && 'ISBN:978-0-123456-78-9'}
                      {entity.type === 'PRODUCT_ID' && 'SKU: ABC-123'}
                      {entity.type === 'PRICE' && '$19.99'}
                      {entity.type === 'EMAIL' && 'user@example.com'}
                      {entity.type === 'PHONE' && '(555) 123-4567'}
                      {entity.type === 'IMAGE_URL' && 'https://example.com/image.jpg'}
                      {entity.type === 'SOURCE_URL' && 'https://example.com/article'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Entity Template */}
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-8">
              <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-4">
                Create New Entity Template
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Entity Name
                  </label>
                  <input
                    type="text"
                    value={newEntityForm.name}
                    onChange={(e) => setNewEntityForm({ ...newEntityForm, name: e.target.value })}
                    placeholder="e.g., Product Code"
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Regex Pattern
                  </label>
                  <input
                    type="text"
                    value={newEntityForm.pattern}
                    onChange={(e) => setNewEntityForm({ ...newEntityForm, pattern: e.target.value })}
                    placeholder="e.g., CODE-[A-Z0-9]+"
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newEntityForm.category}
                    onChange={(e) => setNewEntityForm({ ...newEntityForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                  >
                    <option value="product">Product</option>
                    <option value="content">Content</option>
                    <option value="contact">Contact</option>
                    <option value="location">Location</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={addNewEntity}
                    disabled={!newEntityForm.name || !newEntityForm.pattern}
                    className="w-full py-2 px-4 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Template
                  </button>
                </div>
              </div>

              {/* Quick Templates */}
              <div className="mt-6">
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                  Quick Templates - Click to add
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setNewEntityForm({
                      name: 'Address',
                      pattern: '\\d+\\s+\\w+\\s+(?:Street|St|Avenue|Ave|Road|Rd)',
                      category: 'location'
                    })}
                    className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-xs transition-colors"
                  >
                    📍 Address
                  </button>
                  <button
                    onClick={() => setNewEntityForm({
                      name: 'Date',
                      pattern: '\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}',
                      category: 'content'
                    })}
                    className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-xs transition-colors"
                  >
                    📅 Date
                  </button>
                  <button
                    onClick={() => setNewEntityForm({
                      name: 'Currency',
                      pattern: '[€£¥$]\\s*\\d+(?:\\.\\d{2})?',
                      category: 'product'
                    })}
                    className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-xs transition-colors"
                  >
                    💰 Currency
                  </button>
                  <button
                    onClick={() => setNewEntityForm({
                      name: 'Hashtag',
                      pattern: '#\\w+',
                      category: 'content'
                    })}
                    className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-xs transition-colors"
                  >
                    # Hashtag
                  </button>
                  <button
                    onClick={() => setNewEntityForm({
                      name: 'Social Handle',
                      pattern: '@\\w+',
                      category: 'contact'
                    })}
                    className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-xs transition-colors"
                  >
                    @ Handle
                  </button>
                </div>
              </div>
            </div>

            {/* Status Message */}
            {selectedSiteForEntities && (
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  ℹ️ Entity configurations are being applied to: <strong>{sites.find(s => s.id === selectedSiteForEntities)?.name}</strong>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Site Modal */}
      {showAddSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-light text-neutral-900 dark:text-neutral-100">
                Add New Site
              </h3>
              <button
                onClick={() => setShowAddSite(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Site Name
                </label>
                <input
                  type="text"
                  value={newSite.name}
                  onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                  placeholder="e.g., Kitapyurdu"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  value={newSite.baseUrl}
                  onChange={(e) => setNewSite({ ...newSite, baseUrl: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={newSite.category}
                  onChange={(e) => setNewSite({ ...newSite, category: e.target.value })}
                  placeholder="e.g., bookstore, news, blog"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Site Type
                </label>
                <select
                  value={newSite.type}
                  onChange={(e) => setNewSite({ ...newSite, type: e.target.value as any })}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                >
                  <option value="website">Website</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="blog">Blog</option>
                  <option value="news">News</option>
                  <option value="api">API</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoAnalyze"
                  defaultChecked={true}
                  className="mr-2"
                />
                <label htmlFor="autoAnalyze" className="text-sm text-neutral-700 dark:text-neutral-300">
                  Auto-analyze site structure
                </label>
              </div>
              <button
                onClick={addSite}
                disabled={!newSite.name || !newSite.baseUrl || !selectedProject}
                className="w-full py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
              >
                Add Site
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Site Configuration Modal */}
      {showSiteConfig && selectedSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-light text-neutral-900 dark:text-neutral-100">
                Configure: {selectedSite.name}
              </h3>
              <button
                onClick={() => setShowSiteConfig(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {selectedSite.scrapingConfig && (
              <div className="space-y-6">
                {/* Tabs for different configuration sections */}
                <div className="border-b border-neutral-200 dark:border-neutral-700">
                  <nav className="flex space-x-8">
                    <button className="py-2 px-1 border-b-2 border-neutral-900 dark:border-neutral-100 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      Content Selectors
                    </button>
                    <button className="py-2 px-1 border-b-2 border-transparent text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                      URL Patterns
                    </button>
                    <button className="py-2 px-1 border-b-2 border-transparent text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                      Scraping Mode
                    </button>
                    <button className="py-2 px-1 border-b-2 border-transparent text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                      Advanced
                    </button>
                  </nav>
                </div>

                {/* Content Selectors Section */}
                <div>
                  <h4 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-3">
                    Content Selectors
                  </h4>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Title Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.contentSelectors?.title}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        placeholder="h1, .title, .page-title"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Content Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.contentSelectors?.content}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        placeholder="main, article, .content"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Price Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.ecommerce?.productPrice}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        placeholder=".price, .product-price"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Image Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.ecommerce?.productImage}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        placeholder=".product-image img"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Author Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.contentSelectors?.author}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        placeholder=".author, .byline"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Date Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.contentSelectors?.date}
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        placeholder="time[datetime], .date"
                      />
                    </div>
                  </div>

                  {/* Custom Selectors */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Custom Selectors (Priority)
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Add priority selector (e.g., .main-content)"
                        className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Site Structure Analysis Results */}
                {selectedSite.structure && (
                  <div>
                    <h4 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-3">
                      Site Structure Analysis
                    </h4>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Route Types */}
                      <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
                        <h5 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                          Detected Routes
                        </h5>
                        {selectedSite.structure.routes && (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {selectedSite.structure.routes.slice(0, 10).map((route: any, idx: number) => (
                              <div key={idx} className="text-xs">
                                <span className={`inline-block px-2 py-1 rounded text-white ${
                                  route.type === 'search' ? 'bg-blue-500' :
                                  route.type === 'category' ? 'bg-green-500' :
                                  route.type === 'article' ? 'bg-purple-500' :
                                  route.type === 'api' ? 'bg-orange-500' :
                                  'bg-neutral-500'
                                }`}>
                                  {route.type}
                                </span>
                                <a href={route.url} target="_blank" className="ml-2 text-neutral-600 dark:text-neutral-400 hover:underline">
                                  {route.title}
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Search Patterns */}
                      {selectedSite.structure.searchPatterns && selectedSite.structure.searchPatterns.length > 0 && (
                        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
                          <h5 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                            Search Patterns
                          </h5>
                          <div className="space-y-1">
                            {selectedSite.structure.searchPatterns.map((pattern: string, idx: number) => (
                              <div key={idx} className="text-xs font-mono text-neutral-600 dark:text-neutral-400 break-all">
                                {pattern}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Detected Patterns */}
                {selectedSite.scrapingConfig.contentPatterns && selectedSite.scrapingConfig.contentPatterns.length > 0 && (
                  <div>
                    <h4 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-3">
                      URL Patterns
                    </h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {selectedSite.scrapingConfig.contentPatterns.map((pattern: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <code className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-sm font-mono">
                            {pattern}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pagination Configuration */}
                {selectedSite.scrapingConfig.pagination && (
                  <div>
                    <h4 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-3">
                      Pagination Configuration
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Next Page Selector
                        </label>
                        <input
                          type="text"
                          defaultValue={selectedSite.scrapingConfig.pagination.nextSelector}
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                          placeholder=".next, .pagination-next"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Max Pages
                        </label>
                        <input
                          type="number"
                          defaultValue={selectedSite.scrapingConfig.pagination.maxPages}
                          className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                  <button
                    onClick={() => setShowSiteConfig(false)}
                    className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-200"
                    onClick={() => {
                      // Collect configuration from form inputs
                      const configInputs = document.querySelectorAll('input[type="text"], input[type="number"]');
                      const config: any = {
                        contentSelectors: {
                          title: (configInputs[0] as HTMLInputElement)?.value || selectedSite.scrapingConfig?.contentSelectors?.title,
                          content: (configInputs[1] as HTMLInputElement)?.value || selectedSite.scrapingConfig?.contentSelectors?.content,
                          price: (configInputs[2] as HTMLInputElement)?.value || selectedSite.scrapingConfig?.ecommerce?.productPrice,
                          images: (configInputs[3] as HTMLInputElement)?.value || selectedSite.scrapingConfig?.ecommerce?.productImage,
                          author: (configInputs[4] as HTMLInputElement)?.value || selectedSite.scrapingConfig?.contentSelectors?.author,
                          date: (configInputs[5] as HTMLInputElement)?.value || selectedSite.scrapingConfig?.contentSelectors?.date,
                        },
                        pagination: {
                          nextSelector: (configInputs[6] as HTMLInputElement)?.value || selectedSite.scrapingConfig?.pagination?.nextSelector,
                          maxPages: parseInt((configInputs[7] as HTMLInputElement)?.value) || selectedSite.scrapingConfig?.pagination?.maxPages || 10,
                          enabled: true
                        },
                        rateLimit: 10,
                        headers: {
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                      };

                      saveSiteConfiguration(selectedSite.id, config);
                    }}
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
