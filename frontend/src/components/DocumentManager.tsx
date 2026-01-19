'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Eye,
  Edit,
  Save,
  X,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Link as LinkIcon,
  Calendar,
  Hash,
  FolderOpen,
  CheckCircle,
  Brain,
  AlertCircle,
  PlayCircle,
  PauseCircle,
  BarChart3,
  Database
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import TemplateManager from './TemplateManager';

interface Document {
  id: string;
  title: string;
  content: string;
  type?: string;
  size?: number;
  hasEmbeddings?: boolean;
  file_path?: string;  // For determining file type
  metadata: {
    source?: string;
    url?: string;
    timestamp?: string;
    type?: string;
    chunks?: number;
    embeddings?: number;
    created_at?: string;
    updated_at?: string;
    mimeType?: string;
    uploadDate?: string;
    analysis?: {
      template?: 'legal' | 'novel' | 'research' | 'invoice' | 'contract' | 'general';
      [key: string]: any;
    };
  };
  created_at: string;
  updated_at?: string;
  status?: 'processed' | 'pending' | 'error';
  analyzeStatus?: 'waiting' | 'analyzed' | 'transformed';
}

export default function DocumentManager() {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);

  // Helper: Check if file is analyzable (not CSV)
  const isAnalyzableFile = (doc: Document): boolean => {
    const filePath = doc.file_path || '';
    const fileName = doc.title || '';
    const ext = (filePath || fileName).toLowerCase().split('.').pop();

    // Analyzable formats: .pdf, .doc, .docx, .txt, .md
    const analyzableExtensions = ['pdf', 'doc', 'docx', 'txt', 'md'];
    return ext ? analyzableExtensions.includes(ext) : false;
  };

  // Helper: Get analyze status for a document
  const getAnalyzeStatus = (doc: Document): 'waiting' | 'analyzed' | 'transformed' => {
    // Check if document has analysis metadata
    if (doc.metadata?.analysis && Object.keys(doc.metadata.analysis).length > 0) {
      return doc.analyzeStatus || 'analyzed';
    }
    return 'waiting';
  };

  // Helper: Get analyze template name
  const getAnalyzeTemplate = (doc: Document): string => {
    const template = doc.metadata?.analysis?.template;
    if (!template) return '';

    // Format template name for display
    const templateNames: Record<string, string> = {
      legal: 'Legal',
      novel: 'Novel',
      research: 'Research',
      invoice: 'Invoice',
      contract: 'Contract',
      general: 'General'
    };

    return templateNames[template] || template;
  };

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);

  // Batch operations states
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [batchEmbedding, setBatchEmbedding] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState(0);
  const [embeddingStatus, setEmbeddingStatus] = useState('');
  const [filterEmbedding, setFilterEmbedding] = useState<'all' | 'embedded' | 'not-embedded'>('all');
  const [embeddingProvider, setEmbeddingProvider] = useState('openai');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch documents from backend
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setError(t('documentManager.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Add new document
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          type: 'text'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('documentManager.messages.documentAddFailed'));
      }

      const result = await response.json();

      // Try to create embeddings for the document
      try {
        const embedResponse = await fetch(`${baseUrl}/api/v2/documents/${result.document.id}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (embedResponse.ok) {
          setSuccess(t('documentManager.messages.documentAdded') + ' ' + t('documentManager.messages.embeddingCreated'));
        } else {
          setSuccess(t('documentManager.messages.documentAdded') + ' (' + t('documentManager.messages.embeddingCreateFailed') + ')');
        }
      } catch (embedErr) {
        console.warn('Embedding creation failed:', embedErr);
        setSuccess(t('documentManager.messages.documentAdded') + ' (' + t('documentManager.messages.embeddingCreateFailed') + ')');
      }

      // Reset form
      setNewTitle('');
      setNewContent('');
      setNewUrl('');
      setNewFile(null);

      // Refresh documents list
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documentManager.messages.documentAddFailed'));
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError('');

    try {
      // For files that need server processing (PDF, Office docs), use backend upload
      if (file.type.includes('pdf') || file.type.includes('officedocument') || file.type.includes('msword') || file.type.includes('spreadsheet')) {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${baseUrl}/api/v2/documents/upload`, {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          setSuccess(t('documentManager.messages.fileUploaded'));
          await fetchDocuments(); // Refresh the document list
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || t('documentManager.messages.fileUploadFailed'));
        }
      } else {
        // For text files, read directly
        const text = await file.text();
        setNewTitle(file.name);
        setNewContent(text);
        setSuccess(t('documentManager.messages.fileContentLoaded'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documentManager.messages.fileUploadFailed'));
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // Delete document
  const handleDeleteDocument = async (id: string) => {
    if (!confirm(t('documentManager.messages.confirmDelete'))) return;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/documents/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setDocuments(documents.filter(d => d.id !== id));
        setSuccess(t('documentManager.messages.documentDeleted'));
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('documentManager.messages.documentDeleteFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documentManager.messages.documentDeleteFailed'));
      console.error(err);
    }
  };

  // Update document
  const handleUpdateDocument = async () => {
    if (!editingDocument) return;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/documents/${editingDocument.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingDocument.title,
          content: editingDocument.content,
          type: editingDocument.metadata?.type || 'text'
        })
      });

      if (response.ok) {
        await fetchDocuments();
        setEditingDocument(null);
        setSuccess(t('documentManager.messages.documentUpdated'));
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('documentManager.messages.documentUpdateFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documentManager.messages.documentUpdateFailed'));
      console.error(err);
    }
  };

  // Search documents
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesEmbeddingFilter = filterEmbedding === 'all' ||
      (filterEmbedding === 'embedded' && doc.hasEmbeddings) ||
      (filterEmbedding === 'not-embedded' && !doc.hasEmbeddings);

    return matchesSearch && matchesEmbeddingFilter;
  });

  // Batch operations functions
  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocuments(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDocuments.length === filteredDocuments.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(filteredDocuments.map(doc => doc.id));
    }
  };

  const handleBatchEmbedding = async () => {
    if (selectedDocuments.length === 0) {
      setError(t('documentManager.batchOperations.selectAtLeastOne'));
      return;
    }

    setBatchEmbedding(true);
    setEmbeddingProgress(0);
    setEmbeddingStatus('');
    setError('');

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
    const totalDocuments = selectedDocuments.length;
    let processedDocuments = 0;

    try {
      for (const docId of selectedDocuments) {
        const doc = documents.find(d => d.id === docId);
        if (!doc || doc.hasEmbeddings) {
          processedDocuments++;
          setEmbeddingProgress((processedDocuments / totalDocuments) * 100);
          continue;
        }

        setEmbeddingStatus(t('documentManager.batchOperations.embeddingInProgress', { count: 1 }) + ` "${doc.title}"`);

        const response = await fetch(`${baseUrl}/api/v2/documents/${docId}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          processedDocuments++;
          setEmbeddingProgress((processedDocuments / totalDocuments) * 100);
        } else {
          console.warn(`Embedding failed for document ${docId}`);
          processedDocuments++;
          setEmbeddingProgress((processedDocuments / totalDocuments) * 100);
        }
      }

      setSuccess(t('documentManager.batchOperations.embeddingComplete'));
      setSelectedDocuments([]);
      await fetchDocuments();
    } catch (error) {
      setError(t('documentManager.messages.embeddingCreateFailed'));
      console.error(error);
    } finally {
      setBatchEmbedding(false);
      setEmbeddingStatus('');
      setEmbeddingProgress(0);
    }
  };

  const handleDeleteEmbeddings = async (docId: string) => {
    if (!confirm(t('documentManager.messages.confirmDeleteEmbedding'))) return;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/documents/${docId}/embeddings`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSuccess(t('documentManager.messages.embeddingDeleted'));
        await fetchDocuments();
      } else {
        throw new Error(t('documentManager.messages.embeddingDeleteFailed'));
      }
    } catch (error) {
      setError(t('documentManager.messages.embeddingDeleteFailed'));
      console.error(error);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Template Manager state
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);

  // Calculate stats
  const analyzedCount = documents.filter(doc => getAnalyzeStatus(doc) !== 'waiting').length;
  const embeddedCount = documents.filter(doc => doc.hasEmbeddings).length;

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('documentManager.stats.totalDocuments')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
            <p className="text-xs text-muted-foreground">
              {t('documentManager.stats.description')}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setTemplateManagerOpen(true)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('documentManager.stats.analyzedDocuments')}</CardTitle>
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-600" />
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setTemplateManagerOpen(true); }}>
                <Edit className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyzedCount}</div>
            <p className="text-xs text-muted-foreground">
              {t('documentManager.stats.analyzedDescription')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('documentManager.stats.embeddedDocuments')}</CardTitle>
            <Database className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{embeddedCount}</div>
            <p className="text-xs text-muted-foreground">
              {t('documentManager.stats.embeddedDescription')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Doküman Listesi</TabsTrigger>
          <TabsTrigger value="add">Yeni Doküman</TabsTrigger>
          <TabsTrigger value="import">URL\'den İçe Aktar</TabsTrigger>
        </TabsList>

        {/* Documents List */}
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>LightRAG {t('documentManager.title')}</CardTitle>
                  <CardDescription>
                    {t('documentManager.stats.totalDocuments')}: {documents.length}
                  </CardDescription>
                </div>
                <Button onClick={fetchDocuments} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('common.refresh')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Batch Operations Controls */}
                {selectedDocuments.length > 0 && (
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedDocuments.length === filteredDocuments.length}
                            onCheckedChange={toggleSelectAll}
                          />
                          <span className="text-sm font-medium">
                            {selectedDocuments.length} {t('documentManager.batchOperations.selected')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={handleBatchEmbedding}
                            disabled={batchEmbedding}
                          >
                            {batchEmbedding ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Brain className="h-4 w-4 mr-2" />
                            )}
                            {t('documentManager.batchOperations.batchEmbedding')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
                                const token = localStorage.getItem('authToken');
                                const response = await fetch(`${baseUrl}/api/v2/documents/sync-statuses`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                  }
                                });
                                if (response.ok) {
                                  const result = await response.json();
                                  setSuccess(`Synced ${result.updated.length} documents`);
                                  await fetchDocuments();
                                } else {
                                  setError('Failed to sync document statuses');
                                }
                              } catch (error) {
                                setError('Error syncing statuses');
                              }
                            }}
                            title="Sync document processing statuses"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sync Statuses
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedDocuments([])}
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t('documentManager.batchOperations.clearSelection')}
                          </Button>
                        </div>
                      </div>
                      {batchEmbedding && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>{embeddingStatus || t('documentManager.batchOperations.processing')}</span>
                            <span>{Math.round(embeddingProgress)}%</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Search and Filter Bar */}
                <div className="flex gap-4 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={t('documentManager.search.placeholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('documentManager.search.status')}</span>
                    <Select value={filterEmbedding} onValueChange={(value: 'all' | 'embedded' | 'not-embedded') => setFilterEmbedding(value)}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tümü</SelectItem>
                        <SelectItem value="embedded">Embedding Var</SelectItem>
                        <SelectItem value="not-embedded">Embedding Yok</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Documents Table */}
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedDocuments.length === filteredDocuments.length && filteredDocuments.length > 0}
                              onCheckedChange={toggleSelectAll}
                            />
                          </TableHead>
                          <TableHead>{t('documentManager.table.headers.title')}</TableHead>
                          <TableHead>{t('documentManager.table.headers.source')}</TableHead>
                          <TableHead>{t('documentManager.table.headers.chunks')}</TableHead>
                          <TableHead>{t('documentManager.table.headers.embedding')}</TableHead>
                          <TableHead>{t('documentManager.table.headers.analyzeStatus')}</TableHead>
                          <TableHead>{t('documentManager.table.headers.date')}</TableHead>
                          <TableHead className="text-right">{t('documentManager.table.headers.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDocuments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-2">
                              {t('documentManager.table.noDocuments')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredDocuments.map((doc) => (
                            <TableRow
                              key={doc.id}
                              className={doc.hasEmbeddings ? 'bg-green-50 dark:bg-green-950/20' : ''}
                            >
                              <TableCell className="py-2">
                                {isAnalyzableFile(doc) ? (
                                  <Checkbox
                                    checked={selectedDocuments.includes(doc.id)}
                                    onCheckedChange={() => toggleDocumentSelection(doc.id)}
                                  />
                                ) : (
                                  <Checkbox
                                    disabled
                                    className="opacity-30"
                                    title={t('documentManager.status.csvCannotBeAnalyzed')}
                                  />
                                )}
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="max-w-[250px]">
                                  <p className="font-medium truncate">{doc.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {doc.content.slice(0, 60)}...
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="py-2">
                                <Badge variant="outline">
                                  {doc.metadata?.source || 'Manual'}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex items-center gap-1">
                                  <Hash className="h-3 w-3" />
                                  <span className="text-sm">
                                    {doc.metadata?.chunks || 0}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2">
                                {doc.hasEmbeddings ? (
                                  <div className="flex items-center gap-1 text-green-600">
                                    <CheckCircle className="h-4 w-4" />
                                    <span className="text-sm">{t('documentManager.status.hasEmbedding')}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-orange-600">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-sm">{t('documentManager.status.noEmbedding')}</span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="py-2">
                                {(() => {
                                  const status = getAnalyzeStatus(doc);
                                  const template = getAnalyzeTemplate(doc);

                                  return (
                                    <div className="flex flex-col gap-1">
                                      <Badge variant={
                                        status === 'analyzed' ? 'default' :
                                          status === 'transformed' ? 'success' : 'secondary'
                                      }>
                                        {status === 'waiting' ? t('documentManager.status.waiting') :
                                          status === 'analyzed' ? t('documentManager.status.analyzed') : t('documentManager.status.transformed')}
                                      </Badge>
                                      {template && (
                                        <span className="text-xs text-muted-foreground">
                                          {template}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span className="text-sm">
                                    {new Date(doc.created_at).toLocaleDateString('tr-TR')}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right py-2">
                                <div className="flex justify-end gap-1">
                                  {!doc.hasEmbeddings && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={async () => {
                                        try {
                                          const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || '';
                                          const response = await fetch(`${baseUrl}/api/v2/documents/${doc.id}/embeddings`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' }
                                          });
                                          if (response.ok) {
                                            setSuccess(t('documentManager.messages.embeddingCreated'));
                                            await fetchDocuments();
                                          }
                                        } catch (error) {
                                          setError(t('documentManager.messages.embeddingCreateFailed'));
                                        }
                                      }}
                                    >
                                      <Brain className="h-4 w-4 text-blue-600" />
                                    </Button>
                                  )}
                                  {doc.hasEmbeddings && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDeleteEmbeddings(doc.id)}
                                    >
                                      <Database className="h-4 w-4 text-red-600" />
                                    </Button>
                                  )}
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setSelectedDocument(doc)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
                                      <DialogHeader>
                                        <DialogTitle>{doc.title}</DialogTitle>
                                        <DialogDescription>
                                          {t('documentManager.dialogs.documentDetails.description')}
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <div>
                                          <h4 className="font-medium mb-2">{t('documentManager.dialogs.documentDetails.metadata')}</h4>
                                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm space-y-1">
                                            {Object.entries(doc.metadata || {}).map(([key, value]) => (
                                              <div key={key} className="flex justify-between">
                                                <span className="text-muted-foreground">{key}:</span>
                                                <span>{String(value)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <h4 className="font-medium mb-2">{t('documentManager.dialogs.documentDetails.content')}</h4>
                                          <ScrollArea className="h-[400px] rounded-md border p-4">
                                            <p className="whitespace-pre-wrap">{doc.content}</p>
                                          </ScrollArea>
                                        </div>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingDocument(doc)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteDocument(doc.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Add Document */}
        <TabsContent value="add" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('documentManager.tabs.add')}</CardTitle>
              <CardDescription>
                {t('documentManager.form.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddDocument} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{t('documentManager.form.title')}</label>
                  <Input
                    placeholder={t('documentManager.form.titlePlaceholder')}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('documentManager.form.content')}</label>
                  <Textarea
                    placeholder={t('documentManager.form.contentPlaceholder')}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="min-h-[300px]"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('documentManager.form.fileUpload')}</label>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept=".txt,.md,.json,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setNewFile(file);
                          handleFileUpload(file);
                        }
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('documentManager.form.supportedFormats')}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={uploading}>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {t('documentManager.form.addAndProcess')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNewTitle('');
                      setNewContent('');
                      setNewFile(null);
                    }}
                  >
                    {t('documentManager.form.clear')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import from URL */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>URL\'den İçe Aktar</CardTitle>
              <CardDescription>
                Web sayfasından içerik çekip doküman olarak ekleyin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={t('documentManager.urlImport.urlPlaceholder')}
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    type="url"
                    className="flex-1"
                  />
                  <Button
                    onClick={async () => {
                      if (!newUrl) return;
                      setUploading(true);
                      try {
                        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || ''}/api/v2/scraper`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: newUrl })
                        });

                        if (response.ok) {
                          const data = await response.json();
                          setNewTitle(data.title || t('documentManager.urlImport.fetched'));
                          setNewContent(data.content || '');
                          setSuccess(t('documentManager.urlImport.fetched'));
                        }
                      } catch (err) {
                        setError(t('documentManager.urlImport.fetchFailed'));
                      } finally {
                        setUploading(false);
                      }
                    }}
                    disabled={uploading || !newUrl}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {newTitle && newContent && (
                  <Card className="bg-gray-50 dark:bg-gray-800">
                    <CardHeader>
                      <CardTitle className="text-lg">{newTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px] rounded-md border p-3 bg-white dark:bg-gray-900">
                        <p className="text-sm whitespace-pre-wrap">
                          {newContent.slice(0, 500)}...
                        </p>
                      </ScrollArea>
                      <div className="mt-4 flex gap-2">
                        <Button onClick={handleAddDocument}>
                          <Save className="h-4 w-4 mr-2" />
                          {t('documentManager.urlImport.saveAsDocument')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNewTitle('');
                            setNewContent('');
                            setNewUrl('');
                          }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {editingDocument && (
        <Dialog open={!!editingDocument} onOpenChange={() => setEditingDocument(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{t('documentManager.dialogs.editDocument.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={editingDocument.title}
                onChange={(e) => setEditingDocument({
                  ...editingDocument,
                  title: e.target.value
                })}
                placeholder={t('documentManager.dialogs.editDocument.placeholder')}
              />
              <Textarea
                value={editingDocument.content}
                onChange={(e) => setEditingDocument({
                  ...editingDocument,
                  content: e.target.value
                })}
                className="min-h-[300px]"
                placeholder={t('documentManager.dialogs.editDocument.contentPlaceholder')}
              />
              <div className="flex justify-end gap-2">
                <Button onClick={handleUpdateDocument}>
                  <Save className="h-4 w-4 mr-2" />
                  {t('documentManager.dialogs.editDocument.save')}
                </Button>
                <Button variant="outline" onClick={() => setEditingDocument(null)}>
                  {t('documentManager.dialogs.editDocument.cancel')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Template Manager Modal */}
      <TemplateManager
        open={templateManagerOpen}
        onClose={() => setTemplateManagerOpen(false)}
      />
    </div>
  );
}