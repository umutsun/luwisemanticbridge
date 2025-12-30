'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Server,
  Shield,
  Rocket,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Settings,
  Globe
} from 'lucide-react';

// Hooks
import { useTenantConfig, useHealthCheck } from '@/hooks/useDevOps';

// Components
import SelfDeployPanel from './components/SelfDeployPanel';
import SelfMonitoringPanel from './components/SelfMonitoringPanel';
import SelfSecurityPanel from './components/SelfSecurityPanel';
import NginxPanel from './components/NginxPanel';

export default function DevOpsPage() {
  const [activeTab, setActiveTab] = useState('deploy');

  const { config, loading: configLoading, error: configError, refresh: refreshConfig } = useTenantConfig();
  const { health, loading: healthLoading, refresh: refreshHealth } = useHealthCheck();

  const handleRefresh = () => {
    refreshConfig();
    refreshHealth();
  };

  const getStatusBadge = () => {
    if (healthLoading) {
      return (
        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
          Checking
        </Badge>
      );
    }

    if (health?.status === 'healthy' && health?.ssh_configured) {
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Ready
        </Badge>
      );
    }

    if (health?.status === 'healthy') {
      return (
        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" />
          SSH Not Configured
        </Badge>
      );
    }

    return (
      <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
        <XCircle className="w-3 h-3 mr-1" />
        Offline
      </Badge>
    );
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
            {config ? (
              <>
                Managing <span className="font-semibold text-foreground">{config.tenant_id}</span>
                {' • '}
                <span className="text-xs">{config.tenant_path}</span>
              </>
            ) : (
              'Tenant self-management console'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={configLoading || healthLoading}
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${(configLoading || healthLoading) ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Configuration Error */}
      {configError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {configError}. Please ensure the Python microservice is running and DevOps environment variables are configured.
          </AlertDescription>
        </Alert>
      )}

      {/* SSH Not Configured Warning */}
      {health && !health.ssh_configured && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            SSH is not configured. Add DEVOPS_SSH_HOST, DEVOPS_SSH_USER, and DEVOPS_SSH_KEY_PATH to your .env file.
          </AlertDescription>
        </Alert>
      )}

      {/* Tenant Config Card */}
      {config && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Tenant Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Tenant ID</div>
                <div className="font-semibold">{config.tenant_id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">SSH Host</div>
                <div className="font-semibold">{config.ssh_host}:{config.ssh_port}</div>
              </div>
              <div>
                <div className="text-muted-foreground">SSH User</div>
                <div className="font-semibold">{config.ssh_user}</div>
              </div>
              <div>
                <div className="text-muted-foreground">SSH Key</div>
                <div className="font-semibold">
                  {config.ssh_key_configured ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      Configured
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <XCircle className="w-4 h-4" />
                      Not Set
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <div className="text-muted-foreground text-sm mb-2">PM2 Services</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{config.pm2_services.backend}</Badge>
                <Badge variant="outline">{config.pm2_services.frontend}</Badge>
                <Badge variant="outline">{config.pm2_services.python}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="deploy" className="flex items-center gap-2">
            <Rocket className="w-4 h-4" />
            <span className="hidden sm:inline">Deploy</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">Monitor</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="nginx" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">Nginx</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deploy" className="space-y-4">
          <SelfDeployPanel />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <SelfMonitoringPanel />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <SelfSecurityPanel />
        </TabsContent>

        <TabsContent value="nginx" className="space-y-4">
          <NginxPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
