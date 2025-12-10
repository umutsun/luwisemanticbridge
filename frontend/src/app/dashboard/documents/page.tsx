'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, buildApiUrl, API_CONFIG } from '@/lib/config';
import { io, Socket } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TableSkeleton, TableBodySkeleton, StatsCardSkeleton, UploadSkeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { AnimatedCounter, AnimatedPercentage } from '@/components/ui/animated-counter';
import { ProgressCircle } from '@/components/ui/progress-circle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Upload,
  FileText,
  Trash2,
  Download,
  Eye,
  Loader2,
  CheckCircle,
  AlertCircle,
  Database,
  RefreshCw,
  Search,
  BarChart3,
  Clock,
  Zap,
  Target,
  Activity,
  File,
  X,
  XCircle,
  FolderOpen,
  MoreHorizontal,
  Sparkles,
  Play,
  HardDrive,
  ChevronDown
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import DocumentOperations from '@/components/DocumentOperations';
import DocumentPreview from '@/components/DocumentPreview';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import JsonViewer from '@/components/ui/json-viewer';
import CSVTableViewer from '@/components/ui/csv-table-viewer';
import PDFViewer from '@/components/ui/pdf-viewer';
import StructuredTextViewer from '@/components/ui/structured-text-viewer';
import { executeMutation } from '@/lib/graphql/client';
import { TRANSFORM_DOCUMENTS_TO_SOURCE_DB } from '@/lib/graphql/documents.queries';

interface Document {
  id: string;
  title: string;
  content: string;
  type: string;
  file_type?: string; // Alternative field name from backend
  size: number;
  file_path?: string; // Physical file path on server
  hasEmbeddings?: boolean; // from backend
  processing_status?: string; // Database processing status: waiting, analyzing, analyzed, transformed
  metadata: {
    source?: string;
    created_at: string;
    updated_at: string;
    chunks?: number;
    embeddings?: number; // actual count from backend
    embedding_model?: string;
    total_tokens_used?: number;
    ocr_processed?: boolean;
    ocr_confidence?: number;
    ocr_type?: string;
    originalName?: string;
    mimeType?: string;
    uploadDate?: Date;
    contentHash?: string;
    category?: string;
    tags?: string[];
    [key: string]: any; // Allow additional metadata
  };
}

interface Stats {
  documents: {
    total: number;
    embedded: number;
    pending: number;
    ocr_processed: number;
    ocr_pending: number;
    under_review: number;
  };
  performance: {
    total_tokens_used: number;
    total_cost: number;
    avg_processing_time: number;
    success_rate: number;
  };
  history: {
    uploaded_today: number;
    embedded_today: number;
    ocr_today: number;
    last_24h_activity: number;
  };
}

