// Admin Todo Types
export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface AdminTodo {
  id: string;
  title: string;
  description?: string;
  link?: string;
  location?: string;
  status: TodoStatus;
  priority: TodoPriority;
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

export interface CreateTodoData {
  title: string;
  description?: string;
  link?: string;
  location?: string;
  priority?: TodoPriority;
  assignedTo?: number;
  assignedToName?: string;
  dueDate?: string;
}

export interface UpdateTodoData {
  title?: string;
  description?: string;
  link?: string;
  location?: string;
  priority?: TodoPriority;
  assignedTo?: number;
  assignedToName?: string;
  dueDate?: string;
}

// Admin Notification Types
export type AdminNotificationType =
  | 'todo_created'
  | 'todo_assigned'
  | 'todo_completed'
  | 'todo_updated'
  | 'todo_deleted';

export interface AdminNotification {
  id: string;
  userId: number;
  type: AdminNotificationType;
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
