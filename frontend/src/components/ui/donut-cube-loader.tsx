'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface DonutCubeLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  speed?: 'slow' | 'normal' | 'fast';
  color?: 'green' | 'cyan' | 'purple' | 'amber';
  text?: string;
}

const DonutCubeLoader: React.FC<DonutCubeLoaderProps> = ({
  size = 'md',
  speed = 'normal',
  color = 'green',
  text
}) => {
  const [frame, setFrame] = useState(0);
  const [mounted, setMounted] = useState(false);

  const sizeMap = {
    sm: { container: 'w-16 h-16', text: 'text-xs' },
    md: { container: 'w-24 h-24', text: 'text-sm' },
    lg: { container: 'w-32 h-32', text: 'text-base' }
  };

  const speedMap = {
    slow: 200,
    normal: 100,
    fast: 50
  };

  const colorMap = {
    green: 'text-green-500',
    cyan: 'text-cyan-500',
    purple: 'text-purple-500',
    amber: 'text-amber-500'
  };

  const colorClass = colorMap[color];

  // Donut cube frames - rotating cube with donut-like hole
  const donutCubeFrames = [
    // Front view - square donut
    [
      "████████████",
      "██░░░░░░░░██",
      "██░░████░░██",
      "██░░████░░██",
      "██░░████░░██",
      "██░░░░░░░░██",
      "████████████"
    ],
    // Slight rotation
    [
      "  ████████  ",
      " ██░░░░░░██ ",
      "██░░████░░██",
      "██░░████░░██",
      "██░░████░░██",
      " ██░░░░░░██ ",
      "  ████████  "
    ],
    // Side view - showing depth
    [
      "   ████   ",
      "  ██░░██  ",
      " ██░██░██ ",
      "██░████░██",
      "██░████░██",
      " ██░██░██ ",
      "  ██░░██  ",
      "   ████   "
    ],
    // Different angle
    [
      "    ██    ",
      "   ████   ",
      "  ██░░██  ",
      " ██░██░██ ",
      "██░████░██",
      " ██░██░██ ",
      "  ██░░██  ",
      "   ████   ",
      "    ██    "
    ],
    // Rotated
    [
      "   █████   ",
      "  ██░░██  ",
      " ██░██░██ ",
      "██░░░░░░██",
      "██░░░░░░██",
      " ██░██░██ ",
      "  ██░░██  ",
      "   █████   "
    ],
    // Another rotation
    [
      "  ███████  ",
      " ██░░░░░██ ",
      "██░███░███",
      "██░███░███",
      "██░███░███",
      " ██░░░░░██ ",
      "  ███████  "
    ],
    // Complex rotation
    [
      " ██████████",
      "██░░░░░░░░█",
      "██░██████░█",
      "██░██████░█",
      "██░██████░█",
      "██░░░░░░░░█",
      " ██████████"
    ],
    // Final rotation back to start
    [
      "  ██████  ",
      " ██░░░░██ ",
      "██░████░██",
      "██░████░██",
      "██░████░██",
      " ██░░░░██ ",
      "  ██████  "
    ]
  ];

  // Bonus frames for more complex animation
  const complexFrames = [
    // Pulsing donut
    [
      "████████████",
      "██░░░░░░░░██",
      "██░░░░░░░░██",
      "██░░░░░░░░██",
      "██░░░░░░░░██",
      "██░░░░░░░░██",
      "████████████"
    ],
    // Shrinking
    [
      "████████████",
      "██░░░░░░░░██",
      "██░░████░░██",
      "██░░████░░██",
      "██░░████░░██",
      "██░░░░░░░░██",
      "████████████"
    ],
    // Expanding
    [
      "  ████████  ",
      "  ██░░░░██  ",
      "  ██░██░██  ",
      "  ██░██░██  ",
      "  ██░██░██  ",
      "  ██░░░░██  ",
      "  ████████  "
    ]
  ];

  const [allFrames] = useState([...donutCubeFrames, ...complexFrames]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % allFrames.length);
    }, speedMap[speed]);

    return () => clearInterval(interval);
  }, [allFrames.length, speed, mounted]);

  if (!mounted) return null;

  return (
    <div className={`flex flex-col items-center justify-center ${sizeMap[size].text} ${colorClass} font-mono`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`${sizeMap[size].container} flex items-center justify-center`}
        style={{
          filter: 'drop-shadow(0 0 8px currentColor)'
        }}
      >
        <pre className="leading-none" style={{ fontSize: size === 'sm' ? '8px' : size === 'md' ? '10px' : '12px' }}>
          {allFrames[frame].map((line, i) => (
            <div key={i} className="text-center">
              {line}
            </div>
          ))}
        </pre>
      </motion.div>

      {text && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-3 opacity-80"
        >
          {text}
        </motion.p>
      )}

      {/* Glow effect */}
      <style jsx>{`
        @keyframes glow {
          0%, 100% {
            filter: drop-shadow(0 0 8px currentColor) drop-shadow(0 0 12px currentColor);
          }
          50% {
            filter: drop-shadow(0 0 12px currentColor) drop-shadow(0 0 20px currentColor);
          }
        }
        div > div:first-child {
          animation: glow 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default DonutCubeLoader;