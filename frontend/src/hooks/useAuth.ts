import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/stores/auth.store';
import useAppStore from '@/stores/app.store';

export function useAuth() {
  const router = useRouter();
  const authStore = useAuthStore();
  const { addNotification } = useAppStore();

  const login = useCallback(async (email: string, password: string) => {
    try {
      await authStore.login({ email, password });
      addNotification({
        type: 'success',
        message: 'Successfully logged in!',
      });
      router.push('/dashboard');
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: error.message || 'Login failed',
      });
      throw error;
    }
  }, [authStore, addNotification, router]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    try {
      await authStore.register({ email, password, username: name }); // Mapping name to username/first_name?? Type says username.
      addNotification({
        type: 'success',
        message: 'Account created successfully!',
      });
      router.push('/dashboard');
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: error.message || 'Registration failed',
      });
      throw error;
    }
  }, [authStore, addNotification, router]);

  const logout = useCallback(() => {
    authStore.logout();
    addNotification({
      type: 'info',
      message: 'You have been logged out',
    });
    router.push('/login');
  }, [authStore, addNotification, router]);

  const updateProfile = useCallback(async (data: any) => {
    try {
      // Update user profile via API
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const updatedUser = await response.json();
      authStore.setUser(updatedUser);

      addNotification({
        type: 'success',
        message: 'Profile updated successfully',
      });
    } catch (error: any) {
      addNotification({
        type: 'error',
        message: error.message || 'Failed to update profile',
      });
      throw error;
    }
  }, [authStore, addNotification]);

  return {
    ...authStore,
    login,
    register,
    logout,
    updateProfile,
  };
}

// Hook for checking authentication
export function useRequireAuth(redirectTo: string = '/login') {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    router.push(redirectTo);
    return false;
  }

  return true;
}

// Hook for role-based access control
export function useRole(requiredRole: string) {
  const { user } = useAuthStore();

  if (!user) return false;

  return user.role === requiredRole || user.role === 'admin';
}