export default function DocumentManagerPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [physicalFilesLoading, setPhysicalFilesLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [showOperations, setShowOperations] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [physicalFiles, setPhysicalFiles] = useState<any[]>([]);
  const [physicalFilesStats, setPhysicalFilesStats] = useState({ total: 0, inDatabase: 0, notInDatabase: 0, uploadDirectory: '' });
  const [folders, setFolders] = useState<any[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedPhysicalFiles, setSelectedPhysicalFiles] = useState<Set<string>>(new Set());
  const [bulkAddInProgress, setBulkAddInProgress] = useState(false);
  const [bulkAddProgress, setBulkAddProgress] = useState({ current: 0, total: 0 });

  // Google Drive states
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveImporting, setDriveImporting] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<Set<string>>(new Set());
  const [drivePageToken, setDrivePageToken] = useState<string | null>(null);
  const [driveFolderPath, setDriveFolderPath] = useState<{id: string; name: string}[]>([]);
  const [currentDriveFolderId, setCurrentDriveFolderId] = useState<string | null>(null);

  // Google Drive import job tracking (background job system)
  const [driveImportJobId, setDriveImportJobId] = useState<number | null>(null);
  const [driveImportProgress, setDriveImportProgress] = useState(0);
  const [driveImportProcessed, setDriveImportProcessed] = useState(0);
  const [driveImportTotal, setDriveImportTotal] = useState(0);
  const [driveImportCurrentFile, setDriveImportCurrentFile] = useState('');

  // Skipped embeddings states
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [skippedEmbeddings, setSkippedEmbeddings] = useState<any[]>([]);
  const [skippedLoading, setSkippedLoading] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [selectedSkippedIds, setSelectedSkippedIds] = useState<Set<number>>(new Set());

  const [stats, setStats] = useState<Stats>({
    documents: {
      total: 0,
      embedded: 0,
      pending: 0,
      ocr_processed: 0,
      ocr_pending: 0,
      under_review: 0
    },
    performance: {
      total_tokens_used: 0,
      total_cost: 0,
      avg_processing_time: 0,
      success_rate: 0
    },
    history: {
      uploaded_today: 0,
      embedded_today: 0,
      ocr_today: 0,
      last_24h_activity: 0
    }
  });

  useEffect(() => {
    fetchDocuments();
    fetchStats();
    fetchPhysicalFiles();
    fetchFolders();
    fetchBatchSchemas();
    fetchSkippedCount();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found in localStorage');
        setDocuments([]);
        setLoading(false);
        return;
      }

      const response = await fetch(getApiUrl('documents'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Fetch documents response status:', response.status);

      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          console.log('Token expired or invalid, clearing token and showing empty state');
          localStorage.removeItem('token');
          setDocuments([]);
          // Optionally redirect to login page or show login modal
          toast({
            title: t('documents.toast.authenticationError'),
            description: t('documents.toast.pleaseLoginAgain'),
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Documents API Response:', data);

      // The backend returns data in format: { documents: [...] }
      // But if it's just an array, we handle that too
      const docs = data.documents || data || [];
      console.log('Setting documents:', docs);
      console.log('Documents count:', docs.length);
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setDocuments([]); // Set empty array on error to avoid undefined issues
      toast({
        title: t('documents.toast.error'),
        description: t('documents.toast.failedToLoadDocuments'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(getApiUrl('documentStats'), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        }
      });

      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      console.log('Stats API Response:', data);

      // Use real database stats from backend
      setStats({
        documents: data.documents || {
          total: 0,
          embedded: 0,
          pending: 0,
          ocr_processed: 0,
          ocr_pending: 0,
          under_review: 0
        },
        performance: data.performance || {
          total_tokens_used: 0,
          total_cost: 0,
          avg_processing_time: 0,
          success_rate: 0
        },
        history: data.history || {
          uploaded_today: 0,
          embedded_today: 0,
          ocr_today: 0,
          last_24h_activity: 0
        }
      });

      // Update physical files stats from backend
      if (data.physicalFiles) {
        setPhysicalFilesStats({
          total: data.physicalFiles.total || 0,
          inDatabase: data.physicalFiles.inDatabase || 0,
          notInDatabase: data.physicalFiles.notInDatabase || 0,
          uploadDirectory: data.physicalFiles.uploadDirectory || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      // Set default stats on error
      setStats({
        documents: {
          total: 0,
          embedded: 0,
          pending: 0,
          ocr_processed: 0,
          ocr_pending: 0,
          under_review: 0
        },
        performance: {
          total_tokens_used: 0,
          total_cost: 0,
          avg_processing_time: 0,
          success_rate: 0
        },
        history: {
          uploaded_today: 0,
          embedded_today: 0,
          ocr_today: 0,
          last_24h_activity: 0
        }
      });
    }
  };

  // Fetch skipped embeddings count (for badge display)
  const fetchSkippedCount = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/migration/skipped?limit=1`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSkippedCount(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch skipped count:', error);
    }
  };

  // Fetch skipped embeddings (for modal display)
  const fetchSkippedEmbeddings = async () => {
    setSkippedLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/migration/skipped?limit=100`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSkippedEmbeddings(data.records || []);
        setSkippedCount(data.total || 0);
        // Auto-select all by default
        setSelectedSkippedIds(new Set((data.records || []).map((r: any) => r.id)));
      }
    } catch (error) {
      console.error('Failed to fetch skipped embeddings:', error);
      toast({ title: 'Error', description: 'Failed to fetch skipped embeddings', variant: 'destructive' });
    } finally {
      setSkippedLoading(false);
    }
  };

  // Delete selected skipped embeddings
  const handleDeleteSkipped = async () => {
    if (selectedSkippedIds.size === 0) return;

    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/migration/skipped`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: Array.from(selectedSkippedIds) })
      });

      if (response.ok) {
        const data = await response.json();
        toast({ title: 'Deleted', description: data.message || `Deleted ${selectedSkippedIds.size} record(s)` });
        setSkippedEmbeddings(prev => prev.filter(r => !selectedSkippedIds.has(r.id)));
        setSkippedCount(prev => prev - selectedSkippedIds.size);
        setSelectedSkippedIds(new Set());
        if (skippedEmbeddings.length === selectedSkippedIds.size) {
          setShowSkippedModal(false);
        }
      }
    } catch (error) {
      console.error('Failed to delete skipped:', error);
      toast({ title: 'Error', description: 'Failed to delete skipped records', variant: 'destructive' });
    }
  };

  const fetchPhysicalFiles = async () => {
    try {
      setPhysicalFilesLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found');
        return;
      }

      console.log('Fetching physical files from:', getApiUrl('physicalFiles'));

      const response = await fetch(getApiUrl('physicalFiles'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('Physical files data:', data);

      setPhysicalFiles(data.files || []);
      setPhysicalFilesStats({
        total: data.totalFiles || 0,
        inDatabase: data.inDatabase || 0,
        notInDatabase: data.notInDatabase || 0,
        uploadDirectory: data.uploadDirectory || ''
      });

      // Show warning if database is not available
      if (data.warning) {
        toast({
          title: t('documents.toast.databaseOffline'),
          description: data.warning,
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Failed to fetch physical files:', error);
      toast({
        title: t('documents.toast.error'),
        description: t('documents.toast.failedToLoadPhysicalFiles'),
        variant: 'destructive'
      });
    } finally {
      setPhysicalFilesLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      setFoldersLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/batch-folders/list`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Batch folders endpoint not available:', response.status);
        setFolders([]);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
      setFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  };

  // Google Drive functions
  const checkDriveConnection = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/config`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDriveConnected(data.config?.connected || false);
      }
    } catch (error) {
      console.error('Failed to check Drive connection:', error);
    }
  };

  const fetchDriveFiles = async (folderId?: string | null, pageToken?: string) => {
    setDriveLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const url = new URL(`${API_CONFIG.baseUrl}/api/v2/google-drive/files`);
      url.searchParams.append('pageSize', '50');
      if (folderId) {
        url.searchParams.append('folderId', folderId);
      }
      if (pageToken) {
        url.searchParams.append('pageToken', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch Drive files');
      }

      const data = await response.json();
      setDriveFiles(prev => pageToken ? [...prev, ...data.files] : data.files);
      setDrivePageToken(data.nextPageToken || null);
      setDriveConnected(true);
    } catch (error: any) {
      console.error('Failed to fetch Drive files:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load Google Drive files',
        variant: 'destructive'
      });
      if (error.message?.includes('not connected') || error.message?.includes('OAuth')) {
        setDriveConnected(false);
      }
    } finally {
      setDriveLoading(false);
    }
  };

  // Navigate into a folder
  const navigateToFolder = (folderId: string, folderName: string) => {
    setDriveFolderPath(prev => [...prev, { id: folderId, name: folderName }]);
    setCurrentDriveFolderId(folderId);
    setDriveFiles([]);
    setSelectedDriveFiles(new Set());
    setDrivePageToken(null);
    fetchDriveFiles(folderId);
  };

  // Navigate back to a specific folder in path
  const navigateToPathIndex = (index: number) => {
    if (index === -1) {
      // Root
      setDriveFolderPath([]);
      setCurrentDriveFolderId(null);
      setDriveFiles([]);
      setDrivePageToken(null);
      fetchDriveFiles(null);
    } else {
      const newPath = driveFolderPath.slice(0, index + 1);
      setDriveFolderPath(newPath);
      setCurrentDriveFolderId(newPath[newPath.length - 1].id);
      setDriveFiles([]);
      setDrivePageToken(null);
      fetchDriveFiles(newPath[newPath.length - 1].id);
    }
    setSelectedDriveFiles(new Set());
  };

  // Helper to get readable file type
  const getFileTypeLabel = (mimeType?: string): string => {
    if (!mimeType) return 'File';
    if (mimeType === 'application/vnd.google-apps.folder') return 'Folder';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.includes('word') || mimeType === 'application/vnd.google-apps.document') return 'Doc';
    if (mimeType.includes('sheet') || mimeType === 'application/vnd.google-apps.spreadsheet') return 'Sheet';
    if (mimeType.includes('presentation') || mimeType === 'application/vnd.google-apps.presentation') return 'Slides';
    if (mimeType.startsWith('text/')) return 'Text';
    if (mimeType.includes('csv')) return 'CSV';
    if (mimeType.includes('json')) return 'JSON';
    if (mimeType.includes('image')) return 'Image';
    return mimeType.split('/').pop()?.split('.').pop() || 'File';
  };

  // Check if file is importable (not a folder)
  const isImportableFile = (mimeType?: string): boolean => {
    return mimeType !== 'application/vnd.google-apps.folder';
  };

  const importFromDrive = async () => {
    if (selectedDriveFiles.size === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select files to import',
        variant: 'destructive'
      });
      return;
    }

    // Get file IDs
    const fileIds = Array.from(selectedDriveFiles);

    // Close modal and show progress
    setShowDriveModal(false);
    setDriveImporting(true);
    setUploading(true);
    setUploadProgress(0);
    setCurrentOperation('Initializing import...');

    const token = localStorage.getItem('token');
    if (!token) {
      setDriveImporting(false);
      setUploading(false);
      setUploadProgress(0);
      setCurrentOperation('');
      toast({
        title: 'Authentication Required',
        description: 'Please log in to import files',
        variant: 'destructive'
      });
      return;
    }

    try {
      console.log('[GoogleDrive] Starting background import for', fileIds.length, 'files');

      // Use new background job endpoint
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/import-with-progress`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileIds, saveToDb })
      });

      const data = await response.json();

      if (response.ok && data.jobId) {
        console.log('[GoogleDrive] Background import job started:', data.jobId);

        // Set job ID to trigger WebSocket listener
        setDriveImportJobId(data.jobId);
        setDriveImportTotal(data.totalFiles || fileIds.length);
        setCurrentOperation('Import started...');

        // Clear selected files
        setSelectedDriveFiles(new Set());

        toast({
          title: 'Import Started',
          description: `Importing ${data.totalFiles || fileIds.length} files in background. Progress will be shown below.`,
        });
      } else {
        throw new Error(data.error || 'Failed to start import job');
      }
    } catch (error: any) {
      console.error('[GoogleDrive] Import failed:', error);
      setDriveImporting(false);
      setUploading(false);
      setUploadProgress(0);
      setCurrentOperation('');

      toast({
        title: 'Import Failed',
        description: error.message || 'An error occurred while starting the import',
        variant: 'destructive'
      });
    }
  };

  const openDriveFilePicker = () => {
    setShowDriveModal(true);
    setDriveFiles([]);
    setSelectedDriveFiles(new Set());
    setDrivePageToken(null);
    setDriveFolderPath([]);
    setCurrentDriveFolderId(null);
    fetchDriveFiles(null);
  };

  const toggleDriveFileSelection = (fileId: string, mimeType?: string) => {
    // Don't allow selecting folders
    if (mimeType === 'application/vnd.google-apps.folder') return;

    setSelectedDriveFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const selectAllDriveFiles = () => {
    // Only select importable files (not folders)
    const importableFiles = driveFiles.filter(f => isImportableFile(f.mimeType));
    if (selectedDriveFiles.size === importableFiles.length && importableFiles.length > 0) {
      setSelectedDriveFiles(new Set());
    } else {
      setSelectedDriveFiles(new Set(importableFiles.map(f => f.id)));
    }
  };

  // Check Drive connection on mount
  useEffect(() => {
    checkDriveConnection();
  }, []);

  const [processingFolders, setProcessingFolders] = useState<Set<string>>(new Set());

  const handleFolderBatchImport = async (folderName: string) => {
    try {
      setProcessingFolders(prev => new Set(prev).add(folderName));
      const token = localStorage.getItem('token');
      if (!token) return;

      // Step 1: Scan folder to get all files
      toast({
        title: t('documents.toast.scanningFolder'),
        description: t('documents.toast.scanningFolderForPdfs', { folder: folderName })
      });

      // Step 2: Scan folder to get all files
      const scanResponse = await fetch(`${API_CONFIG.baseUrl}/api/v2/batch-folders/scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folderPath: `docs/${folderName}` })
      });

      if (!scanResponse.ok) {
        throw new Error('Failed to scan folder');
      }

      const scanData = await scanResponse.json();
      const newFiles = scanData.files.filter((f: any) => !f.inDatabase);

      if (newFiles.length === 0) {
        toast({
          title: t('documents.toast.noNewFiles'),
          description: t('documents.toast.allFilesAlreadyInDb')
        });
        return;
      }

      // Step 3: Start batch processing with folder_config
      toast({
        title: t('documents.toast.startingBatchImport'),
        description: t('documents.toast.processingNewFiles', { count: newFiles.length })
      });

      const processResponse = await fetch(`${API_CONFIG.baseUrl}/api/v2/batch-folders/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: newFiles,
          options: {
            autoTransform: true  // ✅ Auto-transform enabled: template match → insert to DB
          }
        })
      });

      if (!processResponse.ok) {
        throw new Error('Failed to start batch processing');
      }

      const processData = await processResponse.json();

      // Set job tracking state
      setBatchJobId(processData.jobId);
      setBatchProcessing(true);
      setBatchTotal(newFiles.length);
      setBatchCurrent(0);
      setBatchProgress(0);
      setBatchStatus(`Processing ${newFiles.length} files...`);

      toast({
        title: t('documents.toast.batchImportStarted'),
        description: t('documents.toast.processingFiles', { count: processData.totalFiles }),
        duration: 5000
      });

      // WebSocket will handle progress updates (already set up in useEffect)
      // No polling needed - WebSocket listener is active

    } catch (error: any) {
      console.error('Folder batch import error:', error);
      toast({
        title: t('documents.toast.importFailed'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setProcessingFolders(prev => {
        const next = new Set(prev);
        next.delete(folderName);
        return next;
      });
    }
  };

  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());
  const [physicalFilesSearch, setPhysicalFilesSearch] = useState('');
  const [physicalFilesFilter, setPhysicalFilesFilter] = useState('all');

  const handleAddPhysicalFileToDb = async (filePath: string) => {
    try {
      setProcessingFiles(prev => new Set(prev).add(filePath));
      setCurrentOperation('Saving to DB');
      setUploadProgress(0);
      setUploading(true);

      const token = localStorage.getItem('token');

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch(getApiUrl('physicalFilesAdd'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filePath })
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add file');
      }

      setUploadProgress(100);

      toast({
        title: t('documents.toast.success'),
        description: t('documents.toast.fileAddedToDb')
      });

      // Refresh both lists and wait for them to complete
      await Promise.all([
        fetchPhysicalFiles(),
        fetchDocuments()
      ]);

      setUploading(false);
      setUploadProgress(0);
      setCurrentOperation('');

    } catch (error: any) {
      toast({
        title: t('documents.toast.error'),
        description: error.message || t('documents.toast.failedToAddFileToDb'),
        variant: 'destructive'
      });
      setUploading(false);
      setUploadProgress(0);
      setCurrentOperation('');
    } finally {
      setProcessingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  const handlePreviewPhysicalFile = async (filename: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/preview/${filename}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load file preview');
      }

      const fileData = await response.json();

      // Transform the response to match DocumentPreview expected format
      const previewDoc = {
        id: '0', // Physical file has no DB ID
        title: fileData.filename,
        content: fileData.content,
        type: fileData.type,
        size: fileData.size,
        metadata: {
          ...fileData.metadata,
          source: 'physical', // Mark as physical file
          created_at: fileData.created,
          updated_at: fileData.modified
        }
      };

      setPreviewDoc(previewDoc);
    } catch (error: any) {
      toast({
        title: t('documents.toast.error'),
        description: error.message || t('documents.toast.failedToPreviewFile'),
        variant: 'destructive'
      });
    }
  };

  const handleDeletePhysicalFile = async (filePath: string, deleteFromDb: boolean = true) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(getApiUrl('physicalFiles'), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filePath, deleteFromDatabase: deleteFromDb })
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      toast({
        title: t('documents.toast.success'),
        description: t('documents.toast.fileDeletedSuccessfully')
      });

      fetchPhysicalFiles();
      if (deleteFromDb) {
        fetchDocuments();
      }
    } catch (error: any) {
      toast({
        title: t('documents.toast.error'),
        description: error.message || t('documents.toast.failedToDeleteFile'),
        variant: 'destructive'
      });
    }
  };

  // Physical files selection handlers
  const [selectAllPhysicalFiles, setSelectAllPhysicalFiles] = useState(false);

  const handleSelectAllPhysicalFiles = () => {
    // ✅ Null check to prevent crash
    if (!physicalFiles) return;

    const filteredFiles = physicalFiles.filter(file => {
      // Apply same filters as display
      if (physicalFilesSearch && !file.filename.toLowerCase().includes(physicalFilesSearch.toLowerCase())) {
        return false;
      }
      if (physicalFilesFilter !== 'all') {
        const fileExt = file.ext.toLowerCase();
        if (physicalFilesFilter === 'md' && fileExt !== 'md' && fileExt !== 'markdown') {
          return false;
        }
        if (physicalFilesFilter !== 'md' && fileExt !== physicalFilesFilter) {
          return false;
        }
      }
      return true;
    });

    if (selectAllPhysicalFiles) {
      setSelectedPhysicalFiles(new Set());
    } else {
      setSelectedPhysicalFiles(new Set(filteredFiles.map(file => file.path)));
    }
    setSelectAllPhysicalFiles(!selectAllPhysicalFiles);
  };

  const handleSelectPhysicalFile = (filePath: string) => {
    const newSelected = new Set(selectedPhysicalFiles);
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    setSelectedPhysicalFiles(newSelected);

    // Update select all state
    // ✅ Null check to prevent crash
    if (!physicalFiles) return;

    const filteredFiles = physicalFiles.filter(file => {
      if (physicalFilesSearch && !file.filename.toLowerCase().includes(physicalFilesSearch.toLowerCase())) {
        return false;
      }
      if (physicalFilesFilter !== 'all') {
        const fileExt = file.ext.toLowerCase();
        if (physicalFilesFilter === 'md' && fileExt !== 'md' && fileExt !== 'markdown') {
          return false;
        }
        if (physicalFilesFilter !== 'md' && fileExt !== physicalFilesFilter) {
          return false;
        }
      }
      return true;
    });
    setSelectAllPhysicalFiles(newSelected.size === filteredFiles.length && filteredFiles.length > 0);
  };

  const handleBulkDeletePhysicalFiles = async () => {
    if (selectedPhysicalFiles.size === 0) {
      toast({
        title: t('documents.toast.error'),
        description: 'No files selected',
        variant: 'destructive'
      });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const filePaths = Array.from(selectedPhysicalFiles);

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/physical-files/bulk-delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filePaths })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Bulk delete failed');
      }

      const result = await response.json();

      toast({
        title: t('documents.toast.success'),
        description: `${result.deletedCount} file(s) deleted successfully`
      });

      // Clear selection and refresh
      setSelectedPhysicalFiles(new Set());
      setSelectAllPhysicalFiles(false);
      fetchPhysicalFiles();
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: t('documents.toast.error'),
        description: error.message || 'Failed to delete files',
        variant: 'destructive'
      });
    }
  };

  const handleBulkAddToDatabase = async () => {
    if (selectedPhysicalFiles.size === 0) {
      toast({
        title: t('documents.toast.error'),
        description: 'No files selected',
        variant: 'destructive'
      });
      return;
    }

    const filePaths = Array.from(selectedPhysicalFiles);
    const total = filePaths.length;

    try {
      setBulkAddInProgress(true);
      setBulkAddProgress({ current: 0, total });

      const token = localStorage.getItem('token');

      // Send all files in one bulk request
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/physical-files/bulk-add-to-database`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filePaths })
      });

      setBulkAddProgress({ current: total, total });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add files to database');
      }

      const result = await response.json();
      const addedCount = result.addedCount || 0;
      const skippedCount = result.skippedCount || 0;

      toast({
        title: t('documents.toast.success'),
        description: `${addedCount} file(s) added to database${skippedCount > 0 ? `, ${skippedCount} already existed` : ''}`
      });

      // Clear selection and refresh
      setSelectedPhysicalFiles(new Set());
      setSelectAllPhysicalFiles(false);
      await Promise.all([fetchPhysicalFiles(), fetchDocuments()]);
    } catch (error: any) {
      toast({
        title: t('documents.toast.error'),
        description: error.message || 'Failed to add files to database',
        variant: 'destructive'
      });
    } finally {
      setBulkAddInProgress(false);
      setBulkAddProgress({ current: 0, total: 0 });
    }
  };

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [saveToDb, setSaveToDb] = useState(true);
  const [currentOperation, setCurrentOperation] = useState<string>('');
  const [uploadSpeed, setUploadSpeed] = useState<number>(0); // bytes per second
  const [timeRemaining, setTimeRemaining] = useState<number>(0); // seconds
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await processUpload(Array.from(files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processUpload(files);
    }
  };

  const processUpload = async (files: File[]) => {
    console.log('🚀 processUpload called with files:', files.length);
    setUploading(true);
    setUploadProgress(0);
    setUploadFiles(files);
    setCurrentOperation(t('documents.upload.preparing'));

    try {
      const token = localStorage.getItem('token');
      console.log('🔑 Token:', token ? 'exists' : 'missing');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const totalFiles = files.length;
      let completedFiles = 0;

      for (const file of files) {
        // Update status for current file
        setCurrentOperation(`Uploading ${file.name}...`);

        const formData = new FormData();
        formData.append('file', file);

        const uploadUrl = saveToDb ? getApiUrl('upload') : getApiUrl('upload') + '?skipDb=true';
        console.log('📤 Uploading to:', uploadUrl);
        console.log('📝 Save to DB:', saveToDb);

        // Real-time progress tracking with XMLHttpRequest
        const response = await new Promise<Response>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          let startTime = Date.now();
          let lastLoaded = 0;
          let lastTime = Date.now();

          // Track upload progress with speed calculation
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const currentTime = Date.now();
              const timeElapsed = (currentTime - lastTime) / 1000; // seconds
              const bytesUploaded = e.loaded - lastLoaded;

              // Calculate speed (bytes per second)
              if (timeElapsed > 0) {
                const currentSpeed = bytesUploaded / timeElapsed;
                // Smooth the speed with exponential moving average
                setUploadSpeed(prev => prev === 0 ? currentSpeed : prev * 0.7 + currentSpeed * 0.3);
              }

              // Calculate time remaining
              const bytesRemaining = e.total - e.loaded;
              const speed = uploadSpeed || (e.loaded / ((currentTime - startTime) / 1000));
              if (speed > 0) {
                setTimeRemaining(Math.ceil(bytesRemaining / speed));
              }

              // Update uploaded/total bytes
              setUploadedBytes(e.loaded);
              setTotalBytes(e.total);

              // Update progress percentage
              const fileProgress = (e.loaded / e.total);
              const baseProgress = (completedFiles / totalFiles) * 100;
              const currentFileProgress = (fileProgress / totalFiles) * 100;
              const totalProgress = baseProgress + currentFileProgress;
              setUploadProgress(Math.min(totalProgress, 100));

              // Update last values for next calculation
              lastLoaded = e.loaded;
              lastTime = currentTime;

              console.log(`📊 Upload: ${Math.round(fileProgress * 100)}% | Speed: ${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s | ETA: ${timeRemaining}s`);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers(xhr.getAllResponseHeaders().split('\r\n').reduce((acc: any, line) => {
                  const [key, value] = line.split(': ');
                  if (key) acc[key] = value;
                  return acc;
                }, {}))
              }));
            } else {
              reject(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText
              }));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Network error'));
          });

          xhr.open('POST', uploadUrl);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.send(formData);
        }).catch((errorResponse) => {
          // Return error response for consistent handling
          return errorResponse as Response;
        });

        console.log('📥 Response status:', response.status);

        // Update status after upload
        if (response.ok && saveToDb) {
          setCurrentOperation(`Saving ${file.name} to database...`);
          await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay to show status
        }

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText };
          }

          // Special handling for duplicate error
          if (response.status === 409) {
            // errorData is already parsed above
            toast({
              title: 'Duplicate File',
              description: `"${file.name}" already exists in database. ${errorData.physicalFile?.kept ? 'Physical file saved to /docs folder.' : ''}`,
              variant: 'default'
            });
            // Refresh physical files list to show the newly saved file
            if (errorData.physicalFile?.kept) {
              fetchPhysicalFiles();
            }
            continue; // Skip to next file
          }

          throw new Error(errorData.error || errorData.message || 'Upload failed');
        }

        completedFiles++;
        setUploadProgress((completedFiles / totalFiles) * 100);
      }

      setUploadProgress(100);
      setCurrentOperation(t('documents.upload.completed'));

      // Fetch updates
      await fetchPhysicalFiles();
      if (saveToDb) {
        await fetchDocuments();
        await fetchStats();
      }

      setTimeout(() => {
        setUploadProgress(0);
        setCurrentOperation('');
        setUploadFiles([]);
        setUploadSpeed(0);
        setTimeRemaining(0);
        setUploadedBytes(0);
        setTotalBytes(0);

        toast({
          title: t('documents.toast.success'),
          description: t('documents.toast.documentsUploaded', { count: files.length }),
        });
      }, 800);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: t('documents.toast.uploadError'),
        description: error.message || t('documents.toast.uploadFailed'),
        variant: 'destructive'
      });
      setUploadProgress(0);
      setUploadFiles([]);
      setUploadSpeed(0);
      setTimeRemaining(0);
      setUploadedBytes(0);
      setTotalBytes(0);
    } finally {
      setTimeout(() => setUploading(false), 500);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number) => {
    if (!bytesPerSecond) return '0 KB/s';
    const mbps = bytesPerSecond / 1024 / 1024;
    if (mbps >= 1) {
      return `${mbps.toFixed(2)} MB/s`;
    }
    const kbps = bytesPerSecond / 1024;
    return `${kbps.toFixed(1)} KB/s`;
  };

  const formatTime = (seconds: number) => {
    if (!seconds || seconds === Infinity) return '...';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handlePreview = async (doc: Document) => {
    // ✅ UX Improvement: Open modal IMMEDIATELY, then load CSV data in background
    // This prevents users from forgetting they clicked the button

    // Open modal right away with initial document data
    setPreviewDoc(doc);

    // For CSV/JSON files, fetch raw file content if file_path exists
    // Use file_path for the actual path, metadata.source is just the source type (e.g., 'google_drive')
    const filePath = doc.file_path || doc.metadata?.file_path;
    if (((doc.type || doc.file_type) === 'csv' || (doc.type || doc.file_type) === 'json') && filePath) {
      try {
        const filename = filePath.split(/[/\\]/).pop();

        if (filename) {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/preview/${filename}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const fileData = await response.json();
            // Update document with raw file content (modal already open, just update data)
            setPreviewDoc({
              ...doc,
              content: fileData.content,
              metadata: {
                ...doc.metadata,
                ...fileData.metadata,
                source: 'physical',
                _loaded: true // Flag to indicate data is loaded
              }
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch raw file:', error);
        // Keep modal open with basic data even if fetch fails
      }
    }
  };

  const handleOCR = async (docId: string) => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/ocr/${docId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          language: 'tur+eng'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'OCR failed';

        // Provide user-friendly error messages
        let userMessage = errorMessage;
        if (errorMessage.includes('File not found on disk')) {
          userMessage = t('documents.toast.fileNotFoundOnServer');
        } else if (errorMessage.includes('already processed with OCR')) {
          userMessage = t('documents.toast.alreadyProcessedWithOcr');
        } else if (errorMessage.includes('Document not found')) {
          userMessage = t('documents.toast.documentNotFound');
        }

        throw new Error(userMessage);
      }

      const result = await response.json();

      toast({
        title: t('documents.toast.ocrSuccessful'),
        description: t('documents.toast.ocrCompleted', { confidence: result.data?.confidence || 'N/A' }),
      });

      fetchDocuments();
    } catch (error: any) {
      console.error('OCR error:', error);
      toast({
        title: t('documents.toast.ocrError'),
        description: error.message || t('documents.toast.ocrFailed'),
        variant: 'destructive'
      });
    }
  };

  const handleEmbeddings = async (docId: string) => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/${docId}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Embedding generation failed');
      }

      const result = await response.json();

      toast({
        title: t('documents.toast.embeddingSuccessful'),
        description: t('documents.toast.embeddingsGenerated', { count: result.embeddingCount }),
      });

      fetchDocuments();
    } catch (error: any) {
      console.error('Embedding error:', error);
      toast({
        title: t('documents.toast.embeddingError'),
        description: error.message || t('documents.toast.embeddingGenerationFailed'),
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (docId: string, docTitle: string) => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }

      const result = await response.json();
      console.log('Delete result:', result);

      toast({
        title: t('documents.toast.deleteSuccessful'),
        description: t('documents.toast.documentDeletedSuccessfully'),
      });

      // Refresh documents list
      fetchDocuments();
      fetchStats();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        title: t('documents.toast.deleteError'),
        description: error.message || t('documents.toast.failedToDeleteDocument'),
        variant: 'destructive'
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) {
      toast({
        title: t('documents.toast.warning'),
        description: t('documents.toast.selectAtLeastOneDocument'),
        variant: 'destructive'
      });
      return;
    }

    try {
      const documentIds = Array.from(selectedRows).map(id => parseInt(id));

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/bulk-delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documentIds })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Bulk delete failed');
      }

      const result = await response.json();
      console.log('Bulk delete result:', result);

      toast({
        title: t('documents.toast.bulkDeleteSuccessful'),
        description: t('documents.toast.documentsDeleted', { count: result.deletedCount }),
      });

      // Clear selection and refresh
      setSelectedRows(new Set());
      setSelectAll(false);
      fetchDocuments();
      fetchStats();
    } catch (error: any) {
      console.error('Bulk delete error:', error);
      toast({
        title: t('documents.toast.bulkDeleteError'),
        description: error.message || t('documents.toast.bulkDeleteFailed'),
        variant: 'destructive'
      });
    }
  };

  // Re-embed a single document
  const handleReEmbed = async (docId: string, docTitle: string) => {
    try {
      toast({
        title: 'Re-embedding started',
        description: `Processing "${docTitle}"...`,
      });

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/${docId}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Re-embed failed');
      }

      toast({
        title: 'Re-embed successful',
        description: `"${docTitle}" has been re-embedded.`,
      });

      fetchDocuments();
      fetchStats();
    } catch (error: any) {
      console.error('Re-embed error:', error);
      toast({
        title: 'Re-embed failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  // Delete embeddings for a single document
  const handleDeleteEmbeddings = async (docId: string, docTitle: string) => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/${docId}/embeddings`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete embeddings failed');
      }

      // Update document state locally without refetching
      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? {
              ...doc,
              hasEmbeddings: false,
              processing_status: 'pending',
              metadata: { ...doc.metadata, embeddings: undefined }
            }
          : doc
      ));

      toast({
        title: 'Embeddings deleted',
        description: `Embeddings for "${docTitle}" have been removed.`,
      });

      fetchStats();
    } catch (error: any) {
      console.error('Delete embeddings error:', error);
      toast({
        title: 'Delete embeddings failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  // Bulk delete embeddings
  const handleBulkDeleteEmbeddings = async () => {
    if (selectedRows.size === 0) {
      toast({
        title: t('documents.toast.warning'),
        description: t('documents.toast.selectAtLeastOneDocument'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setBatchProcessing(true);
      const documentIds = Array.from(selectedRows);
      let successCount = 0;
      let failCount = 0;

      for (const docId of documentIds) {
        try {
          const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/${docId}/embeddings`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      toast({
        title: 'Bulk embeddings deleted',
        description: `${successCount} successful, ${failCount} failed`,
      });

      setSelectedRows(new Set());
      setSelectAll(false);
      fetchDocuments();
      fetchStats();
    } catch (error: any) {
      console.error('Bulk delete embeddings error:', error);
      toast({
        title: 'Bulk delete embeddings failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setBatchProcessing(false);
    }
  };

  // Bulk re-embed documents
  const handleBulkReEmbed = async () => {
    if (selectedRows.size === 0) {
      toast({
        title: t('documents.toast.warning'),
        description: t('documents.toast.selectAtLeastOneDocument'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setBatchProcessing(true);
      const documentIds = Array.from(selectedRows).map(id => parseInt(id));

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/documents/bulk-embed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documentIds })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Bulk re-embed failed');
      }

      const result = await response.json();

      toast({
        title: 'Bulk re-embed started',
        description: `Processing ${result.processed || documentIds.length} documents...`,
      });

      setSelectedRows(new Set());
      setSelectAll(false);
      fetchDocuments();
      fetchStats();
    } catch (error: any) {
      console.error('Bulk re-embed error:', error);
      toast({
        title: 'Bulk re-embed failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setBatchProcessing(false);
    }
  };

  const [selectAll, setSelectAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Pagination state
  const [visibleDocumentsCount, setVisibleDocumentsCount] = useState(40);
  const DOCUMENTS_PER_PAGE = 40;
  const [visiblePhysicalFilesCount, setVisiblePhysicalFilesCount] = useState(30);
  const PHYSICAL_FILES_PER_PAGE = 30;

  // Batch processing state
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchStatus, setBatchStatus] = useState('');
  const [batchCurrent, setBatchCurrent] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchSelectedSchema, setBatchSelectedSchema] = useState('');
  const [batchSchemas, setBatchSchemas] = useState<any[]>([]);
  const [batchSelectedTable, setBatchSelectedTable] = useState('');
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [currentImportingFile, setCurrentImportingFile] = useState<string>('');
  const [embedQueue, setEmbedQueue] = useState<{id: string; title: string; status: 'pending' | 'processing' | 'completed' | 'skipped' | 'error'}[]>([]);
  const [currentEmbeddingDoc, setCurrentEmbeddingDoc] = useState<string>('');

  // WebSocket for batch job progress
  useEffect(() => {
    if (!batchJobId) return;

    console.log('[WebSocket] Setting up connection for job:', batchJobId);

    const token = localStorage.getItem('token');

    // Decode JWT token to get userId
    let userId: string | null = null;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.userId || payload.sub || payload.id;
        console.log('[WebSocket] Extracted userId:', userId);
      } catch (e) {
        console.error('[WebSocket] Failed to decode token:', e);
      }
    }

    const socket = io(API_CONFIG.baseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'], // Try WebSocket first, then fallback to polling
      reconnectionAttempts: 10,
      timeout: 60000, // Increased to 60s for slow connections
      upgrade: true,
      rememberUpgrade: true, // Remember successful WebSocket upgrade
      path: '/socket.io/'
    });

    socket.on('connect', () => {
      console.log('[WebSocket] ✅ Connected for batch job:', batchJobId);

      // Join user-specific room to receive job events
      if (userId) {
        socket.emit('join', userId);
        console.log('[WebSocket] 📢 Joined user room:', userId);
      } else {
        console.warn('[WebSocket] ⚠️ No userId found, cannot join user room');
      }
    });

    socket.on('connect_error', (error) => {
      // WebSocket connection failed - this is normal in some network configurations
      console.log('[WebSocket] ⚠️ Real-time updates unavailable, using polling fallback');
    });

    socket.on(`job-progress-${batchJobId}`, (data: any) => {
      console.log('[WebSocket] 📊 Progress update:', {
        percentage: data.percentage,
        current: data.current,
        total: data.total,
        currentFile: data.currentFile,
        message: data.message,
        status: data.status
      });

      if (data.percentage !== undefined) {
        console.log('[WebSocket] Setting progress:', data.percentage);
        setBatchProgress(data.percentage);
      }

      if (data.current !== undefined) {
        console.log('[WebSocket] Setting current:', data.current);
        setBatchCurrent(data.current);
      }

      if (data.total !== undefined) {
        console.log('[WebSocket] Setting total:', data.total);
        setBatchTotal(data.total);
      }

      if (data.message) {
        console.log('[WebSocket] Setting status:', data.message);
        setBatchStatus(data.message);
      }

      // Track current file being imported
      if (data.currentFile || data.currentDocument) {
        const fileName = data.currentFile || data.currentDocument;
        console.log('[WebSocket] 📄 Current file:', fileName);
        setCurrentImportingFile(fileName);
      }

      // Refresh documents list incrementally after each file completes
      // Check if we moved to next file (current incremented)
      if (data.current && data.current > 0) {
        console.log('[WebSocket] 🔄 Refreshing documents list...');
        fetchDocuments();
      }

      if (data.status === 'completed') {
        setBatchProcessing(false);
        setBatchJobId(null);
        setBatchProgress(0);
        setBatchStatus('');
        setBatchCurrent(0);
        setBatchTotal(0);
        setCurrentImportingFile('');

        // Refresh all data
        Promise.all([fetchDocuments(), fetchFolders(), fetchStats()]);

        toast({
          title: t('documents.toast.batchImportComplete'),
          description: t('documents.toast.filesProcessedSuccessfully', { count: data.total })
        });
      } else if (data.status === 'error') {
        setBatchProcessing(false);
        setBatchJobId(null);
        setBatchProgress(0);
        setBatchStatus('');
        setBatchCurrent(0);
        setBatchTotal(0);
        setCurrentImportingFile('');

        // Still refresh to show any partial imports
        Promise.all([fetchDocuments(), fetchFolders(), fetchStats()]);

        toast({
          title: t('documents.toast.batchImportFailed'),
          description: data.error || t('documents.toast.errorDuringProcessing'),
          variant: 'destructive'
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [batchJobId]);

  // WebSocket for Google Drive import job progress
  useEffect(() => {
    if (!driveImportJobId) return;

    console.log('[GoogleDrive WebSocket] Setting up connection for job:', driveImportJobId);

    const token = localStorage.getItem('token');

    // Decode JWT token to get userId
    let userId: string | null = null;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.userId || payload.sub || payload.id;
        console.log('[GoogleDrive WebSocket] Extracted userId:', userId);
      } catch (e) {
        console.error('[GoogleDrive WebSocket] Failed to decode token:', e);
      }
    }

    const socket = io(API_CONFIG.baseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'], // Try WebSocket first, then fallback to polling
      reconnectionAttempts: 10,
      timeout: 60000, // Increased to 60s for slow connections
      upgrade: true,
      rememberUpgrade: true, // Remember successful WebSocket upgrade
      path: '/socket.io/'
    });

    // Fallback polling for import progress (if WebSocket fails)
    let pollingInterval: NodeJS.Timeout | null = null;
    let wsConnected = false;

    const startPolling = () => {
      if (pollingInterval) return;
      console.log('[GoogleDrive] 🔄 Starting fallback polling for job:', driveImportJobId);

      pollingInterval = setInterval(async () => {
        try {
          const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/import-job/${driveImportJobId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          });
          if (response.ok) {
            const job = await response.json();
            console.log('[GoogleDrive Polling] 📊 Job status:', job);

            // Update progress
            if (job.progress !== undefined) {
              setDriveImportProgress(job.progress);
              setUploadProgress(job.progress);
            }
            if (job.processed_files !== undefined) {
              setDriveImportProcessed(job.processed_files);
            }
            if (job.total_files !== undefined) {
              setDriveImportTotal(job.total_files);
            }
            if (job.metadata?.currentFile) {
              setDriveImportCurrentFile(job.metadata.currentFile);
              setCurrentOperation(job.metadata.currentFile);
            }

            // Check completion
            if (job.status === 'completed' || job.status === 'failed') {
              if (pollingInterval) clearInterval(pollingInterval);
              setDriveImportJobId(null);
              setDriveImporting(false);
              setUploading(false);

              if (job.status === 'completed') {
                setUploadProgress(100);
                setCurrentOperation('Complete');
                toast({ title: 'Import Complete', description: `Imported ${job.successful_files || 0} files` });
              } else {
                toast({ title: 'Import Failed', variant: 'destructive' });
              }

              Promise.all([fetchDocuments(), fetchPhysicalFiles(), fetchStats()]);
            }
          }
        } catch (err) {
          console.error('[GoogleDrive Polling] Error:', err);
        }
      }, 2000); // Poll every 2 seconds
    };

    socket.on('connect', () => {
      console.log('[GoogleDrive WebSocket] ✅ Connected for import job:', driveImportJobId);
      wsConnected = true;

      // Join user-specific room to receive import job events
      if (userId) {
        socket.emit('join', userId);
        console.log('[GoogleDrive WebSocket] 📢 Joined user room:', userId);
      } else {
        console.warn('[GoogleDrive WebSocket] ⚠️ No userId found, cannot join user room');
        // Start polling if no userId (can't join room)
        startPolling();
      }
    });

    socket.on('connect_error', (error) => {
      // WebSocket connection failed - this is expected in some network configurations
      // Fallback to polling automatically (no need to alarm user)
      console.log('[GoogleDrive WebSocket] ⚠️ WebSocket unavailable, using polling fallback');
      // Start polling as fallback if WebSocket fails
      if (!wsConnected) {
        startPolling();
      }
    });

    socket.on('import:job:progress', (data: any) => {
      console.log('[GoogleDrive WebSocket] 📊 Progress update:', data);

      if (data.jobId !== driveImportJobId) return; // Ignore other jobs

      // Update progress states
      if (data.progress !== undefined) {
        setDriveImportProgress(data.progress);
        setUploadProgress(data.progress);
      }

      if (data.processedFiles !== undefined) {
        setDriveImportProcessed(data.processedFiles);
      }

      if (data.totalFiles !== undefined) {
        setDriveImportTotal(data.totalFiles);
      }

      if (data.currentFile) {
        setDriveImportCurrentFile(data.currentFile);
        setCurrentOperation(data.currentFile);
      }

      // Refresh documents list incrementally
      if (data.processedFiles && data.processedFiles > 0) {
        fetchDocuments();
      }
    });

    socket.on('import:job:status', (data: any) => {
      console.log('[GoogleDrive WebSocket] 📢 Status update:', data);

      if (data.jobId !== driveImportJobId) return;

      if (data.status === 'completed') {
        setDriveImportJobId(null);
        setDriveImporting(false);
        setUploading(false);
        setUploadProgress(100);
        setCurrentOperation('Complete');

        setTimeout(() => {
          setUploadProgress(0);
          setCurrentOperation('');
          setDriveImportProgress(0);
          setDriveImportProcessed(0);
          setDriveImportTotal(0);
          setDriveImportCurrentFile('');
        }, 2000);

        // Refresh all data
        Promise.all([fetchDocuments(), fetchPhysicalFiles(), fetchStats()]);

        toast({
          title: 'Import Complete',
          description: `Successfully imported ${data.successfulFiles || driveImportTotal} files from Google Drive`
        });
      } else if (data.status === 'failed') {
        setDriveImportJobId(null);
        setDriveImporting(false);
        setUploading(false);
        setUploadProgress(0);
        setCurrentOperation('');

        // Still refresh to show any partial imports
        Promise.all([fetchDocuments(), fetchPhysicalFiles(), fetchStats()]);

        toast({
          title: 'Import Failed',
          description: 'An error occurred during the import process',
          variant: 'destructive'
        });
      }
    });

    return () => {
      socket.disconnect();
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [driveImportJobId]);

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesType = true;
    switch (filterType) {
      case 'analyzed':
        matchesType = doc.processing_status === 'analyzed';
        break;
      case 'processing':
        matchesType = doc.processing_status === 'processing';
        break;
      case 'pending':
        matchesType = doc.processing_status === 'pending' || !doc.processing_status;
        break;
      case 'completed':
        matchesType = doc.processing_status === 'completed';
        break;
      case 'failed':
        matchesType = doc.processing_status === 'failed';
        break;
      case 'embedded':
        matchesType = doc.hasEmbeddings || doc.metadata?.embeddings > 0;
        break;
      case 'not-embedded':
        matchesType = !doc.hasEmbeddings && (!doc.metadata?.embeddings || doc.metadata.embeddings === 0);
        break;
    }

    return matchesSearch && matchesType;
  });

  // Reset pagination when search or filter changes
  useEffect(() => {
    setVisibleDocumentsCount(DOCUMENTS_PER_PAGE);
  }, [searchQuery, filterType]);

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRows(new Set());
    } else {
      // Select ALL filtered documents (not just visible ones)
      setSelectedRows(new Set(filteredDocuments.map(doc => doc.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleRowSelect = (docId: string) => {
    const newSelectedRows = new Set(selectedRows);
    if (newSelectedRows.has(docId)) {
      newSelectedRows.delete(docId);
    } else {
      newSelectedRows.add(docId);
    }
    setSelectedRows(newSelectedRows);
    setSelectAll(newSelectedRows.size === filteredDocuments.length && filteredDocuments.length > 0);
  };

  const clearSelection = () => {
    setSelectedRows(new Set());
    setSelectAll(false);
  };

  const getSelectedCount = () => {
    return selectedRows.size;
  };

  // Fetch batch schemas
  const fetchBatchSchemas = async () => {
    try {
      const response = await fetch(getApiUrl('pdfTemplates'), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Templates loaded:', data.templates);
        setBatchSchemas(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch batch schemas:', error);
    }
  };

  // Fetch available tables from source database
  const fetchAvailableTables = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/pdf/source-tables`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableTables(data.tables || []);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    }
  };

  // Auto-suggest table name when template is selected
  useEffect(() => {
    if (batchSelectedSchema) {
      // Suggest table name based on template
      const suggestedTable = `${batchSelectedSchema}_documents`;
      setBatchSelectedTable(suggestedTable);

      // Also fetch existing tables
      fetchAvailableTables();
    }
  }, [batchSelectedSchema]);


  // Quick Transform - Direct database save via GraphQL (no modal)
  const handleQuickTransform = async () => {
    const selectedDocs = Array.from(selectedRows);
    const csvDocs = documents.filter(doc =>
      selectedDocs.includes(doc.id) &&
      (doc.type || doc.file_type)?.toLowerCase() === 'csv'
    );

    if (csvDocs.length === 0) {
      toast({
        title: 'No CSV documents selected',
        description: 'Please select at least one CSV file to transform',
        variant: 'destructive'
      });
      return;
    }

    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchStatus(`Transforming ${csvDocs.length} CSV file(s) to database...`);

    try {
      const result = await executeMutation(TRANSFORM_DOCUMENTS_TO_SOURCE_DB, {
        documentIds: csvDocs.map(doc => doc.id),
        sourceDbId: 'source_database',
        tableName: undefined, // Auto-generate table name
        batchSize: 100,
        createNewTable: true
      });

      toast({
        title: 'Transform started',
        description: `Job ID: ${result.transformDocumentsToSourceDb.jobId}`,
      });

      // Refresh documents
      setTimeout(async () => {
        await Promise.all([fetchDocuments(), fetchStats()]);
        clearSelection();
        setBatchProcessing(false);
        setBatchProgress(100);
        setBatchStatus('');
      }, 2000);

    } catch (error: any) {
      console.error('Quick transform error:', error);
      toast({
        title: 'Transform failed',
        description: error.message || 'Failed to transform documents',
        variant: 'destructive'
      });
      setBatchProcessing(false);
      setBatchProgress(0);
      setBatchStatus('');
    }
  };

  // Handle batch transform - insert into database table
  const handleBatchTransform = async (schemaId: string, targetTable: string) => {
    const selectedDocs = Array.from(selectedRows);

    // ✅ ONLY CSV files can use table transform
    // PDF/TXT/MD/DOC should use embeddings instead
    const csvDocs = documents.filter(doc =>
      selectedDocs.includes(doc.id) &&
      (doc.type || doc.file_type)?.toLowerCase() === 'csv'
    );

    if (csvDocs.length === 0) {
      toast({
        title: t('documents.batch.noCsvDocuments'),
        description: t('documents.batch.csvOnlyDescription'),
        variant: "destructive"
      });
      return;
    }

    if (!targetTable) {
      toast({
        title: t('documents.batch.targetTableRequired'),
        description: t('documents.batch.selectTargetTable'),
        variant: "destructive"
      });
      return;
    }

    // Find selected schema
    const selectedSchema = batchSchemas.find(t => t.id === schemaId);
    if (!selectedSchema) {
      toast({
        title: t('documents.batch.templateNotFound'),
        description: t('documents.batch.selectValidTemplate'),
        variant: "destructive"
      });
      return;
    }

    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchCurrent(0);
    setBatchTotal(csvDocs.length);
    setBatchStatus(`Transforming ${csvDocs.length} CSV files to table...`);

    try {
      const documentIds = csvDocs.map(doc => doc.id);

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/pdf/batch-metadata-transform`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentIds,
          schemaId: selectedSchema.id,
          schema: {
            fieldSelections: selectedSchema.target_fields,
            tableName: targetTable,
            targetTableName: targetTable,
            useExistingTable: false,
            sourceDbId: 'scriptus_lsemb',
            template: selectedSchema.id
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Batch transform failed');
      }

      const data = await response.json();

      // Poll for progress
      const checkProgress = setInterval(async () => {
        try {
          const progressResponse = await fetch(`${API_CONFIG.baseUrl}/api/v2/pdf/job-status/${data.jobId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            }
          });
          const progressData = await progressResponse.json();

          if (progressData) {
            setBatchProgress(progressData.percentage || 0);
            setBatchStatus(progressData.message || 'Processing...');
            if (progressData.current) setBatchCurrent(progressData.current);

            if (progressData.status === 'completed') {
              clearInterval(checkProgress);
              setBatchProgress(100);
              setBatchStatus(t('documents.batch.transformComplete'));

              toast({
                title: t('documents.batch.success'),
                description: t('documents.batch.transformSuccess', { count: csvDocs.length, table: targetTable }),
              });

              // Refresh documents and stats
              setTimeout(async () => {
                await Promise.all([fetchDocuments(), fetchStats()]);
              }, 500);

              setTimeout(() => {
                clearSelection();
                setBatchProcessing(false);
                setBatchProgress(0);
                setBatchStatus('');
                setBatchCurrent(0);
                setBatchTotal(0);
                setShowBatchModal(false);
                setBatchSelectedSchema('');
                setBatchSelectedTable('');
              }, 2000);
            } else if (progressData.status === 'error') {
              clearInterval(checkProgress);
              throw new Error(progressData.error || 'Transform failed');
            }
          }
        } catch (error) {
          clearInterval(checkProgress);
          console.error('Progress check error:', error);
        }
      }, 1000); // Poll every 1 second

    } catch (error: any) {
      console.error('Batch transform error:', error);
      toast({
        title: "Error",
        description: error.message || 'Batch transform failed',
        variant: "destructive"
      });
      setBatchProcessing(false);
      setBatchProgress(0);
      setBatchStatus('');
      setBatchCurrent(0);
      setBatchTotal(0);
    }
  };

  // Handle batch embedding for PDF/TXT/MD/DOC files
  const handleBatchEmbed = async () => {
    const selectedDocs = Array.from(selectedRows);
    const embedDocs = documents.filter(doc =>
      selectedDocs.includes(doc.id) &&
      ['pdf', 'txt', 'md', 'doc', 'docx'].includes((doc.type || doc.file_type)?.toLowerCase() || '')
    );

    if (embedDocs.length === 0) {
      toast({
        title: t('documents.batch.noDocumentsToEmbed'),
        description: t('documents.batch.selectDocumentsToEmbed'),
        variant: "destructive"
      });
      return;
    }

    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchCurrent(0);
    setBatchTotal(embedDocs.length);

    // Initialize embed queue with all documents
    const initialQueue = embedDocs.map(doc => ({
      id: doc.id,
      title: doc.title,
      status: 'pending' as const
    }));
    setEmbedQueue(initialQueue);

    let embeddedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    try {
      // Process each document one by one for real-time progress
      for (let i = 0; i < embedDocs.length; i++) {
        const doc = embedDocs[i];

        // Update current document being processed
        setCurrentEmbeddingDoc(doc.title);
        setBatchCurrent(i + 1);
        setBatchProgress(Math.round(((i) / embedDocs.length) * 100));
        setBatchStatus(`Embedding: ${doc.title}`);

        // Update queue status to processing
        setEmbedQueue(prev => prev.map(q =>
          q.id === doc.id ? { ...q, status: 'processing' as const } : q
        ));

        try {
          const response = await fetch(getApiUrl('bulkEmbed'), {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ documentIds: [doc.id] })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Embed failed');
          }

          const data = await response.json();

          // Check for failed status in results
          const docResult = data.results?.find((r: any) => r.id === doc.id);

          if (data.failed > 0 || docResult?.status === 'error') {
            // Backend reported failure
            console.error(`Embed failed for ${doc.title}:`, docResult?.error || 'Unknown error');
            errorCount++;
            setEmbedQueue(prev => prev.map(q =>
              q.id === doc.id ? { ...q, status: 'error' as const } : q
            ));
          } else if (data.embedded > 0) {
            embeddedCount++;
            const chunkCount = docResult?.chunks || 1;

            // Update queue status to completed
            setEmbedQueue(prev => prev.map(q =>
              q.id === doc.id ? { ...q, status: 'completed' as const } : q
            ));

            // Update document in local state to show embedded status
            setDocuments(prev => prev.map(d =>
              d.id === doc.id
                ? { ...d, hasEmbeddings: true, metadata: { ...d.metadata, embeddings: chunkCount } }
                : d
            ));
          } else if (data.skipped > 0) {
            // Already embedded, mark as skipped
            skippedCount++;
            setEmbedQueue(prev => prev.map(q =>
              q.id === doc.id ? { ...q, status: 'skipped' as const } : q
            ));
            // Mark as embedded since it was skipped (already has embeddings)
            setDocuments(prev => prev.map(d =>
              d.id === doc.id
                ? { ...d, hasEmbeddings: true }
                : d
            ));
          } else {
            // No embedding, no skip - treat as error
            errorCount++;
            setEmbedQueue(prev => prev.map(q =>
              q.id === doc.id ? { ...q, status: 'error' as const } : q
            ));
          }
        } catch (docError: any) {
          console.error(`Error embedding ${doc.title}:`, docError);
          errorCount++;
          setEmbedQueue(prev => prev.map(q =>
            q.id === doc.id ? { ...q, status: 'error' as const } : q
          ));
        }
      }

      setBatchProgress(100);
      setCurrentEmbeddingDoc('');
      setBatchStatus(t('documents.batch.embeddingsCreated'));

      toast({
        title: t('documents.batch.success'),
        description: `Embedded: ${embeddedCount}, Skipped: ${skippedCount}${errorCount > 0 ? `, Errors: ${errorCount}` : ''}`,
      });

      // Refresh documents and stats immediately
      await Promise.all([fetchDocuments(), fetchStats()]);

      // Reset batch states after refresh
      clearSelection();
      setBatchProcessing(false);
      setBatchProgress(0);
      setBatchStatus('');
      setBatchCurrent(0);
      setBatchTotal(0);
      setEmbedQueue([]);
      setCurrentEmbeddingDoc('');

    } catch (error: any) {
      console.error('Batch embed error:', error);
      toast({
        title: "Error",
        description: error.message || 'Batch embedding failed',
        variant: "destructive"
      });
      setBatchProcessing(false);
      setBatchProgress(0);
      setBatchStatus('');
      setBatchCurrent(0);
      setBatchTotal(0);
      setEmbedQueue([]);
      setCurrentEmbeddingDoc('');
    }
  };

  const handleBatchProcess = async (schemaId: string) => {
    const selectedDocs = Array.from(selectedRows);
    const pdfDocs = documents.filter(doc => selectedDocs.includes(doc.id) && (doc.type || doc.file_type)?.toLowerCase() === 'pdf');

    if (pdfDocs.length === 0) {
      toast({
        title: t('documents.batch.noPdfDocuments'),
        description: t('documents.batch.selectPdfDocuments'),
        variant: "destructive"
      });
      return;
    }

    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchCurrent(0);
    setBatchTotal(pdfDocs.length);
    setBatchStatus(t('documents.batch.processing', { count: pdfDocs.length }));

    try {
      const documentIds = pdfDocs.map(doc => doc.id);

      // Find selected template
      const selectedTemplate = batchSchemas.find(t => t.id === schemaId);

      const response = await fetch(getApiUrl('pdfBatchMetadata'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentIds,
          template: selectedTemplate
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Batch processing failed');
      }

      const data = await response.json();

      // Poll for progress
      const checkProgress = setInterval(async () => {
        try {
          const progressResponse = await fetch(`${API_CONFIG.baseUrl}/api/v2/pdf/job-status/${data.jobId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            }
          });
          const progressData = await progressResponse.json();

          if (progressData) {
            setBatchCurrent(progressData.current || 0);
            setBatchProgress(progressData.percentage || 0);
            setBatchStatus(`Processing ${progressData.current}/${progressData.total}: ${progressData.currentDocument || ''}`);

            if (progressData.status === 'completed') {
              clearInterval(checkProgress);
              setBatchProgress(100);
              setBatchStatus(t('documents.batch.batchProcessingComplete'));

              toast({
                title: t('documents.batch.success'),
                description: t('documents.batch.processSuccess', { count: pdfDocs.length }),
              });

              // Refresh documents and stats
              setTimeout(async () => {
                await Promise.all([fetchDocuments(), fetchStats()]);
              }, 500);

              // Clear selection and reset state after 2 seconds
              setTimeout(() => {
                clearSelection();
                setBatchProcessing(false);
                setBatchProgress(0);
                setBatchStatus('');
              }, 2000);
            } else if (progressData.status === 'error' || progressData.status === 'failed') {
              clearInterval(checkProgress);
              throw new Error(progressData.error || 'Batch processing failed');
            }
          }
        } catch (error) {
          clearInterval(checkProgress);
          console.error('Progress check error:', error);
        }
      }, 1000); // Poll every 1 second for faster updates

    } catch (error: any) {
      console.error('Batch processing error:', error);
      toast({
        title: "Error",
        description: error.message || 'Batch processing failed',
        variant: "destructive"
      });
      setBatchProcessing(false);
      setBatchProgress(0);
      setBatchStatus('');
    }
  };

  return (
    <div className="p-6 pb-40">
      <div className="w-[98%] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {t('documents.title')}
          </h1>
        </div>

        {/* Stats Cards - Pastel Colors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-6">
          {/* Total Documents - Blue Pastel */}
          <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-3">
              <div className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">{t('documents.stats.totalDocuments')}</div>
              <div className="text-xl font-bold text-blue-900 dark:text-blue-100">
                {(documents || []).length.toLocaleString()}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                <span className="font-mono text-xs">+{stats.history?.uploaded_today || 0}</span>
                <span className="opacity-75 ml-1 text-xs">{t('documents.stats.today')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Embedded - Green Pastel */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
            <CardContent className="p-3">
              <div className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">{t('documents.stats.embedded')}</div>
              <div className="text-xl font-bold text-green-900 dark:text-green-100">
                {(documents || []).filter(doc => doc.metadata?.embeddings > 0).length.toLocaleString()}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                <span className="font-mono text-xs">{(documents || []).filter(doc => !doc.metadata?.embeddings || doc.metadata.embeddings === 0).length.toLocaleString()}</span>
                <span className="opacity-75 ml-1 text-xs">{t('documents.stats.pending')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Skipped Embeddings - Red Pastel (only show if count > 0) */}
          {skippedCount > 0 && (
            <Card
              className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 border-red-200 dark:border-red-800 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => { fetchSkippedEmbeddings(); setShowSkippedModal(true); }}
            >
              <CardContent className="p-3">
                <div className="text-xs text-red-700 dark:text-red-300 font-medium mb-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Skipped
                </div>
                <div className="text-xl font-bold text-red-900 dark:text-red-100">
                  {skippedCount.toLocaleString()}
                </div>
                <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  <span className="opacity-75 text-xs">Review & retry</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* OCR Processed - Purple Pastel */}
          <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20 border-purple-200 dark:border-purple-800">
            <CardContent className="p-3">
              <div className="text-xs text-purple-700 dark:text-purple-300 font-medium mb-1">{t('documents.stats.ocrProcessed')}</div>
              <div className="text-xl font-bold text-purple-900 dark:text-purple-100">
                {(documents || []).filter(doc => doc.metadata?.ocr_processed === true).length.toLocaleString()}
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                <span className="font-mono text-xs">{(documents || []).filter(doc => (doc.type || doc.file_type) && ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes((doc.type || doc.file_type).toLowerCase()) && !doc.metadata?.ocr_processed).length.toLocaleString()}</span>
                <span className="opacity-75 ml-1 text-xs">{t('documents.stats.pending')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Physical Files - Orange Pastel */}
          <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border-orange-200 dark:border-orange-800">
            <CardContent className="p-3">
              <div className="text-xs text-orange-700 dark:text-orange-300 font-medium mb-1">{t('documents.stats.physicalFiles')}</div>
              <div className="text-xl font-bold text-orange-900 dark:text-orange-100">
                {physicalFilesStats.total.toLocaleString()}
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                <span className="font-mono text-xs">{physicalFilesStats.notInDatabase.toLocaleString()}</span>
                <span className="opacity-75 ml-1 text-xs">{t('documents.stats.notInDb')}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Files Section - 2 Column Layout */}
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 items-stretch">
            {/* Left Column (40%) - Upload & Physical Files */}
            <div className="xl:col-span-5 lg:col-span-6 flex flex-col gap-4 h-full">
              {/* Upload Area */}
              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left: Upload Area (50%) */}
                    <div>
                      <div
                        className={`rounded-lg p-3 text-center transition-colors duration-200 ${isDragging
                          ? 'bg-blue-50 dark:bg-blue-950/20'
                          : 'bg-muted/30 hover:bg-muted/50'
                          }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <Upload className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                        <p className="text-sm font-medium mb-1">{t('documents.upload.dropFiles')}</p>
                        <p className="text-xs text-neutral-500 mb-3">{t('documents.upload.clickToBrowse')}</p>

                        <input
                          type="file"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                          id="file-upload-area"
                        />

                        {/* Buttons Row - Select Files + Google Drive */}
                        <div className="flex gap-2 w-full">
                          <label htmlFor="file-upload-area" className="flex-1 cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('file-upload-area')?.click(); }}>
                            <Button
                              size="sm"
                              className="w-full pointer-events-none"
                              disabled={uploading}
                              type="button"
                            >
                              {uploading ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                  {t('documents.upload.uploading')}
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3 h-3 mr-2" />
                                  {t('documents.upload.selectFiles')}
                                </>
                              )}
                            </Button>
                          </label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={openDriveFilePicker}
                                  disabled={uploading}
                                  className="px-3"
                                >
                                  <HardDrive className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Google Drive</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        {/* Save to DB Toggle */}
                        <div className="flex items-center justify-center gap-2 mt-3 pt-3">
                          <Label htmlFor="save-to-db" className="text-xs cursor-pointer" role="label">
                            {t('documents.upload.saveToDatabase')}
                          </Label>
                          <Switch
                            id="save-to-db"
                            checked={saveToDb}
                            onCheckedChange={setSaveToDb}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right: Circular Progress + Filename + Progress Bar */}
                    {/* Use for both upload and batch processing */}
                    <div className="flex flex-col items-center justify-center gap-3">
                      {/* Circular Progress with Pulse */}
                      <div className="relative w-32 h-32">
                        {/* Pulse animation ring (only when processing) */}
                        {(uploading || batchProcessing) && (
                          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                        )}
                        {/* Background Circle */}
                        <svg className="w-32 h-32 transform -rotate-90 relative z-10">
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="none"
                            className="text-gray-200 dark:text-gray-700"
                          />
                          {/* Progress Circle - Use batch progress if batch processing, otherwise upload progress */}
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 56}`}
                            strokeDashoffset={`${2 * Math.PI * 56 * (1 - (batchProcessing ? batchProgress : uploadProgress) / 100)}`}
                            className={`transition-all duration-500 ease-out ${(uploading || batchProcessing) ? 'text-primary' : 'text-gray-300 dark:text-gray-600'}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        {/* Center Content - Show batch or upload percentage */}
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                          <span className="text-3xl font-bold transition-all duration-300">
                            {Math.round(batchProcessing ? batchProgress : uploadProgress)}%
                          </span>
                        </div>
                      </div>

                      {/* Status text below circle */}
                      {(currentOperation || batchStatus) && (
                        <div className="text-center px-2 max-w-[240px]">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate block">
                            {batchProcessing ? batchStatus : currentOperation?.replace('Uploading ', '').replace('...', '')}
                          </span>
                        </div>
                      )}

                      {/* Stats - Upload or Batch */}
                      {batchProcessing && batchTotal > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-[9px] text-muted-foreground/80">
                            <span className="font-mono">{batchCurrent} / {batchTotal} files</span>
                            <span className="opacity-50">•</span>
                            <span className="font-mono">{Math.round(batchProgress)}% complete</span>
                          </div>
                          {currentImportingFile && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium max-w-[240px] truncate">
                              {currentImportingFile}
                            </div>
                          )}
                        </div>
                      )}
                      {!batchProcessing && uploading && uploadSpeed > 0 && (
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/80">
                          <span className="font-mono">{formatSpeed(uploadSpeed)}</span>
                          <span className="opacity-50">•</span>
                          <span className="font-mono">{formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}</span>
                          <span className="opacity-50">•</span>
                          <span className="font-mono">{formatTime(timeRemaining)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Physical Files List */}
              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm flex-1 flex flex-col">
                <CardContent className="flex flex-col overflow-hidden p-4 pt-3 flex-1">
                  {/* Search & Filter */}
                  <div className="flex gap-2 mb-3" role="search" aria-label={t('documents.physicalFiles.searchFiles')}>
                    {physicalFilesFilter !== 'folders' && physicalFiles && physicalFiles.length > 0 && (
                      <Checkbox
                        checked={selectAllPhysicalFiles}
                        onCheckedChange={handleSelectAllPhysicalFiles}
                        aria-label="Select all files"
                        className="mt-2"
                      />
                    )}
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder={t('documents.physicalFiles.searchFiles')}
                        value={physicalFilesSearch}
                        onChange={(e) => setPhysicalFilesSearch(e.target.value)}
                        className="pl-10 h-9"
                        aria-label={t('documents.physicalFiles.searchFiles')}
                      />
                    </div>
                    <Select value={physicalFilesFilter} onValueChange={setPhysicalFilesFilter}>
                      <SelectTrigger className="h-9 w-32" aria-label={t('documents.physicalFiles.filterFiles')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('documents.physicalFiles.allTypes')}</SelectItem>
                        <SelectItem value="folders">{t('documents.physicalFiles.folders')}</SelectItem>
                        <SelectItem value="txt">TXT</SelectItem>
                        <SelectItem value="md">Markdown</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Files List */}
                  <ScrollArea className="flex-1 min-h-[200px] max-h-[600px]">
                    {(physicalFilesLoading || foldersLoading) ? (
                      <div className="divide-y divide-border">
                        {[...Array(8)].map((_, i) => (
                          <div key={i} className="flex items-center gap-2 p-4">
                            {/* Action buttons skeleton on left */}
                            <div className="flex gap-1 flex-shrink-0">
                              <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                              <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                            </div>
                            {/* File name skeleton */}
                            <div className="flex-1 space-y-2 min-w-0">
                              <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                              <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : physicalFilesFilter === 'folders' ? (
                      /* Folders View */
                      folders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">{t('documents.physicalFiles.noFoldersFound')}</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {folders
                            .filter(folder => {
                              // Search filter
                              if (physicalFilesSearch && !folder.name.toLowerCase().includes(physicalFilesSearch.toLowerCase())) {
                                return false;
                              }
                              return true;
                            })
                            .map((folder) => (
                              <div
                                key={folder.path}
                                className="flex items-center gap-2 p-4 hover:bg-muted/50 transition-colors group"
                              >
                                {/* Actions on the left */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {/* DB icon - for batch import */}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleFolderBatchImport(folder.name)}
                                    disabled={processingFolders.has(folder.name) || folder.newFilesCount === 0}
                                    className={`h-7 px-2 ${folder.newFilesCount === 0
                                      ? 'cursor-not-allowed opacity-50'
                                      : 'hover:bg-green-100 dark:hover:bg-green-900/20'
                                      }`}
                                    title={folder.newFilesCount === 0 ? t('documents.physicalFiles.allFilesInDb') : t('documents.physicalFiles.importFolder')}
                                  >
                                    {processingFolders.has(folder.name) ? (
                                      <Loader2 className="w-3 h-3 text-green-600 animate-spin" />
                                    ) : (
                                      <Database className={`w-3 h-3 ${folder.newFilesCount === 0 ? 'text-gray-400' : 'text-green-600'}`} />
                                    )}
                                  </Button>

                                  {/* Delete icon */}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 hover:bg-red-100 dark:hover:bg-red-900/20"
                                    title={t('documents.physicalFiles.deleteFolder')}
                                  >
                                    <Trash2 className="w-3 h-3 text-red-600" />
                                  </Button>
                                </div>

                                {/* Folder icon */}
                                <FolderOpen className="w-4 h-4 text-amber-600 flex-shrink-0" />

                                {/* Folder name and stats */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" title={folder.name}>
                                    {folder.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {folder.pdfCount} PDFs • {folder.inDatabaseCount} in DB • {folder.newFilesCount} new
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )
                    ) : (
                      /* Files View */
                      !physicalFiles || physicalFiles.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <File className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">{t('documents.physicalFiles.noFilesFound')}</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {physicalFiles
                            .filter(file => {
                              // Search filter
                              if (physicalFilesSearch && !file.filename.toLowerCase().includes(physicalFilesSearch.toLowerCase())) {
                                return false;
                              }
                              // File type filter
                              if (physicalFilesFilter !== 'all') {
                                const fileExt = file.ext.toLowerCase();
                                // Handle markdown separately
                                if (physicalFilesFilter === 'md' && fileExt !== 'md' && fileExt !== 'markdown') {
                                  return false;
                                }
                                if (physicalFilesFilter !== 'md' && fileExt !== physicalFilesFilter) {
                                  return false;
                                }
                              }
                              return true;
                            })
                            .slice(0, visiblePhysicalFilesCount)
                            .map((file) => (
                              <div
                                key={file.path}
                                className={`flex items-center gap-2 p-4 transition-colors group ${
                                  selectedPhysicalFiles.has(file.path)
                                    ? 'bg-blue-50 dark:bg-blue-950/30'
                                    : 'hover:bg-muted/50'
                                }`}
                              >
                                {/* Checkbox */}
                                <Checkbox
                                  checked={selectedPhysicalFiles.has(file.path)}
                                  onCheckedChange={() => handleSelectPhysicalFile(file.path)}
                                  aria-label={`Select ${file.filename}`}
                                  className="flex-shrink-0"
                                />

                                {/* DB status icon - shows if file is in database */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => !file.inDatabase && handleAddPhysicalFileToDb(file.path)}
                                    className={`h-7 px-2 ${file.inDatabase
                                      ? 'cursor-not-allowed opacity-50'
                                      : 'hover:bg-green-100 dark:hover:bg-green-900/20'
                                      }`}
                                    title={file.inDatabase ? t('documents.physicalFiles.alreadyInDatabase') : t('documents.physicalFiles.addToDatabase')}
                                    disabled={file.inDatabase || processingFiles.has(file.path)}
                                  >
                                    {processingFiles.has(file.path) ? (
                                      <Loader2 className="w-3 h-3 text-green-600 animate-spin" />
                                    ) : (
                                      <Database className={`w-3 h-3 ${file.inDatabase ? 'text-gray-400' : 'text-green-600'}`} />
                                    )}
                                  </Button>
                                </div>

                                {/* File name and size */}
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                  <p
                                    className="text-sm font-medium flex-1 truncate"
                                    title={file.displayName || file.filename}
                                  >
                                    {file.displayName || file.filename}
                                  </p>
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono">
                                    {formatFileSize(file.size)}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )
                    )}
                  </ScrollArea>

                  {/* Load More Button for Physical Files */}
                  {!physicalFilesLoading && physicalFiles && (
                    (() => {
                      const filteredCount = physicalFiles.filter(file => {
                        if (physicalFilesSearch && !file.filename.toLowerCase().includes(physicalFilesSearch.toLowerCase())) {
                          return false;
                        }
                        if (physicalFilesFilter !== 'all') {
                          const fileExt = file.ext.toLowerCase();
                          if (physicalFilesFilter === 'md' && fileExt !== 'md' && fileExt !== 'markdown') {
                            return false;
                          }
                          if (physicalFilesFilter !== 'md' && fileExt !== physicalFilesFilter) {
                            return false;
                          }
                        }
                        return true;
                      }).length;

                      return filteredCount > visiblePhysicalFilesCount && (
                        <div className="flex items-center px-4 py-3 border-t bg-gray-50/50 dark:bg-gray-900/50">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVisiblePhysicalFilesCount(prev => prev + PHYSICAL_FILES_PER_PAGE)}
                            className="gap-2"
                          >
                            {t('documents.loadMore')}
                            <span className="text-xs text-muted-foreground">
                              ({filteredCount - visiblePhysicalFilesCount} {t('documents.remaining')})
                            </span>
                          </Button>
                        </div>
                      );
                    })()
                  )}

                  {/* Action Bar - Shows when files are selected */}
                  {selectedPhysicalFiles.size > 0 && (
                    <div className="px-4 py-3 bg-muted/30 dark:bg-muted/10 border-t border-border/50 mt-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {bulkAddInProgress ? (
                            <>
                              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                              <span className="font-medium text-blue-600">
                                Adding to database: {bulkAddProgress.current}/{bulkAddProgress.total}
                              </span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="font-medium">
                                {selectedPhysicalFiles.size} {selectedPhysicalFiles.size === 1 ? 'file' : 'files'} selected
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1 bg-background/40 backdrop-blur-sm border border-border/50 rounded-md p-0.5">
                          {/* Bulk Add to Database Button */}
                          <ConfirmTooltip
                            onConfirm={handleBulkAddToDatabase}
                            message={`Add ${selectedPhysicalFiles.size} selected file(s) to database?`}
                            side="top"
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-blue-500/10 transition-colors"
                              title={`Add ${selectedPhysicalFiles.size} selected file(s) to database`}
                              disabled={bulkAddInProgress}
                            >
                              {bulkAddInProgress ? (
                                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                              ) : (
                                <Database className="w-4 h-4 text-blue-600" />
                              )}
                            </Button>
                          </ConfirmTooltip>

                          {/* Bulk Delete Button */}
                          <ConfirmTooltip
                            onConfirm={() => handleBulkDeletePhysicalFiles(Array.from(selectedPhysicalFiles))}
                            message={`Delete ${selectedPhysicalFiles.size} selected file(s)?`}
                            side="top"
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-red-500/10 transition-colors"
                              title={`Delete ${selectedPhysicalFiles.size} selected file(s)`}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </ConfirmTooltip>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Right Column (60%) - Database Files */}
            <div className="xl:col-span-7 lg:col-span-6 flex flex-col gap-4 h-full">
              {/* Search and Filter - Moved Above Table */}
              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 w-4 h-4" aria-hidden="true" />
                      <Input
                        placeholder={t('documents.search.searchDocuments')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        aria-label={t('documents.search.searchDocuments')}
                      />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('documents.search.allFiles')}</SelectItem>
                        <SelectItem value="analyzed">{t('documents.search.analyzed')}</SelectItem>
                        <SelectItem value="processing">{t('documents.search.processing')}</SelectItem>
                        <SelectItem value="pending">{t('documents.search.pending')}</SelectItem>
                        <SelectItem value="completed">{t('documents.search.completed')}</SelectItem>
                        <SelectItem value="failed">{t('documents.search.failed')}</SelectItem>
                        <SelectItem value="embedded">{t('documents.search.embedded')}</SelectItem>
                        <SelectItem value="not-embedded">{t('documents.search.notEmbedded')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="outline" className="px-3 py-2">
                      {filteredDocuments.length} of {documents.length} files
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm flex flex-col flex-1 min-h-[400px]">
                <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                  {/* Fixed Header */}
                  <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <Table>
                      <TableHeader className="bg-gray-50 dark:bg-gray-900">
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectAll && filteredDocuments.length > 0}
                              onCheckedChange={handleSelectAll}
                              className=""
                            />
                          </TableHead>
                          <TableHead className="w-44">{t('documents.table.name')}</TableHead>
                          <TableHead className="w-20">{t('documents.table.type')}</TableHead>
                          <TableHead className="w-32">{t('documents.table.status')}</TableHead>
                          <TableHead className="w-16">{t('documents.table.size')}</TableHead>
                          <TableHead className="w-24">{t('documents.table.date')}</TableHead>
                        </TableRow>
                      </TableHeader>
                    </Table>
                  </div>

                  {/* Scrollable Body */}
                  <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[600px]">
                    <Table>
                      <TableBody>
                        {(loading || batchProcessing) ? (
                          <TableBodySkeleton rows={20} columns={7} />
                        ) : filteredDocuments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                              <File className="w-12 h-12 mx-auto mb-3 opacity-40" />
                              <p className="text-base font-medium mb-1">{t('documents.search.noDocumentsFound')}</p>
                              <p className="text-sm">{t('documents.search.uploadToStart')}</p>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredDocuments.slice(0, visibleDocumentsCount).map(doc => (
                            <TableRow
                              key={doc.id}
                              className={`hover:bg-muted/50 transition-colors duration-150 ${selectedRows.has(doc.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                            >
                              <TableCell className="flex justify-center">
                                <Checkbox
                                  checked={selectedRows.has(doc.id)}
                                  onCheckedChange={() => handleRowSelect(doc.id)}
                                  className=""
                                />
                              </TableCell>
                              <TableCell className="font-medium truncate max-w-40" title={doc.title}>
                                {doc.title}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-xs font-semibold border-2 transition-all duration-150 ${(doc.type || doc.file_type || 'text')?.toLowerCase() === 'pdf' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' :
                                    (doc.type || doc.file_type || 'text')?.toLowerCase() === 'csv' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' :
                                      (doc.type || doc.file_type || 'text')?.toLowerCase() === 'json' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400' :
                                        ['md', 'txt', 'doc', 'docx'].includes((doc.type || doc.file_type || 'text')?.toLowerCase()) ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400' :
                                          'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-400'
                                    }`}
                                >
                                  {(doc.type || doc.file_type || 'TEXT').toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  // Use actual processing_status from database if available
                                  const processingStatus = doc.processing_status;
                                  const isEmbedded = doc.metadata?.embeddings;
                                  const isOCRProcessed = doc.metadata?.ocr_processed;

                                  let status = '';
                                  let colorClass = '';

                                  // Map processing_status values to display
                                  if (processingStatus) {
                                    switch (processingStatus) {
                                      case 'pending':
                                      case 'waiting':
                                        status = t('documents.status.waiting');
                                        colorClass = 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400';
                                        break;
                                      case 'analyzing':
                                        status = t('documents.status.analyzing');
                                        colorClass = 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400';
                                        break;
                                      case 'analyzed':
                                        status = t('documents.status.analyzed');
                                        colorClass = 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400';
                                        break;
                                      case 'embedded':
                                        status = t('documents.status.embedded');
                                        // Purple/violet for embedded - distinct from transformed
                                        colorClass = 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400';
                                        break;
                                      case 'transformed':
                                        status = t('documents.status.transformed');
                                        // Emerald/green for transformed - indicates data in DB
                                        colorClass = 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400';
                                        break;
                                      case 'failed':
                                        status = t('documents.status.failed');
                                        colorClass = 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400';
                                        break;
                                      default:
                                        // Fallback for unknown status
                                        status = processingStatus;
                                        colorClass = 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400';
                                    }
                                  } else {
                                    // Fallback to old logic if processing_status is not available
                                    if (isEmbedded) {
                                      status = t('documents.status.embedded');
                                      colorClass = 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400';
                                    } else if (isOCRProcessed) {
                                      status = t('documents.status.ocrDone');
                                      colorClass = 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400';
                                    } else {
                                      status = t('documents.status.raw');
                                      colorClass = 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400';
                                    }
                                  }

                                  return (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <div className="flex items-center gap-1 cursor-pointer group">
                                          <Badge variant="outline" className={`text-xs font-medium border transition-all duration-150 ${colorClass} hover:opacity-80`}>
                                            {status}
                                          </Badge>
                                          <MoreHorizontal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handlePreview(doc)}>
                                          <Eye className="w-3 h-3 mr-2" />
                                          {t('documents.table.preview')}
                                        </DropdownMenuItem>
                                        {/* Delete embeddings option - only show for embedded docs */}
                                        {(doc.hasEmbeddings || doc.processing_status === 'embedded' || doc.metadata?.embeddings > 0) && (
                                          <DropdownMenuItem
                                            onClick={() => handleDeleteEmbeddings(doc.id, doc.title)}
                                            className="text-orange-600 focus:text-orange-600"
                                          >
                                            <XCircle className="w-3 h-3 mr-2" />
                                            Delete Embeddings
                                          </DropdownMenuItem>
                                        )}
                                        {/* Delete document */}
                                        <DropdownMenuItem
                                          onClick={() => handleDelete(doc.id, doc.title)}
                                          className="text-red-600 focus:text-red-600"
                                        >
                                          <Trash2 className="w-3 h-3 mr-2" />
                                          {t('documents.table.delete')}
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-xs">
                                {formatFileSize(doc.size || 0)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {formatDate(doc.metadata.created_at)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Fixed Footer: Load More */}
                  {(!loading && filteredDocuments.length > visibleDocumentsCount) && (
                    <div className="flex-shrink-0 flex items-center px-4 py-3 border-t bg-gray-50/50 dark:bg-gray-900/50">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleDocumentsCount(prev => prev + DOCUMENTS_PER_PAGE)}
                        className="gap-2"
                      >
                        {t('documents.table.loadMore')}
                        <span className="text-xs text-muted-foreground">
                          ({filteredDocuments.length - visibleDocumentsCount} {t('documents.table.remaining')})
                        </span>
                      </Button>
                    </div>
                  )}
                </CardContent>
                {getSelectedCount() > 0 && (
                  <div className="px-4 py-3 bg-muted/30 dark:bg-muted/10 border-t border-border/50">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="font-medium">
                          {getSelectedCount()} {getSelectedCount() === 1 ? t('documents.actions.documentSelected') : t('documents.actions.documentsSelected')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-background/40 backdrop-blur-sm border border-border/50 rounded-md p-0.5">
                        {/* Smart Batch Actions - CSV: Transform, Others: Embed */}
                        {(() => {
                          const selected = documents.filter(doc => selectedRows.has(doc.id));
                          const csvDocs = selected.filter(doc => (doc.type || doc.file_type)?.toLowerCase() === 'csv');
                          const embedDocs = selected.filter(doc => ['pdf', 'txt', 'md', 'doc', 'docx'].includes((doc.type || doc.file_type)?.toLowerCase() || ''));

                          return (
                            <>
                              {/* CSV Transform Button - Dropdown with Quick & Advanced options */}
                              {csvDocs.length > 0 && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={batchProcessing}
                                      className="h-8 px-2 hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                                    >
                                      <Database className="w-4 h-4 text-green-600 mr-1" />
                                      <span className="text-xs font-medium">
                                        {batchProcessing ? 'Transforming...' : `Transform (${csvDocs.length})`}
                                      </span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={handleQuickTransform}>
                                      <Zap className="w-4 h-4 mr-2 text-green-600" />
                                      Quick Transform
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setShowBatchModal(true)}>
                                      <Target className="w-4 h-4 mr-2 text-blue-600" />
                                      Advanced Transform
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}

                              {/* PDF/TXT/MD/DOC Embed Button */}
                              {embedDocs.length > 0 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={handleBatchEmbed}
                                        disabled={batchProcessing}
                                        className="h-8 px-2 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                                      >
                                        {batchProcessing ? (
                                          <Loader2 className="w-4 h-4 text-blue-600 mr-1 animate-spin" />
                                        ) : (
                                          <Zap className="w-4 h-4 text-blue-600 mr-1" />
                                        )}
                                        <span className="text-xs font-medium">Embed ({embedDocs.length})</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('documents.actions.embed')}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </>
                          );
                        })()}

                        {/* Bulk Delete Embeddings Button */}
                        <ConfirmTooltip
                          onConfirm={handleBulkDeleteEmbeddings}
                          message={`Delete embeddings for ${selectedRows.size} documents?`}
                          side="top"
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={batchProcessing}
                            className="h-8 w-8 p-0 hover:bg-orange-100 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 text-orange-600" />
                          </Button>
                        </ConfirmTooltip>

                        {/* Bulk Delete Documents */}
                        <ConfirmTooltip
                          onConfirm={handleBulkDelete}
                          message={t('documents.actions.deleteSelected', { count: selectedRows.size })}
                          side="top"
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:bg-destructive/10 transition-colors"
                            title={t('documents.actions.deleteSelectedDocuments')}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </ConfirmTooltip>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>


      {/* Document Preview Modal - Use unified modal for all types */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Batch Process Modal */}
      <Dialog open={showBatchModal} onOpenChange={(open) => {
        setShowBatchModal(open);
        if (open) {
          fetchAvailableTables();
          fetchBatchSchemas();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col !z-[10000]">
          {/* 3D Glassmorphic Header */}
          <div className="flex-shrink-0 px-6 py-4 relative">
            {/* Glass effect layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-800 dark:via-slate-850 dark:to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),0_8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_0_rgba(0,0,0,0.4)] border-b border-slate-300/50 dark:border-slate-700/50" />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">{t('documents.modal.batchProcessDocuments')}</DialogTitle>
                <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0.5">
                  {selectedRows.size} {t('documents.modal.files')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('documents.modal.extractAndInsert')}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Template Selection */}
            <div className="space-y-3">
              <Label htmlFor="batch-template" className="text-sm font-medium">
                {t('documents.modal.analysisTemplate')}
              </Label>
              <Select
                value={batchSelectedSchema}
                onValueChange={(value) => {
                  setBatchSelectedSchema(value);
                  fetchAvailableTables();
                }}
              >
                <SelectTrigger id="batch-template">
                  <SelectValue placeholder={t('documents.modal.selectTemplate')} />
                </SelectTrigger>
                <SelectContent className="z-[1002]">
                  {batchSchemas.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {batchSelectedSchema && (
                <p className="text-xs text-muted-foreground">
                  {batchSchemas.find(t => t.id === batchSelectedSchema)?.description || ''}
                </p>
              )}
            </div>

            {/* Target Table Selection */}
            <div className="space-y-3">
              <Label htmlFor="batch-table" className="text-sm font-medium">
                {t('documents.modal.targetTable')}
              </Label>
              {availableTables.length > 0 ? (
                <>
                  <Select
                    value={batchSelectedTable}
                    onValueChange={setBatchSelectedTable}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('documents.modal.selectTable')} />
                    </SelectTrigger>
                    <SelectContent className="z-[1002]">
                      {availableTables.map((table) => (
                        <SelectItem key={table} value={table}>
                          {table}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('documents.modal.dataInsertedToTable')}
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded border border-dashed">
                  {t('documents.modal.noTablesAvailable')}
                </div>
              )}
            </div>

            {/* Field Mappings */}
            {batchSelectedSchema && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">{t('documents.modal.fieldMappings')}</Label>
                <div className="bg-muted/30 dark:bg-black/20 border border-border/50 rounded p-4 max-h-[200px] overflow-y-auto">
                  {(() => {
                    const template = batchSchemas.find(t => t.id === batchSelectedSchema);
                    if (!template?.target_fields || template.target_fields.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground text-center py-3">
                          {t('documents.modal.noMappingsConfigured')}
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-2">
                        {template.target_fields.map((field: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <div className="w-1 h-1 rounded-full bg-green-500" />
                            <span className="font-mono">{field.targetField || field.name || `field_${idx}`}</span>
                            {field.sourceField && (
                              <>
                                <span className="text-muted-foreground">←</span>
                                <span className="text-muted-foreground">{field.sourceField}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Processing Progress with Circle */}
            {batchProcessing && (
              <div className="space-y-4 p-6 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50">
                <div className="flex items-center gap-6">
                  {/* Progress Circle with Gradient */}
                  <ProgressCircle
                    progress={batchProgress}
                    showPulse={true}
                    size={100}
                    statusText={`${batchCurrent}/${batchTotal}`}
                  />

                  {/* Status Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{batchStatus}</span>
                      <span className="font-mono text-xs text-muted-foreground">{batchCurrent} / {batchTotal} files</span>
                    </div>
                    <Progress value={batchProgress} className="h-2" />
                    {currentImportingFile && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate">
                        {currentImportingFile}
                      </p>
                    )}
                    {currentEmbeddingDoc && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate">
                        📄 {currentEmbeddingDoc}
                      </p>
                    )}
                  </div>
                </div>

                {/* Embed Queue Display */}
                {embedQueue.length > 0 && (
                  <div className="mt-4 border-t border-blue-200/50 pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Embed Queue</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {embedQueue.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                            item.status === 'processing'
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                              : item.status === 'completed'
                              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                              : item.status === 'skipped'
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                              : item.status === 'error'
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {item.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {item.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                          {item.status === 'skipped' && <span className="w-3 h-3 text-center font-bold">~</span>}
                          {item.status === 'error' && <XCircle className="w-3 h-3" />}
                          {item.status === 'pending' && <Clock className="w-3 h-3" />}
                          <span className="truncate flex-1">{item.title}</span>
                          {item.status === 'skipped' && <span className="text-[10px] opacity-70">(already embedded)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3D Glassmorphic Footer */}
          <div className="flex-shrink-0 px-6 py-4 relative">
            {/* Glass effect layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-850 dark:to-slate-800" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.8),0_-8px_32px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.05),0_-8px_32px_0_rgba(0,0,0,0.4)] border-t border-slate-300/50 dark:border-slate-700/50" />

            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="font-medium">{selectedRows.size} documents</span>
                {batchSelectedSchema && (
                  <>
                    <span>•</span>
                    <span>{batchSchemas.find(t => t.id === batchSelectedSchema)?.name}</span>
                  </>
                )}
                {batchSelectedTable && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{batchSelectedTable}</span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBatchModal(false);
                    if (!batchProcessing) {
                      setBatchSelectedSchema('');
                      setBatchSelectedTable('');
                    }
                  }}
                  disabled={batchProcessing}
                >
                  {t('documents.modal.cancel')}
                </Button>
                <Button
                  onClick={() => {
                    if (batchSelectedSchema && batchSelectedTable) {
                      handleBatchTransform(batchSelectedSchema, batchSelectedTable);
                    }
                  }}
                  disabled={!batchSelectedSchema || !batchSelectedTable || batchProcessing}
                >
                  {batchProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('documents.modal.processing')}
                    </>
                  ) : (
                    t('documents.modal.startProcessing')
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Operations Modal */}
      <Dialog open={showOperations} onOpenChange={setShowOperations}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-6">
            <DialogTitle>{t('documents.operations.title')}</DialogTitle>
            <DialogDescription>
              {t('documents.operations.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-6">
            <DocumentOperations
              selectedDocuments={new Set(selectedDocs)}
              allDocuments={documents}
              onOperationComplete={() => {
                setShowOperations(false);
                fetchDocuments();
                fetchStats();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Google Drive File Picker Modal */}
      <Dialog open={showDriveModal} onOpenChange={setShowDriveModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-white/20 dark:border-white/10">
          {/* Screen reader title */}
          <DialogTitle className="sr-only">Google Drive File Picker</DialogTitle>
          {/* Header - Breadcrumb only */}
          <div className="px-4 py-2 border-b border-white/10 dark:border-white/5">
            <div className="flex items-center gap-1 text-sm font-medium">
              <button
                onClick={() => navigateToPathIndex(-1)}
                className="text-foreground/70 hover:text-foreground transition-colors"
              >
                My Drive
              </button>
              {driveFolderPath.map((folder, index) => (
                <span key={folder.id} className="flex items-center gap-1">
                  <span className="text-muted-foreground/50">/</span>
                  <button
                    onClick={() => navigateToPathIndex(index)}
                    className={index === driveFolderPath.length - 1
                      ? 'text-foreground font-semibold'
                      : 'text-foreground/70 hover:text-foreground transition-colors'}
                  >
                    {folder.name}
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden px-6 py-4">
            {driveLoading && driveFiles.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !driveConnected && driveFiles.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                  <HardDrive className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">
                  Google Drive not connected
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = '/dashboard/settings?tab=advanced'}
                >
                  Go to Settings
                </Button>
              </div>
            ) : (
              <>
                {/* File List */}
                <ScrollArea className="h-[360px]">
                  <div className="space-y-0.5">
                    {driveFiles.map((file) => {
                      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                      const isSelected = selectedDriveFiles.has(file.id);

                      return (
                        <div
                          key={file.id}
                          className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all ${
                            isFolder
                              ? 'hover:bg-blue-500/10 dark:hover:bg-blue-500/20'
                              : isSelected
                                ? 'bg-primary/10 dark:bg-primary/20'
                                : 'hover:bg-muted/50'
                          }`}
                          onClick={() => {
                            if (isFolder) {
                              navigateToFolder(file.id, file.name);
                            } else {
                              toggleDriveFileSelection(file.id, file.mimeType);
                            }
                          }}
                        >
                          {!isFolder && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleDriveFileSelection(file.id, file.mimeType)}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0"
                            />
                          )}
                          {isFolder ? (
                            <FolderOpen className="w-5 h-5 text-blue-500 shrink-0" />
                          ) : file.iconLink ? (
                            <img src={file.iconLink} alt="" className="w-5 h-5 shrink-0" />
                          ) : (
                            <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                          )}
                          <div className="flex-1 min-w-0 flex items-baseline gap-2">
                            <span className={`text-sm truncate ${isFolder ? 'font-medium text-blue-600 dark:text-blue-400' : ''}`}>
                              {file.name}
                            </span>
                            {!isFolder && file.size && (
                              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                {(parseInt(file.size) / 1024).toFixed(0)} KB
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </ScrollArea>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 dark:border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selectedDriveFiles.size}/{driveFiles.filter(f => isImportableFile(f.mimeType)).length}
              </span>
              {driveFiles.filter(f => isImportableFile(f.mimeType)).length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllDriveFiles}
                  className="h-6 px-2 text-xs"
                >
                  {selectedDriveFiles.size === driveFiles.filter(f => isImportableFile(f.mimeType)).length
                    ? 'Deselect All'
                    : 'Select All'}
                </Button>
              )}
              {/* Load More - moved to footer */}
              {drivePageToken && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchDriveFiles(currentDriveFolderId, drivePageToken)}
                  disabled={driveLoading}
                  className="h-6 px-2 text-xs gap-1"
                >
                  {driveLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  Load More
                </Button>
              )}
            </div>
            <Button
              onClick={importFromDrive}
              disabled={selectedDriveFiles.size === 0}
              size="sm"
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white border-0"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Skipped Embeddings Modal */}
      <Dialog open={showSkippedModal} onOpenChange={(open) => {
        setShowSkippedModal(open);
        if (!open) {
          setSkippedEmbeddings([]);
          setSelectedSkippedIds(new Set());
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Skipped Embeddings ({skippedCount})
            </DialogTitle>
            <DialogDescription>
              These records were skipped during embedding due to missing or invalid content.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {skippedLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : skippedEmbeddings.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-muted-foreground">No skipped embeddings</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedSkippedIds.size === skippedEmbeddings.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedSkippedIds(new Set(skippedEmbeddings.map((r: any) => r.id)));
                            } else {
                              setSelectedSkippedIds(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-40">Content Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skippedEmbeddings.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedSkippedIds.has(record.id)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedSkippedIds);
                              if (checked) {
                                newSet.add(record.id);
                              } else {
                                newSet.delete(record.id);
                              }
                              setSelectedSkippedIds(newSet);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {record.source_table}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium max-w-[150px] truncate">
                          {record.source_name || `ID: ${record.source_id}`}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-red-600 dark:text-red-400">
                            {record.skip_reason || 'Unknown'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                          {record.content_preview || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>

          {/* Footer Actions */}
          {skippedEmbeddings.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
              <span className="text-sm text-muted-foreground">
                {selectedSkippedIds.size} of {skippedEmbeddings.length} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteSkipped}
                  disabled={selectedSkippedIds.size === 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}