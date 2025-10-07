'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database } from 'lucide-react';
import Header from '@/components/Header';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import config from '@/config/api.config';
import { setStoredToken } from '@/lib/auth-fetch';

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
  const [dbHealthLoading, setDbHealthLoading] = useState(true);
  const [isDatabaseHealthy, setIsDatabaseHealthy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
    checkDatabaseHealth();
  }, []);

  const checkDatabaseHealth = async () => {
    setDbHealthLoading(true);
    try {
      const response = await fetch(config.getApiUrl('/api/v2/health/system'));
      if (response.ok) {
        const healthData = await response.json();
        // Check if ASEM database is connected
        const asemDbStatus = healthData.services?.asemb_database?.status || healthData.services?.database?.status;
        setIsDatabaseHealthy(asemDbStatus === 'healthy' || asemDbStatus === 'connected');
      } else {
        setIsDatabaseHealthy(false);
      }
    } catch (error) {
      console.error('Failed to check database health:', error);
      setIsDatabaseHealthy(false);
    } finally {
      setDbHealthLoading(false);
    }
  };

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
      setUser(JSON.parse(userData));
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

  if (loading || dbHealthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-2 text-muted-foreground">
            {loading ? 'Oturum kontrol ediliyor...' : 'Veritabanı bağlantısı kontrol ediliyor...'}
          </p>
        </div>
      </div>
    );
  }

  if (!isDatabaseHealthy) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="mb-4">
            <Database className="h-12 w-12 text-red-500 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-red-700 dark:text-red-400 mb-2">
            Veritabanı Bağlantısı Hatası
          </h2>
          <p className="text-muted-foreground mb-4">
            ASEM veritabanına bağlanılamıyor. Dashboard'a erişebilmek için veritabanı bağlantısının aktif olması gerekir.
          </p>
          <div className="space-y-2">
            <Button onClick={checkDatabaseHealth} variant="outline" className="w-full">
              Tekrar Dene
            </Button>
            <Link href="/">
              <Button variant="ghost" className="w-full">
                Ana Sayfaya Dön
              </Button>
            </Link>
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

