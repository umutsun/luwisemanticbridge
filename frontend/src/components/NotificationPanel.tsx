'use client';

/**
 * NotificationPanel Component
 * Matches other header dropdown styles
 */

import { Bell, CheckCheck, Trash2, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

  const getIcon = (type: string) => {
    const cls = "h-4 w-4";
    switch (type) {
      case 'success': return <CheckCircle2 className={cn(cls, "text-green-500")} />;
      case 'error': return <XCircle className={cn(cls, "text-red-500")} />;
      case 'warning': return <AlertTriangle className={cn(cls, "text-yellow-500")} />;
      case 'info': return <Info className={cn(cls, "text-blue-500")} />;
      default: return <Bell className={cn(cls, "text-muted-foreground")} />;
    }
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'şimdi';
    if (m < 60) return `${m} dk`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} sa`;
    return `${Math.floor(h / 24)} gün`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {!connected && (
            <span className="absolute bottom-0 right-0 h-2 w-2 bg-yellow-500 rounded-full" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b">
          <span className="text-sm font-medium">Bildirimler</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.preventDefault(); markAllAsRead(); }}
                className="h-7 px-2 text-xs"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Oku
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.preventDefault(); clearAll(); }}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Temizle
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="max-h-[300px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Bildirim yok</p>
            </div>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  "flex items-start gap-3 p-3 cursor-pointer focus:bg-accent",
                  !n.read && "bg-blue-50/50 dark:bg-blue-950/20"
                )}
                onClick={() => !n.read && markAsRead(n.id)}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm truncate",
                    !n.read && "font-medium"
                  )}>
                    {n.message || n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {timeAgo(n.timestamp)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    deleteNotification(n.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </DropdownMenuItem>
            ))
          )}
        </div>

        {/* Connection status */}
        {!connected && (
          <>
            <DropdownMenuSeparator />
            <div className="px-3 py-2 text-xs text-yellow-600 dark:text-yellow-500 flex items-center gap-2">
              <span className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse" />
              Bağlantı kuruluyor...
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
