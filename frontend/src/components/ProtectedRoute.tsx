'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('ProtectedRoute - Auth Debug:', {
      loading,
      isAuthenticated,
      user,
      requireAdmin,
      hasToken: !!localStorage.getItem('token'),
      hasUser: !!localStorage.getItem('user')
    });

    if (!loading) {
      if (!isAuthenticated) {
        console.log('ProtectedRoute - Redirecting to login...');
        router.push('/login');
        return;
      }

      if (requireAdmin && user?.role !== 'admin') {
        console.log('ProtectedRoute - User not admin, redirecting to chat...');
        router.push('/chat');
        return;
      }

      console.log('ProtectedRoute - Access granted');
    }
  }, [loading, isAuthenticated, user, router, requireAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return null;
  }

  return <>{children}</>;
}