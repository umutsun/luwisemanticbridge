'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import UltraMinimalAscii from '@/components/ui/ultra-minimal-ascii';
import PsychedelicAscii from '@/components/ui/psychedelic-ascii';
import CyberAscii from '@/components/ui/cyber-ascii';
import RotatingCube3D from '@/components/ui/rotating-cube-3d';
import GradientLoader from '@/components/ui/gradient-loader';
import LuwiLogoAscii from '@/components/ui/luwi-logo-ascii';
import AnimatedLuwiLogo from '@/components/ui/animated-luwi-logo';
import LuwiLargeLogoAscii from '@/components/ui/luwi-large-logo-ascii';

// Multi-language Lorem Ipsum with stylish words
const stylishWords = {
  tr: ["şık", "zarif", "elegant", "baştan çıkarıcı", "büyüleyici", "muhteşem", "harika", "mükemmel", "efsane", "olağanüstü"],
  en: ["elegant", "sophisticated", "stunning", "magnificent", "extraordinary", "brilliant", "gorgeous", "spectacular", "flawless", "exquisite"],
  de: ["elegant", "sophisticated", "beeindruckend", "prächtig", "hervorragend", "brillant", "wunderbar", "spektakulär"],
  fr: ["élégant", "sophistiqué", "époustouflant", "magnifique", "extraordinaire", "brillant", "gorgeux", "spectaculaire"],
  es: ["elegante", "sofisticado", "impresionante", "magnífico", "extraordinario", "brillante", "espectacular"],
  it: ["elegante", "sofisticato", "impressionante", "magnifico", "straordinario", "brillante"],
  ja: ["エレガント", "洗練された", "素晴らしい", "壮大な", " extraordinary", "brilliant"],
  zh: ["优雅", "精致", "令人惊叹", "壮丽", "非凡", "辉煌"]
};

interface VitrinLoaderProps {
  title: string;
  subtitle?: string;
  description: string;
  footer?: string;
  onLogin: (email: string, password: string) => Promise<any>;
  loginError: string | null;
  loginLoading: boolean;
}

