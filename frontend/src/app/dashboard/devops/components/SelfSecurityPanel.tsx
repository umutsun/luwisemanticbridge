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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Play,
  Loader2,
  AlertTriangle,
  Bug,
  Lock,
  Activity,
  FileWarning,
  Server
} from 'lucide-react';
import { useSelfSecurityScan, SecurityScanResult, SecurityFinding } from '@/hooks/useDevOps';

export default function SelfSecurityPanel() {
  const [scanType, setScanType] = useState<'full' | 'quick'>('quick');
  const [lastScan, setLastScan] = useState<SecurityScanResult | null>(null);

  const { scanning, error, result: scanResult, runScan } = useSelfSecurityScan();

  // Load last scan from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('devops_self_security_scan');
    if (stored) {
      setLastScan(JSON.parse(stored));
    }
  }, []);

  // Save scan result
  useEffect(() => {
    if (scanResult) {
      setLastScan(scanResult);
      localStorage.setItem('devops_self_security_scan', JSON.stringify(scanResult));
    }
  }, [scanResult]);

  const handleRunScan = async () => {
    try {
      await runScan(scanType);
    } catch (err) {
      console.error('Scan failed:', err);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
      critical: { color: 'bg-red-600 text-white', icon: <ShieldX className="w-3 h-3" /> },
      high: { color: 'bg-orange-500 text-white', icon: <ShieldAlert className="w-3 h-3" /> },
      medium: { color: 'bg-yellow-500 text-white', icon: <AlertTriangle className="w-3 h-3" /> },
      low: { color: 'bg-blue-500 text-white', icon: <Shield className="w-3 h-3" /> },
      info: { color: 'bg-gray-500 text-white', icon: <Shield className="w-3 h-3" /> },
    };

    const { color, icon } = config[severity] || config.info;

    return (
      <Badge className={`${color} flex items-center gap-1`}>
        {icon}
        {severity.toUpperCase()}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'clean':
        return <ShieldCheck className="w-8 h-8 text-green-500" />;
      case 'caution':
        return <Shield className="w-8 h-8 text-blue-500" />;
      case 'warning':
        return <ShieldAlert className="w-8 h-8 text-yellow-500" />;
      case 'critical':
        return <ShieldX className="w-8 h-8 text-red-500" />;
      default:
        return <Shield className="w-8 h-8 text-gray-500" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'malware':
        return <Bug className="w-4 h-4" />;
      case 'ssh':
        return <Lock className="w-4 h-4" />;
      case 'network':
        return <Activity className="w-4 h-4" />;
      case 'filesystem':
        return <FileWarning className="w-4 h-4" />;
      case 'services':
        return <Server className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Scan Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Scanner
          </CardTitle>
          <CardDescription>
            Scan this server for security vulnerabilities and misconfigurations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-40">
              <label className="text-sm font-medium mb-2 block">Scan Type</label>
              <Select value={scanType} onValueChange={(v: 'full' | 'quick') => setScanType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick Scan</SelectItem>
                  <SelectItem value="full">Full Scan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleRunScan}
              disabled={scanning}
              size="lg"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Scan
                </>
              )}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Scan Results */}
      {lastScan && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getStatusIcon(lastScan.summary.status)}
                <div>
                  <CardTitle>Scan Results: {lastScan.hostname}</CardTitle>
                  <CardDescription>
                    {lastScan.scan_type.toUpperCase()} scan • {lastScan.summary.total_checks} checks performed
                  </CardDescription>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">
                  {lastScan.summary.findings_count} Issues
                </div>
                <div className="text-sm text-muted-foreground">
                  Found
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                <div className="text-2xl font-bold text-red-600">{lastScan.summary.critical}</div>
                <div className="text-sm text-red-600">Critical</div>
              </div>
              <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900">
                <div className="text-2xl font-bold text-orange-600">{lastScan.summary.high}</div>
                <div className="text-sm text-orange-600">High</div>
              </div>
              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                <div className="text-2xl font-bold text-yellow-600">{lastScan.summary.medium}</div>
                <div className="text-sm text-yellow-600">Medium</div>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                <div className="text-2xl font-bold text-blue-600">{lastScan.summary.low}</div>
                <div className="text-sm text-blue-600">Low</div>
              </div>
            </div>

            {/* Findings List */}
            {lastScan.findings.length > 0 ? (
              <div>
                <h3 className="font-semibold mb-3">Findings</h3>
                <Accordion type="multiple" className="space-y-2">
                  {lastScan.findings.map((finding, index) => (
                    <AccordionItem
                      key={index}
                      value={`finding-${index}`}
                      className="border rounded-lg px-4"
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 text-left">
                          {getCategoryIcon(finding.category)}
                          <div className="flex-1">
                            <div className="font-medium">{finding.check}</div>
                            <div className="text-sm text-muted-foreground">
                              {finding.description}
                            </div>
                          </div>
                          {getSeverityBadge(finding.severity)}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Output</h4>
                            <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap">
                              {finding.output || 'No additional output'}
                            </pre>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ) : (
              <div className="text-center py-8">
                <ShieldCheck className="w-16 h-16 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-semibold text-green-600">All Clear!</h3>
                <p className="text-muted-foreground">
                  No security issues found on this server
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No previous scan */}
      {!lastScan && !scanning && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Scan Results</h3>
            <p className="text-muted-foreground mb-4">
              Run a security scan to check for vulnerabilities
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
