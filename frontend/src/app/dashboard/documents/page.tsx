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
import { CSVViewer } from '@/components/ui/csv-viewer';
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
  const [csvData, setCsvData] = useState<{data: any[], columns: string[]} | null>(null);

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

  const parseCSVContent = (content: string): {data: any[], columns: string[]} => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return {data: [], columns: []};

    // Simple CSV parser
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }

      result.push(current);
      return result;
    };

    const columns = parseCSVLine(lines[0]);
    const data = lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const row: any = {};
      columns.forEach((col, index) => {
        row[col] = values[index] || '';
      });
      return row;
    });

    return {data, columns};
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

    let matchesType = true;
    switch (filterType) {
      case 'all':
        matchesType = true;
        break;
      case 'pdf':
        matchesType = doc.type === 'pdf';
        break;
      case 'text':
        matchesType = ['txt', 'md'].includes(doc.type);
        break;
      case 'embedded':
        matchesType = doc.metadata?.embeddings === true;
        break;
      case 'not-embedded':
        matchesType = doc.metadata?.embeddings !== true;
        break;
      case 'ocr':
        matchesType = doc.title.includes('[OCR]');
        break;
      default:
        matchesType = doc.type === filterType;
    }

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
              <Card className="group hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-white to-gray-50 border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="group-hover:scale-105 transition-transform duration-300">
                  <div className="text-2xl font-bold text-gray-800">{allDocuments.length}</div>
                  <div className="text-xs text-gray-400 mt-1">files</div>
                </CardContent>
              </Card>
              <Card className="group hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-white to-gray-50 border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Size
                  </CardTitle>
                </CardHeader>
                <CardContent className="group-hover:scale-105 transition-transform duration-300">
                  <div className="text-2xl font-bold text-gray-800">
                    {formatFileSize(allDocuments.reduce((sum, doc) => sum + doc.size, 0))}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">stored</div>
                </CardContent>
              </Card>
              <Card className="group hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-white to-gray-50 border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Embedded
                  </CardTitle>
                </CardHeader>
                <CardContent className="group-hover:scale-105 transition-transform duration-300">
                  <div className="text-2xl font-bold text-emerald-600">
                    {allDocuments.filter(d => d.metadata?.embeddings).length}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">processed</div>
                </CardContent>
              </Card>
              <Card className="group hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-white to-gray-50 border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Chunks
                  </CardTitle>
                </CardHeader>
                <CardContent className="group-hover:scale-105 transition-transform duration-300">
                  <div className="text-2xl font-bold text-blue-600">
                    {allDocuments.reduce((sum, doc) => sum + (doc.metadata?.chunks || 0), 0)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">segments</div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Documents Cards */}
        <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50/50">
          <CardHeader className="pb-4 bg-gradient-to-r from-transparent to-transparent border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-800">Documents</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-[180px] h-9 bg-white/80 backdrop-blur-sm border-gray-200 focus:border-emerald-500 focus:ring-emerald-200 transition-all duration-300"
                  />
                </div>
                <div className="flex gap-2 p-1.5 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl shadow-inner border border-gray-100/50">
                  <Button
                    variant={filterType === 'all' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterType('all')}
                    className={`h-8 px-4 text-xs font-medium transition-all duration-300 ${
                      filterType === 'all'
                        ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-200/50'
                        : 'hover:bg-white hover:shadow-md hover:text-gray-700 text-gray-500'
                    } rounded-lg`}
                  >
                    <Database className="w-3.5 h-3.5 mr-1.5" />
                    <span>Tümü</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      filterType === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {allDocuments.length}
                    </span>
                  </Button>
                  <Button
                    variant={filterType === 'pdf' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterType('pdf')}
                    className={`h-8 px-4 text-xs font-medium transition-all duration-300 ${
                      filterType === 'pdf'
                        ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-200/50'
                        : 'hover:bg-white hover:shadow-md hover:text-gray-700 text-gray-500'
                    } rounded-lg`}
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    <span>PDF</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      filterType === 'pdf'
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {allDocuments.filter(d => d.type === 'pdf').length}
                    </span>
                  </Button>
                  <Button
                    variant={filterType === 'text' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterType('text')}
                    className={`h-8 px-4 text-xs font-medium transition-all duration-300 ${
                      filterType === 'text'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-200/50'
                        : 'hover:bg-white hover:shadow-md hover:text-gray-700 text-gray-500'
                    } rounded-lg`}
                  >
                    <File className="w-3.5 h-3.5 mr-1.5" />
                    <span>Text</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      filterType === 'text'
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {allDocuments.filter(d => ['txt', 'md'].includes(d.type)).length}
                    </span>
                  </Button>
                  <Button
                    variant={filterType === 'embedded' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterType('embedded')}
                    className={`h-8 px-4 text-xs font-medium transition-all duration-300 ${
                      filterType === 'embedded'
                        ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-200/50'
                        : 'hover:bg-white hover:shadow-md hover:text-gray-700 text-gray-500'
                    } rounded-lg`}
                  >
                    <Brain className="w-3.5 h-3.5 mr-1.5" />
                    <span>Embedded</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      filterType === 'embedded'
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {allDocuments.filter(d => d.metadata?.embeddings).length}
                    </span>
                  </Button>
                  <Button
                    variant={filterType === 'not-embedded' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterType('not-embedded')}
                    className={`h-8 px-4 text-xs font-medium transition-all duration-300 ${
                      filterType === 'not-embedded'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-200/50'
                        : 'hover:bg-white hover:shadow-md hover:text-gray-700 text-gray-500'
                    } rounded-lg`}
                  >
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    <span>Ready</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      filterType === 'not-embedded'
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {allDocuments.filter(d => !d.metadata?.embeddings).length}
                    </span>
                  </Button>
                  <Button
                    variant={filterType === 'ocr' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterType('ocr')}
                    className={`h-8 px-4 text-xs font-medium transition-all duration-300 ${
                      filterType === 'ocr'
                        ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-200/50'
                        : 'hover:bg-white hover:shadow-md hover:text-gray-700 text-gray-500'
                    } rounded-lg`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    <span>OCR</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      filterType === 'ocr'
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {allDocuments.filter(d => d.title.includes('[OCR]')).length}
                    </span>
                  </Button>
                </div>
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
                  <TableHeader className="sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                    <TableRow className="border-b border-gray-100">
                      <TableHead className="w-[50px] text-center font-semibold text-gray-600 text-xs uppercase tracking-wider"></TableHead>
                      <TableHead className="font-semibold text-gray-600 text-xs uppercase tracking-wider">Document</TableHead>
                      <TableHead className="w-[100px] text-right font-semibold text-gray-600 text-xs uppercase tracking-wider">Size</TableHead>
                      <TableHead className="w-[50px] text-center font-semibold text-gray-600 text-xs uppercase tracking-wider"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => {
                      const isEmbedded = doc.metadata?.embeddings;
                      const isSelected = selectedDocuments.has(doc.id);
                      const canSelect = !isEmbedded;

                      return (
                        <TableRow
                          key={doc.id}
                          className={`border-b border-gray-50 hover:bg-gradient-to-r hover:from-gray-50/50 hover:to-transparent transition-all duration-200 ${
                            isEmbedded ? 'bg-gradient-to-r from-green-50/30 to-transparent' : ''
                          }`}
                        >
                          <TableCell className="text-center py-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleSelectDocument(doc.id, isEmbedded)}
                              disabled={!canSelect}
                              className={`${isEmbedded ? 'opacity-50' : 'mx-auto'} data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[400px]">
                              <div className="flex items-center gap-2 mb-1">
                                <p
                                  className="font-medium truncate hover:text-primary cursor-pointer transition-colors"
                                  title={doc.title}
                                  onClick={() => {
                              setSelectedDoc(doc);
                              // Parse CSV data if it's a CSV file
                              if (doc.type === 'csv' && doc.content) {
                                const parsed = parseCSVContent(doc.content);
                                setCsvData(parsed);
                              } else {
                                setCsvData(null);
                              }
                            }}
                                >
                                  {doc.title}
                                </p>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {doc.title.includes('[OCR]') && (
                                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-orange-300 text-orange-600">
                                      OCR
                                    </Badge>
                                  )}
                                  {isEmbedded && (
                                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-green-300 text-green-600">
                                      <Brain className="w-2.5 h-2.5 mr-0.5" />
                                      Embedded
                                    </Badge>
                                  )}
                                  {doc.type === 'csv' && (
                                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-blue-300 text-blue-600">
                                      <Database className="w-2.5 h-2.5 mr-0.5" />
                                      CSV
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {doc.content && (
                                <p
                                  className="text-xs text-muted-foreground truncate hover:text-foreground transition-colors cursor-pointer"
                                  title="Click to preview"
                                  onClick={() => {
                              setSelectedDoc(doc);
                              // Parse CSV data if it's a CSV file
                              if (doc.type === 'csv' && doc.content) {
                                const parsed = parseCSVContent(doc.content);
                                setCsvData(parsed);
                              } else {
                                setCsvData(null);
                              }
                            }}
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
                      {selectedDoc.type === 'csv' && csvData ? (
                        <CSVViewer
                          data={csvData.data}
                          columns={csvData.columns}
                          title={selectedDoc.title}
                          stats={selectedDoc.metadata?.csvStats}
                          columnTypes={selectedDoc.metadata?.columnTypes}
                        />
                      ) : (
                        <ScrollArea className="h-full border rounded-lg bg-muted/30">
                          <div className="p-4">
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                              {selectedDoc.content}
                            </pre>
                          </div>
                        </ScrollArea>
                      )}
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