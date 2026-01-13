/**
 * useNotifications Hook
 * Real-time notification consumer via WebSocket
 */

import { useEffect, useState, useCallback, useRef } from 'react';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
  read: boolean;
}

// Get auth token from various storage locations
const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;

  // Try direct token keys first
  const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
  if (token) return token;

  // Try zustand auth-storage
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    try {
      const parsed = JSON.parse(authStorage);
      if (parsed.state?.token) return parsed.state.token;
    } catch (e) {}
  }
  return null;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch initial notifications
  const fetchNotifications = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const res = await fetch('/api/v2/notifications?limit=50', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.notifications) {
        setNotifications(data.notifications);
        setUnreadCount(data.notifications.filter((n: Notification) => !n.read).length);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const res = await fetch('/api/v2/notifications/unread-count', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const res = await fetch(`/api/v2/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/notifications/read-all', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, []);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const res = await fetch(`/api/v2/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }, []);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/notifications/all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Failed to clear all:', error);
    }
  }, []);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/notifications`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Notification WebSocket connected');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'connected') {
            console.log('Notification service connected:', message.message);
            return;
          }

          if (message.type === 'notification' && message.data) {
            const notification: Notification = message.data;

            // Add to notifications list (toast already shown locally, no need to show again)
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };

      ws.onclose = () => {
        console.log('❌ Notification WebSocket disconnected');
        setConnected(false);
        wsRef.current = null;

        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Reconnecting to notification WebSocket...');
          connectWebSocket();
        }, 5000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnected(false);
    }
  }, []);

  // Initialize
  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket, fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    connected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    refresh: fetchNotifications
  };
}
