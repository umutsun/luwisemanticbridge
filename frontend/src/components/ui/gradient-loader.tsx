'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GradientLoaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  onComplete: () => void;
}

const GradientLoader: React.FC<GradientLoaderProps> = ({
  title,
  subtitle = "Context Engine",
  description = "AI Powered Knowledge Management System",
  onComplete
}) => {
  const [mounted, setMounted] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);

    // Track mouse position for interactive effects
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Stages of loading
    const stages = [
      { delay: 0, duration: 2000, text: "Initializing..." },
      { delay: 2000, duration: 2000, text: "Loading components..." },
      { delay: 4000, duration: 2000, text: "Establishing connections..." },
      { delay: 6000, duration: 2000, text: "Almost ready..." }
    ];

    // Progress through stages
    stages.forEach((stage, index) => {
      setTimeout(() => {
        setLoadingStage(index + 1);
      }, stage.delay + stage.duration);
    });

    // Complete animation
    setTimeout(() => {
      setShowComplete(true);
    }, 8500);

    setTimeout(() => {
      onComplete();
    }, 9000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };

  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden relative">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0">
        <motion.div
          animate={{
            scale: [1, 1.5, 1],
            rotate: [0, 180, 360],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-0 left-0 w-[600px] h-[600px]"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)',
            filter: 'blur(100px)'
          }}
        />
        <motion.div
          animate={{
            scale: [1.5, 1, 1.5],
            rotate: [360, 180, 0],
            opacity: [0.5, 0.3, 0.5]
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-0 right-0 w-[600px] h-[600px]"
          style={{
            background: 'radial-gradient(circle, rgba(147,197,253,0.3) 0%, transparent 70%)',
            filter: 'blur(100px)'
          }}
        />

        {/* Interactive mouse-follow gradient */}
        <motion.div
          className="absolute w-[400px] h-[400px] pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(59,130,246,0.1) 30%, transparent 70%)',
            filter: 'blur(60px)',
            left: mousePosition.x - 200,
            top: mousePosition.y - 200,
          }}
          transition={{
            type: "tween",
            ease: "easeOut",
            duration: 0.5
          }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center">
        {/* Animated title with gradient */}
        <motion.h1
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-6xl font-bold mb-4 relative"
          style={{
            textShadow: `0 0 ${40 + Math.sin(Date.now() * 0.001) * 10}px rgba(147,197,253,${0.5 + Math.sin(Date.now() * 0.002) * 0.2})`
          }}
        >
          <span
            className="relative cursor-pointer"
            style={{
              background: 'linear-gradient(45deg, #3b82f6, #60a5fa, #93c5fd, #dbeafe, #ffffff, #93c5fd, #60a5fa, #3b82f6)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradientShift 3s ease infinite',
              filter: `drop-shadow(0 0 ${50 + Math.abs(mousePosition.x - window.innerWidth/2) * 0.02}px rgba(147,197,253,0.6))`
            }}
          >
            {title}
            {/* Hover glow effect overlay */}
            <motion.span
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.3) 0%, transparent 50%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                opacity: 0.7
              }}
            />
          </span>
        </motion.h1>

        {/* Animated subtitle */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
          className="text-3xl font-light mb-3 text-blue-300"
          style={{
            textShadow: '0 0 20px rgba(147,197,253,0.5)',
            animation: 'pulse 2s ease-in-out infinite'
          }}
        >
          {subtitle}
        </motion.h2>

        {/* Description with typewriter effect */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
          className="text-xl text-blue-200/80 mb-8"
          style={{
            textShadow: '0 0 10px rgba(147,197,253,0.3)'
          }}
        >
          {description}
        </motion.p>

        {/* Loading progress bar */}
        <div className="w-80 h-1 bg-gray-800 rounded-full overflow-hidden mx-auto mb-6">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #3b82f6, #60a5fa, #93c5fd, #ffffff, #93c5fd, #60a5fa, #3b82f6, transparent)',
              backgroundSize: '200% 100%',
              animation: 'gradientSlide 2s linear infinite'
            }}
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 8, ease: "easeInOut" }}
          />
        </div>

        {/* Loading stages */}
        <AnimatePresence mode="wait">
          <motion.div
            key={loadingStage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center space-x-3"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full"
              style={{
                boxShadow: '0 0 20px rgba(59,130,246,0.8)'
              }}
            />
            <span className="text-blue-400 text-lg font-mono">
              {loadingStage === 0 && "Initializing..."}
              {loadingStage === 1 && "Loading components..."}
              {loadingStage === 2 && "Establishing connections..."}
              {loadingStage === 3 && "Almost ready..."}
              {loadingStage >= 4 && "Ready"}
            </span>
          </motion.div>
        </AnimatePresence>

        {/* Complete animation */}
        {showComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mt-8"
          >
            <div className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full border border-blue-400/30">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-400 font-medium">System Ready</span>
            </div>
          </motion.div>
        )}

        {/* Floating particles */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-blue-400 rounded-full"
            animate={{
              y: [Math.random() * window.innerHeight, -10],
              x: [Math.random() * window.innerWidth, Math.random() * window.innerWidth],
              opacity: [0, 1, 1, 0]
            }}
            transition={{
              duration: 3 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "linear"
            }}
            style={{
              left: `${Math.random() * 100}%`,
              bottom: '-10px',
              filter: 'blur(1px)',
              boxShadow: '0 0 6px rgba(147,197,253,0.8)'
            }}
          />
        ))}
      </div>

      {/* CSS for gradient animations */}
      <style jsx>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes gradientSlide {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default GradientLoader;