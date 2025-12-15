import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import apiClient from '@/lib/api/client';
import {
  AdminTodo,
  AdminNotification,
  CreateTodoData,
  UpdateTodoData,
  TodoStatus
} from '@/types/admin-todo';

interface AdminTodoState {
  // Todos
  todos: AdminTodo[];
  loading: boolean;
  error: string | null;

  // Notifications
  notifications: AdminNotification[];
  unreadCount: number;

  // Actions - Todos
  fetchTodos: (filters?: { status?: string; priority?: string; assignedTo?: number }) => Promise<void>;
  createTodo: (data: CreateTodoData) => Promise<AdminTodo | null>;
  updateTodo: (id: string, data: UpdateTodoData) => Promise<AdminTodo | null>;
  deleteTodo: (id: string) => Promise<boolean>;
  changeStatus: (id: string, status: TodoStatus) => Promise<AdminTodo | null>;

  // Actions - Notifications
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;

  // Real-time updates
  addTodo: (todo: AdminTodo) => void;
  updateTodoLocal: (todo: AdminTodo) => void;
  removeTodo: (id: string) => void;
  addNotification: (notification: AdminNotification) => void;

  // Clear
  clearError: () => void;
}

const useAdminTodoStore = create<AdminTodoState>()(
  devtools(
    (set, get) => ({
      todos: [],
      loading: false,
      error: null,
      notifications: [],
      unreadCount: 0,

      // Fetch all todos
      fetchTodos: async (filters) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams();
          if (filters?.status) params.append('status', filters.status);
          if (filters?.priority) params.append('priority', filters.priority);
          if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo.toString());

          const response = await apiClient.get(`/api/v2/admin/todos?${params.toString()}`);
          set({ todos: response.data.todos || [], loading: false });
        } catch (error: any) {
          set({ error: error.message || 'Failed to fetch todos', loading: false });
        }
      },

      // Create new todo
      createTodo: async (data) => {
        set({ loading: true, error: null });
        try {
          const response = await apiClient.post('/api/v2/admin/todos', data);
          const newTodo = response.data.todo;
          set((state) => ({
            todos: [newTodo, ...state.todos],
            loading: false
          }));
          return newTodo;
        } catch (error: any) {
          set({ error: error.message || 'Failed to create todo', loading: false });
          return null;
        }
      },

      // Update todo
      updateTodo: async (id, data) => {
        set({ error: null });
        try {
          const response = await apiClient.put(`/api/v2/admin/todos/${id}`, data);
          const updatedTodo = response.data.todo;
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? updatedTodo : t))
          }));
          return updatedTodo;
        } catch (error: any) {
          set({ error: error.message || 'Failed to update todo' });
          return null;
        }
      },

      // Delete todo
      deleteTodo: async (id) => {
        set({ error: null });
        try {
          await apiClient.delete(`/api/v2/admin/todos/${id}`);
          set((state) => ({
            todos: state.todos.filter((t) => t.id !== id)
          }));
          return true;
        } catch (error: any) {
          set({ error: error.message || 'Failed to delete todo' });
          return false;
        }
      },

      // Change status
      changeStatus: async (id, status) => {
        set({ error: null });
        try {
          const response = await apiClient.patch(`/api/v2/admin/todos/${id}/status`, { status });
          const updatedTodo = response.data.todo;
          set((state) => ({
            todos: state.todos.map((t) => (t.id === id ? updatedTodo : t))
          }));
          return updatedTodo;
        } catch (error: any) {
          set({ error: error.message || 'Failed to change status' });
          return null;
        }
      },

      // Fetch notifications
      fetchNotifications: async () => {
        try {
          const response = await apiClient.get('/api/v2/admin/notifications');
          set({
            notifications: response.data.notifications || [],
            unreadCount: response.data.unreadCount || 0
          });
        } catch (error: any) {
          console.error('Failed to fetch notifications:', error);
        }
      },

      // Mark notification as read
      markAsRead: async (id) => {
        try {
          await apiClient.patch(`/api/v2/admin/notifications/${id}/read`);
          set((state) => ({
            notifications: state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - 1)
          }));
        } catch (error: any) {
          console.error('Failed to mark as read:', error);
        }
      },

      // Mark all as read
      markAllAsRead: async () => {
        try {
          await apiClient.patch('/api/v2/admin/notifications/read-all');
          set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0
          }));
        } catch (error: any) {
          console.error('Failed to mark all as read:', error);
        }
      },

      // Delete notification
      deleteNotification: async (id) => {
        try {
          await apiClient.delete(`/api/v2/admin/notifications/${id}`);
          set((state) => {
            const notification = state.notifications.find((n) => n.id === id);
            return {
              notifications: state.notifications.filter((n) => n.id !== id),
              unreadCount: notification && !notification.read
                ? Math.max(0, state.unreadCount - 1)
                : state.unreadCount
            };
          });
        } catch (error: any) {
          console.error('Failed to delete notification:', error);
        }
      },

      // Real-time: Add todo
      addTodo: (todo) => {
        set((state) => {
          // Avoid duplicates
          if (state.todos.some((t) => t.id === todo.id)) {
            return state;
          }
          return { todos: [todo, ...state.todos] };
        });
      },

      // Real-time: Update todo
      updateTodoLocal: (todo) => {
        set((state) => ({
          todos: state.todos.map((t) => (t.id === todo.id ? todo : t))
        }));
      },

      // Real-time: Remove todo
      removeTodo: (id) => {
        set((state) => ({
          todos: state.todos.filter((t) => t.id !== id)
        }));
      },

      // Real-time: Add notification
      addNotification: (notification) => {
        set((state) => {
          // Avoid duplicates
          if (state.notifications.some((n) => n.id === notification.id)) {
            return state;
          }
          return {
            notifications: [notification, ...state.notifications],
            unreadCount: state.unreadCount + 1
          };
        });
      },

      // Clear error
      clearError: () => set({ error: null })
    }),
    { name: 'admin-todo-store' }
  )
);

export default useAdminTodoStore;
