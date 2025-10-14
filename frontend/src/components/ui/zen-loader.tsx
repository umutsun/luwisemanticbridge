'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ZenLoaderProps {
  title: string;
  description: string;
  onComplete?: () => void;
}

const ZenLoader: React.FC<ZenLoaderProps> = ({
  title,
  description,
  onComplete
}) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      onComplete?.();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="w-full max-w-md mx-auto text-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="space-y-3"
      >
        {/* Title - Always visible with consistent styling */}
        <motion.h1
          className={`font-bold tracking-tight transition-all duration-1000 ${
            isLoading
              ? 'text-2xl text-gray-400 dark:text-gray-500'
              : 'text-4xl md:text-5xl text-gray-900 dark:text-white'
          }`}
          animate={{
            fontSize: isLoading ? '1.5rem' : '2.5rem',
            color: isLoading ? '#9ca3af' : '#111827'
          }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          {isLoading ? (
            <span className="inline-block">
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                Yükleniyor
              </motion.span>
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                className="ml-1"
              >
                .
              </motion.span>
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 1 }}
              >
                .
              </motion.span>
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 1.5 }}
              >
                .
              </motion.span>
            </span>
          ) : (
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {title}
            </motion.span>
          )}
        </motion.h1>

        {/* Description - Always visible with consistent styling */}
        <motion.p
          className={`font-medium transition-all duration-1000 ${
            isLoading
              ? 'text-sm text-gray-400 dark:text-gray-500'
              : 'text-lg text-gray-600 dark:text-gray-400'
          }`}
          animate={{
            fontSize: isLoading ? '0.875rem' : '1.125rem',
            color: isLoading ? '#9ca3af' : '#4b5563'
          }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          {isLoading ? (
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Lütfen bekleyin...
            </motion.span>
          ) : (
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {description}
            </motion.span>
          )}
        </motion.p>
      </motion.div>
    </div>
  );
};

export default ZenLoader;