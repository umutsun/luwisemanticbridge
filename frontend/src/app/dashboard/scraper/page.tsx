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
          className="text-gray-200 dark:text-gray-700"
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
          className="transition-all duration-500 ease-out text-amber-500 dark:text-cyan-400"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
};

// Main Component
export default function ScraperPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeView, setActiveView] = useState<'workflow' | 'sites' | 'search' | 'entities'>('workflow');

  // States
  const [projects, setProjects] = useState<ScrapeProject[]>([]);
  const [sites, setSites] = useState<SiteConfiguration[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowJob[]>([]);
  const [loading, setLoading] = useState(false);

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

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults[]>([]);
  const [searchFilters, setSearchFilters] = useState({
    siteType: 'all',
    dateRange: 'all',
    hasEntities: false
  });

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
      if (data.success) setSites(data.sites || data);
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

  // Analyze site structure
  const analyzeSite = async (siteId: string) => {
    try {
      const res = await fetch(`http://localhost:8083/api/v2/scraper/sites/${siteId}/analyze`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        fetchSites(selectedProject);
        setSelectedSite(data.site);
      }
    } catch (error) {
      console.error('Failed to analyze site:', error);
    }
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
          filters: searchFilters
        })
      });

      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error('Failed to perform search:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light text-gray-900 dark:text-gray-100 mb-2">
              Intelligent Scraper
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Semantic content discovery and extraction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* View Switcher */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg w-fit">
          <button
            onClick={() => setActiveView('workflow')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'workflow'
                ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-cyan-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <Brain className="w-4 h-4 inline mr-2" />
            Workflow
          </button>
          <button
            onClick={() => setActiveView('sites')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'sites'
                ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-cyan-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <Globe className="w-4 h-4 inline mr-2" />
            Sites
          </button>
          <button
            onClick={() => setActiveView('search')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'search'
                ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-cyan-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <Search className="w-4 h-4 inline mr-2" />
            Search
          </button>
          <button
            onClick={() => setActiveView('entities')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeView === 'entities'
                ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-cyan-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <Tag className="w-4 h-4 inline mr-2" />
            Entities
          </button>
        </div>
      </div>

      {/* Workflow View */}
      {activeView === 'workflow' && (
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Concept Analysis */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-light text-gray-900 dark:text-gray-100 mb-6">
                Concept Analysis
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Concept
                  </label>
                  <input
                    type="text"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="e.g., Pinokyo, artificial intelligence, climate change"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-cyan-400 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Project
                  </label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-cyan-400 focus:border-transparent transition-all"
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
                  className="w-full py-3 px-4 bg-amber-500 dark:bg-cyan-500 text-white rounded-lg font-medium hover:bg-amber-600 dark:hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-light text-gray-900 dark:text-gray-100 mb-6">
                Category Scraping
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Category URL
                  </label>
                  <input
                    type="url"
                    value={categoryOptions.categoryUrl}
                    onChange={(e) => setCategoryOptions({ ...categoryOptions, categoryUrl: e.target.value })}
                    placeholder="https://example.com/category/products"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-cyan-400 focus:border-transparent transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Max Products
                    </label>
                    <input
                      type="number"
                      value={categoryOptions.maxProducts}
                      onChange={(e) => setCategoryOptions({ ...categoryOptions, maxProducts: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
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
                      <span className="text-sm text-gray-700 dark:text-gray-300">Extract Entities</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={categoryOptions.followPagination}
                        onChange={(e) => setCategoryOptions({ ...categoryOptions, followPagination: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Follow Pages</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={startCategoryScraping}
                  disabled={!categoryOptions.categoryUrl || !selectedProject || loading || currentWorkflow?.status === 'processing'}
                  className="w-full py-3 px-4 bg-amber-500 dark:bg-cyan-500 text-white rounded-lg font-medium hover:bg-amber-600 dark:hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-light text-gray-900 dark:text-gray-100 mb-6">
                Workflow Progress
              </h2>

              <div className="flex flex-col items-center justify-center py-8">
                <CircularProgress value={currentWorkflow.progress} size={200}>
                  <div className="text-center">
                    <div className="text-3xl font-light text-gray-900 dark:text-gray-100">
                      {currentWorkflow.progress}%
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {currentWorkflow.currentStep}
                    </div>
                  </div>
                </CircularProgress>

                <div className="mt-8 w-full max-w-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {currentWorkflow.concept || currentWorkflow.categoryUrl}
                    </span>
                    {currentWorkflow.status === 'processing' && (
                      <Loader2 className="w-4 h-4 text-amber-500 dark:text-cyan-400 animate-spin" />
                    )}
                    {currentWorkflow.status === 'completed' && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {currentWorkflow.status === 'failed' && (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>

                  {currentWorkflow.error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">{currentWorkflow.error}</p>
                    </div>
                  )}

                  {currentWorkflow.results && (
                    <div className="mt-6 grid grid-cols-4 gap-3">
                      <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-lg font-light text-amber-600 dark:text-cyan-400">
                          {currentWorkflow.results.searchResults || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Search Results</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-lg font-light text-amber-600 dark:text-cyan-400">
                          {currentWorkflow.results.scrapedContent || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Scraped</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-lg font-light text-amber-600 dark:text-cyan-400">
                          {currentWorkflow.results.entitiesExtracted || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Entities</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-lg font-light text-amber-600 dark:text-cyan-400">
                          {currentWorkflow.results.processedContent?.sources?.length || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Sources</div>
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-light text-gray-900 dark:text-gray-100">
                Site Management
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  <button
                    onClick={() => setSiteView('grid')}
                    className={`p-2 rounded ${siteView === 'grid' ? 'bg-white dark:bg-gray-700' : ''}`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSiteView('list')}
                    className={`p-2 rounded ${siteView === 'list' ? 'bg-white dark:bg-gray-700' : ''}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => setShowAddSite(true)}
                  className="px-4 py-2 bg-amber-500 dark:bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 dark:hover:bg-cyan-600 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Site
                </button>
              </div>
            </div>

            {/* Sites Grid/List */}
            <div className={siteView === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
              {sites.map(site => (
                <div
                  key={site.id}
                  className={`bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-amber-500 dark:hover:border-cyan-400 transition-all ${
                    siteView === 'list' ? 'p-4' : 'p-6'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        site.type === 'ecommerce'
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-amber-100 dark:bg-cyan-900/30'
                      }`}>
                        {site.type === 'ecommerce' ? (
                          <ShoppingCart className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <Globe className="w-5 h-5 text-amber-600 dark:text-cyan-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">
                          {site.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {site.category} • {site.type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${site.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <button
                        onClick={() => setSelectedSite(site)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 truncate">
                    {site.baseUrl}
                  </p>

                  {site.structure && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <Activity className="w-3 h-3" />
                        <span>Detected: {site.structure.routes.length} routes</span>
                        {site.structure.ecommerce && (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                            E-commerce
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${
                      site.scrapingConfig ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {site.scrapingConfig ? 'Configured' : 'Not configured'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => analyzeSite(site.id)}
                        className="text-xs text-amber-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Analyze
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSite(site);
                          setShowSiteConfig(true);
                        }}
                        className="text-xs text-amber-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
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
      )}

      {/* Search View */}
      {activeView === 'search' && (
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-light text-gray-900 dark:text-gray-100 mb-6">
              Semantic Search
            </h2>

            <div className="flex gap-4 mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across your sites..."
                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-cyan-400 focus:border-transparent"
              />
              <button
                onClick={performSearch}
                disabled={!searchQuery || !selectedProject || loading}
                className="px-6 py-3 bg-amber-500 dark:bg-cyan-500 text-white rounded-lg font-medium hover:bg-amber-600 dark:hover:bg-cyan-600 disabled:opacity-50 transition-colors flex items-center gap-2"
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
                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
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
                <span className="text-sm text-gray-700 dark:text-gray-300">Has Entities</span>
              </label>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Found {searchResults.length} results
                </h3>
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-amber-500 dark:hover:border-cyan-400 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                          {result.title}
                        </h4>
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-amber-600 dark:text-cyan-400 hover:underline flex items-center gap-1 mb-2"
                        >
                          <Link className="w-3 h-3" />
                          {result.url}
                        </a>
                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                          <span>{result.siteName}</span>
                          <span>Relevance: {Math.round(result.relevanceScore * 100)}%</span>
                          <span className={`px-2 py-1 rounded-full ${
                            result.type === 'exact_match'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                          }`}>
                            {result.type}
                          </span>
                        </div>
                        {result.entities && result.entities.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.entities.map((entity, idx) => (
                              <span key={idx} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">
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

      {/* Entities View */}
      {activeView === 'entities' && (
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-light text-gray-900 dark:text-gray-100 mb-6">
              Entity Configuration
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Entity Types */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Available Entity Types
                </h3>
                <div className="space-y-3">
                  {entityTypes.map(entity => (
                    <div key={entity.type} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={entity.enabled}
                          onChange={(e) => {
                            const updated = entityTypes.map(e =>
                              e.type === entity.type ? { ...e, enabled: e.target.checked } : e
                            );
                            setEntityTypes(updated);
                          }}
                          className="w-4 h-4 text-amber-500 dark:text-cyan-400"
                        />
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {entity.label}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                              {entity.category}
                            </span>
                            {entity.pattern && (
                              <code className="ml-2 text-xs">{entity.pattern}</code>
                            )}
                          </div>
                        </div>
                      </div>
                      <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Entity */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Add Custom Entity
                </h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Entity Name"
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Regex Pattern"
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                  <select className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <option>Select Category</option>
                    <option value="product">Product</option>
                    <option value="content">Content</option>
                    <option value="contact">Contact</option>
                    <option value="location">Location</option>
                  </select>
                  <button className="w-full py-2 bg-amber-500 dark:bg-cyan-500 text-white rounded-lg font-medium hover:bg-amber-600 dark:hover:bg-cyan-600">
                    Add Entity Type
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Site Modal */}
      {showAddSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-light text-gray-900 dark:text-gray-100">
                Add New Site
              </h3>
              <button
                onClick={() => setShowAddSite(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Site Name
                </label>
                <input
                  type="text"
                  value={newSite.name}
                  onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                  placeholder="e.g., Kitapyurdu"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  value={newSite.baseUrl}
                  onChange={(e) => setNewSite({ ...newSite, baseUrl: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={newSite.category}
                  onChange={(e) => setNewSite({ ...newSite, category: e.target.value })}
                  placeholder="e.g., bookstore, news, blog"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Site Type
                </label>
                <select
                  value={newSite.type}
                  onChange={(e) => setNewSite({ ...newSite, type: e.target.value as any })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
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
                <label htmlFor="autoAnalyze" className="text-sm text-gray-700 dark:text-gray-300">
                  Auto-analyze site structure
                </label>
              </div>
              <button
                onClick={addSite}
                disabled={!newSite.name || !newSite.baseUrl || !selectedProject}
                className="w-full py-2 bg-amber-500 dark:bg-cyan-500 text-white rounded-lg font-medium hover:bg-amber-600 dark:hover:bg-cyan-600 disabled:opacity-50 transition-colors"
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-light text-gray-900 dark:text-gray-100">
                Configure: {selectedSite.name}
              </h3>
              <button
                onClick={() => setShowSiteConfig(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {selectedSite.scrapingConfig && (
              <div className="space-y-6">
                {/* Content Selectors */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Content Selectors
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Title Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.contentSelectors.title}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Content Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.contentSelectors.content}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Price Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.ecommerce?.productPrice}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Image Selector
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedSite.scrapingConfig.ecommerce?.productImage}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Detected Patterns */}
                {selectedSite.scrapingConfig.contentPatterns && (
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
                      Detected URL Patterns
                    </h4>
                    <div className="space-y-2">
                      {selectedSite.scrapingConfig.contentPatterns.map((pattern: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <code className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                            {pattern}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowSiteConfig(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button className="px-4 py-2 bg-amber-500 dark:bg-cyan-500 text-white rounded-lg hover:bg-amber-600 dark:hover:bg-cyan-600">
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