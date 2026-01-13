/**
 * Notifications Routes - Real-time Redis-based Notifications
 *
 * Endpoints:
 * - GET /notifications - List notifications
 * - POST /notifications - Create notification (admin/system only)
 * - PUT /notifications/:id/read - Mark as read
 * - PUT /notifications/read-all - Mark all as read
 * - DELETE /notifications/:id - Delete notification
 * - DELETE /notifications/all - Clear all
 * - GET /notifications/unread-count - Get unread count
 * - WS /notifications/ws - WebSocket real-time notifications
 */

import { Router, Request, Response } from 'express';
import { WebSocket } from 'ws';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import NotificationService from '../services/notification.service';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const router = Router();

// Store WebSocket clients
const wsClients = new Map<string, Set<WebSocket>>();

/**
 * GET /api/v2/notifications
 * Get notifications for current user
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { limit, offset, unreadOnly } = req.query;

    const notifications = await NotificationService.getNotifications(
      userId,
      {
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        unreadOnly: unreadOnly === 'true'
      }
    );

    res.json({
      success: true,
      notifications,
      count: notifications.length
    });
  } catch (error: any) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/notifications
 * Create notification (system/admin only - for testing)
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, title, message, userId, metadata, ttl } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, title, message'
      });
    }

    const notification = await NotificationService.create({
      type,
      title,
      message,
      userId,
      metadata,
      ttl
    });

    res.json({ success: true, notification });
  } catch (error: any) {
    logger.error('Create notification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v2/notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const success = await NotificationService.markAsRead(id, userId);

    res.json({ success });
  } catch (error: any) {
    logger.error('Mark as read error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v2/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const count = await NotificationService.markAllAsRead(userId);

    res.json({ success: true, count });
  } catch (error: any) {
    logger.error('Mark all as read error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v2/notifications/:id
 * Delete notification
 */
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const success = await NotificationService.deleteNotification(id, userId);

    res.json({ success });
  } catch (error: any) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v2/notifications/all
 * Clear all notifications
 */
router.delete('/all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const count = await NotificationService.clearAll(userId);

    res.json({ success: true, count });
  } catch (error: any) {
    logger.error('Clear all notifications error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const count = await NotificationService.getUnreadCount(userId);

    res.json({ success: true, count });
  } catch (error: any) {
    logger.error('Get unread count error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Setup WebSocket notification broadcast
 * Called from server.ts after WebSocket server is initialized
 */
export async function setupNotificationBroadcast(wss: any) {
  console.log('[NotificationBroadcast] Starting setup...');

  // For ioredis pub/sub, we need a dedicated subscriber instance
  const Redis = require('ioredis');

  const subscriberConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379,
    db: parseInt(process.env.REDIS_DB || '2'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy(times: number) {
      return Math.min(times * 50, 2000);
    },
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
  };

  console.log('[NotificationBroadcast] Redis config:', JSON.stringify({
    host: subscriberConfig.host,
    port: subscriberConfig.port,
    db: subscriberConfig.db,
    hasPassword: !!subscriberConfig.password
  }));

  let subscriber: any;
  try {
    subscriber = new Redis(subscriberConfig);
    console.log('[NotificationBroadcast] Redis instance created');
  } catch (createError: any) {
    console.error('[NotificationBroadcast] Failed to create Redis:', createError.message);
    return;
  }

  subscriber.on('error', (err: any) => {
    console.error('[NotificationBroadcast] Redis error:', err.message);
  });

  subscriber.on('connect', () => {
    console.log('✅ [NotificationBroadcast] Redis subscriber connected');
  });

  subscriber.on('ready', () => {
    console.log('✅ [NotificationBroadcast] Redis subscriber ready');
  });

  // Subscribe to notifications channel
  try {
    console.log('[NotificationBroadcast] Subscribing to notifications:broadcast...');
    await subscriber.subscribe('notifications:broadcast');
    console.log('✅ [NotificationBroadcast] Subscribed successfully');
  } catch (err: any) {
    console.error('❌ [NotificationBroadcast] Subscribe failed:', err.message || err);
    return;
  }

  // Handle incoming messages
  subscriber.on('message', (channel: string, message: string) => {
    console.log(`[NotificationBroadcast] Message received on channel: ${channel}`);
    if (channel === 'notifications:broadcast') {
      try {
        const notification = JSON.parse(message);

        // Broadcast to all connected WebSocket clients
        let clientCount = 0;
        wss.clients.forEach((client: WebSocket) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'notification',
              data: notification
            }));
            clientCount++;
          }
        });

        console.log(`📢 [NotificationBroadcast] Sent ${notification.id} to ${clientCount} clients`);
      } catch (error: any) {
        console.error('[NotificationBroadcast] Broadcast error:', error.message);
      }
    }
  });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, req: any) => {
    const clientId = req.headers['sec-websocket-key'] || `client_${Date.now()}`;
    console.log(`[NotificationBroadcast] Client connected: ${clientId}`);

    ws.on('close', () => {
      console.log(`[NotificationBroadcast] Client disconnected: ${clientId}`);
    });

    ws.on('error', (error: any) => {
      console.error(`[NotificationBroadcast] Client error ${clientId}:`, error.message);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to notification service',
      timestamp: new Date().toISOString()
    }));
  });

  console.log('✅ [NotificationBroadcast] Setup complete');
}

export default router;
