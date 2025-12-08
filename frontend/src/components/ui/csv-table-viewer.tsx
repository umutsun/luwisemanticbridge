'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Table,
  BarChart3,
  FileText,
  Maximize2,
  Minimize2,
  Plus,
  Edit3,
  Check,
  X,
  Sparkles,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';

interface CSVColumn {
  name: string;
  type: 'numeric' | 'text' | 'date';
  uniqueValues: number;
  nullCount: number;
}

interface CSVViewerProps {
  data: string;
  title?: string;
  className?: string;
  metadata?: {
    csvStats?: {
      totalRows: number;
      totalColumns: number;
      columnTypes: CSVColumn[];
    };
  };
  /** Enable header editing mode */
  editable?: boolean;
  /** Callback when headers are changed */
  onHeadersChange?: (headers: string[], hasHeaderRow: boolean) => void;
  /** Initial state - does the data have headers? */
  initialHasHeaders?: boolean;
}

export default function CSVTableViewer({
  data,
  title,
  className = "",
  metadata,
  editable = false,
  onHeadersChange,
  initialHasHeaders = true
}: CSVViewerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const defaultTitle = title || t('tableViewer.title');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<string>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [loadedRowsCount, setLoadedRowsCount] = useState(10);

  // Header editing state
  const [hasHeaderRow, setHasHeaderRow] = useState(initialHasHeaders);
  const [editableHeaders, setEditableHeaders] = useState<string[]>([]);
  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [isSuggestingHeaders, setIsSuggestingHeaders] = useState(false);

  const rowsPerPage = 50;

  // Parse CSV data
  const { headers, rows, stats, rawLines } = useMemo(() => {
    if (!data) return { headers: [], rows: [], stats: null, rawLines: [] };

    try {
      const lines = data.split('\n').filter(line => line.trim());
      if (lines.length === 0) return { headers: [], rows: [], stats: null, rawLines: [] };

      // If no header row, generate Column_1, Column_2, etc.
      let parsedHeaders: string[];
      let dataStartIndex: number;

      if (hasHeaderRow) {
        parsedHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        dataStartIndex = 1;
      } else {
        // Count columns from first data row
        const firstRowCols = lines[0].split(',').length;
        parsedHeaders = Array.from({ length: firstRowCols }, (_, i) => `Column_${i + 1}`);
        dataStartIndex = 0;
      }

      // Use editable headers if available
      const finalHeaders = editableHeaders.length === parsedHeaders.length
        ? editableHeaders
        : parsedHeaders;

      // Parse rows
      const rows = lines.slice(dataStartIndex).map((line, index) => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string | number> = { _id: index + 1 };
        finalHeaders.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return row;
      });

      // Calculate stats
      const stats = metadata?.csvStats || {
        totalRows: rows.length,
        totalColumns: finalHeaders.length,
        columnTypes: finalHeaders.map(header => {
          const values = rows.map(row => row[header]);
          const numericValues = values.filter(v => !isNaN(parseFloat(String(v))) && String(v) !== '');

          return {
            name: header,
            type: numericValues.length > values.length * 0.7 ? 'numeric' : 'text',
            uniqueValues: [...new Set(values)].length,
            nullCount: values.filter(v => !v || v === '').length
          };
        })
      };

      return { headers: finalHeaders, rows, stats, rawLines: lines };
    } catch (error) {
      console.error('Error parsing CSV:', error);
      return { headers: [], rows: [], stats: null, rawLines: [] };
    }
  }, [data, metadata, hasHeaderRow, editableHeaders]);

  // Initialize editable headers when data changes
  useEffect(() => {
    if (headers.length > 0 && editableHeaders.length === 0) {
      setEditableHeaders(headers);
    }
  }, [headers]);

  // Handle header change
  const handleHeaderChange = useCallback((index: number, value: string) => {
    const newHeaders = [...editableHeaders];
    newHeaders[index] = value;
    setEditableHeaders(newHeaders);
  }, [editableHeaders]);

  // Toggle header row mode
  const toggleHeaderRow = useCallback(() => {
    const newHasHeader = !hasHeaderRow;
    setHasHeaderRow(newHasHeader);
    setEditableHeaders([]); // Reset to trigger re-parse
    if (onHeadersChange) {
      onHeadersChange([], newHasHeader);
    }
  }, [hasHeaderRow, onHeadersChange]);

  // Save headers
  const saveHeaders = useCallback(() => {
    setIsEditingHeaders(false);
    if (onHeadersChange) {
      onHeadersChange(editableHeaders, hasHeaderRow);
    }
    toast({
      title: t('tableViewer.headersSaved') || 'Headers saved',
      duration: 2000
    });
  }, [editableHeaders, hasHeaderRow, onHeadersChange, toast, t]);

  // AI suggest headers
  const suggestHeaders = useCallback(async () => {
    if (rows.length === 0) return;

    setIsSuggestingHeaders(true);
    try {
      // Prepare sample data - first 5 rows
      const sampleData = rows.slice(0, 5).map(row => {
        const values: string[] = [];
        headers.forEach(h => {
          values.push(String(row[h] || ''));
        });
        return values;
      });

      const response = await apiClient.post('/documents/suggest-headers', {
        sampleData,
        columnCount: headers.length,
        currentHeaders: editableHeaders.length > 0 ? editableHeaders : headers
      });

      if (response.data.success && response.data.headers) {
        setEditableHeaders(response.data.headers);
        setIsEditingHeaders(true); // Enable editing so user can review
        toast({
          title: 'AI önerisi hazır',
          description: `${response.data.provider} ile ${response.data.headers.length} başlık önerildi`,
          duration: 3000
        });
      }
    } catch (error: any) {
      console.error('Failed to suggest headers:', error);
      toast({
        title: 'Öneri başarısız',
        description: error.message || 'LLM bağlantı hatası',
        variant: 'destructive',
        duration: 3000
      });
    } finally {
      setIsSuggestingHeaders(false);
    }
  }, [rows, headers, editableHeaders, toast]);

  // Filter and sort data
  const filteredAndSortedRows = useMemo(() => {
    let filtered = rows;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(row =>
        Object.values(row).some(value =>
          value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply column filter
    if (selectedColumn !== 'all') {
      filtered = filtered.filter(row =>
        row[selectedColumn] && row[selectedColumn].toString().trim() !== ''
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Handle numeric sorting
        const aNum = parseFloat(String(aVal));
        const bNum = parseFloat(String(bVal));

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Handle string sorting
        const aStr = aVal.toString().toLowerCase();
        const bStr = bVal.toString().toLowerCase();

        if (sortDirection === 'asc') {
          return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
        } else {
          return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
        }
      });
    }

    return filtered;
  }, [rows, searchTerm, selectedColumn, sortColumn, sortDirection]);

  // Pagination or Load More
  const totalPages = Math.ceil(filteredAndSortedRows.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedRows = filteredAndSortedRows.slice(0, loadedRowsCount); // Show up to loadedRowsCount rows
  const hasMore = loadedRowsCount < filteredAndSortedRows.length;

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
    setLoadedRowsCount(10); // Reset to initial preview count when filters change
  }, [searchTerm, selectedColumn, sortColumn]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };


  if (!stats) {
    return (
      <div className={`p-6 text-center text-muted-foreground ${className}`}>
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>{t('tableViewer.noDataAvailable')}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Table className="h-5 w-5" />
            {defaultTitle}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{stats.totalRows.toLocaleString()} {t('tableViewer.rows')}</span>
            <span>•</span>
            <span>{stats.totalColumns} {t('tableViewer.columns')}</span>
            <span>•</span>
            <span>{filteredAndSortedRows.length.toLocaleString()} {t('tableViewer.filtered')}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {editable && (
            <>
              {/* Toggle header row */}
              <Button
                variant={hasHeaderRow ? "default" : "outline"}
                size="sm"
                onClick={toggleHeaderRow}
                title={hasHeaderRow ? "Data has headers" : "No headers - click to add"}
                className="h-7 px-2 text-xs"
              >
                {hasHeaderRow ? "H" : "+H"}
              </Button>
              {/* AI Suggest headers */}
              <Button
                variant="ghost"
                size="sm"
                onClick={suggestHeaders}
                disabled={isSuggestingHeaders || rows.length === 0}
                className="h-7 w-7 p-0"
                title="AI ile başlık öner"
              >
                {isSuggestingHeaders ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
              </Button>
              {/* Edit/Save headers */}
              {isEditingHeaders ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={saveHeaders}
                  className="h-7 w-7 p-0"
                  title="Save headers"
                >
                  <Check className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingHeaders(true)}
                  className="h-7 w-7 p-0"
                  title="Edit headers"
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-7 w-7 p-0"
          >
            {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Column Analysis */}
      <div className="flex flex-wrap gap-2">
        {stats.columnTypes.map((col, index) => (
          <Badge
            key={index}
            variant={col.type === 'numeric' ? 'default' : 'secondary'}
            className="cursor-pointer hover:opacity-80"
            onClick={() => setSelectedColumn(col.name)}
          >
            {col.name}
            <span className="ml-1 text-xs opacity-75">
              ({col.type === 'numeric' ? t('tableViewer.numericType') : t('tableViewer.textType')})
            </span>
          </Badge>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('tableViewer.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedColumn} onValueChange={setSelectedColumn}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('tableViewer.filterByColumn')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('tableViewer.allColumns')}</SelectItem>
            {stats.columnTypes.map((col, index) => (
              <SelectItem key={index} value={col.name}>
                {col.name} ({col.uniqueValues} {t('tableViewer.unique')})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className={`border rounded-lg ${isFullscreen ? 'fixed inset-4 z-50 bg-background' : ''}`}>
        <ScrollArea className={isFullscreen ? 'h-[calc(100vh-12rem)]' : 'h-96'}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="w-12 p-1 text-left font-medium text-xs">#</th>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    className={`p-1 text-left font-medium ${!isEditingHeaders ? 'cursor-pointer hover:bg-muted/80' : ''} transition-colors`}
                    onClick={() => !isEditingHeaders && handleSort(header)}
                  >
                    {isEditingHeaders && editable ? (
                      <Input
                        value={editableHeaders[index] || ''}
                        onChange={(e) => handleHeaderChange(index, e.target.value)}
                        className="h-6 px-1 py-0 text-xs font-medium min-w-[60px]"
                        placeholder={`Col ${index + 1}`}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{header}</span>
                        {sortColumn === header && (
                          <span className="text-xs opacity-60">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => (
                <tr key={index} className="border-b hover:bg-muted/20">
                  <td className="py-3 px-2 text-muted-foreground font-mono text-xs">
                    {startIndex + index + 1}
                  </td>
                  {headers.map((header, colIndex) => (
                    <td
                      key={colIndex}
                      className={`py-3 px-2 max-w-xs truncate ${stats.columnTypes[colIndex]?.type === 'numeric'
                        ? 'text-right font-mono'
                        : 'text-left'
                        }`}
                      title={String(row[header])}
                    >
                      {row[header] || (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {/* Load More */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('tableViewer.showing')} {Math.min(loadedRowsCount, filteredAndSortedRows.length)} {t('tableViewer.of')} {filteredAndSortedRows.length} {t('tableViewer.rows')}
        </div>
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLoadedRowsCount(prev => Math.min(prev + 50, filteredAndSortedRows.length))}
          >
            Load More (+50 rows)
          </Button>
        )}
        {!hasMore && filteredAndSortedRows.length > 10 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLoadedRowsCount(10)}
          >
            <Minimize2 className="h-4 w-4 mr-2" />
            Show Less
          </Button>
        )}
      </div>
    </div>
  );
}