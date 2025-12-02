'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { API_CONFIG } from '@/config/api.config';
import {
  HardDrive,
  FolderOpen,
  CheckCircle,
  XCircle,
  Loader2,
  Key,
  Link,
  RefreshCw,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';

interface GoogleDriveConfig {
  serviceAccountJson: string;
  folderId: string;
  enabled: boolean;
}

interface ConnectionStatus {
  success: boolean;
  message: string;
  email?: string;
  folderName?: string;
}

export default function GoogleDriveSettings() {
  const [config, setConfig] = useState<GoogleDriveConfig>({
    serviceAccountJson: '',
    folderId: '',
    enabled: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [folderUrl, setFolderUrl] = useState('');
  const { toast } = useToast();

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  // Load configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/config`, {
          headers: getAuthHeaders()
        });

        if (response.ok) {
          const data = await response.json();
          if (data.config) {
            setConfig(data.config);
            if (data.config.folderId) {
              setFolderUrl(data.config.folderId);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load Google Drive config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Save configuration
  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/config`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Settings Saved',
          description: 'Google Drive configuration has been saved successfully.',
        });
      } else {
        toast({
          title: 'Save Failed',
          description: data.error || 'Failed to save configuration',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An error occurred while saving',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Test connection
  const testConnection = async () => {
    setTesting(true);
    setConnectionStatus(null);
    try {
      // First save the config
      await saveConfig();

      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/test`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      const data = await response.json();
      setConnectionStatus(data);

      if (data.success) {
        toast({
          title: 'Connection Successful',
          description: `Connected as ${data.email}${data.folderName ? ` - Folder: ${data.folderName}` : ''}`,
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      setConnectionStatus({
        success: false,
        message: error.message || 'Connection test failed'
      });
      toast({
        title: 'Error',
        description: error.message || 'An error occurred while testing connection',
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  // Extract folder ID from URL
  const extractFolderId = async () => {
    if (!folderUrl) return;

    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v2/google-drive/extract-folder-id`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ url: folderUrl })
      });

      const data = await response.json();
      if (data.folderId) {
        setConfig(prev => ({ ...prev, folderId: data.folderId }));
        toast({
          title: 'Folder ID Extracted',
          description: `Folder ID: ${data.folderId}`,
        });
      }
    } catch (error) {
      console.error('Failed to extract folder ID:', error);
    }
  };

  // Parse service account JSON to show client email
  const getServiceAccountEmail = () => {
    if (!config.serviceAccountJson || config.serviceAccountJson === '••••••••') {
      return null;
    }
    try {
      const parsed = JSON.parse(config.serviceAccountJson);
      return parsed.client_email;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const serviceAccountEmail = getServiceAccountEmail();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <HardDrive className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle>Google Drive Integration</CardTitle>
              <CardDescription>
                Import documents directly from Google Drive
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => setConfig(prev => ({ ...prev, enabled }))}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Service Account JSON */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Service Account JSON
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowJson(!showJson)}
            >
              {showJson ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Textarea
            placeholder={showJson ? '{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  "client_email": "...",\n  ...\n}' : '••••••••'}
            value={showJson ? config.serviceAccountJson : (config.serviceAccountJson ? '••••••••' : '')}
            onChange={(e) => setConfig(prev => ({ ...prev, serviceAccountJson: e.target.value }))}
            className="font-mono text-xs min-h-[120px]"
            disabled={!showJson && config.serviceAccountJson !== ''}
          />
          {serviceAccountEmail && (
            <p className="text-xs text-muted-foreground">
              Service Account: <span className="font-mono">{serviceAccountEmail}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Paste the full JSON content from your Google Cloud service account key file.
          </p>
        </div>

        {/* Folder URL/ID */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Google Drive Folder
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Folder URL or ID"
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={extractFolderId}
              disabled={!folderUrl}
            >
              <Link className="h-4 w-4 mr-2" />
              Extract ID
            </Button>
          </div>
          {config.folderId && (
            <p className="text-xs text-muted-foreground">
              Folder ID: <span className="font-mono">{config.folderId}</span>
            </p>
          )}
        </div>

        {/* Instructions */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Setup Instructions:</strong>
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Go to Google Cloud Console and create a Service Account</li>
              <li>Generate a JSON key for the service account</li>
              <li>Share your Google Drive folder with the service account email</li>
              <li>Paste the JSON key above and enter the folder URL</li>
            </ol>
          </AlertDescription>
        </Alert>

        {/* Connection Status */}
        {connectionStatus && (
          <Alert variant={connectionStatus.success ? 'default' : 'destructive'}>
            {connectionStatus.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              <strong>{connectionStatus.success ? 'Connected' : 'Connection Failed'}</strong>
              <p className="text-xs mt-1">{connectionStatus.message}</p>
              {connectionStatus.email && (
                <p className="text-xs mt-1">
                  Service Account: <span className="font-mono">{connectionStatus.email}</span>
                </p>
              )}
              {connectionStatus.folderName && (
                <p className="text-xs mt-1">
                  Folder: <span className="font-medium">{connectionStatus.folderName}</span>
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            onClick={testConnection}
            variant="outline"
            disabled={testing || !config.serviceAccountJson}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
          <Button
            onClick={saveConfig}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
