'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  Terminal,
  AlertTriangle,
  History,
  RefreshCw
} from 'lucide-react';
import { useSelfDeploy, usePM2Services, DeployResult } from '@/hooks/useDevOps';

interface DeploymentRecord {
  id: string;
  deploy_type: string;
  status: 'success' | 'failed' | 'in_progress';
  started_at: string;
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

export default function SelfDeployPanel() {
  const [deployType, setDeployType] = useState<string>('full');
  const [deployHistory, setDeployHistory] = useState<DeploymentRecord[]>([]);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<string>('');

  const { deploying, error, result: deployResult, deploy } = useSelfDeploy();
  const { services, loading: servicesLoading, loadServices, restartService } = usePM2Services();

  // Load deploy history on mount
  useEffect(() => {
    const stored = localStorage.getItem('devops_self_deploy_history');
    if (stored) {
      setDeployHistory(JSON.parse(stored));
    }
  }, []);

  // Save deploy result to history
  useEffect(() => {
    if (deployResult) {
      const record: DeploymentRecord = {
        id: deployResult.deploy_id,
        deploy_type: deployResult.deploy_type,
        status: deployResult.success ? 'success' : 'failed',
        started_at: new Date().toISOString(),
        duration_ms: deployResult.duration_ms,
        git_commit_before: deployResult.git_commit_before,
        git_commit_after: deployResult.git_commit_after,
        logs: deployResult.logs
      };

      const newHistory = [record, ...deployHistory].slice(0, 50);
      setDeployHistory(newHistory);
      localStorage.setItem('devops_self_deploy_history', JSON.stringify(newHistory));
    }
  }, [deployResult]);

  const handleDeploy = async () => {
    try {
      await deploy(deployType as any);
      // Refresh PM2 status after deploy
      await loadServices();
    } catch (err) {
      console.error('Deployment failed:', err);
    }
  };

  const handleRestartService = async (service: 'backend' | 'frontend' | 'python' | 'all') => {
    try {
      await restartService(service);
    } catch (err) {
      console.error('Restart failed:', err);
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

  const getPM2StatusBadge = (status: string) => {
    return status === 'online' ? (
      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
        {status}
      </Badge>
    ) : (
      <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Deploy Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Self Deploy
          </CardTitle>
          <CardDescription>
            Deploy updates to this tenant instance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Deploy Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="flex items-end gap-2">
              <Button
                onClick={handleDeploy}
                disabled={deploying}
                size="lg"
                className="flex-1"
              >
                {deploying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Deploy Now
                  </>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Last Deploy Result */}
          {deployResult && (
            <Alert variant={deployResult.success ? 'default' : 'destructive'}>
              {deployResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="font-medium">
                  {deployResult.success ? 'Deployment Successful' : 'Deployment Failed'}
                </div>
                <div className="text-sm mt-1">
                  Duration: {(deployResult.duration_ms / 1000).toFixed(1)}s
                  {deployResult.git_commit_after && (
                    <> • Commit: {deployResult.git_commit_after.substring(0, 7)}</>
                  )}
                </div>
                {deployResult.logs && (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto mt-1"
                    onClick={() => showLogs(deployResult.logs)}
                  >
                    View Logs
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* PM2 Services */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">PM2 Services</CardTitle>
              <CardDescription>Manage and restart services</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadServices()}
              disabled={servicesLoading}
            >
              {servicesLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {services.length > 0 ? (
            <div className="space-y-3">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium">{service.name}</div>
                      <div className="text-xs text-muted-foreground">
                        CPU: {service.cpu}% • Memory: {(service.memory / 1024 / 1024).toFixed(0)}MB
                        • Restarts: {service.restarts}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getPM2StatusBadge(service.status)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const serviceType = service.name.includes('backend')
                          ? 'backend'
                          : service.name.includes('frontend')
                          ? 'frontend'
                          : 'python';
                        handleRestartService(serviceType);
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => handleRestartService('all')}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Restart All Services
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <p>No services loaded</p>
              <Button variant="link" onClick={() => loadServices()}>
                Load PM2 Status
              </Button>
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
            Recent deployments for this tenant
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
