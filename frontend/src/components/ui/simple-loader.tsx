'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface SimpleLoaderProps {
  title: string;
  description: string;
  onComplete?: () => void;
  duration?: number;
}

const SimpleLoader: React.FC<SimpleLoaderProps> = ({
  title,
  description,
  onComplete,
  duration = 3000
}) => {
  const [currentText, setCurrentText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [showFinal, setShowFinal] = useState(false);

  const loadingTexts = [
    "Initializing system...",
    "Loading modules...",
    "Establishing connection...",
    "Processing data...",
    "Almost ready...",
    "Finalizing..."
  ];

  useEffect(() => {
    let textIndex = 0;

    const textInterval = setInterval(() => {
      if (textIndex < loadingTexts.length) {
        setCurrentText(loadingTexts[textIndex]);
        textIndex++;
      } else {
        clearInterval(textInterval);
        setTimeout(() => {
          setIsTyping(false);
          setShowFinal(true);
          setTimeout(() => {
            setCurrentText(title);
            setTimeout(() => {
              setCurrentText(description);
              onComplete?.();
            }, 500);
          }, 300);
        }, 500);
      }
    }, 400);

    return () => clearInterval(textInterval);
  }, [title, description, onComplete, duration]);

  return (
    <div className="text-center space-y-2">
      <h2 className={`text-3xl font-bold tracking-tight transition-all duration-500 ${
        showFinal
          ? 'text-gray-900 dark:text-white'
          : 'text-gray-400 dark:text-gray-500'
      }`}>
        <span className={isTyping ? 'inline-block' : ''}>
          {currentText}
          {isTyping && <span className="animate-pulse ml-1">|</span>}
        </span>
      </h2>

      {showFinal && (
        <p className="text-lg text-gray-600 dark:text-gray-400 animate-fade-in">
          {description}
        </p>
      )}
    </div>
  );
};

export default SimpleLoader;