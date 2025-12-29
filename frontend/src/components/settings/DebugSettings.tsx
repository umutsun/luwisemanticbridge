'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Bug, Terminal, Zap } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { isDebugMode, setDebugMode } from '../../lib/debug';

export function DebugSettings() {
  const [debugEnabled, setDebugEnabled] = useState(false);
  const { toast } = useToast();

  // Initialize from localStorage
  useEffect(() => {
    setDebugEnabled(isDebugMode());

    // Listen for changes from other tabs
    const handleChange = (e: CustomEvent) => setDebugEnabled(e.detail);
    window.addEventListener('debugModeChanged', handleChange as EventListener);
    return () => window.removeEventListener('debugModeChanged', handleChange as EventListener);
  }, []);

  const handleToggle = (enabled: boolean) => {
    setDebugMode(enabled);
    setDebugEnabled(enabled);
    toast({
      title: enabled ? 'Debug Mode Enabled' : 'Debug Mode Disabled',
      description: enabled
        ? 'Console logs are now visible. This may affect browser performance.'
        : 'Console logs are now suppressed for better performance.'
    });
  };

  return (
    <Card className="bg-amber-50/30 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-amber-600" />
          <CardTitle>Developer Settings</CardTitle>
        </div>
        <CardDescription>
          Debug mode controls browser console logging. Disable for better performance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-lg bg-white/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5 text-slate-500" />
            <div>
              <Label className="text-base font-medium">Debug Mode</Label>
              <p className="text-sm text-muted-foreground">
                Enable console logging for debugging
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={debugEnabled ? 'default' : 'secondary'}>
              {debugEnabled ? 'ON' : 'OFF'}
            </Badge>
            <Switch
              checked={debugEnabled}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>

        {debugEnabled && (
          <Alert className="bg-amber-100 dark:bg-amber-900/30 border-amber-300">
            <Zap className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              Debug mode is enabled. Console logs will be visible in browser DevTools.
              This may cause slight performance degradation on log-heavy pages.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground mt-2">
          <p>When disabled, <code>debug.log()</code> calls are suppressed.</p>
          <p>Error logs (<code>console.error</code>) are always shown.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default DebugSettings;
