'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Play,
  Pause,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Calendar,
  Activity,
  AlertCircle,
  Plus,
  Globe,
  Database,
  Sparkles,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  job_type: string;
  schedule_type: string;
  cron_expression?: string;
  interval_seconds?: number;
  enabled: boolean;
  last_run_at?: string;
  last_run_status?: string;
  next_run_at?: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
}

interface SchedulerStats {
  total_jobs: number;
  enabled_jobs: number;
  disabled_jobs: number;
  executions_last_24h: number;
  successful_last_24h: number;
  failed_last_24h: number;
  scheduler_running: boolean;
}

interface CrawlerOption {
  name: string;
  label: string;
  description: string;
}

interface TableOption {
  name: string;
  label: string;
}

interface NewCrawlerJob {
  name: string;
  crawler: string;
  targetTable: string;
  enableEmbed: boolean;
  enableUpsert: boolean;
  scheduleType: 'cron' | 'interval';
  cronExpression: string;
  intervalMinutes: number;
}

const AVAILABLE_CRAWLERS: CrawlerOption[] = [
  { name: 'gib_sirkuler', label: 'GİB Sirküleri', description: 'Gelir İdaresi Başkanlığı sirkülerleri' },
  { name: 'mevzuat_kanun', label: 'Mevzuat Kanunlar', description: 'mevzuat.gov.tr kanunları' },
  { name: 'mevzuat_teblig', label: 'Mevzuat Tebliğler', description: 'mevzuat.gov.tr tebliğleri' },
  { name: 'mevzuat_yonetmelik', label: 'Mevzuat Yönetmelikler', description: 'mevzuat.gov.tr yönetmelikleri' },
  { name: 'sahibinden', label: 'Sahibinden', description: 'Sahibinden.com gayrimenkul ilanları' },
  { name: 'generic', label: 'Genel Crawler', description: 'Özel URL için genel web scraper' },
];

