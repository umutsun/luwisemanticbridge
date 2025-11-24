'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ListSkeleton } from '@/components/ui/skeleton';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ProgressCircle } from '@/components/ui/progress-circle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import { InputTooltip } from '@/components/ui/input-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Database,
  FileText,
  Eye,
  Loader2,
  CheckCircle,
  BarChart3,
  ArrowRight,
  Columns,
  Brain,
  Target,
  Zap,
  AlertCircle,
  Plus,
  Table as TableIcon,
  Trash2,
  Play,
  X,
  Activity,
  StopCircle,
  Pause,
  Clock,
  MousePointer2,
  Square,
  RefreshCw,
  Radar,
  MoreHorizontal,
  Filter,
  Copy,
  Globe,
  ShoppingCart,
  ShoppingBag,
  Package,
  Shield,
  Code2,
  Check,
  Edit2
} from 'lucide-react';
import config from '@/config/api.config';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { useSocketIO } from '@/hooks/useSocketIO';

interface CrawlerDirectory {
  id: string;
  name: string;
  displayName: string;
  itemCount: number;
  lastCrawled: string | null;
  type: string;
}

interface CrawledItem {
  id: string;
  key: string;
  fullKey: string;
  crawlerName: string;
  data: any;
  rawData: string;
  scrapedAt: string | null;
  title: string;
  url: string | null;
  metadata?: {
    analysis?: {
      template?: 'web_page' | 'legal' | 'novel' | 'research' | 'invoice' | 'contract' | 'general';
      [key: string]: any;
    };
  };
  analyzeStatus?: 'waiting' | 'analyzed' | 'transformed';
}

interface SourceTable {
  name: string;
  schema: string;
  rowCount: number;
}

interface EntityAnalysis {
  crawlerName: string;
  totalFields: number;
  requiredFields: number;
  optionalFields: number;
  dataTypes: {
    text: number;
    numeric: number;
    boolean: number;
    json: number;
  };
  sampleSize: number;
}

interface Stats {
  totalDirectories: number;
  totalItems: number;
  selectedItemsCount: number;
  mappedItems: number;
}

type WorkflowStep = 'select-source' | 'preview-data' | 'select-target' | 'mapping' | 'import';

// Helper functions for analyze status
const getAnalyzeStatus = (item: CrawledItem): 'waiting' | 'analyzed' | 'transformed' => {
  if (item.metadata?.analysis && Object.keys(item.metadata.analysis).length > 0) {
    return item.analyzeStatus || 'analyzed';
  }
  return 'waiting';
};

const getAnalyzeTemplate = (item: CrawledItem): string => {
  const template = item.metadata?.analysis?.template;
  const templateNames: Record<string, string> = {
    web_page: 'Web Page',  // These will be translated dynamically
    legal: 'Legal',
    novel: 'Novel',
    research: 'Research',
    invoice: 'Invoice',
    contract: 'Contract',
    general: 'General'
  };
  return template ? templateNames[template] || template : '';
};

