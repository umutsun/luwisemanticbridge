'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X,
  Search,
  Download,
  Maximize2,
  Minimize2,
  Filter,
  SortAsc,
  SortDesc,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CSVColumn {
  name: string;
  type: 'numeric' | 'text' | 'date';
  uniqueValues: number;
  nullCount: number;
}

interface CSVModalViewerProps {
  /** Modal open state */
  isOpen: boolean;
  /** Callback to close modal */
  onClose: () => void;
  /** CSV data as string */
  data: string;
  /** Optional title */
  title?: string;
  /** Optional filename */
  filename?: string;
  /** Optional metadata */
  metadata?: {
    csvStats?: {
      totalRows: number;
      totalColumns: number;
      columnTypes: CSVColumn[];
    };
  };
}

interface ParsedRow {
  _id: number;
  [key: string]: string | number;
}

export default function CSVModalViewer({
  isOpen,
  onClose,
  data,
  title,
  filename,
  metadata
}: CSVModalViewerProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const listRef = useRef<List>(null);

  // Auto-detect delimiter
  const detectDelimiter = (csvString: string): string => {
    const firstLine = csvString.split('\n')[0];
    if (!firstLine) return ',';

    const delimiters = [',', ';', '\t'];
    const counts = delimiters.map(d => (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length);
    const maxCount = Math.max(...counts);
    const delimiterIndex = counts.indexOf(maxCount);

    return maxCount > 0 ? delimiters[delimiterIndex] : ',';
  };

  // Parse CSV data with auto-detection
  const { headers, rows, stats, delimiter } = useMemo(() => {
    if (!data) return { headers: [], rows: [], stats: null, delimiter: ',' };

    try {
      // Detect delimiter
      const detectedDelimiter = detectDelimiter(data);

      const lines = data.split('\n').filter(line => line.trim());
      if (lines.length === 0) return { headers: [], rows: [], stats: null, delimiter: detectedDelimiter };

      // Parse headers
      const parsedHeaders = lines[0]
        .split(detectedDelimiter)
        .map(h => h.trim().replace(/^"|"$/g, ''));

      // Parse rows (skip first line which is header)
      const parsedRows: ParsedRow[] = lines.slice(1).map((line, index) => {
        const values = line.split(detectedDelimiter).map(v => v.trim().replace(/^"|"$/g, ''));
        const row: ParsedRow = { _id: index + 1 };

        parsedHeaders.forEach((header, i) => {
          row[header] = values[i] || '';
        });

        return row;
      });

      // Calculate stats
      const calculatedStats = metadata?.csvStats || {
        totalRows: parsedRows.length,
        totalColumns: parsedHeaders.length,
        columnTypes: parsedHeaders.map(header => {
          const values = parsedRows.map(row => row[header]);
          const numericValues = values.filter(v => !isNaN(parseFloat(String(v))) && String(v) !== '');

          return {
            name: header,
            type: numericValues.length > values.length * 0.7 ? 'numeric' as const : 'text' as const,
            uniqueValues: [...new Set(values)].length,
            nullCount: values.filter(v => !v || v === '').length
          };
        })
      };

      return {
        headers: parsedHeaders,
        rows: parsedRows,
        stats: calculatedStats,
        delimiter: detectedDelimiter
      };
    } catch (error) {
      console.error('Error parsing CSV:', error);
      return { headers: [], rows: [], stats: null, delimiter: ',' };
    }
  }, [data, metadata]);

  // Filter and sort data
  const filteredAndSortedRows = useMemo(() => {
    let filtered = [...rows];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(row =>
        Object.values(row).some(value =>
          value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Handle numeric values
        const aNum = parseFloat(String(aVal));
        const bNum = parseFloat(String(bVal));

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Handle string values
        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortDirection === 'asc'
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      });
    }

    return filtered;
  }, [rows, searchTerm, sortColumn, sortDirection]);

  // Handle sort
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  // Export to CSV
  const handleExport = useCallback(() => {
    const csvContent = [
      headers.join(','),
      ...filteredAndSortedRows.map(row =>
        headers.map(h => {
          const value = String(row[h] || '');
          return value.includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'export.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }, [headers, filteredAndSortedRows, filename]);

  // Virtual list row renderer
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = filteredAndSortedRows[index];

    return (
      <div
        style={style}
        className="flex border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {headers.map((header, colIndex) => (
          <div
            key={`${index}-${header}`}
            className={`flex-shrink-0 px-3 py-2 text-sm ${
              colIndex === 0 ? 'sticky left-0 bg-white dark:bg-gray-900 z-10' : ''
            }`}
            style={{
              width: colIndex === 0 ? '60px' : '200px',
              minWidth: colIndex === 0 ? '60px' : '200px'
            }}
          >
            <span className="truncate block" title={String(row[header])}>
              {String(row[header] || '')}
            </span>
          </div>
        ))}
      </div>
    );
  }, [filteredAndSortedRows, headers]);

  // Calculate list dimensions
  const rowHeight = 40;
  const headerHeight = 48;
  const modalHeight = isFullscreen ? '90vh' : '600px';
  const listHeight = isFullscreen
    ? 'calc(90vh - 200px)'  // Account for header, filters, etc.
    : '450px';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`
          ${isFullscreen ? 'max-w-[95vw] h-[90vh]' : 'max-w-6xl max-h-[80vh]'}
          overflow-hidden flex flex-col
        `}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <div>
                <DialogTitle className="text-xl font-semibold">
                  {title || filename || 'CSV Viewer'}
                </DialogTitle>
                {stats && (
                  <DialogDescription className="mt-1">
                    {stats.totalRows} rows × {stats.totalColumns} columns
                    <span className="mx-2">•</span>
                    Delimiter: <Badge variant="outline" className="text-xs">{delimiter === ',' ? 'comma' : delimiter === ';' ? 'semicolon' : 'tab'}</Badge>
                  </DialogDescription>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-3 mb-3 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search in all columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {searchTerm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchTerm('')}
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Stats */}
        {filteredAndSortedRows.length < rows.length && (
          <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md text-sm flex-shrink-0">
            <Filter className="w-4 h-4 inline mr-2" />
            Showing {filteredAndSortedRows.length} of {rows.length} rows
          </div>
        )}

        {/* Table Container */}
        <div className="flex-1 min-h-0 border rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="flex bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600 sticky top-0 z-20">
            {headers.map((header, index) => (
              <button
                key={header}
                onClick={() => handleSort(header)}
                className={`
                  flex items-center justify-between gap-2 px-3 py-3 text-sm font-semibold
                  text-left hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors
                  ${index === 0 ? 'sticky left-0 bg-gray-100 dark:bg-gray-800 z-10' : ''}
                `}
                style={{
                  width: index === 0 ? '60px' : '200px',
                  minWidth: index === 0 ? '60px' : '200px'
                }}
              >
                <span className="truncate" title={header}>{header}</span>
                {sortColumn === header && (
                  sortDirection === 'asc'
                    ? <SortAsc className="w-4 h-4 flex-shrink-0" />
                    : <SortDesc className="w-4 h-4 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Virtual Table Body */}
          {filteredAndSortedRows.length > 0 ? (
            <List
              ref={listRef}
              height={isFullscreen ? window.innerHeight * 0.9 - 250 : 400}
              itemCount={filteredAndSortedRows.length}
              itemSize={rowHeight}
              width="100%"
              className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200"
            >
              {Row}
            </List>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Filter className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-lg font-medium">No data found</p>
              <p className="text-sm">Try adjusting your search filters</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
