'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

interface LoadingStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'complete';
}

interface UnifiedLoginProps {
  title: string;
  description: string;
  onLogin: (email: string, password: string) => Promise<any>;
  loginError: string | null;
  loginLoading: boolean;
}

const UnifiedLogin: React.FC<UnifiedLoginProps> = ({
  title,
  description,
  onLogin,
  loginError,
  loginLoading
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [steps, setSteps] = useState<LoadingStep[]>([
    { id: '1', label: 'Bağlantı', status: 'pending' },
    { id: '2', label: 'Veritabanı', status: 'pending' },
    { id: '3', label: 'Servisler', status: 'pending' },
    { id: '4', label: 'Arayüz', status: 'pending' }
  ]);
  const [currentDetail, setCurrentDetail] = useState('');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Initialize system
    const initSystem = async () => {
      const details = ['23ms', '3 tablo', 'Redis hazır', '247 bileşen'];

      for (let i = 0; i < steps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 300));

        setSteps(prev => prev.map((step, index) => {
          if (index === i) {
            return { ...step, status: 'loading' };
          }
          if (index < i) {
            return { ...step, status: 'complete' };
          }
          return step;
        }));

        setCurrentDetail(details[i]);

        await new Promise(resolve => setTimeout(resolve, 300));

        setSteps(prev => prev.map((step, index) => {
          if (index === i) {
            return { ...step, status: 'complete' };
          }
          return step;
        }));
      }

      // Show title after initialization
      setTimeout(() => setShowTitle(true), 300);
    };

    initSystem();

    // Track mouse for background cubes
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Try to connect to real-time logs
    try {
      eventSourceRef.current = new EventSource('http://localhost:8083/api/v2/system/stream');
      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log' && Math.random() > 0.8) {
            setCurrentDetail(data.message.split(' ')[0] || 'Sistem');
          }
        } catch (e) {
          // Ignore
        }
      };
    } catch (error) {
      // Ignore
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 overflow-hidden">
      {/* Background 3D cubes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(2)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-24 h-24"
            animate={{
              x: mousePosition.x * 0.01 * (i + 1),
              y: mousePosition.y * 0.01 * (i + 1),
              rotateX: 15 + mousePosition.y * 0.01,
              rotateY: [25, 35, 25],
              rotateZ: i % 2 === 0 ? [5, 15, 5] : [-5, -15, -5],
              opacity: 0.02 + i * 0.01
            }}
            transition={{
              rotateY: {
                duration: 4 + i,
                repeat: Infinity,
                ease: "easeInOut"
              },
              rotateZ: {
                duration: 3 + i,
                repeat: Infinity,
                ease: "easeInOut"
              },
              x: {
                type: "spring",
                stiffness: 20,
                damping: 30
              },
              y: {
                type: "spring",
                stiffness: 20,
                damping: 30
              }
            }}
            style={{
              left: `${15 + i * 40}%`,
              top: `${10 + i * 30}%`,
              transformStyle: 'preserve-3d',
              perspective: '1000px'
            }}
          >
            <div className="relative w-full h-full">
              <div className="absolute inset-0 border border-neutral-300 dark:border-neutral-700" style={{ transform: 'rotateY(0deg) translateZ(48px)' }} />
              <div className="absolute inset-0 border border-neutral-300 dark:border-neutral-700" style={{ transform: 'rotateY(90deg) translateZ(48px)' }} />
              <div className="absolute inset-0 border border-neutral-300 dark:border-neutral-700" style={{ transform: 'rotateY(180deg) translateZ(48px)' }} />
              <div className="absolute inset-0 border border-neutral-300 dark:border-neutral-700" style={{ transform: 'rotateY(270deg) translateZ(48px)' }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex">
        {/* Left Column - System Status */}
        <div className="w-1/2 p-12 flex flex-col justify-center border-r border-neutral-200 dark:border-neutral-800">
          <div className="max-w-sm">
            {/* System Status */}
            <div className="mb-8">
              <div className="flex items-center space-x-2 mb-6">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs uppercase tracking-wider text-neutral-500 font-mono">
                  Sistem Aktif
                </span>
              </div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: showTitle ? 1 : 0.3, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-3xl font-light text-neutral-900 dark:text-neutral-100 mb-2"
              >
                {showTitle ? title : 'Başlatılıyor...'}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: showTitle ? 1 : 0.3 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                className="text-sm text-neutral-600 dark:text-neutral-400"
              >
                {showTitle ? description : 'Lütfen bekleyin'}
              </motion.p>
            </div>

            {/* Initialization Steps */}
            <div className="space-y-2 mb-6">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center space-x-3">
                  <div className="relative w-3 h-3">
                    {step.status === 'pending' && (
                      <div className="w-3 h-3 border border-neutral-300 dark:border-neutral-600 rounded-full" />
                    )}
                    {step.status === 'loading' && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-3 h-3 border border-neutral-400 dark:border-neutral-500 border-t-transparent rounded-full"
                      />
                    )}
                    {step.status === 'complete' && (
                      <div className="w-3 h-3 bg-neutral-700 dark:bg-neutral-300 rounded-full" />
                    )}
                  </div>
                  <span className={`text-sm transition-colors duration-300 ${
                    step.status === 'complete'
                      ? 'text-neutral-700 dark:text-neutral-300'
                      : 'text-neutral-400 dark:text-neutral-600'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Live Detail */}
            {currentDetail && (
              <motion.div
                key={currentDetail}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs font-mono text-neutral-500 dark:text-neutral-500"
              >
                {currentDetail}
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Column - Login Form */}
        <div className="w-1/2 p-12 flex flex-col justify-center">
          <div className="max-w-sm w-full mx-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              <h2 className="text-xl font-light mb-6 text-center">Giriş Yap</h2>

              {loginError && (
                <Alert variant="destructive" className="mb-4 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">{loginError}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-sm text-neutral-600 dark:text-neutral-400">
                    Email
                  </Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="ornek@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 focus:border-neutral-400 dark:focus:border-neutral-600"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm text-neutral-600 dark:text-neutral-400">
                    Şifre
                  </Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 focus:border-neutral-400 dark:focus:border-neutral-600"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 transition-all duration-200"
                  disabled={loginLoading || !email || !password}
                >
                  {loginLoading ? (
                    <div className="flex items-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2"
                      />
                      Giriş yapılıyor...
                    </div>
                  ) : (
                    'Giriş Yap'
                  )}
                </Button>

                <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 pt-2">
                  Hesabınız yok mu?{' '}
                  <Link href="/auth/register" className="text-neutral-700 dark:text-neutral-300 hover:underline">
                    Kayıt olun
                  </Link>
                </p>
              </form>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedLogin;