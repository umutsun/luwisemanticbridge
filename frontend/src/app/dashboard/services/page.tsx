'use client';

import React, { useState, useEffect } from 'react';
import { buildApiUrl } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Server,
  RefreshCw,
  Terminal,
  Database,
  Activity,
  AlertCircle,
  CheckCircle,
  Info,
  Square
} from 'lucide-react';

interface PM2Status {
  status: 'running' | 'stopped';
  online_processes: number;
  total_processes: number;
}

interface SystemInfo {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    version: string;
  };
  redis: {
    host: string;
    port: number;
    database: number;
    version: string;
  };
  backend: {
    port: number;
    nodeEnv: string;
  };
  frontend: {
    port: number;
  };
}

export default function ServicesPage() {
  const { toast } = useToast();

  // PM2 aggregate status
  const [pm2Status, setPm2Status] = useState<PM2Status>({
    status: 'stopped',
    online_processes: 0,
    total_processes: 0
  });

  // System information
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  // Logs
  const [logs, setLogs] = useState<string>('Click "Fetch Logs" to view PM2 logs...');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkServicesStatus();
    const interval = setInterval(() => {
      checkServicesStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Check status of all services by calling backend endpoints
   */
  const checkServicesStatus = async () => {
    try {
      // Check PM2 status
      const pm2Response = await fetch(buildApiUrl('/api/v2/services', 'pm2', 'status'));
      if (pm2Response.ok) {
        const data = await pm2Response.json();
        setPm2Status({
          status: data.status === 'running' ? 'running' : 'stopped',
          online_processes: data.online_processes || 0,
          total_processes: data.total_processes || 0
        });
      } else {
        setPm2Status({ status: 'stopped', online_processes: 0, total_processes: 0 });
      }
    } catch (error) {
      console.error('Failed to check PM2:', error);
      setPm2Status({ status: 'stopped', online_processes: 0, total_processes: 0 });
    }

    try {
      // Fetch system information
      const systemResponse = await fetch(buildApiUrl('/api/v2/services', 'system', 'info'));
      if (systemResponse.ok) {
        const data = await systemResponse.json();
        setSystemInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch system info:', error);
    }
  };

  /**
   * Fetch PM2 logs
   */
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl('/api/v2/services', 'pm2', 'logs'));
      if (response.ok) {
        const text = await response.text();
        setLogs(text || 'Empty logs received.');
      } else {
        setLogs('Failed to fetch logs.');
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs(`Error fetching logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle PM2 actions (restart all / stop all)
   */
  const handlePM2Action = async (action: 'restart' | 'stop') => {
    setLoading(true);

    try {
      const response = await fetch(buildApiUrl('/api/v2/services', 'pm2', action), {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: action === 'restart' ? 'Restarting PM2 Processes' : 'Stopping PM2 Processes',
          description: data.message || `PM2 ${action} command executed successfully`,
          duration: 3000,
        });

        // Refresh status after action
        setTimeout(checkServicesStatus, 2000);
      } else {
        throw new Error('PM2 action failed');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${action} PM2 processes`,
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-gray-400';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge className="bg-green-100 text-green-800 border-green-200">Running</Badge>;
      case 'stopped': return <Badge variant="secondary">Stopped</Badge>;
      case 'error': return <Badge variant="destructive">Error</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Service Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manage Python services and PM2 processes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={checkServicesStatus} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="services" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="pm2">PM2 Processes</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Service Overview
              </CardTitle>
              <CardDescription>
                System services are managed via PM2 and configured through environment variables
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  All services (Python, Node.js, Database, Redis) are monitored and controlled through the PM2 tab.
                  Configuration is loaded from .env.lsemb file.
                </AlertDescription>
              </Alert>

              {systemInfo && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-medium mb-3">Current Configuration</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Backend Port:</span>
                      <span className="ml-2 font-mono">{systemInfo.backend.port}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Frontend Port:</span>
                      <span className="ml-2 font-mono">{systemInfo.frontend.port}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Environment:</span>
                      <span className="ml-2 font-mono">{systemInfo.backend.nodeEnv}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Database:</span>
                      <span className="ml-2 font-mono">{systemInfo.database.database}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PM2 Tab */}
        <TabsContent value="pm2" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                PM2 Process Manager
              </CardTitle>
              <CardDescription>
                Manage all PM2 processes collectively
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* PM2 Status */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${getStatusColor(pm2Status.status)}`} />
                    <span className="font-medium">PM2 Status</span>
                  </div>
                  {getStatusBadge(pm2Status.status)}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-muted-foreground">Online:</span>
                    <span className="font-mono font-medium">{pm2Status.online_processes}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-mono font-medium">{pm2Status.total_processes}</span>
                  </div>
                </div>
              </div>

              {/* PM2 Actions */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handlePM2Action('restart')}
                    disabled={loading}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Restart All Processes
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handlePM2Action('stop')}
                    disabled={loading}
                    className="flex-1"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop All Processes
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  These actions affect all PM2-managed processes (frontend, backend, and Python services)
                </p>
              </div>

              {pm2Status.status === 'stopped' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    PM2 is not responding. Ensure PM2 is installed and processes are configured.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* System Services */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-5 w-5" />
                  PostgreSQL + pgvector
                </CardTitle>
              </CardHeader>
              <CardContent>
                {systemInfo ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Host</span>
                      <span className="font-mono">{systemInfo.database.host}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Port</span>
                      <span className="font-mono">{systemInfo.database.port}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Database</span>
                      <span className="font-mono text-xs">{systemInfo.database.database}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">User</span>
                      <span className="font-mono text-xs">{systemInfo.database.user}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-xs">{systemInfo.database.version}</span>
                    </div>
                    <Button variant="outline" className="w-full mt-4" disabled>
                      <Terminal className="h-4 w-4 mr-2" />
                      psql Console
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-5 w-5" />
                  Redis Cache
                </CardTitle>
              </CardHeader>
              <CardContent>
                {systemInfo ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Host</span>
                      <span className="font-mono">{systemInfo.redis.host}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Port</span>
                      <span className="font-mono">{systemInfo.redis.port}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Database</span>
                      <span className="font-mono">{systemInfo.redis.database}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-xs">{systemInfo.redis.version}</span>
                    </div>
                    <Button variant="outline" className="w-full mt-4" disabled>
                      <Terminal className="h-4 w-4 mr-2" />
                      redis-cli
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>PM2 Service Logs</CardTitle>
                  <CardDescription>
                    View the latest logs from all PM2-managed processes
                  </CardDescription>
                </div>
                <Button onClick={fetchLogs} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Fetch Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs h-[500px] overflow-y-auto whitespace-pre-wrap">
                {logs}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
