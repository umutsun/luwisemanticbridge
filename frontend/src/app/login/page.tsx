'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export default function LoginPage() {
  const { config } = useConfig();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (config?.app?.name) {
      // Multi-language page title support
      const loginTitle = config?.app?.locale === 'tr' ? 'Giriş' :
                        config?.app?.locale === 'fr' ? 'Connexion' :
                        config?.app?.locale === 'de' ? 'Anmeldung' :
                        config?.app?.locale === 'es' ? 'Iniciar sesión' : 'Login';
      document.title = `${loginTitle} - ${config.app.name}`;
    }
  }, [config, t]);

  // DISABLED: check-admin endpoint not available
  // Check if admin user exists and redirect to deployment setup if needed
  // Only do this check on initial app load, not during normal login flow
  useEffect(() => {
    // Deployment check disabled for now
    // Users will proceed to normal login flow
  }, []);

  const { login } = useAuth();

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      // Show success toast
      toast({
        title: t('login.success'),
        description: t('login.redirectingToDashboard'),
        variant: "default"
      });

      // Check for from parameter in URL
      const urlParams = new URLSearchParams(window.location.search);
      const from = urlParams.get('from');

      // Use window.location.href for full page reload to ensure cookie is sent to middleware
      // router.push is client-side navigation and middleware might not see the cookie yet
      if (from && from.startsWith('/')) {
        window.location.href = from;
      } else {
        window.location.href = '/dashboard';
      }
    } else {
      // Show error toast only (no form error display)
      toast({
        title: t('login.failed'),
        description: result.error || t('login.failedMessage'),
        variant: "destructive"
      });
    }

    setLoading(false);
    return result;
  };

  // Don't show initialization loader on login page
  // This prevents the loader from appearing when clicking login button

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
      {/* 3D Cube */}
      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-none">
        <div className="relative w-10 h-10" style={{ perspective: '1000px' }}>
          <div className="absolute w-full h-full" style={{
            transformStyle: 'preserve-3d',
            animation: 'rotateCube 8s linear infinite'
          }}>
            {/* Front Face */}
            <div className="absolute w-full h-full cube-face" style={{
              transform: 'translateZ(20px)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
              border: '1px solid rgba(99, 102, 241, 0.6)',
              backdropFilter: 'blur(5px)'
            }} />
            {/* Back Face */}
            <div className="absolute w-full h-full cube-face" style={{
              transform: 'rotateY(180deg) translateZ(20px)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
              border: '1px solid rgba(99, 102, 241, 0.6)',
              backdropFilter: 'blur(5px)'
            }} />
            {/* Right Face */}
            <div className="absolute w-full h-full cube-face" style={{
              transform: 'rotateY(90deg) translateZ(20px)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
              border: '1px solid rgba(99, 102, 241, 0.6)',
              backdropFilter: 'blur(5px)'
            }} />
            {/* Left Face */}
            <div className="absolute w-full h-full cube-face" style={{
              transform: 'rotateY(-90deg) translateZ(20px)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
              border: '1px solid rgba(99, 102, 241, 0.6)',
              backdropFilter: 'blur(5px)'
            }} />
            {/* Top Face */}
            <div className="absolute w-full h-full cube-face" style={{
              transform: 'rotateX(90deg) translateZ(20px)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
              border: '1px solid rgba(99, 102, 241, 0.6)',
              backdropFilter: 'blur(5px)'
            }} />
            {/* Bottom Face */}
            <div className="absolute w-full h-full cube-face" style={{
              transform: 'rotateX(-90deg) translateZ(20px)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
              border: '1px solid rgba(99, 102, 241, 0.6)',
              backdropFilter: 'blur(5px)'
            }} />
          </div>
        </div>

        {/* CSS for animations */}
        <style jsx>{`
          @keyframes rotateCube {
            0% { transform: rotateX(0deg) rotateY(0deg); }
            100% { transform: rotateX(360deg) rotateY(360deg); }
          }
          @keyframes cubeGlow {
            0% {
              box-shadow: 0 0 10px rgba(99, 102, 241, 0.6),
                          0 0 20px rgba(99, 102, 241, 0.4),
                          inset 0 0 10px rgba(99, 102, 241, 0.1);
            }
            100% {
              box-shadow: 0 0 20px rgba(139, 92, 246, 0.8),
                          0 0 30px rgba(139, 92, 246, 0.6),
                          inset 0 0 15px rgba(139, 92, 246, 0.2);
            }
          }
          .cube-face {
            animation: cubeGlow 4s ease-in-out infinite alternate;
          }
        `}</style>
      </div>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="text-2xl font-black text-white">
              {config?.app?.name || 'Luwi Semantic Bridge'}
            </div>
            <p className="text-sm text-slate-400">
              {config?.app?.description || 'AI-powered Semantic Search Platform'}
            </p>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-slate-700/50">
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleLogin(formData.get('email') as string, formData.get('password') as string);
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t('login.email')}
              </label>
              <input
                name="email"
                type="email"
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all"
                placeholder={t('login.emailPlaceholder')}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-300">
                  {t('login.password')}
                </label>
                <a href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  {t('login.forgotPassword')}
                </a>
              </div>
              <input
                name="password"
                type="password"
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all"
                placeholder="•••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('login.signingIn')}
                </span>
              ) : (
                t('login.signIn')
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              {t('login.noAccount')}{' '}
              <a href="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                {t('login.signUp')}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}