export default function SchedulerSection() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);
  const [newJob, setNewJob] = useState<NewCrawlerJob>({
    name: '',
    crawler: '',
    targetTable: '',
    enableEmbed: false,
    enableUpsert: true,
    scheduleType: 'cron',
    cronExpression: '0 6 * * *', // Daily at 6 AM
    intervalMinutes: 60
  });
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, statsRes] = await Promise.all([
        fetch('/api/v2/scheduler/jobs'),
        fetch('/api/v2/scheduler/stats')
      ]);

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Failed to fetch scheduler data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch available tables when modal opens
  useEffect(() => {
    if (showAddModal) {
      fetchAvailableTables();
    }
  }, [showAddModal]);

  const fetchAvailableTables = async () => {
    try {
      const res = await fetch('/api/v2/source/tables');
      if (res.ok) {
        const data = await res.json();
        const tables = (data.tables || []).map((t: string) => ({
          name: t,
          label: t.replace(/_/g, ' ').replace(/^csv /, '')
        }));
        setAvailableTables(tables);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    }
  };

  const handleCreateJob = async () => {
    if (!newJob.name || !newJob.crawler) {
      toast.error('İsim ve crawler seçimi zorunludur');
      return;
    }

    setCreating(true);
    try {
      // Use scrape_and_embed job type which supports full pipeline
      const crawlerInfo = AVAILABLE_CRAWLERS.find(c => c.name === newJob.crawler);

      const res = await fetch('/api/v2/scheduler/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newJob.name,
          job_type: 'scrape_and_embed',
          description: `${crawlerInfo?.label || newJob.crawler} → ${newJob.targetTable || 'Redis'}`,
          schedule_type: newJob.scheduleType,
          cron_expression: newJob.scheduleType === 'cron' ? newJob.cronExpression : undefined,
          interval_seconds: newJob.scheduleType === 'interval' ? newJob.intervalMinutes * 60 : undefined,
          job_config: {
            scraper_type: newJob.crawler.includes('mevzuat') || newJob.crawler === 'gib_sirkuler' ? 'custom' : newJob.crawler,
            scraper_url: '', // Will be filled by crawler's default URL
            scraper_name: newJob.crawler,
            max_pages: 100,
            redis_db: 2, // Vergilex uses DB 2
            export_to_table: newJob.targetTable === '__none__' ? '' : (newJob.targetTable || ''),
            export_mode: 'upsert',
            generate_embeddings: newJob.enableEmbed,
            embedding_content_column: 'content',
            skip_scrape_if_recent: false,
          },
          enabled: true
        })
      });

      if (res.ok) {
        toast.success('İş başarıyla oluşturuldu');
        setShowAddModal(false);
        setNewJob({
          name: '',
          crawler: '',
          targetTable: '',
          enableEmbed: false,
          enableUpsert: true,
          scheduleType: 'cron',
          cronExpression: '0 6 * * *',
          intervalMinutes: 60
        });
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.message || 'İş oluşturulamadı');
      }
    } catch (error) {
      toast.error('İş oluşturulurken hata oluştu');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Bu işi silmek istediğinize emin misiniz?')) return;

    setActionLoading(jobId);
    try {
      const res = await fetch(`/api/v2/scheduler/jobs/${jobId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        toast.success('İş silindi');
      } else {
        toast.error('İş silinemedi');
      }
    } catch (error) {
      toast.error('İş silinemedi');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggle = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      const res = await fetch(`/api/v2/scheduler/jobs/${jobId}/toggle`, {
        method: 'POST'
      });

      if (res.ok) {
        const updatedJob = await res.json();
        setJobs(prev => prev.map(j => j.id === jobId ? updatedJob : j));
        toast.success(updatedJob.enabled ? 'Job enabled' : 'Job disabled');
      } else {
        toast.error('Failed to toggle job');
      }
    } catch (error) {
      toast.error('Failed to toggle job');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunNow = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      const res = await fetch(`/api/v2/scheduler/jobs/${jobId}/run-now`, {
        method: 'POST'
      });

      if (res.ok) {
        toast.success('Job started');
        // Refresh after a short delay to show updated status
        setTimeout(fetchData, 2000);
      } else {
        toast.error('Failed to run job');
      }
    } catch (error) {
      toast.error('Failed to run job');
    } finally {
      setActionLoading(null);
    }
  };

  const getJobTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'rag_query': 'bg-purple-500/20 text-purple-400',
      'crawler': 'bg-blue-500/20 text-blue-400',
      'embedding_sync': 'bg-green-500/20 text-green-400',
      'cleanup': 'bg-orange-500/20 text-orange-400',
      'custom_script': 'bg-gray-500/20 text-gray-400'
    };
    return colors[type] || 'bg-gray-500/20 text-gray-400';
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Jobs</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.total_jobs}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Active</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.enabled_jobs}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Success (24h)</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.successful_last_24h}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Failed (24h)</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.failed_last_24h}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scheduler Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduled Jobs
              </CardTitle>
              <CardDescription>
                APScheduler-based job scheduling system
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-1" />
                İş Ekle
              </Button>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Yenile
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No scheduled jobs found</p>
              <p className="text-sm">Create jobs via API or run database migration first</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card/30 hover:bg-card/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {/* Status Icon */}
                    {getStatusIcon(job.last_run_status)}

                    {/* Job Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{job.name}</span>
                        <Badge variant="secondary" className={getJobTypeColor(job.job_type)}>
                          {job.job_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span>
                          {job.schedule_type === 'cron' && job.cron_expression}
                          {job.schedule_type === 'interval' && `Every ${job.interval_seconds}s`}
                        </span>
                        <span>Last: {formatDateTime(job.last_run_at)}</span>
                        <span>
                          {job.successful_runs}/{job.total_runs} success
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRunNow(job.id)}
                      disabled={actionLoading === job.id || !job.enabled}
                      title="Run now"
                    >
                      {actionLoading === job.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>

                    <Switch
                      checked={job.enabled}
                      onCheckedChange={() => handleToggle(job.id)}
                      disabled={actionLoading === job.id}
                    />

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteJob(job.id)}
                      disabled={actionLoading === job.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      title="Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Crawler Job Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Crawler İşi Ekle
            </DialogTitle>
            <DialogDescription>
              Zamanlanmış crawler pipeline oluşturun
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Job Name */}
            <div className="space-y-2">
              <Label htmlFor="jobName">İş Adı</Label>
              <Input
                id="jobName"
                placeholder="Örn: GİB Sirküler Günlük"
                value={newJob.name}
                onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
              />
            </div>

            {/* Crawler Selection */}
            <div className="space-y-2">
              <Label>Crawler</Label>
              <Select
                value={newJob.crawler}
                onValueChange={(value) => setNewJob({ ...newJob, crawler: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Crawler seçin" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_CRAWLERS.map((crawler) => (
                    <SelectItem key={crawler.name} value={crawler.name}>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        {crawler.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Table */}
            <div className="space-y-2">
              <Label>Hedef Tablo (Upsert)</Label>
              <Select
                value={newJob.targetTable}
                onValueChange={(value) => setNewJob({ ...newJob, targetTable: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tablo seçin (opsiyonel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Yok</SelectItem>
                  {availableTables.map((table) => (
                    <SelectItem key={table.name} value={table.name}>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        {table.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="enableEmbed"
                  checked={newJob.enableEmbed}
                  onCheckedChange={(checked) => setNewJob({ ...newJob, enableEmbed: checked })}
                />
                <Label htmlFor="enableEmbed" className="flex items-center gap-1 cursor-pointer">
                  <Sparkles className="h-4 w-4" />
                  Embed
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="enableUpsert"
                  checked={newJob.enableUpsert}
                  onCheckedChange={(checked) => setNewJob({ ...newJob, enableUpsert: checked })}
                />
                <Label htmlFor="enableUpsert" className="flex items-center gap-1 cursor-pointer">
                  <Database className="h-4 w-4" />
                  Upsert
                </Label>
              </div>
            </div>

            {/* Schedule Type */}
            <div className="space-y-2">
              <Label>Zamanlama Tipi</Label>
              <Select
                value={newJob.scheduleType}
                onValueChange={(value: 'cron' | 'interval') => setNewJob({ ...newJob, scheduleType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">Cron (Belirli zamanda)</SelectItem>
                  <SelectItem value="interval">Interval (Periyodik)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cron / Interval Input */}
            {newJob.scheduleType === 'cron' ? (
              <div className="space-y-2">
                <Label htmlFor="cronExpr">Cron İfadesi</Label>
                <Input
                  id="cronExpr"
                  placeholder="0 6 * * *"
                  value={newJob.cronExpression}
                  onChange={(e) => setNewJob({ ...newJob, cronExpression: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Örnek: 0 6 * * * = Her gün saat 06:00
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="intervalMin">Interval (dakika)</Label>
                <Input
                  id="intervalMin"
                  type="number"
                  min={1}
                  value={newJob.intervalMinutes}
                  onChange={(e) => setNewJob({ ...newJob, intervalMinutes: parseInt(e.target.value) || 60 })}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              İptal
            </Button>
            <Button onClick={handleCreateJob} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Oluşturuluyor...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Oluştur
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
