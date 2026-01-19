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
  const [essentialServices, setEssentialServices] = useState<ServiceHealth[]>([
    {
      name: 'PostgreSQL (Master DB)',
      status: 'checking',
      url: '/api/v2/health',
      description: 'Essential: vergilex_lsemb database from .env'
    },
    {
      name: 'Redis Cache',
      status: 'checking',
      url: '/api/v2/health',
      description: 'Essential: Session & cache storage from .env'
    }
  ]);

  const [optionalServices, setOptionalServices] = useState<ServiceHealth[]>([
    {
      name: 'LLM Service',
      status: 'checking',
      url: '/api/v2/health',
      description: 'Optional: Configure in Settings'
    },
    {
      name: 'Client DB (Source)',
      status: 'checking',
      url: '/api/v2/health',
      description: 'Optional: Configure in Settings'
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

  // Check health endpoint and parse for essential services
  const checkEssentialServices = async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Backend unreachable (HTTP ${response.status})`);
      }

      const healthData = await response.json();

      // Check PostgreSQL (Master DB)
      const pgStatus: ServiceHealth = {
        name: 'PostgreSQL (Master DB)',
        url: '/api/v2/health',
        description: `Essential: ${healthData.services?.postgres?.database || 'unknown'} database from .env`,
        status: healthData.services?.postgres?.status === 'connected' ? 'healthy' : 'unhealthy',
        lastCheck: new Date().toLocaleTimeString(),
        error: healthData.services?.postgres?.status !== 'connected'
          ? healthData.services?.postgres?.error || 'Disconnected'
          : undefined
      };

      // Check Redis
      const redisStatus: ServiceHealth = {
        name: 'Redis Cache',
        url: '/api/v2/health',
        description: `Essential: db${healthData.services?.redis?.db || 0} - ${healthData.services?.redis?.keys || 0} keys from .env`,
        status: healthData.services?.redis?.status === 'connected' ? 'healthy' : 'unhealthy',
        lastCheck: new Date().toLocaleTimeString(),
        error: healthData.services?.redis?.status !== 'connected'
          ? healthData.services?.redis?.error || 'Disconnected'
          : undefined
      };

      setEssentialServices([pgStatus, redisStatus]);

      // Check if both essential services are healthy
      const essentialsHealthy = pgStatus.status === 'healthy' && redisStatus.status === 'healthy';

      if (essentialsHealthy) {
        setIsInitialized(true);
        toast({
          title: "System Ready",
          description: "Essential services are healthy. You can proceed to login.",
        });
      } else {
        setIsInitialized(false);
        toast({
          title: "System Not Ready",
          description: "Essential services are not healthy. Check .env configuration.",
          variant: "destructive"
        });
      }

      return essentialsHealthy;
    } catch (error) {
      console.error('Health check failed:', error);
      setEssentialServices(prev => prev.map(s => ({
        ...s,
        status: 'unhealthy',
        lastCheck: new Date().toLocaleTimeString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })));
      setIsInitialized(false);
      return false;
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
    checkEssentialServices();

    // Set up periodic health checks every 10 seconds
    const interval = setInterval(checkEssentialServices, 10000);
    return () => clearInterval(interval);
  }, []);

  const essentialHealthyCount = essentialServices.filter(s => s.status === 'healthy').length;
  const allEssentialsHealthy = essentialServices.every(s => s.status === 'healthy');

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

      {/* Essential Services Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Essential Services (.env)
            </span>
            <Badge variant={allEssentialsHealthy ? "default" : "destructive"} className="text-sm">
              {essentialHealthyCount}/{essentialServices.length} Healthy
            </Badge>
          </CardTitle>
          <CardDescription>
            {allEssentialsHealthy
              ? "All essential services are running. You can proceed to login."
              : "Essential services are required for login. Check your .env configuration."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {essentialServices.map((service) => (
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
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {service.status === 'healthy' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : service.status === 'checking' ? (
                      <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <h3 className="font-medium">{service.name}</h3>
                  </div>
                  <Badge
                    variant={service.status === 'healthy' ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {service.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{service.description}</p>
                {service.error && (
                  <p className="text-xs text-red-600 mt-2 font-medium">Error: {service.error}</p>
                )}
                {service.lastCheck && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last checked: {service.lastCheck}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-6 gap-3">
            <Button onClick={checkEssentialServices} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Status
            </Button>
            {allEssentialsHealthy && (
              <Button asChild>
                <a href="/login">Proceed to Login →</a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Optional Services Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Optional Services
          </CardTitle>
          <CardDescription>
            These services can be configured in Settings after login
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {optionalServices.map((service) => (
              <div
                key={service.name}
                className="p-4 rounded-lg border border-gray-200 bg-gray-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Settings className="w-4 h-4 text-gray-600" />
                  <h3 className="font-medium">{service.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{service.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Help Card */}
      {!allEssentialsHealthy && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="w-5 h-5" />
              Troubleshooting
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-900 space-y-2">
            <p><strong>If PostgreSQL fails:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in .env.lsemb</li>
              <li>Ensure PostgreSQL service is running</li>
              <li>Verify database "vergilex_lsemb" exists</li>
            </ul>
            <p className="mt-3"><strong>If Redis fails:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Check REDIS_HOST, REDIS_PORT in .env.lsemb</li>
              <li>Ensure Redis service is running</li>
              <li>Test connection: redis-cli ping</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}