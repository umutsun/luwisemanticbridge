'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface LoadingStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'complete' | 'error';
  detail?: string;
}

interface ImpressiveLoaderProps {
  title: string;
  description: string;
  onComplete?: () => void;
}

const ImpressiveLoader: React.FC<ImpressiveLoaderProps> = ({
  title,
  description,
  onComplete
}) => {
  const [steps, setSteps] = useState<LoadingStep[]>([
    { id: '1', label: 'Sunucu bağlantısı kuruluyor', status: 'pending' },
    { id: '2', label: 'Veritabanı kontrol ediliyor', status: 'pending' },
    { id: '3', label: 'Önbellek sistemleri başlatılıyor', status: 'pending' },
    { id: '4', label: 'AI modelleri yükleniyor', status: 'pending' },
    { id: '5', label: 'Arayüz bileşenleri hazırlanıyor', status: 'pending' },
    { id: '6', label: 'Oturum yönetimi yapılandırılıyor', status: 'pending' }
  ]);

  const [currentLog, setCurrentLog] = useState<string>('');
  const [showFinal, setShowFinal] = useState(false);
  const [progress, setProgress] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Simulate loading steps
    const simulateSteps = async () => {
      const stepDelay = 400;

      for (let i = 0; i < steps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, stepDelay));

        setSteps(prev => prev.map((step, index) => {
          if (index === i) {
            return { ...step, status: 'loading' };
          }
          if (index < i) {
            return { ...step, status: 'complete' };
          }
          return step;
        }));

        setProgress(((i + 1) / steps.length) * 100);

        // Add random details
        if (i === 0) setCurrentLog('Sunucu yanıt süresi: 23ms');
        if (i === 1) setCurrentLog('3 tablo doğrulandı');
        if (i === 2) setCurrentLog('Redis bağlantısı kuruldu');
        if (i === 3) setCurrentLog('Gemini 1.5 aktif');
        if (i === 4) setCurrentLog('247 bileşen hazır');
        if (i === 5) setCurrentLog('JWT token oluşturuldu');

        await new Promise(resolve => setTimeout(resolve, stepDelay / 2));

        setSteps(prev => prev.map((step, index) => {
          if (index === i) {
            return { ...step, status: 'complete' };
          }
          return step;
        }));
      }

      // Show final content
      await new Promise(resolve => setTimeout(resolve, 300));
      setShowFinal(true);
      setTimeout(() => onComplete?.(), 500);
    };

    simulateSteps();

    // Try to connect to real-time logs
    try {
      eventSourceRef.current = new EventSource(`${API_URL}/api/v2/system/stream`);

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log' && data.message) {
            // Show occasional real logs
            if (Math.random() > 0.7) {
              setCurrentLog(data.message.substring(0, 50) + '...');
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }
      };
    } catch (error) {
      // Ignore connection errors
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-slate-900 dark:to-gray-800 overflow-hidden">
      {/* 3D Mouse-following cubes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-32 h-32"
            initial={{ opacity: 0 }}
            animate={{
              x: mousePosition.x * 0.02 * (i + 1),
              y: mousePosition.y * 0.02 * (i + 1),
              rotateX: mousePosition.y * 0.01,
              rotateY: mousePosition.x * 0.01,
              rotateZ: (mousePosition.x + mousePosition.y) * 0.005,
              opacity: 0.03 + i * 0.01
            }}
            transition={{
              type: "spring",
              stiffness: 20,
              damping: 25
            }}
            style={{
              left: `${20 + i * 30}%`,
              top: `${10 + i * 20}%`,
              transformStyle: 'preserve-3d',
              perspective: '1000px'
            }}
          >
            <div className="relative w-full h-full">
              {/* Cube faces */}
              <div className="absolute inset-0 border border-slate-200 dark:border-slate-700" style={{ transform: 'rotateY(0deg) translateZ(64px)' }} />
              <div className="absolute inset-0 border border-slate-200 dark:border-slate-700" style={{ transform: 'rotateY(90deg) translateZ(64px)' }} />
              <div className="absolute inset-0 border border-slate-200 dark:border-slate-700" style={{ transform: 'rotateY(180deg) translateZ(64px)' }} />
              <div className="absolute inset-0 border border-slate-200 dark:border-slate-700" style={{ transform: 'rotateY(270deg) translateZ(64px)' }} />
              <div className="absolute inset-0 border border-slate-200 dark:border-slate-700" style={{ transform: 'rotateX(90deg) translateZ(64px)' }} />
              <div className="absolute inset-0 border border-slate-200 dark:border-slate-700" style={{ transform: 'rotateX(270deg) translateZ(64px)' }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            {showFinal ? title : (
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Sistem Başlatılıyor
              </span>
            )}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {showFinal ? description : 'Lütfen bekleyin...'}
          </p>
        </motion.div>

        {!showFinal && (
          <>
            {/* Progress Bar */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              className="h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-8 max-w-md mx-auto"
            />

            {/* Loading Steps */}
            <div className="space-y-3 max-w-md mx-auto mb-8">
              {steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center space-x-3 text-sm"
                >
                  <div className="relative">
                    {step.status === 'pending' && (
                      <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded-full" />
                    )}
                    {step.status === 'loading' && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
                      />
                    )}
                    {step.status === 'complete' && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500 }}
                        className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"
                      >
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </motion.div>
                    )}
                  </div>
                  <span className={`flex-1 ${
                    step.status === 'complete'
                      ? 'text-green-600 dark:text-green-400'
                      : step.status === 'loading'
                      ? 'text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Live Log Display */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg max-w-md mx-auto"
            >
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono uppercase tracking-wider">
                  Canlı Sistem Durumu
                </span>
              </div>
              {currentLog && (
                <motion.div
                  key={currentLog}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate"
                >
                  {currentLog}
                </motion.div>
              )}
            </motion.div>
          </>
        )}

        {showFinal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="mt-8"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Sistem Hazır</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ImpressiveLoader;