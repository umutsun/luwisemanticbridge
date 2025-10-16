'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

// ASCII Art patterns
const asciiPatterns = {
  logo: [
    "███████╗███████╗ ██████╗██████╗ ███████╗████████╗",
    "██╔════╝██╔════╝██╔════╝██╔══██╗██╔════╝╚══██╔══╝",
    "███████╗█████╗  ██║     ██████╔╝█████╗     ██║   ",
    "╚════██║██╔══╝  ██║     ██╔══██╗██╔══╝     ██║   ",
    "███████║███████╗╚██████╗██║  ██║███████╗   ██║   ",
    "╚══════╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝   "
  ],
  cube: [
    "    ████████  ",
    "   ██░░░░░░██ ",
    "  ██░░░░░░░░░██",
    " ██░░░░░░░░░░░██",
    "██░░░░░░░░░░░░░██",
    "██░░░░░░░░░░░░░██",
    " ██░░░░░░░░░░░██",
    "  ██░░░░░░░░░██ ",
    "   ██░░░░░░██  ",
    "    ████████   "
  ],
  matrix: [
    "⢀⡴⠑⡄⠀⠀⠀⠀⠀⠀⠀⣀⣀⣠⣤⣤⣤⣤⣤⣤⣤⣤⣤⣀⡀",
    "⠸⡇⠀⠈⠃⠀⠀⠀⠀⠀⢀⣴⣿⡿⠛⠉⠙⠛⠛⠛⠛⠻⢿⣿⣦",
    "⠀⠀⠀⠀⠀⠀⢀⣠⣤⣶⣾⣿⣟⠉⠀⠰⠒⠠⠤⠴⠒⠚⠋⠉⠙",
    "⠀⠀⣀⣀⣤⣶⣾⣿⡿⠟⠁⠀⠀⠀⠀⣀⣤⣀⠀⠀⠀⠀⠀",
    "⢀⣴⣿⣿⣿⣿⣿⠋⠀⠀⠀⠀⠀⠰⠾⠿⠿⠿⠷⠆⠀⠀⠀",
    "⣾⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠐⣶⣶⣶⣶⠦⠀⠀⠀",
    "⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⣶⣾⣿⣿⣷⠀⠀⠀",
    "⠿⠿⠿⠿⠿⠿⠿⠿⠀⠀⠀⠀⠀⠀⠈⠉⠉⠉⠉⠀⠀⠀⠀"
  ]
};

const loremWords = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et",
  "dolore", "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis",
  "nostrud", "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex",
  "ea", "commodo", "consequat", "duis", "aute", "irure", "in", "reprehenderit",
  "voluptate", "velit", "esse", "cillum", "fugiat", "nulla", "pariatur"
];

interface AsciiLoaderProps {
  title: string;
  description: string;
  onLogin: (email: string, password: string) => Promise<any>;
  loginError: string | null;
  loginLoading: boolean;
}

