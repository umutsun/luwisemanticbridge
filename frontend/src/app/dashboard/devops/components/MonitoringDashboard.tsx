'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  Server,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Bell,
  BellOff,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useMonitoring, ServerMetrics, Alert as DevOpsAlert } from '@/hooks/useDevOps';

interface ServerConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  ssh_key_id?: string;
}

export default function MonitoringDashboard() {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  const {
    loading,
    error,
    metrics,
    alerts,
    collectMetrics,
    getActiveAlerts,
    acknowledgeAlert
  } = useMonitoring();

  useEffect(() => {
    loadServers();
    loadAlerts();
  }, []);

  useEffect(() => {
    if (autoRefresh && selectedServer) {
      const interval = setInterval(() => {
        handleRefreshMetrics();
      }, 30000); // Every 30 seconds
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [autoRefresh, selectedServer]);

  const loadServers = () => {
    const stored = localStorage.getItem('devops_servers');
    if (stored) {
      const parsed = JSON.parse(stored);
      setServers(parsed);
      if (parsed.length > 0) {
        setSelectedServer(parsed[0].id);
      }
    }
  };

  const loadAlerts = async () => {
    try {
      await getActiveAlerts();
    } catch (err) {
      console.error('Failed to load alerts:', err);
    }
  };

  const getServerCredentials = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server || !server.ssh_key_id) return null;

    const keyData = localStorage.getItem(`ssh_key_${server.ssh_key_id}`);
    if (!keyData) return null;

    const key = JSON.parse(keyData);
    return {
      hostname: server.hostname,
      private_key: key.private_key,
      username: server.username,
      port: server.port,
      passphrase: key.passphrase
    };
  };

  const handleRefreshMetrics = async () => {
    const credentials = getServerCredentials(selectedServer);
    if (!credentials) return;

    try {
      await collectMetrics(credentials, selectedServer);
    } catch (err) {
      console.error('Failed to collect metrics:', err);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const parseMetricValue = (value: string): number => {
    const match = value.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  };

  const getMetricColor = (value: number): string => {
    if (value >= 90) return 'text-red-600';
    if (value >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getProgressColor = (value: number): string => {
    if (value >= 90) return 'bg-red-500';
    if (value >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getSeverityBadge = (severity: string) => {
    const config: Record<string, string> = {
      critical: 'bg-red-600 text-white',
      high: 'bg-orange-500 text-white',
      medium: 'bg-yellow-500 text-white',
      low: 'bg-blue-500 text-white',
    };

    return (
      <Badge className={config[severity] || 'bg-gray-500 text-white'}>
        {severity.toUpperCase()}
      </Badge>
    );
  };

  const selectedServerConfig = servers.find(s => s.id === selectedServer);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Server Monitoring
            </CardTitle>
            <CardDescription>
              Real-time server metrics and resource usage
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedServer} onValueChange={setSelectedServer}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select server" />
              </SelectTrigger>
              <SelectContent>
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="icon"
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh (30s)'}
            >
              {autoRefresh ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </Button>

            <Button
              variant="outline"
              onClick={handleRefreshMetrics}
              disabled={loading || !selectedServer}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Metrics Grid */}
      {metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* CPU */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getMetricColor(parseMetricValue(metrics.cpu))}`}>
                {metrics.cpu}
              </div>
              <Progress
                value={parseMetricValue(metrics.cpu)}
                className={`mt-2 h-2 ${getProgressColor(parseMetricValue(metrics.cpu))}`}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Load: {metrics.load}
              </p>
            </CardContent>
          </Card>

          {/* Memory */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getMetricColor(parseMetricValue(metrics.ram))}`}>
                {metrics.ram}
              </div>
              <Progress
                value={parseMetricValue(metrics.ram)}
                className={`mt-2 h-2 ${getProgressColor(parseMetricValue(metrics.ram))}`}
              />
              <p className="text-xs text-muted-foreground mt-2">
                {metrics.procs} processes running
              </p>
            </CardContent>
          </Card>

          {/* Disk */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Disk Usage</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getMetricColor(parseMetricValue(metrics.disk))}`}>
                {metrics.disk}
              </div>
              <Progress
                value={parseMetricValue(metrics.disk)}
                className={`mt-2 h-2 ${getProgressColor(parseMetricValue(metrics.disk))}`}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Main disk partition
              </p>
            </CardContent>
          </Card>

          {/* Uptime */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Info</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Uptime</p>
                  <p className="font-semibold">{metrics.uptime}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="font-semibold">
                    {new Date(metrics.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Server</p>
                  <p className="font-semibold">{selectedServerConfig?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Host</p>
                  <p className="font-semibold">{selectedServerConfig?.hostname || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Metrics Available</h3>
            <p className="text-muted-foreground mb-4">
              Select a server and click Refresh to collect metrics
            </p>
            <Button
              onClick={handleRefreshMetrics}
              disabled={loading || !selectedServer}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Collect Metrics
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Active Alerts
            {alerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            System alerts and warnings that need attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p className="font-medium">No Active Alerts</p>
              <p className="text-sm">All systems are running normally</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                    <TableCell className="font-medium">{alert.server_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{alert.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{alert.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {alert.message}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAcknowledgeAlert(alert.id)}
                      >
                        <BellOff className="w-4 h-4 mr-1" />
                        Acknowledge
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
