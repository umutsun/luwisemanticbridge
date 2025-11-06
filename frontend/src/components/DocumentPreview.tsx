'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Download, Copy, FileText, Table as TableIcon, FileJson, Code, Image as ImageIcon, ChevronLeft, ChevronRight, Maximize2, Minimize2, RotateCcw, X } from 'lucide-react';

interface DocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    id: string;
    title: string;
    type: string;
    size: number;
    content: string;
    source?: string;
    metadata?: any;
  };
}

interface JsonStats {
  depth: number;
  arrayCount: number;
  objectCount: number;
  maxArrayLength: number;
  primitiveCount: number;
}

interface CsvStats {
  totalRows: number;
  totalColumns: number;
  columnTypes: Array<{
    name: string;
    type: string;
    nullCount: number;
    uniqueValues: any;
  }>;
  numericColumns: Array<{
    avg: number;
    max: number;
    min: number;
    name: string;
  }>;
  categoricalColumns: Array<{
    name: string;
    uniqueCount: number;
    uniqueValues: string[];
  }>;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({ isOpen, onClose, document }) => {
  const [jsonData, setJsonData] = useState<any>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvStats, setCsvStats] = useState<CsvStats | null>(null);
  const [jsonStats, setJsonStats] = useState<JsonStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scale, setScale] = useState(100);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Extract actual content from processed document
  const extractActualContent = (content: string) => {
    const lines = content.split('\n');
    const jsonLines: string[] = [];
    let inJsonBlock = false;
    let jsonIndentation = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Look for JSON structure
      if (trimmed.startsWith('{') || trimmed.startsWith('}')) {
        if (trimmed.startsWith('{')) {
          jsonIndentation = line.length - line.trimStart().length;
          inJsonBlock = true;
        }
        if (inJsonBlock) {
          jsonLines.push(line);
        }

        // Check if we're ending the JSON block
        if (trimmed === '}' && jsonIndentation > 0) {
          jsonIndentation--;
          if (jsonIndentation === 0) {
            inJsonBlock = false;
          }
        }
      } else if (trimmed.startsWith('"') && trimmed.endsWith('"') && inJsonBlock) {
        // Continue adding content within JSON structure
        jsonLines.push(line);
      }
    }

    return jsonLines.join('\n');
  };

  useEffect(() => {
    if (!isOpen || !document) return;

    const parseContent = () => {
      setIsLoading(true);

      try {
        if (document.type === 'json') {
          const actualContent = extractActualContent(document.content);

          // Try to parse the extracted JSON content
          try {
            const parsed = JSON.parse(actualContent);
            setJsonData(parsed);

            // Extract JSON stats from metadata if available
            if (document.metadata?.jsonStats) {
              setJsonStats(document.metadata.jsonStats);
            }
          } catch (parseError) {
            console.error('Failed to parse JSON:', parseError);
            // Show the raw content as fallback
            setJsonData({ raw: actualContent });
          }
        } else if (document.type === 'csv') {
          console.log('Parsing CSV content...');
          console.log('Raw content preview:', document.content.substring(0, 500));
          console.log('Document source:', document.source);

          // Extract CSV stats from metadata if available
          if (document.metadata?.csvStats) {
            setCsvStats(document.metadata.csvStats);
          }

          let content = document.content;

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
                  const pairs = firstRecord.split(/,\s*(?![^{]*\})/);
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
                      const value = valueParts.join('=').trim();
                      obj[key.trim()] = value;
                    });
                    return obj;
                  }).filter(Boolean);

                  setCsvData(data);
                  console.log('[CSV Parser] Successfully parsed processed CSV:', {
                    headers: headers.length,
                    rows: data.length
                  });
                  return;
                }
              }
            }

            // If we couldn't extract from processed format, try metadata
            console.log('[CSV Parser] Could not extract from processed format, checking metadata...');
            if (document.metadata?.dataStructure?.headers) {
              setCsvHeaders(document.metadata.dataStructure.headers);
              console.log('[CSV Parser] Using headers from metadata');
            }
          }

          // Standard CSV parsing (for raw CSV or fallback)
          console.log('[CSV Parser] Using standard CSV parsing...');

          // Proper CSV parsing function that handles quoted fields with commas
          const parseCSVLine = (line: string): string[] => {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              const nextChar = line[i + 1];

              if (char === '"') {
                if (inQuotes && nextChar === '"') {
                  // Escaped quote
                  current += '"';
                  i++; // Skip next quote
                } else {
                  // Toggle quote mode
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                // Field separator
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }

            // Add last field
            result.push(current.trim());
            return result;
          };

          const lines = content.split('\n').filter(line => line.trim());

          console.log(`CSV lines found: ${lines.length}`);

          if (lines.length > 0) {
            // First line is headers
            const headers = parseCSVLine(lines[0]);
            setCsvHeaders(headers);

            console.log('CSV Headers:', headers);
            console.log('Column count:', headers.length);

            // Parse data rows (skip header, take first 10 rows for preview)
            const dataRows = lines.slice(1, 11); // First 10 data rows

            const data = dataRows.map(row => {
              const values = parseCSVLine(row);
              const obj: any = {};
              headers.forEach((header, index) => {
                obj[header] = values[index] || '';
              });
              return obj;
            });

            console.log('CSV Data parsed:', data.length, 'rows');
            console.log('Sample row:', data[0]);
            setCsvData(data);
          }
        }
      } catch (error) {
        console.error('Error parsing document content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    parseContent();
  }, [isOpen, document]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([document.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = document.title;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderJsonContent = () => {
    if (!jsonData) return <div className="text-gray-500">No JSON data to display</div>;

    // If it's an array of objects, render as table (first 10 records)
    if (Array.isArray(jsonData) && jsonData.length > 0 && typeof jsonData[0] === 'object') {
      const records = jsonData.slice(0, 10);
      const headers = Object.keys(records[0]);

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {records.length} of {jsonData.length} records (Preview only)</span>
          </div>
          <ScrollArea className="h-96 w-full">
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="px-4 py-3 text-left font-medium border-b">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      {headers.map((header) => (
                        <td key={header} className="px-4 py-3">
                          {typeof record[header] === 'object'
                            ? JSON.stringify(record[header])
                            : String(record[header] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>
      );
    }

    if (typeof jsonData === 'string' && jsonData.raw) {
      return (
        <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm overflow-x-auto">
          <pre>{jsonData.raw}</pre>
        </div>
      );
    }

    const renderJson = (obj: any, indent: number = 0) => {
      const indentStr = '  '.repeat(indent);

      if (obj === null || obj === undefined) {
        return <span className="text-gray-500">null</span>;
      }

      if (typeof obj === 'string') {
        return <span className="text-blue-400">"{obj}"</span>;
      }

      if (typeof obj === 'number') {
        return <span className="text-purple-400">{obj}</span>;
      }

      if (typeof obj === 'boolean') {
        return <span className="text-yellow-400">{obj}</span>;
      }

      if (Array.isArray(obj)) {
        if (obj.length === 0) return <span className="text-gray-500">[]</span>;

        return (
          <span>
            <span className="text-gray-500">[</span>
            <div className="ml-4">
              {obj.map((item, index) => (
                <div key={index} className="flex">
                  {renderJson(item, indent + 1)}
                  {index < obj.length - 1 && <span className="text-gray-500 mx-1">,</span>}
                </div>
              ))}
            </div>
            <span>{indentStr}</span>
            <span className="text-gray-500">]</span>
          </span>
        );
      }

      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return <span className="text-gray-500">{{}}</span>;

        return (
          <span>
            <span className="text-gray-500">{'{'}</span>
            <div className="ml-4">
              {keys.map((key, index) => (
                <div key={key} className="flex">
                  <span className="text-orange-400">"{key}"</span>
                  <span className="text-gray-500 mx-1">:</span>
                  <span className="mx-1">{renderJson(obj[key], indent + 1)}</span>
                  {index < keys.length - 1 && <span className="text-gray-500 mx-1">,</span>}
                </div>
              ))}
            </div>
            <span>{indentStr}</span>
            <span className="text-gray-500">{'}'}</span>
          </span>
        );
      }

      return String(obj);
    };

    return (
      <ScrollArea className="h-96 w-full">
        <div className="bg-gray-900 text-white p-4 rounded-md font-mono text-sm overflow-x-auto">
          {renderJson(jsonData)}
        </div>
      </ScrollArea>
    );
  };

  const renderCsvContent = () => {
    // Loading state with skeleton
    if (isLoading) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          </div>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {[...Array(5)].map((_, i) => (
                    <th key={i} className="px-4 py-3">
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...Array(10)].map((_, rowIndex) => (
                  <tr key={rowIndex} className="border-b">
                    {[...Array(5)].map((_, colIndex) => (
                      <td key={colIndex} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (!csvHeaders.length && !csvData.length) {
      return <div className="text-gray-500 text-center py-8">No CSV data to display</div>;
    }

    const previewData = csvData.slice(0, 10);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {previewData.length} of {csvData.length} rows (Preview only)</span>
          <span>{csvHeaders.length} columns</span>
        </div>
        <ScrollArea className="h-96 w-full">
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {csvHeaders.map((header, index) => (
                    <th key={index} className="px-4 py-3 text-left font-medium border-b whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b hover:bg-muted/30 transition-colors">
                    {csvHeaders.map((header, colIndex) => (
                      <td key={colIndex} className="px-4 py-3 whitespace-nowrap">
                        {row[header] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </div>
    );
  };

  const renderStats = () => {
    if (document.type === 'json' && jsonStats) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Depth</p>
            <p className="text-xl font-semibold">{jsonStats.depth}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Objects</p>
            <p className="text-xl font-semibold">{jsonStats.objectCount}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Arrays</p>
            <p className="text-xl font-semibold">{jsonStats.arrayCount}</p>
          </div>
        </div>
      );
    }

    if (document.type === 'csv' && csvStats) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Rows</p>
            <p className="text-xl font-semibold">{csvStats.totalRows}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Columns</p>
            <p className="text-xl font-semibold">{csvStats.totalColumns}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Numeric</p>
            <p className="text-xl font-semibold">{csvStats.numericColumns.length}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Text</p>
            <p className="text-xl font-semibold">{csvStats.columnTypes.filter(c => c.type === 'text').length}</p>
          </div>
        </div>
      );
    }

    return null;
  };

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div
        className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] border border-white/20 dark:border-gray-700/50"
        style={{ transform: `scale(${scale / 100})` }}
      >
        <Card className="h-full flex flex-col border-0 rounded-2xl bg-transparent">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <CardTitle className="text-lg truncate max-w-md">{document.title}</CardTitle>
                <Badge variant="outline">{document.type.toUpperCase()}</Badge>
                {document.metadata?.source === 'physical' && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Physical File
                  </Badge>
                )}
                <span className="text-sm text-gray-500">{formatFileSize(document.size)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 mr-2">{scale}%</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScale(Math.max(50, scale - 10))}
                  title="Zoom Out"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScale(100)}
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScale(Math.min(150, scale + 10))}
                  title="Zoom In"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-6 overflow-hidden">
            {renderStats()}

            <Tabs defaultValue="table" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="table">
                  <TableIcon className="w-4 h-4 mr-2" />
                  Table View
                </TabsTrigger>
                <TabsTrigger value="format">
                  <Code className="w-4 h-4 mr-2" />
                  {document.type === 'csv' ? 'CSV Format' : 'JSON Format'}
                </TabsTrigger>
                <TabsTrigger value="graphql">
                  <FileJson className="w-4 h-4 mr-2" />
                  GraphQL
                </TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="mt-4">
                {document.type === 'json' && renderJsonContent()}
                {document.type === 'csv' && renderCsvContent()}
                {document.type === 'pdf' && (
                  <div className="h-96 w-full flex items-center justify-center bg-gray-50 rounded-md">
                    <div className="text-center space-y-4">
                      <FileText className="h-16 w-16 text-red-600 mx-auto" />
                      <div>
                        <p className="text-lg font-medium">PDF Document</p>
                        <p className="text-sm text-gray-500">{document.title}</p>
                      </div>
                      <Button onClick={handleDownload} variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Download to View
                      </Button>
                    </div>
                  </div>
                )}
                {['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(document.type.toLowerCase()) && document.metadata?.source && (
                  <div className="h-96 w-full overflow-auto bg-gray-50 rounded-md flex items-center justify-center">
                    <img
                      src={document.metadata.source}
                      alt={document.title}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML = '<div class="text-center"><p class="text-red-500">Failed to load image</p></div>';
                        }
                      }}
                    />
                  </div>
                )}
                {document.type === 'txt' && (
                  <ScrollArea className="h-96 w-full">
                    <div className="bg-gray-50 p-4 rounded-md">
                      <pre className="whitespace-pre-wrap text-sm font-mono">{document.content}</pre>
                    </div>
                  </ScrollArea>
                )}
                {!['json', 'csv', 'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(document.type.toLowerCase()) && (
                  <div className="h-96 w-full flex items-center justify-center bg-gray-50 rounded-md">
                    <div className="text-center space-y-4">
                      <FileText className="h-16 w-16 text-gray-400 mx-auto" />
                      <div>
                        <p className="text-lg font-medium">Preview Not Available</p>
                        <p className="text-sm text-gray-500">File type: {document.type.toUpperCase()}</p>
                      </div>
                      <Button onClick={handleDownload} variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Download File
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="format" className="mt-4">
                <ScrollArea className="h-96 w-full">
                  <div className="relative">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(document.content)}
                      className="absolute top-2 right-2 z-10"
                      title="Copy to Clipboard"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <div className="bg-gray-900 text-gray-100 p-4 rounded-md">
                      <pre className="whitespace-pre-wrap text-sm font-mono">{document.content}</pre>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="graphql" className="mt-4">
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-2 flex items-center">
                      <FileJson className="w-4 h-4 mr-2" />
                      GraphQL Query Example
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Use this query to fetch data from this document via GraphQL API
                    </p>

                    {document.type === 'csv' && (
                      <div className="space-y-3">
                        <div className="relative">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopy(`query GetCsvData {
  document(id: "${document.id}") {
    id
    title
    type
    content
    metadata {
      csvStats {
        totalRows
        totalColumns
        columnTypes {
          name
          type
          nullCount
        }
      }
    }
  }
}`)}
                            className="absolute top-2 right-2 z-10 bg-white dark:bg-gray-800"
                            title="Copy Query"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <ScrollArea className="h-64 w-full">
                            <pre className="bg-gray-900 text-gray-100 p-4 rounded-md text-xs font-mono">
{`query GetCsvData {
  document(id: "${document.id}") {
    id
    title
    type
    content
    metadata {
      csvStats {
        totalRows
        totalColumns
        columnTypes {
          name
          type
          nullCount
        }
        numericColumns {
          name
          avg
          min
          max
        }
      }
    }
  }
}`}
                            </pre>
                          </ScrollArea>
                        </div>
                      </div>
                    )}

                    {document.type === 'json' && (
                      <div className="space-y-3">
                        <div className="relative">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopy(`query GetJsonData {
  document(id: "${document.id}") {
    id
    title
    type
    content
    metadata {
      jsonStats {
        depth
        arrayCount
        objectCount
        maxArrayLength
        primitiveCount
      }
    }
  }
}`)}
                            className="absolute top-2 right-2 z-10 bg-white dark:bg-gray-800"
                            title="Copy Query"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <ScrollArea className="h-64 w-full">
                            <pre className="bg-gray-900 text-gray-100 p-4 rounded-md text-xs font-mono">
{`query GetJsonData {
  document(id: "${document.id}") {
    id
    title
    type
    content
    metadata {
      jsonStats {
        depth
        arrayCount
        objectCount
        maxArrayLength
        primitiveCount
      }
    }
  }
}`}
                            </pre>
                          </ScrollArea>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-2">GraphQL Endpoint</h4>
                    <code className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/graphql
                    </code>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-2">Authentication</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      Include your JWT token in the Authorization header:
                    </p>
                    <code className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded block">
                      Authorization: Bearer YOUR_JWT_TOKEN
                    </code>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DocumentPreview;