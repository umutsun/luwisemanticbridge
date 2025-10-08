'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import config from '@/config/api.config';

export default function DatabaseConnectionError() {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState(false);

  const checkConnectionAndRedirect = async () => {
    setIsRetrying(true);

    // Simulate progress animation
    const steps = [
      { delay: 0, progress: 20 },
      { delay: 400, progress: 40 },
      { delay: 300, progress: 60 },
      { delay: 300, progress: 80 },
      { delay: 400, progress: 100 }
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, step.delay));
      setProgress(step.progress);
    }

    try {
      const response = await fetch(config.getApiUrl('/api/v2/health/system'));
      if (response.ok) {
        // Connection successful - redirect to dashboard
        setRedirectPath('/dashboard');
        setIsComplete(true);
      } else {
        // Connection failed - retry
        setProgress(0);
        setIsRetrying(false);
      }
    } catch (error) {
      // Connection failed - retry
      setProgress(0);
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    // Start automatic retry
    const timer = setTimeout(() => {
      checkConnectionAndRedirect();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleManualRetry = () => {
    setProgress(0);
    setIsComplete(false);
    checkConnectionAndRedirect();
  };

  // Auto-redirect after completion
  useEffect(() => {
    if (isComplete && redirectPath) {
      const timer = setTimeout(() => {
        window.location.href = redirectPath;
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, redirectPath]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
      <Card className="w-full max-w-md mx-auto border-0 shadow-none bg-transparent">
        <CardContent className="p-8">
          <AnimatePresence mode="wait">
            {!isComplete ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center space-y-6"
              >
                {/* Animated Brain Logo */}
                <div className="relative">
                  <motion.div
                    animate={{
                      rotate: 360,
                      scale: [1, 1.1, 1]
                    }}
                    transition={{
                      rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                      scale: { duration: 1, repeat: Infinity, ease: "easeInOut" }
                    }}
                    className="w-16 h-16 mx-auto"
                  >
                    <Brain className="w-full h-full text-primary" />
                  </motion.div>

                  {/* Pulsing circles */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/20 animate-ping" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 animate-ping animation-delay-1000" />
                  </div>
                </div>

                {/* Loading Text */}
                <div className="space-y-2">
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl font-semibold"
                  >
                    {isRetrying ? 'Sistem kontrol ediliyor...' : 'Sistem başlatılıyor...'}
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm text-muted-foreground"
                  >
                    Alice Semantic Bridge hazırlanıyor
                  </motion.p>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Sistem kontrolü</span>
                    <span>{progress}%</span>
                  </div>
                </div>

                {/* Manual Retry Button */}
                <div className="pt-4">
                  <Button
                    onClick={handleManualRetry}
                    disabled={isRetrying}
                    variant="outline"
                    className="w-full"
                    size="sm"
                  >
                    {isRetrying ? (
                      <>Kontrol ediliyor...</>
                    ) : (
                      <>Şimdi Dene<ArrowRight className="w-4 h-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center space-y-6"
              >
                {/* Success Animation */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
                >
                  <Brain className="w-8 h-8 text-primary" />
                </motion.div>

                <div className="space-y-2">
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl font-semibold"
                  >
                    Sistem hazır
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-sm text-muted-foreground"
                  >
                    Dashboard'a yönlendiriliyorsunuz
                  </motion.p>
                </div>

                <Button
                  onClick={() => window.location.href = redirectPath}
                  className="w-full"
                  size="sm"
                >
                  Dashboard'a Git<ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}