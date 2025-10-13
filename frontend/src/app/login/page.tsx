'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Mail, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { AppTitleMetamorphosis } from '@/components/ui/text-metamorphosis';
import Link from 'next/link';

export default function LoginPage() {
  const { config } = useConfig();
  const [email, setEmail] = useState('');
  const [mounted, setMounted] = useState(false);
  const [systemLoaded, setSystemLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    // Simulate system loading
    const timer = setTimeout(() => {
      setSystemLoaded(true);
      // Wait a bit more before showing the actual title
      setTimeout(() => {
        setInitialLoading(false);
      }, 1500);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (config?.app?.name) {
      document.title = `Giriş Yap - ${config.app.name}`;
    }
  }, [config]);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md px-6 my-12">
        <div className="mb-8">
          <div className="flex flex-col items-center text-center">
            {initialLoading ? (
              <div className="w-full max-w-sm space-y-3">
                {/* Text metamorphosis during loading */}
                <AppTitleMetamorphosis
                  title="Mali Müşavir Botu"
                  description="Yapay zeka destekli mali danışmanlık platformu"
                />
              </div>
            ) : (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-5 duration-1000">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2 tracking-tight">
                  {config?.app?.name || 'Mali Müşavir Botu'}
                </h1>
                <p className="text-muted-foreground text-sm max-w-sm font-medium leading-relaxed">
                  {config?.app?.description || 'Yapay zeka destekli mali danışmanlık platformu'}
                </p>
                <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent mt-3"></div>
              </div>
            )}
          </div>
        </div>

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
                disabled={loading || !email || !password || !systemLoaded}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : !systemLoaded ? (
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
      </div>
    </div>
  );
}