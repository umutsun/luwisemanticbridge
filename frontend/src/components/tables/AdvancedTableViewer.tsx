'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  ArrowUpDown,
  ChevronDown,
  Settings
} from 'lucide-react';

interface TableData {
  records: any[];
  count: number;
  columns: string[];
  tableName: string;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

interface AdvancedTableViewerProps {
  tableData: TableData;
  isLoading?: boolean;
  onRefresh?: () => void;
  onExport?: (format: 'csv' | 'json') => void;
  onViewEmbeddings?: (recordId: string) => void;
}

type SortDirection = 'asc' | 'desc';
type FilterOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greater' | 'less';

export function AdvancedTableViewer({
  tableData,
  isLoading,
  onRefresh,
  onExport,
  onViewEmbeddings
}: AdvancedTableViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<Record<string, { value: string; operator: FilterOperator }>>({});
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showEmbeddings, setShowEmbeddings] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let filtered = [...tableData.records];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(record =>
        Object.values(record).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply column filters
    Object.entries(filters).forEach(([column, { value, operator }]) => {
      if (value) {
        filtered = filtered.filter(record => {
          const recordValue = String(record[column] || '').toLowerCase();
          const filterValue = value.toLowerCase();

          switch (operator) {
            case 'equals':
              return recordValue === filterValue;
            case 'contains':
              return recordValue.includes(filterValue);
            case 'startsWith':
              return recordValue.startsWith(filterValue);
            case 'endsWith':
              return recordValue.endsWith(filterValue);
            case 'greater':
              return parseFloat(recordValue) > parseFloat(filterValue);
            case 'less':
              return parseFloat(recordValue) < parseFloat(filterValue);
            default:
              return true;
          }
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal || '').toLowerCase();
        const bStr = String(bVal || '').toLowerCase();
        const comparison = aStr.localeCompare(bStr);

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [tableData.records, searchTerm, filters, sortColumn, sortDirection]);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const toggleColumnVisibility = (column: string) => {
    const newHidden = new Set(hiddenColumns);
    if (newHidden.has(column)) {
      newHidden.delete(column);
    } else {
      newHidden.add(column);
    }
    setHiddenColumns(newHidden);
  };

  const visibleColumns = tableData.columns.filter(col => !hiddenColumns.has(col));

  const exportData = (format: 'csv' | 'json') => {
    if (onExport) {
      onExport(format);
      return;
    }

    // Client-side export fallback
    const dataToExport = format === 'csv'
      ? convertToCSV(filteredData)
      : JSON.stringify(filteredData, null, 2);

    const blob = new Blob([dataToExport], {
      type: format === 'csv' ? 'text/csv' : 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableData.tableName}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const convertToCSV = (data: any[]) => {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row =>
      headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',')
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      }).join(',')
    );

    return [csvHeaders, ...csvRows].join('\n');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Table className="w-5 h-5" />
            {tableData.tableName} Data Viewer
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {filteredData.length} / {tableData.count} records
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search all columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Column Controls */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Columns:</span>
          </div>
          {tableData.columns.map(column => (
            <Button
              key={column}
              variant="outline"
              size="sm"
              onClick={() => toggleColumnVisibility(column)}
              className="text-xs h-6"
            >
              {hiddenColumns.has(column) ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
              {column}
            </Button>
          ))}
        </div>

        {/* Export Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportData('csv')}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportData('json')}
          >
            <Download className="w-4 h-4 mr-2" />
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEmbeddings(!showEmbeddings)}
          >
            <Eye className="w-4 h-4 mr-2" />
            {showEmbeddings ? 'Hide' : 'Show'} Embeddings
          </Button>
        </div>

        {/* Data Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map(column => (
                    <TableHead key={column} className="whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort(column)}
                        className="h-auto p-0 font-semibold"
                      >
                        {column}
                        {sortColumn === column && (
                          <ArrowUpDown className="w-3 h-3 ml-1" />
                        )}
                      </Button>
                    </TableHead>
                  ))}
                  {showEmbeddings && <TableHead>Embeddings</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + (showEmbeddings ? 1 : 1)} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + (showEmbeddings ? 1 : 1)} className="text-center py-8">
                      No data found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((record, index) => (
                    <TableRow key={index}>
                      {visibleColumns.map(column => (
                        <TableCell key={column} className="max-w-xs truncate">
                          {String(record[column] || '')}
                        </TableCell>
                      ))}
                      {showEmbeddings && (
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewEmbeddings?.(record.id)}
                          >
                            View
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} results
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}