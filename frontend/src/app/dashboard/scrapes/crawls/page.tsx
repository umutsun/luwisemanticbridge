'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/ui/skeleton';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
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
  FolderOpen,
  FileText,
  Eye,
  Download,
  Brain,
  Loader2,
  CheckCircle,
  BarChart3,
  Activity
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

interface Stats {
  totalDirectories: number;
  totalItems: number;
  selectedDirectory: string | null;
  selectedItemsCount: number;
}

export default function CrawlsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('directories');
  const [directories, setDirectories] = useState<CrawlerDirectory[]>([]);
  const [selectedDirectory, setSelectedDirectory] = useState<CrawlerDirectory | null>(null);
  const [crawledItems, setCrawledItems] = useState<CrawledItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<CrawledItem | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const [stats, setStats] = useState<Stats>({
    totalDirectories: 0,
    totalItems: 0,
    selectedDirectory: null,
    selectedItemsCount: 0
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
      const response = await fetchWithAuth(`${config.api.baseUrl}/api/v2/scraper/crawler-directories`);

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
        `${config.api.baseUrl}/api/v2/scraper/crawler-directories/${crawlerName}/data?limit=${limit}&offset=${offset}`
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
    setActiveTab('data');
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
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItems(new Set());
      setStats(prev => ({ ...prev, selectedItemsCount: 0 }));
    } else {
      const allKeys = new Set(filteredItems.map(item => item.key));
      setSelectedItems(allKeys);
      setStats(prev => ({ ...prev, selectedItemsCount: allKeys.size }));
    }
  };

  const handleViewItem = (item: CrawledItem) => {
    setSelectedItem(item);
    setShowDetailDialog(true);
  };

  const handleExportToEmbeddings = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'No items selected',
        description: 'Please select items to export',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetchWithAuth(
        `${config.api.baseUrl}/api/v2/scraper/crawler-directories/${selectedDirectory?.name}/generate-embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: Array.from(selectedItems)
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to export to embeddings');
      }

      const data = await response.json();
      toast({
        title: 'Success',
        description: data.message || `Queued ${selectedItems.size} items for embedding generation`
      });

      setSelectedItems(new Set());
      setStats(prev => ({ ...prev, selectedItemsCount: 0 }));
    } catch (error: any) {
      console.error('Failed to export:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to export items',
        variant: 'destructive'
      });
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
              Crawled Data Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage crawled data from Crawl4AI
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
                  Crawler Directories
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
                  Selected Directory
                </p>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedDirectory?.displayName || 'None'}
                </div>
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
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-14">
            <TabsTrigger value="directories" className="h-12">Directories</TabsTrigger>
            <TabsTrigger value="data" className="h-12" disabled={!selectedDirectory}>
              Crawled Data
            </TabsTrigger>
            <TabsTrigger value="mapping" className="h-12" disabled={selectedItems.size === 0}>
              Mapping & Export
            </TabsTrigger>
          </TabsList>

          {/* Directories Tab */}
          <TabsContent value="directories" className="space-y-6">
            <Card className="bg-white dark:bg-black border-gray-200 dark:border-gray-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-gray-900 dark:text-white font-semibold">
                    Crawler Directories
                  </span>
                </CardTitle>
                <CardDescription>
                  Click on a directory to view crawled data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <TableSkeleton rows={5} columns={4} />
                ) : directories.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="text-base font-medium mb-1">No crawler directories found</p>
                    <p className="text-sm">Crawl data will appear here</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {directories.map(directory => (
                      <Card
                        key={directory.id}
                        className="hover:shadow-lg transition-all cursor-pointer border-2"
                        style={{
                          borderColor: selectedDirectory?.id === directory.id ? '#3b82f6' : 'transparent'
                        }}
                        onClick={() => handleDirectoryClick(directory)}
                      >
                        <CardContent className="p-6">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <FolderOpen className="w-8 h-8 text-blue-600" />
                              <Badge variant="secondary">{directory.itemCount} items</Badge>
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                                {directory.displayName}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-1">
                                {directory.name}
                              </p>
                            </div>
                            {directory.lastCrawled && (
                              <p className="text-xs text-muted-foreground">
                                Last: {formatDate(directory.lastCrawled)}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Crawled Data Tab */}
          <TabsContent value="data" className="space-y-6">
            {selectedItems.size > 0 && (
              <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-800 dark:text-green-200">
                        {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportToEmbeddings}
                        className="hover:bg-green-100 dark:hover:bg-green-900/20"
                      >
                        <Brain className="h-3 w-3 mr-2" />
                        Export to Embeddings
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveTab('mapping')}
                        className="hover:bg-green-100 dark:hover:bg-green-900/20"
                      >
                        <Database className="h-3 w-3 mr-2" />
                        Map & Export to DB
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedItems(new Set());
                          setStats(prev => ({ ...prev, selectedItemsCount: 0 }));
                        }}
                        className="hover:bg-green-100 dark:hover:bg-green-900/20"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                <ScrollArea className="h-[600px]">
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
                    <Table>
                      <TableHeader className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                              onCheckedChange={handleSelectAll}
                            />
                          </TableHead>
                          <TableHead className="w-96">Title</TableHead>
                          <TableHead className="w-48">Key</TableHead>
                          <TableHead className="w-32">Date</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map(item => (
                          <TableRow
                            key={item.id}
                            className={`hover:bg-muted/50 cursor-pointer ${
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
                            <TableCell className="font-medium truncate max-w-96">
                              {item.title}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-48">
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
                                  handleViewItem(item);
                                }}
                                className="h-8 w-8 p-0"
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mapping & Export Tab */}
          <TabsContent value="mapping" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Map Data to Database</CardTitle>
                <CardDescription>
                  Map crawled data fields to database columns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="w-16 h-16 mx-auto mb-4 opacity-40" />
                  <p className="text-xl font-medium mb-2">Mapping Feature Coming Soon</p>
                  <p className="text-sm">
                    This feature will allow you to map JSON fields to database columns
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
                  <h4 className="font-semibold mb-2">Key</h4>
                  <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                    {selectedItem.key}
                  </p>
                </div>
                {selectedItem.url && (
                  <div>
                    <h4 className="font-semibold mb-2">URL</h4>
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
                  <h4 className="font-semibold mb-2">Data</h4>
                  <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
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
