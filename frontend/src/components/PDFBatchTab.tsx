/**
 * PDF Batch Transform - Simplified with DB Selection
 * One-click: OCR → Metadata → Transform to DB
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useConfig } from '@/contexts/ConfigContext';
import pdfProgressWSClient, { ProgressUpdate } from '@/services/pdf-progress-ws.client';
import {
  Database,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  RefreshCw
} from 'lucide-react';

interface PDFBatchTabProps {
  selectedDocuments: Set<string>;
  allDocuments: any[];
  onComplete: () => void;
}

type ProcessStage = 'idle' | 'analyzing' | 'ocr' | 'metadata' | 'transforming' | 'complete' | 'error';

export default function PDFBatchTab({ selectedDocuments, allDocuments, onComplete }: PDFBatchTabProps) {
  const { toast } = useToast();
  const { config } = useConfig();

  // Filter documents: PDF, MD, DOC, DOCX, TEXT (excluding CSV)
  // PDFs need completed OCR and analysis
  // Text-based files can be processed directly
  const selectedDocumentsForBatch = allDocuments.filter(doc => {
    const isSelected = selectedDocuments.has(doc.id);

    if (!isSelected) return false;

    // Exclude CSV files
    if (doc.file_type === 'text/csv' || doc.title?.toLowerCase().endsWith('.csv')) {
      return false;
    }

    // Include PDFs (only if OCR completed)
    if (doc.file_type === 'application/pdf' || doc.title?.toLowerCase().endsWith('.pdf')) {
      return doc.ocr_status === 'completed' && doc.analysis_status === 'completed';
    }

    // Include text-based files (MD, DOC, DOCX, TXT, etc.)
    const textBasedTypes = [
      'text/plain', 'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/rtf'
    ];

    const textExtensions = ['.md', '.txt', '.doc', '.docx', '.rtf'];

    const hasTextType = textBasedTypes.includes(doc.file_type);
    const hasTextExtension = textExtensions.some(ext =>
      doc.title?.toLowerCase().endsWith(ext)
    );

    return hasTextType || hasTextExtension;
  });

  const [stage, setStage] = useState<ProcessStage>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [currentOperation, setCurrentOperation] = useState('');

  // Database and table selection
  const [existingTables, setExistingTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableMode, setTableMode] = useState<'new' | 'existing'>('new');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [newTableName, setNewTableName] = useState('pdf_extracted_data');
  const [tableStructure, setTableStructure] = useState<'entity-based' | 'document-based'>('entity-based');

  // Field mappings for new table
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});

  // Document type template selection
  const [selectedTemplate, setSelectedTemplate] = useState<string>('general');
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);

  const [jobId, setJobId] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Source DB name from config
  const sourceDbName = config?.database?.name || 'Not configured';

  // Load existing tables and templates on mount
  useEffect(() => {
    if (sourceDbName !== 'Not configured') {
      loadExistingTables();
    }
    loadTemplates();
  }, [sourceDbName]);

  const loadTemplates = async () => {
    try {
      console.log('[PDFBatchTab] Loading templates...');
      const response = await fetch('/api/v2/pdf/analysis-templates');
      console.log('[PDFBatchTab] Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[PDFBatchTab] Templates loaded:', data.templates?.length || 0, data.templates);
        setAvailableTemplates(data.templates || []);
      } else {
        console.error('[PDFBatchTab] Failed to load templates, status:', response.status);
        loadFallbackTemplates();
      }
    } catch (error) {
      console.error('[PDFBatchTab] Failed to load templates:', error);
      loadFallbackTemplates();
    }
  };

  const loadFallbackTemplates = () => {
    console.log('[PDFBatchTab] Using fallback templates');
    const fallbackTemplates = [
      { id: 'general', name: 'General Document', category: 'General' },
      { id: 'legal', name: 'Legal Document (Kanun/Mevzuat)', category: 'Legal' },
      { id: 'novel', name: 'Novel/Fiction', category: 'Literature' },
      { id: 'research', name: 'Research Paper', category: 'Academic' },
      { id: 'invoice', name: 'Invoice', category: 'Financial' },
      { id: 'contract', name: 'Contract', category: 'Legal' },
      { id: 'financial_report', name: 'Financial Report', category: 'Financial' }
    ];
    setAvailableTemplates(fallbackTemplates);
  };

  const loadExistingTables = async () => {
    setLoadingTables(true);
    try {
      const response = await fetch('/api/v2/pdf/available-tables/' + sourceDbName);
      if (response.ok) {
        const data = await response.json();
        setExistingTables(data.tables || []);
      } else {
        // Fallback to source API if PDF API fails
        const sourceResponse = await fetch('/api/v2/source/tables');
        if (sourceResponse.ok) {
          const sourceData = await sourceResponse.json();
          setExistingTables(sourceData.tables?.map((t: any) => t.name) || []);
        }
      }
    } catch (error) {
      console.error('Failed to load tables:', error);
      // Try fallback
      try {
        const sourceResponse = await fetch('/api/v2/source/tables');
        if (sourceResponse.ok) {
          const sourceData = await sourceResponse.json();
          setExistingTables(sourceData.tables?.map((t: any) => t.name) || []);
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    } finally {
      setLoadingTables(false);
    }
  };

  // WebSocket progress updates
  useEffect(() => {
    if (!jobId || stage === 'complete' || stage === 'error') return;

    // Subscribe to WebSocket progress updates
    const handleProgressUpdate = (update: ProgressUpdate) => {
      console.log('[PDFBatchTab] Progress update:', update);

      setProgress(update.percentage || 0);
      setCurrentFile(update.currentFile || '');
      setCurrentOperation(update.message || '');

      if (update.current !== undefined && update.total !== undefined) {
        setProcessedCount(update.current);
        setTotalCount(update.total);
      }

      if (update.status === 'completed') {
        setStage('complete');
        toast({
          title: 'Batch Process Complete',
          description: `Successfully processed ${update.current || totalCount} documents`,
        });
        onComplete();
      } else if (update.status === 'error') {
        setStage('error');
        toast({
          title: 'Process Failed',
          description: update.message || 'An error occurred during processing',
          variant: 'destructive',
        });
      }
    };

    // Subscribe to WebSocket updates
    pdfProgressWSClient.subscribeToJob(jobId, handleProgressUpdate);

    // Cleanup on unmount
    return () => {
      pdfProgressWSClient.unsubscribeFromJob(jobId);
    };
  }, [jobId, stage, toast, onComplete, totalCount]);

  // Fallback polling for job progress (in case WebSocket is not available)
  useEffect(() => {
    if (!jobId || stage === 'complete' || stage === 'error') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v2/pdf/job-status/${jobId}`);
        const data = await response.json();

        if (data.success && data.progress) {
          const {
            status,
            percentage,
            current,
            total,
            currentFile,
            message,
            currentDocument
          } = data.progress;

          setProgress(percentage || 0);
          setProcessedCount(current || 0);
          setTotalCount(total || 0);

          // Set detailed operation text
          if (message) {
            setCurrentOperation(message);
          } else if (currentDocument) {
            // Determine operation based on status
            const operation = status === 'processing' && stage === 'analyzing' ? 'Analyzing' :
                           status === 'processing' && stage === 'ocr' ? 'OCR processing' :
                           status === 'processing' && stage === 'metadata' ? 'Extracting metadata' :
                           status === 'processing' && stage === 'transforming' ? 'Transforming to database' :
                           'Processing';

            setCurrentOperation(`${operation} ${currentDocument}...`);
          } else if (currentFile) {
            setCurrentFile(currentFile);
          }

          if (status === 'completed') {
            setStage('complete');
            clearInterval(interval);
            toast({
              title: "✓ Success!",
              description: `Processed ${total} PDFs and saved to database`,
            });
            setTimeout(() => onComplete(), 2000);
          } else if (status === 'error') {
            setStage('error');
            clearInterval(interval);
            toast({
              title: "Error",
              description: "Processing failed. Check console for details.",
              variant: "destructive"
            });
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, stage, toast, onComplete]);

  const handleProcess = async () => {
    if (selectedDocumentsForBatch.length === 0) {
      toast({
        title: "No documents selected",
        description: "Please select at least one document (PDF, MD, DOC, or TEXT)",
        variant: "destructive"
      });
      return;
    }

    // Validate table selection
    const finalTableName = tableMode === 'existing' ? selectedTable : newTableName;
    if (!finalTableName) {
      toast({
        title: "Table name required",
        description: "Please select an existing table or enter a new table name",
        variant: "destructive"
      });
      return;
    }

    if (sourceDbName === 'Not configured') {
      toast({
        title: "Source database not configured",
        description: "Please configure source database in settings",
        variant: "destructive"
      });
      return;
    }

    const documentIds = selectedDocumentsForBatch.map(doc => doc.id);
    setTotalCount(selectedDocumentsForBatch.length);
    setProcessedCount(0);
    setProgress(0);

    try {
      // Step 1: Analyze
      setStage('analyzing');
      setCurrentFile('Analyzing PDFs...');

      const analyzeResponse = await fetch('/api/v2/pdf/analyze-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds })
      });

      if (!analyzeResponse.ok) throw new Error('Analysis failed');
      const analysisData = await analyzeResponse.json();

      // Step 2: OCR (if needed)
      const scannedIds = analysisData.analysis?.scannedPDFs?.map((p: any) => p.documentId) || [];

      if (scannedIds.length > 0) {
        setStage('ocr');
        setCurrentFile(`Processing ${scannedIds.length} scanned PDFs...`);

        const ocrResponse = await fetch('/api/v2/pdf/batch-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentIds: scannedIds })
        });

        if (!ocrResponse.ok) throw new Error('OCR failed');
        const ocrData = await ocrResponse.json();

        // Poll OCR job
        setJobId(ocrData.jobId);
        await waitForJob(ocrData.jobId);
      }

      // Step 3: Metadata
      setStage('metadata');
      setCurrentFile('Extracting metadata...');
      setJobId(null);

      const metadataResponse = await fetch('/api/v2/pdf/batch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds,
          template: selectedTemplate // Pass selected document type template
        })
      });

      if (!metadataResponse.ok) throw new Error('Metadata extraction failed');
      const metadataData = await metadataResponse.json();

      // Poll metadata job
      setJobId(metadataData.jobId);
      await waitForJob(metadataData.jobId);

      // Step 4: Transform
      setStage('transforming');
      setCurrentFile('Saving to database...');
      setJobId(null);

      const transformResponse = await fetch('/api/v2/pdf/transform-to-sourcedb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds,
          sourceDbId: sourceDbName,
          tableName: finalTableName,
          tableStructure,
          createNewTable: tableMode === 'new'
        })
      });

      if (!transformResponse.ok) throw new Error('Transform failed');
      const transformData = await transformResponse.json();

      // Poll transform job
      setJobId(transformData.jobId);
      // Will be handled by useEffect polling

    } catch (error: any) {
      console.error('Process error:', error);
      setStage('error');
      toast({
        title: "Processing Error",
        description: error.message || 'Failed to process PDFs',
        variant: "destructive"
      });
    }
  };

  const waitForJob = (jobId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const response = await fetch(`/api/v2/pdf/job-status/${jobId}`);
          const data = await response.json();

          if (data.success && data.progress) {
            const { status, percentage, current, total, currentFile } = data.progress;

            setProgress(percentage || 0);
            setProcessedCount(current || 0);
            if (currentFile) setCurrentFile(currentFile);

            if (status === 'completed') {
              resolve();
            } else if (status === 'error') {
              reject(new Error('Job failed'));
            } else {
              setTimeout(checkStatus, 2000);
            }
          } else {
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          reject(error);
        }
      };
      checkStatus();
    });
  };

  const getStageText = () => {
    switch (stage) {
      case 'analyzing': return 'Analyzing PDFs...';
      case 'ocr': return 'Processing scanned PDFs (OCR)...';
      case 'metadata': return 'Extracting metadata...';
      case 'transforming': return 'Saving to database...';
      case 'complete': return 'Complete!';
      case 'error': return 'Error occurred';
      default: return 'Ready to process';
    }
  };

  const isProcessing = ['analyzing', 'ocr', 'metadata', 'transforming'].includes(stage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold text-lg">PDF Transform to Database</h3>
        </div>
        <Badge variant="outline">{sourceDbName}</Badge>
      </div>

      {/* PDF Filter Warning */}
      {selectedDocuments.size > selectedDocumentsForBatch.length && (
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800">Some files will be filtered out</p>
              <p className="text-yellow-600 text-xs mt-1">
                CSV files are excluded from batch processing
              </p>
              <p className="text-yellow-700">
                Selected: {selectedDocuments.size} files → {selectedDocumentsForBatch.length} processable
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Configuration */}
      {stage === 'idle' && (
        <div className="space-y-4">
          {/* Selected PDFs */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{selectedDocumentsForBatch.length} document{selectedDocumentsForBatch.length !== 1 ? 's' : ''} selected</span>
              </div>
            </div>
          </Card>

          {/* Document Type Template Selection */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-500" />
              <Label className="font-medium">Document Type Template</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Choose the document type to extract relevant fields and patterns
            </p>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select document type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Document</SelectItem>
                <SelectItem value="legal">Legal Document (Kanun/Mevzuat)</SelectItem>
                <SelectItem value="novel">Novel/Fiction</SelectItem>
                <SelectItem value="research">Research Paper</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="financial_report">Financial Report</SelectItem>
              </SelectContent>
            </Select>
            {/* Debug info */}
            {process.env.NODE_ENV === 'development' && (
              <div className="text-xs text-gray-500">
                Templates loaded: {availableTemplates.length}
              </div>
            )}

            {selectedTemplate === 'legal' && (
              <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded-md text-xs">
                <strong>Legal template will extract:</strong> Law number (kanunNo), Articles (maddeler),
                Law type (mevzuatTuru), Sanctions (yaptirimlar), Effective date, Authority
              </div>
            )}
          </Card>

          {/* Table Selection */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label>Target Table</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadExistingTables}
                disabled={loadingTables}
              >
                <RefreshCw className={`h-4 w-4 ${loadingTables ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <RadioGroup value={tableMode} onValueChange={(v: any) => setTableMode(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new-table" />
                <Label htmlFor="new-table" className="font-normal cursor-pointer flex-1">
                  Create new table
                </Label>
              </div>
              {tableMode === 'new' && (
                <Input
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="pdf_extracted_data"
                  className="w-full mt-1"
                />
              )}

              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing" id="existing-table" />
                <Label htmlFor="existing-table" className="font-normal cursor-pointer flex-1">
                  Use existing table
                </Label>
              </div>
              {tableMode === 'existing' && (
                <Select value={selectedTable} onValueChange={setSelectedTable}>
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Select table..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingTables.length === 0 ? (
                      <SelectItem value="none" disabled>No tables found</SelectItem>
                    ) : (
                      existingTables.map(table => (
                        <SelectItem key={table} value={table}>{table}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </RadioGroup>
          </Card>

          {/* Table Structure (only for new tables) */}
          {tableMode === 'new' && (
            <Card className="p-4 space-y-4">
              <Label>Table Structure</Label>
              <RadioGroup value={tableStructure} onValueChange={(v: any) => setTableStructure(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="entity-based" id="entity" />
                  <Label htmlFor="entity" className="font-normal cursor-pointer">
                    <div>
                      <div className="font-medium">Entity-based (Recommended)</div>
                      <div className="text-xs text-muted-foreground">1 row per entity (people, orgs, money, dates)</div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="document-based" id="document" />
                  <Label htmlFor="document" className="font-normal cursor-pointer">
                    <div>
                      <div className="font-medium">Document-based</div>
                      <div className="text-xs text-muted-foreground">1 row per PDF with all metadata</div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </Card>
          )}

          {/* Field Mapping Preview */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Field Mapping Preview</Label>
              <Badge variant="outline">
                {tableStructure === 'entity-based' ? 'Entity Mode' : 'Document Mode'}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
              {tableStructure === 'entity-based' ? (
                <div>
                  <p className="font-semibold mb-2">Entity-based will create:</p>
                  <ul className="space-y-1">
                    <li>• Separate rows for people, organizations, dates, money</li>
                    <li>• Columns: entity_type, entity_value, document_id, context</li>
                    <li>• Best for analysis and reporting</li>
                  </ul>
                </div>
              ) : (
                <div>
                  <p className="font-semibold mb-2">Document-based will create:</p>
                  <ul className="space-y-1">
                    <li>• One row per PDF document</li>
                    <li>• Columns: document_id, title, summary, keywords[], entities{}, stats{} </li>
                    <li>• Best for document cataloging</li>
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <div className="flex-1">
                <p className="font-medium">{getStageText()}</p>
                <p className="text-sm text-muted-foreground">
                  {currentOperation || currentFile || 'Processing...'}
                </p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>{processedCount} / {totalCount} processed</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </Card>
      )}

      {/* Complete */}
      {stage === 'complete' && (
        <Card className="p-6 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Processing Complete!</p>
              <p className="text-sm text-green-700">
                Successfully processed {totalCount} PDFs and saved to {tableMode === 'existing' ? selectedTable : newTableName}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {stage === 'error' && (
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Processing Failed</p>
              <p className="text-sm text-red-700">
                Check console for error details
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Action Button */}
      <div className="flex gap-2">
        <Button
          onClick={handleProcess}
          disabled={isProcessing || selectedDocumentsForBatch.length === 0 || stage === 'complete'}
          className="flex-1"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Database className="mr-2 h-4 w-4" />
              Process & Save to Database
            </>
          )}
        </Button>
      </div>

      {/* Info */}
      {stage === 'idle' && (
        <Card className="p-4 bg-muted/50">
          <p className="text-xs text-muted-foreground">
            <strong>Auto-process:</strong> Detects scanned PDFs → Runs OCR if needed →
            Extracts metadata & entities → Saves to your database
          </p>
        </Card>
      )}
    </div>
  );
}
