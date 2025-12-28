'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  AlertCircle
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

export default function SchedulerSection() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
