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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Languages
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
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [showOperations, setShowOperations] = useState(false);
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

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

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
    setUploading(true);
    setUploadProgress(0);
    setUploadFiles(files);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const formData = new FormData();
      files.forEach(file => {
        formData.append('file', file);
      });

      console.log('Uploading files:', files);
      console.log('Upload URL:', getApiUrl('upload'));

      const response = await fetch(getApiUrl('upload'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      console.log('Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || errorData.message || 'Upload failed');
      }

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return 95;
          }
          return prev + 5;
        });
      }, 100);

      const result = await response.json();
      console.log('Upload result:', result);

      setUploadProgress(100);

      // Immediately fetch documents to update the table
      await fetchDocuments();
      await fetchStats();

      setTimeout(() => {
        setUploadProgress(0);
        setUploadFiles([]);

        toast({
          title: 'Başarılı',
          description: `${files.length} döküman yüklendi`,
        });
      }, 500);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Hata',
        description: error.message || 'Yükleme başarısız',
        variant: 'destructive'
      });
      setUploadProgress(0);
      setUploadFiles([]);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handlePreview = async (doc: Document) => {
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
        throw new Error(errorData.error || 'OCR failed');
      }

      const result = await response.json();

      toast({
        title: 'Başarılı',
        description: 'OCR processing completed successfully',
      });

      fetchDocuments();
    } catch (error: any) {
      console.error('OCR error:', error);
      toast({
        title: 'Hata',
        description: error.message || 'OCR processing failed',
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
    if (!confirm(`Are you sure you want to delete "${docTitle}"? This action cannot be undone.`)) {
      return;
    }

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
    <div className="p-6">
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-14">
            <TabsTrigger value="overview" className="h-12">Overview</TabsTrigger>
            <TabsTrigger value="documents" className="h-12">Files</TabsTrigger>
            <TabsTrigger value="ocr" className="h-12">OCR Processing</TabsTrigger>
            <TabsTrigger value="embeddings" className="h-12">Embeddings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {loading ? (
                <>
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <div className="h-4 w-20 bg-muted rounded"></div>
                        <div className="h-10 w-full bg-muted rounded"></div>
                        <div className="flex items-center gap-2 text-sm">
                          <div className="h-2 w-2 bg-muted rounded-full"></div>
                          <div className="h-3 w-16 bg-muted rounded"></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <div className="h-4 w-20 bg-muted rounded"></div>
                        <div className="h-10 w-full bg-muted rounded"></div>
                        <div className="h-2 flex-1 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <div className="h-4 w-20 bg-muted rounded"></div>
                        <div className="h-10 w-full bg-muted rounded"></div>
                        <div className="h-3 w-20 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <div className="h-4 w-20 bg-muted rounded"></div>
                        <div className="h-10 w-full bg-muted rounded"></div>
                        <div className="h-3 w-20 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <p className="text-sm text-neutral-500">Total Documents</p>
                        <AnimatedCounter
                          value={stats.documents.total}
                          duration={800}
                          className="text-3xl font-bold"
                        />
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-neutral-600">
                            +{stats.history.uploaded_today} today
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <p className="text-sm text-neutral-500">Embedded</p>
                        <AnimatedCounter
                          value={stats.documents.embedded}
                          duration={800}
                          className="text-3xl font-bold text-green-600"
                        />
                        <div className="flex items-center gap-2 text-sm">
                          <Progress value={(stats.documents.embedded / stats.documents.total) * 100} className="flex-1 h-2" />
                          <span className="text-neutral-600 min-w-12">
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

                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <p className="text-sm text-neutral-500">Tokens Used</p>
                        <AnimatedCounter
                          value={stats.performance.total_tokens_used / 1000000}
                          duration={800}
                          decimals={1}
                          suffix="M"
                          className="text-3xl font-bold"
                        />
                        <div className="text-sm text-neutral-600">
                          ${stats.performance.total_cost.toFixed(2)} spent
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <p className="text-sm text-neutral-500">Success Rate</p>
                        <AnimatedPercentage
                          value={stats.performance.success_rate}
                          duration={1000}
                          className="text-3xl font-bold"
                        />
                        <div className="text-sm text-neutral-600">
                          {stats.performance.avg_processing_time}s avg
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Processing Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading ? (
                <>
                  <Card>
                    <CardHeader>
                      <div className="h-5 w-24 bg-muted rounded"></div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-12 bg-muted rounded"></div>
                        <div className="h-4 w-8 bg-muted rounded"></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-12 bg-muted rounded"></div>
                        <div className="h-4 w-8 bg-muted rounded"></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-16 bg-muted rounded"></div>
                        <div className="h-4 w-12 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <div className="h-5 w-24 bg-muted rounded"></div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-12 bg-muted rounded"></div>
                        <div className="h-4 w-8 bg-muted rounded"></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-12 bg-muted rounded"></div>
                        <div className="h-4 w-8 bg-muted rounded"></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-8 bg-muted rounded"></div>
                        <div className="h-4 w-8 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <div className="h-5 w-24 bg-muted rounded"></div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-12 bg-muted rounded"></div>
                        <div className="h-4 w-12 bg-muted rounded"></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-20 bg-muted rounded"></div>
                        <div className="h-4 w-20 bg-muted rounded"></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-12 bg-muted rounded"></div>
                        <div className="h-4 w-8 bg-muted rounded text-green-600"></div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Document Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Embedded</span>
                        <Badge variant="default">
                          <AnimatedCounter value={stats.documents.embedded} duration={600} />
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Pending</span>
                        <Badge variant="secondary">
                          <AnimatedCounter value={stats.documents.pending} duration={600} />
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Under Review</span>
                        <Badge variant="outline">
                          <AnimatedCounter value={stats.documents.under_review} duration={600} />
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">OCR Processing</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Processed</span>
                        <Badge variant="default">
                          <AnimatedCounter value={stats.documents.ocr_processed} duration={600} />
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Pending</span>
                        <Badge variant="secondary">
                          <AnimatedCounter value={stats.documents.ocr_pending} duration={600} />
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Today</span>
                        <Badge>
                          <AnimatedCounter value={stats.history.ocr_today} duration={600} />
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  </>
              )}
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
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
              {/* Left Column (30%) - Forms and Progress */}
              <div className="lg:col-span-3 space-y-6">
                {/* Upload Area */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Upload className="w-5 h-5" />
                      Upload Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {uploading ? (
                      <div className="space-y-4">
                        <UploadSkeleton />
                        {uploadFiles.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-sm font-medium">Uploading {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''}...</p>
                            <div className="space-y-2">
                              {uploadFiles.map((file, index) => (
                                <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                  <Upload className="w-4 h-4 text-blue-500" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatFileSize(file.size)}
                                    </p>
                                  </div>
                                  <Progress value={uploadProgress} className="w-20 h-1" />
                                </div>
                              ))}
                            </div>
                            <Progress value={uploadProgress} className="h-2" />
                            <p className="text-xs text-muted-foreground text-center">
                              {uploadProgress}% complete
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${
                          isDragging
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <Upload className="w-10 h-10 text-neutral-400 mx-auto mb-3 transition-colors duration-200" />
                        <h3 className="text-base font-medium mb-2">Upload Files</h3>
                        <p className="text-xs text-neutral-500 mb-4">
                          Drag & drop or click to select
                        </p>
                        <input
                          type="file"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                          id="file-upload-left"
                        />
                        <label htmlFor="file-upload-left">
                          <Button
                            size="sm"
                            className="w-full hover:bg-primary/90 transition-colors duration-200"
                            disabled={uploading}
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
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Processing Progress */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Processing Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Embedding Progress</span>
                          <span className="font-medium">{stats.documents.embedded}/{stats.documents.total}</span>
                        </div>
                        <Progress
                          value={stats.documents.total > 0 ? (stats.documents.embedded / stats.documents.total) * 100 : 0}
                          className="h-2"
                        />
                        <span className="text-xs text-muted-foreground">
                          {Math.round(stats.documents.total > 0 ? (stats.documents.embedded / stats.documents.total) * 100 : 0)}% complete
                        </span>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>OCR Progress</span>
                          <span className="font-medium">{stats.documents.ocr_processed}/{stats.documents.total}</span>
                        </div>
                        <Progress
                          value={stats.documents.total > 0 ? (stats.documents.ocr_processed / stats.documents.total) * 100 : 0}
                          className="h-2"
                        />
                        <span className="text-xs text-muted-foreground">
                          {Math.round(stats.documents.total > 0 ? (stats.documents.ocr_processed / stats.documents.total) * 100 : 0)}% complete
                        </span>
                      </div>
                    </div>

                    {/* Stats Summary */}
                    <div className="pt-3 border-t space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Total Files</span>
                        <span className="font-medium">{stats.documents.total}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Pending</span>
                        <span className="font-medium text-orange-600">{stats.documents.pending}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Success Rate</span>
                        <span className="font-medium text-green-600">{stats.performance.success_rate}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                  </div>

              {/* Right Column (70%) - Tables */}
              <div className="lg:col-span-9">
                {/* Search and Filter - Moved Above Table */}
                <Card className="mb-4">
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

                <Card className="h-full">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={selectAll && filteredDocuments.length > 0}
                                onCheckedChange={handleSelectAll}
                                className="border-primary"
                              />
                            </TableHead>
                            <TableHead className="w-44">Name</TableHead>
                            <TableHead className="w-20">Type</TableHead>
                            <TableHead className="w-32">Model / Tokens</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                            <TableHead className="w-20">OCR</TableHead>
                            <TableHead className="w-16">Size</TableHead>
                            <TableHead className="w-24">Date</TableHead>
                            <TableHead className="w-28">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loading ? (
                            <TableBodySkeleton rows={8} columns={8} />
                          ) : filteredDocuments.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
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
                                    className="border-primary"
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
                                  <div className="text-xs space-y-1">
                                    <div className="font-medium text-blue-600 dark:text-blue-400">
                                      {doc.metadata?.embedding_model || doc.model_used || 'N/A'}
                                    </div>
                                    <div className="text-muted-foreground">
                                      {doc.metadata?.total_tokens_used || doc.tokens_used || 0} tokens
                                    </div>
                                    {doc.verified_at && (
                                      <div className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />
                                        <span>Verified</span>
                                      </div>
                                    )}
                                    {(doc.metadata?.cost_usd || doc.cost_usd) && (
                                      <div className="text-green-600 dark:text-green-400">
                                        ${parseFloat(doc.metadata?.cost_usd || doc.cost_usd || '0').toFixed(4)}
                                      </div>
                                    )}
                                  </div>
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
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOCR(doc.id);
                                        }}
                                        className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors duration-150"
                                        title="OCR"
                                      >
                                        <FileText className="w-3 h-3" />
                                      </Button>
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
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(doc.id, doc.title);
                                      }}
                                      className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 hover:text-red-700 transition-colors duration-150"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
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
                    <div className="border-t pt-3">
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

      {/* Document Preview Modal */}
      <DocumentPreview
        document={previewDoc}
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
      />

      {/* Document Operations Modal */}
      <Dialog open={showOperations} onOpenChange={setShowOperations}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 border-b">
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