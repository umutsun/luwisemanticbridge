'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, X, Check, AlertTriangle, Info, AlertCircle, CheckCircle, ListTodo, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSocketIO } from '@/hooks/useSocketIO';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/stores/auth.store';
import useAdminTodoStore from '@/stores/admin-todo.store';
import { AdminNotification } from '@/types/admin-todo';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'todo';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  source: string;
  data?: {
    todoId?: string;
    actionByName?: string;
  };
}

interface NotificationCenterProps {
  onSettingsClick?: () => void;
  enableWebSocket?: boolean;
}

export default function NotificationCenter({
  onSettingsClick,
  enableWebSocket = true // Varsayılan: AÇIK (artık kullanıyoruz)
}: NotificationCenterProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    notifications: adminNotifications,
    unreadCount: adminUnreadCount,
    fetchNotifications,
    markAsRead: markAdminAsRead,
    markAllAsRead: markAllAdminAsRead,
    deleteNotification: deleteAdminNotification,
    addNotification: addAdminNotification
  } = useAdminTodoStore();

  const [systemNotifications, setSystemNotifications] = useState<Notification[]>([]);

  // Combined notifications
  const allNotifications: Notification[] = [
    // Admin notifications
    ...adminNotifications.map((n: AdminNotification) => ({
      id: n.id,
      type: 'todo' as const,
      title: n.title,
      message: n.message,
      timestamp: n.createdAt,
      read: n.read,
      source: n.data.actionByName || 'Admin',
      data: n.data
    })),
    // System notifications
    ...systemNotifications
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalUnread = adminUnreadCount + systemNotifications.filter(n => !n.read).length;

  // WebSocket URL
  const websocketUrl = enableWebSocket
    ? (process.env.NEXT_PUBLIC_WEBSOCKET_URL || process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') || '')
    : '';

  // WebSocket connection
  const { socket, isConnected } = useSocketIO(websocketUrl, {
    reconnectAttempts: 3,
    reconnectInterval: 5000,
    enableLogs: false
  });

  // Fetch admin notifications on mount (only for admin users)
  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'moderator') {
      fetchNotifications();
    }
  }, [user]);

  // Join admin room and listen for notifications
  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    // Join admin room if admin
    if (user.role === 'admin' || user.role === 'moderator') {
      socket.emit('admin:join', { userId: user.id, role: user.role });

      // Listen for admin notifications
      socket.on('admin:notification', (notification: AdminNotification) => {
        addAdminNotification(notification);
      });
    }

    // General system notification listener
    socket.on('notification', (data: any) => {
      const newNotification: Notification = {
        id: data.id || Date.now().toString(),
        type: data.severity || 'info',
        title: data.title || t('notifications.title'),
        message: data.message || '',
        timestamp: data.timestamp || new Date().toISOString(),
        read: false,
        source: data.source || 'System'
      };
      setSystemNotifications(prev => [newNotification, ...prev].slice(0, 50));
    });

    return () => {
      if (user?.role === 'admin' || user?.role === 'moderator') {
        socket.emit('admin:leave');
        socket.off('admin:notification');
      }
      socket.off('notification');
    };
  }, [socket, isConnected, user]);

  const handleMarkAsRead = useCallback(async (notification: Notification) => {
    if (notification.type === 'todo') {
      await markAdminAsRead(notification.id);
    } else {
      setSystemNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
      );
    }
  }, [markAdminAsRead]);

  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAdminAsRead();
    setSystemNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [markAllAdminAsRead]);

  const handleRemove = useCallback(async (notification: Notification) => {
    if (notification.type === 'todo') {
      await deleteAdminNotification(notification.id);
    } else {
      setSystemNotifications(prev => prev.filter(n => n.id !== notification.id));
    }
  }, [deleteAdminNotification]);

  const handleClick = useCallback((notification: Notification) => {
    handleMarkAsRead(notification);

    // Navigate to admin tasks if it's a todo notification
    if (notification.type === 'todo' && notification.data?.todoId) {
      router.push('/dashboard/admin-tasks');
    }
  }, [handleMarkAsRead, router]);

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'todo': return <ListTodo className="h-4 w-4 text-purple-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative p-2 h-9">
          <div className="relative">
            <Bell className="h-5 w-5" />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
            {/* WebSocket status indicator */}
            {enableWebSocket && isConnected && (
              <div className="absolute bottom-0 right-0 h-2 w-2 bg-green-500 rounded-full" title="Canlı bağlantı" />
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('notifications.title')}</span>
              {totalUnread > 0 && (
                <Badge variant="destructive" className="h-5 px-2 text-xs">
                  {totalUnread}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {totalUnread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="h-7 px-2 text-xs"
                >
                  <Check className="h-3 w-3 mr-1" />
                  {t('notifications.markAllAsRead')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Notifications list */}
        <ScrollArea className="h-80">
          {allNotifications.length === 0 ? (
            <div className="p-4 text-center">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t('notifications.noNotifications')}</p>
            </div>
          ) : (
            <div className="p-2">
              {allNotifications.slice(0, 20).map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg mb-2 cursor-pointer transition-colors hover:bg-muted/50 ${!notification.read ? 'bg-muted/30' : ''
                    }`}
                  onClick={() => handleClick(notification)}
                >
                  <div className="flex items-start gap-2">
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={`text-sm font-medium ${!notification.read ? 'font-semibold' : ''}`}>
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <div className="h-1.5 w-1.5 bg-blue-500 rounded-full" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {notification.source} • {new Date(notification.timestamp).toLocaleString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(notification);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
