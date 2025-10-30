'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TableSkeleton, StatsCardSkeleton } from '@/components/ui/skeleton';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  RefreshCw,
  Database,
  FileText,
  Eye,
  Loader2,
  CheckCircle,
  BarChart3,
  ArrowRight,
  Columns,
  Brain,
  Target,
  Zap
} from 'lucide-react';
import config from '@/config/api.config';
import { fetchWithAuth } from '@/lib/auth-fetch';

interface CrawlerDirectory {
  id: string;
  name: string;
  displayName: string;
  itemCount: number;
  lastCrawled: string | null;
  type: string;
}

interface CrawledItem {
  id: string;
  key: string;
  fullKey: string;
  crawlerName: string;
  data: any;
  rawData: string;
  scrapedAt: string | null;
  title: string;
  url: string | null;
}

interface SchemaField {
  name: string;
  type: string;
  sample: any;
}

interface ColumnMapping {
  sourceField: string;
  targetColumn: string;
  columnType: string;
}

interface Stats {
  totalDirectories: number;
  totalItems: number;
  selectedDirectory: string | null;
  selectedItemsCount: number;
  totalProcessed: number;
}

export default function CrawlerDataPage() {
  const { toast } = useToast();
  const [workflowStep, setWorkflowStep] = useState<'browse' | 'preview' | 'mapping' | 'import'>('browse');

  // Data states
  const [directories, setDirectories] = useState<CrawlerDirectory[]>([]);
  const [selectedDirectory, setSelectedDirectory] = useState<CrawlerDirectory | null>(null);
  const [crawledItems, setCrawledItems] = useState<CrawledItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Process states
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [tableName, setTableName] = useState('');
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [entityAnalysis, setEntityAnalysis] = useState<any>(null);
  const [jsonSchema, setJsonSchema] = useState<any>(null);

  // UI states
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<CrawledItem | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [autoEmbeddings, setAutoEmbeddings] = useState(true);
  const [selectAll, setSelectAll] = useState(false);

  const [stats, setStats] = useState<Stats>({
    totalDirectories: 0,
    totalItems: 0,
    selectedDirectory: null,
    selectedItemsCount: 0,
    totalProcessed: 0
  });

  useEffect(() => {
    fetchDirectories();
  }, []);

  useEffect(() => {
    if (selectedDirectory) {
      fetchCrawledItems(selectedDirectory.name);
    }
  }, [selectedDirectory]);

  const fetchDirectories = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/crawler/crawler-directories`);

      if (!response.ok) {
        throw new Error('Failed to fetch crawler directories');
      }

      const data = await response.json();
      setDirectories(data.directories || []);
      setStats(prev => ({
        ...prev,
        totalDirectories: data.totalDirectories || 0,
        totalItems: data.totalItems || 0
      }));
    } catch (error: any) {
      console.error('Failed to fetch directories:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load crawler directories',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCrawledItems = async (crawlerName: string, limit = 100, offset = 0) => {
    try {
      setItemsLoading(true);
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${crawlerName}/data?limit=${limit}&offset=${offset}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch crawled items');
      }

      const data = await response.json();
      setCrawledItems(data.data || []);
      setStats(prev => ({
        ...prev,
        selectedDirectory: crawlerName
      }));
    } catch (error: any) {
      console.error('Failed to fetch crawled items:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load crawled items',
        variant: 'destructive'
      });
    } finally {
      setItemsLoading(false);
    }
  };

  const handleDirectoryClick = (directory: CrawlerDirectory) => {
    setSelectedDirectory(directory);
    setSelectedItems(new Set());
    setWorkflowStep('browse');
  };

  const handleItemSelect = (itemKey: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemKey)) {
      newSelected.delete(itemKey);
    } else {
      newSelected.add(itemKey);
    }
    setSelectedItems(newSelected);
    setStats(prev => ({
      ...prev,
      selectedItemsCount: newSelected.size
    }));
    setSelectAll(newSelected.size === filteredItems.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedItems(new Set());
      setStats(prev => ({ ...prev, selectedItemsCount: 0 }));
    } else {
      const allKeys = new Set(filteredItems.map(item => item.key));
      setSelectedItems(allKeys);
      setStats(prev => ({ ...prev, selectedItemsCount: allKeys.size }));
    }
    setSelectAll(!selectAll);
  };

  const handlePreviewData = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'No items selected',
        description: 'Please select items to preview',
        variant: 'destructive'
      });
      return;
    }

    const selectedData = crawledItems.filter(item => selectedItems.has(item.key));
    analyzeSchema(selectedData);

    // Perform entity analysis
    await performEntityAnalysis(selectedData);

    setWorkflowStep('preview');
  };

  const performEntityAnalysis = async (items: CrawledItem[]) => {
    setAnalyzing(true);
    try {
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/crawler/analyze-table`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          crawlerName: selectedDirectory?.name,
          sampleItems: items
        })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze table structure');
      }

      const data = await response.json();
      setEntityAnalysis(data.entityAnalysis);
      setJsonSchema(data.jsonSchema);
      setTableName(data.suggestedTableName || '');

    } catch (error: any) {
      console.error('Failed to analyze:', error);
      toast({
        title: 'Warning',
        description: 'Could not perform entity analysis',
        variant: 'default'
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeSchema = (items: CrawledItem[]) => {
    const fieldsMap = new Map<string, { type: string; sample: any }>();

    items.forEach(item => {
      const data = item.data || {};
      Object.entries(data).forEach(([key, value]) => {
        if (!fieldsMap.has(key)) {
          fieldsMap.set(key, {
            type: typeof value === 'object' ? 'json' : typeof value,
            sample: value
          });
        }
      });
    });

    const fields: SchemaField[] = Array.from(fieldsMap.entries()).map(([name, info]) => ({
      name,
      type: info.type,
      sample: info.sample
    }));

    setSchemaFields(fields);
    setPreviewData(items.map(item => item.data).slice(0, 10));

    const mappings: ColumnMapping[] = fields.map(field => ({
      sourceField: field.name,
      targetColumn: field.name.toLowerCase().replace(/\s+/g, '_'),
      columnType: mapTypeToSQL(field.type)
    }));
    setColumnMappings(mappings);
  };

  const mapTypeToSQL = (jsType: string): string => {
    switch (jsType) {
      case 'string':
        return 'TEXT';
      case 'number':
        return 'NUMERIC';
      case 'boolean':
        return 'BOOLEAN';
      case 'json':
      case 'object':
        return 'JSONB';
      default:
        return 'TEXT';
    }
  };

  const handleImportData = async () => {
    if (!tableName || columnMappings.length === 0) {
      toast({
        title: 'Invalid configuration',
        description: 'Please provide table name and mappings',
        variant: 'destructive'
      });
      return;
    }

    setImporting(true);

    try {
      const mappingObj: Record<string, string> = {};
      columnMappings.forEach(m => {
        mappingObj[m.targetColumn] = m.sourceField;
      });

      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/crawler/crawler-directories/${selectedDirectory?.name}/export-to-db`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: Array.from(selectedItems),
            tableName,
            columnMappings: mappingObj
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to import data');
      }

      const data = await response.json();
      setWorkflowStep('import');

      toast({
        title: 'Success',
        description: data.message || `Imported ${selectedItems.size} items to ${tableName}`
      });

      setStats(prev => ({
        ...prev,
        totalProcessed: prev.totalProcessed + selectedItems.size
      }));

      setSelectedItems(new Set());
      setSelectAll(false);
      setStats(prev => ({ ...prev, selectedItemsCount: 0 }));
    } catch (error: any) {
      console.error('Failed to import:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to import data',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredItems = crawledItems.filter(item =>
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-[90%] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Crawler Data Processing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import and process crawled data from Redis to your database
            </p>
          </div>
          <Button
            onClick={() => {
              fetchDirectories();
              if (selectedDirectory) {
                fetchCrawledItems(selectedDirectory.name);
              }
            }}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white dark:bg-black">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                  Crawler Sources
                </p>
                <AnimatedCounter
                  value={stats.totalDirectories}
                  duration={800}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-black">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                  Total Items
                </p>
                <AnimatedCounter
                  value={stats.totalItems}
                  duration={800}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-black">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                  Selected Items
                </p>
                <AnimatedCounter
                  value={stats.selectedItemsCount}
                  duration={500}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-black">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                  Processed
                </p>
                <AnimatedCounter
                  value={stats.totalProcessed}
                  duration={800}
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Sources List */}
          <div className="lg:col-span-1">
            <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
              <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                <CardTitle className="text-lg">Crawler Sources</CardTitle>
                <CardDescription>Select a source to view data</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-24rem)]">
                  {loading ? (
                    <div className="p-4">
                      <StatsCardSkeleton />
                    </div>
                  ) : directories.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p className="text-base font-medium mb-1">No sources found</p>
                      <p className="text-sm">Crawler data will appear here</p>
                    </div>
                  ) : (
                    <div className="p-2">
                      {directories.map(directory => (
                        <div
                          key={directory.id}
                          className={`p-3 rounded-md cursor-pointer transition-colors duration-150 mb-1.5 ${
                            selectedDirectory?.id === directory.id
                              ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-500'
                              : 'hover:bg-muted/50 border border-transparent'
                          }`}
                          onClick={() => handleDirectoryClick(directory)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                              {directory.displayName}
                            </h3>
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {directory.itemCount}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {directory.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Data View & Workflow */}
          <div className="lg:col-span-2">
            {!selectedDirectory ? (
              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                <CardContent className="p-12">
                  <div className="text-center text-muted-foreground">
                    <Target className="w-16 h-16 mx-auto mb-4 opacity-40" />
                    <h3 className="text-lg font-semibold mb-2">Select a Source</h3>
                    <p className="text-sm">
                      Choose a crawler source from the left to view and process data
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : workflowStep === 'browse' ? (
              <>
                {/* Selection Alert */}
                {selectedItems.size > 0 && (
                  <Alert className="mb-4 border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <AlertDescription className="flex items-center justify-between">
                      <span className="font-medium text-blue-900 dark:text-blue-100">
                        {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'} selected
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handlePreviewData}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Continue
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedItems(new Set());
                            setSelectAll(false);
                            setStats(prev => ({ ...prev, selectedItemsCount: 0 }));
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                  <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {selectedDirectory?.displayName} - Crawled Data
                      </CardTitle>
                      <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search items..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <ScrollArea className="h-[calc(100vh-28rem)]">
                        {itemsLoading ? (
                          <div className="p-4">
                            <TableSkeleton rows={10} columns={5} />
                          </div>
                        ) : filteredItems.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p className="text-base font-medium mb-1">No items found</p>
                          </div>
                        ) : (
                          <Table className="min-w-[700px]">
                            <TableHeader className="bg-gray-50 dark:bg-gray-900">
                              <TableRow>
                                <TableHead className="w-10">
                                  <Checkbox
                                    checked={selectAll && filteredItems.length > 0}
                                    onCheckedChange={handleSelectAll}
                                  />
                                </TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead className="w-32">Key</TableHead>
                                <TableHead className="w-32">Date</TableHead>
                                <TableHead className="w-20">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredItems.map(item => (
                                <TableRow
                                  key={item.id}
                                  className={`hover:bg-muted/50 transition-colors duration-150 cursor-pointer ${
                                    selectedItems.has(item.key) ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                                  }`}
                                  onClick={() => handleItemSelect(item.key)}
                                >
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedItems.has(item.key)}
                                      onCheckedChange={() => handleItemSelect(item.key)}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium truncate max-w-64">
                                    {item.title}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground truncate">
                                    {item.key}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {formatDate(item.scrapedAt)}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedItem(item);
                                        setShowDetailDialog(true);
                                      }}
                                      className="h-8 w-8 p-0 hover:bg-primary/10 transition-colors duration-150"
                                    >
                                      <Eye className="w-3 h-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : workflowStep === 'preview' ? (
              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <CardTitle className="text-lg">Data Preview & Schema</CardTitle>
                  <CardDescription>
                    Review the detected schema ({schemaFields.length} fields)
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {analyzing ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      <span className="ml-3 text-muted-foreground">Analyzing entity structure...</span>
                    </div>
                  ) : (
                    <ScrollArea className="h-[calc(100vh-28rem)]">
                      <div className="space-y-6">
                        {/* Entity Analysis Summary */}
                        {entityAnalysis && (
                          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2 mb-3">
                              <BarChart3 className="w-5 h-5 text-blue-600" />
                              <h4 className="font-semibold text-sm">Entity Analysis</h4>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-xs text-muted-foreground">Total Fields</p>
                                <p className="text-lg font-bold text-blue-600">{entityAnalysis.totalFields}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Required</p>
                                <p className="text-lg font-bold text-green-600">{entityAnalysis.requiredFields}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Optional</p>
                                <p className="text-lg font-bold text-yellow-600">{entityAnalysis.optionalFields}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Sample Size</p>
                                <p className="text-lg font-bold text-purple-600">{entityAnalysis.sampleSize}</p>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                              <p className="text-xs font-semibold mb-2">Data Types Distribution:</p>
                              <div className="flex flex-wrap gap-2">
                                {entityAnalysis.dataTypes.text > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    Text: {entityAnalysis.dataTypes.text}
                                  </Badge>
                                )}
                                {entityAnalysis.dataTypes.numeric > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    Numeric: {entityAnalysis.dataTypes.numeric}
                                  </Badge>
                                )}
                                {entityAnalysis.dataTypes.boolean > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    Boolean: {entityAnalysis.dataTypes.boolean}
                                  </Badge>
                                )}
                                {entityAnalysis.dataTypes.json > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    JSON: {entityAnalysis.dataTypes.json}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* JSON Schema */}
                        {jsonSchema && (
                          <div>
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <Columns className="w-4 h-4" />
                              JSON Schema
                            </h4>
                            <div className="overflow-x-auto">
                              <ScrollArea className="h-64 border rounded-lg bg-gray-50 dark:bg-gray-900">
                                <pre className="p-4 text-xs">
                                  {JSON.stringify(jsonSchema, null, 2)}
                                </pre>
                              </ScrollArea>
                            </div>
                          </div>
                        )}

                        {/* Field Schema */}
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Field Schema ({schemaFields.length} fields)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {schemaFields.map((field, index) => (
                              <div key={index} className="p-3 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                  <p className="font-medium text-sm">{field.name}</p>
                                  <Badge variant="outline" className="text-xs">{field.type}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground font-mono truncate">
                                  {JSON.stringify(field.sample).substring(0, 50)}...
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Data Preview */}
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Data Preview (First 10)</h4>
                          <div className="overflow-x-auto">
                            <ScrollArea className="h-64 border rounded-lg bg-gray-50 dark:bg-gray-900">
                              <pre className="p-4 text-xs">
                                {JSON.stringify(previewData, null, 2)}
                              </pre>
                            </ScrollArea>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setWorkflowStep('browse')}
                    >
                      ← Back
                    </Button>
                    <Button
                      onClick={() => setWorkflowStep('mapping')}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Next: Mapping
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : workflowStep === 'mapping' ? (
              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                <CardHeader className="border-b border-gray-100 dark:border-gray-700">
                  <CardTitle className="text-lg">Column Mapping</CardTitle>
                  <CardDescription>
                    Map source fields to database columns
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div>
                    <Label htmlFor="tableName" className="text-sm font-semibold">Target Table Name</Label>
                    <Input
                      id="tableName"
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      placeholder="e.g., books, articles, products"
                      className="mt-2"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-600" />
                      <Label htmlFor="autoEmbeddings" className="text-sm">Auto-generate embeddings</Label>
                    </div>
                    <Switch
                      id="autoEmbeddings"
                      checked={autoEmbeddings}
                      onCheckedChange={setAutoEmbeddings}
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <ScrollArea className="h-[calc(100vh-38rem)]">
                      <div className="space-y-3">
                        {columnMappings.map((mapping, index) => (
                          <div key={index} className="p-3 border rounded-lg">
                            <div className="grid grid-cols-3 gap-3 min-w-[600px]">
                              <div>
                                <Label className="text-xs">Source Field</Label>
                                <Input
                                  value={mapping.sourceField}
                                  disabled
                                  className="mt-1 text-xs bg-gray-100 dark:bg-gray-800"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Target Column</Label>
                                <Input
                                  value={mapping.targetColumn}
                                  onChange={(e) => {
                                    const newMappings = [...columnMappings];
                                    newMappings[index].targetColumn = e.target.value;
                                    setColumnMappings(newMappings);
                                  }}
                                  className="mt-1 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Type</Label>
                                <Input
                                  value={mapping.columnType}
                                  onChange={(e) => {
                                    const newMappings = [...columnMappings];
                                    newMappings[index].columnType = e.target.value;
                                    setColumnMappings(newMappings);
                                  }}
                                  className="mt-1 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setWorkflowStep('preview')}
                    >
                      ← Back
                    </Button>
                    <Button
                      onClick={handleImportData}
                      disabled={!tableName || importing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {importing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          Import to Database
                          <Database className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
                <CardContent className="p-12">
                  <div className="text-center space-y-6">
                    <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
                    <div>
                      <h3 className="text-xl font-bold mb-2">Import Completed!</h3>
                      <p className="text-muted-foreground">
                        Successfully imported {selectedItems.size} items to "{tableName}"
                      </p>
                    </div>
                    <div className="flex justify-center gap-4">
                      <Button
                        onClick={() => {
                          setWorkflowStep('browse');
                          setSelectedDirectory(null);
                          setSelectedItems(new Set());
                          setSelectAll(false);
                        }}
                        variant="outline"
                      >
                        Import More
                      </Button>
                      <Button
                        onClick={() => window.location.href = '/dashboard/chat'}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Go to Chat
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Item Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
            <DialogDescription>{selectedItem?.title}</DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4 p-4">
                <div>
                  <h4 className="font-semibold mb-2 text-sm">Key</h4>
                  <p className="text-sm text-muted-foreground font-mono bg-muted p-3 rounded-lg">
                    {selectedItem.key}
                  </p>
                </div>
                {selectedItem.url && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">URL</h4>
                    <a
                      href={selectedItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline break-all"
                    >
                      {selectedItem.url}
                    </a>
                  </div>
                )}
                <div>
                  <h4 className="font-semibold mb-2 text-sm">Data</h4>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 border">
                    {JSON.stringify(selectedItem.data, null, 2)}
                  </pre>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
