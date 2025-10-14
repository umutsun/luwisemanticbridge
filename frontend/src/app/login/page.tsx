'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Mail, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import ZenLoader from '@/components/ui/zen-loader';
import Link from 'next/link';

export default function LoginPage() {
  const { config, loading: configLoading } = useConfig();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [systemLoaded, setSystemLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showTitle, setShowTitle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
        // Default redirect to chatbot (main page)
        router.push('/chat');
      }
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-slate-900 dark:to-gray-800 relative overflow-hidden">
      {/* Minimal background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Subtle shifting shapes */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-slate-100/20 dark:bg-slate-800/20 rounded-full" style={{ animation: 'subtleShift 50s ease-in-out infinite' }}></div>
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-slate-100/10 dark:bg-slate-800/10 rounded-full" style={{ animation: 'minimalFade 40s ease-in-out infinite', animationDelay: '10s' }}></div>
      </div>

  
      <div className="w-full max-w-md px-6 my-6 relative z-10">
        <div className="mb-8">
          <div className="flex flex-col items-center text-center w-full">
            {/* Zen Loading Animation - Only shows during initial load */}
            {initialLoading && (
              <ZenLoader
                title={config?.app?.name || 'Mali Müşavir Botu'}
                description={config?.app?.description || 'Yapay zeka destekli mali danışmanlık platformu'}
                onComplete={() => setInitialLoading(false)}
              />
            )}

            </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <Card className="shadow-lg border-0 backdrop-blur-sm bg-white/90 dark:bg-gray-900/90">
            <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Email adresiniz"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    className="pl-10 transition-all duration-200 focus:scale-[1.01]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Şifreniz"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    className="pl-10 pr-10 transition-all duration-200 focus:scale-[1.01]"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading || !email || !password || initialLoading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : initialLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sistem yükleniyor...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Giriş Yap
                  </>
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground pt-2">
                <p>Hesabınız yok mu? {' '}
                  <Link href="/auth/register" className="text-primary hover:underline transition-colors">
                    Kayıt olun
                  </Link>
                </p>
              </div>
            </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}