'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, MapPin, Clock, Monitor, Shield, Activity, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface UserSession {
  id: string;
  userId: string;
  username: string;
  email: string;
  role: string;
  loginTime: Date;
  lastActivity: Date;
  ipAddress: string;
  location: string;
  userAgent: string;
  device: string;
  status: 'active' | 'idle' | 'expired';
  duration: number;
  actions: number;
  pages: string[];
}

interface SessionAnalytics {
  totalSessions: number;
  activeUsers: number;
  averageDuration: number;
  topLocations: Array<{ location: string; count: number }>;
  deviceStats: { desktop: number; mobile: number; tablet: number };
}

export function UserSessionTracker() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);
  const [filter, setFilter] = useState({
    status: 'all',
    role: 'all',
    location: 'all'
  });

  // Generate mock session data
  const generateMockSessions = (): UserSession[] => {
    const locations = [
      'New York, USA', 'London, UK', 'Tokyo, Japan', 'Berlin, Germany',
      'Paris, France', 'Sydney, Australia', 'Toronto, Canada', 'San Francisco, USA'
    ];
    const devices = ['Desktop', 'Mobile', 'Tablet'];
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
    ];
    const pages = [
      '/dashboard', '/workflows', '/database', '/embeddings', '/audit-logs',
      '/settings', '/users', '/reports', '/analytics'
    ];

    return Array.from({ length: 50 }, (_, i) => {
      const loginTime = new Date(Date.now() - Math.random() * 86400000 * 7); // Last 7 days
      const lastActivity = new Date(loginTime.getTime() + Math.random() * (Date.now() - loginTime.getTime()));

      return {
        id: `session-${i + 1}`,
        userId: `user-${Math.floor(Math.random() * 100) + 1}`,
        username: `user${Math.floor(Math.random() * 100) + 1}`,
        email: `user${Math.floor(Math.random() * 100) + 1}@example.com`,
        role: ['admin', 'user', 'operator', 'analyst'][Math.floor(Math.random() * 4)],
        loginTime,
        lastActivity,
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        location: locations[Math.floor(Math.random() * locations.length)],
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        device: devices[Math.floor(Math.random() * devices.length)],
        status: ['active', 'idle', 'expired'][Math.floor(Math.random() * 3)] as 'active' | 'idle' | 'expired',
        duration: Math.floor(Math.random() * 3600000), // Up to 1 hour
        actions: Math.floor(Math.random() * 100),
        pages: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, () =>
          pages[Math.floor(Math.random() * pages.length)]
        )
      };
    });
  };

  useEffect(() => {
    const mockSessions = generateMockSessions();
    setSessions(mockSessions);

    // Calculate analytics
    const totalSessions = mockSessions.length;
    const activeUsers = new Set(mockSessions.filter(s => s.status === 'active').map(s => s.userId)).size;
    const averageDuration = mockSessions.reduce((acc, s) => acc + s.duration, 0) / totalSessions;

    const locationCounts = mockSessions.reduce((acc, s) => {
      acc[s.location] = (acc[s.location] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const deviceStats = mockSessions.reduce((acc, s) => {
      const device = s.device.toLowerCase() as keyof typeof acc;
      acc[device] = (acc[device] || 0) + 1;
      return acc;
    }, { desktop: 0, mobile: 0, tablet: 0 });

    setAnalytics({
      totalSessions,
      activeUsers,
      averageDuration,
      topLocations: Object.entries(locationCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([location, count]) => ({ location, count })),
      deviceStats
    });
  }, []);

  const filteredSessions = sessions.filter(session => {
    if (filter.status !== 'all' && session.status !== filter.status) return false;
    if (filter.role !== 'all' && session.role !== filter.role) return false;
    if (filter.location !== 'all' && session.location !== filter.location) return false;
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'idle': return 'secondary';
      case 'expired': return 'outline';
      default: return 'outline';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'operator': return 'default';
      case 'analyst': return 'secondary';
      default: return 'outline';
    }
  };

  const terminateSession = (sessionId: string) => {
    setSessions(prev =>
      prev.map(session =>
        session.id === sessionId
          ? { ...session, status: 'expired' as const }
          : session
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Analytics Overview */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalSessions}</div>
              <p className="text-xs text-muted-foreground">
                Last 7 days
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.activeUsers}</div>
              <p className="text-xs text-muted-foreground">
                Currently online
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(analytics.averageDuration / 60000)}m
              </div>
              <p className="text-xs text-muted-foreground">
                Per session
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Device Split</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="text-sm">
                  Desktop: {Math.round((analytics.deviceStats.desktop / analytics.totalSessions) * 100)}%
                </div>
                <div className="text-sm">
                  Mobile: {Math.round((analytics.deviceStats.mobile / analytics.totalSessions) * 100)}%
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filter.status} onValueChange={(value) => setFilter({ ...filter, status: value })}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.role} onValueChange={(value) => setFilter({ ...filter, role: value })}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="analyst">Analyst</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.location} onValueChange={(value) => setFilter({ ...filter, location: value })}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {analytics?.topLocations.map(loc => (
                  <SelectItem key={loc.location} value={loc.location}>
                    {loc.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Sessions</CardTitle>
          <CardDescription>
            Active and recent user sessions with detailed tracking information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.slice(0, 20).map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{session.username}</div>
                        <div className="text-sm text-muted-foreground">{session.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleColor(session.role)}>
                        {session.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{session.location}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span>{session.device}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(session.status)}>
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDistanceToNow(session.lastActivity, { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {session.actions} actions
                      </div>
                    </TableCell>
                    <TableCell>
                      {session.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => terminateSession(session.id)}
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          Terminate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top Locations */}
      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle>Top Locations</CardTitle>
            <CardDescription>
              Most active user locations in the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {analytics.topLocations.map((location, index) => (
                <div key={location.location} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">#{index + 1}</span>
                    <span>{location.location}</span>
                  </div>
                  <Badge variant="secondary">{location.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}