'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Server,
  Key,
  Shield,
  Rocket,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react';

// Components
import ServerManager from './components/ServerManager';
import SSHKeyManager from './components/SSHKeyManager';
import SecurityScanner from './components/SecurityScanner';
import DeploymentPanel from './components/DeploymentPanel';
import MonitoringDashboard from './components/MonitoringDashboard';

export default function DevOpsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('servers');
  const [healthStatus, setHealthStatus] = useState<{
    status: 'healthy' | 'unhealthy' | 'checking';
    message?: string;
  }>({ status: 'checking' });

  // Check DevOps service health on mount
  useEffect(() => {
    checkServiceHealth();
  }, []);

  const checkServiceHealth = async () => {
    setHealthStatus({ status: 'checking' });
    try {
      const response = await fetch('/api/v2/devops/health');
      if (response.ok) {
        const data = await response.json();
        setHealthStatus({
          status: data.encryption_enabled ? 'healthy' : 'unhealthy',
          message: data.encryption_enabled
            ? 'DevOps service is running'
            : 'Encryption key not configured'
        });
      } else {
        setHealthStatus({
          status: 'unhealthy',
          message: 'DevOps service is not responding'
        });
      }
    } catch (error) {
      setHealthStatus({
        status: 'unhealthy',
        message: 'Cannot connect to DevOps service'
      });
    }
  };

  const getStatusBadge = () => {
    switch (healthStatus.status) {
      case 'healthy':
        return (
          <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Healthy
          </Badge>
        );
      case 'unhealthy':
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
            <XCircle className="w-3 h-3 mr-1" />
            Unhealthy
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Checking
          </Badge>
        );
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="w-8 h-8 text-primary" />
            DevOps Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage servers, SSH keys, security, and deployments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <button
            onClick={checkServiceHealth}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Service Warning */}
      {healthStatus.status === 'unhealthy' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {healthStatus.message || 'DevOps service is not available'}.
            Please ensure the Python microservice is running and properly configured.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="servers" className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            <span className="hidden sm:inline">Servers</span>
          </TabsTrigger>
          <TabsTrigger value="ssh-keys" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">SSH Keys</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="deployments" className="flex items-center gap-2">
            <Rocket className="w-4 h-4" />
            <span className="hidden sm:inline">Deploy</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">Monitor</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className="space-y-4">
          <ServerManager />
        </TabsContent>

        <TabsContent value="ssh-keys" className="space-y-4">
          <SSHKeyManager />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <SecurityScanner />
        </TabsContent>

        <TabsContent value="deployments" className="space-y-4">
          <DeploymentPanel />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <MonitoringDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
