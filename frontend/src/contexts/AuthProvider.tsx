'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { API_BASE_URL } from '@/config/api.config';
import { setStoredToken } from '@/lib/auth-fetch';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'premium';
  status: string;
  email_verified: boolean;
  profile_image?: string;
  created_at: string;
}

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
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleTokenChangedEvent = () => {
      const updatedToken = localStorage.getItem('token');
      setToken(updatedToken);
      if (!updatedToken) {
        setUser(null);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'token') {
        handleTokenChangedEvent();
      }
      if (event.key === 'user') {
        if (event.newValue) {
          try {
            setUser(JSON.parse(event.newValue));
          } catch {
            // ignore parsing errors
          }
        } else {
          setUser(null);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('tokenChanged', handleTokenChangedEvent as EventListener);
      window.addEventListener('storage', handleStorage);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tokenChanged', handleTokenChangedEvent as EventListener);
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    let storedToken = localStorage.getItem('token');
    let storedUser = localStorage.getItem('user');

    const legacyToken = localStorage.getItem('asb_token');
    if (!storedToken && legacyToken) {
      setStoredToken(legacyToken);
      storedToken = legacyToken;
    }
    if (legacyToken) {
      localStorage.removeItem('asb_token');
    }

    const legacyUser = localStorage.getItem('asb_user');
    if (!storedUser && legacyUser) {
      localStorage.setItem('user', legacyUser);
      storedUser = legacyUser;
    }
    if (legacyUser) {
      localStorage.removeItem('asb_user');
    }

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || 'Login failed'
        };
      }

      const data = await response.json();

      setStoredToken(data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Also set token in cookie
      document.cookie = `auth-token=${data.accessToken}; path=/; max-age=86400; SameSite=Lax`;

      setToken(data.accessToken);
      setUser(data.user);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Network error. Please try again.'
      };
    }
  };

  const logout = () => {
    setStoredToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('asb_user');
    localStorage.removeItem('asb_token');

    // Remove token from cookies
    document.cookie = 'auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';

    setToken(null);
    setUser(null);
  };

  const isAuthenticated = !!token && !!user;

  const value = {
    user,
    token,
    login,
    logout,
    loading,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

