/**
 * DevOps Dashboard Hooks - Tenant Self-Management Mode
 * Each tenant manages only itself using environment configuration
 */

import { useState, useCallback, useEffect } from 'react';
import { API_CONFIG } from '../lib/config';

const DEVOPS_API = `${API_CONFIG.BASE_URL}/api/v2/devops`;

// Types
export interface TenantConfig {
  tenant_id: string;
  tenant_path: string;
  ssh_host: string;
  ssh_port: number;
  ssh_user: string;
  ssh_key_configured: boolean;
  pm2_services: {
    backend: string;
    frontend: string;
    python: string;
  };
  nginx_conf: string;
}

export interface PM2Service {
  name: string;
  status: 'online' | 'stopped' | 'errored' | 'unknown';
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

export interface ServerMetrics {
  cpu: string;
  ram: string;
  disk: string;
  load: string;
  procs: string;
  uptime: string;
  timestamp: string;
}

export interface SecurityFinding {
  check: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  output: string;
  has_autofix: boolean;
}

export interface SecurityScanResult {
  success: boolean;
  tenant_id: string;
  scan_type: string;
  hostname: string;
  summary: {
    total_checks: number;
    findings_count: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    status: 'clean' | 'caution' | 'warning' | 'critical';
  };
  findings: SecurityFinding[];
}

export interface DeployResult {
  success: boolean;
  deploy_id: string;
  tenant_id: string;
  deploy_type: string;
  git_commit_before?: string;
  git_commit_after?: string;
  duration_ms: number;
  logs: string;
  error?: string;
}

export interface Alert {
  id: string;
  server_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  title: string;
  message: string;
  created_at: string;
  acknowledged: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  tenant_id: string;
  encryption_enabled: boolean;
  ssh_configured: boolean;
  timestamp: string;
}

// Generic API call helper
async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<T> {
  const response = await fetch(`${DEVOPS_API}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Hook for tenant configuration
 */
export function useTenantConfig() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<TenantConfig>('/config', 'GET');
      setConfig(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig().catch(() => {});
  }, [loadConfig]);

  return {
    config,
    loading,
    error,
    refresh: loadConfig,
  };
}

/**
 * Hook for health check
 */
export function useHealthCheck() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiCall<HealthStatus>('/health', 'GET');
      setHealth(result);
      return result;
    } catch (err) {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return {
    health,
    loading,
    refresh: checkHealth,
  };
}

/**
 * Hook for PM2 service management
 */
export function usePM2Services() {
  const [services, setServices] = useState<PM2Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ success: boolean; tenant_id: string; services: PM2Service[] }>(
        '/self/pm2/status',
        'GET'
      );
      setServices(result.services);
      return result.services;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const restartService = useCallback(async (service: 'backend' | 'frontend' | 'python' | 'all') => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ success: boolean; results: any[] }>(
        `/self/pm2/restart/${service}`,
        'POST'
      );
      // Refresh services after restart
      await loadServices();
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadServices]);

  return {
    services,
    loading,
    error,
    loadServices,
    restartService,
  };
}

/**
 * Hook for Nginx management
 */
export function useNginx() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ success: boolean; output: string; valid: boolean }>(
        '/self/nginx/test',
        'POST'
      );
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ success: boolean; action: string; output: string; error?: string }>(
        '/self/nginx/reload',
        'POST'
      );
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    testConfig,
    reload,
  };
}

/**
 * Hook for self-deployment
 */
export function useSelfDeploy() {
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);

  const deploy = useCallback(async (
    deployType: 'full' | 'backend' | 'frontend' | 'python' | 'hotfix' | 'restart' = 'full'
  ) => {
    setDeploying(true);
    setError(null);
    try {
      const deployResult = await apiCall<DeployResult>(
        `/self/deploy?deploy_type=${deployType}`,
        'POST'
      );
      setResult(deployResult);
      return deployResult;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setDeploying(false);
    }
  }, []);

  return {
    deploying,
    error,
    result,
    deploy,
  };
}

/**
 * Hook for server metrics
 */
export function useSelfMetrics() {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ success: boolean; tenant_id: string; metrics: ServerMetrics }>(
        '/self/metrics',
        'GET'
      );
      setMetrics(result.metrics);
      return result.metrics;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    metrics,
    loading,
    error,
    loadMetrics,
  };
}

/**
 * Hook for security scanning
 */
export function useSelfSecurityScan() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SecurityScanResult | null>(null);

  const runScan = useCallback(async (scanType: 'full' | 'quick' = 'quick') => {
    setScanning(true);
    setError(null);
    try {
      const scanResult = await apiCall<SecurityScanResult>(
        `/self/security/scan?scan_type=${scanType}`,
        'POST'
      );
      setResult(scanResult);
      return scanResult;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setScanning(false);
    }
  }, []);

  return {
    scanning,
    error,
    result,
    runScan,
  };
}

/**
 * Hook for alerts
 */
export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ alerts: Alert[]; count: number }>('/alerts', 'GET');
      setAlerts(result.alerts);
      return result.alerts;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      const result = await apiCall<{ acknowledged: boolean }>(
        `/alerts/${alertId}/acknowledge`,
        'POST'
      );
      if (result.acknowledged) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
      }
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    alerts,
    loading,
    error,
    loadAlerts,
    acknowledgeAlert,
  };
}

/**
 * Combined DevOps hook for self-management
 */
export function useDevOpsSelf() {
  const config = useTenantConfig();
  const health = useHealthCheck();
  const pm2 = usePM2Services();
  const nginx = useNginx();
  const deploy = useSelfDeploy();
  const metrics = useSelfMetrics();
  const security = useSelfSecurityScan();
  const alerts = useAlerts();

  return {
    config,
    health,
    pm2,
    nginx,
    deploy,
    metrics,
    security,
    alerts,
  };
}

// Legacy exports for backwards compatibility
export { useDevOpsSelf as useDevOps };
export default useDevOpsSelf;
