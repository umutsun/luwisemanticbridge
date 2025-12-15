'use client';

import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import useAuthStore from '@/stores/auth.store';
import { User } from '@/types/auth'; // Ensure we use shared User type

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const {
    user,
    token,
    isAuthenticated,
    isLoading, // mapping isLoading to loading
    login: storeLogin,
    logout: storeLogout,
    checkAuth,
    refreshAuth
  } = useAuthStore();

  // Initial check (synced with store) - but NOT on login/register pages
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      // Skip checkAuth on login/register pages to avoid infinite loops with invalid tokens
      if (path === '/login' || path === '/register') {
        return;
      }
    }
    checkAuth();
  }, [checkAuth]);

  // Periodic refresh (every 15 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      refreshAuth().catch(console.error);
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, refreshAuth]);

  // Adapter for login
  const loginAdapter = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await storeLogin({ email, password });
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || 'Login failed'
      };
    }
  };

  const logoutAdapter = () => {
    storeLogout();
  };

  const value = {
    user,
    token,
    login: loginAdapter,
    logout: logoutAdapter,
    loading: isLoading,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

