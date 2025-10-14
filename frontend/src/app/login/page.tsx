'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import UnifiedLogin from '@/components/ui/unified-login';

export default function LoginPage() {
  const { config, loading: configLoading } = useConfig();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 3 second loading time
    const phase1 = setTimeout(() => {
      setSystemLoaded(true);
    }, 1500);

    const phase2 = setTimeout(() => {
      setShowTitle(true);
    }, 2500);

    const phase3 = setTimeout(() => {
      setInitialLoading(false);
    }, 3000);

    return () => {
      clearTimeout(phase1);
      clearTimeout(phase2);
      clearTimeout(phase3);
    };
  }, []);

  useEffect(() => {
    if (config?.app?.name) {
      document.title = `Giriş Yap - ${config.app.name}`;
    }
  }, [config]);

  // Check if admin user exists and redirect to deployment setup if needed
  useEffect(() => {
    const checkDeploymentStatus = async () => {
      if (!configLoading && mounted) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/deployment/check-admin`);
          const data = await response.json();

          // If no admin user exists, redirect to deployment setup
          if (!data.adminExists) {
            router.push('/setup/deploy');
            return;
          }
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
    const result = await login(email, password);

    if (result.success) {
      // Check for from parameter in URL
      const urlParams = new URLSearchParams(window.location.search);
      const from = urlParams.get('from');

      if (from && from.startsWith('/')) {
        // Redirect to the requested page
        router.push(from);
      } else {
        // Default redirect to chatbot (main page)
        router.push('/chat');
      }
    }

    return result;
  };

  return (
    <UnifiedLogin
      title={config?.app?.name || 'Mali Müşavir Botu'}
      description={config?.app?.description || 'Yapay zeka destekli mali danışmanlık platformu'}
      onLogin={handleLogin}
      loginError={error}
      loginLoading={loading}
    />
  );
}