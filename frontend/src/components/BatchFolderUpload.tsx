'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  FolderOpen,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Database,
  Search,
  Play,
  Pause,
  Hash,
  Folder,
  Eye
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { useRouter } from 'next/navigation';

interface BatchFile {
  path: string;
  category: string;
  subcategory: string;
  mevzuatNo?: string;
  filename: string;
  size: number;
  inDatabase?: boolean;
  documentId?: number;
  documentTitle?: string;
}

interface BatchJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  percentage: number;
  results: any[];
  errors: any[];
}

export default function BatchFolderUpload() {
  const router = useRouter();
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [groupedFiles, setGroupedFiles] = useState<Record<string, BatchFile[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [currentJob, setCurrentJob] = useState<BatchJob | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [processedDocuments, setProcessedDocuments] = useState<any[]>([]);
  const [scanStats, setScanStats] = useState({ totalFiles: 0, inDatabaseCount: 0, newFilesCount: 0 });

  // WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083', {
      auth: { token },
      transports: ['websocket']
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Subscribe to job progress
  useEffect(() => {
    if (!socket || !currentJob) return;

    console.log('[BatchUpload] Subscribing to progress for job:', currentJob.jobId);

    const progressHandler = (data: any) => {
      console.log('[BatchUpload] Progress update received:', data);

      setCurrentJob(prev => prev ? {
        ...prev,
        status: data.status,
        processedFiles: data.current - 1,
        currentFile: data.currentFile,
        percentage: data.percentage
      } : null);

      // Reload documents on every progress update to show real-time additions
      loadProcessedDocuments();

      if (data.status === 'completed') {
        toast({
          title: 'Batch Processing Complete',
          description: data.message
        });
      }
    };

    socket.on(`job-progress-${currentJob.jobId}`, progressHandler);
    console.log('[BatchUpload] Listener registered for:', `job-progress-${currentJob.jobId}`);

    return () => {
      socket.off(`job-progress-${currentJob.jobId}`, progressHandler);
    };
  }, [socket, currentJob]);

  // Scan Murgan folder
  const scanFolder = async () => {
    setIsScanning(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
      const response = await fetch(`${baseUrl}/api/v2/batch-folders/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ folderPath: process.env.NEXT_PUBLIC_MURGAN_FOLDER || 'docs/murgan' })
      });

      const data = await response.json();

      if (data.success) {
        setFiles(data.files);
        setGroupedFiles(data.groupedFiles);
        setScanStats({
          totalFiles: data.totalFiles,
          inDatabaseCount: data.inDatabaseCount || 0,
          newFilesCount: data.newFilesCount || data.totalFiles
        });
        // Only select files that are NOT in database
        const newFiles = data.files.filter((f: MurganFile) => !f.inDatabase);
        setSelectedFiles(new Set(newFiles.map((f: MurganFile) => f.path)));

        toast({
          title: 'Folder Scanned',
          description: `Found ${data.totalFiles} PDF files (${data.inDatabaseCount || 0} already in DB, ${data.newFilesCount || data.totalFiles} new)`
        });
      } else {
        toast({
          title: 'Scan Failed',
          description: data.error,
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to scan folder',
        variant: 'destructive'
      });
    }
    setIsScanning(false);
  };

  // Start batch processing
  const startProcessing = async () => {
    const selectedFilesList = files.filter(f => selectedFiles.has(f.path));

    if (selectedFilesList.length === 0) {
      toast({
        title: 'No Files Selected',
        description: 'Please select files to process',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
      const response = await fetch(`${baseUrl}/api/v2/batch-folders/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ files: selectedFilesList })
      });

      const data = await response.json();

      if (data.success) {
        setCurrentJob({
          jobId: data.jobId,
          status: 'processing',
          totalFiles: data.totalFiles,
          processedFiles: 0,
          percentage: 0,
          results: [],
          errors: []
        });

        toast({
          title: 'Processing Started',
          description: `Processing ${data.totalFiles} files...`
        });
      } else {
        toast({
          title: 'Failed to Start',
          description: data.error,
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start processing',
        variant: 'destructive'
      });
    }
    setIsProcessing(false);
  };

  // Load processed documents
  const loadProcessedDocuments = async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
      const response = await fetch(`${baseUrl}/api/v2/batch-folders/documents`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setProcessedDocuments(data.documents);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  // Toggle file selection
  const toggleFileSelection = (filePath: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    setSelectedFiles(newSelected);
  };

  // Toggle category selection
  const toggleCategorySelection = (category: string) => {
    const categoryFiles = groupedFiles[category] || [];
    const newSelected = new Set(selectedFiles);
    const allSelected = categoryFiles.every(f => newSelected.has(f.path));

    categoryFiles.forEach(f => {
      if (allSelected) {
        newSelected.delete(f.path);
      } else {
        newSelected.add(f.path);
      }
    });
    setSelectedFiles(newSelected);
  };

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  useEffect(() => {
    loadProcessedDocuments();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Murgan Batch Upload</CardTitle>
              <CardDescription>
                Process Turkish tax law documents from Murgan folder
                {scanStats.totalFiles > 0 && (
                  <div className="flex items-center gap-4 mt-2">
                    <Badge variant="outline">{scanStats.totalFiles} Total</Badge>
                    <Badge className="bg-green-600">{scanStats.inDatabaseCount} In DB</Badge>
                    <Badge variant="secondary">{scanStats.newFilesCount} New</Badge>
                  </div>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={scanFolder}
                disabled={isScanning || isProcessing}
                variant="outline"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Scan Folder
                  </>
                )}
              </Button>
              <Button
                onClick={startProcessing}
                disabled={!files.length || isProcessing || !!currentJob}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Processing
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress Bar */}
      {currentJob && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Processing: {currentJob.currentFile || 'Starting...'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currentJob.processedFiles + 1} of {currentJob.totalFiles} files
                  </p>
                </div>
                <Badge variant={
                  currentJob.status === 'completed' ? 'success' :
                  currentJob.status === 'error' ? 'destructive' :
                  'default'
                }>
                  {currentJob.status}
                </Badge>
              </div>
              <Progress value={currentJob.percentage} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs defaultValue="files" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="files">
            <FileText className="w-4 h-4 mr-2" />
            Files ({files.length})
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Folder className="w-4 h-4 mr-2" />
            Categories ({Object.keys(groupedFiles).length})
          </TabsTrigger>
          <TabsTrigger value="processed">
            <Database className="w-4 h-4 mr-2" />
            Processed ({processedDocuments.length})
          </TabsTrigger>
        </TabsList>

        {/* Files Tab */}
        <TabsContent value="files">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.path}
                      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                        file.inDatabase ? 'bg-green-50/50 dark:bg-green-950/20' : 'hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {!file.inDatabase && (
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.path)}
                            onChange={() => toggleFileSelection(file.path)}
                            className="rounded"
                          />
                        )}
                        <FileText className={`w-4 h-4 ${file.inDatabase ? 'text-green-600' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="text-sm font-medium">{file.filename}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {file.subcategory}
                            </Badge>
                            {file.mevzuatNo && (
                              <Badge variant="secondary" className="text-xs">
                                <Hash className="w-3 h-3 mr-1" />
                                {file.mevzuatNo}
                              </Badge>
                            )}
                            {file.inDatabase && (
                              <Badge className="text-xs bg-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                In Database
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatSize(file.size)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {file.inDatabase && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/dashboard/documents?highlight=${file.documentId}`)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  {selectedFiles.size} of {files.length} files selected
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFiles(new Set(files.map(f => f.path)))}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFiles(new Set())}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(groupedFiles).map(([category, categoryFiles]) => {
                  const allSelected = categoryFiles.every(f => selectedFiles.has(f.path));
                  const someSelected = categoryFiles.some(f => selectedFiles.has(f.path));

                  return (
                    <Card key={category} className="border">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              indeterminate={someSelected && !allSelected}
                              onChange={() => toggleCategorySelection(category)}
                              className="rounded"
                            />
                            <CardTitle className="text-sm">{category}</CardTitle>
                          </div>
                          <Badge>{categoryFiles.length} files</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[150px]">
                          <div className="space-y-1">
                            {categoryFiles.map(file => (
                              <div key={file.path} className="flex items-center gap-2">
                                <FileText className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs truncate">
                                  {file.filename}
                                </span>
                                {file.mevzuatNo && (
                                  <Badge variant="outline" className="text-xs h-5">
                                    {file.mevzuatNo}
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Processed Tab */}
        <TabsContent value="processed">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {/* Show loading skeleton if processing */}
                  {currentJob && currentJob.status === 'processing' && (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 animate-pulse">
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-muted rounded w-2/3" />
                            <div className="flex gap-2">
                              <div className="h-5 bg-muted rounded w-20" />
                              <div className="h-5 bg-muted rounded w-16" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Show documents */}
                  {processedDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{doc.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {doc.subcategory}
                          </Badge>
                          {doc.mevzuatNo && (
                            <Badge variant="secondary" className="text-xs">
                              <Hash className="w-3 h-3 mr-1" />
                              {doc.mevzuatNo}
                            </Badge>
                          )}
                          {doc.hasMetadata && (
                            <CheckCircle className="w-3 h-3 text-green-600" />
                          )}
                        </div>
                        {doc.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {doc.summary}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/documents?id=${doc.id}`)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}

                  {/* Show "No documents" only if not processing and empty */}
                  {!currentJob && processedDocuments.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Database className="w-12 h-12 mb-4 opacity-20" />
                      <p className="text-sm">No documents found</p>
                      <p className="text-xs mt-1">Process files to see them here</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
              {processedDocuments.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <Button
                    className="w-full"
                    onClick={() => router.push('/dashboard/documents')}
                  >
                    Go to Documents Dashboard
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}