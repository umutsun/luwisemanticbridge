'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const { config, loading: configLoading } = useConfig();
  const router = useRouter();
  const { toast } = useToast();
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
        title: "Giriş başarılı!",
        description: "Dashboard'a yönlendiriliyorsunuz...",
        variant: "default"
      });

      // Check for from parameter in URL
      const urlParams = new URLSearchParams(window.location.search);
      const from = urlParams.get('from');

      // Redirect after delay
      setTimeout(() => {
        if (from && from.startsWith('/')) {
          // Redirect to the requested page
          router.push(from);
        } else {
          // Default redirect to dashboard for admin users
          router.push('/dashboard');
        }
      }, 1000);
    } else {
      // Show error toast only (no form error display)
      toast({
        title: "Giriş başarısız",
        description: result.error || 'Giriş başarısız oldu',
        variant: "destructive"
      });
    }

    setLoading(false);
    return result;
  };

  // Don't show initialization loader on login page
  // This prevents the loader from appearing when clicking login button

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 overflow-hidden" style={{backgroundColor: '#0f172a'}}>
      {/* 3D Cube */}
      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-none">
        <style jsx>{`
          .cube-container {
            width: 40px;
            height: 40px;
            perspective: 600px;
            will-change: transform;
          }

          .cube {
            width: 100%;
            height: 100%;
            position: relative;
            transform-style: preserve-3d;
            animation: rotateCube 30s infinite linear;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            transform: translate3d(0, 0, 0);
            will-change: transform;
          }

          .cube-face {
            position: absolute;
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
            border: 2px solid rgba(99, 102, 241, 0.6);
            backdrop-filter: blur(5px);
            box-shadow: inset 0 0 20px rgba(99, 102, 241, 0.2), 0 0 30px rgba(99, 102, 241, 0.4), 0 0 40px rgba(139, 92, 246, 0.2);
            animation: cubeGlow 4s ease-in-out infinite alternate, fadeInCube 0.8s ease-out forwards;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            will-change: opacity;
          }

          @keyframes cubeGlow {
            0% {
              box-shadow: inset 0 0 30px rgba(99, 102, 241, 0.2), 0 0 40px rgba(99, 102, 241, 0.4), 0 0 60px rgba(139, 92, 246, 0.2);
              border-color: rgba(99, 102, 241, 0.8);
            }
            33% {
              box-shadow: inset 0 0 35px rgba(147, 51, 234, 0.25), 0 0 50px rgba(147, 51, 234, 0.5), 0 0 70px rgba(236, 72, 153, 0.25);
              border-color: rgba(147, 51, 234, 0.85);
            }
            66% {
              box-shadow: inset 0 0 40px rgba(59, 130, 246, 0.25), 0 0 55px rgba(59, 130, 246, 0.55), 0 0 75px rgba(99, 102, 241, 0.25);
              border-color: rgba(59, 130, 246, 0.9);
            }
            100% {
              box-shadow: inset 0 0 30px rgba(139, 92, 246, 0.2), 0 0 60px rgba(139, 92, 246, 0.45), 0 0 80px rgba(147, 51, 234, 0.2);
              border-color: rgba(139, 92, 246, 0.85);
            }
          }

          @keyframes rotateCube {
            0% { transform: rotateX(0deg) rotateY(0deg); }
            100% { transform: rotateX(360deg) rotateY(360deg); }
          }

          @keyframes fadeInCube {
            0% {
              opacity: 0;
              box-shadow: inset 0 0 20px rgba(99, 102, 241, 0), 0 0 30px rgba(99, 102, 241, 0), 0 0 40px rgba(139, 92, 246, 0);
            }
            100% {
              opacity: 1;
              box-shadow: inset 0 0 20px rgba(99, 102, 241, 0.2), 0 0 30px rgba(99, 102, 241, 0.4), 0 0 40px rgba(139, 92, 246, 0.2);
            }
          }

          .cube-face:nth-child(1) { transform: translateZ(20px); }
          .cube-face:nth-child(2) { transform: rotateY(90deg) translateZ(20px); }
          .cube-face:nth-child(3) { transform: rotateY(180deg) translateZ(20px); }
          .cube-face:nth-child(4) { transform: rotateY(-90deg) translateZ(20px); }
          .cube-face:nth-child(5) { transform: rotateX(90deg) translateZ(20px); }
          .cube-face:nth-child(6) { transform: rotateX(-90deg) translateZ(20px); }
        `}</style>
        <div className="cube-container">
          <div className="cube">
            <div className="cube-face"></div>
            <div className="cube-face"></div>
            <div className="cube-face"></div>
            <div className="cube-face"></div>
            <div className="cube-face"></div>
            <div className="cube-face"></div>
          </div>
        </div>
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
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Password
              </label>
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
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              Don't have an account?{' '}
              <a href="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}