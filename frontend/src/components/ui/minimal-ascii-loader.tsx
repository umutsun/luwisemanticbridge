'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface MinimalAsciiLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'green' | 'cyan' | 'white' | 'gray';
  text?: string;
  dots?: number;
}

const MinimalAsciiLoader: React.FC<MinimalAsciiLoaderProps> = ({
  size = 'md',
  color = 'green',
  text,
  dots = 3
}) => {
  const [frame, setFrame] = useState(0);
  const [mounted, setMounted] = useState(false);

  const sizeMap = {
    sm: { dot: 'w-1 h-1', space: 'w-2', text: 'text-xs' },
    md: { dot: 'w-1.5 h-1.5', space: 'w-3', text: 'text-sm' },
    lg: { dot: 'w-2 h-2', space: 'w-4', text: 'text-base' }
  };

  const colorMap = {
    green: 'bg-green-500',
    cyan: 'bg-cyan-500',
    white: 'bg-white',
    gray: 'bg-gray-500'
  };

  const textColorMap = {
    green: 'text-green-500',
    cyan: 'text-cyan-500',
    white: 'text-white',
    gray: 'text-gray-500'
  };

  const dotColor = colorMap[color];
  const textColor = textColorMap[color];

  // Create dot positions for animation
  const createDotFrames = (dotCount: number) => {
    const frames = [];
    for (let i = 0; i < dotCount; i++) {
      const dots = [];
      for (let j = 0; j < dotCount; j++) {
        dots.push(j === i);
      }
      frames.push(dots);
    }
    return frames;
  };

  const [dotFrames] = useState(createDotFrames(dots));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % dotFrames.length);
    }, 200);

    return () => clearInterval(interval);
  }, [dotFrames.length, mounted]);

  if (!mounted) return null;

  return (
    <div className={`flex flex-col items-center justify-center ${sizeMap[size].text} ${textColor} font-mono`}>
      {/* ASCII-style dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center space-x-0"
      >
        <span className="text-[0]">[</span>
        {dotFrames[frame].map((isActive, index) => (
          <span
            key={index}
            className={`${sizeMap[size].dot} ${
              isActive ? dotColor : 'bg-gray-800'
            } transition-all duration-200`}
            style={{
              margin: '0 1px',
              boxShadow: isActive ? `0 0 4px currentColor` : 'none'
            }}
          />
        ))}
        <span className="text-[0]">]</span>
      </motion.div>

      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.2 }}
          className="mt-3 uppercase tracking-widest"
          style={{ fontSize: '10px' }}
        >
          {text}
        </motion.p>
      )}

      {/* Subtle fade in/out effect */}
      <style jsx>{`
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        div > div:first-child {
          animation: fadeInOut 1.5s infinite;
        }
      `}</style>
    </div>
  );
};

// Ultra minimal version with just text
export const UltraMinimalTextLoader = ({
  text = "LOADING",
  color = 'green'
}: {
  text?: string;
  color?: 'green' | 'cyan' | 'white' | 'gray'
}) => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const colorMap = {
    green: 'text-green-500',
    cyan: 'text-cyan-500',
    white: 'text-white',
    gray: 'text-gray-500'
  };

  return (
    <div className={`${colorMap[color]} font-mono text-xs tracking-widest`}>
      {text}
      <span className="inline-block w-6 text-left">{dots}</span>
    </div>
  );
};

// Bar loader version
export const MinimalBarLoader = ({
  progress,
  color = 'green'
}: {
  progress?: number;
  color?: 'green' | 'cyan' | 'white' | 'gray'
}) => {
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    if (progress !== undefined) {
      const timer = setTimeout(() => setDisplayProgress(progress), 50);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  const colorMap = {
    green: 'bg-green-500',
    cyan: 'bg-cyan-500',
    white: 'bg-white',
    gray: 'bg-gray-500'
  };

  return (
    <div className="w-full max-w-xs">
      <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${colorMap[color]}`}
          initial={{ width: 0 }}
          animate={{ width: `${displayProgress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
      {progress !== undefined && (
        <div className="text-xs text-gray-500 mt-1 font-mono text-center">
          {Math.round(displayProgress)}%
        </div>
      )}
    </div>
  );
};

// Spinner version with ASCII characters
export const AsciiSpinner = ({
  size = 'md',
  color = 'green'
}: {
  size?: 'sm' | 'md' | 'lg';
  color?: 'green' | 'cyan' | 'white' | 'gray'
}) => {
  const [frame, setFrame] = useState(0);
  const [mounted, setMounted] = useState(false);

  const spinnerChars = ['|', '/', '-', '\\'];

  const sizeMap = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const colorMap = {
    green: 'text-green-500',
    cyan: 'text-cyan-500',
    white: 'text-white',
    gray: 'text-gray-500'
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % spinnerChars.length);
    }, 100);

    return () => clearInterval(interval);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className={`${sizeMap[size]} ${colorMap[color]} font-mono`}>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="inline-block"
        style={{
          filter: 'drop-shadow(0 0 2px currentColor)',
          width: '1em',
          textAlign: 'center'
        }}
      >
        {spinnerChars[frame]}
      </motion.span>
    </div>
  );
};

export default MinimalAsciiLoader;