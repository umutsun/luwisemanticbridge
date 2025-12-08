/**
 * Document Transform Component
 * Handles CSV/JSON upload, preview, and transformation to source_db
 * Refactored to use graphql-request (project standard)
 */

import React, { useState, useEffect } from 'react';
import { executeQuery } from '@/lib/graphql/client';
import { GET_DOCUMENTS, type Document, type DocumentsResponse } from '@/lib/graphql/documents.queries';
import { useDocumentTransform, useDocumentPreview } from '@/hooks/useDocumentTransform';
import CSVModalViewer from './ui/csv-modal-viewer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Loader2, FileSpreadsheet, Database, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const DocumentTransform: React.FC = () => {
  const { toast } = useToast();
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [customTableName, setCustomTableName] = useState<string>('');
  const [csvModalOpen, setCsvModalOpen] = useState<boolean>(false);

  // Documents list state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);

  // Use custom hooks
  const { preview, fetchPreview } = useDocumentPreview();
  const { loading: transforming, progress, startTransform } = useDocumentTransform();

  // Fetch documents list
  const fetchDocuments = async () => {
    setDocumentsLoading(true);
    try {
      const response = await executeQuery<{ documents: DocumentsResponse }>(
        GET_DOCUMENTS,
        { limit: 50, offset: 0 }
      );
      setDocuments(response.documents.items);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch documents',
        variant: 'destructive',
      });
    } finally {
      setDocumentsLoading(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchDocuments();

    // Poll every 5 seconds
    const interval = setInterval(fetchDocuments, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectDocument = (docId: string) => {
    setSelectedDocuments((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handlePreview = async (docId: string) => {
    try {
      await fetchPreview(docId);
      setCsvModalOpen(true);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to load preview',
        variant: 'destructive',
      });
    }
  };

  const handleTransform = async () => {
    if (selectedDocuments.length === 0) {
      toast({
        title: 'No documents selected',
        description: 'Please select at least one document',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await startTransform({
        documentIds: selectedDocuments,
        sourceDbId: 'source_database',
        tableName: customTableName || undefined,
        batchSize: 100,
      });

      toast({
        title: 'Transform started',
        description: `Job ID: ${result.jobId}`,
      });
    } catch (err: any) {
      toast({
        title: 'Transform failed',
        description: err.message || 'Failed to start transformation',
        variant: 'destructive',
      });
    }
  };

  // Convert parsed data to CSV format for CSVModalViewer
  const convertToCSV = (headers: string[], rows: any[]): string => {
    if (!headers || !rows || rows.length === 0) return '';

    const csvRows = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const value = String(row[h] || '');
          return value.includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Document Transform</h1>
        </div>
        <p className="text-muted-foreground">Upload CSV/JSON files and transform them into PostgreSQL tables</p>
      </div>

      {/* Documents List Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Documents ({documents.length})
            </span>
            <Badge variant="outline">{selectedDocuments.length} selected</Badge>
          </CardTitle>
          <CardDescription>
            Select documents to transform into database tables
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading documents...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No documents found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-28 text-right">Rows</TableHead>
                  <TableHead className="w-24 text-right">Quality</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-32">Progress</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDocuments.includes(doc.id)}
                        onCheckedChange={() => handleSelectDocument(doc.id)}
                        disabled={doc.transformStatus === 'COMPLETED'}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{doc.filename}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {doc.fileType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {doc.rowCount?.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant="outline" className="text-xs">
                        {((doc.dataQualityScore || 0) * 100).toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          doc.transformStatus === 'COMPLETED' ? 'success' :
                          doc.transformStatus === 'FAILED' ? 'error' :
                          'secondary'
                        }
                        className="text-xs"
                      >
                        {doc.transformStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={doc.transformProgress} className="h-2" />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {doc.transformProgress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(doc.id)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Batch Actions */}
          {documents.length > 0 && (
            <div className="mt-6 flex flex-wrap items-end gap-4 pt-4 border-t">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="tableName" className="text-sm mb-2 block">
                  Custom Table Name (optional)
                </Label>
                <Input
                  id="tableName"
                  type="text"
                  placeholder="e.g., customer_data"
                  value={customTableName}
                  onChange={(e) => setCustomTableName(e.target.value)}
                />
              </div>

              <Button
                onClick={handleTransform}
                disabled={selectedDocuments.length === 0 || transforming}
                size="lg"
                className="min-w-[200px]"
              >
                {transforming ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Transforming...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    Transform {selectedDocuments.length} Document(s)
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSV Modal Viewer */}
      {preview && csvModalOpen && (
        <CSVModalViewer
          isOpen={csvModalOpen}
          onClose={() => {
            setCsvModalOpen(false);
          }}
          data={convertToCSV(preview.columnHeaders, preview.sampleRows)}
          title={`Preview: ${preview.filename}`}
          filename={preview.filename}
          metadata={{
            csvStats: {
              totalRows: preview.rowCount,
              totalColumns: preview.columnHeaders.length,
              columnTypes: preview.columnHeaders.map(col => ({
                name: col,
                type: 'text' as const,
                uniqueValues: 0,
                nullCount: 0
              }))
            }
          }}
        />
      )}

      {/* Transform Progress */}
      {progress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Transform Progress
            </CardTitle>
            <CardDescription>
              Real-time progress updates for document transformation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {progress.map((p) => (
              <Card key={p.documentId} className="border-2">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{p.filename}</p>
                        <Badge
                          variant={
                            p.status === 'COMPLETED' ? 'success' :
                            p.status === 'FAILED' ? 'error' :
                            'secondary'
                          }
                          className="mt-1"
                        >
                          {p.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Table Transform Progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Table Transform</span>
                        <span className="font-medium tabular-nums">
                          {p.rowsProcessed} / {p.totalRows} rows ({p.progress}%)
                        </span>
                      </div>
                      <Progress value={p.progress} className="h-2" />
                    </div>

                    {/* Errors */}
                    {p.error && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                        <p className="text-sm font-medium text-destructive mb-2">Error:</p>
                        <p className="text-sm text-destructive/80">{p.error}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DocumentTransform;
