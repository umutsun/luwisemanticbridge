/**
 * Document Preview Modal Component
 * Dynamic tabs based on file type:
 * - CSV: Table view (10 rows)
 * - JSON: Tree view (10 records, collapsable)
 * - Text/MD/DOC: Raw text
 * - PDF: OCR redirect
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { executeQuery, executeMutation } from '@/lib/graphql/client';
import { GET_DOCUMENT_PREVIEW, TRANSFORM_DOCUMENTS_TO_SOURCE_DB, type DocumentPreview as GraphQLDocumentPreview } from '@/lib/graphql/documents.queries';
import { GraphQLTransformTab } from './DocumentTransformModal';
import { useConfig } from '@/contexts/ConfigContext';

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
  const [parsedData, setParsedData] = useState<any>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [totalRowCount, setTotalRowCount] = useState<number>(0); // Total rows in CSV (for large files)
  const [isGenerating, setIsGenerating] = useState(false);
  const [sqlPreview, setSqlPreview] = useState<string>('');
  const [graphqlData, setGraphqlData] = useState<GraphQLDocumentPreview | null>(null);
  const [showSQL, setShowSQL] = useState(false);
  const [batchSize, setBatchSize] = useState(50); // Batch size for insert operations
  const [tableName, setTableName] = useState<string>(''); // User-editable table name
  const [jobId, setJobId] = useState<string | null>(null); // Job ID for progress tracking

  useEffect(() => {
    if (document && document.content) {
      parseContent();
      // Auto-fetch GraphQL data for CSV to get total row count
      if (document.type === 'csv' && document.id) {
        fetchGraphQLData();
      }
    }
  }, [document]);

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
        parseCSV();
      } else if (document.type === 'json') {
        parseJSON();
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: 'Parse Error',
        description: 'Failed to parse document content',
        variant: 'destructive',
      });
    }
  };

  const parseCSV = () => {
    let content = document!.content;

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
        setCsvHeaders(document!.metadata.dataStructure.headers);
        console.log('[CSV Parser] Using headers from metadata');
      }
    }

    // Standard CSV parsing (for raw CSV or fallback)
    console.log('[CSV Parser] Using standard CSV parsing...');
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;

    const parseCSVLine = (line: string): string[] => {
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
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    setCsvHeaders(headers);

    // Count total rows (excluding header)
    const totalRows = lines.length - 1;
    setTotalRowCount(totalRows);

    // For performance: Only parse first 10 rows for preview
    // But keep total count for accurate stats
    const dataRows = lines.slice(1, 11); // First 10 rows
    const data = dataRows.map(row => {
      const values = parseCSVLine(row);
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });

    setParsedData(data);
    console.log('[CSV Parser] Standard CSV parse complete:', {
      headers: headers.length,
      rows: data.length
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

      const sourceDbName = config.database.name || 'rag_chatbot';

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

  // CSV Table View with Generate Table Section
  const renderCSVTable = () => {
    if (!parsedData || parsedData.length === 0) {
      return <div className="text-muted-foreground text-center py-8">No data available</div>;
    }

    const truncateText = (text: string, maxLength: number = 60) => {
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

    // Show first 10 rows for preview (performance optimization)
    const displayedRows = parsedData.slice(0, 10);

    return (
      <TooltipProvider delayDuration={300}>
        <div className="h-full overflow-hidden">
          <div className="h-full overflow-auto scrollbar-thin mt-2">
            <Table className="w-auto min-w-full">
              <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <TableRow>
                  {csvHeaders.map((header, idx) => (
                    <TableHead
                      key={idx}
                      className="font-medium text-foreground px-4 py-3 whitespace-nowrap text-sm"
                    >
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRows.map((row: any, rowIdx: number) => (
                  <TableRow
                    key={rowIdx}
                    className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    {csvHeaders.map((header, colIdx) => {
                      const cellValue = String(row[header] || '');
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
                              <div className="max-w-[200px] truncate text-foreground/90 cursor-help">
                                {truncateText(row[header], 50)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-md break-words bg-popover text-popover-foreground border border-border shadow-lg"
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

  // PDF OCR View
  const renderPDFView = () => {
    return (
      <div className="flex flex-col items-center justify-center h-[450px] space-y-4">
        <Scan className="w-16 h-16 text-muted-foreground" />
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">PDF Document</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            PDF files need to be processed with OCR to extract text content.
          </p>
        </div>
        <Button>
          <Scan className="w-4 h-4 mr-2" />
          Process with OCR
        </Button>
      </div>
    );
  };

  if (!document) return null;

  const fileType = document.type.toLowerCase();
  const isCSV = fileType === 'csv';
  const isJSON = fileType === 'json';
  const isPDF = fileType === 'pdf';
  const isText = ['txt', 'md', 'doc', 'docx'].includes(fileType);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-fit p-0 gap-0 overflow-hidden flex flex-col">
        {/* Modal Header - Fixed */}
        <div className="flex-shrink-0 bg-background border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <DialogTitle className="text-base font-bold">{document.title}</DialogTitle>
            <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0.5">
              {document.type.toUpperCase()}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-medium">
              {formatFileSize(document.size)}
            </span>
          </div>
          <DialogDescription className="sr-only">
            Preview of {document.title}
          </DialogDescription>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="overflow-hidden px-6 py-4">
          {/* CSV: Tabbed View */}
          {isCSV && (
            <Tabs defaultValue="table" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-3">
                <TabsTrigger value="table">
                  Preview
                </TabsTrigger>
                <TabsTrigger value="graphql">
                  Transform
                </TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="mt-0">
                <div className="h-[360px]">
                  {renderCSVTable()}
                </div>
              </TabsContent>

              <TabsContent value="graphql" className="mt-0">
                <div className="h-[360px]">
                  {renderGraphQLTransform()}
                </div>
              </TabsContent>
            </Tabs>
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

          {/* PDF: OCR Redirect */}
          {isPDF && renderPDFView()}

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
        <div className="flex-shrink-0 bg-muted/50 dark:bg-black/30 border-t border-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              {isCSV && parsedData && csvHeaders && (
                <>
                  <div className="flex items-center gap-1.5">
                    {graphqlData?.rowCount && graphqlData.rowCount > parsedData.length ? (
                      <span>Previewing <span className="font-bold text-foreground">{parsedData.length}</span> / <span className="font-bold text-foreground">{graphqlData.rowCount}</span> rows</span>
                    ) : (
                      <span><span className="font-bold text-foreground">{parsedData.length}</span> rows</span>
                    )}
                  </div>
                  <div className="w-px h-3 bg-border" />
                  <div className="flex items-center gap-1.5">
                    <span><span className="font-bold text-foreground">{csvHeaders.length}</span> columns</span>
                  </div>
                  <div className="w-px h-3 bg-border" />
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3 h-3" />
                    <span className="font-mono font-semibold text-foreground">{config?.database?.name || 'rag_chatbot'}</span>
                  </div>
                </>
              )}
              {!isCSV && (
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3" />
                  <span>Document ID: <span className="font-mono font-semibold text-foreground">{document.id}</span></span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
