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
import { TableSkeleton, StatsCardSkeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
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
  XCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import DocumentOperations from '@/components/DocumentOperations';
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
  metadata: {
    source?: string;
    created_at: string;
    updated_at: string;
    chunks?: number;
    embeddings?: boolean;
    ocr_processed?: boolean;
    category?: string;
    tags?: string[];
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
  scraping: {
    sites_defined: number;
    entities_matched: number;
    data_extracted: number;
    efficiency: number;
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
    scraping: {
      sites_defined: 0,
      entities_matched: 0,
      data_extracted: 0,
      efficiency: 0
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
      const response = await fetch(getApiUrl('/api/v2/documents'), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(getApiUrl('/api/v2/documents/stats'), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        }
      });

      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();

      // Calculate derived stats from backend data
      const totalDocs = documents.length;
      const embeddedDocs = documents.filter(d => d.metadata?.embeddings === true).length;
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
          total_tokens_used: 0, // TODO: Get from backend
          total_cost: 0, // TODO: Calculate from tokens
          avg_processing_time: 0, // TODO: Get from backend
          success_rate: totalDocs > 0 ? (embeddedDocs / totalDocs) * 100 : 0
        },
        scraping: {
          sites_defined: 0, // TODO: Get from scraper service
          entities_matched: 0, // TODO: Get from scraper service
          data_extracted: 0, // TODO: Get from scraper service
          efficiency: 0
        },
        history: {
          uploaded_today: 0, // TODO: Calculate from timestamps
          embedded_today: 0, // TODO: Calculate from timestamps
          ocr_today: 0, // TODO: Calculate from timestamps
          last_24h_activity: 0 // TODO: Calculate from activity log
        }
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('file', file); // Use 'file' instead of 'files' to match backend
      });

      const response = await fetch(getApiUrl('/api/v2/documents/upload'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();

      toast({
        title: 'Başarılı',
        description: `${files.length} döküman yüklendi`,
      });

      fetchDocuments();
      fetchStats();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Hata',
        description: error.message || 'Yükleme başarısız',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
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
      const response = await fetch(getApiUrl(`/api/v2/documents/ocr/${docId}`), {
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
      const response = await fetch(getApiUrl(`/api/v2/documents/${docId}/embeddings`), {
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

  const renderPreviewContent = () => {
    if (!previewDoc) return null;

    const fileType = previewDoc.type.toLowerCase();

    // CSV files
    if (fileType === 'csv') {
      return (
        <CSVTableViewer
          data={previewDoc.content}
          title={previewDoc.title}
          metadata={previewDoc.metadata}
        />
      );
    }

    // JSON files
    if (fileType === 'json') {
      try {
        const jsonData = JSON.parse(previewDoc.content);
        return (
          <JsonViewer
            data={jsonData}
            title={previewDoc.title}
          />
        );
      } catch (error) {
        return (
          <div className="p-4 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
            <p>Invalid JSON format</p>
            <pre className="mt-4 text-sm text-left bg-muted p-4 rounded">
              {previewDoc.content.substring(0, 500)}...
            </pre>
          </div>
        );
      }
    }

    // PDF files
    if (fileType === 'pdf') {
      return (
        <PDFViewer
          data={previewDoc.content}
          title={previewDoc.title}
          metadata={previewDoc.metadata}
        />
      );
    }

    // Markdown, DOC, TXT files
    if (['md', 'doc', 'docx', 'txt', 'rtf'].includes(fileType)) {
      return (
        <StructuredTextViewer
          data={previewDoc.content}
          title={previewDoc.title}
          fileType={fileType as any}
          metadata={previewDoc.metadata}
        />
      );
    }

    // Default text view
    return (
      <div className="p-4">
        <pre className="whitespace-pre-wrap text-sm">
          {previewDoc.content}
        </pre>
      </div>
    );
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesType = true;
    switch (filterType) {
      case 'embedded':
        matchesType = doc.metadata?.embeddings === true;
        break;
      case 'not-embedded':
        matchesType = doc.metadata?.embeddings !== true;
        break;
      case 'ocr':
        matchesType = doc.metadata?.ocr_processed === true;
        break;
      case 'pending':
        matchesType = !doc.metadata?.embeddings && !doc.metadata?.ocr_processed;
        break;
    }

    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="ocr">OCR Processing</TabsTrigger>
            <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
            <TabsTrigger value="scraping">Scraping</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500">Total Documents</p>
                    <p className="text-3xl font-bold">{stats.documents.total.toLocaleString()}</p>
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
                    <p className="text-3xl font-bold text-green-600">{stats.documents.embedded.toLocaleString()}</p>
                    <div className="flex items-center gap-2 text-sm">
                      <Progress value={(stats.documents.embedded / stats.documents.total) * 100} className="flex-1 h-2" />
                      <span className="text-neutral-600 min-w-12">
                        {Math.round((stats.documents.embedded / stats.documents.total) * 100)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500">Tokens Used</p>
                    <p className="text-3xl font-bold">{(stats.performance.total_tokens_used / 1000000).toFixed(1)}M</p>
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
                    <p className="text-3xl font-bold">{stats.performance.success_rate}%</p>
                    <div className="text-sm text-neutral-600">
                      {stats.performance.avg_processing_time}s avg
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Processing Status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Document Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Embedded</span>
                    <Badge variant="default">{stats.documents.embedded}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Pending</span>
                    <Badge variant="secondary">{stats.documents.pending}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Under Review</span>
                    <Badge variant="outline">{stats.documents.under_review}</Badge>
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
                    <Badge variant="default">{stats.documents.ocr_processed}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Pending</span>
                    <Badge variant="secondary">{stats.documents.ocr_pending}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Today</span>
                    <Badge>{stats.history.ocr_today}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Scraping Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Sites Defined</span>
                    <span className="font-semibold">{stats.scraping.sites_defined}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Entities Matched</span>
                    <span className="font-semibold">{stats.scraping.entities_matched.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Efficiency</span>
                    <span className="font-semibold text-green-600">{stats.scraping.efficiency}%</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            {/* Upload Area */}
            <Card>
              <CardContent className="p-8">
                <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Upload Documents</h3>
                  <p className="text-sm text-neutral-500 mb-4">
                    Drag and drop files here, or click to select
                  </p>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button disabled={uploading}>
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Select Files
                        </>
                      )}
                    </Button>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Search and Filter */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex-1 relative">
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
                      <SelectItem value="all">All Documents</SelectItem>
                      <SelectItem value="embedded">Embedded</SelectItem>
                      <SelectItem value="not-embedded">Not Embedded</SelectItem>
                      <SelectItem value="ocr">OCR Processed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Documents Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>OCR</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableSkeleton rows={8} columns={7} />
                  ) : filteredDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-neutral-500">
                        No documents found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDocuments.map(doc => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.type.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={doc.metadata?.embeddings ? 'default' : 'secondary'}>
                            {doc.metadata?.embeddings ? 'Embedded' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {doc.metadata?.ocr_processed ? (
                            <Badge variant="default">Processed</Badge>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatFileSize(doc.size || 0)}</TableCell>
                        <TableCell>{formatDate(doc.metadata.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePreview(doc)}
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                            {['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(doc.type.toLowerCase()) && !doc.metadata?.ocr_processed && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOCR(doc.id)}
                                title="Process with OCR"
                              >
                                <FileText className="w-3 h-3" />
                              </Button>
                            )}
                            {!doc.metadata?.embeddings && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEmbeddings(doc.id)}
                                title="Generate embeddings"
                              >
                                <Brain className="w-3 h-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="outline">
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Other Tabs (OCR, Embeddings, Scraping, Analytics) */}
          <TabsContent value="ocr">
            <Card>
              <CardHeader>
                <CardTitle>OCR Processing</CardTitle>
                <CardDescription>Process documents with Optical Character Recognition</CardDescription>
              </CardHeader>
              <CardContent>
                {documents.filter(d => ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'tiff'].includes(d.type.toLowerCase())).length > 0 ? (
                  <DocumentOperations
                    selectedDocuments={new Set()}
                    allDocuments={documents}
                    onOperationComplete={() => {
                      fetchDocuments();
                      fetchStats();
                    }}
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No OCR-eligible documents</p>
                    <p className="text-sm">Upload PDFs, images, or Word documents to enable OCR processing</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="embeddings">
            <Card>
              <CardHeader>
                <CardTitle>Embedding Management</CardTitle>
                <CardDescription>Generate embeddings for RAG and semantic search</CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length > 0 ? (
                  <DocumentOperations
                    selectedDocuments={new Set()}
                    allDocuments={documents}
                    onOperationComplete={() => {
                      fetchDocuments();
                      fetchStats();
                    }}
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No documents to embed</p>
                    <p className="text-sm">Upload documents to start generating embeddings</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scraping">
            <Card>
              <CardHeader>
                <CardTitle>Web Scraping</CardTitle>
                <CardDescription>Scraping sites and entity matching overview</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Sites Overview</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total Sites</span>
                        <span>{stats.scraping.sites_defined}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Scraping</span>
                        <span>12</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last 24h</span>
                        <span>342 items</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold">Entity Matching</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total Entities</span>
                        <span>{stats.scraping.entities_matched.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Matched</span>
                        <span>1,456</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Efficiency Rate</span>
                        <span className="text-green-600">{stats.scraping.efficiency}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>Analytics & Performance</CardTitle>
                <CardDescription>Detailed performance metrics and analytics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-neutral-500">
                  Advanced analytics dashboard coming soon...
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-7xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">
                {previewDoc?.title}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {previewDoc?.type?.toUpperCase()}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewDoc(null)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogDescription>
              {previewDoc && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                  <span>Size: {formatFileSize(previewDoc.size || 0)}</span>
                  <span>•</span>
                  <span>Created: {formatDate(previewDoc.metadata.created_at)}</span>
                  {previewDoc.metadata?.embeddings && (
                    <>
                      <span>•</span>
                      <Badge variant="default" className="text-xs">Embedded</Badge>
                    </>
                  )}
                  {previewDoc.metadata?.ocr_processed && (
                    <>
                      <span>•</span>
                      <Badge variant="secondary" className="text-xs">OCR Processed</Badge>
                    </>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {renderPreviewContent()}
          </div>
        </DialogContent>
      </Dialog>

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