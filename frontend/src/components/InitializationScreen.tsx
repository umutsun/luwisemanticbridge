'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Brain,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function InitializationScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string>('/');

  useEffect(() => {
    const runInitialization = async () => {
      // Smooth progress animation
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

      // System initialization complete
      setIsComplete(true);
    };

    // Run initialization immediately to prevent getting stuck
    runInitialization();
  }, []);

  // Auto-redirect after completion
  useEffect(() => {
    if (isComplete && redirectPath) {
      const timer = setTimeout(() => {
        router.push(redirectPath);
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [isComplete, redirectPath, router]);

  const handleManualRedirect = () => {
    if (redirectPath) {
      router.push(redirectPath);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 shadow-2xl border-0 bg-card/50 backdrop-blur-sm">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 mx-auto mb-4"
            >
              <Brain className="w-full h-full text-primary" />
            </motion.div>
            <h1 className="text-2xl font-bold mb-2">Alice Semantic Bridge</h1>
            <p className="text-muted-foreground text-sm">
              Sistem başlatılıyor, lütfen bekleyin...
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Yükleniyor</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Complete State */}
          <AnimatePresence mode="wait">
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    Sistem hazır
                  </span>
                </div>

  
                <Button
                  onClick={handleManualRedirect}
                  className="w-full"
                  size="sm"
                >
                  <>Devam Et<ArrowRight className="w-4 h-4 ml-2" /></>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>
    </div>
  );
}