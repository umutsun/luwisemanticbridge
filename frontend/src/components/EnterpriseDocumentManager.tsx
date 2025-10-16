'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl, buildApiUrl } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import {
  Upload,
  FileText,
  Trash2,
  Eye,
  Loader2,
  Search,
  Brain,
  BarChart3,
  Shield,
  Clock,
  TrendingUp,
  Hash,
  Lock,
  Users,
  Activity,
  Zap,
  Target,
  File,
  Download,
  Share2,
  Filter,
  Grid,
  List,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Tag,
  Globe,
  Database,
  Cpu,
  HardDrive
} from 'lucide-react';

interface Document {
  id: string;
  filename: string;
  title?: string;
  mimetype: string;
  size: number;
  uploaded_at: string;
  processed: boolean;
  metadata: any;
  classification?: {
    category: string;
    confidence: number;
    tags: string[];
    language: string;
    sensitivityLevel: string;
  };
  analytics?: {
    views: number;
    downloads: number;
    shares: number;
    lastViewed: string;
  };
  similarity?: Array<{
    documentId: string;
    similarityScore: number;
    document: {
      filename: string;
      title?: string;
    };
  }>;
}

interface Analytics {
  overview: {
    totalDocuments: number;
    totalSize: number;
    avgSize: number;
    totalViews: number;
    totalDownloads: number;
    totalShares: number;
  };
  trends: Array<{
    date: string;
    uploads: number;
    views: number;
    downloads: number;
  }>;
  categories: Array<{
    name: string;
    count: number;
    size: number;
  }>;
  languages: Array<{
    code: string;
    name: string;
    count: number;
  }>;
  sensitivity: Array<{
    level: string;
    count: number;
    color: string;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export function EnterpriseDocumentManager() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSensitivity, setSelectedSensitivity] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dragActive, setDragActive] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load documents and analytics
  useEffect(() => {
    loadDocuments();
    loadAnalytics();
  }, []);

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/v2/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/v2/documents/analytics');
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      // Add enterprise metadata
      formData.append('metadata', JSON.stringify({
        source: 'enterprise-upload',
        batch: true,
        timestamp: new Date().toISOString()
      }));

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          toast({
            title: "Success",
            description: `Successfully uploaded ${files.length} document(s)`,
          });
          await loadDocuments();
          await loadAnalytics();
        } else {
          throw new Error('Upload failed');
        }
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.addEventListener('error', () => {
        toast({
          title: "Error",
          description: "Failed to upload documents",
          variant: "destructive",
        });
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.open('POST', '/api/v2/documents/upload');
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Filter and sort documents
  const filteredDocuments = documents
    .filter(doc => {
      const matchesSearch = searchQuery === '' ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.classification?.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = selectedCategory === 'all' ||
        doc.classification?.category === selectedCategory;

      const matchesSensitivity = selectedSensitivity === 'all' ||
        doc.classification?.sensitivityLevel === selectedSensitivity;

      return matchesSearch && matchesCategory && matchesSensitivity;
    })
    .sort((a, b) => {
      let aValue = a[sortBy as keyof Document];
      let bValue = b[sortBy as keyof Document];

      if (sortBy === 'size') {
        aValue = Number(aValue);
        bValue = Number(bValue);
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getSensitivityBadge = (level: string) => {
    const badges = {
      public: { variant: 'default' as const, color: 'bg-green-100 text-green-800' },
      internal: { variant: 'secondary' as const, color: 'bg-blue-100 text-blue-800' },
      confidential: { variant: 'outline' as const, color: 'bg-yellow-100 text-yellow-800' },
      secret: { variant: 'destructive' as const, color: 'bg-red-100 text-red-800' }
    };
    return badges[level as keyof typeof badges] || badges.public;
  };

  const handleDocumentAction = async (action: string, documentId: string) => {
    try {
      const response = await fetch(`/api/v2/documents/${documentId}/${action}`, {
        method: 'POST'
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Document ${action} completed`,
        });
        await loadDocuments();
        await loadAnalytics();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} document`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Analytics Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enterprise Documents</h1>
          <p className="text-muted-foreground">
            Manage your documents with AI-powered intelligence and enterprise security
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAnalytics(!showAnalytics)}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {showAnalytics ? 'Hide' : 'Show'} Analytics
          </Button>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Documents
          </Button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      {showAnalytics && analytics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Document Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                <TabsTrigger value="categories">Categories</TabsTrigger>
                <TabsTrigger value="sensitivity">Security</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Documents</p>
                          <p className="text-2xl font-bold">{analytics.overview.totalDocuments}</p>
                        </div>
                        <FileText className="w-8 h-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Storage</p>
                          <p className="text-2xl font-bold">{formatFileSize(analytics.overview.totalSize)}</p>
                        </div>
                        <HardDrive className="w-8 h-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Views</p>
                          <p className="text-2xl font-bold">{analytics.overview.totalViews}</p>
                        </div>
                        <Eye className="w-8 h-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="trends">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.trends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="uploads" stackId="1" stroke="#8884d8" fill="#8884d8" />
                      <Area type="monotone" dataKey="views" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                      <Area type="monotone" dataKey="downloads" stackId="1" stroke="#ffc658" fill="#ffc658" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="categories">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.categories}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {analytics.categories.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.categories}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="size" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sensitivity">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.sensitivity}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ level, percent }) => `${level} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {analytics.sensitivity.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-4">
                    {analytics.sensitivity.map((item) => (
                      <div key={item.level} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Shield className="w-5 h-5" style={{ color: item.color }} />
                          <span className="font-medium capitalize">{item.level}</span>
                        </div>
                        <Badge variant="outline">{item.count} documents</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary bg-primary/10'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <p className="text-lg font-medium">Uploading documents...</p>
                <Progress value={uploadProgress} className="w-full max-w-xs mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {Math.round(uploadProgress)}% complete
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">
                    Drag and drop your documents here
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports PDF, Word, Excel, PowerPoint, Text, and Markdown files
                  </p>
                </div>
                <Button variant="outline">
                  Browse Files
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="contract">Contracts</SelectItem>
                <SelectItem value="report">Reports</SelectItem>
                <SelectItem value="presentation">Presentations</SelectItem>
                <SelectItem value="manual">Manuals</SelectItem>
                <SelectItem value="invoice">Invoices</SelectItem>
                <SelectItem value="email">Emails</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedSensitivity} onValueChange={setSelectedSensitivity}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
                <SelectItem value="secret">Secret</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
              const [sort, order] = value.split('-');
              setSortBy(sort);
              setSortOrder(order as 'asc' | 'desc');
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uploaded_at-desc">Newest First</SelectItem>
                <SelectItem value="uploaded_at-asc">Oldest First</SelectItem>
                <SelectItem value="filename-asc">Name (A-Z)</SelectItem>
                <SelectItem value="filename-desc">Name (Z-A)</SelectItem>
                <SelectItem value="size-desc">Size (Large to Small)</SelectItem>
                <SelectItem value="size-asc">Size (Small to Large)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Grid/List */}
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-8 h-8 text-blue-500" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium truncate">
                        {doc.title || doc.filename}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(doc.size)}
                      </p>
                    </div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedDocument(doc)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          {selectedDocument?.title || selectedDocument?.filename}
                        </DialogTitle>
                        <DialogDescription>
                          Document details and intelligence insights
                        </DialogDescription>
                      </DialogHeader>
                      {selectedDocument && (
                        <ScrollArea className="max-h-[600px]">
                          <div className="space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">File Name</p>
                                <p>{selectedDocument.filename}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Size</p>
                                <p>{formatFileSize(selectedDocument.size)}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Type</p>
                                <p>{selectedDocument.mimetype}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Uploaded</p>
                                <p>{new Date(selectedDocument.uploaded_at).toLocaleDateString()}</p>
                              </div>
                            </div>

                            {/* AI Classification */}
                            {selectedDocument.classification && (
                              <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                  <Brain className="w-4 h-4" />
                                  AI Classification
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Category</p>
                                    <Badge>{selectedDocument.classification.category}</Badge>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Confidence</p>
                                    <Badge variant="outline">
                                      {Math.round(selectedDocument.classification.confidence * 100)}%
                                    </Badge>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Language</p>
                                    <p>{selectedDocument.classification.language.toUpperCase()}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Sensitivity</p>
                                    <Badge className={getSensitivityBadge(selectedDocument.classification.sensitivityLevel).color}>
                                      {selectedDocument.classification.sensitivityLevel.toUpperCase()}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <p className="text-sm font-medium text-muted-foreground mb-2">Tags</p>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedDocument.classification.tags.map((tag) => (
                                      <Badge key={tag} variant="secondary" className="text-xs">
                                        <Tag className="w-3 h-3 mr-1" />
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Similar Documents */}
                            {selectedDocument.similarity && selectedDocument.similarity.length > 0 && (
                              <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                  <Target className="w-4 h-4" />
                                  Similar Documents
                                </h4>
                                <div className="space-y-2">
                                  {selectedDocument.similarity.map((sim) => (
                                    <div key={sim.documentId} className="flex items-center justify-between p-2 border rounded">
                                      <div>
                                        <p className="font-medium">{sim.document.title || sim.document.filename}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {Math.round(sim.similarityScore * 100)}% similar
                                        </p>
                                      </div>
                                      <Button variant="outline" size="sm">
                                        View
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Analytics */}
                            {selectedDocument.analytics && (
                              <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                  <BarChart3 className="w-4 h-4" />
                                  Analytics
                                </h4>
                                <div className="grid grid-cols-3 gap-4">
                                  <div className="text-center">
                                    <p className="text-2xl font-bold">{selectedDocument.analytics.views}</p>
                                    <p className="text-sm text-muted-foreground">Views</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-2xl font-bold">{selectedDocument.analytics.downloads}</p>
                                    <p className="text-sm text-muted-foreground">Downloads</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-2xl font-bold">{selectedDocument.analytics.shares}</p>
                                    <p className="text-sm text-muted-foreground">Shares</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-4 border-t">
                              <Button size="sm">
                                <Eye className="w-4 h-4 mr-2" />
                                Preview
                              </Button>
                              <Button size="sm" variant="outline">
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </Button>
                              <Button size="sm" variant="outline">
                                <Share2 className="w-4 h-4 mr-2" />
                                Share
                              </Button>
                              <Button size="sm" variant="outline">
                                <Brain className="w-4 h-4 mr-2" />
                                Analyze
                              </Button>
                            </div>
                          </div>
                        </ScrollArea>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Document Metadata */}
                <div className="space-y-2">
                  {doc.classification && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{doc.classification.category}</Badge>
                      <Badge className={getSensitivityBadge(doc.classification.sensitivityLevel).color}>
                        <Lock className="w-3 h-3 mr-1" />
                        {doc.classification.sensitivityLevel}
                      </Badge>
                      <Badge variant="secondary">
                        <Globe className="w-3 h-3 mr-1" />
                        {doc.classification.language.toUpperCase()}
                      </Badge>
                    </div>
                  )}

                  {doc.classification?.tags && doc.classification.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {doc.classification.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {doc.classification.tags.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{doc.classification.tags.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Document Actions */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {doc.analytics && (
                      <>
                        <Eye className="w-4 h-4" />
                        <span>{doc.analytics.views}</span>
                      </>
                    )}
                    {doc.similarity && doc.similarity.length > 0 && (
                      <>
                        <Target className="w-4 h-4 ml-2" />
                        <span>{doc.similarity.length} similar</span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDocumentAction('process', doc.id)}
                    >
                      <Brain className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDocumentAction('delete', doc.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredDocuments.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No documents found</h3>
            <p className="text-muted-foreground">
              {searchQuery || selectedCategory !== 'all' || selectedSensitivity !== 'all'
                ? 'Try adjusting your filters or search query'
                : 'Upload your first document to get started'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}