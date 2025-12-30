'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  RefreshCw,
  Loader2,
  Server,
  AlertTriangle
} from 'lucide-react';
import { useSelfMetrics, usePM2Services, useAlerts, ServerMetrics, Alert as AlertType } from '@/hooks/useDevOps';

export default function SelfMonitoringPanel() {
  const { metrics, loading: metricsLoading, error: metricsError, loadMetrics } = useSelfMetrics();
  const { services, loading: servicesLoading, loadServices } = usePM2Services();
  const { alerts, loading: alertsLoading, loadAlerts, acknowledgeAlert } = useAlerts();

  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadMetrics();
        loadServices();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, loadMetrics, loadServices]);

  const handleRefreshAll = () => {
    loadMetrics();
    loadServices();
    loadAlerts();
  };

  const parsePercent = (value: string) => {
    const num = parseFloat(value.replace('%', ''));
    return isNaN(num) ? 0 : num;
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatUptime = (uptime: string) => {
    // Already formatted from server
    return uptime;
  };

  return (
    <div className="space-y-4">
      {/* Refresh Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={metricsLoading || servicesLoading}
          >
            {(metricsLoading || servicesLoading) ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
          </Button>
        </div>
        {metrics?.timestamp && (
          <span className="text-sm text-muted-foreground">
            Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Server Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Server Metrics
          </CardTitle>
          <CardDescription>
            Real-time system resource usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metricsError ? (
            <div className="text-center py-6 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Failed to load metrics</p>
              <p className="text-sm">{metricsError}</p>
              <Button variant="link" onClick={loadMetrics}>
                Retry
              </Button>
            </div>
          ) : metrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* CPU */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">CPU</span>
                  </div>
                  <span className="text-lg font-bold">{metrics.cpu}</span>
                </div>
                <Progress
                  value={parsePercent(metrics.cpu)}
                  className={`h-2 ${getUsageColor(parsePercent(metrics.cpu))}`}
                />
              </div>

              {/* RAM */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MemoryStick className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Memory</span>
                  </div>
                  <span className="text-lg font-bold">{metrics.ram}</span>
                </div>
                <Progress
                  value={parsePercent(metrics.ram)}
                  className={`h-2 ${getUsageColor(parsePercent(metrics.ram))}`}
                />
              </div>

              {/* Disk */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Disk</span>
                  </div>
                  <span className="text-lg font-bold">{metrics.disk}</span>
                </div>
                <Progress
                  value={parsePercent(metrics.disk)}
                  className={`h-2 ${getUsageColor(parsePercent(metrics.disk))}`}
                />
              </div>

              {/* Load Average */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Load Average</span>
                </div>
                <div className="text-xl font-bold">{metrics.load}</div>
              </div>

              {/* Processes */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Processes</span>
                </div>
                <div className="text-xl font-bold">{metrics.procs}</div>
              </div>

              {/* Uptime */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Uptime</span>
                </div>
                <div className="text-xl font-bold">{formatUptime(metrics.uptime)}</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No metrics data</p>
              <Button variant="link" onClick={loadMetrics}>
                Load Metrics
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PM2 Services Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            PM2 Services
          </CardTitle>
          <CardDescription>
            Application service status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {services.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {services.map((service) => (
                <div
                  key={service.name}
                  className={`p-4 rounded-lg border ${
                    service.status === 'online'
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium truncate">{service.name}</span>
                    <Badge
                      className={
                        service.status === 'online'
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-red-500/10 text-red-600'
                      }
                    >
                      {service.status}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>CPU</span>
                      <span>{service.cpu}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Memory</span>
                      <span>{(service.memory / 1024 / 1024).toFixed(0)} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Uptime</span>
                      <span>{Math.floor(service.uptime / 1000 / 60)} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Restarts</span>
                      <span>{service.restarts}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No services loaded</p>
              <Button variant="link" onClick={loadServices}>
                Load PM2 Status
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Active Alerts
          </CardTitle>
          <CardDescription>
            System warnings and notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.severity === 'critical'
                      ? 'bg-red-500/5 border-red-500/20'
                      : alert.severity === 'high'
                      ? 'bg-orange-500/5 border-orange-500/20'
                      : alert.severity === 'medium'
                      ? 'bg-yellow-500/5 border-yellow-500/20'
                      : 'bg-blue-500/5 border-blue-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            alert.severity === 'critical'
                              ? 'bg-red-500 text-white'
                              : alert.severity === 'high'
                              ? 'bg-orange-500 text-white'
                              : alert.severity === 'medium'
                              ? 'bg-yellow-500 text-white'
                              : 'bg-blue-500 text-white'
                          }
                        >
                          {alert.severity.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{alert.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => acknowledgeAlert(alert.id)}
                    >
                      Acknowledge
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active alerts</p>
              <Button variant="link" onClick={loadAlerts}>
                Check for Alerts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
