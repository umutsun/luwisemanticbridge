'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Download, Copy, FileText, Table, FileJson, Code, Image, ChevronLeft, ChevronRight, Maximize2, Minimize2, RotateCcw } from 'lucide-react';

interface DocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    id: string;
    title: string;
    type: string;
    size: number;
    content: string;
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
          // Parse CSV content - look for the structured data part
          const actualContent = extractActualContent(document.content);

          // Try to extract CSV table from the processed content
          if (document.metadata?.csvStats) {
            setCsvStats(document.metadata.csvStats);
          }

          // Simple CSV parsing for preview
          const lines = actualContent.split('\n').filter(line => line.trim());
          if (lines.length > 0) {
            // First line might be headers
            const headerLine = lines[0];
            const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
            setCsvHeaders(headers);

            // Parse data rows (skip header and metadata lines)
            const dataRows = lines.slice(1).filter(line =>
              line.trim() &&
              !line.includes('---') &&
              !line.toLowerCase().includes('overview') &&
              !line.toLowerCase().includes('column analysis')
            );

            const data = dataRows.map(row => {
              const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
              const obj: any = {};
              headers.forEach((header, index) => {
                obj[header] = values[index] || '';
              });
              return obj;
            });

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
    if (!csvHeaders.length && !csvData.length) {
      return <div className="text-gray-500">No CSV data to display</div>;
    }

    return (
      <ScrollArea className="h-96 w-full">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                {csvHeaders.map((header, index) => (
                  <th key={index} className="border border-gray-300 px-4 py-2 text-left font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csvData.slice(0, 50).map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  {csvHeaders.map((header, colIndex) => (
                    <td key={colIndex} className="border border-gray-300 px-4 py-2">
                      {row[header] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {csvData.length > 50 && (
            <div className="text-center text-gray-500 p-2">
              Showing first 50 rows of {csvData.length} total rows
            </div>
          )}
        </div>
      </ScrollArea>
    );
  };

  const renderStats = () => {
    if (document.type === 'json' && jsonStats) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Depth</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{jsonStats.depth}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Objects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{jsonStats.objectCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Arrays</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{jsonStats.arrayCount}</div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (document.type === 'csv' && csvStats) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{csvStats.totalRows}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Columns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{csvStats.totalColumns}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Numeric</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{csvStats.numericColumns.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Text</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{csvStats.columnTypes.filter(c => c.type === 'text').length}</div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return null;
  };

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh]"
        style={{ transform: `scale(${scale / 100})` }}
      >
        <Card className="h-full flex flex-col border-0 rounded-lg">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {document.type === 'json' && <FileJson className="h-5 w-5 text-green-500" />}
                  {document.type === 'csv' && <Table className="h-5 w-5 text-blue-500" />}
                  {document.type === 'txt' && <FileText className="h-5 w-5 text-gray-500" />}
                  <span className="text-sm font-medium text-gray-500">ID: {document.id}</span>
                </div>
                <CardTitle className="text-lg">{document.title}</CardTitle>
                <Badge variant="outline">{document.type.toUpperCase()}</Badge>
                <span className="text-sm text-gray-500">{formatFileSize(document.size)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScale(Math.max(50, scale - 10))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScale(100)}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScale(Math.min(150, scale + 10))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <Search className="h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>

            {renderStats()}

            <Tabs defaultValue="preview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="raw">Raw Content</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-4">
                {document.type === 'json' && renderJsonContent()}
                {document.type === 'csv' && renderCsvContent()}
                {document.type === 'txt' && (
                  <ScrollArea className="h-96 w-full">
                    <div className="bg-gray-50 p-4 rounded-md">
                      <pre className="whitespace-pre-wrap text-sm">{document.content}</pre>
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="raw" className="mt-4">
                <ScrollArea className="h-96 w-full">
                  <div className="bg-gray-100 p-4 rounded-md">
                    <pre className="whitespace-pre-wrap text-sm font-mono">{document.content}</pre>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DocumentPreview;