'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiConfig } from '@/config/api.config';
import { Database, FileText, Globe, MessageSquare, Trash2, Download, Upload, RefreshCw, Loader2, CheckCircle } from 'lucide-react';

interface EmbeddingConfig {
  unified_embeddings: {
    enabled: boolean;
    tableName: string;
    count: number;
    lastMigrated: string;
  };
  document_embeddings: {
    enabled: boolean;
    allowedTypes: string[];
    maxSize: number;
    count: number;
    tableName: string;
  };
  scrape_embeddings: {
    enabled: boolean;
    trustedSites: string[];
    autoFilter: boolean;
    llmReview: boolean;
    count: number;
    tableName: string;
  };
  message_embeddings: {
    enabled: boolean;
    userApproval: boolean;
    anonymize: boolean;
    retentionDays: number;
    count: number;
    tableName: string;
  };
}

interface SyncStats {
  document_embeddings: { total: number; synced: number; unsynced: number };
  scrape_embeddings: { total: number; synced: number; unsynced: number };
  unified_embeddings: { total: number; by_source: Record<string, number> };
}

const EmbeddingsManagement = () => {
  const [syncLoading, setSyncLoading] = useState<string | null>(null);
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [config, setConfig] = useState<EmbeddingConfig>({
    unified_embeddings: {
      enabled: true,
      tableName: 'unified_embeddings',
      count: 0,
      lastMigrated: '-'
    },
    document_embeddings: {
      enabled: true,
      allowedTypes: ['pdf', 'docx', 'txt', 'csv', 'json', 'md'],
      maxSize: 50,
      count: 0,
      tableName: 'document_embeddings'
    },
    scrape_embeddings: {
      enabled: true,
      trustedSites: [],
      autoFilter: true,
      llmReview: true,
      count: 0,
      tableName: 'scrape_embeddings'
    },
    message_embeddings: {
      enabled: true,
      userApproval: true,
      anonymize: true,
      retentionDays: 90,
      count: 0,
      tableName: 'message_embeddings'
    }
  });

  const [loading, setLoading] = useState(false);
  const [dimensions, setDimensions] = useState<Array<{ dimension: number; count: number; provider: string }>>([]);
  const { toast } = useToast();

  // Update setting function
  const updateSetting = async (section: keyof EmbeddingConfig, key: string, value: any) => {
    try {
      setLoading(true);

      // Update local state
      setConfig(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [key]: value
        }
      }));

      // Send to backend
      const response = await fetch(apiConfig.getApiUrl('/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [`${section}.${key}`]: value
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update setting');
      }

      toast({
        title: 'Setting Updated',
        description: `${section}.${key} has been updated`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update setting',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const [unified, documents, scrape, messages, mainStats, syncStatsRes] = await Promise.all([
        fetch(apiConfig.getApiUrl('/embeddings/unified/stats')).then(r => r.json()),
        fetch(apiConfig.getApiUrl('/embeddings/documents/stats')).then(r => r.json()),
        fetch(apiConfig.getApiUrl('/embeddings/scrape/stats')).then(r => r.json()),
        fetch(apiConfig.getApiUrl('/embeddings/messages/stats')).then(r => r.json()),
        fetch(apiConfig.getApiUrl('/v2/embeddings/stats')).then(r => r.json()).catch(() => null),
        fetch(apiConfig.getApiUrl('/v2/embeddings-sync/stats')).then(r => r.json()).catch(() => null)
      ]);

      setConfig(prev => ({
        ...prev,
        unified_embeddings: { ...prev.unified_embeddings, count: unified.count || 0 },
        document_embeddings: { ...prev.document_embeddings, count: documents.count || 0 },
        scrape_embeddings: { ...prev.scrape_embeddings, count: scrape.count || 0 },
        message_embeddings: { ...prev.message_embeddings, count: messages.count || 0 }
      }));

      // Set dimension stats if available
      if (mainStats?.dimensions) {
        setDimensions(mainStats.dimensions);
      }

      // Set sync stats
      if (syncStatsRes?.success) {
        setSyncStats(syncStatsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  // Sync functions
  const syncDocumentEmbeddings = async () => {
    try {
      setSyncLoading('documents');
      const response = await fetch(apiConfig.getApiUrl('/v2/embeddings-sync/documents'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Sync Completed',
          description: `Synced ${result.data.synced} document embeddings to unified table`,
        });
        fetchStats();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSyncLoading(null);
    }
  };

  const syncScrapeEmbeddings = async () => {
    try {
      setSyncLoading('scrapes');
      const response = await fetch(apiConfig.getApiUrl('/v2/embeddings-sync/scrapes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Sync Completed',
          description: `Synced ${result.data.synced} scrape embeddings to unified table`,
        });
        fetchStats();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSyncLoading(null);
    }
  };

  const generateScrapeEmbeddings = async () => {
    try {
      setSyncLoading('generate-scrapes');
      const response = await fetch(apiConfig.getApiUrl('/v2/embeddings-sync/scrapes/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Generation Started',
          description: `Generated embeddings for ${result.data.processed} scraped content items`,
        });
        fetchStats();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSyncLoading(null);
    }
  };

  const syncAll = async () => {
    try {
      setSyncLoading('all');
      const response = await fetch(apiConfig.getApiUrl('/v2/embeddings-sync/all'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Full Sync Completed',
          description: `Documents: ${result.data.documents.synced}, Scrapes: ${result.data.scrapes.synced}`,
        });
        fetchStats();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSyncLoading(null);
    }
  };

  const cleanupOrphaned = async () => {
    try {
      setSyncLoading('cleanup');
      const response = await fetch(apiConfig.getApiUrl('/v2/embeddings-sync/cleanup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Cleanup Completed',
          description: `Removed ${result.data.removed} orphaned embeddings`,
        });
        fetchStats();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: 'Cleanup Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSyncLoading(null);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Unified Embeddings - Migrated Data */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              <div>
                <CardTitle>Unified Embeddings</CardTitle>
                <CardDescription>
                  Migrated data and legacy embeddings
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline">{config.unified_embeddings.count.toLocaleString()} vectors</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Unified Embeddings</Label>
              <p className="text-xs text-muted-foreground">
                Use for migrated legacy data
              </p>
            </div>
            <Switch
              checked={config.unified_embeddings.enabled}
              onCheckedChange={(checked) => updateSetting('unified_embeddings', 'enabled', checked)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Table:</span>
              <span className="ml-2 font-mono">{config.unified_embeddings.tableName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Last migrated:</span>
              <span className="ml-2">{config.unified_embeddings.lastMigrated}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Document Embeddings - Files */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-500" />
              <div>
                <CardTitle>Document Embeddings</CardTitle>
                <CardDescription>
                  PDF, DOCX, TXT, CSV, JSON, MD files
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline">{config.document_embeddings.count.toLocaleString()} vectors</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Document Embeddings</Label>
              <p className="text-xs text-muted-foreground">
                Process uploaded documents
              </p>
            </div>
            <Switch
              checked={config.document_embeddings.enabled}
              onCheckedChange={(checked) => updateSetting('document_embeddings', 'enabled', checked)}
            />
          </div>

          <div>
            <Label>Allowed File Types</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {['pdf', 'docx', 'txt', 'csv', 'json', 'md'].map(type => (
                <Button
                  key={type}
                  variant={config.document_embeddings.allowedTypes.includes(type) ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const newTypes = config.document_embeddings.allowedTypes.includes(type)
                      ? config.document_embeddings.allowedTypes.filter(t => t !== type)
                      : [...config.document_embeddings.allowedTypes, type];
                    updateSetting('document_embeddings', 'allowedTypes', newTypes);
                  }}
                >
                  {type.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label>Max File Size: {config.document_embeddings.maxSize}MB</Label>
            <Input
              type="range"
              min="1"
              max="100"
              value={config.document_embeddings.maxSize}
              onChange={(e) => updateSetting('document_embeddings', 'maxSize', parseInt(e.target.value))}
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Scrape Embeddings - Web Data */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-purple-500" />
              <div>
                <CardTitle>Scrape Embeddings</CardTitle>
                <CardDescription>
                  Web scraped data with filtering
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline">{config.scrape_embeddings.count.toLocaleString()} vectors</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Scrape Embeddings</Label>
              <p className="text-xs text-muted-foreground">
                Process scraped web content
              </p>
            </div>
            <Switch
              checked={config.scrape_embeddings.enabled}
              onCheckedChange={(checked) => updateSetting('scrape_embeddings', 'enabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-filter Content</Label>
              <p className="text-xs text-muted-foreground">
                Remove junk and irrelevant data
              </p>
            </div>
            <Switch
              checked={config.scrape_embeddings.autoFilter}
              onCheckedChange={(checked) => updateSetting('scrape_embeddings', 'autoFilter', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>LLM Review</Label>
              <p className="text-xs text-muted-foreground">
                AI validates content quality
              </p>
            </div>
            <Switch
              checked={config.scrape_embeddings.llmReview}
              onCheckedChange={(checked) => updateSetting('scrape_embeddings', 'llmReview', checked)}
            />
          </div>

          <div>
            <Label>Trusted Sites (comma-separated)</Label>
            <Input
              placeholder="example.com, trusted-site.org"
              value={config.scrape_embeddings.trustedSites.join(', ')}
              onChange={(e) => updateSetting('scrape_embeddings', 'trustedSites',
                e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              )}
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Message Embeddings - Chat Data */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-500" />
              <div>
                <CardTitle>Message Embeddings</CardTitle>
                <CardDescription>
                  Chat Q&A pairs with user control
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline">{config.message_embeddings.count.toLocaleString()} vectors</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Message Embeddings</Label>
              <p className="text-xs text-muted-foreground">
                Store chat conversations
              </p>
            </div>
            <Switch
              checked={config.message_embeddings.enabled}
              onCheckedChange={(checked) => updateSetting('message_embeddings', 'enabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Require User Approval</Label>
              <p className="text-xs text-muted-foreground">
                Only save with permission
              </p>
            </div>
            <Switch
              checked={config.message_embeddings.userApproval}
              onCheckedChange={(checked) => updateSetting('message_embeddings', 'userApproval', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Anonymize Data</Label>
              <p className="text-xs text-muted-foreground">
                Remove personal information
              </p>
            </div>
            <Switch
              checked={config.message_embeddings.anonymize}
              onCheckedChange={(checked) => updateSetting('message_embeddings', 'anonymize', checked)}
            />
          </div>

          <div>
            <Label>Retention Period: {config.message_embeddings.retentionDays} days</Label>
            <Input
              type="range"
              min="7"
              max="365"
              value={config.message_embeddings.retentionDays}
              onChange={(e) => updateSetting('message_embeddings', 'retentionDays', parseInt(e.target.value))}
              className="mt-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1 week</span>
              <span>1 year</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Old
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Operations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-indigo-500" />
              <div>
                <CardTitle>Sync Operations</CardTitle>
                <CardDescription>
                  Sync embeddings to unified table for unified search
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              disabled={!!syncLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sync Status */}
          {syncStats && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <div className="text-sm font-medium">Document Embeddings</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold">{syncStats.document_embeddings.synced}</span>
                  <span className="text-muted-foreground">/ {syncStats.document_embeddings.total} synced</span>
                </div>
                {syncStats.document_embeddings.unsynced > 0 && (
                  <Badge variant="secondary" className="mt-1">
                    {syncStats.document_embeddings.unsynced} unsynced
                  </Badge>
                )}
              </div>
              <div>
                <div className="text-sm font-medium">Scrape Embeddings</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold">{syncStats.scrape_embeddings.synced}</span>
                  <span className="text-muted-foreground">/ {syncStats.scrape_embeddings.total} synced</span>
                </div>
                {syncStats.scrape_embeddings.unsynced > 0 && (
                  <Badge variant="secondary" className="mt-1">
                    {syncStats.scrape_embeddings.unsynced} unsynced
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Sync Actions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Document Embeddings</Label>
              <Button
                className="w-full"
                variant="outline"
                onClick={syncDocumentEmbeddings}
                disabled={!!syncLoading}
              >
                {syncLoading === 'documents' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync to Unified
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Scrape Embeddings</Label>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={generateScrapeEmbeddings}
                  disabled={!!syncLoading}
                >
                  {syncLoading === 'generate-scrapes' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4 mr-2" />
                  )}
                  Generate
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={syncScrapeEmbeddings}
                  disabled={!!syncLoading}
                >
                  {syncLoading === 'scrapes' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync
                </Button>
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={syncAll}
              disabled={!!syncLoading}
              className="flex-1"
            >
              {syncLoading === 'all' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Sync All to Unified
            </Button>
            <Button
              variant="destructive"
              onClick={cleanupOrphaned}
              disabled={!!syncLoading}
            >
              {syncLoading === 'cleanup' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Cleanup Orphaned
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Embedding Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {config.unified_embeddings.count.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Unified</div>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {config.document_embeddings.count.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Documents</div>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {config.scrape_embeddings.count.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Scraped</div>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {config.message_embeddings.count.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Messages</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total vectors:</span>
              <span className="font-semibold">
                {(config.unified_embeddings.count +
                  config.document_embeddings.count +
                  config.scrape_embeddings.count +
                  config.message_embeddings.count).toLocaleString()}
              </span>
            </div>
            {dimensions.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <div className="text-sm text-muted-foreground mb-2">Embedding Dimensions:</div>
                <div className="flex flex-wrap gap-2">
                  {dimensions.map((dim, idx) => (
                    <Badge
                      key={idx}
                      variant={dim.dimension === 1536 ? "default" : dim.dimension === 768 ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {dim.dimension} dim ({dim.provider}) - {dim.count.toLocaleString()} vectors
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmbeddingsManagement;