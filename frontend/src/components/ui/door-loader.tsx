'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

// Multi-language Lorem Ipsum words
const loremByLanguage = {
  tr: [
    "metin", "dizgi", "yazı", "sözcük", "cümle", "paragraf", "anlam", "içerik",
    "ifade", "bahset", "anlat", "açıkla", "göster", "belirt", "vurgula", "işaret",
    "dil", "lügat", "sözlük", "terim", "ifade", "deyiş", "tabir", "söz", "laf",
    "sayfa", "satır", "karakter", "harf", "sembol", "imge", "görsel", "çizim"
  ],
  en: [
    "text", "words", "content", "meaning", "story", "write", "create", "express",
    "show", "tell", "speak", "share", "message", "letter", "page", "line",
    "character", "symbol", "sign", "mark", "point", "form", "shape", "design"
  ],
  de: [
    "text", "worte", "inhalt", "bedeutung", "geschichte", "schreiben", "erschaffen",
    "ausdruck", "zeigen", "erzählen", "sprechen", "teilen", "nachricht", "brief"
  ],
  fr: [
    "texte", "mots", "contenu", "sens", "histoire", "écrire", "créer", "expression",
    "montrer", "raconter", "parler", "partager", "message", "lettre", "page"
  ],
  es: [
    "texto", "palabras", "contenido", "significado", "historia", "escribir", "crear",
    "expresión", "mostrar", "contar", "hablar", "compartir", "mensaje", "carta"
  ],
  it: [
    "testo", "parole", "contenuto", "significato", "storia", "scrivere", "creare",
    "espressione", "mostrare", "raccontare", "parlare", "condividere", "messaggio"
  ],
  ja: [
    "テキスト", "言葉", "内容", "意味", "物語", "書く", "作成", "表現",
    "見せる", "語る", "話す", "共有", "メッセージ", "手紙"
  ],
  zh: [
    "文本", "词语", "内容", "含义", "故事", "写作", "创造", "表达",
    "展示", "讲述", "说话", "分享", "消息", "信件"
  ]
};

// ASCII Art Door Knocker
const doorKnocker = [
  "      ╔════════════════════╗      ",
  "      ║    ◉◉◉◉◉◉◉◉◉    ║      ",
  "      ║  ◉◉◉◉◉◉◉◉◉◉◉  ║      ",
  "      ║◉◉◉◉◉◉◉◉◉◉◉◉◉◉║      ",
  "      ║◉◉◉◉◉◉◉◉◉◉◉◉◉◉║      ",
  "      ║  ◉◉◉◉◉◉◉◉◉◉◉  ║      ",
  "      ║    ◉◉◉◉◉◉◉◉◉    ║      ",
  "      ╚════════════════════╝      ",
  "             ││││││             ",
  "             └┴┴┴┴┴┘             "
];

const doorFrame = [
  "╔════════════════════════════════╗",
  "║                              ║",
  "║    ◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆    ║",
  "║  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆  ║",
  "║◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆║",
  "║◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆║",
  "║  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆  ║",
  "║    ◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆    ║",
  "║                              ║",
  "╚════════════════════════════════╝"
];

interface DoorLoaderProps {
  title: string;
  description: string;
  onLogin: (email: string, password: string) => Promise<any>;
  loginError: string | null;
  loginLoading: boolean;
}

