'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Settings, Shield, Database, Bell, Activity, Clock, Save, RotateCcw } from 'lucide-react';

interface AuditConfig {
  enabled: boolean;
  retentionDays: number;
  logLevel: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  includeSensitive: boolean;
  trackUserActivity: boolean;
  trackSystemEvents: boolean;
  trackSecurityEvents: boolean;
  trackDataOperations: boolean;
  trackWorkflowExecutions: boolean;
  excludePaths: string[];
  excludeUsers: string[];
  alertThresholds: {
    failedLogins: number;
    suspiciousActivities: number;
    dataExports: number;
    systemErrors: number;
  };
  notifications: {
    enabled: boolean;
    channels: string[];
    severity: string[];
    templates: {
      securityAlert: string;
      systemError: string;
      dataBreach: string;
      complianceViolation: string;
    };
  };
  compliance: {
    gdpr: boolean;
    hipaa: boolean;
    sox: boolean;
    pciDss: boolean;
    customFields: Record<string, string>;
  };
}

export default function AuditSettings() {
  const [config, setConfig] = useState<AuditConfig>({
    enabled: true,
    retentionDays: 90,
    logLevel: 'info',
    includeSensitive: false,
    trackUserActivity: true,
    trackSystemEvents: true,
    trackSecurityEvents: true,
    trackDataOperations: true,
    trackWorkflowExecutions: true,
    excludePaths: ['/health', '/metrics', '/static'],
    excludeUsers: ['system', 'healthcheck'],
    alertThresholds: {
      failedLogins: 5,
      suspiciousActivities: 10,
      dataExports: 50,
      systemErrors: 3
    },
    notifications: {
      enabled: true,
      channels: ['email', 'slack', 'webhook'],
      severity: ['critical', 'error', 'warning'],
      templates: {
        securityAlert: 'Security alert detected: {event} by {user} at {time}',
        systemError: 'System error occurred: {error} in {service}',
        dataBreach: 'Potential data breach detected: {details}',
        complianceViolation: 'Compliance violation: {violation} - {action}'
      }
    },
    compliance: {
      gdpr: true,
      hipaa: false,
      sox: false,
      pciDss: false,
      customFields: {
        dataController: 'Organization Name',
        dataProcessor: 'ASB System',
        retentionPolicy: '90 days'
      }
    }
  });

  const [newExcludePath, setNewExcludePath] = useState('');
  const [newExcludeUser, setNewExcludeUser] = useState('');

  const handleSave = () => {
    // Save configuration
    console.log('Saving audit configuration:', config);
    // Show success message
  };

  const handleReset = () => {
    // Reset to defaults
    setConfig({
      enabled: true,
      retentionDays: 90,
      logLevel: 'info',
      includeSensitive: false,
      trackUserActivity: true,
      trackSystemEvents: true,
      trackSecurityEvents: true,
      trackDataOperations: true,
      trackWorkflowExecutions: true,
      excludePaths: ['/health', '/metrics', '/static'],
      excludeUsers: ['system', 'healthcheck'],
      alertThresholds: {
        failedLogins: 5,
        suspiciousActivities: 10,
        dataExports: 50,
        systemErrors: 3
      },
      notifications: {
        enabled: true,
        channels: ['email', 'slack', 'webhook'],
        severity: ['critical', 'error', 'warning'],
        templates: {
          securityAlert: 'Security alert detected: {event} by {user} at {time}',
          systemError: 'System error occurred: {error} in {service}',
          dataBreach: 'Potential data breach detected: {details}',
          complianceViolation: 'Compliance violation: {violation} - {action}'
        }
      },
      compliance: {
        gdpr: true,
        hipaa: false,
        sox: false,
        pciDss: false,
        customFields: {
          dataController: 'Organization Name',
          dataProcessor: 'ASB System',
          retentionPolicy: '90 days'
        }
      }
    });
  };

  const addExcludePath = () => {
    if (newExcludePath && !config.excludePaths.includes(newExcludePath)) {
      setConfig({
        ...config,
        excludePaths: [...config.excludePaths, newExcludePath]
      });
      setNewExcludePath('');
    }
  };

  const removeExcludePath = (path: string) => {
    setConfig({
      ...config,
      excludePaths: config.excludePaths.filter(p => p !== path)
    });
  };

  const addExcludeUser = () => {
    if (newExcludeUser && !config.excludeUsers.includes(newExcludeUser)) {
      setConfig({
        ...config,
        excludeUsers: [...config.excludeUsers, newExcludeUser]
      });
      setNewExcludeUser('');
    }
  };

  const removeExcludeUser = (user: string) => {
    setConfig({
      ...config,
      excludeUsers: config.excludeUsers.filter(u => u !== user)
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Settings</h1>
          <p className="text-muted-foreground">
            Configure audit logging and compliance settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic audit logging configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Audit Logging</Label>
                  <p className="text-sm text-muted-foreground">
                    Start or stop collecting audit logs
                  </p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Retention Period (days)</Label>
                  <Input
                    type="number"
                    value={config.retentionDays}
                    onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) || 90 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Logs older than this will be automatically deleted
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Log Level</Label>
                  <Select
                    value={config.logLevel}
                    onValueChange={(value) => setConfig({ ...config, logLevel: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Include Sensitive Data</Label>
                  <p className="text-sm text-muted-foreground">
                    Log sensitive data in audit trails (not recommended)
                  </p>
                </div>
                <Switch
                  checked={config.includeSensitive}
                  onCheckedChange={(checked) => setConfig({ ...config, includeSensitive: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exclusion Rules</CardTitle>
              <CardDescription>
                Configure paths and users to exclude from audit logging
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Exclude Paths</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="/api/health"
                    value={newExcludePath}
                    onChange={(e) => setNewExcludePath(e.target.value)}
                  />
                  <Button onClick={addExcludePath}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {config.excludePaths.map((path) => (
                    <Badge key={path} variant="secondary" className="gap-1">
                      {path}
                      <button
                        onClick={() => removeExcludePath(path)}
                        className="ml-1 hover:bg-gray-200 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Exclude Users</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="username"
                    value={newExcludeUser}
                    onChange={(e) => setNewExcludeUser(e.target.value)}
                  />
                  <Button onClick={addExcludeUser}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {config.excludeUsers.map((user) => (
                    <Badge key={user} variant="secondary" className="gap-1">
                      {user}
                      <button
                        onClick={() => removeExcludeUser(user)}
                        className="ml-1 hover:bg-gray-200 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Event Tracking
              </CardTitle>
              <CardDescription>
                Select which types of events to track
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'trackUserActivity', label: 'User Activity', desc: 'Login, logout, profile changes' },
                { key: 'trackSystemEvents', label: 'System Events', desc: 'Startups, shutdowns, configuration changes' },
                { key: 'trackSecurityEvents', label: 'Security Events', desc: 'Failed logins, permission changes' },
                { key: 'trackDataOperations', label: 'Data Operations', desc: 'CRUD operations, exports, imports' },
                { key: 'trackWorkflowExecutions', label: 'Workflow Executions', desc: 'Workflow starts, stops, failures' }
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{item.label}</Label>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={config[item.key as keyof AuditConfig] as boolean}
                    onCheckedChange={(checked) => setConfig({ ...config, [item.key]: checked })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alert Configuration
              </CardTitle>
              <CardDescription>
                Configure alert thresholds and notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send alerts for critical audit events
                  </p>
                </div>
                <Switch
                  checked={config.notifications.enabled}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    notifications: { ...config.notifications, enabled: checked }
                  })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Failed Login Threshold</Label>
                  <Input
                    type="number"
                    value={config.alertThresholds.failedLogins}
                    onChange={(e) => setConfig({
                      ...config,
                      alertThresholds: {
                        ...config.alertThresholds,
                        failedLogins: parseInt(e.target.value) || 5
                      }
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Suspicious Activity Threshold</Label>
                  <Input
                    type="number"
                    value={config.alertThresholds.suspiciousActivities}
                    onChange={(e) => setConfig({
                      ...config,
                      alertThresholds: {
                        ...config.alertThresholds,
                        suspiciousActivities: parseInt(e.target.value) || 10
                      }
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data Export Threshold</Label>
                  <Input
                    type="number"
                    value={config.alertThresholds.dataExports}
                    onChange={(e) => setConfig({
                      ...config,
                      alertThresholds: {
                        ...config.alertThresholds,
                        dataExports: parseInt(e.target.value) || 50
                      }
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>System Error Threshold</Label>
                  <Input
                    type="number"
                    value={config.alertThresholds.systemErrors}
                    onChange={(e) => setConfig({
                      ...config,
                      alertThresholds: {
                        ...config.alertThresholds,
                        systemErrors: parseInt(e.target.value) || 3
                      }
                    })}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <Label>Notification Channels</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {['email', 'slack', 'webhook', 'sms', 'teams', 'discord'].map((channel) => (
                    <label key={channel} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={config.notifications.channels.includes(channel)}
                        onChange={(e) => {
                          const channels = e.target.checked
                            ? [...config.notifications.channels, channel]
                            : config.notifications.channels.filter(c => c !== channel);
                          setConfig({
                            ...config,
                            notifications: { ...config.notifications, channels }
                          });
                        }}
                      />
                      <span className="text-sm capitalize">{channel}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label>Alert Severities</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['critical', 'error', 'warning', 'info'].map((severity) => (
                    <label key={severity} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={config.notifications.severity.includes(severity)}
                        onChange={(e) => {
                          const severityList = e.target.checked
                            ? [...config.notifications.severity, severity]
                            : config.notifications.severity.filter(s => s !== severity);
                          setConfig({
                            ...config,
                            notifications: { ...config.notifications, severity: severityList }
                          });
                        }}
                      />
                      <span className="text-sm capitalize">{severity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Templates</CardTitle>
              <CardDescription>
                Customize alert notification messages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(config.notifications.templates).map(([key, template]) => (
                <div key={key} className="space-y-2">
                  <Label className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</Label>
                  <Textarea
                    value={template}
                    onChange={(e) => setConfig({
                      ...config,
                      notifications: {
                        ...config.notifications,
                        templates: {
                          ...config.notifications.templates,
                          [key]: e.target.value
                        }
                      }
                    })}
                    rows={2}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Compliance Standards
              </CardTitle>
              <CardDescription>
                Configure compliance requirements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'gdpr', label: 'GDPR', desc: 'General Data Protection Regulation' },
                  { key: 'hipaa', label: 'HIPAA', desc: 'Health Insurance Portability' },
                  { key: 'sox', label: 'SOX', desc: 'Sarbanes-Oxley Act' },
                  { key: 'pciDss', label: 'PCI DSS', desc: 'Payment Card Industry' }
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label>{item.label}</Label>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      checked={config.compliance[item.key as keyof typeof config.compliance] as boolean}
                      onCheckedChange={(checked) => setConfig({
                        ...config,
                        compliance: { ...config.compliance, [item.key]: checked }
                      })}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div>
                <Label>Custom Compliance Fields</Label>
                <div className="space-y-3 mt-2">
                  {Object.entries(config.compliance.customFields).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-2 gap-2">
                      <Input
                        value={key}
                        onChange={(e) => {
                          const newFields = { ...config.compliance.customFields };
                          delete newFields[key];
                          newFields[e.target.value] = value;
                          setConfig({
                            ...config,
                            compliance: {
                              ...config.compliance,
                              customFields: newFields
                            }
                          });
                        }}
                      />
                      <Input
                        value={value}
                        onChange={(e) => setConfig({
                          ...config,
                          compliance: {
                            ...config.compliance,
                            customFields: {
                              ...config.compliance.customFields,
                              [key]: e.target.value
                            }
                          }
                        })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Log Export
              </CardTitle>
              <CardDescription>
                Export audit logs for archiving or analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Button variant="outline">
                  <Activity className="h-4 w-4 mr-2" />
                  Export as CSV
                </Button>
                <Button variant="outline">
                  <Database className="h-4 w-4 mr-2" />
                  Export as JSON
                </Button>
                <Button variant="outline">
                  <Shield className="h-4 w-4 mr-2" />
                  Export Security Logs
                </Button>
                <Button variant="outline">
                  <Clock className="h-4 w-4 mr-2" />
                  Export by Date Range
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Export Filters</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select event types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="security">Security Events</SelectItem>
                      <SelectItem value="user">User Activity</SelectItem>
                      <SelectItem value="system">System Events</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button>
                  Generate Export
                </Button>
              </div>

              <Separator />

              <div>
                <Label>Scheduled Exports</Label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Daily Backup</div>
                      <div className="text-sm text-muted-foreground">
                        Export all logs at 2:00 AM
                      </div>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Weekly Compliance Report</div>
                      <div className="text-sm text-muted-foreground">
                        Export compliance logs every Sunday
                      </div>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}