const AsciiLoader: React.FC<AsciiLoaderProps> = ({
  title,
  description,
  onLogin,
  loginError,
  loginLoading
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [matrixText, setMatrixText] = useState<string[]>([]);
  const [currentTitle, setCurrentTitle] = useState('');
  const [showFinal, setShowFinal] = useState(false);
  const [asciiArt, setAsciiArt] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Generate matrix rain effect
  useEffect(() => {
    const generateMatrix = () => {
      const lines = [];
      for (let i = 0; i < 8; i++) {
        let line = '';
        for (let j = 0; j < 60; j++) {
          if (Math.random() > 0.7) {
            line += loremWords[Math.floor(Math.random() * loremWords.length)].substring(0, Math.floor(Math.random() * 3) + 1) + ' ';
          } else {
            line += '  ';
          }
        }
        lines.push(line);
      }
      return lines;
    };

    const interval = setInterval(() => {
      setMatrixText(generateMatrix());
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Typewriter effect for title
  useEffect(() => {
    let targetTitle = '';

    switch(loadingPhase) {
      case 0:
        targetTitle = 'INITIALIZING';
        setAsciiArt(asciiPatterns.cube);
        break;
      case 1:
        targetTitle = 'CONNECTING';
        setAsciiArt(asciiPatterns.logo);
        break;
      case 2:
        targetTitle = 'LOADING';
        setAsciiArt(asciiPatterns.matrix);
        break;
      case 3:
        targetTitle = title.toUpperCase();
        setAsciiArt(asciiPatterns.logo);
        break;
      default:
        targetTitle = title.toUpperCase();
    }

    let currentIndex = 0;
    const typewriterInterval = setInterval(() => {
      if (currentIndex <= targetTitle.length) {
        setCurrentTitle(targetTitle.substring(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typewriterInterval);
        if (loadingPhase < 3) {
          setTimeout(() => setLoadingPhase(prev => prev + 1), 500);
        } else {
          setTimeout(() => setShowFinal(true), 500);
        }
      }
    }, 50);

    return () => clearInterval(typewriterInterval);
  }, [loadingPhase, title]);

  // Fast scrolling text effect
  const [scrollingText, setScrollingText] = useState('');
  useEffect(() => {
    let position = 0;
    const text = loremWords.join(' ').repeat(10);

    const scrollInterval = setInterval(() => {
      setScrollingText(text.substring(position, position + 100));
      position = (position + 2) % text.length;
    }, 50);

    return () => clearInterval(scrollInterval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono overflow-hidden relative">
      {/* Matrix Background */}
      <div className="absolute inset-0 opacity-20">
        <pre className="text-xs leading-tight">
          {matrixText.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </pre>
      </div>

      {/* Scrolling Text */}
      <div className="absolute top-0 left-0 right-0 h-6 overflow-hidden bg-black/50">
        <div className="whitespace-nowrap animate-pulse text-green-500 text-xs">
          {scrollingText}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center">
        <div className="max-w-6xl w-full px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* Left Side - ASCII Art */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center"
            >
              <div className="mb-8">
                <pre className="text-green-400 text-xs leading-tight overflow-hidden">
                  {asciiArt.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      {line}
                    </motion.div>
                  ))}
                </pre>
              </div>

              {/* Animated Title */}
              <div className="text-center mb-4">
                <h1 className="text-2xl md:text-4xl font-bold text-green-400 mb-2">
                  {currentTitle}
                  <span className="animate-pulse">_</span>
                </h1>
                {showFinal && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm text-green-300"
                  >
                    {description}
                  </motion.p>
                )}
              </div>

              {/* Status Lines */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center space-x-2">
                  <span className={loadingPhase > 0 ? 'text-green-400' : 'text-green-700'}>
                    [{loadingPhase > 0 ? '✓' : '○'}] SYSTEM INITIALIZATION
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={loadingPhase > 1 ? 'text-green-400' : 'text-green-700'}>
                    [{loadingPhase > 1 ? '✓' : '○'}] ESTABLISHING CONNECTION
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={loadingPhase > 2 ? 'text-green-400' : 'text-green-700'}>
                    [{loadingPhase > 2 ? '✓' : '○'}] LOADING RESOURCES
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={showFinal ? 'text-green-400' : 'text-green-700'}>
                    [{showFinal ? '✓' : '○'}] SYSTEM READY
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-6 w-full bg-gray-900 h-1 rounded">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((loadingPhase + (showFinal ? 1 : 0)) / 4) * 100}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-green-400 rounded"
                />
              </div>
            </motion.div>

            {/* Right Side - Login Form */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: showFinal ? 1 : 0.3, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col justify-center"
            >
              <div className="border border-green-400/30 rounded p-6 bg-black/50 backdrop-blur-sm">
                <h2 className="text-xl mb-6 text-green-400 text-center">
                  > AUTHENTICATE
                </h2>

                {loginError && (
                  <Alert className="mb-4 bg-red-900/20 border-red-500/30 text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm font-mono">
                      ERROR: {loginError}
                    </AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label className="text-xs text-green-400 font-mono">
                      EMAIL_INPUT:
                    </Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-green-600" />
                      <Input
                        type="email"
                        placeholder="user@system.dev"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 bg-black/50 border-green-400/30 text-green-400 placeholder-green-700 focus:border-green-400 font-mono text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-green-400 font-mono">
                      PASSWORD_INPUT:
                    </Label>
                    <div className="relative mt-1">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-green-600" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 bg-black/50 border-green-400/30 text-green-400 placeholder-green-700 focus:border-green-400 font-mono text-sm"
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-600 hover:text-green-400 transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loginLoading || !showFinal}
                    className="w-full bg-green-400/10 hover:bg-green-400/20 text-green-400 border border-green-400/30 transition-all duration-200 font-mono text-sm"
                  >
                    {loginLoading ? (
                      <div className="flex items-center justify-center">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full mr-2"
                        />
                        AUTHENTICATING...
                      </div>
                    ) : (
                      '> SUBMIT'
                    )}
                  </Button>

                  <div className="text-center text-xs text-green-600 pt-2">
                    <span>NO ACCOUNT? </span>
                    <Link href="/auth/register" className="text-green-400 hover:underline">
                      [REGISTER]
                    </Link>
                  </div>
                </form>
              </div>

              {/* Terminal Cursor */}
              <div className="mt-4 text-center">
                <span className="text-green-400 animate-pulse">█</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Bottom Scrolling Text */}
      <div className="absolute bottom-0 left-0 right-0 h-6 overflow-hidden bg-black/50">
        <div className="whitespace-nowrap text-green-500 text-xs">
          {scrollingText}
        </div>
      </div>
    </div>
  );
};

export default AsciiLoader;