import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';
import { redisClient } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Redis key patterns
const TODOS_KEY = 'admin:todos';
const NOTIFICATIONS_KEY = 'admin:notifications';

// Types
interface AdminTodo {
  id: string;
  title: string;
  description?: string;
  link?: string;
  location?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdBy: number;
  createdByName: string;
  assignedTo?: number;
  assignedToName?: string;
  dueDate?: string;
  completedAt?: string;
  completedBy?: number;
  completedByName?: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminNotification {
  id: string;
  userId: number;
  type: 'todo_created' | 'todo_assigned' | 'todo_completed' | 'todo_updated' | 'todo_deleted';
  title: string;
  message: string;
  data: {
    todoId?: string;
    todoTitle?: string;
    actionBy?: number;
    actionByName?: string;
  };
  read: boolean;
  createdAt: string;
}

// Helper: Get all todos from Redis
async function getAllTodos(): Promise<AdminTodo[]> {
  const redis = redisClient();
  if (!redis) return [];

  try {
    const data = await redis.get(TODOS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting todos from Redis:', error);
    return [];
  }
}

// Helper: Save todos to Redis
async function saveTodos(todos: AdminTodo[]): Promise<void> {
  const redis = redisClient();
  if (!redis) return;

  try {
    await redis.set(TODOS_KEY, JSON.stringify(todos));
  } catch (error) {
    console.error('Error saving todos to Redis:', error);
  }
}

// Helper: Get notifications for a user
async function getUserNotifications(userId: number): Promise<AdminNotification[]> {
  const redis = redisClient();
  if (!redis) return [];

  try {
    const data = await redis.get(`${NOTIFICATIONS_KEY}:${userId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting notifications from Redis:', error);
    return [];
  }
}

// Helper: Save notification for a user
async function saveNotification(userId: number, notification: AdminNotification): Promise<void> {
  const redis = redisClient();
  if (!redis) return;

  try {
    const notifications = await getUserNotifications(userId);
    notifications.unshift(notification); // Add to beginning
    // Keep only last 100 notifications
    const trimmed = notifications.slice(0, 100);
    await redis.set(`${NOTIFICATIONS_KEY}:${userId}`, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Error saving notification to Redis:', error);
  }
}

// Helper: Get Socket.IO instance (lazy import to avoid circular deps)
function getIO() {
  try {
    const { io } = require('../server');
    return io;
  } catch {
    return null;
  }
}

// Helper: Broadcast to admin room
function broadcastToAdmins(event: string, data: any) {
  const io = getIO();
  if (io) {
    io.to('admin-room').emit(event, data);
  }
}

// Helper: Notify specific user
async function notifyUser(userId: number, notification: Omit<AdminNotification, 'id' | 'userId' | 'read' | 'createdAt'>) {
  const fullNotification: AdminNotification = {
    ...notification,
    id: uuidv4(),
    userId,
    read: false,
    createdAt: new Date().toISOString()
  };

  await saveNotification(userId, fullNotification);

  // Emit via Socket.IO
  const io = getIO();
  if (io) {
    io.to(`user:${userId}`).emit('admin:notification', fullNotification);
  }
}

// Helper: Notify all admins except one
async function notifyAllAdminsExcept(excludeUserId: number, notification: Omit<AdminNotification, 'id' | 'userId' | 'read' | 'createdAt'>, adminIds: number[]) {
  for (const adminId of adminIds) {
    if (adminId !== excludeUserId) {
      await notifyUser(adminId, notification);
    }
  }
}

// ============ ROUTES ============

// GET /api/v2/admin/todos - List all todos
router.get('/todos', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, priority, assignedTo } = req.query;

    let todos = await getAllTodos();

    // Filter by status
    if (status && status !== 'all') {
      todos = todos.filter(t => t.status === status);
    }

    // Filter by priority
    if (priority && priority !== 'all') {
      todos = todos.filter(t => t.priority === priority);
    }

    // Filter by assignedTo
    if (assignedTo) {
      const assignedToId = parseInt(assignedTo as string);
      todos = todos.filter(t => t.assignedTo === assignedToId);
    }

    // Sort by: urgent first, then by date
    todos.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const statusOrder = { pending: 0, in_progress: 1, completed: 2 };

      // First by status (completed last)
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }

      // Then by priority
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      // Then by date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    res.json({ todos });
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// POST /api/v2/admin/todos - Create new todo
router.post('/todos', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, link, location, priority = 'normal', assignedTo, assignedToName, dueDate } = req.body;
    const userId = req.user?.userId;
    const userName = req.user?.name || req.user?.email || 'Admin';

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const newTodo: AdminTodo = {
      id: uuidv4(),
      title,
      description,
      link,
      location,
      status: 'pending',
      priority,
      createdBy: userId!,
      createdByName: userName,
      assignedTo,
      assignedToName,
      dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const todos = await getAllTodos();
    todos.push(newTodo);
    await saveTodos(todos);

    // Broadcast to all admins
    broadcastToAdmins('admin:todo:created', newTodo);

    // If assigned to someone, notify them
    if (assignedTo && assignedTo !== userId) {
      await notifyUser(assignedTo, {
        type: 'todo_assigned',
        title: 'Yeni Görev Atandı',
        message: `${userName} size "${title}" görevini atadı`,
        data: {
          todoId: newTodo.id,
          todoTitle: title,
          actionBy: userId,
          actionByName: userName
        }
      });
    }

    res.status(201).json({ todo: newTodo });
  } catch (error) {
    console.error('Error creating todo:', error);
    res.status(500).json({ error: 'Failed to create todo' });
  }
});

// GET /api/v2/admin/todos/:id - Get single todo
router.get('/todos/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const todos = await getAllTodos();
    const todo = todos.find(t => t.id === id);

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json({ todo });
  } catch (error) {
    console.error('Error fetching todo:', error);
    res.status(500).json({ error: 'Failed to fetch todo' });
  }
});

// PUT /api/v2/admin/todos/:id - Update todo
router.put('/todos/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, link, location, priority, assignedTo, assignedToName, dueDate } = req.body;
    const userId = req.user?.userId;
    const userName = req.user?.name || req.user?.email || 'Admin';

    const todos = await getAllTodos();
    const todoIndex = todos.findIndex(t => t.id === id);

    if (todoIndex === -1) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    const oldTodo = todos[todoIndex];
    const updatedTodo: AdminTodo = {
      ...oldTodo,
      title: title ?? oldTodo.title,
      description: description ?? oldTodo.description,
      link: link ?? oldTodo.link,
      location: location ?? oldTodo.location,
      priority: priority ?? oldTodo.priority,
      assignedTo: assignedTo ?? oldTodo.assignedTo,
      assignedToName: assignedToName ?? oldTodo.assignedToName,
      dueDate: dueDate ?? oldTodo.dueDate,
      updatedAt: new Date().toISOString()
    };

    todos[todoIndex] = updatedTodo;
    await saveTodos(todos);

    // Broadcast update
    broadcastToAdmins('admin:todo:updated', updatedTodo);

    // If newly assigned, notify assignee
    if (assignedTo && assignedTo !== oldTodo.assignedTo && assignedTo !== userId) {
      await notifyUser(assignedTo, {
        type: 'todo_assigned',
        title: 'Görev Size Atandı',
        message: `${userName} "${updatedTodo.title}" görevini size atadı`,
        data: {
          todoId: id,
          todoTitle: updatedTodo.title,
          actionBy: userId,
          actionByName: userName
        }
      });
    }

    res.json({ todo: updatedTodo });
  } catch (error) {
    console.error('Error updating todo:', error);
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// PATCH /api/v2/admin/todos/:id/status - Change status
router.patch('/todos/:id/status', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.userId;
    const userName = req.user?.name || req.user?.email || 'Admin';

    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const todos = await getAllTodos();
    const todoIndex = todos.findIndex(t => t.id === id);

    if (todoIndex === -1) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    const oldStatus = todos[todoIndex].status;
    todos[todoIndex].status = status;
    todos[todoIndex].updatedAt = new Date().toISOString();

    if (status === 'completed') {
      todos[todoIndex].completedAt = new Date().toISOString();
      todos[todoIndex].completedBy = userId;
      todos[todoIndex].completedByName = userName;
    } else {
      todos[todoIndex].completedAt = undefined;
      todos[todoIndex].completedBy = undefined;
      todos[todoIndex].completedByName = undefined;
    }

    await saveTodos(todos);

    const updatedTodo = todos[todoIndex];

    // Broadcast update
    broadcastToAdmins('admin:todo:updated', updatedTodo);

    // If completed, notify the creator (if different from completer)
    if (status === 'completed' && updatedTodo.createdBy !== userId) {
      await notifyUser(updatedTodo.createdBy, {
        type: 'todo_completed',
        title: 'Görev Tamamlandı',
        message: `${userName} "${updatedTodo.title}" görevini tamamladı`,
        data: {
          todoId: id,
          todoTitle: updatedTodo.title,
          actionBy: userId,
          actionByName: userName
        }
      });
    }

    res.json({ todo: updatedTodo });
  } catch (error) {
    console.error('Error updating todo status:', error);
    res.status(500).json({ error: 'Failed to update todo status' });
  }
});

// DELETE /api/v2/admin/todos/:id - Delete todo
router.delete('/todos/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userName = req.user?.name || req.user?.email || 'Admin';

    const todos = await getAllTodos();
    const todoIndex = todos.findIndex(t => t.id === id);

    if (todoIndex === -1) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    const deletedTodo = todos[todoIndex];
    todos.splice(todoIndex, 1);
    await saveTodos(todos);

    // Broadcast deletion
    broadcastToAdmins('admin:todo:deleted', { id, deletedBy: userName });

    res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    console.error('Error deleting todo:', error);
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

// ============ NOTIFICATIONS ============

// GET /api/v2/admin/notifications - Get user's notifications
router.get('/notifications', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const notifications = await getUserNotifications(userId);
    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/v2/admin/notifications/:id/read - Mark as read
router.patch('/notifications/:id/read', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const redis = redisClient();
    if (!redis) {
      return res.status(500).json({ error: 'Redis not available' });
    }

    const notifications = await getUserNotifications(userId);
    const notificationIndex = notifications.findIndex(n => n.id === id);

    if (notificationIndex === -1) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notifications[notificationIndex].read = true;
    await redis.set(`${NOTIFICATIONS_KEY}:${userId}`, JSON.stringify(notifications));

    res.json({ notification: notifications[notificationIndex] });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// PATCH /api/v2/admin/notifications/read-all - Mark all as read
router.patch('/notifications/read-all', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const redis = redisClient();
    if (!redis) {
      return res.status(500).json({ error: 'Redis not available' });
    }

    const notifications = await getUserNotifications(userId);
    notifications.forEach(n => n.read = true);
    await redis.set(`${NOTIFICATIONS_KEY}:${userId}`, JSON.stringify(notifications));

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// DELETE /api/v2/admin/notifications/:id - Delete notification
router.delete('/notifications/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const redis = redisClient();
    if (!redis) {
      return res.status(500).json({ error: 'Redis not available' });
    }

    let notifications = await getUserNotifications(userId);
    notifications = notifications.filter(n => n.id !== id);
    await redis.set(`${NOTIFICATIONS_KEY}:${userId}`, JSON.stringify(notifications));

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
