import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import apiClient from '@/lib/api/client';
import { AuthState, User, LoginData, RegisterData } from '@/types/auth';

interface AuthStore extends AuthState {
  token: string | null;
  refreshToken: string | null;

  // Actions
  login: (data: LoginData) => Promise<void>;
  logout: () => void;
  register: (data: RegisterData) => Promise<void>;
  refreshAuth: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      accessToken: null, // For compatibility with AuthState interface
      isLoading: false,
      error: null,

      login: async (data: LoginData) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.post('/api/v2/auth/login', data);
          const { user, accessToken } = response.data;

          apiClient.setToken(accessToken);

          set({
            user,
            token: accessToken,
            accessToken: accessToken,
            refreshToken: null, // Backend uses httpOnly cookie
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        apiClient.clearToken();

        // Best effort logout on server (clears httpOnly cookie)
        apiClient.post('/api/v2/auth/logout', {}).catch(console.error);

        set({
          user: null,
          token: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });

        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('accessToken');
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.post('/api/v2/auth/register', data);

          const { user, accessToken } = response.data;

          apiClient.setToken(accessToken);

          set({
            user,
            token: accessToken,
            accessToken: accessToken,
            refreshToken: null, // Backend uses httpOnly cookie
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      refreshAuth: async () => {
        // refreshToken is in httpOnly cookie, backend will read it
        try {
          const response = await apiClient.post('/api/v2/auth/refresh', {});
          const { accessToken, user } = response.data;

          apiClient.setToken(accessToken);

          set((state) => ({
            user: user || state.user,
            token: accessToken,
            accessToken: accessToken,
            isAuthenticated: true,
          }));
        } catch (error) {
          get().logout();
          throw error;
        }
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          // Try to recover from local storage directly if store is empty but storage has it?
          // persist middleware handles this usually, but let's be safe.
          return;
        }

        try {
          // Verify token validity by fetching user profile
          const response = await apiClient.get('/api/v2/auth/me');
          const user = response.data?.user;
          if (user) {
            set({ user, isAuthenticated: true });
          }
        } catch (error) {
          // If check fails (and interceptor didn't auto-refresh or failed), logout
          console.error('Check auth failed', error);
          // Clear invalid token to prevent infinite refresh loop
          get().logout();
        }
      },

      setUser: (user: User) => {
        set({ user });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;