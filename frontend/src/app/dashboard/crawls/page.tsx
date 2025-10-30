'use client';

import React, { useState, useEffect } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  RefreshCw,
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
  Square,
  Terminal,
  ChevronDown,
  ChevronUp,
  X,
  Activity,
  Globe
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

export default function CrawlerDataPage() {
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
  const [autoEmbeddings, setAutoEmbeddings] = useState(true);
  const [editingItem, setEditingItem] = useState<CrawledItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editedData, setEditedData] = useState<string>('');
  const [pythonScripts, setPythonScripts] = useState<Map<string, File>>(new Map());
  const [uploadingScript, setUploadingScript] = useState<string | null>(null);
  const [itemsOffset, setItemsOffset] = useState(0);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalItemsCount, setTotalItemsCount] = useState(0);
  const [runningScripts, setRunningScripts] = useState<Map<string, string>>(new Map()); // crawlerName -> jobId
  const [scriptLogs, setScriptLogs] = useState<Map<string, string[]>>(new Map()); // jobId -> logs
  const [showLogViewer, setShowLogViewer] = useState<string | null>(null); // crawlerName
  const [logWidgetMinimized, setLogWidgetMinimized] = useState(false);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlDialogDirectory, setUrlDialogDirectory] = useState<CrawlerDirectory | null>(null);
  const [scriptUrl, setScriptUrl] = useState('');
  const [isScriptRunning, setIsScriptRunning] = useState(false);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [editingScript, setEditingScript] = useState<{ directory: CrawlerDirectory; content: string } | null>(null);
  const [scriptContent, setScriptContent] = useState('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

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
  }, []);

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

          // Remove from running scripts after a delay
          setTimeout(() => {
            setRunningScripts(prev => {
              const newMap = new Map(prev);
              // Find and remove the crawler that has this jobId
              for (const [crawlerName, jid] of newMap.entries()) {
                if (jid === jobId) {
                  newMap.delete(crawlerName);
                  break;
                }
              }
              return newMap;
            });
          }, 3000);
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

  const loadPythonScripts = async () => {
    const scriptsMap = new Map<string, File>();

    for (const directory of directories) {
      try {
        const response = await fetchWithAuth(
          `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script`
        );

        if (!response.ok) continue;

        const data = await response.json();
        if (data.hasScript) {
          // Create a virtual File object to represent the existing script
          const virtualFile = new File([], data.filename, { type: 'text/x-python' });
          Object.defineProperty(virtualFile, 'size', { value: data.size, writable: false });
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

  const fetchCrawledItems = async (crawlerName: string, offset: number = 0, append: boolean = false) => {
    try {
      if (!append) setItemsLoading(true);
      else setLoadingMore(true);

      // Fetch items with pagination - 100 items at a time
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${crawlerName}/data?limit=100&offset=${offset}`
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

      console.log(`✅ Loaded ${data.data?.length || 0} items (Offset: ${offset}, Total: ${data.total || 0}, Has More: ${data.hasMore})`);

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
    await fetchCrawledItems(selectedDirectory.name, itemsOffset, true);
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

  const handleEditItem = (item: CrawledItem) => {
    setEditingItem(item);

    // Extract only the content from the data, preserving line breaks
    let contentText = '';

    // Check for various content field names used by different scrapers
    if (item.data.script_text) {
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

  const handleRunScript = async () => {
    if (!urlDialogDirectory) return;
    if (!scriptUrl.trim()) {
      toast({ title: 'URL Required', description: 'Please enter a URL to crawl', variant: 'destructive' });
      return;
    }

    const directory = urlDialogDirectory;
    setIsScriptRunning(true);

    try {
      console.log(`[Run Script] Starting script for ${directory.name} with URL: ${scriptUrl}`);

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script/run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: scriptUrl })
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
      setRunningScripts(prev => new Map(prev).set(directory.name, result.jobId));
      setScriptLogs(prev => new Map(prev).set(result.jobId, [`[${new Date().toLocaleTimeString()}] Script started\n[${new Date().toLocaleTimeString()}] Crawling URL: ${scriptUrl}\n`]));

      toast({ title: 'Script Running', description: `${directory.displayName} crawler started` });
    } catch (error: any) {
      console.error('[Run Script] Error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to run script', variant: 'destructive' });
      setIsScriptRunning(false);
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

  const filteredItems = crawledItems.filter(item =>
    item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.key?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <Button onClick={fetchDirectories} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
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
                  {['Select Source', 'Preview Data', 'Select Target', 'Mapping', 'Import'].map((label, index) => {
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
                <Card className="h-[calc(100vh-280px)]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Crawler Sources</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[calc(100%-60px)]">
                    <ScrollArea className="h-full pr-2">
                      {loading ? (
                        <ListSkeleton count={5} />
                      ) : directories.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
                          <p className="text-sm">No crawler sources found</p>
                        </div>
                      ) : (
                        <div className="space-y-2 pr-1">
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
                                  <h3 className="font-semibold text-sm">{directory.displayName}</h3>
                                  <Badge variant="secondary" className="text-xs">
                                    {directory.itemCount}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate mb-2">{directory.name}</p>

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
                                            // Load script content
                                            try {
                                              const response = await fetchWithAuth(
                                                `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${directory.name}/script`
                                              );
                                              if (response.ok) {
                                                const blob = await response.blob();
                                                const text = await blob.text();
                                                setScriptContent(text);
                                                setEditingScript({ directory, content: text });
                                                setShowScriptEditor(true);
                                              }
                                            } catch (error) {
                                              toast({ title: 'Error', description: 'Failed to load script', variant: 'destructive' });
                                            }
                                          }}
                                          title="Edit script"
                                        >
                                          <FileText className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                                        </Button>

                                        {/* Run/Stop button with URL input widget */}
                                        <div className="relative">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className={`h-5 w-5 p-0 flex-shrink-0 ${
                                              runningScripts.has(directory.name)
                                                ? 'hover:bg-red-50 dark:hover:bg-red-900/20'
                                                : 'hover:bg-green-50 dark:hover:bg-green-900/20'
                                            }`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (runningScripts.has(directory.name)) {
                                                // TODO: Implement stop functionality
                                                toast({ title: 'Stop script', description: 'Not yet implemented' });
                                              } else {
                                                setUrlDialogDirectory(directory);
                                                setScriptUrl('');
                                              }
                                            }}
                                            title={runningScripts.has(directory.name) ? 'Stop script' : 'Run script'}
                                          >
                                            {runningScripts.has(directory.name) ? (
                                              <Square className="w-3 h-3 text-red-500 fill-red-500" />
                                            ) : (
                                              <Play className="w-3 h-3 text-green-600 dark:text-green-400" />
                                            )}
                                          </Button>

                                          {/* Floating URL Input Widget */}
                                          {urlDialogDirectory?.name === directory.name && !runningScripts.has(directory.name) && (
                                            <div
                                              className="absolute bottom-full left-0 mb-1 z-[100]"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg shadow-2xl border-2 border-blue-200 dark:border-blue-700/50 w-96 p-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                  <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                  <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                                                    Enter URL to Crawl
                                                  </span>
                                                </div>
                                                <input
                                                  type="text"
                                                  value={scriptUrl}
                                                  onChange={(e) => setScriptUrl(e.target.value)}
                                                  placeholder="https://example.com/page-to-crawl"
                                                  className="w-full px-3 py-2 text-sm border-2 border-blue-200 dark:border-blue-700/50 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                  autoFocus
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      handleRunScript();
                                                    } else if (e.key === 'Escape') {
                                                      setUrlDialogDirectory(null);
                                                    }
                                                  }}
                                                />
                                                <div className="flex items-center justify-between mt-3">
                                                  <span className="text-[10px] text-blue-600 dark:text-blue-400 italic">
                                                    Press Enter to run, Esc to cancel
                                                  </span>
                                                  <div className="flex items-center gap-2">
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      className="h-7 px-3 text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                                      onClick={() => setUrlDialogDirectory(null)}
                                                    >
                                                      Cancel
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                                                      onClick={handleRunScript}
                                                    >
                                                      <Play className="w-3 h-3 mr-1" />
                                                      Run Script
                                                    </Button>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Toggle logs button with floating widget */}
                                        {runningScripts.has(directory.name) && (
                                          <div className="relative">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-5 w-5 p-0 flex-shrink-0 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (showLogViewer === directory.name) {
                                                  setShowLogViewer(null);
                                                } else {
                                                  setShowLogViewer(directory.name);
                                                  setLogWidgetMinimized(false);
                                                }
                                              }}
                                              title="View logs"
                                            >
                                              <Terminal className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                            </Button>

                                        {/* Script name */}
                                        <span className="text-[10px] font-medium truncate max-w-[100px] text-slate-600 dark:text-slate-400">
                                          {pythonScripts.get(directory.name)?.name}
                                        </span>

                                        {/* Delete script button */}
                                        <ConfirmTooltip
                                          onConfirm={() => handleDeletePythonScript(directory)}
                                          message="Delete this Python script?"
                                          side="top"
                                        >
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-4 w-4 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-60 hover:opacity-100 transition-opacity ml-auto"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <X className="w-2.5 h-2.5 text-red-500" />
                                          </Button>
                                        </ConfirmTooltip>

                                            {/* Floating Log Widget */}
                                            {showLogViewer === directory.name && (
                                              <div
                                                className="absolute bottom-full right-0 mb-1 z-[100]"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <div className={`bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg shadow-2xl border-2 border-yellow-200 dark:border-yellow-700/50 transition-all ${
                                                  logWidgetMinimized ? 'w-48' : 'w-96'
                                                }`}>
                                                  {/* Header */}
                                                  <div className="flex items-center justify-between px-3 py-2 border-b-2 border-yellow-200 dark:border-yellow-700/50 bg-yellow-100/50 dark:bg-yellow-900/30 rounded-t-lg">
                                                    <div className="flex items-center gap-2">
                                                      <Terminal className="w-3.5 h-3.5 text-yellow-700 dark:text-yellow-400" />
                                                      <span className="text-[10px] font-semibold text-yellow-900 dark:text-yellow-200">
                                                        {directory.displayName}
                                                      </span>
                                                      {/* Minimal circle progress */}
                                                      {runningScripts.has(directory.name) && (
                                                        <div className="flex items-center gap-1">
                                                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                          <span className="text-[8px] text-yellow-700 dark:text-yellow-400">Running</span>
                                                        </div>
                                                      )}
                                                    </div>
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      className="h-5 w-5 p-0 hover:bg-yellow-200 dark:hover:bg-yellow-800/50"
                                                      onClick={() => {
                                                        if (logWidgetMinimized) {
                                                          setLogWidgetMinimized(false);
                                                        } else {
                                                          setShowLogViewer(null);
                                                        }
                                                      }}
                                                      title={logWidgetMinimized ? 'Maximize' : 'Minimize & Close'}
                                                    >
                                                      {logWidgetMinimized ? (
                                                        <ChevronUp className="w-3 h-3 text-yellow-700 dark:text-yellow-400" />
                                                      ) : (
                                                        <ChevronDown className="w-3 h-3 text-yellow-700 dark:text-yellow-400" />
                                                      )}
                                                    </Button>
                                                  </div>

                                                  {/* Log Content */}
                                                  {!logWidgetMinimized && (
                                                    <div className="p-3 max-h-96 overflow-y-auto bg-white/50 dark:bg-slate-900/30">
                                                      {(() => {
                                                        const jobId = runningScripts.get(directory.name);
                                                        const logs = jobId ? scriptLogs.get(jobId) : null;
                                                        return logs?.length ? (
                                                          <div className="space-y-1">
                                                            {logs.map((log, index) => (
                                                              <div
                                                                key={index}
                                                                className={`text-[9px] leading-tight font-mono px-2 py-0.5 rounded ${
                                                                  log.includes('ERROR') || log.includes('Failed')
                                                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                                                    : log.includes('Completed') || log.includes('successfully')
                                                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                                                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                                                                }`}
                                                              >
                                                                {log}
                                                              </div>
                                                            ))}
                                                          </div>
                                                        ) : (
                                                          <div className="text-[9px] text-yellow-600 dark:text-yellow-400 text-center py-8 italic">
                                                            Waiting for output...
                                                          </div>
                                                        );
                                                      })()}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <label className="flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                                        <Plus className="w-3 h-3" />
                                        <span className="text-[10px]">Attach .py script</span>
                                        <input
                                          type="file"
                                          accept=".py"
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              handlePythonScriptUpload(directory, file);
                                            }
                                            e.target.value = ''; // Reset input
                                          }}
                                          disabled={uploadingScript === directory.id}
                                        />
                                      </label>
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
                  <Card className="h-[calc(100vh-280px)] flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700">
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
                      <CardTitle>Preview Data - {selectedDirectory.displayName}</CardTitle>
                      <CardDescription>
                        View, edit and manage crawler data ({crawledItems.length} of {totalItemsCount} loaded)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Search items..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1"
                          />
                        </div>

                        <div className="border rounded-lg">
                          <ScrollArea className="h-[500px]">
                            {itemsLoading ? (
                              <div className="p-4"><ListSkeleton count={5} /></div>
                            ) : filteredItems.length === 0 ? (
                              <div className="text-center py-12">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                                <p className="text-sm text-muted-foreground">No items found</p>
                              </div>
                            ) : (
                              <div className="divide-y">
                                {filteredItems.map(item => (
                                  <div
                                    key={item.id}
                                    className="p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                                  >
                                    {/* Action icons on the left */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleEditItem(item)}
                                        className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        title="View/Edit"
                                      >
                                        <Eye className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                                      </Button>
                                      <ConfirmTooltip
                                        onConfirm={() => handleDeleteItem(item.key)}
                                        message="Delete this item?"
                                        side="top"
                                      >
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-900/20"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-4 h-4 text-slate-600 dark:text-slate-300 hover:text-red-600" />
                                        </Button>
                                      </ConfirmTooltip>
                                    </div>

                                    {/* Content with truncate */}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm truncate">{item.title}</p>
                                      <p className="text-xs text-muted-foreground truncate">{item.url || item.key}</p>
                                    </div>
                                  </div>
                                ))}

                                {/* Load More Button */}
                                {hasMoreItems && !loadingMore && (
                                  <div className="p-4 text-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={loadMoreItems}
                                      className="w-full"
                                    >
                                      Load More ({totalItemsCount - crawledItems.length} remaining)
                                    </Button>
                                  </div>
                                )}

                                {/* Loading indicator */}
                                {loadingMore && (
                                  <div className="p-4 text-center">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                                    <p className="text-xs text-muted-foreground mt-2">Loading more items...</p>
                                  </div>
                                )}
                              </div>
                            )}
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
                      {/* Entity Analysis Summary */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-3">
                          <BarChart3 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                          <h4 className="font-semibold text-sm">Entity Analysis</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                            <p className="text-lg font-bold text-yellow-600">{entityAnalysis.optionalFields}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Sample Size</p>
                            <p className="text-lg font-bold text-purple-600">{entityAnalysis.sampleSize}</p>
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

                        <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Brain className="w-4 h-4 text-purple-600" />
                            <Label htmlFor="autoEmbeddings">Auto-generate embeddings</Label>
                          </div>
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
        <DialogContent className="max-w-5xl max-h-fit p-0 gap-0 overflow-hidden flex flex-col z-[200]">
          {/* Modal Header - Fixed */}
          <div className="flex-shrink-0 bg-background border-b border-border px-6 py-4">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-base font-bold">{editingItem?.title}</DialogTitle>
              <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0.5">
                CRAWL DATA
              </Badge>
            </div>
            <DialogDescription className="sr-only">
              Edit crawl data for {editingItem?.title}
            </DialogDescription>
          </div>

          {/* Modal Content - Scrollable */}
          <div className="overflow-hidden px-6 py-4">
            {/* Metadata Section */}
            {editingItem && (
              <div className="mb-4 p-4 bg-muted/30 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Key</span>
                    <p className="font-mono text-foreground mt-1 font-semibold truncate" title={editingItem.key}>
                      {editingItem.key}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">URL</span>
                    <p className="font-mono text-foreground mt-1 font-semibold truncate" title={editingItem.data.url}>
                      {editingItem.data.url}
                    </p>
                  </div>
                  {editingItem.data.metadata && (
                    <>
                      {editingItem.data.metadata.word_count && (
                        <div>
                          <span className="text-muted-foreground">Word Count</span>
                          <p className="font-mono text-foreground mt-1 font-semibold">
                            {editingItem.data.metadata.word_count.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {editingItem.data.metadata.success !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Status</span>
                          <p className="font-mono text-foreground mt-1 font-semibold">
                            {editingItem.data.metadata.success ? '✓ Success' : '✗ Failed'}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Content Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="contentEditor" className="text-sm font-medium">
                  Content
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Line breaks and formatting preserved
                </span>
              </div>
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
            </div>
          </div>

          {/* Modal Footer - Fixed */}
          <div className="flex-shrink-0 bg-muted/50 dark:bg-black/30 border-t border-border px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-muted-foreground">
                Press Ctrl+F to search within content
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
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              {isScriptRunning ? `Running: ${urlDialogDirectory?.displayName}` : `Run Crawler Script`}
            </DialogTitle>
            <DialogDescription>
              {isScriptRunning
                ? `Crawling ${scriptUrl} - Logs updating in real-time`
                : `Enter the URL to crawl with ${urlDialogDirectory?.displayName}`
              }
            </DialogDescription>
          </DialogHeader>

          {!isScriptRunning ? (
            // URL Input View
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="script-url">Target URL</Label>
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
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowUrlDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRunScript} className="bg-green-600 hover:bg-green-700">
                  <Play className="w-4 h-4 mr-2" />
                  Run Script
                </Button>
              </div>
            </div>
          ) : (
            // Log Viewer View
            <div className="flex-1 flex flex-col min-h-0 py-4">
              <div className="flex-1 bg-slate-950 rounded-lg overflow-hidden border border-slate-700 flex flex-col">
                {/* Terminal Header */}
                <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="text-slate-400 text-xs font-mono ml-2">
                      {urlDialogDirectory?.name}.py - Output
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-green-400 animate-pulse" />
                    <span className="text-xs text-slate-400">Running</span>
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
                <div className="text-xs text-slate-500">
                  {currentJobId && scriptLogs.get(currentJobId)?.length || 0} log entries
                </div>
                <div className="flex gap-2">
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowUrlDialog(false);
                      setIsScriptRunning(false);
                      setCurrentJobId(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
