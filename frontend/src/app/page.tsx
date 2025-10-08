'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';

// Import the ChatInterface component
import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  const { token, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Handle redirects in useEffect to prevent render-time navigation
  useEffect(() => {
    if (!authLoading) {
      // If not authenticated, redirect to login
      if (!token) {
        router.push('/login');
        return;
      }

      // If authenticated and user data is available
      if (token && user) {
        const userRole = user.role || 'user';
        const isAdmin = userRole === 'admin' || userRole === 'manager';

        // Admin users can choose to go to dashboard or stay on chat
        // Don't automatically redirect admins - let them choose
        // Regular users stay on the home page (chat interface)
      }
    }
  }, [token, user, authLoading, router]);

  // If auth is still loading or redirecting, show simple loading
  if (authLoading || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show simple loading while redirecting
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  // Regular user - show chat interface
  return <ChatInterface />;
}