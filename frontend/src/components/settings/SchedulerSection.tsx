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
  Plus,
  Trash2,
  Pencil
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
  job_config?: Record<string, unknown>;
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
  id: string;
  label: string;
  description: string;
  script: string;
  category: string;
}

// GİB kategorileri ve Mevzuat türleri - gerçek crawler scriptlerine uygun
const AVAILABLE_CRAWLERS: CrawlerOption[] = [
  // GİB Crawlers
  { id: 'gib_sirkuler', label: 'GİB Sirküler', description: 'Sirküler listesi', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_kanunlar', label: 'GİB Kanunlar', description: 'Vergi kanunları', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_gerekceler', label: 'GİB Gerekçeler', description: 'Kanun gerekçeleri', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_tebligler', label: 'GİB Tebliğler', description: 'Vergi tebliğleri', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_yonetmelikler', label: 'GİB Yönetmelikler', description: 'Yönetmelikler', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_ic_genelgeler', label: 'GİB İç Genelgeler', description: 'İç genelgeler', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_genel_yazilar', label: 'GİB Genel Yazılar', description: 'Genel yazılar', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_ozelgeler', label: 'GİB Özelgeler', description: 'Özelgeler', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_cbk', label: 'GİB CBK', description: 'Cumhurbaşkanlığı kararları', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  { id: 'gib_bkk', label: 'GİB BKK', description: 'Bakanlar kurulu kararları', script: 'vergilex_gib_crawler.py', category: 'GİB' },
  // Mevzuat Crawlers
  { id: 'mevzuat_kanun', label: 'Mevzuat Kanunlar', description: 'mevzuat.gov.tr kanunları', script: 'vergilex_mevzuat_crawler.py', category: 'Mevzuat' },
  { id: 'mevzuat_tuzuk', label: 'Mevzuat Tüzükler', description: 'mevzuat.gov.tr tüzükleri', script: 'vergilex_mevzuat_crawler.py', category: 'Mevzuat' },
  { id: 'mevzuat_yonetmelik', label: 'Mevzuat Yönetmelikler', description: 'mevzuat.gov.tr yönetmelikleri', script: 'vergilex_mevzuat_crawler.py', category: 'Mevzuat' },
  { id: 'mevzuat_khk', label: 'Mevzuat KHK', description: 'Kanun hükmünde kararnameler', script: 'vergilex_mevzuat_crawler.py', category: 'Mevzuat' },
  { id: 'mevzuat_cbk', label: 'Mevzuat CBK', description: 'Cumhurbaşkanlığı kararnameleri', script: 'vergilex_mevzuat_crawler.py', category: 'Mevzuat' },
  { id: 'mevzuat_teblig', label: 'Mevzuat Tebliğler', description: 'mevzuat.gov.tr tebliğleri', script: 'vergilex_mevzuat_crawler.py', category: 'Mevzuat' },
];

// Crawler ID → script args mapping
const CRAWLER_ARGS: Record<string, string[]> = {
  // GİB
  'gib_sirkuler': ['sirkuler', '--update'],
  'gib_kanunlar': ['kanunlar', '--update'],
  'gib_gerekceler': ['gerekceler', '--update'],
  'gib_tebligler': ['tebligler', '--update'],
  'gib_yonetmelikler': ['yonetmelikler', '--update'],
  'gib_ic_genelgeler': ['ic_genelgeler', '--update'],
  'gib_genel_yazilar': ['genel_yazilar', '--update'],
  'gib_ozelgeler': ['ozelgeler', '--update'],
  'gib_cbk': ['cbk', '--update'],
  'gib_bkk': ['bkk', '--update'],
  // Mevzuat (MevzuatTur values)
  'mevzuat_kanun': ['--tur', '1', '--update'],
  'mevzuat_tuzuk': ['--tur', '2', '--update'],
  'mevzuat_yonetmelik': ['--tur', '3', '--update'],
  'mevzuat_khk': ['--tur', '4', '--update'],
  'mevzuat_cbk': ['--tur', '6', '--update'],
  'mevzuat_teblig': ['--tur', '9', '--update'],
};

interface JobFormData {
  name: string;
  crawler: string;
  scheduleType: 'cron' | 'interval';
  cronExpression: string;
  intervalHours: number;
  enabled: boolean;
}

const DEFAULT_FORM: JobFormData = {
  name: '',
  crawler: '',
  scheduleType: 'cron',
  cronExpression: '0 3 * * 0', // Her Pazar saat 03:00
  intervalHours: 168, // 1 hafta
  enabled: true
};

export default function SchedulerSection() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [formData, setFormData] = useState<JobFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

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
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const openAddModal = () => {
    setEditingJob(null);
    setFormData(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEditModal = (job: ScheduledJob) => {
    setEditingJob(job);

    // Parse job config to extract crawler ID
    let crawlerId = '';
    if (job.job_config) {
      const config = job.job_config as Record<string, unknown>;
      const scriptPath = config.script_path as string || '';
      const args = config.args as string[] || [];

      // Try to determine crawler from script and args
      if (scriptPath.includes('gib_crawler')) {
        const category = args[0];
        if (category) crawlerId = `gib_${category}`;
      } else if (scriptPath.includes('mevzuat_crawler')) {
        const turIndex = args.indexOf('--tur');
        if (turIndex !== -1) {
          const tur = args[turIndex + 1];
          const turMap: Record<string, string> = {
            '1': 'mevzuat_kanun',
            '2': 'mevzuat_tuzuk',
            '3': 'mevzuat_yonetmelik',
            '4': 'mevzuat_khk',
            '6': 'mevzuat_cbk',
            '9': 'mevzuat_teblig'
          };
          crawlerId = turMap[tur] || '';
        }
      }
    }

    setFormData({
      name: job.name,
      crawler: crawlerId,
      scheduleType: job.schedule_type as 'cron' | 'interval',
      cronExpression: job.cron_expression || '0 3 * * 0',
      intervalHours: job.interval_seconds ? Math.round(job.interval_seconds / 3600) : 168,
      enabled: job.enabled
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('İş adı zorunludur');
      return;
    }
    if (!formData.crawler) {
      toast.error('Crawler seçimi zorunludur');
      return;
    }

    setSaving(true);
    try {
      const crawler = AVAILABLE_CRAWLERS.find(c => c.id === formData.crawler);
      const args = CRAWLER_ARGS[formData.crawler] || [];

      const payload = {
        name: formData.name,
        job_type: 'custom_script',
        description: crawler?.description || '',
        schedule_type: formData.scheduleType,
        cron_expression: formData.scheduleType === 'cron' ? formData.cronExpression : undefined,
        interval_seconds: formData.scheduleType === 'interval' ? formData.intervalHours * 3600 : undefined,
        job_config: {
          script_path: `crawlers/${crawler?.script}`,
          args: args,
          timeout_seconds: 7200 // 2 saat
        },
        enabled: formData.enabled
      };

      let res: Response;
      if (editingJob) {
        res = await fetch(`/api/v2/scheduler/jobs/${editingJob.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/v2/scheduler/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        toast.success(editingJob ? 'İş güncellendi' : 'İş oluşturuldu');
        setShowModal(false);
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.message || 'İşlem başarısız');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
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
        toast.success(updatedJob.enabled ? 'İş etkinleştirildi' : 'İş devre dışı bırakıldı');
      } else {
        toast.error('İşlem başarısız');
      }
    } catch (error) {
      toast.error('İşlem başarısız');
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
        toast.success('İş başlatıldı');
        setTimeout(fetchData, 2000);
      } else {
        toast.error('İş başlatılamadı');
      }
    } catch (error) {
      toast.error('İş başlatılamadı');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Başarılı</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Hatalı</Badge>;
      case 'running':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Çalışıyor</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/30">Bekliyor</Badge>;
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const formatSchedule = (job: ScheduledJob) => {
    if (job.schedule_type === 'cron' && job.cron_expression) {
      // Simple cron description
      const parts = job.cron_expression.split(' ');
      if (parts.length >= 5) {
        const [min, hour, , , dayOfWeek] = parts;
        if (dayOfWeek === '0') return `Her Pazar ${hour}:${min.padStart(2, '0')}`;
        if (dayOfWeek === '*' && hour !== '*') return `Her gün ${hour}:${min.padStart(2, '0')}`;
      }
      return job.cron_expression;
    }
    if (job.schedule_type === 'interval' && job.interval_seconds) {
      const hours = Math.round(job.interval_seconds / 3600);
      if (hours >= 24) return `${Math.round(hours / 24)} günde bir`;
      return `${hours} saatte bir`;
    }
    return '-';
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
              <div className="text-sm text-muted-foreground">Toplam İş</div>
              <p className="text-2xl font-bold mt-1">{stats.total_jobs}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Aktif</div>
              <p className="text-2xl font-bold mt-1 text-green-600">{stats.enabled_jobs}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Başarılı (24s)</div>
              <p className="text-2xl font-bold mt-1 text-green-600">{stats.successful_last_24h}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Hatalı (24s)</div>
              <p className="text-2xl font-bold mt-1 text-red-600">{stats.failed_last_24h}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Jobs List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Zamanlanmış İşler</CardTitle>
              <CardDescription>
                Crawler ve veri işleme görevleri
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openAddModal}>
                <Plus className="h-4 w-4 mr-1" />
                Yeni İş
              </Button>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Henüz zamanlanmış iş yok</p>
              <p className="text-sm mt-1">Yeni İş butonuna tıklayarak crawler ekleyin</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card/30 hover:bg-card/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{job.name}</span>
                      {getStatusBadge(job.last_run_status)}
                      {!job.enabled && (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          Devre Dışı
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatSchedule(job)}</span>
                      <span>Son: {formatDateTime(job.last_run_at)}</span>
                      <span>{job.successful_runs}/{job.total_runs} başarılı</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRunNow(job.id)}
                      disabled={actionLoading === job.id || !job.enabled}
                      title="Şimdi Çalıştır"
                    >
                      {actionLoading === job.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(job)}
                      title="Düzenle"
                    >
                      <Pencil className="h-4 w-4" />
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

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingJob ? 'İşi Düzenle' : 'Yeni Crawler İşi'}
            </DialogTitle>
            <DialogDescription>
              {editingJob ? 'İş ayarlarını güncelleyin' : 'Zamanlanmış crawler görevi oluşturun'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Job Name */}
            <div className="space-y-2">
              <Label htmlFor="jobName">İş Adı</Label>
              <Input
                id="jobName"
                placeholder="Örn: GİB Sirküler Haftalık"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Crawler Selection */}
            <div className="space-y-2">
              <Label>Crawler</Label>
              <Select
                value={formData.crawler}
                onValueChange={(value) => setFormData({ ...formData, crawler: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Crawler seçin" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">GİB</div>
                  {AVAILABLE_CRAWLERS.filter(c => c.category === 'GİB').map((crawler) => (
                    <SelectItem key={crawler.id} value={crawler.id}>
                      {crawler.label}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">Mevzuat</div>
                  {AVAILABLE_CRAWLERS.filter(c => c.category === 'Mevzuat').map((crawler) => (
                    <SelectItem key={crawler.id} value={crawler.id}>
                      {crawler.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Schedule Type */}
            <div className="space-y-2">
              <Label>Zamanlama</Label>
              <Select
                value={formData.scheduleType}
                onValueChange={(value: 'cron' | 'interval') => setFormData({ ...formData, scheduleType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">Cron (Belirli Zaman)</SelectItem>
                  <SelectItem value="interval">Periyodik</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cron / Interval Input */}
            {formData.scheduleType === 'cron' ? (
              <div className="space-y-2">
                <Label htmlFor="cronExpr">Cron İfadesi</Label>
                <Input
                  id="cronExpr"
                  placeholder="0 3 * * 0"
                  value={formData.cronExpression}
                  onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Örnekler: 0 3 * * 0 (Her Pazar 03:00), 0 6 * * * (Her gün 06:00)
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="intervalHours">Tekrar Aralığı (Saat)</Label>
                <Input
                  id="intervalHours"
                  type="number"
                  min={1}
                  value={formData.intervalHours}
                  onChange={(e) => setFormData({ ...formData, intervalHours: parseInt(e.target.value) || 168 })}
                />
                <p className="text-xs text-muted-foreground">
                  168 saat = 1 hafta
                </p>
              </div>
            )}

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Aktif</Label>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                editingJob ? 'Güncelle' : 'Oluştur'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
