/**
 * PDF Batch Transform - Enhanced with Field Mapping
 * OCR → Metadata → Field Mapping → Transform to DB
 */

'use client';

import debug from '@/lib/debug';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useConfig } from '@/contexts/ConfigContext';
import pdfProgressWSClient, { ProgressUpdate } from '@/services/pdf-progress-ws.client';
import JsonViewer from '@/components/ui/json-viewer';
import {
  Database,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  RefreshCw,
  Sparkles,
  X,
  Copy,
  ArrowRight,
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
  const [activeTab, setActiveTab] = useState('configure');

  // Database and table selection
  const [existingTables, setExistingTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableMode, setTableMode] = useState<'new' | 'existing'>('new');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [newTableName, setNewTableName] = useState('batch_analyzed_data');

  // Field mapping state
  const [analyzedDocuments, setAnalyzedDocuments] = useState<any[]>([]);
  const [currentDocument, setCurrentDocument] = useState<any>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({});
  const [fieldMappings, setFieldMappings] = useState<Record<string, Record<string, string>>>({});
  const [highlightedPath, setHighlightedPath] = useState<string>('');

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
      debug.log('[PDFBatchTab] Loading templates...');
      
      // Try multiple endpoints for templates
      let templates = [];
      
      // Try the main templates endpoint first
      try {
        const response = await fetch('/api/v2/pdf/analysis-templates');
        debug.log('[PDFBatchTab] Response status:', response.status);
        if (response.ok) {
          const data = await response.json();
          templates = data.templates || data || [];
          debug.log('[PDFBatchTab] Templates loaded from main endpoint:', templates.length, templates);
        }
      } catch (endpointError) {
        console.warn('[PDFBatchTab] Main endpoint failed:', endpointError);
      }
      
      // If main endpoint failed, try fallback endpoint
      if (templates.length === 0) {
        try {
          const fallbackResponse = await fetch('/api/v2/templates');
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            templates = fallbackData.templates || fallbackData || [];
            debug.log('[PDFBatchTab] Templates loaded from fallback endpoint:', templates.length, templates);
          }
        } catch (fallbackError) {
          console.warn('[PDFBatchTab] Fallback endpoint failed:', fallbackError);
        }
      }
      
      // If still no templates, use hardcoded fallback
      if (templates.length === 0) {
        debug.log('[PDFBatchTab] Using hardcoded fallback templates');
        templates = [
          { id: 'general', name: 'General Document', category: 'General' },
          { id: 'legal', name: 'Legal Document (Kanun/Mevzuat)', category: 'Legal' },
          { id: 'novel', name: 'Novel/Fiction', category: 'Literature' },
          { id: 'research', name: 'Research Paper', category: 'Academic' },
          { id: 'invoice', name: 'Invoice', category: 'Financial' },
          { id: 'contract', name: 'Contract', category: 'Legal' },
          { id: 'financial_report', name: 'Financial Report', category: 'Financial' }
        ];
      }
      
      setAvailableTemplates(templates);
      debug.log('[PDFBatchTab] Final templates set:', templates.length, templates);
      
    } catch (error) {
      console.error('[PDFBatchTab] Failed to load templates:', error);
      loadFallbackTemplates();
    }
  };

  const loadFallbackTemplates = () => {
    debug.log('[PDFBatchTab] Using fallback templates');
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

    debug.log('[PDFBatchTab] Setting up WebSocket for job:', jobId);

    // Subscribe to WebSocket progress updates
    const handleProgressUpdate = (update: ProgressUpdate) => {
      debug.log('[PDFBatchTab] WebSocket Progress update:', update);

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

    // Connect and subscribe to WebSocket updates
    try {
      pdfProgressWSClient.connect();
      pdfProgressWSClient.subscribeToJob(jobId, handleProgressUpdate);
      debug.log('[PDFBatchTab] Successfully subscribed to WebSocket updates for job:', jobId);
    } catch (error) {
      console.error('[PDFBatchTab] Failed to subscribe to WebSocket updates:', error);
      // Fallback to polling if WebSocket fails
      debug.log('[PDFBatchTab] Falling back to polling for progress updates');
    }

    // Cleanup on unmount
    return () => {
      try {
        pdfProgressWSClient.unsubscribeFromJob(jobId);
        debug.log('[PDFBatchTab] Unsubscribed from WebSocket updates for job:', jobId);
      } catch (error) {
        console.error('[PDFBatchTab] Failed to unsubscribe from WebSocket updates:', error);
      }
    };
  }, [jobId, stage, toast, onComplete, totalCount]);

  // Fallback polling for job progress (in case WebSocket is not available)
  useEffect(() => {
    if (!jobId || stage === 'complete' || stage === 'error') return;

    debug.log('[PDFBatchTab] Setting up polling for job:', jobId);

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v2/pdf/job-status/${jobId}`);
        const data = await response.json();

        debug.log('[PDFBatchTab] Polling response:', data);

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
        } else if (!data.success) {
          console.error('[PDFBatchTab] Job status check failed:', data);
        }
      } catch (error) {
        console.error('[PDFBatchTab] Error polling job status:', error);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      debug.log('[PDFBatchTab] Polling cleanup for job:', jobId);
    };
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
        try {
          await waitForJob(ocrData.jobId);
        } catch (error) {
          console.error('[PDFBatchTab] OCR job polling failed:', error);
          setStage('error');
          toast({
            title: "OCR Processing Failed",
            description: "Failed to process OCR. Please try again.",
            variant: "destructive"
          });
        }
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
      try {
        await waitForJob(metadataData.jobId);
        
        // After metadata extraction, set analyzed documents and switch to mapping tab
        const mockAnalyzedDocs = documentIds.map(id => ({
          id,
          title: `Document ${id}`,
          metadata: {
            analysis: {
              summary: 'Sample summary',
              category: 'Legal',
              language: 'Turkish',
              keywords: ['keyword1', 'keyword2'],
              topics: ['topic1', 'topic2']
            }
          }
        }));
        setAnalyzedDocuments(mockAnalyzedDocs);
        if (mockAnalyzedDocs.length > 0) {
          setCurrentDocument(mockAnalyzedDocs[0]);
        }
        setActiveTab('map');
        
      } catch (error) {
        console.error('[PDFBatchTab] Metadata job polling failed:', error);
        setStage('error');
        toast({
          title: "Metadata Extraction Failed",
          description: "Failed to extract metadata. Please try again.",
          variant: "destructive"
        });
      }

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

  // Helper functions for field mapping
  const toggleFieldSelection = (docId: string, fieldPath: string, checked: boolean) => {
    const newSelections = { ...selectedFields };
    if (!newSelections[docId]) {
      newSelections[docId] = new Set();
    }

    if (checked) {
      newSelections[docId].add(fieldPath);
    } else {
      newSelections[docId].delete(fieldPath);
    }

    setSelectedFields(newSelections);
  };

  const handleFieldMappingChange = (docId: string, fieldPath: string, columnName: string) => {
    const newMappings = { ...fieldMappings };
    if (!newMappings[docId]) {
      newMappings[docId] = {};
    }
    newMappings[docId][fieldPath] = columnName;
    setFieldMappings(newMappings);
  };

  const highlightField = (fieldPath: string) => {
    setHighlightedPath(fieldPath);
    setTimeout(() => setHighlightedPath(''), 3000);
  };

  const autoSelectCommonFields = () => {
    const commonFields = ['summary', 'category', 'language', 'keywords', 'topics'];
    const newSelections = { ...selectedFields };
    
    analyzedDocuments.forEach(doc => {
      if (!newSelections[doc.id]) {
        newSelections[doc.id] = new Set();
      }
      
      commonFields.forEach(field => {
        if (doc.metadata?.analysis?.[field] !== undefined) {
          newSelections[doc.id].add(field);
        }
      });
    });
    
    setSelectedFields(newSelections);
    toast({
      title: "Auto-Selected",
      description: "Common fields selected for all documents"
    });
  };

  const clearAllSelections = () => {
    const clearedSelections: Record<string, Set<string>> = {};
    analyzedDocuments.forEach(doc => {
      clearedSelections[doc.id] = new Set();
    });
    setSelectedFields(clearedSelections);
    toast({
      title: "Cleared",
      description: "All selections cleared"
    });
  };

  const generateSQLSchema = () => {
    if (!currentDocument || !selectedFields[currentDocument.id]) return '';

    const tableName = tableMode === 'new' ? newTableName : selectedTable;
    const selectedArray = Array.from(selectedFields[currentDocument.id]);
    
    const columns = selectedArray.map(field => {
      const columnName = fieldMappings[currentDocument.id]?.[field] || field.replace(/\./g, '_').toLowerCase();
      let sqlType = 'TEXT';
      if (field.includes('Count') || field.includes('wordCount') || field.includes('pageCount')) {
        sqlType = 'INTEGER';
      } else if (field.includes('Minutes') || field.includes('average')) {
        sqlType = 'NUMERIC';
      } else if (field.endsWith('[]') || field.includes('array') || field.match(/(keywords|topics|chapters|sections|headings|mainCharacters|people|organizations|locations|dates|money)/)) {
        sqlType = 'TEXT[]';
      } else if (field.includes('hasTableOfContents')) {
        sqlType = 'BOOLEAN';
      }
      return `  ${columnName} ${sqlType}`;
    }).join(',\n');

    return `CREATE TABLE IF NOT EXISTS ${tableName} (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id),
${columns},
  full_text TEXT,
  content_hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);`;
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

      {/* Main Content */}
      {stage === 'idle' ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="configure">Configure</TabsTrigger>
            <TabsTrigger value="map" disabled={analyzedDocuments.length === 0}>
              Map Fields
            </TabsTrigger>
            <TabsTrigger value="transform" disabled={analyzedDocuments.length === 0}>
              Create Table
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configure" className="space-y-4">
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
                Choose document type to extract relevant fields and patterns
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
                    placeholder="batch_analyzed_data"
                    className="w-full mt-1 px-3 py-2"
                    style={{
                      boxSizing: 'border-box',
                      maxWidth: '100%'
                    }}
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
                    <SelectTrigger className="w-full mt-1" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
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

            {/* Action Button */}
            <div className="flex gap-2">
              <Button
                onClick={handleProcess}
                disabled={isProcessing || selectedDocumentsForBatch.length === 0}
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
                    Analyze Documents
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="map" className="space-y-4">
            {analyzedDocuments.length > 0 ? (
              <div className="h-[400px] bg-muted/20 rounded-lg">
                <div className="h-full flex gap-4">
                  {/* Document Selector */}
                  <div className="w-48 flex-shrink-0 border-r pr-4">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                      Documents ({analyzedDocuments.length})
                    </Label>
                    <ScrollArea className="h-[350px] border rounded-md p-2">
                      {analyzedDocuments.map(doc => (
                        <div
                          key={doc.id}
                          onClick={() => setCurrentDocument(doc)}
                          className={`p-2 rounded cursor-pointer text-xs mb-1 ${
                            currentDocument?.id === doc.id 
                              ? 'bg-primary text-primary-foreground' 
                              : 'hover:bg-muted'
                          }`}
                        >
                          <div className="font-medium truncate">{doc.title}</div>
                          <div className="text-muted-foreground">
                            {selectedFields[doc.id]?.size || 0} fields selected
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>

                  {/* JSON Viewer */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Analyzed Data - Select Fields to Map
                      </Label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={autoSelectCommonFields}
                          className="h-6 text-xs px-2"
                          title="Auto-select common fields"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Auto-Select All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearAllSelections}
                          className="h-6 text-xs px-2"
                          title="Clear all selections"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear All
                        </Button>
                      </div>
                    </div>
                    {currentDocument && (
                      <JsonViewer
                        data={currentDocument.metadata?.analysis || {}}
                        selectedFields={selectedFields[currentDocument.id] || new Set()}
                        onFieldToggle={(path) => {
                          const isCurrentlySelected = selectedFields[currentDocument.id]?.has(path) || false;
                          toggleFieldSelection(currentDocument.id, path, !isCurrentlySelected);
                        }}
                        highlightPath={highlightedPath}
                        className="h-full"
                      />
                    )}
                  </div>

                  {/* Field Mapping */}
                  <div className="w-80 flex-shrink-0 flex flex-col border-l pl-4">
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Field Mapping ({selectedFields[currentDocument?.id || '']?.size || 0})
                      </Label>
                    </div>
                    
                    {/* Table Name */}
                    <div className="mb-3 space-y-2">
                      <Label className="text-xs font-medium text-foreground">
                        Target Table Name
                      </Label>
                      <Input
                        value={tableMode === 'new' ? newTableName : selectedTable}
                        disabled={tableMode === 'existing'}
                        onChange={(e) => {
                          if (tableMode === 'new') {
                            setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                          }
                        }}
                        placeholder="batch_analyzed_data"
                        className="text-sm font-mono h-8 px-3 py-1"
                        style={{
                          boxSizing: 'border-box',
                          maxWidth: '100%'
                        }}
                      />
                    </div>

                    {/* Mapped Fields */}
                    <ScrollArea className="flex-1 border rounded-md p-3 bg-muted/10">
                      {(!currentDocument || !selectedFields[currentDocument.id] || selectedFields[currentDocument.id].size === 0) ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Select fields from JSON to map them to table columns
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {Array.from(selectedFields[currentDocument.id])
                            .filter(f => !f.startsWith('_'))
                            .sort()
                            .map(field => {
                              const columnName = field.replace(/\./g, '_').toLowerCase();
                              return (
                                <div key={field} className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-mono text-muted-foreground truncate flex-1 mr-2">
                                      {field}
                                    </span>
                                    <span className="text-xs text-blue-600">→</span>
                                  </div>
                                  <Input
                                    value={fieldMappings[currentDocument.id]?.[field] || columnName}
                                    onChange={(e) => handleFieldMappingChange(currentDocument.id, field, e.target.value)}
                                    placeholder="column_name"
                                    className="text-xs font-mono h-6 px-2 py-1"
                                    style={{
                                      boxSizing: 'border-box',
                                      maxWidth: '100%'
                                    }}
                                  />
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </ScrollArea>

                    {/* Quick Actions */}
                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Tip:</span> Selected fields will become table columns. 
                        This mapping will be applied to all {analyzedDocuments.length} documents in the batch.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Card className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">No analyzed data available</p>
                <p className="text-xs text-muted-foreground mt-1">Go to Configure tab and analyze documents first</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="transform" className="space-y-4">
            {analyzedDocuments.length > 0 && currentDocument && selectedFields[currentDocument.id]?.size > 0 ? (
              <Card className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
                  {/* Progress */}
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-24 h-24 mx-auto rounded-full border-4 border-muted flex items-center justify-center mb-4">
                      <Database className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Ready to Create Table</p>
                    <p className="text-xs text-muted-foreground">
                      {analyzedDocuments.length} documents mapped
                    </p>
                  </div>

                  {/* SQL Schema Preview */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Table Schema Preview
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const sqlText = generateSQLSchema();
                          navigator.clipboard.writeText(sqlText);
                          toast({ title: 'Copied', description: 'SQL schema copied to clipboard' });
                        }}
                        className="h-6 px-2 gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span className="text-xs">Copy</span>
                      </Button>
                    </div>
                    <ScrollArea className="h-[200px] bg-muted/30 dark:bg-black/50 border border-border rounded p-3">
                      <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {generateSQLSchema()}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">No field mappings configured</p>
                <p className="text-xs text-muted-foreground mt-1">Go to Map Fields tab to configure field mappings</p>
              </Card>
            )}

            {/* Transform Button */}
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (!currentDocument || !selectedFields[currentDocument.id]?.size) {
                    toast({
                      title: "No Fields Mapped",
                      description: "Please map fields before creating table",
                      variant: "destructive"
                    });
                    return;
                  }

                  const finalTableName = tableMode === 'new' ? newTableName : selectedTable;
                  if (!finalTableName) {
                    toast({
                      title: "Table Name Required",
                      description: "Please specify a table name",
                      variant: "destructive"
                    });
                    return;
                  }

                  try {
                    setStage('transforming');
                    setCurrentOperation('Creating table and inserting data...');

                    // Start Python service for transform
                    const serviceResponse = await fetch('/api/services/pythonService/start', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' }
                    });

                    if (!serviceResponse.ok) {
                      throw new Error('Failed to start Python service');
                    }

                    // Prepare transform data
                    const transformData = {
                      documentIds: analyzedDocuments.map(doc => doc.id),
                      tableName: finalTableName,
                      fieldMappings: selectedFields,
                      sourceDbName: sourceDbName,
                      createNewTable: tableMode === 'new'
                    };

                    // Call transform endpoint
                    const transformResponse = await fetch('/api/v2/pdf/batch-transform', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(transformData)
                    });

                    if (!transformResponse.ok) {
                      throw new Error('Transform failed');
                    }

                    const transformResult = await transformResponse.json();
                    setJobId(transformResult.jobId);

                    // Poll for completion
                    await waitForJob(transformResult.jobId);

                    setStage('complete');
                    toast({
                      title: "Success!",
                      description: `Created table "${finalTableName}" and inserted ${analyzedDocuments.length} documents`
                    });

                    onComplete();
                  } catch (error: any) {
                    console.error('Transform error:', error);
                    setStage('error');
                    toast({
                      title: "Transform Failed",
                      description: error.message || 'Failed to create table and insert data',
                      variant: "destructive"
                    });
                  }
                }}
                disabled={analyzedDocuments.length === 0 || !currentDocument || !selectedFields[currentDocument.id]?.size || isProcessing}
                className="flex-1"
                size="lg"
              >
                {stage === 'transforming' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Table...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Create Table & Insert Data
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        /* Progress */
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
              <p className="font-medium text-green-800">Analysis Complete!</p>
              <p className="text-sm text-green-700">
                Successfully analyzed {totalCount} documents. Go to Map Fields tab to configure field mappings.
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
    </div>
  );
}
