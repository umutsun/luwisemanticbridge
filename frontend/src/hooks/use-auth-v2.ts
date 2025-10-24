'use client';

import { useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { fetchWithAuth as apiFetch } from '@/lib/auth-fetch';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'user';
  permissions?: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  lastActivity: number;
}

export function useAuthV2() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    refreshToken: null,
    isLoading: true,
    isAuthenticated: false,
    lastActivity: Date.now()
  });

  // Token refresh management
  const refreshAccessToken = useCallback(async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiFetch('/api/v2/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    const { accessToken, refreshToken: newRefreshToken } = data;

    localStorage.setItem('token', accessToken);
    if (newRefreshToken) {
      localStorage.setItem('refresh_token', newRefreshToken);
    }

    return accessToken;
  }, []);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        const refreshToken = localStorage.getItem('refresh_token');

        if (!token) {
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        // Check if token is expired
        const decoded = jwtDecode(token);
        const now = Date.now() / 1000;

        if (decoded.exp && decoded.exp < now) {
          // Token expired, try to refresh
          if (refreshToken) {
            const newToken = await refreshAccessToken();
            const user = jwtDecode(newToken) as User;
            setState({
              user,
              token: newToken,
              refreshToken,
              isLoading: false,
              isAuthenticated: true,
              lastActivity: Date.now()
            });
          } else {
            // No refresh token, clear everything
            localStorage.removeItem('token');
            localStorage.removeItem('refresh_token');
            setState(prev => ({ ...prev, isLoading: false }));
          }
        } else {
          // Token is valid
          const user = jwtDecode(token) as User;
          setState({
            user,
            token,
            refreshToken,
            isLoading: false,
            isAuthenticated: true,
            lastActivity: Date.now()
          });
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        // Clear invalid tokens
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();
  }, [refreshAccessToken]);

  // Activity tracking for session timeout
  const updateActivity = useCallback(() => {
    setState(prev => ({ ...prev, lastActivity: Date.now() }));
  }, []);

  // Check session timeout
  useEffect(() => {
    const checkSession = () => {
      const timeout = 30 * 60 * 1000; // 30 minutes
      if (state.isAuthenticated && Date.now() - state.lastActivity > timeout) {
        logout();
      }
    };

    const interval = setInterval(checkSession, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.lastActivity]);

  const login = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await apiFetch('/api/v2/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      const { user, accessToken, refreshToken } = data;

      localStorage.setItem('token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      setState({
        user,
        token: accessToken,
        refreshToken,
        isLoading: false,
        isAuthenticated: true,
        lastActivity: Date.now()
      });

      return { success: true, user };
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');

    setState({
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,
      lastActivity: Date.now()
    });
  }, []);

  const hasPermission = useCallback((permission: string) => {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
    return state.user.permissions?.includes(permission) || false;
  }, [state.user]);

  return {
    ...state,
    login,
    logout,
    refreshAccessToken,
    updateActivity,
    hasPermission
  };
}