const VitrinLoader: React.FC<VitrinLoaderProps> = ({
  title,
  subtitle,
  description,
  footer,
  onLogin,
  loginError,
  loginLoading
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [servicesReady, setServicesReady] = useState(false);
  const [currentLang, setCurrentLang] = useState<string>('en');
  const [fancyText, setFancyText] = useState<string[]>([]);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [splashType, setSplashType] = useState<'minimal' | 'psychedelic' | 'cyber' | 'cube3d' | 'gradient' | 'luwi' | 'animated' | 'large' | 'random'>('animated');

  // Detect language and load configuration
  useEffect(() => {
    const lang = navigator.language.split('-')[0];
    if (stylishWords[lang as keyof typeof stylishWords]) {
      setCurrentLang(lang);
    }

    // Fetch configuration for splash screen type
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        const type = data.splashScreenType || 'minimal';
        if (type === 'minimal' || type === 'psychedelic' || type === 'random') {
          setSplashType(type);
        }
      } catch (error) {
        // Default to minimal
        setSplashType('minimal');
      }
    };

    fetchConfig();
  }, []);

  // Track mouse for 3D effects
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Generate flowing text
  useEffect(() => {
    const words = stylishWords[currentLang as keyof typeof stylishWords] || stylishWords.en;
    const interval = setInterval(() => {
      const text = [];
      for (let i = 0; i < 3; i++) {
        text.push(words[Math.floor(Math.random() * words.length)]);
      }
      setFancyText(text);
    }, 500);
    return () => clearInterval(interval);
  }, [currentLang]);

  // Check if this is first visit (show splash) or returning user (direct login)
  useEffect(() => {
    const hasVisitedBefore = sessionStorage.getItem('hasVisitedBefore');

    if (!hasVisitedBefore) {
      // First time visit - show splash screen
      // Don't show login until services are ready
      const checkAndShowLogin = () => {
        if (servicesReady) {
          const timer1 = setTimeout(() => setSplashComplete(true), 500);
          const timer2 = setTimeout(() => setShowLogin(true), 1000);

          return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
          };
        } else {
          // Check again after 1 second
          const timer = setTimeout(checkAndShowLogin, 1000);
          return () => clearTimeout(timer);
        }
      };

      const cleanup = checkAndShowLogin();

      // Mark as visited
      sessionStorage.setItem('hasVisitedBefore', 'true');

      return cleanup;
    } else {
      // Returning user - direct login (but still check services)
      if (servicesReady) {
        setSplashComplete(true);
        setShowLogin(true);
      } else {
        // Wait for services to be ready
        const checkServices = setInterval(() => {
          if (servicesReady) {
            clearInterval(checkServices);
            setSplashComplete(true);
            setShowLogin(true);
          }
        }, 500);

        return () => clearInterval(checkServices);
      }
    }
  }, [servicesReady]);

  // Check if services are ready
  useEffect(() => {
    const checkServices = async () => {
      try {
        // Check if backend is ready and fully operational
        const response = await fetch('/api/v2/health');
        if (response.ok) {
          const health = await response.json();
          // Check if all services are ready (database, redis, ai services)
          if (health.status === 'FULLY OPERATIONAL' || health.status === 'OPERATIONAL') {
            console.log('[VitrinLoader] Services are ready:', health.status);
            setServicesReady(true);
          } else {
            console.log('[VitrinLoader] Services not fully ready, retrying...', health.status);
            setTimeout(checkServices, 2000);
          }
        } else {
          setTimeout(checkServices, 2000);
        }
      } catch (error) {
        console.log('[VitrinLoader] Services not ready, retrying...', error);
        // Retry after 2 seconds
        setTimeout(checkServices, 2000);
      }
    };

    // Only check services during splash screen
    if (!showLogin && !servicesReady) {
      checkServices();
    }
  }, [showLogin, servicesReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Button is disabled through loginLoading prop, no need to set state here
    await onLogin(email, password);
  };

  if (!showLogin) {
    // Determine which splash screen to show
    let selectedType = splashType;
    if (splashType === 'random') {
      const types = ['minimal', 'psychedelic', 'cyber', 'cube3d', 'luwi', 'animated', 'large'];
      selectedType = types[Math.floor(Math.random() * types.length)] as any;
    }

    // Ultra-minimal ASCII Splash Screen
    if (selectedType === 'minimal') {
      return (
        <UltraMinimalAscii
          title={title}
          onComplete={() => setShowLogin(true)}
        />
      );
    }

    // Cyber ASCII Splash Screen
    if (selectedType === 'cyber') {
      return (
        <CyberAscii
          title={title}
          description={description}
          onComplete={() => setShowLogin(true)}
        />
      );
    }

    // Gradient Loader Splash Screen
    if (selectedType === 'gradient') {
      return (
        <GradientLoader
          title={title}
          subtitle="Context Engine"
          description="AI Powered Knowledge Management System"
          onComplete={() => setShowLogin(true)}
        />
      );
    }

    // Luwi Logo ASCII Splash Screen
    if (selectedType === 'luwi') {
      return (
        <LuwiLogoAscii
          title={title}
          subtitle="Context Engine"
          description="AI-Powered Knowledge Management System"
          onComplete={() => setShowLogin(true)}
        />
      );
    }

    // Animated Luwi Logo Splash Screen
    if (selectedType === 'animated') {
      return (
        <AnimatedLuwiLogo
          onComplete={() => setShowLogin(true)}
        />
      );
    }

    // Large Luwi Logo Splash Screen
    if (selectedType === 'large') {
      return (
        <LuwiLargeLogoAscii
          onComplete={() => setShowLogin(true)}
        />
      );
    }

    // Cyber ASCII Splash Screen
    if (selectedType === 'cube3d' || selectedType === 'cyber') {
      return (
        <CyberAscii
          title={title}
          description={description}
          onComplete={() => setShowLogin(true)}
        />
      );
    }

    // Psychedelic ASCII Splash Screen
    return (
      <PsychedelicAscii
        title={title}
        onComplete={() => setShowLogin(true)}
      />
    );
  }

  // Clean Login Form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-slate-900 to-blue-950 text-white overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-400/10 to-white/5 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-white/5 to-blue-400/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.1, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-300/5 to-white/5 rounded-full blur-3xl"
        />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md"
        >
          {/* Elegant header */}
          <div className="text-center mt-8 mb-8">
            <div className="inline-block mb-8" style={{ perspective: "300px" }}>
              <motion.div
                animate={{
                  rotateX: [0, 360],
                  rotateY: [0, 360],
                  rotateZ: [0, 180, 360],
                }}
                transition={{
                  duration: 15.6,
                  ease: "linear",
                  repeat: Infinity,
                  times: [0, 0.5, 1]
                }}
                className="relative"
                style={{
                  width: "80px",
                  height: "80px",
                  transformStyle: "preserve-3d"
                }}
              >
                {/* Front face - glowing white-blue gradient */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    transform: "translateZ(40px)",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(147,197,253,0.2) 50%, rgba(59,130,246,0.1) 100%)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    boxShadow: "0 0 30px rgba(147,197,253,0.3), inset 0 0 20px rgba(255,255,255,0.1)"
                  }}
                />
                {/* Right face - blue gradient with glow */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    transform: "rotateY(90deg) translateZ(40px)",
                    background: "linear-gradient(135deg, rgba(96,165,250,0.3) 0%, rgba(59,130,246,0.2) 50%, rgba(147,197,253,0.1) 100%)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(147,197,253,0.2)",
                    boxShadow: "0 0 25px rgba(96,165,250,0.4), inset 0 0 15px rgba(147,197,253,0.1)"
                  }}
                />
                {/* Back face - deeper blue with glow */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    transform: "rotateY(180deg) translateZ(40px)",
                    background: "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(147,197,253,0.15) 50%, rgba(255,255,255,0.1) 100%)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(147,197,253,0.15)",
                    boxShadow: "0 0 20px rgba(59,130,246,0.3), inset 0 0 15px rgba(147,197,253,0.1)"
                  }}
                />
                {/* Left face - cyan-blue gradient with glow */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    transform: "rotateY(-90deg) translateZ(40px)",
                    background: "linear-gradient(135deg, rgba(34,211,238,0.25) 0%, rgba(96,165,250,0.2) 50%, rgba(147,197,253,0.15) 100%)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(147,197,253,0.2)",
                    boxShadow: "0 0 25px rgba(34,211,238,0.3), inset 0 0 15px rgba(255,255,255,0.1)"
                  }}
                />
                {/* Top face - bright white-blue with glow */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    transform: "rotateX(90deg) translateZ(40px)",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(219,234,254,0.25) 50%, rgba(147,197,253,0.15) 100%)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    boxShadow: "0 0 35px rgba(219,234,254,0.4), inset 0 0 20px rgba(255,255,255,0.2)"
                  }}
                />
                {/* Bottom face - deep blue with glow */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    transform: "rotateX(-90deg) translateZ(40px)",
                    background: "linear-gradient(135deg, rgba(37,99,235,0.3) 0%, rgba(59,130,246,0.25) 50%, rgba(96,165,250,0.2) 100%)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(96,165,250,0.3)",
                    boxShadow: "0 0 30px rgba(37,99,235,0.4), inset 0 0 15px rgba(147,197,253,0.1)"
                  }}
                />
              </motion.div>
            </div>

            <h1 className="text-3xl font-light text-gray-100 mb-3">
              {title}
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Login Form */}
          <div className="bg-gray-900/30 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-8">
            {loginError && (
              <Alert className="mb-6 bg-red-900/20 border-red-500/30 text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {loginError}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="email" className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 bg-gray-800/50 border-gray-700/50 text-gray-100 placeholder-gray-600 focus:border-purple-500 focus:ring-purple-500/20 transition-all h-12"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password" className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 pr-12 bg-gray-800/50 border-gray-700/50 text-gray-100 placeholder-gray-600 focus:border-purple-500 focus:ring-purple-500/20 transition-all h-12"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loginLoading}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 text-white transition-all duration-300 rounded-xl font-medium shadow-lg hover:shadow-blue-500/25"
              >
                {loginLoading ? (
                  <div className="flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2"
                    />
                    Signing in...
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>

              <div className="text-center text-xs text-blue-400/60 pt-4">
                <span>Don't have an account? </span>
                <Link href="/auth/register" className="text-blue-300 hover:text-blue-200 transition-colors">
                  Sign up
                </Link>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="text-center mt-12">
            <p className="text-xs text-gray-700">
              © 2024 {title}. Crafted with elegance.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default VitrinLoader;