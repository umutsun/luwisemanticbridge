'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, buildApiUrl, API_CONFIG } from '@/lib/config';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
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
  Brain,
  X,
  XCircle,
  Languages,
  FolderOpen
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

interface Document {
  id: string;
  title: string;
  content: string;
  type: string;
  size: number;
  file_path?: string; // Physical file path on server
  hasEmbeddings?: boolean; // from backend
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
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [physicalFilesLoading, setPhysicalFilesLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [activeTab, setActiveTab] = useState('files');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [showOperations, setShowOperations] = useState(false);
  const [physicalFiles, setPhysicalFiles] = useState<any[]>([]);
  const [physicalFilesStats, setPhysicalFilesStats] = useState({ total: 0, inDatabase: 0, notInDatabase: 0, uploadDirectory: '' });
  const [selectedPhysicalFiles, setSelectedPhysicalFiles] = useState<Set<string>>(new Set());
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
            title: 'Authentication Error',
            description: 'Please login again to continue',
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
        title: 'Error',
        description: 'Failed to load documents. Please try refreshing the page.',
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

      // Use stats from backend if available, otherwise calculate from documents
      const backendStats = data.stats || data;
      const totalDocs = documents.length;
      const embeddedDocs = documents.filter(d => d.hasEmbeddings || (d.metadata?.embeddings > 0)).length;
      const ocrProcessedDocs = documents.filter(d => d.metadata?.ocr_processed === true).length;

      setStats({
        documents: {
          total: totalDocs,
          embedded: embeddedDocs,
          pending: totalDocs - embeddedDocs,
          ocr_processed: ocrProcessedDocs,
          ocr_pending: totalDocs - ocrProcessedDocs,
          under_review: 0 // TODO: Implement review system
        },
        performance: {
          total_tokens_used: backendStats.total_tokens_used || 0,
          total_cost: backendStats.total_cost || 0,
          avg_processing_time: backendStats.avg_processing_time || 0,
          success_rate: totalDocs > 0 ? (embeddedDocs / totalDocs) * 100 : 0
        },
        history: {
          uploaded_today: backendStats.uploaded_today || 0,
          embedded_today: backendStats.embedded_today || 0,
          ocr_today: backendStats.ocr_today || 0,
          last_24h_activity: backendStats.last_24h_activity || 0
        }
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      // Set default stats on error
      const totalDocs = documents.length;
      const embeddedDocs = documents.filter(d => d.hasEmbeddings || (d.metadata?.embeddings > 0)).length;
      setStats({
        documents: {
          total: totalDocs,
          embedded: embeddedDocs,
          pending: totalDocs - embeddedDocs,
          ocr_processed: 0,
          ocr_pending: totalDocs,
          under_review: 0
        },
        performance: {
          total_tokens_used: 0,
          total_cost: 0,
          avg_processing_time: 0,
          success_rate: totalDocs > 0 ? (embeddedDocs / totalDocs) * 100 : 0
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
          title: 'Database Offline',
          description: data.warning,
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Failed to fetch physical files:', error);
      toast({
        title: 'Error',
        description: 'Failed to load physical files',
        variant: 'destructive'
      });
    } finally {
      setPhysicalFilesLoading(false);
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
        title: 'Success',
        description: 'File added to database successfully'
      });

      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setCurrentOperation('');
        fetchPhysicalFiles();
        fetchDocuments();
      }, 500);

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add file to database',
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
      const response = await fetch(getApiUrl(`preview/${filename}`), {
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
        title: 'Error',
        description: error.message || 'Failed to preview file',
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
        title: 'Success',
        description: 'File deleted successfully'
      });

      fetchPhysicalFiles();
      if (deleteFromDb) {
        fetchDocuments();
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete file',
        variant: 'destructive'
      });
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
    setCurrentOperation('Preparing...');

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
      setCurrentOperation('Completed!');

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
          title: 'Başarılı',
          description: `${files.length} döküman yüklendi`,
        });
      }, 800);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Hata',
        description: error.message || 'Yükleme başarısız',
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
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handlePreview = async (doc: Document) => {
    // For CSV/JSON files, fetch raw file content if file_path exists
    if ((doc.type === 'csv' || doc.type === 'json') && doc.metadata?.source) {
      try {
        const filePath = doc.metadata.source;
        const filename = filePath.split(/[/\\]/).pop();

        if (filename) {
          const token = localStorage.getItem('token');
          const response = await fetch(`http://localhost:8083/api/v2/documents/preview/${filename}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const fileData = await response.json();
            // Update document with raw file content
            setPreviewDoc({
              ...doc,
              content: fileData.content,
              metadata: {
                ...doc.metadata,
                ...fileData.metadata,
                source: 'physical'
              }
            });
            return;
          }
        }
      } catch (error) {
        console.error('Failed to fetch raw file:', error);
      }
    }

    // Fallback: use document as-is
    setPreviewDoc(doc);
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
          userMessage = 'Dosya sunucuda bulunamadı. Lütfen dosyayı tekrar yükleyin.';
        } else if (errorMessage.includes('already processed with OCR')) {
          userMessage = 'Bu belge zaten OCR ile işlenmiş.';
        } else if (errorMessage.includes('Document not found')) {
          userMessage = 'Belge bulunamadı.';
        }

        throw new Error(userMessage);
      }

      const result = await response.json();

      toast({
        title: 'Başarılı',
        description: `OCR işlemi tamamlandı. Güven: ${result.data?.confidence || 'N/A'}%`,
      });

      fetchDocuments();
    } catch (error: any) {
      console.error('OCR error:', error);
      toast({
        title: 'OCR Hatası',
        description: error.message || 'OCR işlemi başarısız oldu',
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
        title: 'Başarılı',
        description: `Generated ${result.embeddingCount} embeddings`,
      });

      fetchDocuments();
    } catch (error: any) {
      console.error('Embedding error:', error);
      toast({
        title: 'Hata',
        description: error.message || 'Embedding generation failed',
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
        title: 'Başarılı',
        description: 'Document deleted successfully',
      });

      // Refresh documents list
      fetchDocuments();
      fetchStats();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        title: 'Hata',
        description: error.message || 'Failed to delete document',
        variant: 'destructive'
      });
    }
  };

  const [selectAll, setSelectAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesType = true;
    switch (filterType) {
      case 'embedded':
        matchesType = doc.hasEmbeddings || doc.metadata?.embeddings > 0;
        break;
      case 'not-embedded':
        matchesType = !doc.hasEmbeddings && (!doc.metadata?.embeddings || doc.metadata.embeddings === 0);
        break;
      case 'ocr':
        matchesType = doc.metadata?.ocr_processed === true;
        break;
      case 'pending':
        matchesType = !doc.hasEmbeddings && (!doc.metadata?.embeddings || doc.metadata.embeddings === 0) && !doc.metadata?.ocr_processed;
        break;
    }

    return matchesSearch && matchesType;
  });

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRows(new Set());
    } else {
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

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-[90%] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Document Management
          </h1>
          <Button
            onClick={() => {
              fetchDocuments();
              fetchStats();
            }}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards Above Tabs - Marker Highlight Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white dark:bg-black ">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">Total Documents</p>
                <AnimatedCounter
                  value={stats.documents.total}
                  duration={800}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                  <span className="text-gray-600 dark:text-gray-400">
                    +{stats.history.uploaded_today} today
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-black ">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">Embedded</p>
                <AnimatedCounter
                  value={stats.documents.embedded}
                  duration={800}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
                <div className="flex items-center gap-2 text-sm">
                  <Progress value={(stats.documents.embedded / stats.documents.total) * 100} className="flex-1 h-2" />
                  <span className="text-gray-600 dark:text-gray-400 min-w-12 text-xs font-medium">
                    <AnimatedPercentage
                      value={(stats.documents.embedded / stats.documents.total) * 100}
                      duration={1000}
                      className="min-w-12"
                    />
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-black ">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">Physical Files</p>
                <AnimatedCounter
                  value={physicalFilesStats.total}
                  duration={800}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  {physicalFilesStats.notInDatabase} not in DB
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-black ">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">Success Rate</p>
                <AnimatedPercentage
                  value={stats.performance.success_rate}
                  duration={1000}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  {stats.performance.avg_processing_time}s avg
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-14">
            <TabsTrigger value="files" className="h-12">Files</TabsTrigger>
            <TabsTrigger value="ocr" className="h-12">OCR Processing</TabsTrigger>
            <TabsTrigger value="embeddings" className="h-12">Embeddings</TabsTrigger>
          </TabsList>

          {/* Files Tab - 2 Column Layout */}
          <TabsContent value="files" className="space-y-6">
            {getSelectedCount() > 0 && (
              <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-800 dark:text-green-200">
                        {getSelectedCount()} {getSelectedCount() === 1 ? 'document' : 'documents'} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowOperations(true)}
                        className="hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors duration-200"
                      >
                        <Brain className="h-3 w-3 mr-2" />
                        Batch Operations
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearSelection}
                        className="hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors duration-200"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (40%) - Upload & Physical Files */}
              <div className="lg:col-span-5 space-y-6">
                {/* Upload Area */}
                <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 gap-6">
                      {/* Left: Upload Area (50%) */}
                      <div>
                        <div
                          className={`rounded-lg p-4 text-center transition-colors duration-200 ${
                            isDragging
                              ? 'bg-blue-50 dark:bg-blue-950/20'
                              : 'bg-muted/30 hover:bg-muted/50'
                          }`}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          <Upload className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                          <p className="text-sm font-medium mb-1">Drop files here</p>
                          <p className="text-xs text-neutral-500 mb-3">or click to browse</p>

                          <input
                            type="file"
                            multiple
                            onChange={handleFileUpload}
                            className="hidden"
                            id="file-upload-area"
                          />
                          <label htmlFor="file-upload-area" className="w-full cursor-pointer">
                            <Button
                              size="sm"
                              className="w-full pointer-events-none"
                              disabled={uploading}
                              type="button"
                            >
                              {uploading ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3 h-3 mr-2" />
                                  Select Files
                                </>
                              )}
                            </Button>
                          </label>

                          {/* Save to DB Toggle */}
                          <div className="flex items-center justify-center gap-2 mt-3 pt-3">
                            <Label htmlFor="save-to-db" className="text-xs cursor-pointer">
                              Save to Database
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
                      <div className="flex flex-col items-center justify-center gap-3">
                        {/* Circular Progress */}
                        <div className="relative w-32 h-32">
                          {/* Background Circle */}
                          <svg className="w-32 h-32 transform -rotate-90">
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-gray-200 dark:text-gray-700"
                            />
                            {/* Progress Circle */}
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              strokeDasharray={`${2 * Math.PI * 56}`}
                              strokeDashoffset={`${2 * Math.PI * 56 * (1 - uploadProgress / 100)}`}
                              className={`transition-all duration-300 ${uploading ? 'text-primary' : 'text-gray-300 dark:text-gray-600'}`}
                              strokeLinecap="round"
                            />
                          </svg>
                          {/* Center Content - Only percentage */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-3xl font-bold">
                              {Math.round(uploadProgress)}%
                            </span>
                          </div>
                        </div>

                        {/* Filename text below circle - smaller UPPERCASE */}
                        {currentOperation && (
                          <div className="text-center px-2 max-w-[240px]">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate block">
                              {currentOperation.replace('Uploading ', '').replace('...', '')}
                            </span>
                          </div>
                        )}

                        {/* Upload Stats - Speed, Size, Time Remaining - Smaller */}
                        {uploading && uploadSpeed > 0 && (
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
                <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                  <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <span className="text-gray-900 dark:text-white font-semibold">docs</span>
                      </CardTitle>
                      <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                        {physicalFilesStats.total} • {physicalFilesStats.notInDatabase} pending
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Search & Filter */}
                    <div className="flex gap-2 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search files..."
                          value={physicalFilesSearch}
                          onChange={(e) => setPhysicalFilesSearch(e.target.value)}
                          className="pl-10 h-9"
                        />
                      </div>
                      <Select value={physicalFilesFilter} onValueChange={setPhysicalFilesFilter}>
                        <SelectTrigger className="h-9 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="txt">TXT</SelectItem>
                          <SelectItem value="md">Markdown</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="pdf">PDF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Files List */}
                    <ScrollArea className="h-[400px]">
                      {physicalFilesLoading ? (
                        <div className="space-y-2 p-2">
                          {[...Array(8)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2 p-2">
                              <div className="w-4 h-4 bg-muted rounded animate-pulse flex-shrink-0" />
                              <div className="flex-1 space-y-2">
                                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                              </div>
                              <div className="flex gap-1">
                                <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                                <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : physicalFiles.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <File className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">No files found</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
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
                            .map((file) => (
                            <div
                              key={file.path}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" title={file.displayName || file.filename}>
                                  {file.displayName || file.filename}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(file.size)} • {file.ext.toUpperCase()}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* Preview Button */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handlePreviewPhysicalFile(file.filename)}
                                  className="h-7 px-2 hover:bg-blue-100 dark:hover:bg-blue-900/20"
                                  title="Preview File"
                                >
                                  <Eye className="w-3 h-3 text-blue-600" />
                                </Button>

                                {!file.inDatabase && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleAddPhysicalFileToDb(file.path)}
                                    className="h-7 px-2 hover:bg-green-100 dark:hover:bg-green-900/20"
                                    title="Add to Database"
                                    disabled={processingFiles.has(file.path)}
                                  >
                                    {processingFiles.has(file.path) ? (
                                      <Loader2 className="w-3 h-3 text-green-600 animate-spin" />
                                    ) : (
                                      <Database className="w-3 h-3 text-green-600" />
                                    )}
                                  </Button>
                                )}
                                <ConfirmTooltip
                                  onConfirm={() => handleDeletePhysicalFile(file.path, file.inDatabase)}
                                  message={`Delete ${file.inDatabase ? 'from disk & DB' : 'from disk'}?`}
                                  side="top"
                                >
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 hover:bg-red-100 dark:hover:bg-red-900/20"
                                  >
                                    <Trash2 className="w-3 h-3 text-red-600" />
                                  </Button>
                                </ConfirmTooltip>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                  </div>

              {/* Right Column (60%) - Database Files */}
              <div className="lg:col-span-7">
                {/* Search and Filter - Moved Above Table */}
                <Card className="mb-4 bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex gap-4 items-center">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 w-4 h-4" />
                        <Input
                          placeholder="Search documents..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Files</SelectItem>
                          <SelectItem value="embedded">Embedded</SelectItem>
                          <SelectItem value="not-embedded">Not Embedded</SelectItem>
                          <SelectItem value="ocr">OCR Processed</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge variant="outline" className="px-3 py-2">
                        {filteredDocuments.length} of {documents.length} files
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="h-full bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
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
                            <TableHead className="w-44">Name</TableHead>
                            <TableHead className="w-20">Type</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                            <TableHead className="w-20">OCR</TableHead>
                            <TableHead className="w-16">Size</TableHead>
                            <TableHead className="w-24">Date</TableHead>
                            <TableHead className="w-28">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loading ? (
                            <TableBodySkeleton rows={8} columns={7} />
                          ) : filteredDocuments.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                <File className="w-12 h-12 mx-auto mb-3 opacity-40" />
                                <p className="text-base font-medium mb-1">No documents found</p>
                                <p className="text-sm">Upload files to get started</p>
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredDocuments.map(doc => (
                              <TableRow
                                key={doc.id}
                                className={`hover:bg-muted/50 transition-colors duration-150 cursor-pointer ${selectedRows.has(doc.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                                onClick={() => handleRowSelect(doc.id)}
                              >
                                <TableCell className="flex justify-center">
                                  <Checkbox
                                    checked={selectedRows.has(doc.id)}
                                    onChange={() => handleRowSelect(doc.id)}
                                    className=""
                                  />
                                </TableCell>
                                <TableCell className="font-medium truncate max-w-40" title={doc.title}>
                                  {doc.title}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs hover:bg-muted/50 transition-colors duration-150">
                                    {doc.type.toUpperCase()}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={doc.metadata?.embeddings ? 'default' : 'secondary'}
                                    className="text-xs hover:scale-105 transition-transform duration-150"
                                  >
                                    {doc.metadata?.embeddings ? 'Embedded' : 'Pending'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {doc.metadata?.ocr_processed ? (
                                    <Badge variant="default" className="text-xs hover:scale-105 transition-transform duration-150">
                                      <CheckCircle className="w-2 h-2 mr-1" />
                                      Done
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {formatFileSize(doc.size || 0)}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {formatDate(doc.metadata.created_at)}
                                </TableCell>
                                <TableCell className="relative">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePreview(doc);
                                      }}
                                      className="h-8 w-8 p-0 hover:bg-primary/10 transition-colors duration-150"
                                      title="Preview"
                                    >
                                      <Eye className="w-3 h-3" />
                                    </Button>
                                    {['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(doc.type.toLowerCase()) && !doc.metadata?.ocr_processed && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!doc.file_path) {
                                                  toast({
                                                    title: 'Dosya Bulunamadı',
                                                    description: 'Bu belgenin sunucuda fiziksel dosyası bulunamadı. OCR işlemi yapılamaz.',
                                                    variant: 'destructive'
                                                  });
                                                  return;
                                                }
                                                handleOCR(doc.id);
                                              }}
                                              disabled={!doc.file_path}
                                              className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              <FileText className="w-3 h-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {doc.file_path ? 'OCR ile metin çıkar' : 'Dosya sunucuda bulunamadı'}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {!doc.metadata?.embeddings && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEmbeddings(doc.id);
                                        }}
                                        className="h-8 w-8 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-colors duration-150"
                                        title="Embeddings"
                                      >
                                        <Brain className="w-3 h-3" />
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Handle download
                                      }}
                                      className="h-8 w-8 p-0 hover:bg-muted/50 transition-colors duration-150"
                                      title="Download"
                                    >
                                      <Download className="w-3 h-3" />
                                    </Button>
                                    <ConfirmTooltip
                                      onConfirm={() => handleDelete(doc.id, doc.title)}
                                      message="Delete from DB & disk?"
                                      side="top"
                                    >
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 hover:text-red-700 transition-colors duration-150"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </ConfirmTooltip>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Other Tabs (OCR, Embeddings, Scraping, Analytics) */}
          <TabsContent value="ocr" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left Column (30%) - OCR Controls */}
              <div className="lg:col-span-1 space-y-6">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      OCR Processing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-4">
                      Process documents with Optical Character Recognition to extract text from images and scanned documents.
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Eligible Documents</div>
                        <div className="text-lg font-bold">
                          {documents.filter(d => ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(d.type.toLowerCase())).length}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Processed</span>
                          <span className="font-medium text-green-600">{stats.documents.ocr_processed}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Pending</span>
                          <span className="font-medium text-orange-600">{stats.documents.ocr_pending}</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => setShowOperations(true)}
                      disabled={documents.filter(d => ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(d.type.toLowerCase())).length === 0}
                    >
                      <FileText className="w-3 h-3 mr-2" />
                      Process Documents
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">OCR Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium">Language</Label>
                        <Select defaultValue="tur+eng">
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tur+eng">Turkish + English</SelectItem>
                            <SelectItem value="eng">English Only</SelectItem>
                            <SelectItem value="tur">Turkish Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-medium">Quality</Label>
                        <Select defaultValue="high">
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High Quality</SelectItem>
                            <SelectItem value="medium">Medium Quality</SelectItem>
                            <SelectItem value="fast">Fast Processing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">OCR Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Today</span>
                          <span className="font-medium">{stats.history.ocr_today}</span>
                        </div>
                        <Progress value={stats.history.ocr_today * 10} className="h-1" />
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Avg processing time: 2.3s per document
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column (70%) - OCR Documents */}
              <div className="lg:col-span-3">
                <Card className="h-full">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">OCR-Ready Documents</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {documents.filter(d => ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(d.type.toLowerCase())).length} files
                      </Badge>
                      <Badge variant="secondary">
                        {documents.filter(d => ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(d.type.toLowerCase()) && !d.metadata?.ocr_processed).length} pending
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {documents.filter(d => ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(d.type.toLowerCase())).length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-40" />
                        <p className="text-xl font-medium mb-2">No OCR-eligible documents</p>
                        <p className="text-sm">Upload PDFs, images, or Word documents to enable OCR processing</p>
                      </div>
                    ) : (
                      <DocumentOperations
                        selectedDocuments={new Set()}
                        allDocuments={documents.filter(d => ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(d.type.toLowerCase()))}
                        onOperationComplete={() => {
                          fetchDocuments();
                          fetchStats();
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="embeddings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left Column (30%) - Embedding Controls */}
              <div className="lg:col-span-1 space-y-6">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Brain className="w-5 h-5" />
                      Embedding Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-4">
                      Generate embeddings for semantic search and RAG capabilities.
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Total Documents</div>
                        <div className="text-lg font-bold">{documents.length}</div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Embedded</span>
                          <span className="font-medium text-green-600">{stats.documents.embedded}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Pending</span>
                          <span className="font-medium text-orange-600">{stats.documents.pending}</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => setShowOperations(true)}
                      disabled={documents.length === 0}
                    >
                      <Brain className="w-3 h-3 mr-2" />
                      Generate Embeddings
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Embedding Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium">Model</Label>
                        <Select defaultValue="text-embedding-3-large">
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text-embedding-3-large">Large (Better Quality)</SelectItem>
                            <SelectItem value="text-embedding-3-small">Small (Faster)</SelectItem>
                            <SelectItem value="text-embedding-ada-002">ADA-002</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs font-medium">Chunk Size</Label>
                        <Select defaultValue="1024">
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="512">512 chars</SelectItem>
                            <SelectItem value="1024">1024 chars</SelectItem>
                            <SelectItem value="2048">2048 chars</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Tools & Services</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Tokens to process</span>
                        <span className="font-medium">{(stats.documents.pending * 1000).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Estimated cost</span>
                        <span className="font-medium">${(stats.documents.pending * 0.0001).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="pt-3">
                      <Button variant="default" className="w-full gap-2 text-sm">
                        <Languages className="h-4 w-4" />
                        Translate Documents
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Translate documents to multiple languages
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column (70%) - Embedding Documents */}
              <div className="lg:col-span-3">
                <Card className="h-full">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">All Documents</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {documents.length} files
                      </Badge>
                      <Badge variant="default">
                        {stats.documents.embedded} embedded
                      </Badge>
                      <Badge variant="secondary">
                        {stats.documents.pending} pending
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {documents.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Brain className="w-16 h-16 mx-auto mb-4 opacity-40" />
                        <p className="text-xl font-medium mb-2">No documents to embed</p>
                        <p className="text-sm">Upload documents to start generating embeddings</p>
                      </div>
                    ) : (
                      <DocumentOperations
                        selectedDocuments={new Set()}
                        allDocuments={documents}
                        onOperationComplete={() => {
                          fetchDocuments();
                          fetchStats();
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          </Tabs>
      </div>

      {/* Document Preview Modal - Use different modals based on file type */}
      {previewDoc && (previewDoc.type === 'csv' || previewDoc.type === 'json') ? (
        <DocumentPreviewModal
          document={previewDoc}
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      ) : (
        <DocumentPreview
          document={previewDoc}
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Document Operations Modal */}
      <Dialog open={showOperations} onOpenChange={setShowOperations}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-6">
            <DialogTitle>Document Operations</DialogTitle>
            <DialogDescription>
              Process documents with OCR and embedding operations
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
    </div>
  );
}