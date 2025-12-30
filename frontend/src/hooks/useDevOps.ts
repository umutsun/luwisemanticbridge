/**
 * DevOps Dashboard Hooks
 * SSH management, security scanning, deployments
 */

import { useState, useCallback } from 'react';
import { API_CONFIG } from '../lib/config';

const DEVOPS_API = `${API_CONFIG.BASE_URL}/api/v2/devops`;

// Types
export interface SSHTestRequest {
  hostname: string;
  private_key: string;
  username?: string;
  port?: number;
  passphrase?: string;
}

export interface SSHTestResult {
  success: boolean;
  hostname: string;
  output?: string;
  os_info?: string;
  latency_ms?: number;
  error?: string;
}

export interface CommandRequest extends SSHTestRequest {
  command: string;
  timeout?: number;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
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

export interface DeployRequest extends SSHTestRequest {
  tenant_id: string;
  tenant_path: string;
  deploy_type?: 'full' | 'backend' | 'frontend' | 'python' | 'hotfix' | 'restart';
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

export interface ServerMetrics {
  cpu: string;
  ram: string;
  disk: string;
  load: string;
  procs: string;
  uptime: string;
  timestamp: string;
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
 * Hook for SSH operations
 */
export function useSSH() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testConnection = useCallback(async (request: SSHTestRequest): Promise<SSHTestResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<SSHTestResult>('/ssh/test', 'POST', request);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const executeCommand = useCallback(async (request: CommandRequest): Promise<CommandResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<CommandResult>('/ssh/execute', 'POST', request);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const encryptKey = useCallback(async (privateKey: string): Promise<{ encrypted_key: string; key_type: string }> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ success: boolean; encrypted_key: string; key_type: string }>(
        '/ssh/encrypt-key',
        'POST',
        { private_key: privateKey }
      );
      return { encrypted_key: result.encrypted_key, key_type: result.key_type };
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
    testConnection,
    executeCommand,
    encryptKey,
  };
}

/**
 * Hook for Security Scanner
 */
export function useSecurityScanner() {
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null);

  const runScan = useCallback(async (
    request: SSHTestRequest,
    scanType: 'full' | 'quick' = 'full'
  ): Promise<SecurityScanResult> => {
    setScanning(true);
    setError(null);
    try {
      const result = await apiCall<SecurityScanResult>('/security/scan', 'POST', {
        ...request,
        scan_type: scanType,
      });
      setScanResult(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setScanning(false);
    }
  }, []);

  const autoFix = useCallback(async (
    request: SSHTestRequest,
    findingName: string
  ): Promise<{ fixed: boolean; logs: string }> => {
    setFixing(true);
    setError(null);
    try {
      const result = await apiCall<{ fixed: boolean; logs: string; finding: string }>(
        '/security/auto-fix',
        'POST',
        { ...request, finding_name: findingName }
      );
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setFixing(false);
    }
  }, []);

  const getPlaybooks = useCallback(async (): Promise<Record<string, { description: string; commands_count: number }>> => {
    const result = await apiCall<{ playbooks: Record<string, any> }>('/security/playbooks', 'GET');
    return result.playbooks;
  }, []);

  const getBruteforceStats = useCallback(async (): Promise<{
    blocked_ips: string[];
    blocked_count: number;
    active_attackers: Array<{ ip: string; attempts: number; first_seen: string; last_attempt: string }>;
    total_attempts_24h: number;
  }> => {
    return apiCall('/security/bruteforce', 'GET');
  }, []);

  return {
    scanning,
    fixing,
    error,
    scanResult,
    runScan,
    autoFix,
    getPlaybooks,
    getBruteforceStats,
  };
}

/**
 * Hook for Deployments
 */
export function useDeployment() {
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  const deploy = useCallback(async (request: DeployRequest): Promise<DeployResult> => {
    setDeploying(true);
    setError(null);
    try {
      const result = await apiCall<DeployResult>('/deploy', 'POST', request);
      setDeployResult(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setDeploying(false);
    }
  }, []);

  const clearCache = useCallback(async (request: DeployRequest): Promise<{ success: boolean; output: string }> => {
    return apiCall('/deploy/clear-cache', 'POST', request);
  }, []);

  const getGitStatus = useCallback(async (request: DeployRequest): Promise<{ success: boolean; output: string }> => {
    return apiCall('/deploy/git-status', 'POST', request);
  }, []);

  const getPM2Status = useCallback(async (
    request: SSHTestRequest,
    tenantId?: string
  ): Promise<{ success: boolean; services: any[] }> => {
    return apiCall(`/deploy/pm2-status${tenantId ? `?tenant_id=${tenantId}` : ''}`, 'POST', request);
  }, []);

  const getDeploymentHistory = useCallback(async (
    tenantId: string,
    limit: number = 20
  ): Promise<{ tenant_id: string; deployments: any[]; count: number }> => {
    return apiCall(`/deployments/${tenantId}?limit=${limit}`, 'GET');
  }, []);

  return {
    deploying,
    error,
    deployResult,
    deploy,
    clearCache,
    getGitStatus,
    getPM2Status,
    getDeploymentHistory,
  };
}

/**
 * Hook for Monitoring
 */
export function useMonitoring() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const collectMetrics = useCallback(async (
    request: SSHTestRequest,
    serverId: string = 'default'
  ): Promise<ServerMetrics> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall<{ success: boolean; server_id: string; metrics: ServerMetrics }>(
        `/monitor/metrics?server_id=${serverId}`,
        'POST',
        request
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

  const getMetrics = useCallback(async (serverId: string): Promise<{
    current: ServerMetrics | null;
    history: ServerMetrics[];
  }> => {
    return apiCall(`/monitor/metrics/${serverId}`, 'GET');
  }, []);

  const getActiveAlerts = useCallback(async (): Promise<Alert[]> => {
    const result = await apiCall<{ alerts: Alert[]; count: number }>('/alerts', 'GET');
    setAlerts(result.alerts);
    return result.alerts;
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string): Promise<{ acknowledged: boolean }> => {
    const result = await apiCall<{ acknowledged: boolean }>(`/alerts/${alertId}/acknowledge`, 'POST');
    if (result.acknowledged) {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    }
    return result;
  }, []);

  return {
    loading,
    error,
    metrics,
    alerts,
    collectMetrics,
    getMetrics,
    getActiveAlerts,
    acknowledgeAlert,
  };
}

/**
 * Combined DevOps hook
 */
export function useDevOps() {
  const ssh = useSSH();
  const security = useSecurityScanner();
  const deployment = useDeployment();
  const monitoring = useMonitoring();

  return {
    ssh,
    security,
    deployment,
    monitoring,
  };
}

export default useDevOps;
