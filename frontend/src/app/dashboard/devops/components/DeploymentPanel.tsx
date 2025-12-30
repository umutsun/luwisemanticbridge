'use client';

import React, { useState, useEffect } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Rocket,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  RefreshCw,
  Terminal,
  Server,
  AlertTriangle,
  History
} from 'lucide-react';
import { useDeployment, DeployResult } from '@/hooks/useDevOps';

interface ServerConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  ssh_key_id?: string;
  tenants: string[];
}

interface DeploymentRecord {
  id: string;
  tenant_id: string;
  deploy_type: string;
  status: 'success' | 'failed' | 'in_progress';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  git_commit_before?: string;
  git_commit_after?: string;
  logs?: string;
}

const DEPLOY_TYPES = [
  { value: 'full', label: 'Full Deploy', description: 'Git pull, npm install, build, restart all services' },
  { value: 'backend', label: 'Backend Only', description: 'Deploy Node.js backend only' },
  { value: 'frontend', label: 'Frontend Only', description: 'Deploy Next.js frontend only' },
  { value: 'python', label: 'Python Services', description: 'Deploy Python microservices' },
  { value: 'hotfix', label: 'Hot Fix', description: 'Quick git pull and restart (no build)' },
  { value: 'restart', label: 'Restart Only', description: 'Restart PM2 services without code changes' },
];

const TENANT_PATHS: Record<string, string> = {
  'geolex': '/var/www/geolex',
  'vergilex': '/var/www/vergilex',
  'bookie': '/var/www/bookie',
};

export default function DeploymentPanel() {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [deployType, setDeployType] = useState<string>('full');
  const [deployHistory, setDeployHistory] = useState<DeploymentRecord[]>([]);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<string>('');

  const {
    deploying,
    error,
    deployResult,
    deploy,
    clearCache,
    getGitStatus,
    getPM2Status,
    getDeploymentHistory
  } = useDeployment();

  const [gitStatus, setGitStatus] = useState<string>('');
  const [pm2Status, setPM2Status] = useState<any[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    loadServers();
    loadDeployHistory();
  }, []);

  useEffect(() => {
    if (deployResult) {
      // Add to local history
      const record: DeploymentRecord = {
        id: deployResult.deploy_id,
        tenant_id: deployResult.tenant_id,
        deploy_type: deployResult.deploy_type,
        status: deployResult.success ? 'success' : 'failed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: deployResult.duration_ms,
        git_commit_before: deployResult.git_commit_before,
        git_commit_after: deployResult.git_commit_after,
        logs: deployResult.logs
      };

      const newHistory = [record, ...deployHistory].slice(0, 50);
      setDeployHistory(newHistory);
      localStorage.setItem('devops_deploy_history', JSON.stringify(newHistory));
    }
  }, [deployResult]);

  const loadServers = () => {
    const stored = localStorage.getItem('devops_servers');
    if (stored) {
      const parsed = JSON.parse(stored);
      setServers(parsed);
      if (parsed.length > 0) {
        setSelectedServer(parsed[0].id);
        if (parsed[0].tenants.length > 0) {
          setSelectedTenant(parsed[0].tenants[0]);
        }
      }
    }
  };

  const loadDeployHistory = () => {
    const stored = localStorage.getItem('devops_deploy_history');
    if (stored) {
      setDeployHistory(JSON.parse(stored));
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

  const handleDeploy = async () => {
    const credentials = getServerCredentials(selectedServer);
    if (!credentials) {
      alert('Please configure SSH key for the selected server');
      return;
    }

    const tenantPath = TENANT_PATHS[selectedTenant] || `/var/www/${selectedTenant}`;

    try {
      await deploy({
        ...credentials,
        tenant_id: selectedTenant,
        tenant_path: tenantPath,
        deploy_type: deployType as any
      });
    } catch (err) {
      console.error('Deployment failed:', err);
    }
  };

  const handleRefreshStatus = async () => {
    const credentials = getServerCredentials(selectedServer);
    if (!credentials) return;

    const tenantPath = TENANT_PATHS[selectedTenant] || `/var/www/${selectedTenant}`;

    setLoadingStatus(true);
    try {
      const [gitResult, pm2Result] = await Promise.all([
        getGitStatus({ ...credentials, tenant_id: selectedTenant, tenant_path: tenantPath }),
        getPM2Status(credentials, selectedTenant)
      ]);

      setGitStatus(gitResult.output);
      setPM2Status(pm2Result.services || []);
    } catch (err) {
      console.error('Failed to refresh status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleClearCache = async () => {
    const credentials = getServerCredentials(selectedServer);
    if (!credentials) return;

    const tenantPath = TENANT_PATHS[selectedTenant] || `/var/www/${selectedTenant}`;

    try {
      await clearCache({ ...credentials, tenant_id: selectedTenant, tenant_path: tenantPath });
      alert('Cache cleared successfully');
    } catch (err: any) {
      alert(`Failed to clear cache: ${err.message}`);
    }
  };

  const showLogs = (logs: string) => {
    setSelectedLogs(logs);
    setShowLogsDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            In Progress
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const selectedServerConfig = servers.find(s => s.id === selectedServer);

  return (
    <div className="space-y-4">
      {/* Deploy Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Deployment Manager
          </CardTitle>
          <CardDescription>
            Deploy updates to production instances with one click
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Server & Tenant Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Target Server</label>
              <Select value={selectedServer} onValueChange={setSelectedServer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        {server.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Tenant</label>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {selectedServerConfig?.tenants.map((tenant) => (
                    <SelectItem key={tenant} value={tenant}>
                      {tenant}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Deploy Type</label>
              <Select value={deployType} onValueChange={setDeployType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPLOY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleDeploy}
              disabled={deploying || !selectedServer || !selectedTenant}
              size="lg"
            >
              {deploying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleRefreshStatus}
              disabled={loadingStatus || !selectedServer || !selectedTenant}
            >
              {loadingStatus ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh Status
            </Button>

            <Button
              variant="outline"
              onClick={handleClearCache}
              disabled={!selectedServer || !selectedTenant}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Clear Cache
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Current Status */}
          {(gitStatus || pm2Status.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gitStatus && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <GitBranch className="w-4 h-4" />
                      Git Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap max-h-32">
                      {gitStatus}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {pm2Status.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      PM2 Services
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pm2Status.map((service: any, index: number) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span>{service.name}</span>
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
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deployment History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Deployment History
          </CardTitle>
          <CardDescription>
            Recent deployments across all tenants
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deployHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Rocket className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No deployments yet</p>
              <p className="text-sm">Deploy your first update to see it here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deployHistory.slice(0, 10).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.tenant_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.deploy_type}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {record.duration_ms
                        ? `${(record.duration_ms / 1000).toFixed(1)}s`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(record.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {record.logs && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => showLogs(record.logs!)}
                        >
                          <Terminal className="w-4 h-4 mr-1" />
                          Logs
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Logs Dialog */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Deployment Logs</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <pre className="bg-muted p-4 rounded-md text-xs h-96 overflow-auto font-mono whitespace-pre-wrap">
              {selectedLogs || 'No logs available'}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
