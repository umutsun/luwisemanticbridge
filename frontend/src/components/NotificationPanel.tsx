'use client';

/**
 * NotificationPanel Component - Ultra Minimal
 */

import { Bell, CheckCheck, Trash2, X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
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
    const cls = "h-3.5 w-3.5";
    switch (type) {
      case 'success': return <CheckCircle2 className={cn(cls, "text-green-500")} />;
      case 'error': return <XCircle className={cn(cls, "text-red-500")} />;
      case 'warning': return <AlertTriangle className={cn(cls, "text-yellow-500")} />;
      case 'info': return <Info className={cn(cls, "text-blue-500")} />;
      default: return <Bell className={cn(cls, "text-gray-400")} />;
    }
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-0">
        {/* Header - minimal */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
          <span className="text-xs font-medium text-muted-foreground">{notifications.length} bildirim</span>
          <div className="flex">
            {unreadCount > 0 && (
              <Button variant="ghost" size="icon" onClick={markAllAsRead} className="h-5 w-5" title="Tümünü oku">
                <CheckCheck className="h-3 w-3" />
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="icon" onClick={clearAll} className="h-5 w-5 hover:text-red-500" title="Temizle">
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="max-h-60 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <Bell className="h-6 w-6 mx-auto mb-1 opacity-20" />
              <p className="text-[10px]">Bildirim yok</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 cursor-pointer",
                  !n.read && "bg-blue-50/50 dark:bg-blue-950/30"
                )}
                onClick={() => !n.read && markAsRead(n.id)}
              >
                {getIcon(n.type)}
                <span className={cn("flex-1 text-[11px] truncate", !n.read && "font-medium")}>
                  {n.message || n.title}
                </span>
                <span className="text-[9px] text-muted-foreground">{timeAgo(n.timestamp)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 opacity-0 group-hover:opacity-100 hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        {!connected && (
          <div className="px-2 py-1 text-[9px] text-yellow-600 border-t flex items-center gap-1">
            <div className="h-1 w-1 bg-yellow-500 rounded-full animate-pulse" />
            bağlanıyor...
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
