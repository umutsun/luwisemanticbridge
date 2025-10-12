'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  FolderOpen,
  File,
  FileJson,
  FileCode,
  Search,
  Filter,
  RefreshCw,
  History,
  Calendar,
  Hash,
  Brain,
  Zap,
  X,
  Copy,
  ExternalLink,
  CheckSquare,
  Square
} from 'lucide-react';

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
  };
}

interface HistoryEntry {
  id: number;
  filename: string;
  file_size?: number;
  file_type?: string;
  content?: string;
  chunks_count: number;
  embeddings_created: boolean;
  success: boolean;
  error_message?: string;
  metadata?: any;
  created_at: string;
}

export default function DocumentManagerPage() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('documents');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<{[key: string]: boolean}>({});
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [bulkEmbedding, setBulkEmbedding] = useState(false);

  useEffect(() => {
    initHistoryTables();
    initDocumentsTable();
    fetchDocuments();
    fetchHistory();
  }, []);

  const initDocumentsTable = async () => {
    try {
      // Temporarily disabled due to backend issues
      // await fetch('http://localhost:8083/api/v2/documents/init', {
      //   method: 'POST'
      // });
      console.log('Documents table init skipped (backend down)');
    } catch (error) {
      console.error('Failed to init documents table:', error);
    }
  };

  const initHistoryTables = async () => {
    try {
      // Temporarily disabled due to backend issues
      // await fetch('http://localhost:8083/api/v2/history/init', {
      //   method: 'POST'
      // });
      console.log('History table init skipped (backend down)');
    } catch (error) {
      console.error('Failed to init history tables:', error);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/history/documents');
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveToHistory = async (filename: string, file_size: number, file_type: string, content: string, success: boolean, error_message?: string) => {
    try {
      await fetch('http://localhost:8083/api/v2/history/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          file_size,
          file_type,
          content: content?.substring(0, 5000),
          chunks_count: 0,
          embeddings_created: false,
          success,
          error_message
        })
      });
      fetchHistory();
    } catch (error) {
      console.error('Failed to save to history:', error);
    }
  };

  const deleteHistoryEntry = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/history/documents/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchHistory();
        toast.success('Geçmiş kaydı silindi');
      } else {
        toast.error('Geçmiş kaydı silinemedi');
      }
    } catch (error) {
      console.error('Failed to delete history entry:', error);
      toast.error('Geçmiş kaydı silinirken hata oluştu');
    }
  };

  const clearAllHistory = async () => {
    if (!confirm('Tüm geçmiş silinecek. Emin misiniz?')) return;
    
    try {
      const response = await fetch('http://localhost:8083/api/v2/history/documents', {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchHistory();
        toast.success('Tüm geçmiş temizlendi');
      } else {
        toast.error('Geçmiş temizlenemedi');
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast.error('Geçmiş temizlenirken hata oluştu');
    }
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/documents`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const data = await response.json();
        await fetchDocuments();
        
        // Save to history
        await saveToHistory(file.name, file.size, file.type || 'text', '', true);
        
        // Success toast
        toast.success(`${file.name} başarıyla yüklendi!`);
        
        // Reset progress after a delay
        setTimeout(() => {
          setUploadProgress(0);
          // Reset file input
          const fileInput = document.getElementById('file-upload') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        }, 1500);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        const errorMessage = errorData.error || 'Upload failed';
        
        // Check for specific database errors
        if (errorMessage.includes('column') && errorMessage.includes('does not exist')) {
          toast.error('Veritabanı tablosu eksik. Lütfen sayfayı yenileyin.');
          // Try to reinitialize table
          await initDocumentsTable();
        } else {
          toast.error(errorMessage);
        }
        
        // Save failed attempt to history
        await saveToHistory(file.name, file.size, file.type || 'text', '', false, errorMessage);
        setUploadProgress(0);
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      const errorMessage = error.message || 'Upload error';
      toast.error(`Yükleme hatası: ${errorMessage}`);
      await saveToHistory(file.name, file.size, file.type || 'text', '', false, errorMessage);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };


  const handleDeleteDocument = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/documents/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDocuments();
        toast.success('Döküman silindi');
      } else {
        toast.error('Döküman silinemedi');
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast.error('Döküman silinirken hata oluştu');
    }
  };

  const handleCreateEmbeddings = async (id: string, title: string) => {
    setEmbeddingProgress(prev => ({ ...prev, [id]: true }));
    
    try {
      const response = await fetch(`http://localhost:8083/api/v2/documents/${id}/embeddings`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchDocuments();
        toast.success(`${title} için embedding'ler oluşturuldu`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Embedding oluşturulamadı');
      }
    } catch (error) {
      console.error('Failed to create embeddings:', error);
      toast.error('Embedding oluşturulurken hata oluştu');
    } finally {
      setEmbeddingProgress(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDeleteEmbeddings = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/documents/${id}/embeddings`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDocuments();
        toast.success('Embedding\'ler silindi');
      } else {
        toast.error('Embedding silinemedi');
      }
    } catch (error) {
      console.error('Failed to delete embeddings:', error);
      toast.error('Embedding silinirken hata oluştu');
    }
  };

  const handleBulkEmbed = async () => {
    if (selectedDocuments.size === 0) {
      toast.error('Lütfen en az bir doküman seçin');
      return;
    }

    setBulkEmbedding(true);
    const docsToEmbed = Array.from(selectedDocuments);

    try {
      const response = await fetch(`http://localhost:8083/api/v2/documents/bulk-embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: docsToEmbed }),
      });

      if (response.ok) {
        const data = await response.json();
        await fetchDocuments();
        setSelectedDocuments(new Set());
        toast.success(`${data.embedded || docsToEmbed.length} doküman için embedding oluşturuldu`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Toplu embedding oluşturulamadı');
      }
    } catch (error) {
      console.error('Failed to create bulk embeddings:', error);
      toast.error('Toplu embedding oluşturulurken hata oluştu');
    } finally {
      setBulkEmbedding(false);
    }
  };

  const handleSelectDocument = (id: string, isEmbedded: boolean) => {
    if (isEmbedded) return; // Don't allow selection if already embedded

    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const nonEmbeddedDocs = allDocuments.filter(doc => !doc.metadata?.embeddings);
    if (selectedDocuments.size === nonEmbeddedDocs.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(nonEmbeddedDocs.map(doc => doc.id)));
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="h-4 w-4" />;
      case 'json': return <FileJson className="h-4 w-4" />;
      case 'code': return <FileCode className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Kopyalandı",
      description: "Metin panoya kopyalandı"
    });
  };

  // Combine current documents and history documents
  const allDocuments = React.useMemo(() => {
    // Convert history entries to document format
    const historyDocs: Document[] = history.map(entry => ({
      id: `history_${entry.id}`,
      title: entry.filename,
      content: entry.content || '',
      type: entry.file_type || 'text',
      size: entry.file_size || 0,
      metadata: {
        created_at: entry.created_at,
        updated_at: entry.created_at,
        chunks: entry.chunks_count,
        embeddings: entry.embeddings_created,
        source: 'history'
      }
    }));

    // Combine and remove duplicates (by title)
    const combined = [...documents, ...historyDocs];
    const unique = combined.reduce((acc, doc) => {
      const existing = acc.find(d => d.title === doc.title);
      if (!existing) {
        acc.push(doc);
      }
      return acc;
    }, [] as Document[]);

    return unique;
  }, [documents, history]);

  const filteredDocuments = allDocuments.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (doc.content && doc.content.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === 'all' || doc.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Döküman Yönetimi</h1>
          <p className="text-muted-foreground">Dökümanlarınızı yönetin ve organize edin</p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Left Column: Upload & Stats */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Döküman Yükle</CardTitle>
            <CardDescription className="text-sm">Döküman yükleyin ve istatistikleri görüntüleyin</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Upload Card */}
            <Card className={`border-dashed border-2 transition-all mb-4 ${uploading ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}>
              <CardContent className="p-0 relative">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                  accept=".txt,.pdf,.json,.md,.csv,.doc,.docx,.xls,.xlsx"
                  disabled={uploading}
                />
                <label
                  htmlFor="file-upload"
                  className={`cursor-pointer flex flex-col items-center justify-center h-full py-8 ${uploading ? 'pointer-events-none' : ''}`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-12 w-12 text-primary mb-3 animate-spin" />
                      <span className="text-base font-medium text-primary">Yükleniyor...</span>
                      <span className="text-sm text-muted-foreground mt-1">{uploadProgress}%</span>
                      <div className="w-full px-6 mt-4">
                        <Progress value={uploadProgress} className="w-full h-2" />
                      </div>
                    </>
                  ) : uploadProgress === 100 ? (
                    <>
                      <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
                      <span className="text-base font-medium text-green-500">Başarılı!</span>
                      <span className="text-sm text-muted-foreground mt-1">Dosya yüklendi</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-muted-foreground mb-3" />
                      <span className="text-base font-medium">Dosya Yükle</span>
                      <span className="text-sm text-muted-foreground mt-1">Max 10MB</span>
                      <span className="text-xs text-muted-foreground mt-2 text-center">txt, pdf, json, md, csv, doc, docx, xls, xlsx</span>
                    </>
                  )}
                </label>
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Toplam Döküman
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{allDocuments.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Toplam Boyut
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {formatFileSize(allDocuments.reduce((sum, doc) => sum + doc.size, 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Embedding'li
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {allDocuments.filter(d => d.metadata?.embeddings).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Chunk Sayısı
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {allDocuments.reduce((sum, doc) => sum + (doc.metadata?.chunks || 0), 0)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Documents Cards */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Dökümanlar</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-[150px] h-8"
                  />
                </div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-1 border rounded-md text-sm h-8"
                >
                  <option value="all">Tümü</option>
                  <option value="text">Text</option>
                  <option value="pdf">PDF</option>
                  <option value="json">JSON</option>
                  <option value="code">Code</option>
                </select>
                <Button onClick={fetchDocuments} variant="outline" size="icon" className="h-8 w-8">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Henüz döküman yok</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] text-center"></TableHead>
                      <TableHead>Doküman</TableHead>
                      <TableHead className="w-[100px] text-right">Boyut</TableHead>
                      <TableHead className="w-[50px] text-center"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => {
                      const isEmbedded = doc.metadata?.embeddings;
                      const isSelected = selectedDocuments.has(doc.id);
                      const canSelect = !isEmbedded;

                      return (
                        <TableRow key={doc.id} className={isEmbedded ? 'bg-muted/30' : ''}>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleSelectDocument(doc.id, isEmbedded)}
                              disabled={!canSelect}
                              className={isEmbedded ? 'opacity-50' : 'mx-auto'}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[400px]">
                              <p
                                className="font-medium truncate hover:text-primary cursor-pointer transition-colors mb-1"
                                title={doc.title}
                                onClick={() => setSelectedDoc(doc)}
                              >
                                {doc.title}
                              </p>
                              {doc.content && (
                                <p
                                  className="text-xs text-muted-foreground truncate hover:text-foreground transition-colors cursor-pointer"
                                  title="Click to preview"
                                  onClick={() => setSelectedDoc(doc)}
                                >
                                  {doc.content.substring(0, 100)}...
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm text-muted-foreground">
                              {formatFileSize(doc.size)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="h-8 w-8 p-0 mx-auto"
                              title="Sil"
                            >
                              <Trash2 className="h-4 w-4 text-red-500 hover:text-red-600 transition-colors" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            {/* Bottom Action Bar */}
            {selectedDocuments.size > 0 && (
              <div className="border-t p-4 bg-muted/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-bottom"
                      checked={selectedDocuments.size === allDocuments.filter(d => !d.metadata?.embeddings).length}
                      onCheckedChange={handleSelectAll}
                    />
                    <Label htmlFor="select-all-bottom" className="text-sm">
                      Tümünü Seç
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {selectedDocuments.size} doküman seçili
                    </span>
                  </div>
                  <Button
                    onClick={handleBulkEmbed}
                    disabled={bulkEmbedding}
                    className="h-9 px-6"
                  >
                    {bulkEmbedding ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Embed ({selectedDocuments.size})
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Document Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="max-w-5xl w-full h-[85vh] flex flex-col">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-background border-b flex-shrink-0">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-lg flex items-center gap-2">
                    {getFileIcon(selectedDoc.type)}
                    {selectedDoc.title}
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    {selectedDoc.type.toUpperCase()} • {formatFileSize(selectedDoc.size)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(selectedDoc.content)}
                    className="h-8"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Kopyala
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedDoc(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {/* Content Section */}
                <div className="flex-1 p-6 min-h-0">
                  <div className="h-full flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
                      <Label className="text-base font-semibold">Döküman İçeriği</Label>
                      <Badge variant="outline" className="text-xs">
                        {selectedDoc.content.length} karakter
                      </Badge>
                    </div>

                    {/* ScrollArea with fixed height */}
                    <div className="flex-1 min-h-0">
                      <ScrollArea className="h-full border rounded-lg bg-muted/30">
                        <div className="p-4">
                          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                            {selectedDoc.content}
                          </pre>
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </div>

                {/* Metadata Section */}
                <div className="border-t bg-muted/20 p-4 flex-shrink-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Boyut</span>
                      <p className="font-medium">{formatFileSize(selectedDoc.size)}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Chunks</span>
                      <p className="font-medium">{selectedDoc.metadata?.chunks || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Embedding</span>
                      <p className="font-medium">
                        {selectedDoc.metadata?.embeddings ? 'Var' : 'Yok'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs">Oluşturulma</span>
                      <p className="font-medium">{formatDate(selectedDoc.metadata.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}