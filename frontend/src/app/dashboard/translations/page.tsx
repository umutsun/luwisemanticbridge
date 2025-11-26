'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Languages,
  Database,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Globe,
  Search,
  Settings,
  BarChart3,
  Clock,
  DollarSign,
  FileText,
  ArrowRight,
  Loader2,
  Pause,
  XCircle,
  Table
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
    try {
      const response = await fetch('/api/v2/translations/jobs');
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast({
        title: t('common.error'),
        description: "Jobs could not be loaded",
        variant: "destructive"
      });
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
      toast({
        title: t('common.error'),
        description: "Statistics could not be loaded",
        variant: "destructive"
      });
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'processing': return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'error': return <XCircle className="w-4 h-4" />;
      case 'cancelled': return <Pause className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR');
  };

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
                      ${provider.costPerChar * 1000000}/1M karakter
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
                      {tables.filter(t => t.canTranslate).map(table => (
                        <SelectItem key={table.name} value={table.name}>
                          <div className="flex items-center gap-2">
                            <Table className="w-4 h-4" />
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
                                ${provider.costPerChar * 1000000}/1M karakter
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
                        {t('common.loading')}
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
                        <strong>{t('dataTranslations.preview.structure.title')}:</strong> {tablePreview.structure.length} {t('dataTranslations.setup.columnCount')}
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
                                {column.is_nullable ? ' (' + t('dataTranslations.preview.structure.nullable') + ')' : ''}
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
                  <Table className="w-5 h-5" />
                  {t('dataTranslations.preview.title')}: {tablePreview.name}
                </CardTitle>
                <CardDescription>
                  {t('dataTranslations.preview.totalRows')} {tablePreview.totalRows} {t('tableViewer.rows')}, {t('dataTranslations.preview.showingRows')} {tablePreview.previewLimit} {t('tableViewer.rows')} {t('dataTranslations.preview.rows')}
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
              {jobs.length > 0 ? (
                <div className="space-y-4">
                  {jobs.map(job => (
                    <div key={job.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                            {job.status.toUpperCase()}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {providers[job.provider]?.name || job.provider}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDateTime(job.createdAt)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">{t('common.source')}:</span> {job.table}
                        </div>
                        <div>
                          <span className="font-medium">{t('common.target')}:</span> {job.targetTable}
                        </div>
                        <div>
                          <span className="font-medium">{t('common.languages')}:</span> {job.sourceLang} → {job.targetLang}
                        </div>
                        <div>
                          <span className="font-medium">{t('common.columns')}:</span> {job.columns.join(', ')}
                        </div>
                      </div>

                      {job.totalRows > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{t('dataTranslations.jobs.progress')}:</span>
                            <span className="text-sm">{job.processedRows} / {job.totalRows} {t('tableViewer.rows')}</span>
                          </div>
                          <Progress value={job.progress} className="w-full" />
                        </div>
                      )}

                      {job.errors.length > 0 && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>{t('common.errors')}:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {job.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {getStatusIcon(job.status)}
                          <span>
                            {job.startedAt && `${t('dataTranslations.jobs.status.running')}: ${formatDateTime(job.startedAt)}`}
                            {job.completedAt && `${t('dataTranslations.jobs.status.completed')}: ${formatDateTime(job.completedAt)}`}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {job.status === 'processing' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelJob(job.id)}
                            >
                              <Pause className="w-4 h-4 mr-1" />
                              {t('dataTranslations.jobs.actions.cancel')}
                            </Button>
                          )}
                          {job.cost && (
                            <div className="flex items-center gap-1 text-sm">
                              <DollarSign className="w-4 h-4" />
                              {job.cost.toFixed(4)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {t('dataTranslations.jobs.noJobsYet')}
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
                  {t('dataTranslations.stats.title')}
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