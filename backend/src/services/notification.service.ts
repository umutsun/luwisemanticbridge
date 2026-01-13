/**
 * Notification Service - Redis-based Real-time Notifications
 *
 * Features:
 * - Store notifications in Redis with TTL
 * - Broadcast to all connected WebSocket clients
 * - Support for toast-like notifications (success, error, warning, info)
 * - User-specific and global notifications
 * - Notification history with pagination
 */

import { redis } from '../server';
import { logger } from '../utils/logger';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  userId?: string; // If set, notification is user-specific
  metadata?: Record<string, any>; // Extra data (e.g., action buttons, links)
  timestamp: string;
  read: boolean;
  ttl?: number; // Time to live in seconds (default: 24h)
}

export class NotificationService {
  private static readonly NOTIFICATIONS_KEY_PREFIX = 'notifications:';
  private static readonly GLOBAL_NOTIFICATIONS_KEY = 'notifications:global';
  private static readonly USER_NOTIFICATIONS_KEY = 'notifications:user:';
  private static readonly NOTIFICATION_CHANNEL = 'notifications:broadcast';
  private static readonly DEFAULT_TTL = 86400; // 24 hours

  /**
   * Create and broadcast a notification
   */
  static async create(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Promise<Notification> {
    try {
      const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString();
      const ttl = notification.ttl || this.DEFAULT_TTL;

      const fullNotification: Notification = {
        id,
        ...notification,
        timestamp,
        read: false
      };

      // Store in Redis
      const key = notification.userId
        ? `${this.USER_NOTIFICATIONS_KEY}${notification.userId}:${id}`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:${id}`;

      await redis.setex(
        key,
        ttl,
        JSON.stringify(fullNotification)
      );

      // Add to sorted set for listing (score = timestamp)
      const listKey = notification.userId
        ? `${this.USER_NOTIFICATIONS_KEY}${notification.userId}:list`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:list`;

      await redis.zadd(listKey, Date.now(), id);
      await redis.expire(listKey, ttl);

      // Broadcast to WebSocket clients
      await this.broadcast(fullNotification);

      logger.info(`Notification created: ${id} (type: ${notification.type})`);
      return fullNotification;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Broadcast notification to all WebSocket clients via Redis pub/sub
   */
  static async broadcast(notification: Notification): Promise<void> {
    try {
      await redis.publish(
        this.NOTIFICATION_CHANNEL,
        JSON.stringify(notification)
      );
    } catch (error) {
      logger.error('Failed to broadcast notification:', error);
    }
  }

  /**
   * Get notifications for a user (or global if userId is null)
   */
  static async getNotifications(
    userId?: string,
    options?: { limit?: number; offset?: number; unreadOnly?: boolean }
  ): Promise<Notification[]> {
    try {
      const { limit = 50, offset = 0, unreadOnly = false } = options || {};

      const listKey = userId
        ? `${this.USER_NOTIFICATIONS_KEY}${userId}:list`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:list`;

      // Get notification IDs from sorted set (newest first)
      const notificationIds = await redis.zrevrange(listKey, offset, offset + limit - 1);

      if (notificationIds.length === 0) {
        return [];
      }

      // Get full notifications
      const notifications: Notification[] = [];

      for (const id of notificationIds) {
        const key = userId
          ? `${this.USER_NOTIFICATIONS_KEY}${userId}:${id}`
          : `${this.GLOBAL_NOTIFICATIONS_KEY}:${id}`;

        const data = await redis.get(key);
        if (data) {
          const notification = JSON.parse(data) as Notification;
          if (!unreadOnly || !notification.read) {
            notifications.push(notification);
          }
        }
      }

      return notifications;
    } catch (error) {
      logger.error('Failed to get notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userId?: string): Promise<boolean> {
    try {
      const key = userId
        ? `${this.USER_NOTIFICATIONS_KEY}${userId}:${notificationId}`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:${notificationId}`;

      const data = await redis.get(key);
      if (!data) {
        return false;
      }

      const notification = JSON.parse(data) as Notification;
      notification.read = true;

      // Get remaining TTL
      const ttl = await redis.ttl(key);
      if (ttl > 0) {
        await redis.setex(key, ttl, JSON.stringify(notification));
      }

      return true;
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId?: string): Promise<number> {
    try {
      const listKey = userId
        ? `${this.USER_NOTIFICATIONS_KEY}${userId}:list`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:list`;

      const notificationIds = await redis.zrevrange(listKey, 0, -1);
      let count = 0;

      for (const id of notificationIds) {
        const success = await this.markAsRead(id, userId);
        if (success) count++;
      }

      return count;
    } catch (error) {
      logger.error('Failed to mark all as read:', error);
      return 0;
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string, userId?: string): Promise<boolean> {
    try {
      const key = userId
        ? `${this.USER_NOTIFICATIONS_KEY}${userId}:${notificationId}`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:${notificationId}`;

      const listKey = userId
        ? `${this.USER_NOTIFICATIONS_KEY}${userId}:list`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:list`;

      await redis.del(key);
      await redis.zrem(listKey, notificationId);

      return true;
    } catch (error) {
      logger.error('Failed to delete notification:', error);
      return false;
    }
  }

  /**
   * Clear all notifications for a user
   */
  static async clearAll(userId?: string): Promise<number> {
    try {
      const listKey = userId
        ? `${this.USER_NOTIFICATIONS_KEY}${userId}:list`
        : `${this.GLOBAL_NOTIFICATIONS_KEY}:list`;

      const notificationIds = await redis.zrevrange(listKey, 0, -1);
      let count = 0;

      for (const id of notificationIds) {
        const success = await this.deleteNotification(id, userId);
        if (success) count++;
      }

      await redis.del(listKey);
      return count;
    } catch (error) {
      logger.error('Failed to clear all notifications:', error);
      return 0;
    }
  }

  /**
   * Get unread count
   */
  static async getUnreadCount(userId?: string): Promise<number> {
    try {
      const notifications = await this.getNotifications(userId, { unreadOnly: true });
      return notifications.length;
    } catch (error) {
      logger.error('Failed to get unread count:', error);
      return 0;
    }
  }

  /**
   * Helper: Create success notification
   */
  static async success(title: string, message: string, userId?: string, metadata?: Record<string, any>): Promise<Notification> {
    return this.create({ type: 'success', title, message, userId, metadata });
  }

  /**
   * Helper: Create error notification
   */
  static async error(title: string, message: string, userId?: string, metadata?: Record<string, any>): Promise<Notification> {
    return this.create({ type: 'error', title, message, userId, metadata });
  }

  /**
   * Helper: Create warning notification
   */
  static async warning(title: string, message: string, userId?: string, metadata?: Record<string, any>): Promise<Notification> {
    return this.create({ type: 'warning', title, message, userId, metadata });
  }

  /**
   * Helper: Create info notification
   */
  static async info(title: string, message: string, userId?: string, metadata?: Record<string, any>): Promise<Notification> {
    return this.create({ type: 'info', title, message, userId, metadata });
  }
}

export default NotificationService;
