'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import VitrinLoader from '@/components/ui/vitrin-loader';

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

  return (
    <VitrinLoader
      title={config?.app?.name || 'Application'}
      description={config?.app?.description || 'AI-powered intelligent assistant platform'}
      onLogin={handleLogin}
      loginError={error}
      loginLoading={loading}
    />
  );
}