'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import InitializationLoader from '@/components/ui/initialization-loader';
import { useTranslation } from 'react-i18next';

export default function RegisterPage() {
  const { config, loading: configLoading } = useConfig();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (config?.app?.name) {
      document.title = `Kayıt Ol - ${config.app.name}`;
    }
  }, [config]);

  const { login } = useAuth();
  const { t } = useTranslation();

  const handleRegister = async () => {
    // Validation
    if (!formData.name || !formData.email || !formData.password) {
      setError(t('register.errors.allFieldsRequired'));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('register.errors.passwordMismatch'));
      return;
    }

    if (formData.password.length < 6) {
      setError(t('register.validation.passwordMinLength'));
      return;
    }

    setLoading(true);
    setError(null);

    const result = await login(formData.email, formData.password);

    if (result.success) {
      router.push('/dashboard');
    } else {
      setError(result.error || t('register.errors.registrationFailed'));
    }

    setLoading(false);
  };

  if (configLoading) {
    return <InitializationLoader />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 overflow-hidden">
      {/* Background Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <style jsx>{`
          .particle {
            position: absolute;
            width: 2px;
            height: 2px;
            background: white;
            border-radius: 50%;
            opacity: 0;
            animation: float 6s infinite;
          }

          .particle:nth-child(1) { left: 10%; animation-delay: 0s; animation-duration: 7s; }
          .particle:nth-child(2) { left: 20%; animation-delay: 1s; animation-duration: 9s; }
          .particle:nth-child(3) { left: 30%; animation-delay: 2s; animation-duration: 8s; }
          .particle:nth-child(4) { left: 40%; animation-delay: 3s; animation-duration: 10s; }
          .particle:nth-child(5) { left: 50%; animation-delay: 4s; animation-duration: 7s; }
          .particle:nth-child(6) { left: 60%; animation-delay: 5s; animation-duration: 9s; }
          .particle:nth-child(7) { left: 70%; animation-delay: 2s; animation-duration: 8s; }
          .particle:nth-child(8) { left: 80%; animation-delay: 3s; animation-duration: 11s; }
          .particle:nth-child(9) { left: 90%; animation-delay: 1s; animation-duration: 9s; }
          .particle:nth-child(10) { left: 15%; animation-delay: 4s; animation-duration: 8s; }
          .particle:nth-child(11) { left: 25%; animation-delay: 2s; animation-duration: 10s; }
          .particle:nth-child(12) { left: 35%; animation-delay: 5s; animation-duration: 7s; }
          .particle:nth-child(13) { left: 45%; animation-delay: 3s; animation-duration: 9s; }
          .particle:nth-child(14) { left: 55%; animation-delay: 1s; animation-duration: 8s; }
          .particle:nth-child(15) { left: 65%; animation-delay: 4s; animation-duration: 10s; }
          .particle:nth-child(16) { left: 75%; animation-delay: 2s; animation-duration: 7s; }
          .particle:nth-child(17) { left: 85%; animation-delay: 3s; animation-duration: 9s; }
          .particle:nth-child(18) { left: 95%; animation-delay: 5s; animation-duration: 8s; }

          @keyframes float {
            0% {
              transform: translateY(100vh) scale(0);
              opacity: 0;
            }
            10% {
              opacity: 0.4;
            }
            90% {
              opacity: 0.4;
            }
            100% {
              transform: translateY(-100vh) scale(1);
              opacity: 0;
            }
          }
        `}</style>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
      </div>

      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-none">
        <style jsx>{`
          .cube-container {
            width: 60px;
            height: 60px;
            perspective: 800px;
          }

          .cube {
            width: 100%;
            height: 100%;
            position: relative;
            transform-style: preserve-3d;
            animation: rotateCube 30s infinite linear;
            animation-direction: reverse;
          }

          .cube-face {
            position: absolute;
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3));
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            box-shadow: 0 0 40px rgba(99, 102, 241, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.1);
          }

          .cube-face:nth-child(1) { transform: translateZ(30px); }
          .cube-face:nth-child(2) { transform: rotateY(90deg) translateZ(30px); }
          .cube-face:nth-child(3) { transform: rotateY(180deg) translateZ(30px); }
          .cube-face:nth-child(4) { transform: rotateY(-90deg) translateZ(30px); }
          .cube-face:nth-child(5) { transform: rotateX(90deg) translateZ(30px); }
          .cube-face:nth-child(6) { transform: rotateX(-90deg) translateZ(30px); }

          @keyframes rotateCube {
            0% { transform: rotateX(0deg) rotateY(0deg); }
            100% { transform: rotateX(360deg) rotateY(360deg); }
          }

          .glow-effect {
            animation: glow 3s ease-in-out infinite alternate;
          }

          @keyframes glow {
            from { box-shadow: 0 0 40px rgba(99, 102, 241, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.1); }
            to { box-shadow: 0 0 60px rgba(139, 92, 246, 0.6), inset 0 0 30px rgba(255, 255, 255, 0.15); }
          }
        `}</style>
        <div className="cube-container">
          <div className="cube">
            <div className="cube-face glow-effect"></div>
            <div className="cube-face glow-effect"></div>
            <div className="cube-face glow-effect"></div>
            <div className="cube-face glow-effect"></div>
            <div className="cube-face glow-effect"></div>
            <div className="cube-face glow-effect"></div>
          </div>
        </div>
      </div>

      <div className="max-w-md w-full relative z-10">
        <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-slate-700/50">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black mb-2 text-white tracking-tighter">
              {config?.app?.name || 'Luwi Semantic Bridge'}
            </h1>
            <p className="text-sm text-slate-400 font-light tracking-wide">
              {t('register.subtitle')}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t('register.nameLabel')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all"
                placeholder={t('register.namePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t('register.emailLabel')}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all"
                placeholder={t('register.emailPlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t('register.passwordLabel')}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {t('register.confirmPasswordLabel')}
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all"
                placeholder={t('register.confirmPasswordPlaceholder')}
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-800/30">
                {error}
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('register.registering')}
                </span>
              ) : (
                t('register.registerButton')
              )}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              {t('register.alreadyHaveAccount')}{' '}
              <a href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                {t('register.signIn')}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}