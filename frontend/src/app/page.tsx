'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranslation } from 'react-i18next';

// Import the Template-based ChatInterface component
// This dynamically loads the active template from backend config
import ChatInterface from '@/components/TemplateChatInterface';

// Alternative: Use original ChatInterface directly (bypasses template system)
// import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  const { t } = useTranslation();
  const { token, user, loading: authLoading } = useAuth();
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
          <div className="flex justify-center mb-4">
            <div className="animate-spin">
              <svg className="h-8 w-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show simple loading while redirecting
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="animate-spin">
              <svg className="h-8 w-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Regular user - show chat interface
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    }>
      <ChatInterface />
    </Suspense>
  );
}