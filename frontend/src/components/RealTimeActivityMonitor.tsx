'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Users, AlertTriangle, Database, Zap, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityEvent {
  id: string;
  type: 'user_action' | 'system_event' | 'security_alert' | 'workflow_execution' | 'data_operation';
  title: string;
  description: string;
  user?: string;
  timestamp: Date;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: any;
}

export function RealTimeActivityMonitor() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeUsers: 0,
    alerts: 0,
    workflows: 0
  });

  // Generate mock real-time events
  const generateEvent = (): ActivityEvent => {
    const eventTypes: ActivityEvent['type'][] = [
      'user_action', 'system_event', 'security_alert', 'workflow_execution', 'data_operation'
    ];
    const titles = {
      user_action: ['User Login', 'File Uploaded', 'Settings Updated', 'Report Generated'],
      system_event: ['Database Backup', 'System Check', 'Performance Alert', 'Cache Cleared'],
      security_alert: ['Failed Login Attempt', 'Suspicious Activity', 'Permission Change', 'Rate Limit Exceeded'],
      workflow_execution: ['Workflow Started', 'Workflow Completed', 'Workflow Failed', 'Workflow Retried'],
      data_operation: ['Data Exported', 'Data Imported', 'Embedding Updated', 'Query Executed']
    };
    const severities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
    const users = ['admin', 'john.doe', 'jane.smith', 'operator', 'analyst'];

    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const titleList = titles[type];
    const title = titleList[Math.floor(Math.random() * titleList.length)];

    return {
      id: `event-${Date.now()}-${Math.random()}`,
      type,
      title,
      description: `${title} was performed successfully`,
      user: type !== 'system_event' ? users[Math.floor(Math.random() * users.length)] : undefined,
      timestamp: new Date(),
      severity: type === 'security_alert' ? severities[Math.floor(Math.random() * severities.length)] : 'low',
      metadata: {
        duration: type === 'workflow_execution' ? Math.floor(Math.random() * 10000) : undefined,
        size: type === 'data_operation' ? Math.floor(Math.random() * 1000000) : undefined,
        affected: Math.floor(Math.random() * 100)
      }
    };
  };

  useEffect(() => {
    // Initialize with some events
    const initialEvents = Array.from({ length: 20 }, generateEvent);
    setEvents(initialEvents);
    setStats({
      totalEvents: initialEvents.length,
      activeUsers: new Set(initialEvents.filter(e => e.user).map(e => e.user)).size,
      alerts: initialEvents.filter(e => e.type === 'security_alert').length,
      workflows: initialEvents.filter(e => e.type === 'workflow_execution').length
    });

    // Simulate real-time events
    const interval = setInterval(() => {
      const newEvent = generateEvent();
      setEvents(prev => [newEvent, ...prev].slice(0, 50)); // Keep last 50 events

      setStats(prev => ({
        totalEvents: prev.totalEvents + 1,
        activeUsers: newEvent.user ? prev.activeUsers + 1 : prev.activeUsers,
        alerts: prev.alerts + (newEvent.type === 'security_alert' ? 1 : 0),
        workflows: prev.workflows + (newEvent.type === 'workflow_execution' ? 1 : 0)
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'user_action': return <Users className="h-4 w-4" />;
      case 'system_event': return <Database className="h-4 w-4" />;
      case 'security_alert': return <AlertTriangle className="h-4 w-4" />;
      case 'workflow_execution': return <Zap className="h-4 w-4" />;
      case 'data_operation': return <Database className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const clearEvents = () => {
    setEvents([]);
    setStats({
      totalEvents: 0,
      activeUsers: 0,
      alerts: 0,
      workflows: 0
    });
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.alerts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workflows</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.workflows}</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Real-time Activity Feed</CardTitle>
              <CardDescription>
                Live monitoring of system and user activities
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-muted-foreground">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
              <Button variant="outline" size="sm" onClick={clearEvents}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-0.5">
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{event.title}</span>
                        {event.severity && event.severity !== 'low' && (
                          <Badge variant={getSeverityColor(event.severity)} className="text-xs">
                            {event.severity}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                    {event.user && (
                      <div className="text-xs text-muted-foreground">
                        by {event.user}
                      </div>
                    )}
                    {event.metadata && (
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        {event.metadata.duration && (
                          <span>Duration: {(event.metadata.duration / 1000).toFixed(2)}s</span>
                        )}
                        {event.metadata.size && (
                          <span>Size: {(event.metadata.size / 1024).toFixed(2)}KB</span>
                        )}
                        {event.metadata.affected && (
                          <span>Affected: {event.metadata.affected} items</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No activity events yet
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}