/**
 * Document Preview Modal Component
 * Dynamic tabs based on file type:
 * - CSV: Table view (10 rows)
 * - JSON: Tree view (10 records, collapsable)
 * - Text/MD/DOC: Raw text
 * - PDF: OCR redirect + Transform with progress tracking
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Copy,
  FileText,
  Table as TableIcon,
  Code,
  ChevronRight,
  ChevronDown,
  Scan,
  Database,
  Download,
  Sparkles,
  Loader2,
  AlertCircle,
  Settings2,
  ArrowRight,
  Save,
  FolderOpen,
  Plus,
  Link,
  X,
  Edit3,
  Check,
} from 'lucide-react';
import { ProgressCircle } from '@/components/ui/progress-circle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { executeQuery, executeMutation } from '@/lib/graphql/client';
import { GET_DOCUMENT_PREVIEW, TRANSFORM_DOCUMENTS_TO_SOURCE_DB, type DocumentPreview as GraphQLDocumentPreview } from '@/lib/graphql/documents.queries';
import { GraphQLTransformTab } from './DocumentTransformModal';
import { useTransformProgressSubscription } from '@/hooks/useDocumentTransform';
import { useConfig } from '@/contexts/ConfigContext';
import JsonViewer from '@/components/ui/json-viewer';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    id: string;
    title: string;
    content: string;
    type: string;
    size: number;
    metadata?: any;
  } | null;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  document,
}: DocumentPreviewModalProps) {
  const { toast } = useToast();
  const { config } = useConfig();

  // Helper function to get auth headers
  const getAuthHeaders = (additionalHeaders?: Record<string, string>): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: Record<string, string> = { ...additionalHeaders };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const [parsedData, setParsedData] = useState<any>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [originalCsvHeaders, setOriginalCsvHeaders] = useState<string[]>([]); // Original keys for data access
  const [totalRowCount, setTotalRowCount] = useState<number>(0); // Total rows in CSV (for large files)
  const [csvVisibleRows, setCsvVisibleRows] = useState<number>(20); // Paging for CSV preview
  const [csvLoading, setCsvLoading] = useState<boolean>(false); // Loading state for CSV parsing
  const CSV_ROWS_PER_PAGE = 20; // Load 20 rows at a time
  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [editableHeaders, setEditableHeaders] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sqlPreview, setSqlPreview] = useState<string>('');
  const [graphqlData, setGraphqlData] = useState<GraphQLDocumentPreview | null>(null);
  const [showSQL, setShowSQL] = useState(false);
  const [batchSize, setBatchSize] = useState(50); // Batch size for insert operations
  const [tableName, setTableName] = useState<string>(''); // User-editable table name
  const [jobId, setJobId] = useState<string | null>(null); // Job ID for progress tracking

  // Subscribe to transform progress to detect completion
  const { progress: transformProgress } = useTransformProgressSubscription(jobId);

  // Reset isGenerating when transform completes or fails
  useEffect(() => {
    if (transformProgress.status === 'completed' || transformProgress.status === 'failed') {
      setIsGenerating(false);
    }
  }, [transformProgress.status]);

  // PDF-specific state
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStatus, setPdfStatus] = useState('');
  const [pdfMetadata, setPdfMetadata] = useState<any>(null);
  const [pdfExtractedText, setPdfExtractedText] = useState<string>('');
  const [pdfIsScanned, setPdfIsScanned] = useState<boolean | null>(null);
  const [pdfAnalyzing, setPdfAnalyzing] = useState(false);
  const [pdfActiveTab, setPdfActiveTab] = useState<string>('preview');

  // Analyze prompt state (inline input)
  const [analyzePrompt, setAnalyzePrompt] = useState('');

  // Analysis templates state
  const [analysisTemplates, setAnalysisTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('general');
  const [customKeywords, setCustomKeywords] = useState<string>('');
  const [templateDetecting, setTemplateDetecting] = useState(false);
  const [detectedTemplate, setDetectedTemplate] = useState<{id: string; confidence: number; reason: string} | null>(null);

  // Active LLM state
  const [activeLLM, setActiveLLM] = useState<{provider: string; model: string} | null>(null);

  // Custom field extraction state for Transform tab
  const [useCustomSchema, setUseCustomSchema] = useState(false);
  const [customTableSchema, setCustomTableSchema] = useState<{
    tableName: string;
    fields: Array<{
      id: string;
      name: string;
      type: string;
      description: string;
      extractionPath?: string;
      required: boolean;
      isPrimaryKey?: boolean;
      isForeignKey?: boolean;
      references?: { table: string; column: string };
    }>;
    relationships: Array<{
      id: string;
      fromField: string;
      toTable: string;
      toField: string;
      type: 'one-to-one' | 'one-to-many' | 'many-to-many';
    }>;
    indexes: Array<{
      name: string;
      fields: string[];
      unique: boolean;
    }>;
  }>({
    tableName: '',
    fields: [],
    relationships: [],
    indexes: []
  });

  // PDF Transform state
  const [pdfSelectedFields, setPdfSelectedFields] = useState<Set<string>>(new Set());
  const [pdfTableName, setPdfTableName] = useState('');
  const [pdfTransformPreview, setPdfTransformPreview] = useState('');
  const [pdfUseExistingTable, setPdfUseExistingTable] = useState(false);
  const [pdfExistingTableName, setPdfExistingTableName] = useState('');
  const [pdfAvailableTables, setPdfAvailableTables] = useState<string[]>([]);
  const [pdfTableColumns, setPdfTableColumns] = useState<Array<{ name: string; type: string }>>([]);
  const [pdfFieldMappings, setPdfFieldMappings] = useState<Record<string, string>>({});

  // PDF Schema Management state
  const [pdfSchemas, setPdfSchemas] = useState<any[]>([]);
  const [pdfSelectedSchema, setPdfSelectedSchema] = useState<string>('');
  const [pdfSchemaName, setPdfSchemaName] = useState('');
  const [pdfSchemaDescription, setPdfSchemaDescription] = useState('');
  const [pdfShowInlineSchemaSave, setPdfShowInlineSchemaSave] = useState(false);

  // PDF Transform Progress state
  const [pdfTransformProgress, setPdfTransformProgress] = useState<number>(0);
  const [pdfTransformStatus, setPdfTransformStatus] = useState<string>('');
  const [pdfTransformComplete, setPdfTransformComplete] = useState(false);
  const [pdfTransformJobId, setPdfTransformJobId] = useState<string | null>(null);

  // JSON viewer interactivity
  const [pdfHighlightedPath, setPdfHighlightedPath] = useState<string>('');
  const [pdfEditMode, setPdfEditMode] = useState(false);
  const [pdfEditedMetadata, setPdfEditedMetadata] = useState<any>(null);

  // Helper to highlight and scroll to field in JSON viewer
  const highlightField = (fieldPath: string) => {
    // Set highlighted path for JsonViewer
    setPdfHighlightedPath(fieldPath);

    // Expand all parent nodes and scroll to the field
    setTimeout(() => {
      // Get all parent paths
      const parts = fieldPath.split('.');
      const parentPaths: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        parentPaths.push(parts.slice(0, i + 1).join('.'));
      }

      // Click expand buttons for all parents (simulate expand)
      parentPaths.forEach(parentPath => {
        const nodeId = `json-node-${parentPath.replace(/\./g, '-')}`;
        const node = window.document.getElementById(nodeId);
        if (node) {
          // Find the expand button (ChevronRight/ChevronDown)
          const expandButton = node.querySelector('button');
          // Check if it's collapsed (has ChevronRight)
          const chevronRight = expandButton?.querySelector('svg');
          if (chevronRight && expandButton && !node.querySelector('.ml-6')) {
            // Node is collapsed, click to expand
            expandButton.click();
          }
        }
      });

      // Scroll to the target node after expansion
      setTimeout(() => {
        const targetId = `json-node-${fieldPath.replace(/\./g, '-')}`;
        const targetNode = window.document.getElementById(targetId);
        if (targetNode) {
          targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }, 50);

    // Clear highlight after 3 seconds
    setTimeout(() => {
      setPdfHighlightedPath('');
    }, 3000);
  };

  // Check if PDF is scanned or text-based
  const checkPDFType = async () => {
    if (!document) return;

    console.log('[PDF Init] checkPDFType started', {
      documentId: document.id,
      title: document.title,
      hasContent: !!document.content,
      contentLength: document.content?.length || 0,
      type: document.type
    });

    // If already have content, show it immediately
    if (document.content && document.content.trim().length > 0) {
      console.log('[PDF Init] Using cached content, length:', document.content.length);
      setPdfExtractedText(document.content);
      setPdfIsScanned(false);
      await detectTemplate(document.content);
      return;
    }

    // No content - need to check if scanned or text-based
    console.log('[PDF Init] No content, calling analyze-batch API...');
    setPdfAnalyzing(true);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(`/api/v2/pdf/analyze-batch`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ documentIds: [document.id] }),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);
      console.log('[PDF Init] API response:', { ok: response.ok, status: response.status });

      if (response.ok) {
        const data = await response.json();
        const isScanned = data.analysis?.scannedPDFs?.length > 0;
        console.log('[PDF Init] Analysis result:', { isScanned });
        setPdfIsScanned(isScanned);

        if (!isScanned) {
          // Text-based PDF - fetch content from document
          console.log('[PDF Init] Text-based PDF detected, fetching content...');
          try {
            const docResponse = await fetch(`/api/v2/documents/${document.id}`, {
              headers: getAuthHeaders()
            });
            if (docResponse.ok) {
              const docData = await docResponse.json();
              if (docData.content && docData.content.trim().length > 0) {
                setPdfExtractedText(docData.content);
                await detectTemplate(docData.content);
              } else {
                // No content - start text extraction (not OCR)
                console.log('[PDF Init] No content found, extracting text...');
                setPdfAnalyzing(false);
                setPdfIsScanned(false);
                setPdfProcessing(true);
                setPdfStatus('Extracting text from PDF...');
                setPdfProgress(0);

                // Call text extraction for text-based PDFs
                await handleExtractText();
              }
            }
          } catch (err) {
            console.error('[PDF Init] Failed to fetch document content:', err);
            setPdfExtractedText('Failed to load content');
          }
        } else {
          // Scanned PDF - start OCR automatically
          console.log('[PDF Init] Scanned PDF detected, starting OCR...');
          setPdfAnalyzing(false);
          await handleRunOCR();
        }
      } else {
        console.error('[PDF Init] API failed:', response.status);
        setPdfExtractedText('Failed to analyze document');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const err = error as Error;
      if (err.name === 'AbortError') {
        console.error('[PDF Init] API timeout after 15 seconds');
        setPdfExtractedText('Analysis timeout - please try again');
      } else {
        console.error('[PDF Init] API error:', error);
        setPdfExtractedText('Error analyzing document');
      }
    } finally {
      setPdfAnalyzing(false);
    }
  };

  useEffect(() => {
    if (document) {
      // Reset header editing states for new document
      setIsEditingHeaders(false);
      setEditableHeaders([]);
      setOriginalCsvHeaders([]);

      // ✅ UX: Only reset loading if data is already loaded
      const dataAlreadyLoaded = document.metadata?._loaded || !document.metadata?.source;
      if (dataAlreadyLoaded) {
        setCsvLoading(false);
      }

      // ⚡ PERFORMANCE: Defer heavy operations to next tick - modal opens instantly
      setTimeout(() => {
        // Parse content for CSV/JSON (only if data is loaded)
        if (document.content && dataAlreadyLoaded) {
          parseContent();
        }

        // Auto-fetch GraphQL data for CSV to get total row count
        if (document.type === 'csv' && document.id) {
          fetchGraphQLData();
        }

        // Auto-analyze PDF to check if scanned
        const isPDF = document.type === 'pdf' ||
                      document.file_type === 'application/pdf' ||
                      document.title?.toLowerCase().endsWith('.pdf');

        if (isPDF && document.id) {
          // Load saved metadata if available (avoid re-analyzing)
          if (document.metadata?.analysis) {
            console.log('[PDF Init] Loading saved metadata from document');
            setPdfMetadata(document.metadata.analysis);

            // Load previously selected fields if available, otherwise select all
            if (document.metadata?.selectedFields) {
              setPdfSelectedFields(new Set(document.metadata.selectedFields));
            } else {
              // Default: all fields selected
              autoSelectAllFields(document.metadata.analysis);
            }

            // Also load extracted text if available
            if (document.content && document.content.trim().length > 0) {
              setPdfExtractedText(document.content);
            }
          }

          // Check PDF type (will handle scanned vs text-based)
          checkPDFType();
        }
      }, 0); // Defer to next event loop tick
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);


  // Fetch PDF schemas on component mount (for PDF documents only)
  useEffect(() => {
    const isPDF = document?.type === 'pdf' ||
                  document?.file_type === 'application/pdf' ||
                  document?.title?.toLowerCase().endsWith('.pdf');

    if (isPDF && config?.database?.name) {
      fetchPDFSchemas();
      loadAvailableTables(); // Load available tables for Transform tab
    }
  }, [document?.id, config?.database?.name]);

  // Fetch analysis templates for PDF documents
  useEffect(() => {
    console.log('[DocumentPreviewModal] useEffect triggered - document:', document?.id, document?.title);
    const isPDF = document?.type === 'pdf' ||
                  document?.file_type === 'application/pdf' ||
                  document?.title?.toLowerCase().endsWith('.pdf');

    console.log('[DocumentPreviewModal] isPDF check:', isPDF, {
      type: document?.type,
      file_type: document?.file_type,
      title: document?.title
    });

    if (isPDF) {
      fetchAnalysisTemplates();
      fetchActiveLLM(); // Fetch active LLM for display
    } else {
      console.log('[DocumentPreviewModal] Not a PDF, skipping template fetch');
    }
  }, [document?.id]);

  const fetchAnalysisTemplates = async () => {
    try {
      console.log('[DocumentPreviewModal] Loading templates from database...');
      const response = await fetch(`${config?.backendUrl || 'http://localhost:8083'}/api/v2/templates?active=true`, {
        method: 'GET',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
      });

      console.log('[DocumentPreviewModal] Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[DocumentPreviewModal] Templates loaded from database:', data.templates?.length || 0, data.templates);
        // Map database templates to expected format
        const mappedTemplates = (data.templates || []).map((t: any) => ({
          id: t.template_id,
          name: t.name,
          category: t.category,
          focus_keywords: t.focus_keywords,
          subcategories: t.subcategories,
          target_fields: t.target_fields,
          extraction_prompt: t.extraction_prompt
        }));
        setAnalysisTemplates(mappedTemplates);
      } else {
        console.error('[DocumentPreviewModal] Failed to fetch analysis templates, status:', response.status);
        loadFallbackTemplates();
      }
    } catch (error) {
      console.error('[DocumentPreviewModal] Error fetching analysis templates:', error);
      loadFallbackTemplates();
    }
  };

  const fetchActiveLLM = async () => {
    try {
      const response = await fetch(`${config?.backendUrl || 'http://localhost:8083'}/health/system`);
      if (response.ok) {
        const data = await response.json();
        if (data.services?.active_llm?.provider && data.services?.active_llm?.model) {
          setActiveLLM({
            provider: data.services.active_llm.provider,
            model: data.services.active_llm.model
          });
          console.log('[LLM Info] Active LLM:', data.services.active_llm.provider, data.services.active_llm.model);
        }
      }
    } catch (error) {
      console.error('[LLM Info] Error fetching active LLM:', error);
      // Fallback to Gemini
      setActiveLLM({ provider: 'gemini', model: '2.0-flash-exp' });
    }
  };

  const loadFallbackTemplates = () => {
    console.log('[DocumentPreviewModal] Using fallback templates');
    const fallbackTemplates = [
      { id: 'general', name: 'General Document', category: 'General' },
      { id: 'legal', name: 'Legal Document (Kanun/Mevzuat)', category: 'Legal' },
      { id: 'novel', name: 'Novel/Fiction', category: 'Literature' },
      { id: 'research', name: 'Research Paper', category: 'Academic' },
      { id: 'invoice', name: 'Invoice', category: 'Financial' },
      { id: 'contract', name: 'Contract', category: 'Legal' },
      { id: 'financial_report', name: 'Financial Report', category: 'Financial' }
    ];
    setAnalysisTemplates(fallbackTemplates);
  };

  const fetchGraphQLData = async () => {
    if (!document) return;
    try {
      console.log('[DocumentPreview] Fetching GraphQL data for document:', {
        id: document.id,
        title: document.title,
        type: document.type,
      });
      const response = await executeQuery<{ documentPreview: GraphQLDocumentPreview }>(
        GET_DOCUMENT_PREVIEW,
        { documentId: document.id }
      );
      console.log('[DocumentPreview] GraphQL response received');
      setGraphqlData(response.documentPreview);
    } catch (error) {
      console.error('GraphQL fetch error (backend may be disabled):', error);
      // GraphQL is optional - fallback to CSV parsing only
      // This is expected when backend GraphQL is disabled
    }
  };

  const parseContent = () => {
    if (!document) return;

    try {
      if (document.type === 'csv') {
        setCsvLoading(true);
        parseCSV();
      } else if (document.type === 'json') {
        parseJSON();
      }
    } catch (error) {
      console.error('Parse error:', error);
      setCsvLoading(false);
      toast({
        title: 'Parse Error',
        description: 'Failed to parse document content',
        variant: 'destructive',
      });
    }
  };

  // Auto-detect delimiter
  const detectDelimiter = (csvString: string): string => {
    const firstLine = csvString.split('\n')[0];
    if (!firstLine) return ',';

    const delimiters = ['\t', ';', ',', '|']; // Tab first, then semicolon, comma, pipe
    const counts = delimiters.map(d => {
      const escapedDelimiter = d === '\t' ? '\\t' : d === '|' ? '\\|' : d;
      return (firstLine.match(new RegExp(escapedDelimiter, 'g')) || []).length;
    });
    const maxCount = Math.max(...counts);
    const delimiterIndex = counts.indexOf(maxCount);

    console.log('[CSV Parser] Delimiter detection:', {
      delimiters: delimiters.map(d => d === '\t' ? 'TAB' : d),
      counts,
      detected: delimiters[delimiterIndex] === '\t' ? 'TAB' : delimiters[delimiterIndex]
    });

    return maxCount > 0 ? delimiters[delimiterIndex] : ',';
  };

  const parseCSV = () => {
    let content = document!.content;

    // ✅ Priority 1: Use GraphQL data if available (already parsed correctly by backend)
    if (graphqlData?.columnHeaders && graphqlData.sampleRows) {
      console.log('[CSV Parser] Using GraphQL data (backend-parsed, correct delimiter)');
      setCsvHeaders(graphqlData.columnHeaders);
      setOriginalCsvHeaders(graphqlData.columnHeaders);
      setParsedData(graphqlData.sampleRows);
      setTotalRowCount(graphqlData.rowCount || graphqlData.sampleRows.length);
      setCsvLoading(false);
      return;
    }

    // Check if content is in processed format (from contextual-document-processor)
    if (content.includes('Tabular Data Overview:') && content.includes('Data Records:')) {
      console.log('[CSV Parser] Detected processed CSV format, extracting data...');

      // Extract data records section
      const dataRecordsIndex = content.indexOf('Data Records:');
      if (dataRecordsIndex !== -1) {
        const dataSection = content.substring(dataRecordsIndex);
        const recordLines = dataSection.split('\n').filter(line => {
          const trimmed = line.trim();
          // Match lines like: "1: {header1=value1, header2=value2}"
          return /^\d+:\s*\{/.test(trimmed);
        });

        if (recordLines.length > 0) {
          // Parse first record to get headers
          const firstRecord = recordLines[0].match(/\{(.+)\}/)?.[1];
          if (firstRecord) {
            const pairs = firstRecord.split(/,\s*(?![^{]*\})/); // Split by comma but not inside nested objects
            const headers = pairs.map(pair => pair.split('=')[0].trim());
            setCsvHeaders(headers);
            setOriginalCsvHeaders(headers); // Store original keys for data access

            // Parse all records
            const data = recordLines.slice(0, 10).map(line => {
              const recordContent = line.match(/\{(.+)\}/)?.[1];
              if (!recordContent) return null;

              const obj: any = {};
              const pairs = recordContent.split(/,\s*(?![^{]*\})/);
              pairs.forEach(pair => {
                const [key, ...valueParts] = pair.split('=');
                const value = valueParts.join('=').trim(); // Rejoin in case value contains '='
                obj[key.trim()] = value;
              });
              return obj;
            }).filter(Boolean);

            setTotalRowCount(recordLines.length);
            setParsedData(data);
            setCsvLoading(false);
            console.log('[CSV Parser] Successfully parsed processed CSV:', {
              headers: headers.length,
              rows: data.length,
              totalRows: recordLines.length
            });
            return;
          }
        }
      }

      // If we couldn't extract from processed format, try to extract from metadata
      console.log('[CSV Parser] Could not extract from processed format, checking metadata...');
      if (document!.metadata?.dataStructure?.headers) {
        const metaHeaders = document!.metadata.dataStructure.headers;
        setCsvHeaders(metaHeaders);
        setOriginalCsvHeaders(metaHeaders); // Store original keys for data access
        console.log('[CSV Parser] Using headers from metadata');
      }
    }

    // Standard CSV parsing (for raw CSV or fallback)
    // OPTIMIZED: Only extract first 25 lines for preview (don't split entire file!)
    console.log('[CSV Parser] Using optimized CSV parsing (preview only)...');

    // Find first 25 newlines without splitting entire content
    const PREVIEW_LINES = 25; // header + 20 data rows + buffer
    let lineCount = 0;
    let lastNewlinePos = -1;
    let previewEndPos = content.length;

    for (let i = 0; i < content.length && lineCount < PREVIEW_LINES; i++) {
      if (content[i] === '\n') {
        lineCount++;
        lastNewlinePos = i;
        if (lineCount === PREVIEW_LINES) {
          previewEndPos = i;
          break;
        }
      }
    }

    // Extract only the preview portion
    const previewContent = content.substring(0, previewEndPos);
    const lines = previewContent.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      setCsvLoading(false);
      return;
    }

    // Auto-detect delimiter from first few lines only
    const delimiter = detectDelimiter(previewContent);

    const parseCSVLine = (line: string, delim: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delim && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0], delimiter);
    setCsvHeaders(headers);
    setOriginalCsvHeaders(headers);

    // Estimate total rows by counting newlines (fast, without creating array)
    // For large files (>1MB), use sample-based estimation only
    let estimatedTotalRows = 0;
    const ONE_MB = 1_000_000;

    if (content.length > ONE_MB) {
      // Large file - sample first 100KB to estimate line density
      const sampleSize = Math.min(100_000, content.length);
      let sampleNewlines = 0;
      for (let i = 0; i < sampleSize; i++) {
        if (content[i] === '\n') sampleNewlines++;
      }
      estimatedTotalRows = Math.round((sampleNewlines / sampleSize) * content.length);
      console.log('[CSV Parser] Large file - estimated rows from sample:', estimatedTotalRows);
    } else {
      // Small file (<1MB) - count all newlines
      for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') estimatedTotalRows++;
      }
    }
    setTotalRowCount(Math.max(0, estimatedTotalRows - 1)); // Subtract header

    // Parse preview rows (first 20)
    const dataRows = lines.slice(1, 21);
    const data = dataRows.map(row => {
      const values = parseCSVLine(row, delimiter);
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });

    setParsedData(data);
    setCsvLoading(false);
    console.log('[CSV Parser] Preview parse complete:', {
      delimiter: delimiter === '\t' ? 'TAB' : delimiter,
      headers: headers.length,
      previewRows: data.length,
      estimatedTotalRows: estimatedTotalRows
    });
  };

  const parseJSON = () => {
    try {
      let jsonData = JSON.parse(document!.content);

      // If it's an array, take first 10
      if (Array.isArray(jsonData)) {
        setParsedData(jsonData.slice(0, 10));
      } else {
        setParsedData([jsonData]);
      }
    } catch (error) {
      // If parse fails, show raw content
      setParsedData(null);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied',
        description: 'Content copied to clipboard',
      });
    } catch (err) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Initialize editable headers when csvHeaders changes
  useEffect(() => {
    // ✅ Null check to prevent crash when modal opens before CSV is parsed
    if (csvHeaders && csvHeaders.length > 0 && editableHeaders.length === 0) {
      setEditableHeaders(csvHeaders);
    }
  }, [csvHeaders, editableHeaders.length]);

  // Handle header change
  const handleHeaderChange = (index: number, value: string) => {
    const newHeaders = [...editableHeaders];
    newHeaders[index] = value;
    setEditableHeaders(newHeaders);
  };

  // Save edited headers and update CSV file
  const saveEditedHeaders = async () => {
    if (!document || !parsedData) return;

    try {
      // Update headers in state
      setCsvHeaders(editableHeaders);
      setIsEditingHeaders(false);

      // Update the CSV file with new headers
      const response = await fetch(`/api/v2/documents/${document.id}/update-csv-headers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          headers: editableHeaders
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update CSV headers');
      }

      toast({
        title: 'Headers saved successfully',
        description: 'CSV file has been updated. Click Transform to create database table.',
        duration: 3000
      });

    } catch (error) {
      console.error('Error updating CSV headers:', error);
      toast({
        title: 'Error updating headers',
        description: 'Failed to save changes. Please try again.',
        variant: 'destructive',
        duration: 3000
      });
    }
  };

  const generateSQLPreview = async () => {
    if (!document) return;

    try {
      // Don't set isGenerating for SQL preview - it's just a quick preview
      // setIsGenerating(true);

      // Fetch GraphQL data for field types
      const response = await executeQuery<{ documentPreview: GraphQLDocumentPreview }>(
        GET_DOCUMENT_PREVIEW,
        { documentId: document.id }
      );

      setGraphqlData(response.documentPreview);

      const { suggestedTableName, dataQuality } = response.documentPreview;

      // Generate CREATE TABLE SQL
      let sql = `-- Create table in source database (from settings)\n`;
      sql += `-- Table: ${suggestedTableName}\n`;
      sql += `-- Generated from: ${document.title}\n\n`;
      sql += `CREATE TABLE IF NOT EXISTS ${suggestedTableName} (\n`;
      sql += `  id SERIAL PRIMARY KEY,\n`;

      // Add columns based on field types
      dataQuality.fieldTypes.forEach((field, idx) => {
        const nullable = field.nullable ? '' : ' NOT NULL';
        const unique = field.unique ? ' UNIQUE' : '';
        sql += `  ${field.field.toLowerCase().replace(/[^a-z0-9_]/g, '_')} ${field.type}${nullable}${unique}`;
        sql += idx < dataQuality.fieldTypes.length - 1 ? ',\n' : '\n';
      });

      sql += `);\n\n`;
      sql += `-- Total rows to import: ${response.documentPreview.rowCount}\n`;
      sql += `-- Data quality score: ${(dataQuality.score * 100).toFixed(1)}%\n`;

      setSqlPreview(sql);
      setShowSQL(true);
      setTableName(suggestedTableName); // Set initial table name from suggestion

      toast({
        title: 'SQL Generated',
        description: `Table schema for ${suggestedTableName} is ready`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate SQL',
        variant: 'destructive',
      });
    } finally {
      // Don't reset isGenerating since we didn't set it
      // setIsGenerating(false);
    }
  };

  const handleGenerateTable = async () => {
    if (!document || !graphqlData || !config || !tableName) return;

    try {
      setIsGenerating(true);

      const sourceDbName = config.database.name;

      if (!sourceDbName) {
        toast({
          title: "Database Not Configured",
          description: "Please configure source database in Settings first",
          variant: "destructive"
        });
        setIsGenerating(false);
        return;
      }

      console.log('[DocumentPreview] Generating table:', {
        documentId: document.id,
        tableName, // Use user-edited table name
        sourceDbName,
        batchSize,
      });

      // Call GraphQL mutation to transform document to source DB
      const result = await executeMutation<{ transformDocumentsToSourceDb: any }>(
        TRANSFORM_DOCUMENTS_TO_SOURCE_DB,
        {
          documentIds: [document.id],
          sourceDbId: sourceDbName,
          tableName: tableName, // Use user-edited table name instead of suggested
          createNewTable: true,
          batchSize: batchSize, // Use user-selected batch size
        }
      );

      const receivedJobId = result.transformDocumentsToSourceDb.jobId;
      setJobId(receivedJobId); // Store job ID for progress tracking

      console.log('[DocumentPreview] Table generation job started:', receivedJobId);

      toast({
        title: 'Table Generation Started',
        description: `Job ID: ${receivedJobId} (Batch size: ${batchSize})`,
      });

      // WebSocket progress will be handled by GraphQLTransformTab component

    } catch (error: any) {
      console.error('[DocumentPreview] Table generation error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate table',
        variant: 'destructive',
      });
      setIsGenerating(false);
      setJobId(null);
    }
  };

  // CSV Table View with paging (like documents table)
  const renderCSVTable = () => {
    if (!parsedData || parsedData.length === 0) {
      return <div className="text-muted-foreground text-center py-8">No data available</div>;
    }

    const truncateText = (text: string, maxLength: number = 120) => {
      if (!text) return '';
      let str = String(text);

      // Strip HTML tags
      str = str.replace(/<[^>]*>/g, '');

      // Decode HTML entities
      str = str.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");

      return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    };

    // Show rows with paging (like documents table)
    const displayedRows = parsedData.slice(0, csvVisibleRows);
    const hasMore = parsedData.length > csvVisibleRows;

    // Headers to display (editable or original)
    const displayHeaders = isEditingHeaders ? editableHeaders : (csvHeaders || []);

    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Single scrollable container for both header and body with synchronized scrolling */}
          <div className="flex-1 overflow-auto">
            <Table>
              {/* Sticky Header - stays at top while scrolling vertically, scrolls horizontally with body */}
              <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                <TableRow>
                  {displayHeaders.map((header, idx) => (
                    <TableHead
                      key={idx}
                      className="font-semibold text-sm px-4 py-3 whitespace-nowrap"
                    >
                      {isEditingHeaders ? (
                        <Input
                          value={header}
                          onChange={(e) => handleHeaderChange(idx, e.target.value)}
                          className="h-8 text-sm min-w-[100px] px-3"
                        />
                      ) : (
                        <span>{header}</span>
                      )}
                    </TableHead>
                  ))}
                  {/* Actions column - Save/Cancel buttons when editing */}
                  {isEditingHeaders && (
                    <TableHead className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={saveEditedHeaders}
                          className="h-7 w-7 p-0"
                          title="Save headers"
                        >
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsEditingHeaders(false);
                            setEditableHeaders([...csvHeaders]);
                          }}
                          className="h-7 w-7 p-0"
                          title="Cancel editing"
                        >
                          <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </Button>
                      </div>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>

              {/* Table Body */}
              <TableBody>
                {displayedRows.map((row: any, rowIdx: number) => (
                  <TableRow
                    key={rowIdx}
                    className="hover:bg-muted/50 transition-colors duration-150"
                  >
                    {/* Use originalCsvHeaders for data access since that's how parsed data is keyed */}
                    {((originalCsvHeaders && originalCsvHeaders.length > 0) ? originalCsvHeaders : (csvHeaders || [])).map((originalHeader, colIdx) => {
                      const cellValue = String(row[originalHeader] || '');
                      const cleanValue = cellValue
                        .replace(/<[^>]*>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'");

                      return (
                        <TableCell
                          key={colIdx}
                          className="px-4 py-3 text-sm"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="max-w-[300px] truncate cursor-help">
                                {truncateText(row[originalHeader], 100)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-lg break-words bg-popover text-popover-foreground border border-border shadow-lg"
                            >
                              <div className="text-xs leading-relaxed whitespace-pre-wrap">
                                {cleanValue}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </TooltipProvider>
    );
  };

  // GraphQL Transform Section (for GraphQL tab) - Using new component
  const renderGraphQLTransform = () => {
    if (!document || !parsedData || !csvHeaders) return null;

    return (
      <GraphQLTransformTab
        document={document}
        csvHeaders={csvHeaders}
        parsedData={parsedData}
        totalRowCount={totalRowCount}
        graphqlData={graphqlData}
        isGenerating={isGenerating}
        sqlPreview={sqlPreview}
        showSQL={showSQL}
        batchSize={batchSize}
        tableName={tableName}
        jobId={jobId}
        onBatchSizeChange={setBatchSize}
        onTableNameChange={setTableName}
        onGenerateSQL={generateSQLPreview}
        onGenerateTable={handleGenerateTable}
      />
    );
  };

  // JSON Tree View Component
  const JSONTreeNode = ({ data, level = 0 }: { data: any; level?: number }) => {
    const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

    if (data === null) return <span className="text-gray-500">null</span>;
    if (data === undefined) return <span className="text-gray-500">undefined</span>;

    const dataType = typeof data;

    if (dataType === 'string') {
      return <span className="text-green-600 dark:text-green-400">"{data}"</span>;
    }
    if (dataType === 'number') {
      return <span className="text-blue-600 dark:text-blue-400">{data}</span>;
    }
    if (dataType === 'boolean') {
      return <span className="text-purple-600 dark:text-purple-400">{String(data)}</span>;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return <span className="text-gray-500">[]</span>;

      return (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 hover:bg-muted rounded px-1"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span className="text-gray-600 dark:text-gray-400">
              Array[{data.length}]
            </span>
          </button>
          {isExpanded && (
            <div className="ml-4 border-l border-gray-300 dark:border-gray-700 pl-2">
              {data.map((item, idx) => (
                <div key={idx} className="my-1">
                  <span className="text-gray-500">{idx}: </span>
                  <JSONTreeNode data={item} level={level + 1} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (dataType === 'object') {
      const keys = Object.keys(data);
      if (keys.length === 0) return <span className="text-gray-500">{'{}'}</span>;

      return (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 hover:bg-muted rounded px-1"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span className="text-gray-600 dark:text-gray-400">
              Object{'{' + keys.length + '}'}
            </span>
          </button>
          {isExpanded && (
            <div className="ml-4 border-l border-gray-300 dark:border-gray-700 pl-2">
              {keys.map((key) => (
                <div key={key} className="my-1">
                  <span className="text-orange-600 dark:text-orange-400 font-medium">
                    {key}:
                  </span>{' '}
                  <JSONTreeNode data={data[key]} level={level + 1} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <span>{String(data)}</span>;
  };

  const renderJSONTree = () => {
    if (!parsedData || parsedData.length === 0) {
      return <div className="text-muted-foreground text-center py-8">No data available</div>;
    }

    return (
      <ScrollArea className="h-[450px]">
        <div className="p-4 bg-muted/30 rounded-lg font-mono text-sm">
          {parsedData.map((item: any, idx: number) => (
            <div key={idx} className="mb-4 last:mb-0">
              {parsedData.length > 1 && (
                <div className="text-gray-500 mb-1">Record {idx + 1}:</div>
              )}
              <JSONTreeNode data={item} />
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  };

  // Text/MD/DOC Raw View
  const renderTextView = () => {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCopy(document!.content)}
          >
            <Copy className="w-3 h-3 mr-2" />
            Copy
          </Button>
        </div>
        <ScrollArea className="h-[450px]">
          <pre className="p-4 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap font-mono">
            {document!.content}
          </pre>
        </ScrollArea>
      </div>
    );
  };

  // Handle OCR for scanned PDFs
  const handleRunOCR = async () => {
    if (!document) return;

    setPdfProcessing(true);
    setPdfProgress(0);
    setPdfStatus('OCR yapılıyor...');

    try {
      const ocrResponse = await fetch(`/api/v2/pdf/batch-ocr`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ documentIds: [document.id] })
      });

      if (!ocrResponse.ok) throw new Error('OCR failed');
      const ocrData = await ocrResponse.json();

      console.log('[OCR] Job started:', ocrData.jobId);

      // Poll OCR progress
      await pollJobProgress(ocrData.jobId, 0, 100);

      setPdfProgress(100);
      setPdfStatus('OCR Tamamlandı!');

      // Fetch extracted text from updated document
      const response = await fetch(`/api/v2/documents/${document.id}`);
      if (response.ok) {
        const data = await response.json();
        const doc = data.document || data;
        if (doc.content) {
          console.log('[OCR] Extracted text length:', doc.content.length);
          setPdfExtractedText(doc.content);
          setPdfIsScanned(false); // Mark as processed

          // Automatically detect template after OCR
          await detectTemplate(doc.content);
        }
      }

      toast({
        title: "Başarılı",
        description: "OCR işlemi tamamlandı",
      });
    } catch (error: any) {
      console.error('OCR error:', error);
      toast({
        title: "Hata",
        description: error.message || 'OCR işlemi başarısız',
        variant: "destructive"
      });
    } finally {
      setPdfProcessing(false);
    }
  };

  // Handle text extraction for text-based PDFs (fast, local)
  const handleExtractText = async () => {
    if (!document) return;

    setPdfProcessing(true);
    setPdfProgress(0);
    setPdfStatus('Extracting text...');

    try {
      const extractResponse = await fetch(`/api/v2/pdf/extract-text`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ documentIds: [document.id] })
      });

      if (!extractResponse.ok) throw new Error('Text extraction failed');
      const extractData = await extractResponse.json();

      console.log('[Text Extract] Job started:', extractData.jobId);

      // Poll extraction progress
      await pollJobProgress(extractData.jobId, 0, 100);

      setPdfProgress(100);
      setPdfStatus('Text extraction completed!');

      // Fetch extracted text from updated document
      const response = await fetch(`/api/v2/documents/${document.id}`);
      if (response.ok) {
        const data = await response.json();
        const doc = data.document || data;
        if (doc.content) {
          console.log('[Text Extract] Extracted text length:', doc.content.length);
          setPdfExtractedText(doc.content);
          setPdfIsScanned(false);

          // Automatically detect template after extraction
          await detectTemplate(doc.content);
        }
      }

      toast({
        title: "Success",
        description: "Text extraction completed",
      });
    } catch (error: any) {
      console.error('Text extraction error:', error);
      toast({
        title: "Error",
        description: error.message || 'Text extraction failed',
        variant: "destructive"
      });
    } finally {
      setPdfProcessing(false);
    }
  };

  // Automatically detect template based on PDF content
  const detectTemplate = async (text: string) => {
    if (!text || text.length < 100) {
      console.log('[Template Detection] Text too short, skipping');
      return;
    }

    setTemplateDetecting(true);
    try {
      console.log('[Template Detection] Starting detection for text length:', text.length);

      // STEP 1: Detect language first (critical for better template selection)
      let detectedLanguage: any = null;
      try {
        console.log('[Language Detection] Detecting language...');
        const languageResponse = await fetch(`${config?.backendUrl || 'http://localhost:8083'}/api/v2/pdf/detect-language`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            text: text.substring(0, 2000) // Send first 2000 chars for language detection
          })
        });

        if (languageResponse.ok) {
          const languageData = await languageResponse.json();
          if (languageData.success && languageData.language) {
            detectedLanguage = languageData.language;
            console.log(`[Language Detection] Detected: ${detectedLanguage.name} (${detectedLanguage.code}) - ${detectedLanguage.confidence}%`);

            toast({
              title: "Language Detected",
              description: `${detectedLanguage.name} (${detectedLanguage.confidence}% confidence)`,
            });
          }
        }
      } catch (langError) {
        console.error('[Language Detection] Error:', langError);
        // Continue without language info if detection fails
      }

      // STEP 2: Detect template (with language context if available)
      // Check if document has visionOCR metadata with visual elements
      let visualElements: any[] = [];
      if (document?.metadata?.visionOCR?.visualElements) {
        visualElements = document.metadata.visionOCR.visualElements;
        console.log('[Template Detection] Including visual elements:', visualElements.length);
        console.log('[Template Detection] Visual types:', visualElements.map((v: any) => v.type).join(', '));
      }

      const response = await fetch(`${config?.backendUrl || 'http://localhost:8083'}/api/v2/templates/detect`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content: text.substring(0, 5000), // Send first 5000 chars
          filePath: document?.filePath || document?.metadata?.originalPath,
          visualElements: visualElements, // Include OCR visual elements
          language: detectedLanguage // Include detected language for better template selection
        })
      });

      if (!response.ok) {
        throw new Error('Template detection failed');
      }

      const data = await response.json();

      if (data.success && data.template) {
        console.log('[Template Detection] Detected:', data.template);
        const detectionInfo = {
          templateId: data.template.template_id,
          templateName: data.template.name,
          confidence: 85, // Default confidence
          reason: `Detected via ${data.detection_method}`,
          method: data.detection_method
        };
        setDetectedTemplate(detectionInfo);
        setSelectedTemplate(data.template.template_id);

        toast({
          title: "Template Auto-Detected",
          description: `${data.template.name} (${data.detection_method} method)`,
        });
      }
    } catch (error: any) {
      console.error('[Template Detection] Error:', error);
      // Silent failure - template detection is optional
    } finally {
      setTemplateDetecting(false);
    }
  };

  // Get all child paths for a given parent path
  const getChildPaths = (parentPath: string, obj: any, currentPath: string = ''): string[] => {
    const paths: string[] = [];

    if (typeof obj !== 'object' || obj === null) {
      return paths;
    }

    for (const key in obj) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;

      if (fullPath.startsWith(parentPath) && fullPath !== parentPath) {
        paths.push(fullPath);

        // Recursively get child paths
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          paths.push(...getChildPaths(parentPath, obj[key], fullPath));
        }
      }
    }

    return paths;
  };

  // Toggle field selection (with parent/child logic)
  const toggleFieldSelection = (fieldPath: string, checked: boolean) => {
    try {
      const newSelected = new Set(pdfSelectedFields);

      if (checked) {
        // Add the field
        newSelected.add(fieldPath);

        // If selecting a parent, also select all children
        if (pdfMetadata) {
          const childPaths = getChildPaths(fieldPath, pdfMetadata);
          childPaths.forEach(path => newSelected.add(path));
        }
      } else {
        // Remove the field
        newSelected.delete(fieldPath);

        // If deselecting a parent, also deselect all children
        if (pdfMetadata) {
          const childPaths = getChildPaths(fieldPath, pdfMetadata);
          childPaths.forEach(path => newSelected.delete(path));
        }
      }

      setPdfSelectedFields(newSelected);
    } catch (error) {
      console.error('[toggleFieldSelection] Error toggling field:', fieldPath, error);
      toast({
        title: "Error",
        description: "Failed to toggle field selection",
        variant: "destructive"
      });
    }
  };

  // Get all field paths from metadata (for auto-select all)
  const getAllFieldPaths = (obj: any, prefix: string = ''): string[] => {
    const paths: string[] = [];

    if (!obj || typeof obj !== 'object') return paths;

    for (const key in obj) {
      // Skip internal fields
      if (key.startsWith('_')) continue;

      const fullPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      // Always add the current path (both parent and leaf nodes)
      paths.push(fullPath);

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // It's an object, recurse to get children
        paths.push(...getAllFieldPaths(value, fullPath));
      }
    }

    return paths;
  };

  // Auto-select all fields from metadata
  const autoSelectAllFields = (metadata: any) => {
    const allPaths = getAllFieldPaths(metadata);
    setPdfSelectedFields(new Set(allPaths));
  };

  // Render metadata field checkboxes
  const renderMetadataFieldCheckboxes = () => {
    if (!pdfMetadata) return null;

    const fields: Array<{ path: string; label: string; group?: string }> = [];

    // Core fields
    fields.push({ path: 'summary', label: 'Summary' });
    fields.push({ path: 'category', label: 'Category' });
    fields.push({ path: 'language', label: 'Language' });

    // Keywords & Topics
    if (pdfMetadata.keywords?.length > 0) {
      fields.push({ path: 'keywords', label: 'Keywords (array)', group: 'Content' });
    }
    if (pdfMetadata.topics?.length > 0) {
      fields.push({ path: 'topics', label: 'Topics (array)', group: 'Content' });
    }

    // Statistics
    if (pdfMetadata.statistics) {
      Object.keys(pdfMetadata.statistics).forEach(key => {
        fields.push({ path: `statistics.${key}`, label: `${key}`, group: 'Statistics' });
      });
    }

    // Structure
    if (pdfMetadata.structure) {
      Object.keys(pdfMetadata.structure).forEach(key => {
        if (pdfMetadata.structure![key as keyof typeof pdfMetadata.structure]) {
          fields.push({ path: `structure.${key}`, label: `${key}`, group: 'Structure' });
        }
      });
    }

    // Content Analysis
    if (pdfMetadata.contentAnalysis) {
      Object.keys(pdfMetadata.contentAnalysis).forEach(key => {
        if (pdfMetadata.contentAnalysis![key as keyof typeof pdfMetadata.contentAnalysis]) {
          fields.push({ path: `contentAnalysis.${key}`, label: `${key}`, group: 'Content Analysis' });
        }
      });
    }

    // Entities
    if (pdfMetadata.entities) {
      Object.keys(pdfMetadata.entities).forEach(key => {
        const value = pdfMetadata.entities![key as keyof typeof pdfMetadata.entities];
        if (value && Array.isArray(value) && value.length > 0) {
          fields.push({ path: `entities.${key}`, label: `${key} (array)`, group: 'Entities' });
        }
      });
    }

    // Extracted Tables (at the end)
    if (pdfMetadata.extractedTables && Array.isArray(pdfMetadata.extractedTables) && pdfMetadata.extractedTables.length > 0) {
      fields.push({ path: 'extractedTables', label: `Extracted Tables (${pdfMetadata.extractedTables.length})`, group: 'Tables' });
    }

    // Group fields
    const grouped: Record<string, typeof fields> = {};
    fields.forEach(field => {
      const group = field.group || 'General';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(field);
    });

    return Object.entries(grouped).map(([group, groupFields]) => (
      <div key={group} className="space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</div>
        {groupFields.map(field => (
          <div key={field.path} className="flex items-center space-x-2">
            <Checkbox
              id={field.path}
              checked={pdfSelectedFields.has(field.path)}
              onCheckedChange={(checked) => toggleFieldSelection(field.path, checked as boolean)}
            />
            <label
              htmlFor={field.path}
              onClick={() => highlightField(field.path)}
              className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer hover:text-primary transition-colors"
            >
              {field.label}
            </label>
          </div>
        ))}
      </div>
    ));
  };

  // Load available tables from source database
  const loadAvailableTables = async () => {
    const sourceDbName = config.database.name;
    if (!sourceDbName) {
      console.warn('[PDF] Source database not configured');
      return;
    }
    try {
      const response = await fetch(`/api/v2/pdf/available-tables/${sourceDbName}`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setPdfAvailableTables(data.tables || []);
      }
    } catch (error) {
      console.error('[PDF Transform] Failed to load tables:', error);
    }
  };

  // Load table columns when existing table is selected
  const loadTableColumns = async (tableName: string) => {
    const sourceDbName = config.database.name;
    if (!sourceDbName) {
      console.warn('[PDF] Source database not configured');
      return;
    }
    try {
      const response = await fetch(`/api/v2/pdf/table-columns/${sourceDbName}/${tableName}`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setPdfTableColumns(data.columns || []);

        // Initialize field mappings with empty values
        const initialMappings: Record<string, string> = {};
        Array.from(pdfSelectedFields).forEach(field => {
          initialMappings[field] = '';
        });
        setPdfFieldMappings(initialMappings);
      }
    } catch (error) {
      console.error('[PDF Transform] Failed to load table columns:', error);
    }
  };

  // Handle field mapping change
  const handleFieldMappingChange = (metadataField: string, targetColumn: string) => {
    setPdfFieldMappings(prev => ({
      ...prev,
      [metadataField]: targetColumn
    }));
  };

  // Copy JSON to clipboard
  const handleCopyJSON = () => {
    if (!pdfMetadata) return;
    const jsonString = JSON.stringify(pdfMetadata, null, 2);
    navigator.clipboard.writeText(jsonString);
    toast({
      title: "Copied",
      description: "JSON copied to clipboard",
    });
  };

  // Render JSON with highlighted selected fields and their blocks
  const renderHighlightedJSON = () => {
    if (!pdfMetadata) return '';

    const jsonString = JSON.stringify(pdfMetadata, null, 2);
    const lines = jsonString.split('\n');

    // First, find all lines that should be highlighted (including blocks)
    const highlightedLines = new Set<number>();

    pdfSelectedFields.forEach(field => {
      const fieldParts = field.split('.');
      const lastPart = fieldParts[fieldParts.length - 1];

      // Find the line containing this field
      lines.forEach((line, index) => {
        if (line.includes(`"${lastPart}":`)) {
          // Add this line
          highlightedLines.add(index);

          // Get the indentation level of this line
          const baseIndent = line.search(/\S/);

          // Find the end of this block by looking for lines with same or less indentation
          for (let i = index + 1; i < lines.length; i++) {
            const currentLine = lines[i];
            const currentIndent = currentLine.search(/\S/);

            // If we find a line with same or less indentation, we've reached the end of the block
            if (currentIndent !== -1 && currentIndent <= baseIndent) {
              // Check if this line is a closing bracket/brace that belongs to our block
              if (currentIndent === baseIndent && (currentLine.trim() === '}' || currentLine.trim() === '},' || currentLine.trim() === ']' || currentLine.trim() === '],')) {
                highlightedLines.add(i);
              }
              break;
            }

            // Add all lines that are part of this block (more indented)
            if (currentIndent > baseIndent) {
              highlightedLines.add(i);
            }
          }
        }
      });
    });

    return lines.map((line, index) => {
      const isHighlighted = highlightedLines.has(index);

      // Extract field name from line for ID (e.g., "summary": -> json-field-summary)
      const fieldMatch = line.match(/"(\w+)":/);
      const fieldId = fieldMatch ? `json-field-${fieldMatch[1]}` : undefined;

      return (
        <div
          key={index}
          id={fieldId}
          className={`transition-all ${isHighlighted ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''}`}
        >
          {line}
        </div>
      );
    });
  };

  // Continue to Transform tab with selected fields
  const handleContinueToTransform = () => {
    if (pdfSelectedFields.size === 0) {
      toast({
        title: "No Fields Selected",
        description: "Please select at least one field to continue",
        variant: "destructive"
      });
      return;
    }
    setPdfActiveTab('transform');
  };

  // Fetch all PDF schemas
  const fetchPDFSchemas = async () => {
    try {
      const response = await fetch('/api/v2/pdf/schemas', {
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include' // Include cookies for session auth
      });

      if (response.ok) {
        const data = await response.json();
        setPdfSchemas(data.schemas || []);
        console.log('[PDF Schema] Loaded schemas:', data.schemas?.length || 0);
      }
    } catch (error) {
      console.error('[PDF Schema] Failed to fetch schemas:', error);
    }
  };

  // Load selected schema
  const handleLoadSchema = async (schemaId: string) => {
    if (!schemaId) return;

    try {
      const response = await fetch(`/api/v2/pdf/schemas/${schemaId}`, {
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        const schema = data.schema;

        // Apply schema to current state
        setPdfSelectedFields(new Set(schema.fieldSelections || []));
        setPdfTableName(schema.targetTableName || schema.sqlSchema?.tableName || '');
        setPdfUseExistingTable(false); // Always create new table from schema

        toast({
          title: "Schema Loaded",
          description: `Applied schema: ${schema.name}`,
        });

        console.log('[PDF Schema] Loaded and applied schema:', schema.name);
      }
    } catch (error) {
      console.error('[PDF Schema] Failed to load schema:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load schema",
        variant: "destructive"
      });
    }
  };

  // Save current configuration as schema
  const handleSaveSchema = async () => {
    if (!pdfSchemaName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a schema name",
        variant: "destructive"
      });
      return;
    }

    if (pdfSelectedFields.size === 0) {
      toast({
        title: "No Fields Selected",
        description: "Please select at least one field before saving",
        variant: "destructive"
      });
      return;
    }

    try {
      // Generate SQL schema structure
      const tableName = pdfTableName || getDefaultTableName();
      const selectedArray = Array.from(pdfSelectedFields);

      const columns = selectedArray.map(field => {
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

        const columnName = field.split('.').pop()?.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`) || field;

        return {
          name: columnName,
          type: sqlType,
          nullable: true
        };
      });

      // Add id and created_at columns
      columns.unshift({
        name: 'id',
        type: 'UUID',
        isPrimary: true,
        nullable: false,
        default: 'gen_random_uuid()'
      });

      columns.push({
        name: 'created_at',
        type: 'TIMESTAMP',
        nullable: false,
        default: 'NOW()'
      });

      const schemaData = {
        name: pdfSchemaName,
        description: pdfSchemaDescription || undefined,
        documentType: pdfMetadata?.category || 'Other',
        category: pdfMetadata?.category || 'Other',
        fieldSelections: selectedArray,
        sqlSchema: {
          tableName,
          columns
        },
        targetTableName: tableName,
        sourceDatabase: config.database.name,
        sampleJson: pdfMetadata
      };

      const response = await fetch('/api/v2/pdf/schemas', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(schemaData)
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Schema Saved",
          description: `Schema "${pdfSchemaName}" saved successfully`,
        });

        // Refresh schemas list
        await fetchPDFSchemas();

        // Reset inline form state
        setPdfShowInlineSchemaSave(false);
        setPdfSchemaName('');
        setPdfSchemaDescription('');
        setPdfSelectedSchema(data.schema.id); // Select the newly saved schema

        console.log('[PDF Schema] Saved new schema:', data.schema);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save schema');
      }
    } catch (error: any) {
      console.error('[PDF Schema] Save error:', error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save schema",
        variant: "destructive"
      });
    }
  };

  // Helper: Get default table name from document title
  const getDefaultTableName = () => {
    return document.title?.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'document_data';
  };

  // Generate SQL schema from selected fields
  const generateSQLSchema = () => {
    if (!pdfMetadata || pdfSelectedFields.size === 0) return '';

    let tableName = pdfTableName || getDefaultTableName();

    // Sanitize table name: PostgreSQL table names cannot start with a number
    if (/^\d/.test(tableName)) {
      tableName = `pdf_${tableName}`;
    }

    // Filter out internal fields (_fullText, _contentHash, _textExcerpt)
    const selectedArray = Array.from(pdfSelectedFields).filter(f => !f.startsWith('_'));

    const columns = selectedArray.map(field => {
      // Determine SQL type based on field
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

      return `  ${field.replace(/\./g, '_')} ${sqlType}`;
    }).join(',\n');

    // Generate CREATE TABLE + INSERT INTO preview
    // Always include full text fields for RAG/embedding and duplicate detection
    const createSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id),
${columns},
  full_text TEXT,
  content_hash VARCHAR(64) UNIQUE,
  text_excerpt VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_${tableName}_content_hash ON ${tableName}(content_hash);`;

    const insertSQL = `\n\n-- Insert with duplicate detection using content_hash
INSERT INTO ${tableName} (
  document_id,
${selectedArray.map(f => `  ${f.replace(/\./g, '_')}`).join(',\n')},
  full_text,
  content_hash,
  text_excerpt,
  created_at
) VALUES (
  $1,  -- document_id
${selectedArray.map((_, idx) => `  $${idx + 2}`).join(',  -- field value\n')},  -- field value
  $${selectedArray.length + 2},  -- full_text
  $${selectedArray.length + 3},  -- content_hash
  $${selectedArray.length + 4},  -- text_excerpt
  NOW()
)
ON CONFLICT (content_hash) DO UPDATE SET
  document_id = EXCLUDED.document_id,
${selectedArray.map(f => `  ${f.replace(/\./g, '_')} = EXCLUDED.${f.replace(/\./g, '_')}`).join(',\n')},
  text_excerpt = EXCLUDED.text_excerpt,
  created_at = NOW();`;

    return createSQL + insertSQL;
  };

  // Handle PDF transform to database
  const handlePDFTransform = async () => {
    if (!document) return;

    // Handle custom schema mode
    if (useCustomSchema) {
      if (!customTableSchema.tableName || customTableSchema.fields.length === 0) {
        toast({
          title: "Error",
          description: "Please define table name and fields",
          variant: "destructive"
        });
        return;
      }

      const sourceDbName = config.database.name;

      if (!sourceDbName) {
        toast({
          title: "Database Not Configured",
          description: "Please configure source database in Settings first",
          variant: "destructive"
        });
        return;
      }

      console.log('[PDF Transform] Custom schema mode');
      console.log('[PDF Transform] Table:', customTableSchema.tableName);
      console.log('[PDF Transform] Fields:', customTableSchema.fields);

      setPdfProcessing(true);
      setPdfProgress(0);
      setPdfStatus('Creating custom table and extracting data...');

      try {
        // Generate SQL for custom schema
        const createSQL = `CREATE TABLE IF NOT EXISTS ${customTableSchema.tableName} (\n` +
          customTableSchema.fields.map(f => {
            let fieldDef = `  ${f.name} ${f.type}`;
            if (f.isPrimaryKey) fieldDef += ' PRIMARY KEY';
            if (f.required) fieldDef += ' NOT NULL';
            return fieldDef;
          }).join(',\n') +
          '\n);';

        const requestBody = {
          documentId: document.id,
          tableName: customTableSchema.tableName,
          sourceDbId: sourceDbName,
          createTableSQL: createSQL,
          customSchema: customTableSchema,
          isCustomSchema: true
        };

        const response = await fetch('/api/v2/pdf/metadata-transform', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Transform failed');
        }

        const data = await response.json();
        setPdfTransformJobId(data.jobId);
        await pollJobProgress(data.jobId, 0, 100);

        setPdfProgress(100);
        setPdfStatus('Custom table created successfully!');
        toast({
          title: "Success",
          description: `Table "${customTableSchema.tableName}" created with custom schema`,
        });
      } catch (error: any) {
        console.error('Transform error:', error);
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
      } finally {
        setPdfProcessing(false);
      }
      return;
    }

    // Template-based mode (existing logic)
    if (!pdfMetadata) return;

    let finalTableName = pdfTableName || getDefaultTableName();

    // Sanitize table name: PostgreSQL table names cannot start with a number
    if (/^\d/.test(finalTableName)) {
      finalTableName = `pdf_${finalTableName}`;
    }

    if (!finalTableName) {
      toast({
        title: "Error",
        description: "Please provide a table name",
        variant: "destructive"
      });
      return;
    }

    const sourceDbName = config.database.name;

    if (!sourceDbName) {
      toast({
        title: "Database Not Configured",
        description: "Please configure source database in Settings first",
        variant: "destructive"
      });
      return;
    }

    console.log('[PDF Transform] Starting transform...');
    console.log('[PDF Transform] Selected fields:', Array.from(pdfSelectedFields));
    console.log('[PDF Transform] Table name:', finalTableName);
    console.log('[PDF Transform] Source DB:', sourceDbName);
    console.log('[PDF Transform] SQL Schema:', generateSQLSchema());

    // Reset transform progress
    setPdfTransformProgress(0);
    setPdfTransformStatus('Initializing transform...');
    setPdfTransformComplete(false);
    setPdfTransformJobId(null);

    setPdfProcessing(true);
    setPdfProgress(0);
    setPdfStatus('Creating table and inserting data...');

    try {
      // Start Python service for transform
      const serviceResponse = await fetch('/api/services/pythonService/start', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' })
      });

      if (!serviceResponse.ok) {
        console.warn('[PDF Transform] Python service start failed, continuing with backend');
      }

      const requestBody = {
        documentId: document.id,
        selectedFields: Array.from(pdfSelectedFields),
        tableName: finalTableName,
        sourceDbId: sourceDbName,
        createTableSQL: generateSQLSchema(), // Include CREATE TABLE statement
        templateId: selectedTemplate, // Include template ID for tracking
        isCustomSchema: false
      };

      const response = await fetch('/api/v2/pdf/metadata-transform', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Transform failed');
      }

      const data = await response.json();
      console.log('[PDF Transform] Job started:', data.jobId);

      // Set job ID for progress tracking
      setPdfTransformJobId(data.jobId);
      setPdfTransformStatus('Creating table schema...');

      // Poll progress
      await pollJobProgress(data.jobId, 0, 100);

      // Mark as complete
      setPdfTransformProgress(100);
      setPdfTransformStatus('Table created and data inserted successfully!');
      setPdfTransformComplete(true);

      setPdfProgress(100);
      setPdfStatus('Transform Complete!');

      toast({
        title: "Success",
        description: `Table "${finalTableName}" created and data inserted successfully`,
      });
    } catch (error: any) {
      console.error('Transform error:', error);
      setPdfTransformStatus('Transform failed');
      toast({
        title: "Error",
        description: error.message || 'Failed to transform metadata',
        variant: "destructive"
      });
    } finally {
      setPdfProcessing(false);
    }
  };

  // Handle metadata analysis (direct execution)
  const handleAnalyzeMetadata = async () => {
    if (!document) return;

    // Save current selections if this is a re-analyze
    const isReAnalyze = pdfMetadata !== null;
    const previousSelections = isReAnalyze ? new Set(pdfSelectedFields) : null;

    setPdfProcessing(true);
    setPdfProgress(0);
    setPdfStatus('Extracting metadata...');

    try {
      // Get the selected template
      const template = analysisTemplates.find(t => t.id === selectedTemplate);

      // Use focus keywords from template only
      const focusKeywords = template?.focus_keywords || [];

      // Get visual elements from document metadata (if OCR was done)
      const visualElements = document?.metadata?.visionOCR?.visualElements || [];

      // Build enhanced template data with focus keywords and visual elements
      const enhancedTemplate = template ? {
        ...template,
        focus_keywords: focusKeywords,
        visualElements: visualElements
      } : undefined;

      const metadataResponse = await fetch(`/api/v2/pdf/batch-metadata`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          documentIds: [document.id],
          template: enhancedTemplate,
          focusKeywords: focusKeywords.length > 0 ? focusKeywords : undefined,
          analysisPrompt: analyzePrompt.trim() || undefined
        })
      });

      if (!metadataResponse.ok) throw new Error('Metadata extraction failed');
      const metadataData = await metadataResponse.json();

      // Poll metadata progress
      await pollJobProgress(metadataData.jobId, 0, 100);

      setPdfProgress(100);
      setPdfStatus('Metadata Extracted!');

      // Fetch updated document metadata (with preserveSelections flag)
      await fetchPDFMetadata(previousSelections);

      // Switch to JSON tab after metadata extraction
      setPdfActiveTab('map');

      toast({
        title: "Success",
        description: isReAnalyze ? "Metadata re-analyzed successfully" : "Metadata extracted successfully",
      });
    } catch (error: any) {
      console.error('Metadata extraction error:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to extract metadata',
        variant: "destructive"
      });
    } finally {
      setPdfProcessing(false);
    }
  };

  const pollJobProgress = async (jobId: string, startProgress: number, endProgress: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const response = await fetch(`/api/v2/pdf/job-status/${jobId}`, {
            headers: getAuthHeaders()
          });
          const data = await response.json();

          if (data.success && data.progress) {
            const { status, percentage, message, error } = data.progress;

            // Update progress proportionally
            const currentProgress = startProgress + ((endProgress - startProgress) * (percentage / 100));
            setPdfProgress(Math.round(currentProgress));

            // Also update transform progress if this is a transform job
            if (pdfTransformJobId === jobId) {
              setPdfTransformProgress(percentage);
              if (message) {
                setPdfTransformStatus(message);
              } else if (status === 'processing') {
                setPdfTransformStatus('Creating table and inserting data...');
              }
            }

            if (status === 'completed') {
              resolve();
            } else if (status === 'error') {
              // Include actual error message from backend
              const errorMessage = error || message || 'Job failed';
              reject(new Error(errorMessage));
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

  const fetchPDFMetadata = async (preserveSelections?: Set<string> | null) => {
    if (!document) {
      console.error('[PDF Metadata] No document available');
      return;
    }

    try {
      // Fetch document from database to get updated metadata
      console.log('[PDF Metadata] Fetching for document ID:', document.id);
      const response = await fetch(`/api/v2/documents/${document.id}`);
      console.log('[PDF Metadata] Response status:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('[PDF Metadata] Full response:', JSON.stringify(data, null, 2));

        // Backend returns { document: { metadata: { analysis: ... } } }
        const docData = data.document || data;
        console.log('[PDF Metadata] Has document.metadata?', !!docData.metadata);
        console.log('[PDF Metadata] Has document.metadata.analysis?', !!docData.metadata?.analysis);

        if (docData.metadata?.analysis) {
          console.log('[PDF Metadata] Setting metadata:', docData.metadata.analysis);
          setPdfMetadata(docData.metadata.analysis);

          // Handle field selections
          if (preserveSelections) {
            // Re-Analyze: Keep user's previous selections + add any new fields
            console.log('[PDF Metadata] Preserving user selections from re-analyze');
            const allNewPaths = getAllFieldPaths(docData.metadata.analysis);
            const mergedSelections = new Set([
              ...Array.from(preserveSelections),
              ...allNewPaths.filter(path => !preserveSelections.has(path)) // Only add truly new fields
            ]);
            setPdfSelectedFields(mergedSelections);
          } else if (docData.metadata?.selectedFields) {
            // Load saved selections from database
            setPdfSelectedFields(new Set(docData.metadata.selectedFields));
          } else {
            // First time: select all fields
            autoSelectAllFields(docData.metadata.analysis);
          }

          // Extract text preview if available
          if (docData.content) {
            setPdfExtractedText(docData.content);
          }

          toast({
            title: "Metadata loaded",
            description: "PDF metadata successfully retrieved",
          });
        } else {
          console.warn('[PDF Metadata] No metadata.analysis in response. Full metadata:', docData.metadata);
          toast({
            title: "Warning",
            description: "Metadata extraction completed but no analysis data found",
            variant: "destructive"
          });
        }
      } else {
        const errorText = await response.text();
        console.error('[PDF Metadata] Response error:', response.status, errorText);
        toast({
          title: "Error",
          description: `Failed to fetch metadata: ${response.status}`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('[PDF Metadata] Fetch error:', error);
      toast({
        title: "Error",
        description: `Failed to fetch PDF metadata: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  // Handle copy PDF text to clipboard
  const handleCopyPDFText = async () => {
    if (!pdfExtractedText) return;

    try {
      await navigator.clipboard.writeText(pdfExtractedText);
      toast({
        title: "Copied!",
        description: "PDF text copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy text",
        variant: "destructive"
      });
    }
  };

  // PDF Tabs View
  const renderPDFTabs = () => {
    const hasMetadata = pdfMetadata !== null;

    return (
      <Tabs value={pdfActiveTab} onValueChange={setPdfActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-3">
          <TabsTrigger value="preview">
            Preview
          </TabsTrigger>
          <TabsTrigger value="map" disabled={!hasMetadata}>
            Map Fields
          </TabsTrigger>
          <TabsTrigger value="transform" disabled={!hasMetadata}>
            Create Table
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-0">
          <div className="h-[360px] flex flex-col">
            {pdfProcessing ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                <ProgressCircle
                  progress={pdfProgress}
                  showPulse={true}
                  size={200}
                />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">{pdfStatus}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {pdfStatus.toLowerCase().includes('ocr') ? 'OCR' :
                     pdfStatus.toLowerCase().includes('analyz') ? 'Metadata Extraction' :
                     'Processing'}
                  </p>
                </div>
              </div>
            ) : pdfAnalyzing ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-sm text-muted-foreground">Initializing PDF...</p>
                </div>
              </div>
            ) : pdfExtractedText ? (
              <div className="relative h-full w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyPDFText}
                  className="absolute top-2 right-2 z-10 hover:bg-background/80 backdrop-blur-sm"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <ScrollArea className="h-full w-full">
                  <div className="prose prose-sm dark:prose-invert max-w-none p-4 pr-12">
                    <pre className="whitespace-pre-wrap text-sm">{pdfExtractedText}</pre>
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <FileText className="w-12 h-12 opacity-50" />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">No Content Available</p>
                  <p className="text-xs">Document is waiting to be processed</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="map" className="mt-0">
          <div className="h-[360px] bg-muted/20">
            {pdfMetadata ? (
              <div className="h-full flex gap-4">
                {/* JSON Viewer - Left Side */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Analyzed Data - Select Fields to Map
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const jsonData = pdfEditMode && pdfEditedMetadata ? pdfEditedMetadata : pdfMetadata;
                        navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
                        toast({
                          title: "Copied",
                          description: "JSON data copied to clipboard"
                        });
                      }}
                      className="h-7 w-7 p-0 hover:bg-primary/10 transition-colors"
                      title="Copy JSON data"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <JsonViewer
                    data={pdfEditMode && pdfEditedMetadata ? pdfEditedMetadata : pdfMetadata}
                    selectedFields={pdfSelectedFields}
                    onFieldToggle={(path) => {
                      try {
                        const isCurrentlySelected = pdfSelectedFields.has(path);
                        toggleFieldSelection(path, !isCurrentlySelected);
                      } catch (error) {
                        console.error('[JsonViewer] onFieldToggle error:', error);
                      }
                    }}
                    highlightPath={pdfHighlightedPath}
                    editMode={pdfEditMode}
                    onValueChange={(path, newValue) => {
                      try {
                        if (pdfEditMode) {
                          const updated = { ...pdfEditedMetadata };
                          const keys = path.split('.');
                          let current = updated;
                          for (let i = 0; i < keys.length - 1; i++) {
                            if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
                              current[keys[i]] = {};
                            }
                            current = current[keys[i]];
                          }
                          current[keys[keys.length - 1]] = newValue;
                          setPdfEditedMetadata(updated);
                        }
                      } catch (error) {
                        console.error('[JsonViewer] onValueChange error:', error);
                        toast({
                          title: "Error",
                          description: "Failed to update value",
                          variant: "destructive"
                        });
                      }
                    }}
                    className="h-full"
                  />
                </div>

                {/* Field Mapping - Right Side - Two Column Layout */}
<div className="w-[480px] flex-shrink-0 flex flex-col border-l pl-4 overflow-hidden">
                  <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Field Mapping ({pdfSelectedFields.size})
                    </Label>
                    <div className="flex items-center gap-0.5 bg-background/40 backdrop-blur-sm border border-border/50 rounded-md p-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Auto-select all top-level fields from metadata
                          const getAllKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
                            const keys: string[] = [];
                            for (const key in obj) {
                              if (!key.startsWith('_') && obj[key] !== null && obj[key] !== undefined) {
                                const fullKey = prefix ? `${prefix}.${key}` : key;
                                if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                                  keys.push(...getAllKeys(obj[key] as Record<string, unknown>, fullKey));
                                } else {
                                  keys.push(fullKey);
                                }
                              }
                            }
                            return keys;
                          };

                          const allKeys = getAllKeys(pdfMetadata as Record<string, unknown>);
                          const newSelection = new Set(allKeys);
                          setPdfSelectedFields(newSelection);

                          toast({
                            title: "Auto-Selected",
                            description: `${allKeys.length} fields selected`
                          });
                        }}
                        className="h-7 w-7 p-0 hover:bg-primary/10 transition-colors"
                        title="Auto-select all fields"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPdfSelectedFields(new Set());
                          toast({
                            title: "Cleared",
                            description: "All field mappings cleared"
                          });
                        }}
                        className="h-7 w-7 p-0 hover:bg-destructive/10 transition-colors"
                        title="Clear all mappings"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const mappingData = {
                            tableName: pdfTableName || getDefaultTableName(),
                            fields: Array.from(pdfSelectedFields).map(field => ({
                              source: field,
                              target: pdfFieldMappings[field] || field.replace(/\./g, '_').toLowerCase()
                            }))
                          };
                          navigator.clipboard.writeText(JSON.stringify(mappingData, null, 2));
                          toast({
                            title: "Copied!",
                            description: "Field mappings copied to clipboard"
                          });
                        }}
                        className="h-7 w-7 p-0 hover:bg-primary/10 transition-colors"
                        title="Copy mapping as JSON"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Table Name Input - Auto from PDF name */}
                  <div className="mb-3 min-w-0">
                    <Input
                      id="mapping-table-name"
                      value={pdfTableName || getDefaultTableName()}
                      onChange={(e) => setPdfTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      placeholder={getDefaultTableName()}
                      className="text-sm font-mono h-8 px-3 py-1 w-full min-w-0"
                    />
                  </div>

                  {/* Mapped Fields - Two Column Layout with Preview */}
                  <ScrollArea className="flex-1 border rounded-md p-3 bg-muted/10">
                    {pdfSelectedFields.size === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Select fields from JSON to map them to table columns
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {/* Column Headers */}
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 pb-2 border-b border-border/50 sticky top-0 bg-background dark:bg-zinc-900 z-10">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Source Field
                          </div>
                          <div className="w-6" />
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Target Column
                          </div>
                        </div>

                        {Array.from(pdfSelectedFields)
                          .filter(f => !f.startsWith('_'))
                          .sort()
                          .map(field => {
                            const columnName = field.replace(/\./g, '_').toLowerCase();
                            // Get preview value from metadata
                            const getFieldValue = (obj: any, path: string): any => {
                              const parts = path.split('.');
                              let value = obj;
                              for (const part of parts) {
                                if (value && typeof value === 'object') {
                                  value = value[part];
                                } else {
                                  return undefined;
                                }
                              }
                              return value;
                            };

                            const previewValue = getFieldValue(pdfMetadata, field);
                            const displayValue = previewValue !== undefined && previewValue !== null
                              ? String(previewValue).substring(0, 30) + (String(previewValue).length > 30 ? '...' : '')
                              : '—';

                            return (
                              <div key={field} className="grid grid-cols-[1fr_auto_1fr] gap-2 py-2 border-b border-border/30 hover:bg-muted/20 transition-colors rounded px-2 -mx-2">
                                {/* Source Field Column */}
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-xs font-mono font-medium text-foreground truncate">
                                    {field}
                                  </span>
                                  <span className="text-[10px] font-mono text-muted-foreground truncate" title={String(previewValue || '')}>
                                    {displayValue}
                                  </span>
                                </div>

                                {/* Arrow */}
                                <div className="flex items-center justify-center pt-1">
                                  <span className="text-xs text-blue-600 dark:text-blue-400">→</span>
                                </div>

                                {/* Target Column */}
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <Input
                                    value={pdfFieldMappings[field] || columnName}
                                    onChange={(e) => handleFieldMappingChange(field, e.target.value)}
                                    placeholder="column_name"
                                    className="text-xs font-mono h-6 px-2 py-1 w-full min-w-0 bg-background/50"
                                  />
                                  <span className="text-[10px] text-muted-foreground">
                                    {typeof previewValue === 'number' ? 'NUMBER' :
                                     typeof previewValue === 'boolean' ? 'BOOLEAN' :
                                     Array.isArray(previewValue) ? 'ARRAY' :
                                     typeof previewValue === 'object' ? 'JSON' : 'TEXT'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </ScrollArea>

                  {/* Quick Actions - Removed tip section for more field name space */}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-2">
                  <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No metadata available yet</p>
                  <p className="text-xs text-muted-foreground">Run "Analyze" to extract metadata</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transform" className="mt-0">
          <div className="h-[360px] p-4 flex flex-col">
            {pdfSelectedFields.size > 0 ? (
              <>
                {/* Table Name Confirmation */}
                <div className="flex-shrink-0 mb-3">
                  <Label className="text-xs font-medium text-muted-foreground block">
                    Table: <span className="font-mono text-foreground">{pdfTableName || getDefaultTableName()}</span>
                    <span className="ml-2 text-muted-foreground/70">({pdfSelectedFields.size} columns)</span>
                  </Label>
                </div>

                {/* Two Column Layout: Progress | SQL Schema */}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 flex-1 min-h-0">
                  {/* LEFT COLUMN: Transform Progress */}
                  <div className="flex flex-col border-r pr-4 h-full overflow-hidden items-center justify-center">
                    {pdfTransformJobId && !pdfTransformComplete ? (
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <ProgressCircle
                          progress={pdfTransformProgress || 0}
                          showPulse={true}
                          size={150}
                        />
                        <div className="text-center space-y-1">
                          <p className="text-sm font-medium text-foreground">{pdfTransformStatus || 'Processing...'}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">Creating Table</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-2">
                        <div className="w-24 h-24 mx-auto rounded-full border-4 border-muted flex items-center justify-center">
                          <Database className="w-10 h-10 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">Ready to Create Table</p>
                        <p className="text-xs text-muted-foreground px-4">
                          {pdfSelectedFields.size} fields mapped
                        </p>
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN: SQL Schema Preview */}
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
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
                    <ScrollArea className="flex-1 min-h-0 bg-muted/30 dark:bg-black/50 border border-border rounded p-3">
                      <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {generateSQLSchema()}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-2">
                  <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No fields mapped</p>
                  <p className="text-xs text-muted-foreground">
                    Go to "Map Fields" tab to select and configure field mappings
                  </p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  // Reset CSV visible rows when modal opens or document changes
  useEffect(() => {
    if (isOpen && document) {
      setCsvVisibleRows(CSV_ROWS_PER_PAGE);

      // ✅ UX: Show loading spinner if CSV/JSON data is not yet loaded
      const isCSVorJSON = document.type === 'csv' || document.type === 'json';
      const dataNotLoaded = !document.metadata?._loaded && document.metadata?.source;
      setCsvLoading(isCSVorJSON && dataNotLoaded); // Show spinner until data arrives
    }
  }, [isOpen, document?.id, document?.metadata?._loaded]);

  if (!document) return null;

  const fileType = document.type.toLowerCase();
  const isCSV = fileType === 'csv';
  const isJSON = fileType === 'json';
  const isPDF = fileType === 'pdf' ||
                document.file_type === 'application/pdf' ||
                document.title?.toLowerCase().endsWith('.pdf');
  const isText = ['txt', 'md', 'doc', 'docx'].includes(fileType);

  return (
    <React.Fragment>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-fit p-0 gap-0 overflow-hidden flex flex-col">
        {/* Modal Header - Glassmorphic */}
        <div className="flex-shrink-0 bg-background/95 backdrop-blur-xl border-b border-border/50 px-6 py-4">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-base font-bold">{document.title}</DialogTitle>
              <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0.5">
                {document.type.toUpperCase()}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-medium">
                {formatFileSize(document.size)}
              </span>
              {/* Template Info Badge */}
              {document?.metadata?.lastAnalysis?.template && (
                <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                  Template: {document.metadata.lastAnalysis.template}
                </Badge>
              )}
              {/* LLM Info - Next to File Size (same size) */}
              {isPDF && activeLLM && (
                <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                  {activeLLM.provider === 'gemini' ? 'Gemini' : activeLLM.provider === 'deepseek' ? 'DeepSeek' : activeLLM.provider === 'claude' ? 'Claude' : activeLLM.provider}
                </Badge>
              )}
            </div>
          </div>
          <DialogDescription className="sr-only">
            Preview of {document.title}
          </DialogDescription>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="overflow-hidden px-6 py-4">
          {/* CSV: Tabbed View */}
          {isCSV && (
            <div className="relative">
              {/* Loading Overlay */}
              {csvLoading && (
                <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                    <p className="text-sm font-medium text-foreground">Parsing CSV...</p>
                    <p className="text-xs text-muted-foreground mt-1">This may take a moment for large files</p>
                  </div>
                </div>
              )}

              <Tabs defaultValue="table" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="table" disabled={csvLoading}>
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="graphql" disabled={csvLoading}>
                    Transform
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="table" className="mt-0">
                  <div className="h-[380px]">
                    {renderCSVTable()}
                  </div>
                </TabsContent>

                <TabsContent value="graphql" className="mt-0">
                  <div className="h-[380px]">
                    {renderGraphQLTransform()}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* JSON: Tree View */}
          {isJSON && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Code className="w-4 h-4" />
                  <span>JSON Tree View (First 10 Records)</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(document.content)}
                >
                  <Copy className="w-3 h-3 mr-2" />
                  Copy Raw
                </Button>
              </div>
              {renderJSONTree()}
            </div>
          )}

          {/* Text/MD/DOC: Raw Text */}
          {isText && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>Text Preview</span>
              </div>
              {renderTextView()}
            </div>
          )}

          {/* PDF: Tabs (Preview, Metadata, Transform) */}
          {isPDF && renderPDFTabs()}

          {/* Default: Raw Content */}
          {!isCSV && !isJSON && !isText && !isPDF && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>Preview</span>
              </div>
              {renderTextView()}
            </div>
          )}
        </div>

        {/* Modal Footer - Fixed */}
        <div className="flex-shrink-0 bg-background/95 backdrop-blur-xl border-t border-border/50 px-6 py-2.5">
          <div className="flex items-center justify-between">
            {/* Left side: Compact single-line info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isCSV && parsedData && csvHeaders && (
                <div className="flex items-center gap-2">
                  {/* Show preview count / total count */}
                  <span>
                    <span className="font-semibold text-foreground">{csvVisibleRows}</span>
                    {' / '}
                    <span className="font-semibold text-foreground">{graphqlData?.rowCount || parsedData.length}</span>
                    {' rows'}
                    {graphqlData?.rowCount && graphqlData.rowCount > parsedData.length && (
                      <span className="text-muted-foreground ml-1">(total)</span>
                    )}
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{csvHeaders?.length || 0}</span> columns
                    {!isEditingHeaders ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditingHeaders(true);
                          setEditableHeaders([...csvHeaders]);
                        }}
                        className="h-5 w-5 p-0 hover:bg-muted/50"
                        title="Edit column headers"
                      >
                        <Edit3 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={saveEditedHeaders}
                          className="h-5 w-5 p-0 hover:bg-green-100 dark:hover:bg-green-900/20"
                          title="Save headers"
                        >
                          <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsEditingHeaders(false);
                            setEditableHeaders([...csvHeaders]);
                          }}
                          className="h-5 w-5 p-0 hover:bg-red-100 dark:hover:bg-red-900/20"
                          title="Cancel editing"
                        >
                          <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        </Button>
                      </div>
                    )}
                  </span>
                  {config?.database?.name && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <span className="font-mono font-semibold text-foreground">{config.database.name}</span>
                    </>
                  )}
                </div>
              )}
              {isPDF && pdfMetadata && (
                <>
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />
                    <span><span className="font-bold text-foreground">{pdfSelectedFields.size}</span> / <span className="font-bold text-foreground">{Object.keys(pdfMetadata).length}</span> fields selected</span>
                  </div>
                  {config?.database?.name && (
                    <>
                      <div className="w-px h-3 bg-border" />
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3 h-3" />
                        <span className="font-mono font-semibold text-foreground">{config.database.name}</span>
                      </div>
                    </>
                  )}
                </>
              )}
              {!isCSV && !isPDF && (
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3" />
                  <span>Document ID: <span className="font-mono font-semibold text-foreground">{document.id}</span></span>
                </div>
              )}
            </div>

            {/* Right side: Action buttons based on tab */}
            <div className="flex items-center gap-1.5">
              {/* CSV: Transform button (only when not editing) */}
              {isCSV && !isEditingHeaders && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    // Switch to transform tab in the Tabs component
                    const transformTab = document.querySelector('[value="graphql"]') as HTMLElement;
                    if (transformTab) transformTab.click();
                  }}
                  className="h-7 px-3 gap-1.5 text-xs"
                >
                  Transform
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}

              {/* CSV: Load More button (only when not editing) */}
              {isCSV && !isEditingHeaders && parsedData && csvVisibleRows < parsedData.length && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCsvVisibleRows(prev => prev + CSV_ROWS_PER_PAGE)}
                  className="h-7 px-3 gap-2 text-xs"
                >
                  <span>Load More</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{Math.min(CSV_ROWS_PER_PAGE, (parsedData?.length || 0) - csvVisibleRows)}
                  </Badge>
                </Button>
              )}

              {/* Preview Tab: Template Dropdown + Custom Keywords + Analyze button */}
              {isPDF && pdfActiveTab === 'preview' && pdfExtractedText && (
                <>
                  <Select
                    value={selectedTemplate}
                    onValueChange={setSelectedTemplate}
                  >
                    <SelectTrigger className="h-7 w-40 text-[11px]">
                      <SelectValue placeholder="Select Template..." />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]" position="popper" sideOffset={4}>
                      {analysisTemplates.length > 0 ? (
                        analysisTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id} className="text-xs">
                            {template.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="general" className="text-xs">General Document</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {/* Template Detection Indicator */}
                  {templateDetecting ? (
                    <Badge variant="outline" className="h-8 text-xs px-2 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Detecting...
                    </Badge>
                  ) : detectedTemplate && (
                    <Badge variant="outline" className="h-8 text-xs px-2 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Auto: {detectedTemplate.confidence}%
                    </Badge>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleAnalyzeMetadata}
                    className="h-8 px-3"
                  >
                    {pdfMetadata ? 'Re-Analyze' : 'Analyze'}
                  </Button>
                </>
              )}

              {/* Map Fields Tab: Continue to Create Table button */}
              {isPDF && pdfActiveTab === 'map' && pdfMetadata && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleContinueToTransform}
                  disabled={pdfSelectedFields.size === 0}
                  className="h-8 px-3"
                >
                  Continue to Create Table
                </Button>
              )}

              {/* Create Table Tab: Transform button */}
              {isPDF && pdfActiveTab === 'transform' && pdfMetadata && pdfSelectedFields.size > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePDFTransform}
                  disabled={
                    pdfProcessing ||
                    pdfSelectedFields.size === 0 ||
                    !pdfTableName
                  }
                  className="h-8 px-3"
                >
                  {pdfProcessing ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Database className="w-3 h-3 mr-1" />
                      Create Table & Insert Data
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </React.Fragment>
  );
}