export default function CrawlerDataPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Workflow state
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('select-source');

  // Data states
  const [directories, setDirectories] = useState<CrawlerDirectory[]>([]);
  const [selectedDirectory, setSelectedDirectory] = useState<CrawlerDirectory | null>(null);
  const [crawledItems, setCrawledItems] = useState<CrawledItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sourceTables, setSourceTables] = useState<SourceTable[]>([]);
  const [selectedTargetTable, setSelectedTargetTable] = useState<string>('');
  const [createNewTable, setCreateNewTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');

  // Analysis states
  const [entityAnalysis, setEntityAnalysis] = useState<EntityAnalysis | null>(null);
  const [jsonSchema, setJsonSchema] = useState<any>(null);
  const [columnMappings, setColumnMappings] = useState<any[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoEmbeddings, setAutoEmbeddings] = useState(true);
  const [editingItem, setEditingItem] = useState<CrawledItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editedData, setEditedData] = useState<string>('');
  const [extractingPdfText, setExtractingPdfText] = useState(false);
  const [pythonScripts, setPythonScripts] = useState<Map<string, File>>(new Map());
  const [uploadingScript, setUploadingScript] = useState<string | null>(null);
  const [itemsOffset, setItemsOffset] = useState(0);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalItemsCount, setTotalItemsCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scriptLogs, setScriptLogs] = useState<Map<string, string[]>>(new Map()); // jobId -> logs
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlDialogDirectory, setUrlDialogDirectory] = useState<CrawlerDirectory | null>(null);
  const [scriptUrl, setScriptUrl] = useState('');
  const [isScriptRunning, setIsScriptRunning] = useState(false);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [editingScript, setEditingScript] = useState<{ directory: CrawlerDirectory; content: string } | null>(null);
  const [scriptContent, setScriptContent] = useState('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [scriptStartTime, setScriptStartTime] = useState<Date | null>(null);
  const [isScriptPaused, setIsScriptPaused] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState<string | null>(null); // directory name
  const [runningScripts, setRunningScripts] = useState<Set<string>>(new Set()); // running directory names
  const [scriptUrls, setScriptUrls] = useState<Map<string, string>>(new Map()); // directory -> URL
  const [crawlerStates, setCrawlerStates] = useState<Map<string, any>>(new Map()); // directory -> state.json
  const [recrawlingItems, setRecrawlingItems] = useState<Set<string>>(new Set()); // URL being recrawled
  const [editingDirectoryId, setEditingDirectoryId] = useState<string | null>(null);
  const [editingDirectoryName, setEditingDirectoryName] = useState<string>('');
  const [selectedForRecrawl, setSelectedForRecrawl] = useState<Set<string>>(new Set()); // Selected item IDs for bulk recrawl
  const [bulkRecrawling, setBulkRecrawling] = useState(false); // Bulk recrawl in progress
  const [showCrawlerSelect, setShowCrawlerSelect] = useState<string | null>(null); // Directory name for crawler selection

  // Built-in crawlers (without _crawler suffix as per folder structure)
  const builtInCrawlers = [
    { name: 'wordpress', label: 'WordPress' },
    { name: 'drupal', label: 'Drupal' },
    { name: 'woocommerce', label: 'WooCommerce' },
    { name: 'shopify', label: 'Shopify' },
    { name: 'wix', label: 'Wix' },
    { name: 'cloudflare', label: 'Cloudflare' }
  ];

  // Analyze functionality
  const [selectedForAnalyze, setSelectedForAnalyze] = useState<Set<string>>(new Set()); // Selected item IDs for batch analyze
  const [analyzingItems, setAnalyzingItems] = useState<Set<string>>(new Set()); // Items currently being analyzed
  const [selectedAnalyzeTemplate, setSelectedAnalyzeTemplate] = useState<string>('web_page'); // Default template for web pages
  const [analysisTemplates, setAnalysisTemplates] = useState<any[]>([]);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false); // Batch analyze in progress

  // Inline new source editing
  const [isAddingNewSource, setIsAddingNewSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceScript, setNewSourceScript] = useState<File | null>(null);
  const [isSavingNewSource, setIsSavingNewSource] = useState(false);

  // Stats
  const [stats, setStats] = useState<Stats>({
    totalDirectories: 0,
    totalItems: 0,
    selectedItemsCount: 0,
    mappedItems: 0
  });

  useEffect(() => {
    fetchDirectories();
    fetchSourceTables();
    fetchAnalysisTemplates();
  }, []);

  // Debug: Track isAddingNewSource state changes
  useEffect(() => {
    console.log('🟡 [DEBUG] isAddingNewSource state changed to:', isAddingNewSource);
  }, [isAddingNewSource]);

  // Load Python scripts for all directories
  useEffect(() => {
    if (directories.length > 0) {
      loadPythonScripts();
    }
  }, [directories]);

  // WebSocket connection for real-time script logs (optional)
  const { socket, isConnected } = useSocketIO(config.api.baseUrl.replace('/api', ''), {
    enableLogs: false, // Disable logs to reduce console noise
    reconnectAttempts: 1, // Only try once
    onOpen: () => {
      console.log('🔌 WebSocket connected for script logs');
    },
    onError: (error) => {
      // Silently handle - WebSocket is optional
    }
  });

  // Listen for script log events
  useEffect(() => {
    if (!socket) {
      console.log('[Script Logs] Socket not available');
      return;
    }

    const handleScriptLog = (data: any) => {
      const { jobId, type, message, exitCode, timestamp } = data;

      console.log(`[Script Log] Job: ${jobId}, Type: ${type}, Message:`, message);

      setScriptLogs(prev => {
        const updated = new Map(prev);
        const existingLogs = updated.get(jobId) || [];

        if (type === 'completed') {
          const completionMsg = exitCode === 0
            ? `Completed successfully at ${new Date(timestamp).toLocaleTimeString()}`
            : `Failed with code ${exitCode} at ${new Date(timestamp).toLocaleTimeString()}`;
          updated.set(jobId, [...existingLogs, completionMsg]);

          // Mark script as completed - find which crawler by jobId
          if (currentJobId === jobId) {
            setTimeout(() => {
              setIsScriptRunning(false);
            }, 3000);
          }

          // Also remove from runningScripts set
          // jobId format: script_run_CRAWLERNAME_timestamp
          const crawlerNameMatch = jobId.match(/script_run_(.+?)_\d+$/);
          if (crawlerNameMatch) {
            const crawlerName = crawlerNameMatch[1];
            setRunningScripts(prev => {
              const next = new Set(prev);
              next.delete(crawlerName);
              return next;
            });
            console.log(`[Script Completed] Removed ${crawlerName} from running scripts`);
          }
        } else {
          const cleanMessage = message?.trim() || '';
          if (cleanMessage) {
            updated.set(jobId, [...existingLogs, cleanMessage]);
          }
        }

        return updated;
      });

      // Refresh directory counts when script completes
      if (type === 'completed') {
        setTimeout(() => {
          fetchDirectories();
        }, 1000);
      }
    };

    console.log('[Script Logs] Registering script_log event listener');
    socket.on('script_log', handleScriptLog);

    return () => {
      socket.off('script_log', handleScriptLog);
    };
  }, [socket]);

  // Listen for crawler item added events (real-time table updates)
  useEffect(() => {
    if (!socket) return;

    const handleCrawlerItemAdded = (data: {
      directoryName: string;
      item: CrawledItem;
      totalItems: number;
      timestamp: string;
    }) => {
      const { directoryName, item, totalItems } = data;

      console.log(`[Crawler Item Added] ${directoryName}: +1 item (total: ${totalItems})`);

      // Update directory count in real-time
      setDirectories(prev =>
        prev.map(dir =>
          dir.name === directoryName
            ? { ...dir, itemCount: totalItems }
            : dir
        )
      );

      // If this directory is selected, add item to the items list (with animation)
      if (selectedDirectory?.name === directoryName) {
        setItems(prev => {
          // Add new item at the beginning (newest first)
          const newItems = [item, ...prev];
          // Limit to reasonable size to prevent memory issues
          return newItems.slice(0, 1000);
        });

        // Update total count
        setTotalItemsCount(totalItems);

        // Show toast notification
        toast({
          title: 'New Item Added',
          description: `${item.title || 'Untitled'} - ${directoryName}`,
          duration: 2000,
        });
      }
    };

    console.log('[Crawler] Registering crawler:item:added event listener');
    socket.on('crawler:item:added', handleCrawlerItemAdded);

    return () => {
      socket.off('crawler:item:added', handleCrawlerItemAdded);
    };
  }, [socket, selectedDirectory, toast]);

  // Poll state.json for running scripts (queue, progress, visited URLs)
  useEffect(() => {
    if (runningScripts.size === 0) return;

    const baseUrl = config.api.baseUrl;
    const pollInterval = setInterval(async () => {
      for (const crawlerName of runningScripts) {
        try {
          const response = await fetchWithAuth(
            `${baseUrl}/api/v2/crawler/crawler-directories/${crawlerName}/state`
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.hasState) {
              setCrawlerStates(prev => new Map(prev).set(crawlerName, data.state));
            }
          }
        } catch (error) {
          console.error(`[State Poll] Failed to fetch state for ${crawlerName}:`, error);
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [runningScripts]);

  // Search effect - debounced backend search
  useEffect(() => {
    if (!selectedDirectory) return;

    const debounceTimer = setTimeout(() => {
      // Reset to first page and fetch with search
      setItemsOffset(0);
      fetchCrawledItems(selectedDirectory.name, 0, false, searchTerm);
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const loadPythonScripts = async () => {
    const scriptsMap = new Map<string, File>();

    for (const directory of directories) {
      try {
        const response = await fetchWithAuth(
          `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script`
        );

        if (!response.ok) continue;

        // If script exists, response will be text/plain with script content
        const scriptText = await response.text();
        if (scriptText && scriptText.length > 0) {
          // Create a virtual File object to represent the existing script
          const filename = `${directory.name}.py`;
          const virtualFile = new File([scriptText], filename, { type: 'text/x-python' });
          scriptsMap.set(directory.name, virtualFile);
        }
      } catch (error) {
        console.error(`Failed to load script for ${directory.name}:`, error);
      }
    }

    setPythonScripts(scriptsMap);
  };

  const fetchDirectories = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/crawler/crawler-directories`);

      if (!response.ok) throw new Error('Failed to fetch directories');

      const data = await response.json();
      setDirectories(data.directories || []);
      setStats(prev => ({
        ...prev,
        totalDirectories: data.totalDirectories || 0,
        totalItems: data.totalItems || 0
      }));

      // Fetch running crawlers status
      if (data.runningCrawlers && Array.isArray(data.runningCrawlers)) {
        const running = new Set(data.runningCrawlers.map((rc: { crawlerName: string }) => rc.crawlerName));
        setRunningScripts(running);
        console.log(`[Init] Found ${running.size} running crawlers:`, Array.from(running));
      }
    } catch (error: any) {
      console.error('Failed to fetch directories:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load crawler directories',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSourceTables = async () => {
    try {
      // Fetch from source_db tables
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/source/tables`);
      if (!response.ok) throw new Error('Failed to fetch source tables');
      const data = await response.json();
      setSourceTables(data.tables || []);
    } catch (error: any) {
      console.error('Failed to fetch source tables:', error);
    }
  };

  const fetchAnalysisTemplates = async () => {
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/pdf/analysis-templates`);
      if (!response.ok) throw new Error('Failed to fetch analysis templates');
      const data = await response.json();
      setAnalysisTemplates(data.templates || []);
    } catch (error: any) {
      console.error('Failed to fetch analysis templates:', error);
    }
  };

  const fetchCrawledItems = async (crawlerName: string, offset: number = 0, append: boolean = false, search: string = '') => {
    try {
      if (!append) setItemsLoading(true);
      else setLoadingMore(true);

      // Build URL with search parameter
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${crawlerName}/data?limit=100&offset=${offset}${searchParam}`
      );

      if (!response.ok) throw new Error('Failed to fetch crawled items');

      const data = await response.json();

      if (append) {
        // Append new items to existing list
        setCrawledItems(prev => [...prev, ...(data.data || [])]);
      } else {
        // Replace items (initial load)
        setCrawledItems(data.data || []);
      }

      setTotalItemsCount(data.total || 0);
      setHasMoreItems(data.hasMore || false);
      setItemsOffset(offset + (data.data?.length || 0));

      console.log(`✅ Loaded ${data.data?.length || 0} items (Offset: ${offset}, Total: ${data.total || 0}, Has More: ${data.hasMore}, Search: ${search || 'none'})`);

      // Show info toast only on initial load if there are many items
      if (!append && data.total > 1000) {
        toast({
          title: 'Large Dataset',
          description: `Found ${data.total.toLocaleString()} items. Loading 100 at a time.`,
          duration: 5000
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch crawled items:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load crawled items',
        variant: 'destructive'
      });
    } finally {
      setItemsLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreItems = async () => {
    if (!selectedDirectory || !hasMoreItems || loadingMore) return;
    await fetchCrawledItems(selectedDirectory.name, itemsOffset, true, searchTerm);
  };

  const handleDirectorySelect = (directory: CrawlerDirectory) => {
    setSelectedDirectory(directory);
    setItemsOffset(0);
    setHasMoreItems(false);
    setCrawledItems([]);
    fetchCrawledItems(directory.name, 0, false);
    setWorkflowStep('preview-data');
    setSelectedItems(new Set());
  };

  const handleRefresh = async () => {
    if (!selectedDirectory || isRefreshing) return;

    try {
      setIsRefreshing(true);

      // Refresh both directories (to update card counts) and items (to update right panel)
      await Promise.all([
        fetchDirectories(),
        fetchCrawledItems(selectedDirectory.name, 0, false)
      ]);

      toast({
        title: 'Refreshed',
        description: 'Data has been updated',
        duration: 2000
      });
    } catch (error: any) {
      console.error('Failed to refresh:', error);
      toast({
        title: 'Error',
        description: 'Failed to refresh data',
        variant: 'destructive'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleItemToggle = (itemKey: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemKey)) {
      newSelected.delete(itemKey);
    } else {
      newSelected.add(itemKey);
    }
    setSelectedItems(newSelected);
    setStats(prev => ({ ...prev, selectedItemsCount: newSelected.size }));
  };

  const handleSelectAll = () => {
    if (selectedItems.size === crawledItems.length) {
      setSelectedItems(new Set());
      setStats(prev => ({ ...prev, selectedItemsCount: 0 }));
    } else {
      const allKeys = new Set(crawledItems.map(item => item.key));
      setSelectedItems(allKeys);
      setStats(prev => ({ ...prev, selectedItemsCount: allKeys.size }));
    }
  };

  const performEntityAnalysis = async () => {
    setAnalyzing(true);
    try {
      // Use all crawler items for analysis instead of selected items
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/crawler/analyze-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crawlerName: selectedDirectory?.name,
          sampleItems: crawledItems
        })
      });

      if (!response.ok) throw new Error('Failed to analyze table structure');

      const data = await response.json();
      setEntityAnalysis(data.entityAnalysis);
      setJsonSchema(data.jsonSchema);
      setColumnMappings(data.tableSchema || []);
      setNewTableName(data.suggestedTableName || '');
      setWorkflowStep('select-target');
    } catch (error: any) {
      console.error('Failed to analyze:', error);
      toast({
        title: 'Warning',
        description: 'Could not perform entity analysis',
        variant: 'default'
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleEditItem = async (item: CrawledItem) => {
    setEditingItem(item);

    // Extract only the content from the data, preserving line breaks
    let contentText = '';

    // Check if it's a PDF - extract text automatically
    if (item.data.file_path && item.data.file_path.toLowerCase().endsWith('.pdf')) {
      // Check if text already exists in item.data
      if (item.data.extracted_text) {
        contentText = item.data.extracted_text;
      } else {
        setShowEditDialog(true);
        setExtractingPdfText(true);
        setEditedData('');

        try {
          const apiUrl = `${config.api.baseUrl}/api/v2/pdf/extract-text`;
          console.log('[PDF Extract] Calling API:', apiUrl);
          console.log('[PDF Extract] config.api.baseUrl:', config.api.baseUrl);

          const response = await fetchWithAuth(
            apiUrl,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filePath: item.data.file_path })
            }
          );
          const data = await response.json();
          setExtractingPdfText(false);

          if (data.text) {
            contentText = data.text;

            // Save extracted text back to Redis
            try {
              await fetchWithAuth(
                `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${item.crawlerName}/items/${item.key}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...item.data,
                    extracted_text: data.text
                  })
                }
              );
              console.log('✅ Saved extracted text to Redis');
            } catch (saveError) {
              console.warn('⚠️ Could not save extracted text to Redis:', saveError);
            }
          } else {
            contentText = `PDF File: ${item.data.filename}\n\nNo text content available.\nThis PDF may be scanned or empty.\n\nFile: ${item.data.file_path}`;
          }
        } catch (error) {
          contentText = `PDF File: ${item.data.filename}\n\nFailed to extract text from PDF.\n\nFile: ${item.data.file_path}`;
        }
      }
    }
    // Check for various content field names used by different scrapers
    else if (item.data.script_text) {
      // IMSDB crawler uses script_text
      contentText = item.data.script_text;
    } else if (item.data.markdown) {
      contentText = item.data.markdown;
    } else if (item.data.html) {
      contentText = item.data.html;
    } else if (item.data.extracted_content) {
      contentText = item.data.extracted_content;
    } else if (item.data.content && typeof item.data.content === 'string') {
      contentText = item.data.content;
    } else if (typeof item.data === 'string') {
      contentText = item.data;
    } else {
      contentText = JSON.stringify(item.data, null, 2);
    }

    // Replace escaped newlines with actual newlines for better readability
    if (typeof contentText === 'string') {
      contentText = contentText
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
    }

    setEditedData(contentText);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !selectedDirectory) return;

    try {
      console.log('🔄 [Save Edit] Starting save process...');
      console.log('📁 Directory:', selectedDirectory.name);
      console.log('🔑 Item Key:', editingItem.key);

      // Prepare updated data - preserve the original structure but update content
      const updatedData = { ...editingItem.data };

      // Update the appropriate content field based on what exists in original data
      if (editingItem.data.script_text !== undefined) {
        updatedData.script_text = editedData;
        console.log('📝 Updating script_text field');
      } else if (editingItem.data.markdown !== undefined) {
        updatedData.markdown = editedData;
        console.log('📝 Updating markdown field');
      } else if (editingItem.data.html !== undefined) {
        updatedData.html = editedData;
        console.log('📝 Updating html field');
      } else if (editingItem.data.extracted_content !== undefined) {
        updatedData.extracted_content = editedData;
        console.log('📝 Updating extracted_content field');
      } else if (editingItem.data.content !== undefined) {
        updatedData.content = editedData;
        console.log('📝 Updating content field');
      } else {
        // Fallback: try to parse as JSON, otherwise keep as string
        try {
          updatedData.content = JSON.parse(editedData);
          console.log('📝 Creating new content field (JSON)');
        } catch {
          updatedData.content = editedData;
          console.log('📝 Creating new content field (string)');
        }
      }

      // Update word count in metadata if it exists
      if (updatedData.metadata && typeof editedData === 'string') {
        updatedData.metadata.word_count = editedData.split(/\s+/).filter(w => w.length > 0).length;
        console.log('📊 Updated word count:', updatedData.metadata.word_count);
      }

      console.log('📤 Sending update to backend...');
      console.log('URL:', `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${selectedDirectory.name}/update-item`);
      console.log('Payload:', { itemKey: editingItem.key, data: updatedData });

      // Update the item in Redis
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${selectedDirectory.name}/update-item`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemKey: editingItem.key,
            data: updatedData
          })
        }
      );

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server error:', errorData);
        throw new Error(errorData.error || 'Failed to update item');
      }

      const result = await response.json();
      console.log('✅ Update successful:', result);

      // Update local state
      const updatedItems = crawledItems.map(item =>
        item.key === editingItem.key
          ? { ...item, data: updatedData }
          : item
      );
      setCrawledItems(updatedItems);
      console.log('✅ Local state updated');

      toast({
        title: 'Success',
        description: 'Item updated successfully in Redis'
      });

      setShowEditDialog(false);
      setEditingItem(null);
    } catch (error: any) {
      console.error('❌ [Save Edit] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save changes',
        variant: 'destructive'
      });
    }
  };

  const handlePythonScriptUpload = async (directory: CrawlerDirectory, file: File) => {
    try {
      console.log('📄 [Upload Script] Starting upload...');
      console.log('📁 Directory:', directory.name);
      console.log('📝 File:', file.name);

      // Validate file extension
      if (!file.name.endsWith('.py')) {
        toast({
          title: 'Invalid File',
          description: 'Please upload a Python (.py) file',
          variant: 'destructive'
        });
        return;
      }

      setUploadingScript(directory.id);

      // Upload to backend
      const formData = new FormData();
      formData.append('script', file);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script`,
        {
          method: 'POST',
          body: formData
          // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload script');
      }

      const result = await response.json();
      console.log('✅ Backend upload successful:', result);

      // Update local state
      setPythonScripts(prev => {
        const updated = new Map(prev);
        updated.set(directory.name, file);
        return updated;
      });

      toast({
        title: 'Success',
        description: `Python script "${file.name}" saved successfully`,
      });

      console.log('✅ Script saved successfully');
    } catch (error: any) {
      console.error('❌ [Upload Script] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload Python script',
        variant: 'destructive'
      });
    } finally {
      setUploadingScript(null);
    }
  };

  const handleSelectBuiltInCrawler = async (directory: CrawlerDirectory, crawlerName: string) => {
    try {
      console.log('📦 [Select Built-in Crawler]', crawlerName, 'for', directory.name);

      // Create a virtual file object to upload
      const scriptContent = `# Auto-linked to built-in crawler: ${crawlerName}.py
# This directory uses: ${crawlerName}
# Built-in crawlers are located in: backend/python-services/crawlers/
`;

      const blob = new Blob([scriptContent], { type: 'text/plain' });
      const file = new File([blob], `${crawlerName}.py`, { type: 'text/plain' });

      // Upload the reference file
      const formData = new FormData();
      formData.append('script', file);
      formData.append('builtIn', 'true');
      formData.append('crawlerName', crawlerName);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to link built-in crawler');
      }

      console.log('✅ Built-in crawler linked successfully');

      // Update local state
      setPythonScripts(prev => new Map(prev).set(directory.name, file));
      setShowCrawlerSelect(null);

      toast({
        title: 'Success',
        description: `Linked to ${crawlerName}`,
      });
    } catch (error: any) {
      console.error('❌ [Select Built-in Crawler] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to link built-in crawler',
        variant: 'destructive'
      });
    }
  };

  const handleDeletePythonScript = async (directory: CrawlerDirectory) => {
    try {
      console.log('🗑️  [Delete Script] Starting delete...');
      console.log('📁 Directory:', directory.name);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete script');
      }

      console.log('✅ Backend delete successful');

      // Update local state
      setPythonScripts(prev => {
        const updated = new Map(prev);
        updated.delete(directory.name);
        return updated;
      });

      toast({
        title: 'Success',
        description: 'Python script deleted successfully',
      });
    } catch (error: any) {
      console.error('❌ [Delete Script] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete Python script',
        variant: 'destructive'
      });
    }
  };

  // Show URL dialog before running script
  const showUrlInputAndRun = (directory: CrawlerDirectory) => {
    setUrlDialogDirectory(directory);
    setScriptUrl('');
    setShowUrlDialog(true);
  };

  const handleRunScript = async (directory: CrawlerDirectory, url: string) => {
    if (!url.trim()) {
      toast({ title: 'URL Required', description: 'Please enter a URL to crawl', variant: 'destructive' });
      return;
    }

    try {
      console.log(`[Run Script] Starting script for ${directory.name} with URL: ${url}`);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script/run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        }
      );

      console.log(`[Run Script] Response status:`, response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[Run Script] Error response:', errorData);
        throw new Error(errorData.error || 'Failed to run script');
      }

      const result = await response.json();
      console.log('[Run Script] Success response:', result);

      setCurrentJobId(result.jobId);
      setScriptStartTime(new Date());
      setScriptLogs(prev => new Map(prev).set(result.jobId, [`[${new Date().toLocaleTimeString()}] Script started\n[${new Date().toLocaleTimeString()}] Crawling URL: ${url}\n`]));

      toast({
        title: 'Script Running',
        description: `${directory.displayName} crawler started in background`
      });
    } catch (error: any) {
      console.error('[Run Script] Error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to run script', variant: 'destructive' });

      // Remove from running scripts on error
      setRunningScripts(prev => {
        const next = new Set(prev);
        next.delete(directory.name);
        return next;
      });
    }
  };

  const handleSaveScript = async () => {
    if (!editingScript) return;

    try {
      const blob = new Blob([scriptContent], { type: 'text/plain' });
      const file = new File([blob], `${editingScript.directory.name}.py`);

      const formData = new FormData();
      formData.append('script', file);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${editingScript.directory.name}/script`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save script');
      }

      toast({
        title: 'Success',
        description: 'Script saved successfully',
      });

      setShowScriptEditor(false);
      setEditingScript(null);
    } catch (error: any) {
      console.error('[Save Script] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save script',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteDirectory = async (directory: CrawlerDirectory) => {
    try {
      console.log('🗑️  [Delete Directory] Starting delete process...');
      console.log('📁 Directory:', directory.name);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}`,
        {
          method: 'DELETE'
        }
      );

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server error:', errorData);
        throw new Error(errorData.error || 'Failed to delete crawler directory');
      }

      const result = await response.json();
      console.log('✅ Delete successful:', result);

      // Update local state - remove deleted directory
      const updatedDirectories = directories.filter(dir => dir.id !== directory.id);
      setDirectories(updatedDirectories);
      console.log('✅ Local state updated - directory removed');

      // If deleted directory was selected, clear selection
      if (selectedDirectory?.id === directory.id) {
        setSelectedDirectory(null);
        setCrawledItems([]);
        setWorkflowStep('select-source');
      }

      // Update global stats
      setStats(prev => ({
        ...prev,
        totalDirectories: prev.totalDirectories - 1,
        totalItems: prev.totalItems - directory.itemCount
      }));

      toast({
        title: 'Success',
        description: `Deleted crawler source "${directory.displayName}" with ${result.deletedCount || 0} items`
      });
    } catch (error: any) {
      console.error('❌ [Delete Directory] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete crawler directory',
        variant: 'destructive'
      });
    }
  };

  const handleRenameDirectory = async (directory: CrawlerDirectory, newName: string) => {
    try {
      if (!newName.trim()) {
        toast({
          title: 'Error',
          description: 'Directory name cannot be empty',
          variant: 'destructive'
        });
        return;
      }

      console.log('🔄 [Rename Directory] Starting rename process...');
      console.log('📁 Old Name:', directory.name);
      console.log('📝 New Name:', newName.trim());

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/rename`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ newName: newName.trim() })
        }
      );

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server error:', errorData);
        throw new Error(errorData.error || 'Failed to rename crawler directory');
      }

      const result = await response.json();
      console.log('✅ Rename successful:', result);

      // Update local state
      const updatedDirectories = directories.map(dir =>
        dir.id === directory.id
          ? { ...dir, name: newName.trim(), displayName: newName.trim() }
          : dir
      );
      setDirectories(updatedDirectories);

      // Update selected directory if it was renamed
      if (selectedDirectory?.id === directory.id) {
        setSelectedDirectory({
          ...selectedDirectory,
          name: newName.trim(),
          displayName: newName.trim()
        });
      }

      // Clear editing state
      setEditingDirectoryId(null);
      setEditingDirectoryName('');

      toast({
        title: 'Success',
        description: `Renamed "${directory.displayName}" to "${newName.trim()}" (${result.renamedCount} items)`
      });
    } catch (error: any) {
      console.error('❌ [Rename Directory] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to rename crawler directory',
        variant: 'destructive'
      });
    }
  };

  const handleAddCrawler = async (crawlerName: string) => {
    if (!crawlerName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a crawler name',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: crawlerName.trim() })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create crawler');
      }

      const result = await response.json();

      // Add to directories list
      setDirectories(prev => [...prev, result.directory]);

      toast({
        title: 'Success',
        description: `Created crawler source "${result.directory.displayName}"`
      });
    } catch (error: any) {
      console.error('❌ [Add Crawler] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create crawler',
        variant: 'destructive'
      });
    }
  };

  const handleSaveNewSource = async () => {
    const trimmedName = newSourceName.trim();

    if (!trimmedName) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a source name',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsSavingNewSource(true);

      // Create crawler directory
      const createResponse = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newSourceName.trim() })
        }
      );

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create source');
      }

      const createResult = await createResponse.json();

      // Update UI - add new directory to list
      setDirectories(prev => [...prev, createResult.directory]);

      // Update stats
      setStats(prev => ({
        ...prev,
        totalDirectories: prev.totalDirectories + 1
      }));

      toast({
        title: 'Success',
        description: `Crawler source "${createResult.directory.displayName}" created successfully!`,
      });

      // Reset form
      setIsAddingNewSource(false);
      setNewSourceName('');

      // Refresh directories list
      setTimeout(() => {
        fetchDirectories();
      }, 500);

    } catch (error: any) {
      console.error('❌ [Save New Source] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create source',
        variant: 'destructive'
      });
    } finally {
      setIsSavingNewSource(false);
    }
  };

  const handleDeleteItem = async (itemKey: string) => {
    if (!selectedDirectory) return;

    try {
      console.log('🗑️  [Delete Item] Starting delete process...');
      console.log('📁 Directory:', selectedDirectory.name);
      console.log('🔑 Item Key:', itemKey);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${selectedDirectory.name}/items/${itemKey}`,
        {
          method: 'DELETE'
        }
      );

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server error:', errorData);
        throw new Error(errorData.error || 'Failed to delete item');
      }

      const result = await response.json();
      console.log('✅ Delete successful:', result);

      // Update local state - remove deleted item
      const updatedItems = crawledItems.filter(item => item.key !== itemKey);
      setCrawledItems(updatedItems);
      console.log('✅ Local state updated - item removed');

      // Update stats
      if (selectedDirectory) {
        setSelectedDirectory({
          ...selectedDirectory,
          itemCount: selectedDirectory.itemCount - 1
        });

        setDirectories(prev =>
          prev.map(dir =>
            dir.id === selectedDirectory.id
              ? { ...dir, itemCount: dir.itemCount - 1 }
              : dir
          )
        );
      }

      // Update global stats
      setStats(prev => ({
        ...prev,
        totalItems: prev.totalItems - 1
      }));

      toast({
        title: 'Success',
        description: 'Item deleted successfully'
      });
    } catch (error: any) {
      console.error('❌ [Delete Item] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete item',
        variant: 'destructive'
      });
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedDirectory) return;

    const selectedIds = Array.from(new Set([...selectedForRecrawl, ...selectedForAnalyze]));
    if (selectedIds.length === 0) {
      toast({
        title: 'No Items Selected',
        description: 'Please select items to delete',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Get the keys of selected items
      const selectedItems = crawledItems.filter(item => selectedIds.includes(item.id));
      const itemKeys = selectedItems.map(item => item.key);

      // Delete each item
      for (const key of itemKeys) {
        await fetchWithAuth(
          `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${selectedDirectory.name}/items/${key}`,
          { method: 'DELETE' }
        );
      }

      // Update local state
      const updatedItems = crawledItems.filter(item => !selectedIds.includes(item.id));
      setCrawledItems(updatedItems);

      // Clear selections
      setSelectedForRecrawl(new Set());
      setSelectedForAnalyze(new Set());

      // Update stats
      setStats(prev => ({
        ...prev,
        totalItems: prev.totalItems - selectedIds.length
      }));

      toast({
        title: 'Success',
        description: `${selectedIds.length} items deleted successfully`
      });
    } catch (error: any) {
      console.error('Bulk delete error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete items',
        variant: 'destructive'
      });
    }
  };

  const handleRecrawl = async (item: CrawledItem) => {
    if (!selectedDirectory || !item.url) {
      toast({
        title: 'Error',
        description: 'URL not found for this item',
        variant: 'destructive'
      });
      return;
    }

    try {
      setRecrawlingItems(prev => new Set(prev).add(item.url!));

      console.log('🔄 [Recrawl] Starting recrawl...');
      console.log('📁 Crawler:', selectedDirectory.name);
      console.log('🔗 URL:', item.url);

      const response = await fetchWithAuth(
        `http://localhost:8002/api/python/crawl/recrawl`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crawler_name: selectedDirectory.name,
            urls: [item.url]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to queue URL for recrawl');
      }

      const result = await response.json();
      console.log('✅ Recrawl queued:', result);

      // Build toast message based on result
      let message = '';
      if (result.already_queued_count > 0) {
        message = `URL already in queue. Queue size: ${result.queue_size}`;
      } else if (result.added_count > 0) {
        message = `URL queued for recrawl. Queue size: ${result.queue_size}`;
      } else {
        message = `URL not found in crawled data.`;
      }

      toast({
        title: result.already_queued_count > 0 ? 'Already Queued' : 'Success',
        description: message,
        variant: result.already_queued_count > 0 ? 'default' : 'default'
      });

    } catch (error: any) {
      console.error('❌ [Recrawl] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to queue URL for recrawl',
        variant: 'destructive'
      });
    } finally {
      setRecrawlingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.url!);
        return newSet;
      });
    }
  };

  const handleBulkRecrawl = async () => {
    if (!selectedDirectory || selectedForRecrawl.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select items to recrawl',
        variant: 'destructive'
      });
      return;
    }

    // Get URLs from selected items
    const selectedItems = filteredItems.filter(item => selectedForRecrawl.has(item.id));
    const urls = selectedItems.map(item => item.url).filter(url => url !== null) as string[];

    if (urls.length === 0) {
      toast({
        title: 'Error',
        description: 'No valid URLs found in selected items',
        variant: 'destructive'
      });
      return;
    }

    try {
      setBulkRecrawling(true);

      console.log(`🔄 [Bulk Recrawl] Starting bulk recrawl for ${urls.length} URLs...`);
      console.log('📁 Crawler:', selectedDirectory.name);

      const response = await fetchWithAuth(
        `http://localhost:8002/api/python/crawl/recrawl`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crawler_name: selectedDirectory.name,
            urls: urls
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to queue URLs for recrawl');
      }

      const result = await response.json();
      console.log('✅ Bulk recrawl queued:', result);

      // Build toast message
      const message = `${result.added_count} URLs queued, ${result.already_queued_count} already queued. Queue size: ${result.queue_size}`;

      toast({
        title: 'Bulk Recrawl Started',
        description: message,
        variant: 'default'
      });

      // Clear selection after successful bulk recrawl
      setSelectedForRecrawl(new Set());

    } catch (error: any) {
      console.error('❌ [Bulk Recrawl] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to queue URLs for bulk recrawl',
        variant: 'destructive'
      });
    } finally {
      setBulkRecrawling(false);
    }
  };

  const handleBatchAnalyze = async () => {
    if (selectedForAnalyze.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select items to analyze',
        variant: 'destructive'
      });
      return;
    }

    if (!selectedAnalyzeTemplate) {
      toast({
        title: 'Error',
        description: 'Please select an analysis template',
        variant: 'destructive'
      });
      return;
    }

    try {
      setBatchAnalyzing(true);
      const selectedItems = filteredItems.filter(item => selectedForAnalyze.has(item.id));

      console.log(`🧠 [Batch Analyze] Starting analysis for ${selectedItems.length} items...`);
      console.log('📋 Template:', selectedAnalyzeTemplate);

      // Get the full template object
      const template = analysisTemplates.find(t => t.id === selectedAnalyzeTemplate);

      // Analyze each item sequentially
      let successCount = 0;
      let errorCount = 0;

      for (const item of selectedItems) {
        try {
          setAnalyzingItems(prev => new Set(prev).add(item.id));

          const response = await fetchWithAuth(
            `${config.api.baseUrl}/api/v2/crawler/analyze`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itemId: item.id,
                crawlerName: item.crawlerName,
                template: template,
                content: item.rawData || JSON.stringify(item.data)
              })
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to analyze item ${item.id}`);
          }

          const result = await response.json();

          // Update item in local state with metadata
          setCrawledItems(prev =>
            prev.map(i =>
              i.id === item.id
                ? { ...i, metadata: result.metadata, analyzeStatus: 'analyzed' }
                : i
            )
          );

          successCount++;
        } catch (error: any) {
          console.error(`Failed to analyze item ${item.id}:`, error);
          errorCount++;
        } finally {
          setAnalyzingItems(prev => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      }

      toast({
        title: 'Batch Analysis Complete',
        description: `Successfully analyzed ${successCount} items${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        variant: successCount > 0 ? 'default' : 'destructive'
      });

      // Clear selection after successful analysis
      setSelectedForAnalyze(new Set());

    } catch (error: any) {
      console.error('❌ [Batch Analyze] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to analyze items',
        variant: 'destructive'
      });
    } finally {
      setBatchAnalyzing(false);
      setAnalyzingItems(new Set());
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportProgress(0);

    try {
      const targetTable = createNewTable ? newTableName : selectedTargetTable;

      console.log('📤 [Import] Starting import process...');
      console.log('📁 Directory:', selectedDirectory?.name);
      console.log('🗃️  Target table:', targetTable);
      console.log('✨ Create new table:', createNewTable);
      console.log('📋 Total items to export:', crawledItems.length);
      console.log('🔀 Column mappings:', columnMappings);

      if (!targetTable) {
        throw new Error('Please select or create a target table');
      }

      const mappingObj: Record<string, string> = {};
      columnMappings.forEach(m => {
        mappingObj[m.columnName] = m.originalField;
      });

      console.log('📦 Mapping object:', mappingObj);
      console.log('📐 Table schema:', columnMappings);

      setImportProgress(20); // Started

      // Send empty items array - backend will fetch all items from Redis
      const payload = {
        items: [], // Backend will fetch all items if empty
        tableName: targetTable,
        columnMappings: mappingObj,
        createTable: createNewTable,
        tableSchema: columnMappings, // Send full schema for table creation
        autoEmbeddings
      };

      console.log('📤 Sending payload:', payload);

      setImportProgress(40); // Sending

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${selectedDirectory?.name}/export-to-db`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      console.log('📥 Response status:', response.status);

      setImportProgress(70); // Response received

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server error:', errorData);
        throw new Error(errorData.error || 'Failed to import data');
      }

      const data = await response.json();
      console.log('✅ Import successful:', data);

      setImportProgress(100); // Complete

      toast({
        title: 'Success',
        description: `Inserted ${data.insertedCount || 0} new, updated ${data.updatedCount || 0}, skipped ${data.skippedCount || 0} records`,
      });

      setWorkflowStep('import');
      setStats(prev => ({ ...prev, mappedItems: prev.mappedItems + crawledItems.length }));
    } catch (error: any) {
      console.error('Failed to import:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to import data',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  };

  const getStepNumber = (step: WorkflowStep): number => {
    const steps: WorkflowStep[] = ['select-source', 'preview-data', 'select-target', 'mapping', 'import'];
    return steps.indexOf(step) + 1;
  };

  // Backend now handles search, so we only need to filter by status on frontend
  const filteredItems = statusFilter === 'all'
    ? crawledItems
    : crawledItems.filter(item => {
        const status = item.analyzeStatus || 'waiting';
        return status === statusFilter;
      });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex">
        {/* Main Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="w-full max-w-[1400px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">Crawler Data Manager</h1>
                <p className="text-muted-foreground mt-2">
                  Import and process crawled data from Redis to your database
                </p>
              </div>
            </div>

            {/* Statistics Cards - Pastel Gradients */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Total Directories - Yellow Pastel */}
              <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border-yellow-200 dark:border-yellow-800">
                <CardContent className="p-4">
                  <div className="text-sm text-yellow-700 dark:text-yellow-300 font-medium mb-1">
                    Crawler Sources
                  </div>
                  <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                    {stats.totalDirectories}
                  </div>
                </CardContent>
              </Card>

              {/* Total Items - Slate Pastel */}
              <Card className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/20 dark:to-gray-900/20 border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Total Items
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {stats.totalItems.toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              {/* Selected Items - Pink Pastel */}
              <Card className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 border-pink-200 dark:border-pink-800">
                <CardContent className="p-4">
                  <div className="text-sm text-pink-700 dark:text-pink-300 font-medium mb-1">
                    Selected Items
                  </div>
                  <div className="text-2xl font-bold text-pink-900 dark:text-pink-100">
                    {stats.selectedItemsCount}
                  </div>
                </CardContent>
              </Card>

              {/* Mapped Items - Green Pastel */}
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
                <CardContent className="p-4">
                  <div className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">
                    Mapped Items
                  </div>
                  <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {stats.mappedItems.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Workflow Stepper */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  {[t('crawls.selectSource'), t('crawls.previewData'), t('crawls.selectTarget'), t('crawls.mapping'), t('crawls.import')].map((label, index) => {
                    const stepNum = index + 1;
                    const currentStep = getStepNumber(workflowStep);
                    const isActive = stepNum === currentStep;
                    const isCompleted = stepNum < currentStep;

                    return (
                      <React.Fragment key={label}>
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all ${
                              isCompleted
                                ? 'bg-green-500 text-white'
                                : isActive
                                ? 'bg-slate-600 text-white ring-4 ring-slate-200 dark:ring-slate-700'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {isCompleted ? <CheckCircle className="w-5 h-5" /> : stepNum}
                          </div>
                          <span className={`text-xs mt-2 font-medium ${isActive ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500'}`}>
                            {label}
                          </span>
                        </div>
                        {index < 4 && (
                          <div className={`flex-1 h-0.5 mx-4 ${isCompleted ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Main Workflow Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Side - Source Selection / Settings */}
              <div className="lg:col-span-1">
                <Card className="h-[calc(100vh-200px)]">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{t('crawls.crawlerSources')}</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          console.log('🔵 [DEBUG] + button clicked');
                          console.log('🔵 [DEBUG] Setting isAddingNewSource to true');
                          setIsAddingNewSource(true);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="h-[calc(100%-60px)]">
                    <ScrollArea className="h-full pr-2">
                      {loading ? (
                        <ListSkeleton count={5} />
                      ) : (
                        <div className="space-y-2 pr-1">
                          {/* Inline New Source Card - Minimal Design */}
                          {isAddingNewSource && (
                            <div className="p-3 rounded-md border-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/70 shadow-md animate-in fade-in-50 duration-200 min-h-[68px] flex items-center">
                              <div className="flex items-center gap-2 w-full">
                                <div className="flex-1">
                                  <Input
                                    placeholder={t('crawls.sourceName')}
                                    value={newSourceName}
                                    onChange={(e) => setNewSourceName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && newSourceName.trim()) {
                                        handleSaveNewSource();
                                      } else if (e.key === 'Escape') {
                                        setIsAddingNewSource(false);
                                        setNewSourceName('');
                                      }
                                    }}
                                    disabled={isSavingNewSource}
                                    className="h-9 text-sm font-mono border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-500"
                                    autoFocus
                                  />
                                </div>

                                {/* Save Button - Direct without tooltip */}
                                <Button
                                  onClick={handleSaveNewSource}
                                  size="sm"
                                  disabled={isSavingNewSource || !newSourceName.trim()}
                                  className="h-9 w-9 p-0 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                                >
                                  {isSavingNewSource ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4" />
                                  )}
                                </Button>

                                {/* Cancel Button */}
                                <Button
                                  onClick={() => {
                                    setIsAddingNewSource(false);
                                    setNewSourceName('');
                                  }}
                                  disabled={isSavingNewSource}
                                  size="sm"
                                  variant="ghost"
                                  className="h-9 w-9 p-0 hover:bg-red-100 dark:hover:bg-red-900/30"
                                >
                                  <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Show empty state if no directories and not adding new */}
                          {directories.length === 0 && !isAddingNewSource && (
                            <div className="text-center py-12 text-muted-foreground">
                              <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
                              <p className="text-sm">No crawler sources found</p>
                              <p className="text-xs mt-2">Click + to add a new source</p>
                            </div>
                          )}

                          {directories.map(directory => (
                            <div
                              key={directory.id}
                              className={`p-3 rounded-md transition-all relative group ${
                                selectedDirectory?.id === directory.id
                                  ? 'bg-slate-200 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 shadow-sm'
                                  : 'bg-slate-100 dark:bg-slate-900/70 hover:bg-slate-200 dark:hover:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700/60'
                              }`}
                            >
                              {/* Delete button - top right corner, separated from content */}
                              <div className="absolute top-2 right-2 z-10">
                                <ConfirmTooltip
                                  onConfirm={() => handleDeleteDirectory(directory)}
                                  message="Delete this crawler source and all its data?"
                                  side="left"
                                >
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </ConfirmTooltip>
                              </div>

                              {/* Card content - clickable */}
                              <div
                                className="cursor-pointer pr-8"
                                onClick={() => handleDirectorySelect(directory)}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  {editingDirectoryId === directory.id ? (
                                    // Inline edit mode
                                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                      <Input
                                        value={editingDirectoryName}
                                        onChange={(e) => setEditingDirectoryName(e.target.value)}
                                        className="h-6 text-sm px-2 flex-1"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleRenameDirectory(directory, editingDirectoryName);
                                          } else if (e.key === 'Escape') {
                                            setEditingDirectoryId(null);
                                            setEditingDirectoryName('');
                                          }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900/30"
                                        onClick={() => handleRenameDirectory(directory, editingDirectoryName)}
                                      >
                                        <Check className="w-3 h-3 text-green-600" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/30"
                                        onClick={() => {
                                          setEditingDirectoryId(null);
                                          setEditingDirectoryName('');
                                        }}
                                      >
                                        <X className="w-3 h-3 text-red-600" />
                                      </Button>
                                    </div>
                                  ) : (
                                    // Normal display mode
                                    <div className="flex items-center gap-1 flex-1 group/name">
                                      <h3 className="font-semibold text-sm">{directory.displayName}</h3>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0 opacity-0 group-hover/name:opacity-100 transition-opacity hover:bg-slate-200 dark:hover:bg-slate-700"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingDirectoryId(directory.id);
                                          setEditingDirectoryName(directory.displayName);
                                        }}
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {directory.itemCount}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate mb-2">{directory.displayName}</p>

                                {/* Python script indicator/upload */}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                                    {pythonScripts.has(directory.name) ? (
                                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400 flex-1">
                                        {/* Edit script button */}
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 w-5 p-0 flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            // Load script content and state.json
                                            try {
                                              // Load script content
                                              const scriptResponse = await fetchWithAuth(
                                                `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script`
                                              );
                                              if (scriptResponse.ok) {
                                                const text = await scriptResponse.text();
                                                setScriptContent(text);
                                                setEditingScript({ directory, content: text });

                                                // Load state.json
                                                try {
                                                  const stateResponse = await fetchWithAuth(
                                                    `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/state`
                                                  );
                                                  if (stateResponse.ok) {
                                                    const stateData = await stateResponse.json();
                                                    if (stateData.hasState) {
                                                      setCrawlerStates(prev => new Map(prev).set(directory.name, stateData.state));
                                                    }
                                                  }
                                                } catch (stateError) {
                                                  console.log('No state file found (normal for new crawlers)');
                                                }

                                                setShowScriptEditor(true);
                                              } else {
                                                throw new Error('Failed to load script');
                                              }
                                            } catch (error) {
                                              console.error('Failed to load script:', error);
                                              const errorMessage = error instanceof Error ? error.message : 'Failed to load script';
                                              toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
                                            }
                                          }}
                                          title="Edit script"
                                        >
                                          <FileText className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                                        </Button>

                                        {/* Play/Stop button */}
                                        {!runningScripts.has(directory.name) ? (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-5 w-5 p-0 flex-shrink-0 hover:bg-green-50 dark:hover:bg-green-900/20"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setShowUrlInput(directory.name);
                                            }}
                                            title="Run script"
                                          >
                                            <Play className="w-3 h-3 text-green-600 dark:text-green-400" />
                                          </Button>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-5 w-5 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              // Stop script via backend
                                              try {
                                                await fetchWithAuth(
                                                  `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script/stop`,
                                                  {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ jobId: currentJobId })
                                                  }
                                                );

                                                // Remove from running scripts immediately
                                                setRunningScripts(prev => {
                                                  const next = new Set(prev);
                                                  next.delete(directory.name);
                                                  return next;
                                                });

                                                toast({
                                                  title: 'Script Stopped',
                                                  description: `${directory.displayName} crawler stopped`
                                                });
                                              } catch (error) {
                                                console.error('Failed to stop script:', error);
                                                toast({
                                                  title: 'Error',
                                                  description: 'Failed to stop script',
                                                  variant: 'destructive'
                                                });
                                              }
                                            }}
                                            title="Stop script"
                                          >
                                            <Square className="w-3 h-3 text-red-600 dark:text-red-400" />
                                          </Button>
                                        )}

                                        {/* Inline URL Input or Script Name */}
                                        {showUrlInput === directory.name ? (
                                          <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <div className="relative flex-1 min-w-0 overflow-hidden">
                                              <MousePointer2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                              <Input
                                                type="url"
                                                placeholder="https://example.com"
                                                className="h-6 text-xs pl-7 pr-2 border-slate-300 dark:border-slate-600 w-full truncate"
                                                autoFocus
                                                value={scriptUrls.get(directory.name) || ''}
                                                onChange={(e) => {
                                                  setScriptUrls(prev => new Map(prev).set(directory.name, e.target.value));
                                                }}
                                                onKeyDown={(e) => {
                                                  console.log('[URL Input] Key pressed:', e.key);
                                                  if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const url = scriptUrls.get(directory.name);
                                                    console.log('[URL Input] Enter pressed, URL:', url);
                                                    if (url && url.trim()) {
                                                      console.log('[URL Input] Starting script for', directory.name);
                                                      // Start script
                                                      setRunningScripts(prev => new Set(prev).add(directory.name));
                                                      setShowUrlInput(null);
                                                      handleRunScript(directory, url);
                                                    } else {
                                                      console.warn('[URL Input] URL is empty');
                                                      toast({ title: 'URL Required', description: 'Please enter a URL', variant: 'destructive' });
                                                    }
                                                  } else if (e.key === 'Escape') {
                                                    setShowUrlInput(null);
                                                  }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                            </div>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-5 w-5 p-0"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setShowUrlInput(null);
                                              }}
                                            >
                                              <X className="w-3 h-3 text-slate-500" />
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="relative flex items-center justify-between flex-1 min-w-0 px-2 py-1 rounded-md bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 overflow-hidden">
                                            {/* Animated background when running */}
                                            {runningScripts.has(directory.name) && (
                                              <div className="absolute inset-0 bg-gradient-to-r from-green-500/30 via-green-400/20 to-transparent animate-pulse" style={{ animationDuration: '2s' }} />
                                            )}

                                            <div className="text-[10px] font-medium text-slate-700 dark:text-slate-300 relative z-10 flex items-center gap-2 flex-1 min-w-0">
                                              {runningScripts.has(directory.name) ? (
                                                // Show queue/progress from Redis when running
                                                (() => {
                                                  const state = crawlerStates.get(directory.name);
                                                  if (state) {
                                                    const queueCount = state.queue?.length || 0;
                                                    const visitedCount = state.visited?.length || 0;
                                                    const total = queueCount + visitedCount;
                                                    const progress = total > 0 ? Math.round((visitedCount / total) * 100) : 0;
                                                    return (
                                                      <>
                                                        <span className="opacity-70">Q:{queueCount}</span>
                                                        <span className="opacity-50">•</span>
                                                        <span className="opacity-70">{progress}%</span>
                                                      </>
                                                    );
                                                  }
                                                  const url = scriptUrls.get(directory.name) || pythonScripts.get(directory.name)?.name || '';
                                                  return <span className="truncate block">{url}</span>;
                                                })()
                                              ) : (
                                                // Show script name when idle
                                                <span className="truncate block">{pythonScripts.get(directory.name)?.name}</span>
                                              )}
                                            </div>

                                            {/* Delete button (only when idle) */}
                                            {!runningScripts.has(directory.name) && (
                                              <ConfirmTooltip
                                                onConfirm={() => handleDeletePythonScript(directory)}
                                                message="Delete this Python script?"
                                                side="top"
                                              >
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-4 w-4 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-60 hover:opacity-100 transition-opacity"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <X className="w-2.5 h-2.5 text-red-500" />
                                                </Button>
                                              </ConfirmTooltip>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : showCrawlerSelect === directory.name ? (
                                      // Crawler selection dropdown
                                      <div className="flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                        <div className="text-[8px] text-muted-foreground mb-0.5">Select Crawler:</div>
                                        <div className="grid grid-cols-2 gap-1">
                                          {builtInCrawlers.map(crawler => (
                                            <button
                                              key={crawler.name}
                                              onClick={() => handleSelectBuiltInCrawler(directory, crawler.name)}
                                              className="px-2 py-1 text-[9px] rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-left transition-colors"
                                            >
                                              {crawler.label}
                                            </button>
                                          ))}
                                        </div>
                                        <div className="flex items-center gap-1 mt-1">
                                          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex-1">
                                            <Plus className="w-3 h-3" />
                                            Custom .py
                                            <input
                                              type="file"
                                              accept=".py"
                                              className="hidden"
                                              onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                              handlePythonScriptUpload(directory, file);
                                              setShowCrawlerSelect(null);
                                            }
                                            e.target.value = ''; // Reset input
                                          }}
                                          disabled={uploadingScript === directory.id}
                                        />
                                      </label>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0"
                                        onClick={() => setShowCrawlerSelect(null)}
                                      >
                                        <X className="w-3 h-3 text-slate-500" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  // Initial button to show crawler selection
                                  <button
                                    onClick={() => setShowCrawlerSelect(directory.name)}
                                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-[8px]"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Attach script</span>
                                  </button>
                                )}
                              </div>

                              {/* Floating widgets will be rendered outside the card */}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                  </CardContent>
                </Card>
              </div>

              {/* Right Side - Data Preview & Workflow */}
              <div className="lg:col-span-2">
                {/* Empty state - No source selected */}
                {!selectedDirectory && (
                  <Card className="h-[calc(100vh-200px)] flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <div className="text-center px-8 py-12">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 mb-6">
                        <Database className="w-10 h-10 text-slate-400 dark:text-slate-500" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-3">
                        Select a Crawler Source
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                        Choose a source from the left panel to preview data, configure mappings, and import to your database
                      </p>
                      <div className="flex items-center justify-center gap-6 mt-8 text-xs text-slate-400 dark:text-slate-500">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          <span>Preview</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Columns className="w-4 h-4" />
                          <span>Map Fields</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          <span>Import</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {workflowStep === 'preview-data' && selectedDirectory && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-4">
                          <CardTitle>{selectedDirectory.displayName}</CardTitle>
                          <CardDescription className="text-xs">
                            {crawledItems.length} of {totalItemsCount} loaded
                          </CardDescription>
                        </div>
                        <Button
                          onClick={handleRefresh}
                          disabled={isRefreshing || itemsLoading}
                          variant="ghost"
                          size="sm"
                        >
                          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Unified Controls */}
                        <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="select-all"
                              checked={selectedForRecrawl.size === filteredItems.length && filteredItems.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedForRecrawl(new Set(filteredItems.map(item => item.id)));
                                  setSelectedForAnalyze(new Set(filteredItems.map(item => item.id)));
                                } else {
                                  setSelectedForRecrawl(new Set());
                                  setSelectedForAnalyze(new Set());
                                }
                              }}
                            />
                            <Label htmlFor="select-all" className="text-sm cursor-pointer">
                              {Math.max(selectedForRecrawl.size, selectedForAnalyze.size)}/{filteredItems.length}
                            </Label>
                          </div>

                          <div className="flex items-center gap-2 flex-1">
                            <Search className="w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="Search..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="h-8 max-w-xs"
                            />
                          </div>

                          <div className="flex gap-2 ml-auto">
                            {selectedForRecrawl.size > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleBulkRecrawl}
                                disabled={bulkRecrawling}
                                className="h-8 text-xs px-3"
                              >
                                {bulkRecrawling ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    Recrawling...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Recrawl ({selectedForRecrawl.size})
                                  </>
                                )}
                              </Button>
                            )}
                            {(selectedForRecrawl.size > 0 || selectedForAnalyze.size > 0) && (
                              <ConfirmTooltip
                                onConfirm={handleBulkDelete}
                                message={`Delete ${Math.max(selectedForRecrawl.size, selectedForAnalyze.size)} selected items?`}
                                side="top"
                              >
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-3 text-xs hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" />
                                  Delete ({Math.max(selectedForRecrawl.size, selectedForAnalyze.size)})
                                </Button>
                              </ConfirmTooltip>
                            )}
                          </div>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader className="bg-gray-50 dark:bg-gray-900">
                                <TableRow>
                                  <TableHead className="w-10">
                                    <Checkbox
                                      id="select-all-table"
                                      checked={selectedForRecrawl.size === filteredItems.length && filteredItems.length > 0}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setSelectedForRecrawl(new Set(filteredItems.map(item => item.id)));
                                          setSelectedForAnalyze(new Set(filteredItems.map(item => item.id)));
                                        } else {
                                          setSelectedForRecrawl(new Set());
                                          setSelectedForAnalyze(new Set());
                                        }
                                      }}
                                    />
                                  </TableHead>
                                  <TableHead>Name</TableHead>
                                  <TableHead className="w-32">Status</TableHead>
                                  <TableHead className="w-24">Date</TableHead>
                                </TableRow>
                              </TableHeader>
                            </Table>
                          </div>
                          <ScrollArea className="h-[500px]">
                            <Table>
                              <TableBody>
                                {itemsLoading ? (
                                  <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12">
                                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                                      <p className="text-sm text-muted-foreground mt-2">Loading items...</p>
                                    </TableCell>
                                  </TableRow>
                                ) : filteredItems.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12">
                                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                                      <p className="text-sm text-muted-foreground">No items found</p>
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  <>
                                    {filteredItems.map(item => {
                                      const isSelected = selectedForRecrawl.has(item.id) || selectedForAnalyze.has(item.id);
                                      const status = getAnalyzeStatus(item);
                                      const template = getAnalyzeTemplate(item);

                                      return (
                                        <TableRow
                                          key={item.id}
                                          className={`hover:bg-muted/50 transition-colors duration-150 ${isSelected ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                                        >
                                          <TableCell>
                                            <Checkbox
                                              checked={isSelected}
                                              onCheckedChange={(checked) => {
                                                const newRecrawl = new Set(selectedForRecrawl);
                                                const newAnalyze = new Set(selectedForAnalyze);
                                                if (checked) {
                                                  newRecrawl.add(item.id);
                                                  newAnalyze.add(item.id);
                                                } else {
                                                  newRecrawl.delete(item.id);
                                                  newAnalyze.delete(item.id);
                                                }
                                                setSelectedForRecrawl(newRecrawl);
                                                setSelectedForAnalyze(newAnalyze);
                                              }}
                                            />
                                          </TableCell>
                                          <TableCell className="font-medium max-w-[400px]" title={item.title}>
                                            <div className="truncate">
                                              {item.title}
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <div className="flex items-center gap-1 cursor-pointer group">
                                                  <Badge
                                                    variant="outline"
                                                    className={`text-xs font-medium border transition-all duration-150 ${
                                                      status === 'waiting' ? 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400' :
                                                      status === 'analyzed' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400' :
                                                      'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                                                    } hover:opacity-80`}
                                                  >
                                                    {analyzingItems.has(item.id) ? (
                                                      <>
                                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                        Analyzing
                                                      </>
                                                    ) : (
                                                      status === 'waiting' ? 'Waiting' :
                                                      status === 'analyzed' ? 'Analyzed' : 'Transformed'
                                                    )}
                                                  </Badge>
                                                  <MoreHorizontal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={async () => await handleEditItem(item)}>
                                                  <Eye className="w-3 h-3 mr-2" />
                                                  Preview
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                  onClick={() => handleRecrawl(item)}
                                                  disabled={recrawlingItems.has(item.url || '') || !item.url}
                                                >
                                                  <Radar className="w-3 h-3 mr-2" />
                                                  Recrawl
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                  onClick={() => handleDeleteItem(item.key)}
                                                  className="text-red-600 focus:text-red-600"
                                                >
                                                  <Trash2 className="w-3 h-3 mr-2" />
                                                  Delete
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </TableCell>
                                          <TableCell className="text-xs">
                                            {item.scrapedAt ? new Date(item.scrapedAt).toLocaleDateString('en-US', {
                                              month: '2-digit',
                                              day: '2-digit',
                                              year: 'numeric'
                                            }) : '-'}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}

                                    {/* Load More Row */}
                                    {hasMoreItems && !loadingMore && (
                                      <TableRow>
                                        <TableCell colSpan={4} className="text-center py-4">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={loadMoreItems}
                                            className="w-full max-w-md"
                                          >
                                            Load More ({totalItemsCount - crawledItems.length} remaining)
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    )}

                                    {/* Loading indicator */}
                                    {loadingMore && (
                                      <TableRow>
                                        <TableCell colSpan={6} className="text-center py-4">
                                          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                                          <p className="text-xs text-muted-foreground mt-2">Loading more items...</p>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </>
                                )}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>

                        <div className="flex justify-between">
                          <Button variant="outline" onClick={() => setWorkflowStep('select-source')}>
                            ← Back
                          </Button>
                          <Button
                            onClick={performEntityAnalysis}
                            disabled={analyzing}
                            className="bg-slate-600 hover:bg-slate-700"
                          >
                            {analyzing ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Analyzing...
                              </>
                            ) : (
                              <>
                                Continue
                                <ArrowRight className="w-4 h-4 ml-2" />
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {workflowStep === 'select-target' && entityAnalysis && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Select Target Table</CardTitle>
                      <CardDescription>Choose existing table or create new one</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Data Transformation Summary */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h4 className="font-semibold text-sm mb-3">Data Transformation</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Total Items</p>
                            <p className="text-lg font-bold text-slate-600 dark:text-slate-300">{selectedItems.size > 0 ? selectedItems.size : crawledItems.length}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Fields</p>
                            <p className="text-lg font-bold text-slate-600 dark:text-slate-300">{entityAnalysis.totalFields}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Required</p>
                            <p className="text-lg font-bold text-green-600">{entityAnalysis.requiredFields}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Optional</p>
                            <p className="text-lg font-bold text-blue-600">{entityAnalysis.optionalFields}</p>
                          </div>
                        </div>
                      </div>

                      {/* Table Selection */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={createNewTable}
                            onCheckedChange={(checked) => setCreateNewTable(checked as boolean)}
                          />
                          <Label>Create new table</Label>
                        </div>

                        {createNewTable ? (
                          <div>
                            <Label htmlFor="newTableName">New Table Name</Label>
                            <Input
                              id="newTableName"
                              value={newTableName}
                              onChange={(e) => setNewTableName(e.target.value)}
                              placeholder="e.g., books, articles, products"
                              className="mt-2"
                            />
                          </div>
                        ) : (
                          <div>
                            <Label htmlFor="targetTable">Select Existing Table</Label>
                            <Select value={selectedTargetTable} onValueChange={setSelectedTargetTable}>
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Choose a table" />
                              </SelectTrigger>
                              <SelectContent>
                                {sourceTables.map(table => (
                                  <SelectItem key={table.name} value={table.name}>
                                    {table.name} ({table.rowCount} rows)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700">
                          <Label htmlFor="autoEmbeddings" className="font-medium">Auto-generate embeddings</Label>
                          <Switch
                            id="autoEmbeddings"
                            checked={autoEmbeddings}
                            onCheckedChange={setAutoEmbeddings}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between">
                        <Button variant="outline" onClick={() => setWorkflowStep('preview-data')}>
                          ← Back
                        </Button>
                        <Button
                          onClick={() => setWorkflowStep('mapping')}
                          disabled={!createNewTable && !selectedTargetTable}
                          className="bg-slate-600 hover:bg-slate-700"
                        >
                          Next: Mapping
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {workflowStep === 'mapping' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Column Mapping</CardTitle>
                      <CardDescription>Review and adjust field mappings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {importing && (
                        <Card className="border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                          <CardContent className="p-6">
                            <div className="flex items-center gap-6">
                              <div className="flex-shrink-0">
                                <ProgressCircle
                                  progress={Math.round(importProgress)}
                                  showPulse={importProgress < 100}
                                  size={80}
                                />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-sm mb-1">
                                  {createNewTable ? 'Creating Table & Importing Data' : 'Importing Data'}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  Processing batches... {Math.round(importProgress)}% complete
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Mapping {columnMappings.length} fields to table: {createNewTable ? newTableName : selectedTargetTable}
                        </AlertDescription>
                      </Alert>

                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                          {columnMappings.map((mapping, index) => (
                            <div key={index} className="p-3 border rounded-lg">
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs">Source Field</Label>
                                  <Input
                                    value={mapping.originalField}
                                    disabled
                                    className="mt-1 text-xs bg-gray-100 dark:bg-gray-800"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Column Name</Label>
                                  <Input
                                    value={mapping.columnName}
                                    onChange={(e) => {
                                      const newMappings = [...columnMappings];
                                      newMappings[index].columnName = e.target.value;
                                      setColumnMappings(newMappings);
                                    }}
                                    className="mt-1 text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">SQL Type</Label>
                                  <Input
                                    value={mapping.sqlType}
                                    onChange={(e) => {
                                      const newMappings = [...columnMappings];
                                      newMappings[index].sqlType = e.target.value;
                                      setColumnMappings(newMappings);
                                    }}
                                    className="mt-1 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>

                      <div className="flex justify-between">
                        <Button
                          variant="outline"
                          onClick={() => setWorkflowStep('select-target')}
                          disabled={importing}
                        >
                          ← Back
                        </Button>
                        <Button
                          onClick={handleImport}
                          disabled={importing}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {importing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              Import to Database
                              <Database className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {workflowStep === 'import' && (
                  <Card>
                    <CardContent className="p-12">
                      <div className="text-center space-y-6">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
                          <CheckCircle className="w-12 h-12 text-green-600" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold mb-2">Import Completed!</h3>
                          <p className="text-muted-foreground">
                            Successfully imported {crawledItems.length} items to {createNewTable ? newTableName : selectedTargetTable}
                          </p>
                        </div>
                        <div className="flex justify-center gap-3">
                          <Button
                            onClick={() => {
                              setWorkflowStep('select-source');
                              setSelectedDirectory(null);
                            }}
                          >
                            Import More Data
                          </Button>
                          <Button variant="outline" onClick={() => window.location.href = '/dashboard/migrations'}>
                            View in Migrations
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Item Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-5xl max-h-fit p-0 gap-0 overflow-hidden flex flex-col !z-[10000]">
          {/* Modal Header - Fixed - 3D Glassmorphic */}
          <div className="flex-shrink-0 px-6 py-4 relative">
            {/* 3D Background Layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-800 dark:via-slate-850 dark:to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),0_8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_0_rgba(0,0,0,0.4)] border-b border-slate-300/50 dark:border-slate-700/50" />

            <div className="relative z-10">
              {/* Single line header: key (description) • [TYPE] • size */}
              {editingItem && (
                <DialogTitle className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span>
                    {editingItem.key}
                    {editingItem.data.description && (
                      <span className="text-muted-foreground text-[11px] ml-1">
                        ({editingItem.data.description})
                      </span>
                    )}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  {editingItem.data.type && (
                    <>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                        {editingItem.data.type.toUpperCase()}
                      </Badge>
                      {editingItem.data.file_size && <span className="text-slate-300 dark:text-slate-700">•</span>}
                    </>
                  )}
                  {editingItem.data.file_size && (
                    <span className="text-muted-foreground text-[11px]">
                      {(editingItem.data.file_size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </DialogTitle>
              )}
            </div>
            <DialogDescription className="sr-only">
              Edit crawl data for {editingItem?.title}
            </DialogDescription>
          </div>

          {/* Modal Content - Scrollable */}
          <div className="overflow-hidden px-6 py-4 bg-white dark:bg-slate-900">

            {/* Content Editor */}
            <div className="space-y-2">
              {extractingPdfText ? (
                <div className="h-[360px] flex flex-col items-center justify-center bg-muted/30 rounded-lg">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">OCR Analyzing...</p>
                  <p className="text-xs text-muted-foreground mt-1">Extracting text from PDF</p>
                </div>
              ) : (
                <ScrollArea className="h-[360px]">
                  <textarea
                    id="contentEditor"
                    value={editedData}
                    onChange={(e) => setEditedData(e.target.value)}
                    className="w-full min-h-[360px] p-4 font-mono text-sm bg-muted/30 rounded-lg text-foreground border-0 focus:outline-none resize-none"
                    spellCheck={false}
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      lineHeight: '1.6'
                    }}
                  />
                </ScrollArea>
              )}
            </div>
          </div>

          {/* Modal Footer - Fixed - 3D Glassmorphic */}
          <div className="flex-shrink-0 px-6 py-3 relative">
            {/* 3D Background Layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-850 dark:to-slate-800" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.8),0_-8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.05),0_-8px_32px_0_rgba(0,0,0,0.4)] border-t border-slate-300/50 dark:border-slate-700/50" />

            <div className="flex items-center justify-between relative z-10">
              <div className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-[60%]" title={editingItem?.data?.url}>
                {editingItem?.data?.url || editingItem?.key || ''}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingItem(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  className="bg-slate-600 hover:bg-slate-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* URL Input / Log Viewer Dialog for Script Run */}
      <Dialog open={showUrlDialog} onOpenChange={(open) => {
        setShowUrlDialog(open);
        if (!open) {
          setIsScriptRunning(false);
          setCurrentJobId(null);
          setScriptUrl('');
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col !z-[10000] p-0">
          {/* 3D Glassmorphic Header */}
          <div className="px-6 py-4 relative">
            {/* 3D Background Layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-800 dark:via-slate-850 dark:to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),0_8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_0_rgba(0,0,0,0.4)] border-b border-slate-300/50 dark:border-slate-700/50" />

            <div className="relative z-10">
              <DialogTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {isScriptRunning ? `Running: ${urlDialogDirectory?.displayName}` : `Run Crawler Script`}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {isScriptRunning
                  ? `Crawling ${scriptUrl} - Logs updating in real-time`
                  : `Enter the URL to crawl with ${urlDialogDirectory?.displayName}`
                }
              </DialogDescription>
            </div>
          </div>

          {!isScriptRunning ? (
            // URL Input View
            <>
              <div className="flex-1 px-6 py-6 bg-white dark:bg-slate-900">
                <div className="space-y-2">
                  <Label htmlFor="script-url" className="text-sm font-medium text-slate-700 dark:text-slate-300">Target URL</Label>
                  <Input
                    id="script-url"
                    type="url"
                    placeholder="https://example.com"
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRunScript();
                      }
                    }}
                    className="border-slate-300 dark:border-slate-700"
                    autoFocus
                  />
                </div>
              </div>

              {/* 3D Glassmorphic Footer */}
              <div className="px-6 py-4 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-850 dark:to-slate-800" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
                <div className="absolute inset-0 backdrop-blur-xl" />
                <div className="absolute inset-0 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.8),0_-8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.05),0_-8px_32px_0_rgba(0,0,0,0.4)] border-t border-slate-300/50 dark:border-slate-700/50" />

                <div className="flex justify-end gap-2 relative z-10">
                  <Button
                    variant="ghost"
                    onClick={() => setShowUrlDialog(false)}
                    className="text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRunScript}
                    className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white"
                  >
                    Run Script
                  </Button>
                </div>
              </div>
            </>
          ) : (
            // Log Viewer View
            <div className="flex-1 flex flex-col min-h-0 py-4">
              <div className="flex-1 bg-slate-950 rounded-lg overflow-hidden border border-slate-700 flex flex-col">
                {/* Terminal Header */}
                <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="text-slate-400 text-[10px] font-mono">
                      {urlDialogDirectory?.name}.py
                    </span>
                    {scriptStartTime && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>{scriptStartTime.toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isScriptPaused ? (
                      <Activity className="w-3 h-3 text-green-400 animate-pulse" />
                    ) : (
                      <Pause className="w-3 h-3 text-yellow-400" />
                    )}
                    <span className="text-xs text-slate-400">
                      {isScriptPaused ? 'Paused' : 'Running'}
                    </span>
                  </div>
                </div>

                {/* Log Content */}
                <div className="flex-1 p-4 overflow-auto">
                  <pre className="font-mono text-xs text-green-400 whitespace-pre-wrap">
                    {currentJobId && scriptLogs.get(currentJobId)?.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    )) || <span className="text-slate-500">Waiting for logs...</span>}
                  </pre>
                </div>
              </div>

              <div className="flex justify-between items-center mt-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{currentJobId && scriptLogs.get(currentJobId)?.length || 0} log entries</span>
                  {scriptStartTime && (
                    <>
                      <span>•</span>
                      <span>Started: {scriptStartTime.toLocaleTimeString()}</span>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsScriptPaused(!isScriptPaused);
                      toast({
                        title: isScriptPaused ? 'Resumed' : 'Paused',
                        description: isScriptPaused ? 'Script execution resumed' : 'Script execution paused'
                      });
                    }}
                    className={isScriptPaused ? 'text-green-600' : 'text-yellow-600'}
                  >
                    {isScriptPaused ? 'Resume' : 'Pause'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowUrlDialog(false);
                      setIsScriptRunning(false);
                      setCurrentJobId(null);
                      setScriptStartTime(null);
                      setIsScriptPaused(false);
                      toast({ title: 'Stopped', description: 'Script execution stopped' });
                    }}
                    className="text-red-600"
                  >
                    <StopCircle className="w-3.5 h-3.5 mr-1.5" />
                    Stop
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (currentJobId) {
                        setScriptLogs(prev => {
                          const updated = new Map(prev);
                          updated.set(currentJobId, []);
                          return updated;
                        });
                      }
                    }}
                  >
                    Clear Logs
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Script Editor Modal */}
      <Dialog open={showScriptEditor} onOpenChange={setShowScriptEditor}>
        <DialogContent className="max-w-6xl h-[95vh] p-0 flex flex-col !z-[10000]">
          {/* 3D Glassmorphic Header */}
          <div className="px-6 py-4 relative">
            {/* 3D Background Layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-800 dark:via-slate-850 dark:to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),0_8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_0_rgba(0,0,0,0.4)] border-b border-slate-300/50 dark:border-slate-700/50" />

            <DialogTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 relative z-10">
              {editingScript?.directory.name}.py - Editing
            </DialogTitle>
          </div>

          {/* Two-column layout: Code editor + State viewer */}
          <div className="flex-1 overflow-hidden p-4 flex gap-4 bg-white dark:bg-slate-900">
            {/* Left: Code editor */}
            <div className="flex-1 h-full rounded-lg overflow-hidden shadow-lg border border-slate-200 dark:border-slate-800">
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                className="w-full h-full font-mono text-sm p-4 bg-white dark:bg-slate-950 text-slate-800 dark:text-green-400 resize-none focus:outline-none"
                spellCheck={false}
                autoFocus
                style={{
                  lineHeight: '1.6',
                  tabSize: 4,
                }}
              />
            </div>

            {/* Right: State.json viewer */}
            {editingScript && crawlerStates.has(editingScript.directory.name) && (
              <div className="w-80 h-full rounded-lg overflow-hidden shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Crawler State
                  </h3>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-3">
                  {(() => {
                    const state = crawlerStates.get(editingScript.directory.name);
                    return (
                      <>
                        {/* Queue */}
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Queue
                          </div>
                          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                            {state?.queue?.length || 0}
                          </div>
                          <div className="text-xs text-slate-500">URLs pending</div>
                        </div>

                        {/* Visited */}
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Visited
                          </div>
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {state?.visited?.length || 0}
                          </div>
                          <div className="text-xs text-slate-500">URLs crawled</div>
                        </div>

                        {/* Failed */}
                        {state?.failed_urls && state.failed_urls.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                              Failed
                            </div>
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                              {state.failed_urls.length}
                            </div>
                            <div className="text-xs text-slate-500">URLs failed</div>
                          </div>
                        )}

                        {/* Progress */}
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Progress
                          </div>
                          <div className="text-sm font-mono text-slate-700 dark:text-slate-300">
                            {Math.round((state?.visited?.length || 0) / ((state?.visited?.length || 0) + (state?.queue?.length || 1)) * 100)}%
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                            <div
                              className="bg-green-600 dark:bg-green-400 h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.round((state?.visited?.length || 0) / ((state?.visited?.length || 0) + (state?.queue?.length || 1)) * 100)}%`
                              }}
                            />
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* 3D Glassmorphic Footer */}
          <div className="flex items-center justify-between px-6 py-4 relative">
            {/* 3D Background Layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-850 dark:to-slate-800" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.8),0_-8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.05),0_-8px_32px_0_rgba(0,0,0,0.4)] border-t border-slate-300/50 dark:border-slate-700/50" />

            <div className="text-xs text-slate-600 dark:text-slate-400 font-mono relative z-10">
              {scriptContent.split('\n').length} lines • {scriptContent.length} characters
            </div>
            <Button
              onClick={handleSaveScript}
              size="sm"
              className="relative z-10"
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
