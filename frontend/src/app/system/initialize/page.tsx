'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, AlertCircle, RefreshCw, Database, Server, Settings } from 'lucide-react';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'checking';
  url: string;
  description: string;
  lastCheck?: string;
  error?: string;
}

interface SystemConfig {
  port: number;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    ssl: boolean;
  };
}

export default function SystemInitializePage() {
  const [services, setServices] = useState<ServiceHealth[]>([
    {
      name: 'Backend API',
      status: 'checking',
      url: '/api/v2/health',
      description: 'Main backend service'
    },
    {
      name: 'PostgreSQL Database',
      status: 'checking',
      url: '/api/v2/database/health',
      description: 'Primary database'
    },
    {
      name: 'Redis Cache',
      status: 'checking',
      url: '/api/v2/redis/health',
      description: 'Cache and session storage'
    },
    {
      name: 'Settings Service',
      status: 'checking',
      url: '/api/v2/settings/health',
      description: 'Configuration management'
    },
    {
      name: 'LLM Service',
      status: 'checking',
      url: '/api/v2/llm/health',
      description: 'AI model integration'
    },
    {
      name: 'Embeddings Service',
      status: 'checking',
      url: '/api/v2/embeddings/health',
      description: 'Vector embeddings'
    }
  ]);

  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    port: 8083,
    database: {
      host: 'localhost',
      port: 5432,
      name: 'lsemb',
      user: 'postgres',
      ssl: false
    }
  });

  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

  // Check service health
  const checkServiceHealth = async (service: ServiceHealth): Promise<ServiceHealth> => {
    try {
      const response = await fetch(service.url);
      const isHealthy = response.ok;

      return {
        ...service,
        status: isHealthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date().toLocaleTimeString(),
        error: isHealthy ? undefined : `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        ...service,
        status: 'unhealthy',
        lastCheck: new Date().toLocaleTimeString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  // Check all services
  const checkAllServices = async () => {
    setServices(prev => prev.map(s => ({ ...s, status: 'checking' })));

    const results = await Promise.all(
      services.map(service => checkServiceHealth(service))
    );

    setServices(results);

    const allHealthy = results.every(s => s.status === 'healthy');
    if (allHealthy) {
      setIsInitialized(true);
      toast({
        title: "System Ready",
        description: "All services are healthy and initialized",
      });
    }
  };

  // Initialize system
  const initializeSystem = async () => {
    setIsInitializing(true);

    try {
      // First check all services
      await checkAllServices();

      // Load settings
      const settingsResponse = await fetch('/api/v2/settings/category/app');
      if (settingsResponse.ok) {
        const settings = await settingsResponse.json();
        console.log('Settings loaded:', settings);
      }

      // Initialize database connections
      const dbResponse = await fetch('/api/v2/database/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(systemConfig)
      });

      if (!dbResponse.ok) {
        throw new Error('Database initialization failed');
      }

      toast({
        title: "System Initialized",
        description: "All services have been initialized successfully",
      });

    } catch (error) {
      console.error('Initialization error:', error);
      toast({
        title: "Initialization Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsInitializing(false);
    }
  };

  // Auto-check on mount
  useEffect(() => {
    checkAllServices();

    // Set up periodic health checks
    const interval = setInterval(checkAllServices, 30000);
    return () => clearInterval(interval);
  }, []);

  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const allHealthy = services.every(s => s.status === 'healthy');

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
          <Server className="w-8 h-8" />
          System Initialization
        </h1>
        <p className="text-muted-foreground">
          Initialize and monitor all system services
        </p>
      </div>

      {/* System Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>System Status</span>
            <Badge variant={allHealthy ? "default" : "secondary"} className="text-sm">
              {healthyCount}/{services.length} Services Healthy
            </Badge>
          </CardTitle>
          <CardDescription>
            {allHealthy
              ? "All services are running properly"
              : "Some services need attention before proceeding"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <div
                key={service.name}
                className={`p-4 rounded-lg border ${
                  service.status === 'healthy'
                    ? 'border-green-200 bg-green-50'
                    : service.status === 'checking'
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {service.status === 'healthy' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : service.status === 'checking' ? (
                      <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <div>
                      <h3 className="font-medium">{service.name}</h3>
                      <p className="text-sm text-muted-foreground">{service.description}</p>
                    </div>
                  </div>
                  <Badge
                    variant={service.status === 'healthy' ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {service.status}
                  </Badge>
                </div>
                {service.error && (
                  <p className="text-xs text-red-600 mt-2">{service.error}</p>
                )}
                {service.lastCheck && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last checked: {service.lastCheck}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-6">
            <Button onClick={checkAllServices} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* System Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            System Configuration
          </CardTitle>
          <CardDescription>
            Configure port and database settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="port">Application Port</Label>
              <Input
                id="port"
                type="number"
                value={systemConfig.port}
                onChange={(e) => setSystemConfig(prev => ({
                  ...prev,
                  port: parseInt(e.target.value) || 8083
                }))}
                className="mt-1"
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Database className="w-4 h-4" />
                Database Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="db-host">Host</Label>
                  <Input
                    id="db-host"
                    value={systemConfig.database.host}
                    onChange={(e) => setSystemConfig(prev => ({
                      ...prev,
                      database: { ...prev.database, host: e.target.value }
                    }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="db-port">Port</Label>
                  <Input
                    id="db-port"
                    type="number"
                    value={systemConfig.database.port}
                    onChange={(e) => setSystemConfig(prev => ({
                      ...prev,
                      database: { ...prev.database, port: parseInt(e.target.value) || 5432 }
                    }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="db-name">Database</Label>
                  <Input
                    id="db-name"
                    value={systemConfig.database.name}
                    onChange={(e) => setSystemConfig(prev => ({
                      ...prev,
                      database: { ...prev.database, name: e.target.value }
                    }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="db-user">User</Label>
                  <Input
                    id="db-user"
                    value={systemConfig.database.user}
                    onChange={(e) => setSystemConfig(prev => ({
                      ...prev,
                      database: { ...prev.database, user: e.target.value }
                    }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Initialization Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">System Actions</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Initialize or reset the system configuration
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={initializeSystem}
                disabled={isInitializing || !allHealthy}
              >
                {isInitializing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <Settings className="w-4 h-4 mr-2" />
                    Initialize System
                  </>
                )}
              </Button>
            </div>
          </div>

          {isInitialized && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                System is initialized and ready. You can now proceed to login.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Quick Access */}
      {isInitialized && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">System Ready</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  All services are operational. You can now access the application.
                </p>
              </div>
              <Button asChild>
                <a href="/login">Proceed to Login</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}