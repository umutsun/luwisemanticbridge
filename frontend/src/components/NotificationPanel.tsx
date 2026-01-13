'use client';

/**
 * NotificationPanel Component - Minimal Design
 * Compact notification display with icons
 */

import { Bell, Check, CheckCheck, Trash2, X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

export function NotificationPanel() {
  const {
    notifications,
    unreadCount,
    connected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  } = useNotifications();

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 1) return 'Şimdi';
    if (minutes < 60) return `${minutes}dk`;
    if (hours < 24) return `${hours}sa`;
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 text-[10px]"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          {!connected && (
            <div className="absolute bottom-0 right-0 h-2 w-2 bg-yellow-500 rounded-full" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[320px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Bildirimler</span>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={markAllAsRead}
                className="h-6 w-6"
                title="Tümünü okundu işaretle"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearAll}
                className="h-6 w-6 text-muted-foreground hover:text-red-600"
                title="Tümünü temizle"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-xs">Bildirim yok</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[300px]">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 hover:bg-muted/50 border-b last:border-b-0',
                  !notification.read && 'bg-blue-50/50 dark:bg-blue-950/20'
                )}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {getNotificationIcon(notification.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm truncate",
                    !notification.read && "font-medium"
                  )}>
                    {notification.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatTimestamp(notification.timestamp)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-0.5">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-50 hover:opacity-100"
                      onClick={() => markAsRead(notification.id)}
                      title="Okundu"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-50 hover:opacity-100 hover:text-red-600"
                    onClick={() => deleteNotification(notification.id)}
                    title="Sil"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </ScrollArea>
        )}

        {!connected && (
          <div className="px-3 py-1.5 text-[10px] text-yellow-600 dark:text-yellow-500 flex items-center gap-1.5 border-t bg-yellow-50/50 dark:bg-yellow-950/20">
            <div className="h-1.5 w-1.5 bg-yellow-500 rounded-full animate-pulse" />
            Bağlanıyor...
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
