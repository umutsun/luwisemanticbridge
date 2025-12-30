'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Globe,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileCode,
  Terminal
} from 'lucide-react';
import { useNginx, useTenantConfig } from '@/hooks/useDevOps';

interface NginxResult {
  success: boolean;
  output: string;
  valid?: boolean;
  action?: string;
  error?: string;
}

export default function NginxPanel() {
  const { loading, error, testConfig, reload } = useNginx();
  const { config } = useTenantConfig();

  const [testResult, setTestResult] = useState<NginxResult | null>(null);
  const [reloadResult, setReloadResult] = useState<NginxResult | null>(null);
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [dialogContent, setDialogContent] = useState<{ title: string; output: string }>({
    title: '',
    output: ''
  });

  const handleTestConfig = async () => {
    try {
      const result = await testConfig();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        output: err.message,
        valid: false
      });
    }
  };

  const handleReload = async () => {
    try {
      const result = await reload();
      setReloadResult(result);
    } catch (err: any) {
      setReloadResult({
        success: false,
        output: err.message,
        action: 'reload'
      });
    }
  };

  const showOutput = (title: string, output: string) => {
    setDialogContent({ title, output });
    setShowOutputDialog(true);
  };

  return (
    <div className="space-y-4">
      {/* Nginx Config Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Nginx Configuration
          </CardTitle>
          <CardDescription>
            Test and reload Nginx configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Config Path */}
          {config?.nginx_conf && (
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <FileCode className="w-4 h-4" />
                Configuration File
              </div>
              <code className="text-sm font-mono">{config.nginx_conf}</code>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleTestConfig}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Test Configuration
            </Button>

            <Button
              onClick={handleReload}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reload Nginx
            </Button>
          </div>

          {/* Test Result */}
          {testResult && (
            <Alert variant={testResult.valid ? 'default' : 'destructive'}>
              {testResult.valid ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {testResult.valid ? 'Configuration Valid' : 'Configuration Invalid'}
                    </div>
                    <div className="text-sm mt-1">
                      nginx -t completed {testResult.valid ? 'successfully' : 'with errors'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => showOutput('Test Output', testResult.output)}
                  >
                    <Terminal className="w-4 h-4 mr-1" />
                    View Output
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Reload Result */}
          {reloadResult && (
            <Alert variant={reloadResult.success ? 'default' : 'destructive'}>
              {reloadResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {reloadResult.success ? 'Nginx Reloaded' : 'Reload Failed'}
                    </div>
                    <div className="text-sm mt-1">
                      {reloadResult.success
                        ? 'Nginx has been reloaded with the new configuration'
                        : reloadResult.error || 'Failed to reload Nginx'}
                    </div>
                  </div>
                  {reloadResult.output && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => showOutput('Reload Output', reloadResult.output)}
                    >
                      <Terminal className="w-4 h-4 mr-1" />
                      View Output
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Best Practices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">1</Badge>
              <div>
                <div className="font-medium">Always Test Before Reload</div>
                <div className="text-muted-foreground">
                  Run &quot;Test Configuration&quot; to validate syntax before applying changes
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">2</Badge>
              <div>
                <div className="font-medium">Graceful Reload</div>
                <div className="text-muted-foreground">
                  Reload uses nginx -s reload which gracefully updates without dropping connections
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">3</Badge>
              <div>
                <div className="font-medium">Check Logs on Error</div>
                <div className="text-muted-foreground">
                  If configuration is invalid, check /var/log/nginx/error.log for details
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Output Dialog */}
      <Dialog open={showOutputDialog} onOpenChange={setShowOutputDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{dialogContent.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <pre className="bg-muted p-4 rounded-md text-xs h-64 overflow-auto font-mono whitespace-pre-wrap">
              {dialogContent.output || 'No output'}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOutputDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
