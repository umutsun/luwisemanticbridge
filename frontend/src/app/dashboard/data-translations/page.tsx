'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Languages,
  Database,
  Play,
  RefreshCw,
  Globe,
  Search,
  Settings,
  BarChart3,
  FileText,
  Loader2,
  Pause,
  Table as TableIcon,
  MoreHorizontal,
  Filter,
  Eye,
  Trash2
} from 'lucide-react';

interface TranslationProvider {
  name: string;
  hasApiKey: boolean;
  costPerChar: number;
  model?: string;
  supportedLanguages: string[];
}

interface DatabaseTable {
  name: string;
  columnCount: number;
  textColumnCount: number;
  canTranslate: boolean;
}

interface TablePreview {
  name: string;
  structure: Array<{
    column_name: string;
    data_type: string;
    is_nullable: boolean;
  }>;
  sampleData: Array<Record<string, any>>;
  totalRows: number;
  previewLimit: number;
}

interface TranslationJob {
  id: string;
  table: string;
  tableName?: string;  // Alias for table
  targetTable: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  columns: string[];
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
  progress: number;
  totalRows: number;
  processedRows: number;
  errors: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cost?: number;
}

interface TranslationStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  errorJobs: number;
  cancelledJobs: number;
  totalCost: number;
  totalRows: number;
  providerUsage: Record<string, {
    jobs: number;
    cost: number;
    rows: number;
  }>;
}

