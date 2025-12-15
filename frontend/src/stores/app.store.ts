import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface AppState {
  // UI State
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  loading: boolean;
  globalError: string | null;

  // Notifications
  notifications: Notification[];

  // Settings
  settings: {
    language: string;
    timezone: string;
    notifications: boolean;
    autoSave: boolean;
  };

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLoading: (loading: boolean) => void;
  setGlobalError: (error: string | null) => void;

  // Notification actions
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Settings actions
  updateSettings: (settings: Partial<AppState['settings']>) => void;
}

const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Initial state
      sidebarOpen: true,
      commandPaletteOpen: false,
      theme: 'system',
      loading: false,
      globalError: null,
      notifications: [],
      settings: {
        language: 'en',
        timezone: 'UTC',
        notifications: true,
        autoSave: true,
      },

      // UI Actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      setTheme: (theme) => {
        set({ theme });

        // Apply theme to document
        if (typeof window !== 'undefined') {
          const root = document.documentElement;
          root.classList.remove('light', 'dark');

          if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.add(systemTheme);
          } else {
            root.classList.add(theme);
          }
        }
      },

      setLoading: (loading) => set({ loading }),

      setGlobalError: (error) => set({ globalError: error }),

      // Notification Actions
      addNotification: (notification) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newNotification = { ...notification, id };

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-remove after duration
        if (notification.duration !== 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, notification.duration || 5000);
        }
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearNotifications: () => set({ notifications: [] }),

      // Settings Actions
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },
    }),
    {
      name: 'app-store',
    }
  )
);

export default useAppStore;