const DoorLoader: React.FC<DoorLoaderProps> = ({
  title,
  description,
  onLogin,
  loginError,
  loginLoading
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingComplete, setLoadingComplete] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [currentLang, setCurrentLang] = useState<'tr' | 'en' | 'de' | 'fr' | 'es' | 'it' | 'ja' | 'zh'>('en');
  const [matrixText, setMatrixText] = useState<string[][]>([]);
  const [doorOpen, setDoorOpen] = useState(false);

  // Detect user's language/country
  useEffect(() => {
    const lang = navigator.language.split('-')[0] as keyof typeof loremByLanguage;
    if (loremByLanguage[lang]) {
      setCurrentLang(lang);
    }
  }, []);

  // Generate matrix effect with localized text
  useEffect(() => {
    const generateMatrix = () => {
      const lines = [];
      const words = loremByLanguage[currentLang];

      for (let i = 0; i < 10; i++) {
        const line = [];
        for (let j = 0; j < 40; j++) {
          if (Math.random() > 0.6) {
            const word = words[Math.floor(Math.random() * words.length)];
            const chars = word.split('');
            line.push(chars[Math.floor(Math.random() * chars.length)]);
          } else {
            line.push(' ');
          }
        }
        lines.push(line);
      }
      return lines;
    };

    const interval = setInterval(() => {
      setMatrixText(generateMatrix());
    }, 80);

    return () => clearInterval(interval);
  }, [currentLang]);

  // Loading sequence
  useEffect(() => {
    const timer1 = setTimeout(() => setLoadingComplete(true), 2500);
    const timer2 = setTimeout(() => setDoorOpen(true), 3000);
    const timer3 = setTimeout(() => setShowLogin(true), 3500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  // Render matrix background
  const renderMatrix = () => {
    return (
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <pre className="text-xs leading-none font-mono">
          {matrixText.map((line, i) => (
            <div key={i} className="text-gray-400">
              {line.join('')}
            </div>
          ))}
        </pre>
      </div>
    );
  };

  if (!showLogin) {
    // Splash screen with ASCII art
    return (
      <div className="min-h-screen bg-black text-gray-300 font-mono overflow-hidden relative flex items-center justify-center">
        {renderMatrix()}

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1 }}
          className="relative z-10 text-center"
        >
          {/* Door Frame */}
          <motion.pre
            initial={{ opacity: 0 }}
            animate={{ opacity: loadingComplete ? 1 : 0.3 }}
            transition={{ duration: 0.5 }}
            className="text-gray-400 mb-4"
          >
            {doorFrame.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={doorOpen && i >= 3 && i <= 6 ? 'text-gray-600' : ''}
              >
                {line}
              </motion.div>
            ))}
          </motion.pre>

          {/* Door Knocker */}
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: loadingComplete ? [0, -5, 0] : 0 }}
            transition={{
              duration: 1,
              repeat: loadingComplete ? Infinity : 0,
              ease: "easeInOut"
            }}
            className="mb-8"
          >
            <pre className="text-yellow-500">
              {doorKnocker.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </pre>
          </motion.div>

          {/* Loading Text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-sm text-gray-500 space-y-1"
          >
            <div>Initializing system...</div>
            <div className="text-xs">Language: {currentLang.toUpperCase()}</div>
          </motion.div>

          {/* Door opening effect */}
          {doorOpen && (
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute inset-0 bg-black z-20"
              style={{ transformOrigin: 'center' }}
            />
          )}
        </motion.div>
      </div>
    );
  }

  // Login form after splash
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-gray-100 overflow-hidden relative">
      {/* Subtle matrix background */}
      <div className="absolute inset-0 opacity-5">
        {renderMatrix()}
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md"
        >
          {/* Minimal door decoration */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ rotateY: 0 }}
              animate={{ rotateY: 360 }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="inline-block"
            >
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-2 border-gray-700 rounded-full"></div>
                <div className="absolute inset-2 border border-gray-600 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                </div>
              </div>
            </motion.div>

            <h1 className="text-2xl font-light text-gray-200 mb-2 tracking-wider">
              {title}
            </h1>
            <p className="text-sm text-gray-500">
              {description}
            </p>
          </div>

          {/* Login Form */}
          <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6">
            {loginError && (
              <Alert className="mb-4 bg-red-900/20 border-red-500/30 text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {loginError}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-xs text-gray-400 uppercase tracking-wider">
                  Email
                </Label>
                <div className="relative mt-2">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 text-gray-100 placeholder-gray-600 focus:border-gray-500 focus:ring-0 transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password" className="text-xs text-gray-400 uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-gray-900/50 border-gray-700 text-gray-100 placeholder-gray-600 focus:border-gray-500 focus:ring-0 transition-all"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-400 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 transition-all duration-200"
              >
                {loginLoading ? (
                  <div className="flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full mr-2"
                    />
                    Please wait...
                  </div>
                ) : (
                  'Enter'
                )}
              </Button>

              <div className="text-center text-xs text-gray-500 pt-4">
                <span>Don't have an account? </span>
                <Link href="/auth/register" className="text-gray-400 hover:text-gray-300 transition-colors">
                  Sign up
                </Link>
              </div>
            </form>
          </div>

          {/* Minimal footer */}
          <div className="text-center mt-8">
            <p className="text-xs text-gray-600">
              © 2024 {title}. All rights reserved.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DoorLoader;