export default function DataTranslationsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();

  // State
  const [activeTab, setActiveTab] = useState('setup');
  const [providers, setProviders] = useState<Record<string, TranslationProvider>>({});
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedTargetTable, setSelectedTargetTable] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedSourceLang, setSelectedSourceLang] = useState('auto');
  const [selectedTargetLang, setSelectedTargetLang] = useState('tr');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [tablePreview, setTablePreview] = useState<TablePreview | null>(null);
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [stats, setStats] = useState<TranslationStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Load initial data
  useEffect(() => {
    loadProviders();
    loadTables();
    loadJobs();
    loadStats();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch('/api/v2/translations/providers');
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers);
      }
    } catch (error) {
      console.error('Error loading providers:', error);
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.errorLoadingProviders'),
        variant: "destructive"
      });
    }
  };

  const loadTables = async () => {
    try {
      const response = await fetch('/api/v2/translations/tables');
      if (response.ok) {
        const data = await response.json();
        setTables(data.tables);
      }
    } catch (error) {
      console.error('Error loading tables:', error);
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.errorLoadingTables'),
        variant: "destructive"
      });
    }
  };

  const loadJobs = async () => {
    setLoadingJobs(true);
    try {
      const response = await fetch('/api/v2/translations/jobs');
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/v2/translations/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handlePreviewTable = async () => {
    if (!selectedTable) return;

    setIsPreviewLoading(true);
    try {
      const response = await fetch('/api/v2/translations/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          limit: 5
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTablePreview(data.table);
      }
    } catch (error) {
      console.error('Error previewing table:', error);
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.errorPreviewingTable'),
        variant: "destructive"
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleStartTranslation = async () => {
    if (!selectedTable || !selectedTargetTable || !selectedProvider || !selectedColumns.length) {
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.fillRequiredFields'),
        variant: "destructive"
      });
      return;
    }

    const provider = providers[selectedProvider];
    if (!provider.hasApiKey) {
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.apiKeyNotConfigured', { provider: provider.name }),
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/v2/translations/translate-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          targetTable: selectedTargetTable,
          provider: selectedProvider,
          sourceLang: selectedSourceLang,
          targetLang: selectedTargetLang,
          columns: selectedColumns
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: t('common.success'),
          description: t('dataTranslations.notifications.translationJobStarted', { jobId: data.jobId }),
        });

        // Refresh jobs and stats
        await loadJobs();
        await loadStats();

        // Reset form
        setSelectedTable('');
        setSelectedTargetTable('');
        setSelectedColumns([]);
        setTablePreview(null);
        setActiveTab('jobs');
      } else {
        throw new Error('Translation job failed');
      }
    } catch (error) {
      console.error('Error starting translation:', error);
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.errorStartingTranslation'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/v2/translations/job/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: t('common.success'),
          description: data.message,
        });

        // Refresh jobs and stats
        await loadJobs();
        await loadStats();
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.errorCancellingJob'),
        variant: "destructive"
      });
    }
  };

  const getJobStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';
      case 'processing':
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';
      case 'pending':
        return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300';
      case 'error':
        return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300';
      case 'cancelled':
        return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300';
      default:
        return '';
    }
  };

  const handlePreviewJob = (job: TranslationJob) => {
    console.log('Preview job:', job);
    // Implement preview logic - could show job details in a modal
    toast({
      title: t('dataTranslations.notifications.jobDetails'),
      description: `${job.table} → ${job.targetTable} (${job.status})`,
    });
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/v2/translations/job/${jobId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: t('common.success'),
          description: t('dataTranslations.notifications.jobDeleted'),
        });

        // Refresh jobs and stats
        await loadJobs();
        await loadStats();

        // Clear selection if deleted job was selected
        setSelectedJobs(prev => {
          const newSelected = new Set(prev);
          newSelected.delete(jobId);
          return newSelected;
        });
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.errorDeletingJob'),
        variant: "destructive"
      });
    }
  };

  const handleBulkDelete = async () => {
    try {
      const jobIds = Array.from(selectedJobs);

      // Delete jobs one by one
      const deletePromises = jobIds.map(jobId =>
        fetch(`/api/v2/translations/job/${jobId}`, {
          method: 'DELETE',
        })
      );

      await Promise.all(deletePromises);

      toast({
        title: t('common.success'),
        description: t('dataTranslations.notifications.jobsDeleted', { count: jobIds.length }),
      });

      // Clear selection and refresh
      setSelectedJobs(new Set());
      await loadJobs();
      await loadStats();
    } catch (error) {
      console.error('Error bulk deleting jobs:', error);
      toast({
        title: t('common.error'),
        description: t('dataTranslations.notifications.errorDeletingJobs'),
        variant: "destructive"
      });
    }
  };

  // Filter jobs based on search and status
  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.table.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.targetTable.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Languages className="w-8 h-8" />
            {t('dataTranslations.title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('dataTranslations.description')}
          </p>
        </div>
      </div>

      {/* Provider Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            {t('dataTranslations.providers.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(providers).map(([key, provider]) => (
              <div key={key} className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${provider.hasApiKey ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {provider.model ? `${provider.model} - ` : ''}
                      ${provider.costPerChar * 1000000}{t('dataTranslations.providers.costPerChar')}
                    </p>
                  </div>
                </div>
                <Badge variant={provider.hasApiKey ? "default" : "secondary"}>
                  {provider.hasApiKey ? t('dataTranslations.providers.active') : t('dataTranslations.providers.configurationRequired')}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-14">
          <TabsTrigger value="setup" className="flex items-center gap-2 h-12">
            <Settings className="w-4 h-4" />
            {t('dataTranslations.tabs.setup')}
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-2 h-12">
            <Search className="w-4 h-4" />
            {t('dataTranslations.tabs.preview')}
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2 h-12">
            <FileText className="w-4 h-4" />
            {t('dataTranslations.tabs.jobs')}
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center gap-2 h-12">
            <BarChart3 className="w-4 h-4" />
            {t('dataTranslations.tabs.stats')}
          </TabsTrigger>
        </TabsList>

        {/* Setup Tab */}
        <TabsContent value="setup">
          <Card>
            <CardHeader>
              <CardTitle>{t('dataTranslations.setup.title')}</CardTitle>
              <CardDescription>
                {t('dataTranslations.setup.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Table Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t('dataTranslations.setup.sourceTable')}</Label>
                  <Select value={selectedTable} onValueChange={setSelectedTable}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('dataTranslations.setup.selectTable')} />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.filter(table => table.canTranslate).map(table => (
                        <SelectItem key={table.name} value={table.name}>
                          <div className="flex items-center gap-2">
                            <TableIcon className="w-4 h-4" />
                            <div>
                              <div className="font-medium">{table.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {table.columnCount} {t('dataTranslations.setup.columnCount')}, {table.textColumnCount} {t('dataTranslations.setup.textColumnCount')}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('dataTranslations.setup.targetTable')}</Label>
                  <Input
                    value={selectedTargetTable}
                    onChange={(e) => setSelectedTargetTable(e.target.value)}
                    placeholder={t('dataTranslations.setup.targetTablePlaceholder')}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Provider Selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>{t('dataTranslations.setup.translationProvider')}</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('dataTranslations.setup.selectProvider')} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(providers).map(([key, provider]) => (
                        <SelectItem key={key} value={key} disabled={!provider.hasApiKey}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${provider.hasApiKey ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <div>
                              <div className="font-medium">{provider.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {provider.model ? `${provider.model} - ` : ''}
                                ${provider.costPerChar * 1000000}{t('dataTranslations.providers.costPerChar')}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('dataTranslations.setup.sourceLanguage')}</Label>
                  <Select value={selectedSourceLang} onValueChange={setSelectedSourceLang}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('dataTranslations.setup.autoDetect')}</SelectItem>
                      <SelectItem value="en">İngilizce</SelectItem>
                      <SelectItem value="tr">Türkçe</SelectItem>
                      <SelectItem value="de">Almanca</SelectItem>
                      <SelectItem value="fr">Fransızca</SelectItem>
                      <SelectItem value="es">İspanyolca</SelectItem>
                      <SelectItem value="it">İtalyanca</SelectItem>
                      <SelectItem value="pt">Portekizce</SelectItem>
                      <SelectItem value="ru">Rusça</SelectItem>
                      <SelectItem value="zh">Çince</SelectItem>
                      <SelectItem value="ja">Japonca</SelectItem>
                      <SelectItem value="ko">Korece</SelectItem>
                      <SelectItem value="el">Yunanca</SelectItem>
                      <SelectItem value="th">Tayca</SelectItem>
                      <SelectItem value="ar">Arapça</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('dataTranslations.setup.targetLanguage')}</Label>
                  <Select value={selectedTargetLang} onValueChange={setSelectedTargetLang}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tr">Türkçe</SelectItem>
                      <SelectItem value="en">İngilizce</SelectItem>
                      <SelectItem value="de">Almanca</SelectItem>
                      <SelectItem value="fr">Fransızca</SelectItem>
                      <SelectItem value="es">İspanyolca</SelectItem>
                      <SelectItem value="it">İtalyanca</SelectItem>
                      <SelectItem value="pt">Portekizce</SelectItem>
                      <SelectItem value="ru">Rusça</SelectItem>
                      <SelectItem value="zh">Çince</SelectItem>
                      <SelectItem value="ja">Japonca</SelectItem>
                      <SelectItem value="ko">Korece</SelectItem>
                      <SelectItem value="el">Yunanca</SelectItem>
                      <SelectItem value="th">Tayca</SelectItem>
                      <SelectItem value="ar">Arapça</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Column Selection */}
              {selectedTable && (
                <div>
                  <Label>{t('dataTranslations.setup.columnsToTranslate')}</Label>
                  <Button
                    variant="outline"
                    onClick={handlePreviewTable}
                    disabled={isPreviewLoading}
                    className="mb-2"
                  >
                    {isPreviewLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        {t('dataTranslations.setup.loading')}
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        {t('dataTranslations.setup.previewTable')}
                      </>
                    )}
                  </Button>

                  {tablePreview && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        <strong>{t('dataTranslations.setup.tableStructure')}:</strong> {tablePreview.structure.length} {t('dataTranslations.setup.columnCount')}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {tablePreview.structure.map((column, index) => (
                          <div key={index} className="flex items-center space-x-2 p-2 border rounded">
                            <Checkbox
                              id={`column-${index}`}
                              checked={selectedColumns.includes(column.column_name)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedColumns(prev => [...prev, column.column_name]);
                                } else {
                                  setSelectedColumns(prev => prev.filter(col => col !== column.column_name));
                                }
                              }}
                            />
                            <Label htmlFor={`column-${index}`} className="text-sm">
                              <div className="font-medium">{column.column_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {column.data_type}
                                {column.is_nullable ? ` (${t('dataTranslations.setup.nullable')})` : ''}
                              </div>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Start Translation Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleStartTranslation}
                  disabled={!selectedTable || !selectedTargetTable || !selectedProvider || selectedColumns.length === 0 || isLoading}
                  size="lg"
                  className="w-full md:w-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('dataTranslations.setup.startingTranslation')}
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      {t('dataTranslations.setup.startTranslation')}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview">
          {tablePreview ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TableIcon className="w-5 h-5" />
                  {t('dataTranslations.preview.title')}: {tablePreview.name}
                </CardTitle>
                <CardDescription>
                  {t('dataTranslations.preview.totalRows')} {tablePreview.totalRows} {t('dataTranslations.preview.rows')}, {t('dataTranslations.preview.showingRows')} {tablePreview.previewLimit} {t('dataTranslations.preview.rows')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Table Structure */}
                  <div>
                    <h4 className="font-medium mb-2">{t('dataTranslations.preview.structure.title')}</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border">
                        <thead>
                          <tr className="bg-muted">
                            <th className="border p-2 text-left">{t('dataTranslations.preview.structure.columnName')}</th>
                            <th className="border p-2 text-left">{t('dataTranslations.preview.structure.dataType')}</th>
                            <th className="border p-2 text-left">{t('dataTranslations.preview.structure.nullable')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tablePreview.structure.map((column, index) => (
                            <tr key={index} className="border-b">
                              <td className="border p-2 font-mono text-sm">{column.column_name}</td>
                              <td className="border p-2 text-sm">{column.data_type}</td>
                              <td className="border p-2 text-sm">{column.is_nullable ? t('dataTranslations.preview.structure.yes') : t('dataTranslations.preview.structure.no')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Sample Data */}
                  <div>
                    <h4 className="font-medium mb-2">{t('dataTranslations.preview.sampleData.title')}</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border">
                        <thead>
                          <tr className="bg-muted">
                            {tablePreview.structure.map((column, index) => (
                              <th key={index} className="border p-2 text-left">
                                {column.column_name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tablePreview.sampleData.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b">
                              {tablePreview.structure.map((column, colIndex) => (
                                <td key={colIndex} className="border p-2 text-sm">
                                  {row[column.column_name] !== null && row[column.column_name] !== undefined
                                    ? String(row[column.column_name]).substring(0, 100)
                                    : t('dataTranslations.preview.sampleData.null')
                                  }
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  {t('dataTranslations.preview.noPreview')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {t('dataTranslations.jobs.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Search and Filter Controls */}
              <div className="flex items-center gap-2 mb-4">
                <Input
                  type="text"
                  placeholder={t('dataTranslations.jobs.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs h-9"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px] h-9">
                    <Filter className="w-3 h-3 mr-2" />
                    <SelectValue placeholder={t('dataTranslations.jobs.filterByStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dataTranslations.jobs.allJobs')}</SelectItem>
                    <SelectItem value="pending">{t('dataTranslations.jobs.pending')}</SelectItem>
                    <SelectItem value="processing">{t('dataTranslations.jobs.processing')}</SelectItem>
                    <SelectItem value="completed">{t('dataTranslations.jobs.completed')}</SelectItem>
                    <SelectItem value="error">{t('dataTranslations.jobs.error')}</SelectItem>
                    <SelectItem value="cancelled">{t('dataTranslations.jobs.cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Batch Operations Toolbar */}
              {selectedJobs.size > 0 && (
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        {selectedJobs.size} {t('dataTranslations.jobs.selectedJobs')}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedJobs(new Set())}
                        className="h-7 text-xs"
                      >
                        {t('dataTranslations.jobs.clear')}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <ConfirmTooltip
                        onConfirm={handleBulkDelete}
                        title={t('dataTranslations.jobs.deleteSelected')}
                        description={t('dataTranslations.jobs.confirmDeleteSelected', { count: selectedJobs.size })}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          {t('dataTranslations.jobs.deleteSelected')}
                        </Button>
                      </ConfirmTooltip>
                    </div>
                  </div>
                </div>
              )}

              {/* Jobs Table */}
              {loadingJobs ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"><Skeleton className="h-4 w-4" /></TableHead>
                      <TableHead className="w-48"><Skeleton className="h-4 w-32" /></TableHead>
                      <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
                      <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
                      <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
                      <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
                      <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...Array(5)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : filteredJobs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedJobs.size === filteredJobs.length && filteredJobs.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedJobs(new Set(filteredJobs.map(j => j.id)));
                            } else {
                              setSelectedJobs(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="w-48">{t('dataTranslations.jobs.table')}</TableHead>
                      <TableHead className="w-32">{t('dataTranslations.jobs.provider')}</TableHead>
                      <TableHead className="w-24">{t('dataTranslations.jobs.status')}</TableHead>
                      <TableHead className="w-24">{t('dataTranslations.jobs.progress')}</TableHead>
                      <TableHead className="w-24">{t('dataTranslations.jobs.cost')}</TableHead>
                      <TableHead className="w-32">{t('dataTranslations.jobs.date')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((job) => {
                      const isSelected = selectedJobs.has(job.id);
                      return (
                        <TableRow
                          key={job.id}
                          className={cn(
                            "hover:bg-muted/50 transition-colors duration-150",
                            isSelected && "bg-blue-50 dark:bg-blue-950/30"
                          )}
                        >
                          {/* Checkbox column */}
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedJobs);
                                if (checked) {
                                  newSelected.add(job.id);
                                } else {
                                  newSelected.delete(job.id);
                                }
                                setSelectedJobs(newSelected);
                              }}
                            />
                          </TableCell>

                          {/* Table Name column */}
                          <TableCell className="font-medium">
                            <div className="space-y-1">
                              <div className="truncate max-w-xs" title={job.table}>
                                {job.table} → {job.targetTable}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {job.sourceLang} → {job.targetLang} • {job.columns.length} {t('dataTranslations.setup.columnCount')}
                              </div>
                            </div>
                          </TableCell>

                          {/* Provider column */}
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {providers[job.provider]?.name || job.provider}
                            </Badge>
                          </TableCell>

                          {/* Status column with dropdown */}
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <div className="flex items-center gap-1 cursor-pointer group">
                                  <Badge variant="outline" className={cn(
                                    "text-xs font-medium border transition-all duration-150",
                                    getJobStatusBadgeClass(job.status)
                                  )}>
                                    {job.status.toUpperCase()}
                                  </Badge>
                                  <MoreHorizontal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handlePreviewJob(job)}>
                                  <Eye className="w-3 h-3 mr-2" />
                                  {t('dataTranslations.jobs.viewDetails')}
                                </DropdownMenuItem>
                                {job.status === 'processing' && (
                                  <DropdownMenuItem onClick={() => handleCancelJob(job.id)}>
                                    <Pause className="w-3 h-3 mr-2" />
                                    {t('dataTranslations.jobs.cancel')}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDeleteJob(job.id)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="w-3 h-3 mr-2" />
                                  {t('dataTranslations.jobs.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>

                          {/* Progress column */}
                          <TableCell>
                            {job.totalRows > 0 ? (
                              <div className="space-y-1">
                                <div className="text-xs">
                                  {job.processedRows} / {job.totalRows}
                                </div>
                                <Progress value={job.progress} className="h-1 w-20" />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>

                          {/* Cost column */}
                          <TableCell className="text-sm">
                            {job.cost ? `$${job.cost.toFixed(4)}` : '-'}
                          </TableCell>

                          {/* Date column */}
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(job.createdAt).toLocaleDateString('tr-TR')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== 'all'
                      ? t('dataTranslations.jobs.noJobsFound')
                      : t('dataTranslations.jobs.noJobsYet')
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats">
          {stats ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Çeviri İstatistikleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-950">
                    <div className="text-2xl font-bold text-blue-600">{stats.totalJobs}</div>
                    <div className="text-sm text-muted-foreground">{t('dataTranslations.stats.totalJobs')}</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-950">
                    <div className="text-2xl font-bold text-green-600">{stats.completedJobs}</div>
                    <div className="text-sm text-muted-foreground">{t('dataTranslations.stats.completed')}</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-yellow-50 dark:bg-yellow-950">
                    <div className="text-2xl font-bold text-yellow-600">{stats.processingJobs}</div>
                    <div className="text-sm text-muted-foreground">{t('dataTranslations.stats.inProgress')}</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-red-50 dark:bg-red-950">
                    <div className="text-2xl font-bold text-red-600">{stats.errorJobs}</div>
                    <div className="text-sm text-muted-foreground">{t('dataTranslations.stats.failed')}</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-purple-50 dark:bg-purple-950">
                    <div className="text-2xl font-bold text-purple-600">${stats.totalCost.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">{t('dataTranslations.stats.totalCost')}</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-orange-50 dark:bg-orange-950">
                    <div className="text-2xl font-bold text-orange-600">{stats.totalRows.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">{t('dataTranslations.stats.totalRows')}</div>
                  </div>
                </div>

                {/* Provider Usage */}
                <div className="mt-8">
                  <h4 className="font-medium mb-4">{t('dataTranslations.stats.providerUsage')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(stats.providerUsage).map(([provider, usage]) => (
                      <div key={provider} className="p-4 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium">{providers[provider]?.name || provider}</h5>
                          <Badge variant="outline">{usage.jobs} {t('dataTranslations.stats.jobs')}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>{t('dataTranslations.stats.cost')}:</span>
                            <span className="font-medium">${usage.cost.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t('dataTranslations.stats.rows')}:</span>
                            <span className="font-medium">{usage.rows.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  {t('dataTranslations.stats.loading')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}