'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Filter,
  ArrowUpDown,
  Eye,
  BarChart3
} from 'lucide-react';

interface ColumnInfo {
  name: string;
  type: 'numeric' | 'text' | 'date';
  uniqueValues: number;
  nullCount: number;
  min?: number;
  max?: number;
  avg?: number;
}

interface CSVViewerProps {
  data: any[];
  columns: string[];
  title: string;
  stats?: {
    totalRows: number;
    totalColumns: number;
    numericColumns: number;
    categoricalColumns: number;
  };
  columnTypes?: ColumnInfo[];
}

export function CSVViewer({
  data,
  columns,
  title,
  stats,
  columnTypes = []
}: CSVViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterColumn, setFilterColumn] = useState<string>('');
  const [filterValue, setFilterValue] = useState('');
  const rowsPerPage = 25;

  // Filter and sort data
  const processedData = useMemo(() => {
    let filtered = [...data];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(row =>
        Object.values(row).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply column filter
    if (filterColumn && filterValue) {
      filtered = filtered.filter(row =>
        String(row[filterColumn]).toLowerCase().includes(filterValue.toLowerCase())
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Handle numeric sorting
        if (!isNaN(parseFloat(aVal)) && !isNaN(parseFloat(bVal))) {
          return sortDirection === 'asc'
            ? parseFloat(aVal) - parseFloat(bVal)
            : parseFloat(bVal) - parseFloat(aVal);
        }

        // Handle string sorting
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();

        if (sortDirection === 'asc') {
          return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
        } else {
          return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
        }
      });
    }

    return filtered;
  }, [data, searchTerm, filterColumn, filterValue, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(processedData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = processedData.slice(startIndex, endIndex);

  // Handle sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Export data
  const exportCSV = () => {
    const csvContent = [
      columns.join(','),
      ...processedData.map(row =>
        columns.map(col => `"${row[col] || ''}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\.[^/.]+$/, '')}_exported.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Get column type badge
  const getColumnBadge = (columnName: string) => {
    const colType = columnTypes.find(c => c.name === columnName);
    if (!colType) return null;

    const colors = {
      numeric: 'bg-blue-100 text-blue-800',
      text: 'bg-green-100 text-green-800',
      date: 'bg-purple-100 text-purple-800'
    };

    return (
      <Badge className={`text-xs ${colors[colType.type] || colors.text}`}>
        {colType.type}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Rows</div>
              <div className="text-lg font-bold">{stats.totalRows.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Columns</div>
              <div className="text-lg font-bold">{stats.totalColumns}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Numeric</div>
              <div className="text-lg font-bold">{stats.numericColumns}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Categorical</div>
              <div className="text-lg font-bold">{stats.categoricalColumns}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {title}
            </CardTitle>
            <Button onClick={exportCSV} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search across all columns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterColumn}
                onChange={(e) => setFilterColumn(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="">All Columns</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              <Input
                placeholder="Filter value..."
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="w-40"
                disabled={!filterColumn}
              />
            </div>
          </div>

          {/* Table */}
          <ScrollArea className="h-[500px] border rounded-md">
            <table className="w-full">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="p-2 text-left font-medium text-sm bg-muted/50">#</th>
                  {columns.map((column, index) => (
                    <th
                      key={column}
                      className="p-2 text-left font-medium text-sm bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => handleSort(column)}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate max-w-[150px]" title={column}>
                          {column}
                        </span>
                        {getColumnBadge(column)}
                        {sortColumn === column && (
                          <ArrowUpDown className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-2 text-sm text-muted-foreground">
                      {startIndex + rowIndex + 1}
                    </td>
                    {columns.map(column => (
                      <td key={column} className="p-2 text-sm max-w-[200px]">
                        <div className="truncate" title={String(row[column] || '')}>
                          {row[column] === null || row[column] === '' ? (
                            <span className="text-muted-foreground italic">NULL</span>
                          ) : (
                            String(row[column])
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(endIndex, processedData.length)} of{' '}
              {processedData.length.toLocaleString()} entries
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}