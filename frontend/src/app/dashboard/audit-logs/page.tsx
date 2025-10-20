'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Clock, Filter, Download, Search, User, Activity, Shield, Database } from 'lucide-react';
import { format } from 'date-fns';
import { LazyLoad } from '@/components/LazyLoad';

interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: any;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'authentication' | 'authorization' | 'data' | 'system' | 'security' | 'workflow';
}

interface ActivitySummary {
  totalActions: number;
  uniqueUsers: number;
  failedLogins: number;
  criticalEvents: number;
  topActions: Array<{ action: string; count: number }>;
  activeUsers: Array<{ username: string; actions: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    severity: 'all',
    dateRange: '24h',
    userId: ''
  });

  // Mock data generation
  const generateMockLogs = (): AuditLog[] => {
    const actions = [
      'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXECUTE', 'EXPORT', 'IMPORT',
      'CONFIGURE', 'DEPLOY', 'BACKUP', 'RESTORE', 'MIGRATE', 'SCAN', 'APPROVE', 'REJECT'
    ];
    const resources = [
      'User', 'Role', 'Workflow', 'Database', 'Backup', 'Migration', 'Report', 'Setting',
      'Embedding', 'Document', 'Notification', 'Alert', 'Log', 'Session'
    ];
    const severities: Array<'info' | 'warning' | 'error' | 'critical'> = ['info', 'warning', 'error', 'critical'];
    const categories: Array<'authentication' | 'authorization' | 'data' | 'system' | 'security' | 'workflow'> =
      ['authentication', 'authorization', 'data', 'system', 'security', 'workflow'];

    return Array.from({ length: 100 }, (_, i) => ({
      id: `log-${i + 1}`,
      userId: `user-${Math.floor(Math.random() * 50) + 1}`,
      username: `user${Math.floor(Math.random() * 50) + 1}`,
      action: actions[Math.floor(Math.random() * actions.length)],
      resource: resources[Math.floor(Math.random() * resources.length)],
      resourceId: Math.random() > 0.5 ? `res-${Math.floor(Math.random() * 1000)}` : undefined,
      details: {
        changes: Math.random() > 0.7 ? { field: 'status', old: 'inactive', new: 'active' } : undefined,
        duration: Math.random() > 0.8 ? Math.floor(Math.random() * 5000) : undefined,
        result: Math.random() > 0.9 ? 'failed' : 'success'
      },
      ipAddress: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      severity: severities[Math.floor(Math.random() * severities.length)],
      category: categories[Math.floor(Math.random() * categories.length)]
    }));
  };

  const generateActivitySummary = (logs: AuditLog[]): ActivitySummary => {
    const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: logs.filter(log => new Date(log.timestamp).getHours() === hour).length
    }));

    const actionCounts = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const userCounts = logs.reduce((acc, log) => {
      acc[log.username] = (acc[log.username] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalActions: logs.length,
      uniqueUsers: new Set(logs.map(log => log.userId)).size,
      failedLogins: logs.filter(log => log.action === 'LOGIN' && log.details?.result === 'failed').length,
      criticalEvents: logs.filter(log => log.severity === 'critical').length,
      topActions: Object.entries(actionCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([action, count]) => ({ action, count })),
      activeUsers: Object.entries(userCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([username, actions]) => ({ username, actions })),
      hourlyActivity
    };
  };

  useEffect(() => {
    const mockLogs = generateMockLogs();
    setLogs(mockLogs);
    setSummary(generateActivitySummary(mockLogs));
    setLoading(false);
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filters.search && !log.action.toLowerCase().includes(filters.search.toLowerCase()) &&
        !log.username.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.category !== 'all' && log.category !== filters.category) {
      return false;
    }
    if (filters.severity !== 'all' && log.severity !== filters.severity) {
      return false;
    }
    if (filters.userId && log.userId !== filters.userId) {
      return false;
    }
    return true;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'error': return 'destructive';
      case 'warning': return 'secondary';
      default: return 'default';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'authentication': return <User className="h-4 w-4" />;
      case 'authorization': return <Shield className="h-4 w-4" />;
      case 'data': return <Database className="h-4 w-4" />;
      case 'system': return <Activity className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const exportLogs = () => {
    const csv = [
      ['Timestamp', 'User', 'Action', 'Resource', 'IP Address', 'Severity', 'Category'],
      ...filteredLogs.map(log => [
        log.timestamp,
        log.username,
        log.action,
        log.resource,
        log.ipAddress,
        log.severity,
        log.category
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit Logs</h1>
          <p className="text-muted-foreground">
            Monitor and track all system activities and user actions
          </p>
        </div>
        <Button onClick={exportLogs} className="gap-2">
          <Download className="h-4 w-4" />
          Export Logs
        </Button>
      </div>

      {/* Activity Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Actions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalActions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Last 24 hours
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.uniqueUsers}</div>
              <p className="text-xs text-muted-foreground">
                Unique users today
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.failedLogins}</div>
              <p className="text-xs text-muted-foreground">
                Authentication failures
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Events</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.criticalEvents}</div>
              <p className="text-xs text-muted-foreground">
                Require attention
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="users">User Activity</TabsTrigger>
          <TabsTrigger value="security">Security Events</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={filters.category} onValueChange={(value) => setFilters({ ...filters, category: value })}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                    <SelectItem value="authorization">Authorization</SelectItem>
                    <SelectItem value="data">Data</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="workflow">Workflow</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.severity} onValueChange={(value) => setFilters({ ...filters, severity: value })}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.dateRange} onValueChange={(value) => setFilters({ ...filters, dateRange: value })}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">Last Hour</SelectItem>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Logs</CardTitle>
              <CardDescription>
                {filteredLogs.length} logs found
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.slice(0, 50).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                        </TableCell>
                        <TableCell>{log.username}</TableCell>
                        <TableCell className="font-medium">{log.action}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(log.category)}
                            <span>{log.resource}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.ipAddress}</TableCell>
                        <TableCell>
                          <Badge variant={getSeverityColor(log.severity)}>
                            {log.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {log.category}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summary?.topActions.map((item, index) => (
                    <div key={item.action} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">#{index + 1}</span>
                        <span>{item.action}</span>
                      </div>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Most Active Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summary?.activeUsers.map((user, index) => (
                    <div key={user.username} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">#{index + 1}</span>
                        <span>{user.username}</span>
                      </div>
                      <Badge variant="secondary">{user.actions} actions</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Activity Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {summary?.activeUsers.map((user) => (
                  <div key={user.username} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">{user.username}</h4>
                      <Badge>{user.actions} actions</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Last Activity:</span>
                        <div className="font-medium">2 hours ago</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sessions:</span>
                        <div className="font-medium">3 active</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IP Addresses:</span>
                        <div className="font-medium">2 unique</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <div className="font-medium text-green-600">Active</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Security Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredLogs
                    .filter(log => log.category === 'security' || log.severity === 'critical')
                    .slice(0, 10)
                    .map((log) => (
                      <div key={log.id} className="border-l-4 border-red-500 pl-4 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{log.action}</div>
                            <div className="text-sm text-muted-foreground">
                              {log.username} • {format(new Date(log.timestamp), 'MMM dd HH:mm')}
                            </div>
                          </div>
                          <Badge variant={getSeverityColor(log.severity)}>
                            {log.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Failed Authentication Attempts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredLogs
                    .filter(log => log.action === 'LOGIN' && log.details?.result === 'failed')
                    .slice(0, 10)
                    .map((log) => (
                      <div key={log.id} className="border-l-4 border-yellow-500 pl-4 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">Failed Login</div>
                            <div className="text-sm text-muted-foreground">
                              {log.username} from {log.ipAddress}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(log.timestamp), 'MMM dd HH:mm')}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}