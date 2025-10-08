'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ConfigProvider } from '@/contexts/ConfigContext';
import config from '@/config/api.config';
import { setStoredToken } from '@/lib/auth-fetch';
import { Circle } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    let token = localStorage.getItem('token');
    let userData = localStorage.getItem('user');

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
              Yükleniyor
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Yönlendiriliyorsunuz...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute requireAdmin={true}>
      <ConfigProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Header />
          <main className="container mx-auto px-4">
            {children}
          </main>
        </div>
      </ConfigProvider>
    </ProtectedRoute>
  );
}

