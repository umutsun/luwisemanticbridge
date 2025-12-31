'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import Header from '@/components/Header';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ConfigProvider, useConfig } from '@/contexts/ConfigContext';
import config from '@/config/api.config';
import { setStoredToken } from '@/lib/auth-fetch';
import { Circle, AlertCircle, RefreshCw } from 'lucide-react';
import { ParticlesBackground } from '@/components/ui/particles-background';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Inner component that has access to ConfigContext
function DashboardContent({ children }: { children: React.ReactNode }) {
  const { backendDown, error, refreshConfig } = useConfig();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (backendDown) {
      console.warn('⚠️ Backend/Database is down, redirecting to setup page...');
      router.push('/setup');
    }
  }, [backendDown, router]);

  // Show error state when backend is down
  if (backendDown) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 text-center space-y-6">
          <div className="relative">
            <AlertCircle className="h-20 w-20 text-red-600 dark:text-red-400 mx-auto" />
            <Circle className="h-20 w-20 text-red-600/20 absolute top-0 left-1/2 -translate-x-1/2 animate-ping" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('header.menu.dashboard')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {error || t('header.status.backendDown')}
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => {
                console.log('🔄 Retrying connection...');
                refreshConfig();
              }}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
              {t('common.retry')}
            </button>
            <button
              onClick={() => router.push('/setup')}
              className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium rounded-lg transition-colors"
            >
              {t('dashboard.setup.goToSetup')}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            {t('dashboard.setup.autoRedirect')}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    // Try multiple sources for token
    let token = localStorage.getItem('token') || localStorage.getItem('accessToken');
    let userData = localStorage.getItem('user');

    // Check zustand auth-storage (primary source after login)
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage);
        if (parsed.state) {
          // Zustand persist format
          if (!token && parsed.state.token) {
            token = parsed.state.token;
            localStorage.setItem('token', token);
          }
          if (!userData && parsed.state.user) {
            userData = JSON.stringify(parsed.state.user);
            localStorage.setItem('user', userData);
          }
        }
      } catch (e) {
        console.error('Failed to parse auth-storage:', e);
      }
    }

    // Legacy token migration
    const legacyToken = localStorage.getItem('asb_token');
    if (!token && legacyToken) {
      setStoredToken(legacyToken);
      token = legacyToken;
    }
    if (legacyToken) {
      localStorage.removeItem('asb_token');
    }

    const legacyUser = localStorage.getItem('asb_user');
    if (!userData && legacyUser) {
      localStorage.setItem('user', legacyUser);
      userData = legacyUser;
    }
    if (legacyUser) {
      localStorage.removeItem('asb_user');
    }

    if (!token || !userData) {
      console.log('[DashboardLayout] No token or user data, redirecting to login');
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userData);
      setUser(user);

      // Check if user is admin - redirect non-admins to chat interface
      const userRole = user.role || 'user';
      const isAdmin = userRole === 'admin' || userRole === 'manager';

      if (!isAdmin) {
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Failed to parse user data:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setStoredToken(null);
    localStorage.removeItem('user');

    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    document.cookie = 'asb_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';

    router.push('/login');
  };

  // Show loading spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="relative">
            <Circle className="h-12 w-12 text-primary mx-auto" />
            <Circle className="h-12 w-12 text-primary/30 absolute top-0 animate-ping mx-auto" />
          </div>
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {t('common.loading')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute requireAdmin={true}>
      <ConfigProvider>
        <DashboardContent>
          <div className="min-h-screen relative bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200 dark:from-[#0a1628] dark:via-[#0d1f3c] dark:to-[#0a1628]">
            {/* Particles Background - different variant based on theme */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
              <div className="hidden dark:block w-full h-full">
                <ParticlesBackground variant="dark" />
              </div>
              <div className="block dark:hidden w-full h-full">
                <ParticlesBackground variant="light" />
              </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10">
              <Header />
              <main className="container mx-auto px-4">
                {children}
              </main>
            </div>
          </div>
        </DashboardContent>
      </ConfigProvider>
    </ProtectedRoute>
  );
}

