'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import InitializationLoader from '@/components/ui/initialization-loader';

export default function LoginPage() {
  const { config, loading: configLoading } = useConfig();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (config?.app?.name) {
      document.title = `Giriş Yap - ${config.app.name}`;
    }
  }, [config]);

  // Check if admin user exists and redirect to deployment setup if needed
  // Only do this check on initial app load, not during normal login flow
  useEffect(() => {
    const checkDeploymentStatus = async () => {
      if (!configLoading && mounted) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/deployment/check-admin`);
          const data = await response.json();

          // Only redirect to setup if no admin user exists AND environment is not configured
          if (!data.adminExists && (!data.envConfigured || !data.databaseConnected)) {
            router.push('/setup/deploy');
            return;
          }

          // If admin exists but we're somehow on login page without being logged in,
          // continue with normal login flow
        } catch (error) {
          console.error('Failed to check deployment status:', error);
          // If we can't check status, proceed with normal login
        }
      }
    };

    checkDeploymentStatus();
  }, [configLoading, mounted, router]);

  const { login } = useAuth();

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    const result = await login(email, password);

    if (result.success) {
      // Check for from parameter in URL
      const urlParams = new URLSearchParams(window.location.search);
      const from = urlParams.get('from');

      if (from && from.startsWith('/')) {
        // Redirect to the requested page
        router.push(from);
      } else {
        // Default redirect to dashboard for admin users
        router.push('/dashboard');
      }
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
    return result;
  };

  if (configLoading) {
    return <InitializationLoader />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {config?.app?.name || 'Luwi Semantic Bridge'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {config?.app?.description || 'AI-powered Semantic Search Platform'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg">
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleLogin(formData.get('email') as string, formData.get('password') as string);
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                name="password"
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Demo: admin@example.com / admin
          </div>
        </div>
      </div>
    </div>
  );
}